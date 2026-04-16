use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::{ser::SerializeStruct, Deserialize, Serialize};
use tauri::{ipc::Channel, State};
use tokio_util::sync::CancellationToken;

/// Default configuration constants as the application currently lacks a Settings UI.
pub const DEFAULT_API_ENDPOINT: &str = "http://localhost:20128/v1";
pub const DEFAULT_MODEL_NAME: &str = "qw/qwen3-coder-plus";
pub const DEFAULT_API_KEY: &str = "sk-3d2017a487150c52-29a4c5-8ed3c1b5";
const API_ENDPOINT_ENV_VAR: &str = "THUKI_API_ENDPOINT";
const API_KEY_ENV_VAR: &str = "THUKI_API_KEY";
const DEFAULT_SYSTEM_PROMPT: &str = include_str!("../prompts/system_prompt.txt");

/// Classifies the kind of error returned from the Ollama backend.
/// Used by the frontend to pick accent bar color and display copy.
#[derive(Clone, Serialize, PartialEq, Debug)]
#[serde(rename_all = "PascalCase")]
pub enum OllamaErrorKind {
    /// Ollama process is not running (connection refused / timeout).
    NotRunning,
    /// The requested model has not been pulled yet (HTTP 404).
    ModelNotFound,
    /// Any other unexpected error.
    Other,
}

/// Structured error emitted over the streaming channel.
/// Rust owns all user-facing copy; the frontend only uses `kind` for styling.
#[derive(Clone, Serialize, Debug)]
pub struct OllamaError {
    pub kind: OllamaErrorKind,
    /// Final user-facing string. First line is the title, remainder is the subtitle.
    pub message: String,
}

/// Maps an HTTP status code to a user-friendly `OllamaError`.
pub fn classify_http_error(status: u16, model_name: &str) -> OllamaError {
    match status {
        404 => OllamaError {
            kind: OllamaErrorKind::ModelNotFound,
            message: format!(
                "Model not found\nThe selected model \"{}\" is unavailable.",
                model_name
            ),
        },
        _ => OllamaError {
            kind: OllamaErrorKind::Other,
            message: format!("Something went wrong\nHTTP {status}"),
        },
    }
}

/// Maps a reqwest connection/transport error to a user-friendly `OllamaError`.
pub fn classify_stream_error(e: &reqwest::Error) -> OllamaError {
    if e.is_connect() || e.is_timeout() {
        OllamaError {
            kind: OllamaErrorKind::NotRunning,
            message: "AI service isn't reachable\nCheck your API endpoint and try again."
                .to_string(),
        }
    } else {
        OllamaError {
            kind: OllamaErrorKind::Other,
            message: "Something went wrong\nCould not reach the AI service.".to_string(),
        }
    }
}

/// Payload emitted back to the frontend per token chunk.
#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum StreamChunk {
    /// A single token chunk string.
    Token(String),
    /// A single thinking/reasoning token chunk string.
    ThinkingToken(String),
    /// Indicates the stream has fully completed.
    Done,
    /// The user explicitly cancelled generation.
    Cancelled,
    /// A structured, user-friendly error occurred during processing.
    Error(OllamaError),
}

/// A single message in the OpenAI `/chat/completions` conversation format.
///
/// The optional `images` field carries base64-encoded image data for
/// multimodal models. When absent or empty, the message is text-only.
#[derive(Clone, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub images: Option<Vec<String>>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum SerializedMessageContent<'a> {
    Text(&'a str),
    Parts(Vec<SerializedContentPart<'a>>),
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum SerializedContentPart<'a> {
    #[serde(rename = "text")]
    Text { text: &'a str },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: SerializedImageUrl<'a> },
}

#[derive(Serialize)]
struct SerializedImageUrl<'a> {
    url: &'a str,
}

impl Serialize for ChatMessage {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let content = if let Some(images) = self.images.as_ref().filter(|imgs| !imgs.is_empty()) {
            let mut parts = Vec::with_capacity(images.len() + 1);
            if !self.content.trim().is_empty() {
                parts.push(SerializedContentPart::Text {
                    text: &self.content,
                });
            }
            for url in images {
                parts.push(SerializedContentPart::ImageUrl {
                    image_url: SerializedImageUrl { url },
                });
            }
            SerializedMessageContent::Parts(parts)
        } else {
            SerializedMessageContent::Text(&self.content)
        };

        let mut state = serializer.serialize_struct("ChatMessage", 2)?;
        state.serialize_field("role", &self.role)?;
        state.serialize_field("content", &content)?;
        state.end()
    }
}

/// Request payload for OpenAI `/chat/completions` endpoint.
#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    temperature: f32,
    top_p: f32,
    frequency_penalty: f32,
    presence_penalty: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    think: Option<bool>,
}

/// Delta object in OpenAI `/chat/completions` stream response chunks.
#[derive(Deserialize)]
pub struct OpenAIChatDelta {
    content: Option<String>,
    reasoning_content: Option<String>,
}

/// Expected structured response chunk from OpenAI-compatible `/chat/completions`.
#[derive(Deserialize)]
pub struct OpenAIChatResponse {
    choices: Vec<OpenAIChoice>,
    #[serde(rename = "usage")]
    _usage: Option<OpenAIUsage>,
}

#[derive(Deserialize)]
pub struct OpenAIChoice {
    delta: Option<OpenAIChatDelta>,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
pub struct OpenAIUsage;

fn emit_openai_response_chunk(
    openai_json: OpenAIChatResponse,
    accumulated: &mut String,
    on_chunk: &impl Fn(StreamChunk),
) {
    for choice in openai_json.choices {
        if let Some(delta) = choice.delta {
            if let Some(reasoning) = delta.reasoning_content {
                if !reasoning.is_empty() {
                    on_chunk(StreamChunk::ThinkingToken(reasoning));
                }
            }
            if let Some(token) = delta.content {
                if !token.is_empty() {
                    accumulated.push_str(&token);
                    on_chunk(StreamChunk::Token(token));
                }
            }
        }

        if choice.finish_reason.is_some() && choice.finish_reason.as_deref() != Some("null") {
            on_chunk(StreamChunk::Done);
        }
    }
}

/// Holds the active cancellation token for the current generation request.
///
/// Only one generation runs at a time — starting a new request replaces the
/// previous token. `cancel_generation` cancels whatever is currently active.
#[derive(Default)]
pub struct GenerationState {
    token: Mutex<Option<CancellationToken>>,
}

impl GenerationState {
    /// Creates a new empty generation state with no active token.
    pub fn new() -> Self {
        Self {
            token: Mutex::new(None),
        }
    }

    /// Stores a new cancellation token, replacing any previous one.
    fn set(&self, token: CancellationToken) {
        *self.token.lock().unwrap() = Some(token);
    }

    /// Cancels the active generation, if any, and clears the stored token.
    pub fn cancel(&self) {
        if let Some(token) = self.token.lock().unwrap().take() {
            token.cancel();
        }
    }

    /// Clears the stored token without cancelling it (used on natural completion).
    fn clear(&self) {
        *self.token.lock().unwrap() = None;
    }
}

/// Backend-managed conversation history with an epoch counter to prevent
/// stale writes after a reset. The Rust side is the source of truth; the
/// frontend sends only new user messages and receives streamed tokens.
pub struct ConversationHistory {
    pub messages: Mutex<Vec<ChatMessage>>,
    pub epoch: AtomicU64,
}

impl Default for ConversationHistory {
    fn default() -> Self {
        Self {
            messages: Mutex::new(Vec::new()),
            epoch: AtomicU64::new(0),
        }
    }
}

impl ConversationHistory {
    /// Creates a new empty conversation history at epoch 0.
    pub fn new() -> Self {
        Self::default()
    }
}

/// System prompt loaded once at startup from the `THUKI_SYSTEM_PROMPT`
/// environment variable, falling back to a built-in default.
pub struct SystemPrompt(pub String);

/// Reads `THUKI_SYSTEM_PROMPT` from the environment, falling back to the
/// built-in default when unset or empty.
pub fn load_system_prompt() -> String {
    std::env::var("THUKI_SYSTEM_PROMPT")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SYSTEM_PROMPT.to_string())
}

/// Reads `THUKI_API_ENDPOINT` from the environment, falling back to the
/// built-in default when unset or empty.
pub fn load_api_endpoint() -> String {
    std::env::var(API_ENDPOINT_ENV_VAR)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_API_ENDPOINT.to_string())
}

/// Reads `THUKI_API_KEY` from the environment, falling back to the
/// built-in default when unset or empty.
pub fn load_api_key() -> String {
    std::env::var(API_KEY_ENV_VAR)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_API_KEY.to_string())
}

/// Resolves the effective endpoint for the current runtime configuration.
///
/// When callers still pass a URL derived from `DEFAULT_API_ENDPOINT`, this
/// rewrites only the base portion so tests and custom mock endpoints keep
/// working unchanged.
fn resolve_runtime_endpoint(endpoint: &str) -> String {
    let default_base = DEFAULT_API_ENDPOINT.trim_end_matches('/');
    if let Some(suffix) = endpoint.strip_prefix(default_base) {
        format!("{}{}", load_api_endpoint().trim_end_matches('/'), suffix)
    } else {
        endpoint.to_string()
    }
}

/// Model configuration loaded once at startup from the `THUKI_SUPPORTED_AI_MODELS`
/// environment variable (comma-separated list). The first entry is the default
/// active model used for inference. The runtime-selected model is stored
/// separately so the frontend can switch models without rebuilding app state.
pub struct ModelConfig {
    pub active: String,
    all: Mutex<Vec<String>>,
    runtime_active: Mutex<String>,
}

impl ModelConfig {
    /// Returns the runtime-active model, which may differ from the startup default.
    pub fn current_active(&self) -> String {
        self.runtime_active.lock().unwrap().clone()
    }

    /// Returns the full runtime-supported model list.
    pub fn current_all(&self) -> Vec<String> {
        self.all.lock().unwrap().clone()
    }

    /// Updates the runtime-active model if it is present in the supported list.
    pub fn set_active(&self, model: &str) -> Result<(), String> {
        let trimmed = model.trim();
        if trimmed.is_empty() {
            return Err("Model name cannot be empty".to_string());
        }
        if !self
            .all
            .lock()
            .unwrap()
            .iter()
            .any(|candidate| candidate == trimmed)
        {
            return Err(format!("Unsupported model: {trimmed}"));
        }

        *self.runtime_active.lock().unwrap() = trimmed.to_string();
        Ok(())
    }

    /// Adds a model to the runtime-supported list.
    pub fn add_model(&self, model: &str) -> Result<(), String> {
        let trimmed = model.trim();
        if trimmed.is_empty() {
            return Err("Model name cannot be empty".to_string());
        }

        let mut models = self.all.lock().unwrap();
        if models.iter().any(|candidate| candidate == trimmed) {
            return Err(format!("Model already exists: {trimmed}"));
        }

        models.push(trimmed.to_string());
        Ok(())
    }

    /// Removes a model from the runtime-supported list.
    ///
    /// If the removed model is currently active, the first remaining model
    /// becomes the new runtime-active model.
    pub fn remove_model(&self, model: &str) -> Result<(), String> {
        let trimmed = model.trim();
        if trimmed.is_empty() {
            return Err("Model name cannot be empty".to_string());
        }

        let mut models = self.all.lock().unwrap();
        let Some(index) = models.iter().position(|candidate| candidate == trimmed) else {
            return Err(format!("Unsupported model: {trimmed}"));
        };

        if models.len() == 1 {
            return Err("Cannot remove the last model".to_string());
        }

        models.remove(index);

        let mut runtime_active = self.runtime_active.lock().unwrap();
        if runtime_active.as_str() == trimmed {
            *runtime_active = models
                .first()
                .cloned()
                .unwrap_or_else(|| self.active.clone());
        }

        Ok(())
    }
}

/// Reads `THUKI_SUPPORTED_AI_MODELS` from the environment and returns a
/// `ModelConfig`. Trims whitespace around each entry and filters empty entries.
/// Defaults to `[DEFAULT_MODEL_NAME]` when the variable is unset or empty.
pub fn load_model_config() -> ModelConfig {
    let models: Vec<String> = std::env::var("THUKI_SUPPORTED_AI_MODELS")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| {
            s.split(',')
                .map(|m| m.trim().to_string())
                .filter(|m| !m.is_empty())
                .collect()
        })
        .unwrap_or_else(|| vec![DEFAULT_MODEL_NAME.to_string()]);
    let active = models
        .first()
        .cloned()
        .unwrap_or_else(|| DEFAULT_MODEL_NAME.to_string());
    ModelConfig {
        runtime_active: Mutex::new(active.clone()),
        active,
        all: Mutex::new(models),
    }
}

/// Returns the runtime-active model and full supported list to the frontend.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn get_model_config(model_config: tauri::State<'_, ModelConfig>) -> serde_json::Value {
    serde_json::json!({
        "active": model_config.current_active(),
        "all": model_config.current_all()
    })
}

/// Updates the runtime-active model used for subsequent inference requests.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn set_active_model(
    model: String,
    model_config: tauri::State<'_, ModelConfig>,
) -> Result<serde_json::Value, String> {
    model_config.set_active(&model)?;
    Ok(serde_json::json!({
        "active": model_config.current_active(),
        "all": model_config.current_all()
    }))
}

/// Adds a model to the runtime-supported list.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn add_model(
    model: String,
    model_config: tauri::State<'_, ModelConfig>,
) -> Result<serde_json::Value, String> {
    model_config.add_model(&model)?;
    Ok(serde_json::json!({
        "active": model_config.current_active(),
        "all": model_config.current_all()
    }))
}

/// Removes a model from the runtime-supported list.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn remove_model(
    model: String,
    model_config: tauri::State<'_, ModelConfig>,
) -> Result<serde_json::Value, String> {
    model_config.remove_model(&model)?;
    Ok(serde_json::json!({
        "active": model_config.current_active(),
        "all": model_config.current_all()
    }))
}

fn api_config_value() -> serde_json::Value {
    let endpoint = load_api_endpoint();
    let has_api_key = !load_api_key().trim().is_empty();

    serde_json::json!({
        "endpoint": endpoint,
        "has_api_key": has_api_key
    })
}

/// Returns the current runtime API configuration to the frontend.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn get_api_config() -> serde_json::Value {
    api_config_value()
}

// Using finish_onboarding directly in the UI instead

/// Updates the runtime API endpoint used for subsequent requests.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn set_api_endpoint(endpoint: String) -> Result<serde_json::Value, String> {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return Err("API endpoint cannot be empty".to_string());
    }

    std::env::set_var(API_ENDPOINT_ENV_VAR, trimmed);
    Ok(api_config_value())
}

/// Updates the runtime API key used for subsequent requests.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn set_api_key(api_key: String) -> Result<serde_json::Value, String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    std::env::set_var(API_KEY_ENV_VAR, trimmed);
    Ok(api_config_value())
}

/// Core streaming logic for Ollama `/api/chat`, separated from the Tauri
/// command for testability. Uses `tokio::select!` to race each chunk read
/// against the cancellation token, ensuring the HTTP connection is dropped
/// immediately when the user cancels — which signals Ollama to stop inference.
/// Returns the accumulated assistant response so the caller can persist it.
pub async fn stream_openai_chat(
    endpoint: &str,
    model: &str,
    messages: Vec<ChatMessage>,
    think: bool,
    client: &reqwest::Client,
    cancel_token: CancellationToken,
    on_chunk: impl Fn(StreamChunk),
) -> String {
    let request_payload = OpenAIChatRequest {
        model: model.to_string(),
        messages,
        stream: true,
        temperature: 1.0,
        top_p: 0.95,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        think: if think { Some(true) } else { None },
    };

    let mut accumulated = String::new();
    let resolved_endpoint = resolve_runtime_endpoint(endpoint);
    let api_key = load_api_key();

    let res = client
        .post(&resolved_endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_payload)
        .send()
        .await;

    match res {
        Ok(response) => {
            if !response.status().is_success() {
                let status = response.status().as_u16();
                on_chunk(StreamChunk::Error(classify_http_error(status, model)));
                return accumulated;
            }

            let mut stream = response.bytes_stream();
            let mut buffer: Vec<u8> = Vec::new();

            loop {
                tokio::select! {
                    biased;
                    _ = cancel_token.cancelled() => {
                        // Drop the stream — closes the HTTP connection,
                        // which signals Ollama to stop inference.
                        drop(stream);
                        on_chunk(StreamChunk::Cancelled);
                        return accumulated;
                    }
                    chunk_opt = stream.next() => {
                        match chunk_opt {
                            Some(Ok(bytes)) => {
                                buffer.extend_from_slice(&bytes);

                                while let Some(idx) = buffer.iter().position(|&b| b == b'\n') {
                                    let line_bytes = buffer.drain(..=idx).collect::<Vec<u8>>();
                                    if let Ok(line_text) = String::from_utf8(line_bytes) {
                                        let trimmed = line_text.trim();
                                        if trimmed.is_empty() {
                                            continue;
                                        }

                                        // Skip data: [DONE] line
                                        if trimmed.starts_with("data: [DONE]") {
                                            on_chunk(StreamChunk::Done);
                                            continue;
                                        }

                                        // Handle OpenAI-compatible SSE payloads.
                                        if let Some(json_str) = trimmed.strip_prefix("data: ") {
                                            if let Ok(openai_json) =
                                                serde_json::from_str::<OpenAIChatResponse>(json_str)
                                            {
                                                emit_openai_response_chunk(
                                                    openai_json,
                                                    &mut accumulated,
                                                    &on_chunk,
                                                );
                                            }
                                        } else if let Ok(openai_json) =
                                            serde_json::from_str::<OpenAIChatResponse>(trimmed)
                                        {
                                            emit_openai_response_chunk(
                                                openai_json,
                                                &mut accumulated,
                                                &on_chunk,
                                            );
                                        }
                                    }
                                }
                            }
                            Some(Err(e)) => {
                                on_chunk(StreamChunk::Error(classify_stream_error(&e)));
                                return accumulated;
                            }
                            None => return accumulated,
                        }
                    }
                }
            }
        }
        Err(e) => {
            on_chunk(StreamChunk::Error(classify_stream_error(&e)));
        }
    }

    accumulated
}

/// Streams a chat response from the configured AI API. Appends the user
/// message and assistant response to conversation history after completion
/// or cancellation (retaining context for follow-up requests). Uses an epoch
/// counter to prevent stale writes after a reset.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
#[allow(clippy::too_many_arguments)]
pub async fn ask_ai(
    message: String,
    quoted_text: Option<String>,
    image_paths: Option<Vec<String>>,
    think: bool,
    on_event: Channel<StreamChunk>,
    client: State<'_, reqwest::Client>,
    generation: State<'_, GenerationState>,
    history: State<'_, ConversationHistory>,
    system_prompt: State<'_, SystemPrompt>,
    model_config: State<'_, ModelConfig>,
) -> Result<(), String> {
    let endpoint = format!(
        "{}/chat/completions",
        load_api_endpoint().trim_end_matches('/')
    );
    let cancel_token = CancellationToken::new();
    generation.set(cancel_token.clone());

    // Build user message content.  When quoted text is present, label it
    // explicitly so the model knows the highlighted text is the primary
    // subject and any attached images provide surrounding context.
    let content = match quoted_text {
        Some(ref qt) if !qt.trim().is_empty() => {
            format!("[Highlighted Text]\n\"{}\"\n\n[Request]\n{}", qt, message)
        }
        _ => message,
    };

    // Convert attached images to data URLs for OpenAI-compatible multimodal APIs.
    let images = match image_paths {
        Some(ref paths) if !paths.is_empty() => Some(
            crate::images::encode_images_as_base64(paths)?
                .into_iter()
                .map(|base64| format!("data:image/jpeg;base64,{base64}"))
                .collect(),
        ),
        _ => None,
    };

    let user_msg = ChatMessage {
        role: "user".to_string(),
        content,
        images,
    };

    // Snapshot the current epoch and build the outbound API message array.
    // The user message is NOT yet committed to history — it is only added
    // after a response (including partial/cancelled) to prevent orphaned
    // messages on errors.
    let (epoch_at_start, messages) = {
        let conv = history.messages.lock().unwrap();
        let epoch = history.epoch.load(Ordering::SeqCst);
        let mut msgs = vec![ChatMessage {
            role: "system".to_string(),
            content: system_prompt.0.clone(),
            images: None,
        }];
        msgs.extend(conv.clone());
        msgs.push(user_msg.clone());
        (epoch, msgs)
    };

    let active_model = model_config.current_active();
    let accumulated = stream_openai_chat(
        &endpoint,
        &active_model,
        messages,
        think,
        &client,
        cancel_token.clone(),
        |chunk| {
            let _ = on_event.send(chunk);
        },
    )
    .await;

    // Persist user + assistant messages to in-memory history when the epoch
    // has not changed (no reset during streaming) and we received content.
    // This includes cancelled generations so that subsequent requests retain
    // the conversational context (the user message and any partial response).
    let current_epoch = history.epoch.load(Ordering::SeqCst);
    if current_epoch == epoch_at_start && !accumulated.is_empty() {
        let mut conv = history.messages.lock().unwrap();
        // Preserve image data URLs in history so that follow-up messages can still
        // reference earlier screenshots or attachments when the full conversation
        // is replayed to the configured AI API on later turns.
        conv.push(user_msg);
        conv.push(ChatMessage {
            role: "assistant".to_string(),
            content: accumulated,
            images: None,
        });
    }

    generation.clear();
    Ok(())
}

/// Cancels the currently active generation, if any.
///
/// Signals the `CancellationToken` stored in `GenerationState`, which causes the
/// `stream_ollama_chat` loop to exit immediately and drop the HTTP connection.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub async fn cancel_generation(generation: State<'_, GenerationState>) -> Result<(), String> {
    generation.cancel();
    Ok(())
}

/// Clears the backend conversation history and increments the epoch counter.
/// The epoch increment prevents any in-flight `ask_ollama` from writing stale
/// messages into the freshly cleared history.
#[cfg_attr(coverage_nightly, coverage(off))]
#[cfg_attr(not(coverage), tauri::command)]
pub fn reset_conversation(history: State<'_, ConversationHistory>) {
    history.epoch.fetch_add(1, Ordering::SeqCst);
    history.messages.lock().unwrap().clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};

    fn collect_chunks() -> (Arc<StdMutex<Vec<StreamChunk>>>, impl Fn(StreamChunk)) {
        let chunks: Arc<StdMutex<Vec<StreamChunk>>> = Arc::new(StdMutex::new(Vec::new()));
        let chunks_clone = chunks.clone();
        let callback = move |chunk: StreamChunk| {
            chunks_clone.lock().unwrap().push(chunk);
        };
        (chunks, callback)
    }

    /// Helper: builds a `/api/chat` response line from content + done flag.
    fn chat_line(content: &str, done: bool) -> String {
        if done {
            format!(
                "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{}\"}},\"index\":0,\"finish_reason\":\"stop\"}}],\"usage\":{{\"prompt_tokens\":10,\"completion_tokens\":5,\"total_tokens\":15}}}}\ndata: [DONE]\n",
                content
            )
        } else {
            format!(
                "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{}\"}},\"index\":0,\"finish_reason\":null}}]}}\n",
                content
            )
        }
    }

    #[tokio::test]
    async fn streams_tokens_from_valid_response() {
        let mut server = mockito::Server::new_async().await;
        let body = format!(
            "{}{}{}",
            chat_line("Hello", false),
            chat_line(" world", false),
            chat_line("", true),
        );
        let mock = server
            .mock("POST", "/api/chat")
            .with_body(body)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
            images: None,
        }];

        let accumulated = stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            messages,
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert!(matches!(&chunks[0], StreamChunk::Token(t) if t == "Hello"));
        assert!(matches!(&chunks[1], StreamChunk::Token(t) if t == " world"));
        assert!(matches!(&chunks[2], StreamChunk::Done));
        assert_eq!(accumulated, "Hello world");
    }

    #[tokio::test]
    async fn handles_http_500() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .with_status(500)
            .with_body("Internal Server Error")
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        let accumulated = stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert_eq!(chunks.len(), 1);
        assert!(matches!(&chunks[0], StreamChunk::Error(e) if e.kind == OllamaErrorKind::Other));
        assert!(accumulated.is_empty());
    }

    #[tokio::test]
    async fn handles_connection_refused() {
        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        let accumulated = stream_openai_chat(
            "http://127.0.0.1:1/api/chat",
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        let chunks = chunks.lock().unwrap();
        assert_eq!(chunks.len(), 1);
        assert!(matches!(&chunks[0], StreamChunk::Error(_)));
        assert!(accumulated.is_empty());
    }

    #[tokio::test]
    async fn handles_malformed_json() {
        let mut server = mockito::Server::new_async().await;
        let body = format!("not json at all\n{}", chat_line("ok", true));
        let mock = server
            .mock("POST", "/api/chat")
            .with_body(body)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert!(chunks.iter().any(|c| matches!(c, StreamChunk::Done)));
    }

    #[tokio::test]
    async fn handles_empty_response_body() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .with_body("")
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        let accumulated = stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert!(chunks.is_empty());
        assert!(accumulated.is_empty());
    }

    #[tokio::test]
    async fn tokens_arrive_in_order() {
        let mut server = mockito::Server::new_async().await;
        let body = format!(
            "{}{}{}{}",
            chat_line("A", false),
            chat_line("B", false),
            chat_line("C", false),
            chat_line("", true),
        );
        let mock = server
            .mock("POST", "/api/chat")
            .with_body(body)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        let accumulated = stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        let tokens: Vec<&str> = chunks
            .iter()
            .filter_map(|c| match c {
                StreamChunk::Token(t) => Some(t.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(tokens, vec!["A", "B", "C"]);
        assert_eq!(accumulated, "ABC");
    }

    #[tokio::test]
    async fn handles_invalid_utf8_in_stream() {
        let mut server = mockito::Server::new_async().await;
        let mut body = b"\xFF\xFE\n".to_vec();
        body.extend_from_slice(chat_line("ok", true).as_bytes());
        let mock = server
            .mock("POST", "/api/chat")
            .with_body(body)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert!(chunks.iter().any(|c| matches!(c, StreamChunk::Done)));
    }

    #[tokio::test]
    async fn handles_mid_stream_network_error() {
        use tokio::io::AsyncWriteExt;
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let _ = stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\n\
                      Content-Type: application/x-ndjson\r\n\
                      Transfer-Encoding: chunked\r\n\r\n\
                      4\r\ntest",
                )
                .await;
        });

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("http://127.0.0.1:{}/api/chat", port),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        let chunks = chunks.lock().unwrap();
        let has_no_tokens = chunks.iter().all(|c| !matches!(c, StreamChunk::Token(_)));
        assert!(has_no_tokens);
    }

    #[tokio::test]
    async fn http_500_with_empty_body() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .with_status(500)
            .with_body("")
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert_eq!(chunks.len(), 1);
        assert!(
            matches!(&chunks[0], StreamChunk::Error(e) if e.kind == OllamaErrorKind::Other && e.message.contains("500"))
        );
    }

    #[tokio::test]
    async fn whitespace_only_lines_are_skipped() {
        let mut server = mockito::Server::new_async().await;
        let body = format!("   \n{}", chat_line("hi", true));
        let mock = server
            .mock("POST", "/api/chat")
            .with_body(body)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert!(chunks.iter().any(|c| matches!(c, StreamChunk::Done)));
    }

    #[tokio::test]
    async fn message_field_absent_emits_only_done() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .with_body("{\"done\":true}\n")
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert!(chunks.iter().all(|c| !matches!(c, StreamChunk::Token(_))));
        assert!(chunks.iter().any(|c| matches!(c, StreamChunk::Done)));
    }

    #[tokio::test]
    async fn cancellation_stops_stream_and_emits_cancelled() {
        use std::sync::Arc;
        use tokio::io::AsyncWriteExt;
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        let server_done = Arc::new(tokio::sync::Notify::new());
        let server_done_clone = server_done.clone();

        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let first_line = chat_line("A", false);
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\n\r\n{}",
                first_line
            );
            let _ = stream.write_all(header.as_bytes()).await;
            server_done_clone.notified().await;
        });

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let token_clone = token.clone();
        let (chunks, callback) = collect_chunks();

        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            token_clone.cancel();
        });

        stream_openai_chat(
            &format!("http://127.0.0.1:{}/api/chat", port),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        let chunks = chunks.lock().unwrap();
        assert!(chunks
            .iter()
            .any(|c| matches!(c, StreamChunk::Token(t) if t == "A")));
        assert!(chunks.iter().any(|c| matches!(c, StreamChunk::Cancelled)));
        assert!(chunks.iter().all(|c| !matches!(c, StreamChunk::Done)));

        server_done.notify_one();
        tokio::task::yield_now().await;
    }

    #[tokio::test]
    async fn pre_cancelled_token_emits_cancelled_immediately() {
        let mut server = mockito::Server::new_async().await;
        let _mock = server
            .mock("POST", "/api/chat")
            .with_body(chat_line("Hello", true))
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        token.cancel();

        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        let chunks = chunks.lock().unwrap();
        assert!(chunks.iter().any(|c| matches!(c, StreamChunk::Cancelled)));
    }

    #[tokio::test]
    async fn sends_messages_array_in_request() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"messages":[{"role":"system","content":"Be helpful"},{"role":"user","content":"hi"}]}"#.to_string(),
            ))
            .with_body(chat_line("", true))
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (_, callback) = collect_chunks();
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: "Be helpful".to_string(),
                images: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: "hi".to_string(),
                images: None,
            },
        ];

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            messages,
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn message_content_absent_emits_only_done() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .with_body("{\"message\":{\"role\":\"assistant\"},\"done\":true}\n")
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert!(chunks.iter().all(|c| !matches!(c, StreamChunk::Token(_))));
        assert!(chunks.iter().any(|c| matches!(c, StreamChunk::Done)));
    }

    #[test]
    fn generation_state_set_and_cancel() {
        let state = GenerationState::new();
        let token = CancellationToken::new();
        let token_clone = token.clone();

        state.set(token);
        assert!(!token_clone.is_cancelled());

        state.cancel();
        assert!(token_clone.is_cancelled());
    }

    #[test]
    fn generation_state_cancel_when_empty() {
        let state = GenerationState::new();
        state.cancel();
    }

    #[test]
    fn generation_state_clear_does_not_cancel() {
        let state = GenerationState::new();
        let token = CancellationToken::new();
        let token_clone = token.clone();

        state.set(token);
        state.clear();
        assert!(!token_clone.is_cancelled());
    }

    #[test]
    fn generation_state_set_replaces_previous() {
        let state = GenerationState::new();
        let first = CancellationToken::new();
        let first_clone = first.clone();
        let second = CancellationToken::new();
        let second_clone = second.clone();

        state.set(first);
        state.set(second);

        state.cancel();
        assert!(!first_clone.is_cancelled());
        assert!(second_clone.is_cancelled());
    }

    /// Guard to serialize tests that mutate environment variables.
    /// Rust runs tests in parallel by default; without serialization these
    /// tests race on shared environment variables.
    static ENV_LOCK: StdMutex<()> = StdMutex::new(());

    fn model_list(config: &ModelConfig) -> Vec<String> {
        config.current_all()
    }

    // ── load_model_config tests ──────────────────────────────────────────────

    #[test]
    fn load_model_config_returns_default_when_unset() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("THUKI_SUPPORTED_AI_MODELS");
        let config = load_model_config();
        assert_eq!(config.active, DEFAULT_MODEL_NAME);
        assert_eq!(model_list(&config), vec![DEFAULT_MODEL_NAME.to_string()]);
    }

    #[test]
    fn load_model_config_reads_single_model() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("THUKI_SUPPORTED_AI_MODELS", "gemma4:e4b");
        let config = load_model_config();
        assert_eq!(config.active, "gemma4:e4b");
        assert_eq!(model_list(&config), vec!["gemma4:e4b".to_string()]);
        std::env::remove_var("THUKI_SUPPORTED_AI_MODELS");
    }

    #[test]
    fn load_model_config_reads_multiple_models_first_is_active() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("THUKI_SUPPORTED_AI_MODELS", "gemma4:e2b,gemma4:e4b");
        let config = load_model_config();
        assert_eq!(config.active, "gemma4:e2b");
        assert_eq!(
            model_list(&config),
            vec!["gemma4:e2b".to_string(), "gemma4:e4b".to_string()]
        );
        std::env::remove_var("THUKI_SUPPORTED_AI_MODELS");
    }

    #[test]
    fn load_model_config_trims_whitespace_around_entries() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("THUKI_SUPPORTED_AI_MODELS", " gemma4:e2b , gemma4:e4b ");
        let config = load_model_config();
        assert_eq!(config.active, "gemma4:e2b");
        assert_eq!(
            model_list(&config),
            vec!["gemma4:e2b".to_string(), "gemma4:e4b".to_string()]
        );
        std::env::remove_var("THUKI_SUPPORTED_AI_MODELS");
    }

    #[test]
    fn load_model_config_falls_back_to_default_when_whitespace_only() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("THUKI_SUPPORTED_AI_MODELS", "   ");
        let config = load_model_config();
        assert_eq!(config.active, DEFAULT_MODEL_NAME);
        assert_eq!(model_list(&config), vec![DEFAULT_MODEL_NAME.to_string()]);
        std::env::remove_var("THUKI_SUPPORTED_AI_MODELS");
    }

    #[test]
    fn load_model_config_filters_empty_entries_from_list() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("THUKI_SUPPORTED_AI_MODELS", "gemma4:e2b,,gemma4:e4b");
        let config = load_model_config();
        assert_eq!(
            model_list(&config),
            vec!["gemma4:e2b".to_string(), "gemma4:e4b".to_string()]
        );
        std::env::remove_var("THUKI_SUPPORTED_AI_MODELS");
    }

    #[test]
    fn load_model_config_falls_back_when_all_entries_are_empty_commas() {
        let _guard = ENV_LOCK.lock().unwrap();
        // All entries filter to empty strings, leaving an empty list.
        // The active model must still fall back to DEFAULT_MODEL_NAME.
        std::env::set_var("THUKI_SUPPORTED_AI_MODELS", ",");
        let config = load_model_config();
        assert_eq!(config.active, DEFAULT_MODEL_NAME);
        assert_eq!(model_list(&config), Vec::<String>::new());
        std::env::remove_var("THUKI_SUPPORTED_AI_MODELS");
    }

    #[test]
    fn add_model_appends_a_new_runtime_model() {
        let config = ModelConfig {
            active: "gemma4:e2b".to_string(),
            all: Mutex::new(vec!["gemma4:e2b".to_string()]),
            runtime_active: Mutex::new("gemma4:e2b".to_string()),
        };

        config.add_model("gemma4:e4b").unwrap();

        assert_eq!(
            model_list(&config),
            vec!["gemma4:e2b".to_string(), "gemma4:e4b".to_string()]
        );
        assert_eq!(config.current_active(), "gemma4:e2b");
    }

    #[test]
    fn remove_model_switches_runtime_active_when_current_model_is_removed() {
        let config = ModelConfig {
            active: "gemma4:e2b".to_string(),
            all: Mutex::new(vec!["gemma4:e2b".to_string(), "gemma4:e4b".to_string()]),
            runtime_active: Mutex::new("gemma4:e4b".to_string()),
        };

        config.remove_model("gemma4:e4b").unwrap();

        assert_eq!(model_list(&config), vec!["gemma4:e2b".to_string()]);
        assert_eq!(config.current_active(), "gemma4:e2b");
    }

    #[test]
    fn remove_model_rejects_removing_the_last_model() {
        let config = ModelConfig {
            active: "gemma4:e2b".to_string(),
            all: Mutex::new(vec!["gemma4:e2b".to_string()]),
            runtime_active: Mutex::new("gemma4:e2b".to_string()),
        };

        let error = config.remove_model("gemma4:e2b").unwrap_err();

        assert_eq!(error, "Cannot remove the last model");
        assert_eq!(model_list(&config), vec!["gemma4:e2b".to_string()]);
        assert_eq!(config.current_active(), "gemma4:e2b");
    }

    // ── sampling options test ────────────────────────────────────────────────

    #[tokio::test]
    async fn sends_sampling_options_in_request() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"options":{"temperature":1.0,"top_p":0.95,"top_k":64}}"#.to_string(),
            ))
            .with_body(chat_line("", true))
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (_, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            true,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
    }

    #[test]
    fn load_system_prompt_returns_default_when_unset() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var("THUKI_SYSTEM_PROMPT");

        let prompt = load_system_prompt();
        assert_eq!(prompt, DEFAULT_SYSTEM_PROMPT);
    }

    #[test]
    fn load_system_prompt_reads_env_var() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("THUKI_SYSTEM_PROMPT", "Custom prompt");

        let prompt = load_system_prompt();
        assert_eq!(prompt, "Custom prompt");

        std::env::remove_var("THUKI_SYSTEM_PROMPT");
    }

    #[test]
    fn load_system_prompt_ignores_empty_env_var() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var("THUKI_SYSTEM_PROMPT", "   ");

        let prompt = load_system_prompt();
        assert_eq!(prompt, DEFAULT_SYSTEM_PROMPT);

        std::env::remove_var("THUKI_SYSTEM_PROMPT");
    }

    #[test]
    fn load_api_endpoint_returns_default_when_unset() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var(API_ENDPOINT_ENV_VAR);

        let endpoint = load_api_endpoint();
        assert_eq!(endpoint, DEFAULT_API_ENDPOINT);
    }

    #[test]
    fn load_api_endpoint_reads_env_var() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(API_ENDPOINT_ENV_VAR, "http://localhost:11434/v1");

        let endpoint = load_api_endpoint();
        assert_eq!(endpoint, "http://localhost:11434/v1");

        std::env::remove_var(API_ENDPOINT_ENV_VAR);
    }

    #[test]
    fn load_api_key_returns_default_when_unset() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::remove_var(API_KEY_ENV_VAR);

        let api_key = load_api_key();
        assert_eq!(api_key, DEFAULT_API_KEY);
    }

    #[test]
    fn load_api_key_reads_env_var() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(API_KEY_ENV_VAR, "sk-test-123");

        let api_key = load_api_key();
        assert_eq!(api_key, "sk-test-123");

        std::env::remove_var(API_KEY_ENV_VAR);
    }

    #[test]
    fn resolve_runtime_endpoint_rewrites_default_base_only() {
        let _guard = ENV_LOCK.lock().unwrap();
        std::env::set_var(API_ENDPOINT_ENV_VAR, "http://localhost:11434/v1");

        let endpoint = resolve_runtime_endpoint("http://localhost:20128/v1/chat/completions");
        assert_eq!(endpoint, "http://localhost:11434/v1/chat/completions");

        std::env::remove_var(API_ENDPOINT_ENV_VAR);
    }

    #[test]
    fn conversation_history_new_starts_at_epoch_zero() {
        let h = ConversationHistory::new();
        assert_eq!(h.epoch.load(Ordering::SeqCst), 0);
        assert!(h.messages.lock().unwrap().is_empty());
    }

    #[test]
    fn conversation_history_epoch_increments_on_clear() {
        let h = ConversationHistory::new();
        h.messages.lock().unwrap().push(ChatMessage {
            role: "user".to_string(),
            content: "hi".to_string(),
            images: None,
        });

        h.epoch.fetch_add(1, Ordering::SeqCst);
        h.messages.lock().unwrap().clear();

        assert_eq!(h.epoch.load(Ordering::SeqCst), 1);
        assert!(h.messages.lock().unwrap().is_empty());
    }

    // ─── OllamaError classification ───────────────────────────────────────────

    #[test]
    fn classify_http_404_returns_model_not_found() {
        let err = classify_http_error(404, "gemma4:e2b");
        assert_eq!(err.kind, OllamaErrorKind::ModelNotFound);
        assert!(err.message.contains("gemma4:e2b"));
    }

    #[test]
    fn classify_http_500_returns_other_with_status() {
        let err = classify_http_error(500, DEFAULT_MODEL_NAME);
        assert_eq!(err.kind, OllamaErrorKind::Other);
        assert!(err.message.contains("500"));
    }

    #[test]
    fn classify_http_401_returns_other_with_status() {
        let err = classify_http_error(401, DEFAULT_MODEL_NAME);
        assert_eq!(err.kind, OllamaErrorKind::Other);
        assert!(err.message.contains("401"));
    }

    #[tokio::test]
    async fn connection_refused_emits_not_running_error() {
        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            "http://127.0.0.1:1/api/chat",
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        let chunks = chunks.lock().unwrap();
        assert_eq!(chunks.len(), 1);
        assert!(
            matches!(&chunks[0], StreamChunk::Error(e) if e.kind == OllamaErrorKind::NotRunning)
        );
    }

    #[tokio::test]
    async fn http_404_emits_model_not_found_error() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .with_status(404)
            .with_body("")
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert_eq!(chunks.len(), 1);
        assert!(
            matches!(&chunks[0], StreamChunk::Error(e) if e.kind == OllamaErrorKind::ModelNotFound)
        );
    }

    #[test]
    fn thinking_token_serializes_correctly() {
        let chunk = StreamChunk::ThinkingToken("reasoning step".to_string());
        let json = serde_json::to_value(&chunk).unwrap();
        assert_eq!(json["type"], "ThinkingToken");
        assert_eq!(json["data"], "reasoning step");
    }

    #[test]
    fn openai_chat_request_has_correct_structure() {
        let req = OpenAIChatRequest {
            model: "test".to_string(),
            messages: vec![],
            stream: true,
            temperature: 1.0,
            top_p: 0.9,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            think: None,
        };
        let json = serde_json::to_value(req).unwrap();
        assert_eq!(json["model"], "test");
        assert_eq!(json["stream"], true);
        // Compare floating point values with tolerance due to potential precision issues
        assert!((json["temperature"].as_f64().unwrap() - 1.0).abs() < 0.001);
        assert!((json["top_p"].as_f64().unwrap() - 0.9).abs() < 0.001);
    }

    #[test]
    fn openai_chat_request_handles_images_correctly() {
        let msg = ChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
            images: Some(vec![
                "data:image/jpeg;base64,image1".to_string(),
                "data:image/jpeg;base64,image2".to_string(),
            ]),
        };
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["role"], "user");
        assert_eq!(json["content"][0]["type"], "text");
        assert_eq!(json["content"][0]["text"], "Hello");
        assert_eq!(json["content"][1]["type"], "image_url");
        assert_eq!(
            json["content"][1]["image_url"]["url"],
            "data:image/jpeg;base64,image1"
        );
        assert_eq!(json["content"][2]["type"], "image_url");
        assert_eq!(
            json["content"][2]["image_url"]["url"],
            "data:image/jpeg;base64,image2"
        );
    }

    #[test]
    fn openai_choice_has_delta_content() {
        let json = r#"{"delta":{"content":"hello"},"index":0,"finish_reason":null}"#;
        let choice: OpenAIChoice = serde_json::from_str(json).unwrap();
        assert_eq!(choice.delta.unwrap().content.unwrap(), "hello");
        // assert_eq!(choice.index, 0); // index field does not exist in our OpenAIChoice struct
        assert!(choice.finish_reason.is_none());
    }

    #[test]
    fn openai_choice_without_content() {
        let json = r#"{"delta":{},"index":0,"finish_reason":"stop"}"#;
        let choice: OpenAIChoice = serde_json::from_str(json).unwrap();
        assert!(choice.delta.unwrap().content.is_none());
        assert_eq!(choice.finish_reason.unwrap(), "stop");
    }

    #[tokio::test]
    async fn http_500_emits_other_error_with_status() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .with_status(500)
            .with_body("Internal Server Error")
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            false,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();
        assert_eq!(chunks.len(), 1);
        assert!(
            matches!(&chunks[0], StreamChunk::Error(e) if e.kind == OllamaErrorKind::Other && e.message.contains("500"))
        );
    }

    /// Helper: builds a `/api/chat` response line with both thinking and content fields.
    fn chat_line_with_thinking(thinking: &str, content: &str, done: bool) -> String {
        format!(
            "{{\"message\":{{\"role\":\"assistant\",\"content\":\"{}\",\"thinking\":\"{}\"}},\"done\":{}}}\n",
            content, thinking, done
        )
    }

    #[tokio::test]
    async fn stream_ollama_chat_emits_thinking_tokens() {
        let mut server = mockito::Server::new_async().await;
        let body = format!(
            "{}{}{}",
            chat_line_with_thinking("step 1", "", false),
            chat_line_with_thinking("", "Hello", false),
            chat_line_with_thinking("", "", true),
        );
        let mock = server
            .mock("POST", "/api/chat")
            .with_body(body)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        let accumulated = stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            true,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();

        // ThinkingToken emitted for thinking field
        assert!(matches!(&chunks[0], StreamChunk::ThinkingToken(t) if t == "step 1"));
        // Token emitted for content field
        assert!(matches!(&chunks[1], StreamChunk::Token(t) if t == "Hello"));
        // Done emitted
        assert!(matches!(&chunks[2], StreamChunk::Done));

        // Accumulated return value contains only content, not thinking
        assert_eq!(accumulated, "Hello");
    }

    #[tokio::test]
    async fn stream_ollama_chat_sends_think_true_in_request() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("POST", "/api/chat")
            .match_body(mockito::Matcher::PartialJsonString(
                r#"{"think":true}"#.to_string(),
            ))
            .with_body(chat_line("", true))
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (_, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            true,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
    }

    #[tokio::test]
    async fn stream_ollama_chat_empty_thinking_not_emitted() {
        let mut server = mockito::Server::new_async().await;
        let body = format!(
            "{}{}",
            chat_line_with_thinking("", "Hello", false),
            chat_line_with_thinking("", "", true),
        );
        let mock = server
            .mock("POST", "/api/chat")
            .with_body(body)
            .create_async()
            .await;

        let client = reqwest::Client::new();
        let token = CancellationToken::new();
        let (chunks, callback) = collect_chunks();

        stream_openai_chat(
            &format!("{}/api/chat", server.url()),
            "test-model",
            vec![],
            true,
            &client,
            token,
            callback,
        )
        .await;

        mock.assert_async().await;
        let chunks = chunks.lock().unwrap();

        // No ThinkingToken emitted for empty thinking field
        assert!(chunks
            .iter()
            .all(|c| !matches!(c, StreamChunk::ThinkingToken(_))));
        // Content token still emitted
        assert!(chunks
            .iter()
            .any(|c| matches!(c, StreamChunk::Token(t) if t == "Hello")));
    }
}
