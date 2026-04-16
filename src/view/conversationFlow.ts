import type { Message } from '../hooks/useAiChat';
import type { AttachedImage } from '../types/image';

/**
 * Shared session input used to derive the UI flow for:
 * - `AskBarView`
 * - `ConversationView`
 * - `CompactConversationPill`
 *
 * This keeps all three views on the same conversation-state model while still
 * allowing each view to render a different surface.
 */
export interface ConversationFlowInput {
  /** Confirmed messages already committed to the conversation. */
  messages: Message[];
  /**
   * Optimistic user message shown while a submit is still being prepared
   * (for example image staging or `/screen` capture).
   */
  pendingUserMessage?: Message | null;
  /** Current ask-bar draft text. */
  query?: string;
  /** Selected text captured from the host app. */
  selectedText?: string | null;
  /** Images attached to the current unsent draft. */
  attachedImages?: AttachedImage[];
  /** True while the model is streaming assistant output. */
  isGenerating: boolean;
  /**
   * True while a submit is pending before generation begins
   * (image processing, screenshot capture, etc).
   */
  isSubmitPending?: boolean;
  /** Current model selection for the ask bar. */
  selectedModel?: string;
  /** Available models for the ask bar. */
  modelOptions?: readonly string[];
  /** Save-state metadata used by the full conversation view. */
  isSaved?: boolean;
  canSave?: boolean;
}

/** High-level session status shared across all conversation surfaces. */
export type ConversationFlowStatus =
  | 'idle'
  | 'draft'
  | 'submitting'
  | 'thinking'
  | 'streaming'
  | 'ready'
  | 'error';

/** Compact-pill tone used to keep styling in sync with the shared flow state. */
export type CompactTone = 'neutral' | 'busy' | 'error';

/**
 * Normalized conversation model derived once from raw state, then sliced for
 * each UI surface.
 */
export interface ConversationFlowModel {
  /** Original committed messages from state. */
  messages: Message[];
  /** Messages actually visible in the current flow, including optimistic user message. */
  visibleMessages: Message[];
  /** Current draft query and its trimmed form. */
  query: string;
  trimmedQuery: string;
  /** Draft context / attachments. */
  selectedText: string | null;
  attachedImages: AttachedImage[];
  attachedImageCount: number;
  hasAttachedImages: boolean;
  hasDraftText: boolean;
  hasDraft: boolean;
  /** Derived busy flags. */
  isGenerating: boolean;
  isSubmitPending: boolean;
  isBusy: boolean;
  /** Chat/session shape. */
  hasMessages: boolean;
  isChatMode: boolean;
  hasAssistantResponse: boolean;
  /** Latest user/assistant messages from the visible session. */
  latestUserMessage?: Message;
  latestAssistantMessage?: Message;
  latestAssistantContent: string;
  latestAssistantThinking: string;
  latestAssistantPreview: string;
  latestAssistantHasError: boolean;
  /** Shared status used across ask bar, full conversation, and compact pill. */
  status: ConversationFlowStatus;
  /** Ask-bar interaction affordances. */
  canSubmit: boolean;
  canCancel: boolean;
  askBarPlaceholder: string;
  actionButtonLabel: 'Send message' | 'Stop generating';
  /** Compact pill defaults derived from the same state machine. */
  compactDisplayText: string;
  compactTone: CompactTone;
  compactShowsLoadingDots: boolean;
  compactShowsErrorDot: boolean;
  compactShowsIdleDot: boolean;
  /** Conversation controls metadata. */
  selectedModel?: string;
  modelOptions: readonly string[];
  isSaved: boolean;
  canSave: boolean;
}

/** Shared render metadata for the full conversation view. */
export interface ConversationRenderItem {
  message: Message;
  index: number;
  isStreaming: boolean;
  isThinking: boolean;
  hide: boolean;
}

/** View model consumed by `AskBarView`. */
export interface AskBarFlowViewModel {
  isChatMode: boolean;
  isBusy: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  placeholder: string;
  actionButtonLabel: 'Send message' | 'Stop generating';
  selectedText: string | null;
  attachedImages: AttachedImage[];
  selectedModel?: string;
  modelOptions: readonly string[];
}

/** View model consumed by `ConversationView`. */
export interface ConversationViewFlowModel {
  messages: Message[];
  renderItems: ConversationRenderItem[];
  isGenerating: boolean;
  showTypingIndicator: boolean;
  isSaved: boolean;
  canSave: boolean;
}

/** View model consumed by `CompactConversationPill`. */
export interface CompactConversationPillFlowModel {
  status: ConversationFlowStatus;
  displayText: string;
  tone: CompactTone;
  showsLoadingDots: boolean;
  showsErrorDot: boolean;
  showsIdleDot: boolean;
  textColor: string;
  indicatorBackground: string;
  indicatorBorder: string;
}

const DEFAULT_COMPACT_PREVIEW_MAX_LENGTH = 72;

const COMPACT_TEXT_COLORS: Record<CompactTone, string> = {
  error: '#fca5a5',
  busy: '#ffb089',
  neutral: 'rgba(255,255,255,0.92)',
};

const COMPACT_INDICATOR_BACKGROUNDS: Record<CompactTone, string> = {
  error: 'rgba(239,68,68,0.16)',
  busy: 'rgba(255,141,92,0.16)',
  neutral: 'rgba(255,255,255,0.08)',
};

const COMPACT_INDICATOR_BORDERS: Record<CompactTone, string> = {
  error: 'rgba(239,68,68,0.28)',
  busy: 'rgba(255,141,92,0.22)',
  neutral: 'rgba(255,255,255,0.08)',
};

function trimText(value: string | undefined): string {
  return value?.trim() ?? '';
}

export function getVisibleConversationMessages(
  messages: Message[],
  pendingUserMessage?: Message | null,
): Message[] {
  return pendingUserMessage ? [...messages, pendingUserMessage] : messages;
}

export function getLatestAssistantMessage(
  messages: readonly Message[],
): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return messages[i];
  }
  return undefined;
}

export function getLatestUserMessage(
  messages: readonly Message[],
): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i];
  }
  return undefined;
}

export function toPreviewText(
  text: string,
  maxLength = DEFAULT_COMPACT_PREVIEW_MAX_LENGTH,
): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function deriveStatus(params: {
  latestAssistant?: Message;
  latestAssistantContent: string;
  latestAssistantThinking: string;
  latestAssistantHasError: boolean;
  isGenerating: boolean;
  isSubmitPending: boolean;
  hasDraft: boolean;
  hasMessages: boolean;
}): ConversationFlowStatus {
  const {
    latestAssistantHasError,
    isSubmitPending,
    isGenerating,
    latestAssistantContent,
    latestAssistantThinking,
    hasDraft,
    hasMessages,
  } = params;

  if (latestAssistantHasError) return 'error';
  if (isSubmitPending) return 'submitting';

  if (isGenerating) {
    if (latestAssistantThinking && !latestAssistantContent) return 'thinking';
    return 'streaming';
  }

  if (hasDraft) return 'draft';
  if (hasMessages) return 'ready';
  return 'idle';
}

/**
 * Creates the canonical conversation-flow model.
 *
 * Any UI surface can use this as its source of truth instead of re-deriving
 * "busy", "latest preview", "thinking", or "chat mode" independently.
 */
export function createConversationFlow(
  input: ConversationFlowInput,
): ConversationFlowModel {
  const messages = input.messages;
  const visibleMessages = getVisibleConversationMessages(
    messages,
    input.pendingUserMessage,
  );

  const query = input.query ?? '';
  const trimmedQuery = query.trim();
  const attachedImages = input.attachedImages ?? [];
  const attachedImageCount = attachedImages.length;
  const hasAttachedImages = attachedImageCount > 0;
  const hasDraftText = trimmedQuery.length > 0;
  const hasDraft = hasDraftText || hasAttachedImages;

  const isGenerating = input.isGenerating;
  const isSubmitPending = input.isSubmitPending ?? false;
  const isBusy = isGenerating || isSubmitPending;

  const hasMessages = visibleMessages.length > 0;
  const isChatMode = hasMessages || isBusy;
  const latestAssistantMessage = getLatestAssistantMessage(visibleMessages);
  const latestUserMessage = getLatestUserMessage(visibleMessages);

  const latestAssistantContent = trimText(latestAssistantMessage?.content);
  const latestAssistantThinking = trimText(
    latestAssistantMessage?.thinkingContent,
  );
  const latestAssistantPreview =
    latestAssistantContent || latestAssistantThinking;
  const latestAssistantHasError = Boolean(latestAssistantMessage?.errorKind);
  const hasAssistantResponse = visibleMessages.some(
    (message) => message.role === 'assistant',
  );

  const status = deriveStatus({
    latestAssistant: latestAssistantMessage,
    latestAssistantContent,
    latestAssistantThinking,
    latestAssistantHasError,
    isGenerating,
    isSubmitPending,
    hasDraft,
    hasMessages,
  });

  const canSubmit = hasDraft && !isBusy;
  const canCancel = isBusy;
  const askBarPlaceholder = isChatMode ? 'Reply...' : 'Ask Thuki anything...';
  const actionButtonLabel = isBusy ? 'Stop generating' : 'Send message';

  const compactDisplayText = latestAssistantPreview
    ? toPreviewText(latestAssistantPreview)
    : isBusy
      ? 'Thinking...'
      : 'Open conversation';

  const compactTone: CompactTone = latestAssistantHasError
    ? 'error'
    : isBusy
      ? 'busy'
      : 'neutral';

  return {
    messages,
    visibleMessages,
    query,
    trimmedQuery,
    selectedText: input.selectedText ?? null,
    attachedImages,
    attachedImageCount,
    hasAttachedImages,
    hasDraftText,
    hasDraft,
    isGenerating,
    isSubmitPending,
    isBusy,
    hasMessages,
    isChatMode,
    hasAssistantResponse,
    latestUserMessage,
    latestAssistantMessage,
    latestAssistantContent,
    latestAssistantThinking,
    latestAssistantPreview,
    latestAssistantHasError,
    status,
    canSubmit,
    canCancel,
    askBarPlaceholder,
    actionButtonLabel,
    compactDisplayText,
    compactTone,
    compactShowsLoadingDots: compactTone === 'busy',
    compactShowsErrorDot: compactTone === 'error',
    compactShowsIdleDot: compactTone === 'neutral',
    selectedModel: input.selectedModel,
    modelOptions: input.modelOptions ?? [],
    isSaved: input.isSaved ?? false,
    canSave: input.canSave ?? false,
  };
}

export function isLastStreamingAssistantMessage(
  messages: readonly Message[],
  isGenerating: boolean,
  index: number,
): boolean {
  return (
    isGenerating &&
    index === messages.length - 1 &&
    messages[index]?.role === 'assistant'
  );
}

export function shouldHideAssistantPlaceholder(
  messages: readonly Message[],
  isGenerating: boolean,
  index: number,
): boolean {
  const message = messages[index];
  if (!message) return false;

  const isLastAssistant = isLastStreamingAssistantMessage(
    messages,
    isGenerating,
    index,
  );

  return (
    isLastAssistant &&
    !trimText(message.content) &&
    !trimText(message.thinkingContent)
  );
}

export function selectAskBarFlow(
  modelOrInput: ConversationFlowModel | ConversationFlowInput,
): AskBarFlowViewModel {
  const model =
    'visibleMessages' in modelOrInput
      ? modelOrInput
      : createConversationFlow(modelOrInput);

  return {
    isChatMode: model.isChatMode,
    isBusy: model.isBusy,
    canSubmit: model.canSubmit,
    canCancel: model.canCancel,
    placeholder: model.askBarPlaceholder,
    actionButtonLabel: model.actionButtonLabel,
    selectedText: model.selectedText,
    attachedImages: model.attachedImages,
    selectedModel: model.selectedModel,
    modelOptions: model.modelOptions,
  };
}

export function selectConversationFlow(
  modelOrInput: ConversationFlowModel | ConversationFlowInput,
): ConversationViewFlowModel {
  const model =
    'visibleMessages' in modelOrInput
      ? modelOrInput
      : createConversationFlow(modelOrInput);

  const renderItems: ConversationRenderItem[] = model.visibleMessages.map(
    (message, index) => {
      const isStreaming = isLastStreamingAssistantMessage(
        model.visibleMessages,
        model.isBusy,
        index,
      );

      return {
        message,
        index,
        isStreaming,
        isThinking:
          isStreaming &&
          !trimText(message.content) &&
          Boolean(trimText(message.thinkingContent)),
        hide: shouldHideAssistantPlaceholder(
          model.visibleMessages,
          model.isBusy,
          index,
        ),
      };
    },
  );

  const lastMessage = model.visibleMessages[model.visibleMessages.length - 1];
  const showTypingIndicator =
    model.isBusy &&
    lastMessage?.role === 'assistant' &&
    !trimText(lastMessage.content) &&
    !trimText(lastMessage.thinkingContent);

  return {
    messages: model.visibleMessages,
    renderItems,
    isGenerating: model.isBusy,
    showTypingIndicator,
    isSaved: model.isSaved,
    canSave: model.canSave,
  };
}

export function selectCompactConversationPillFlow(
  modelOrInput: ConversationFlowModel | ConversationFlowInput,
): CompactConversationPillFlowModel {
  const model =
    'visibleMessages' in modelOrInput
      ? modelOrInput
      : createConversationFlow(modelOrInput);

  return {
    status: model.status,
    displayText: model.compactDisplayText,
    tone: model.compactTone,
    showsLoadingDots: model.compactShowsLoadingDots,
    showsErrorDot: model.compactShowsErrorDot,
    showsIdleDot: model.compactShowsIdleDot,
    textColor: COMPACT_TEXT_COLORS[model.compactTone],
    indicatorBackground:
      COMPACT_INDICATOR_BACKGROUNDS[model.compactTone],
    indicatorBorder: COMPACT_INDICATOR_BORDERS[model.compactTone],
  };
}
