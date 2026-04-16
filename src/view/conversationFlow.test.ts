import { describe, it, expect } from 'vitest';
import type { Message } from '../hooks/useAiChat';
import type { AttachedImage } from '../types/image';
import {
  createConversationFlow,
  getLatestAssistantMessage,
  getLatestUserMessage,
  getVisibleConversationMessages,
  selectAskBarFlow,
  selectCompactConversationPillFlow,
  selectConversationFlow,
  toPreviewText,
} from './conversationFlow';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? '',
    quotedText: overrides.quotedText,
    imagePaths: overrides.imagePaths,
    errorKind: overrides.errorKind,
    thinkingContent: overrides.thinkingContent,
  };
}

function makeImage(overrides: Partial<AttachedImage> = {}): AttachedImage {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    blobUrl: overrides.blobUrl ?? 'blob:http://localhost/test-image',
    filePath: overrides.filePath ?? '/tmp/test-image.png',
  };
}

describe('conversationFlow', () => {
  it('appends pending user message to visible conversation messages', () => {
    const messages = [
      makeMessage({ id: 'u1', role: 'user', content: 'First' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'Reply' }),
    ];
    const pendingUserMessage = makeMessage({
      id: 'u2',
      role: 'user',
      content: 'Pending follow-up',
    });

    const visible = getVisibleConversationMessages(messages, pendingUserMessage);

    expect(visible).toHaveLength(3);
    expect(visible[2]).toEqual(pendingUserMessage);
  });

  it('finds the latest assistant and latest user message from the end of the thread', () => {
    const messages = [
      makeMessage({ id: 'u1', role: 'user', content: 'First user' }),
      makeMessage({ id: 'a1', role: 'assistant', content: 'First assistant' }),
      makeMessage({ id: 'u2', role: 'user', content: 'Latest user' }),
      makeMessage({ id: 'a2', role: 'assistant', content: 'Latest assistant' }),
    ];

    expect(getLatestUserMessage(messages)?.id).toBe('u2');
    expect(getLatestAssistantMessage(messages)?.id).toBe('a2');
  });

  it('normalizes and truncates preview text', () => {
    const result = toPreviewText(
      'This is a very long assistant response preview that should be truncated before the entire sentence is shown to the user in the compact pill',
    );

    expect(result).toBe(
      'This is a very long assistant response preview that should be truncated…',
    );
  });

  it('derives draft state for ask-bar composition before any message is sent', () => {
    const flow = createConversationFlow({
      messages: [],
      query: '  draft question  ',
      attachedImages: [makeImage()],
      isGenerating: false,
      isSubmitPending: false,
      selectedText: 'selected host app text',
      modelOptions: ['model-a', 'model-b'],
      selectedModel: 'model-b',
    });

    expect(flow.status).toBe('draft');
    expect(flow.hasDraft).toBe(true);
    expect(flow.hasDraftText).toBe(true);
    expect(flow.hasAttachedImages).toBe(true);
    expect(flow.canSubmit).toBe(true);
    expect(flow.canCancel).toBe(false);
    expect(flow.isChatMode).toBe(false);
    expect(flow.askBarPlaceholder).toBe('Ask Thuki anything...');
    expect(flow.selectedText).toBe('selected host app text');
    expect(flow.selectedModel).toBe('model-b');
  });

  it('derives submitting state and keeps pending user message visible during deferred submit', () => {
    const pendingUserMessage = makeMessage({
      id: 'pending-user',
      role: 'user',
      content: 'Send this after image staging',
    });

    const flow = createConversationFlow({
      messages: [],
      pendingUserMessage,
      query: '',
      isGenerating: false,
      isSubmitPending: true,
    });

    expect(flow.status).toBe('submitting');
    expect(flow.isBusy).toBe(true);
    expect(flow.isChatMode).toBe(true);
    expect(flow.canSubmit).toBe(false);
    expect(flow.canCancel).toBe(true);
    expect(flow.visibleMessages).toEqual([pendingUserMessage]);
    expect(flow.compactDisplayText).toBe('Thinking...');
  });

  it('derives thinking status when assistant has reasoning content but no final content yet', () => {
    const flow = createConversationFlow({
      messages: [
        makeMessage({ role: 'user', content: 'Explain this screenshot' }),
        makeMessage({
          role: 'assistant',
          content: '',
          thinkingContent: 'Analyzing the screenshot structure',
        }),
      ],
      isGenerating: true,
      isSubmitPending: false,
    });

    expect(flow.status).toBe('thinking');
    expect(flow.latestAssistantThinking).toBe(
      'Analyzing the screenshot structure',
    );
    expect(flow.latestAssistantPreview).toBe(
      'Analyzing the screenshot structure',
    );
    expect(flow.compactTone).toBe('busy');
  });

  it('derives ready state after generation completes with an assistant response', () => {
    const flow = createConversationFlow({
      messages: [
        makeMessage({ role: 'user', content: 'Hello' }),
        makeMessage({ role: 'assistant', content: 'Hi there' }),
      ],
      isGenerating: false,
      isSubmitPending: false,
      canSave: true,
      isSaved: false,
    });

    expect(flow.status).toBe('ready');
    expect(flow.hasAssistantResponse).toBe(true);
    expect(flow.canSave).toBe(true);
    expect(flow.compactDisplayText).toBe('Hi there');
  });

  it('derives error state when the latest assistant message is an error', () => {
    const flow = createConversationFlow({
      messages: [
        makeMessage({ role: 'user', content: 'Use missing model' }),
        makeMessage({
          role: 'assistant',
          content: 'Requested model could not be found.',
          errorKind: 'ModelNotFound',
        }),
      ],
      isGenerating: false,
      isSubmitPending: false,
    });

    expect(flow.status).toBe('error');
    expect(flow.latestAssistantHasError).toBe(true);
    expect(flow.compactTone).toBe('error');
  });

  it('selectAskBarFlow exposes shared ask-bar state from the canonical flow model', () => {
    const askBar = selectAskBarFlow({
      messages: [makeMessage({ role: 'user', content: 'Existing thread' })],
      query: 'reply draft',
      attachedImages: [],
      isGenerating: true,
      isSubmitPending: false,
      selectedText: 'quoted text',
      selectedModel: 'model-x',
      modelOptions: ['model-x'],
    });

    expect(askBar.isChatMode).toBe(true);
    expect(askBar.isBusy).toBe(true);
    expect(askBar.canSubmit).toBe(false);
    expect(askBar.canCancel).toBe(true);
    expect(askBar.placeholder).toBe('Reply...');
    expect(askBar.actionButtonLabel).toBe('Stop generating');
    expect(askBar.selectedText).toBe('quoted text');
    expect(askBar.selectedModel).toBe('model-x');
  });

  it('selectConversationFlow hides empty assistant placeholder and shows typing indicator while streaming', () => {
    const conversation = selectConversationFlow({
      messages: [
        makeMessage({ id: 'u1', role: 'user', content: 'Tell me something' }),
        makeMessage({ id: 'a1', role: 'assistant', content: '' }),
      ],
      isGenerating: true,
      isSubmitPending: false,
    });

    expect(conversation.messages).toHaveLength(2);
    expect(conversation.isGenerating).toBe(true);
    expect(conversation.showTypingIndicator).toBe(true);
    expect(conversation.renderItems).toHaveLength(2);

    const assistantItem = conversation.renderItems[1];
    expect(assistantItem.message.id).toBe('a1');
    expect(assistantItem.isStreaming).toBe(true);
    expect(assistantItem.isThinking).toBe(false);
    expect(assistantItem.hide).toBe(true);
  });

  it('selectConversationFlow keeps thinking assistant bubble visible instead of replacing it with typing indicator', () => {
    const conversation = selectConversationFlow({
      messages: [
        makeMessage({ role: 'user', content: 'Solve this' }),
        makeMessage({
          id: 'assistant-thinking',
          role: 'assistant',
          content: '',
          thinkingContent: 'Reasoning through the steps',
        }),
      ],
      isGenerating: true,
      isSubmitPending: false,
    });

    const assistantItem = conversation.renderItems[1];

    expect(conversation.showTypingIndicator).toBe(false);
    expect(assistantItem.isStreaming).toBe(true);
    expect(assistantItem.isThinking).toBe(true);
    expect(assistantItem.hide).toBe(false);
  });

  it('selectCompactConversationPillFlow uses normalized latest assistant preview when idle', () => {
    const compact = selectCompactConversationPillFlow({
      messages: [
        makeMessage({ role: 'assistant', content: 'Old answer' }),
        makeMessage({ role: 'user', content: 'Follow up' }),
        makeMessage({
          role: 'assistant',
          content: 'Latest answer with   extra\n\nspacing',
        }),
      ],
      isGenerating: false,
      isSubmitPending: false,
    });

    expect(compact.status).toBe('ready');
    expect(compact.displayText).toBe('Latest answer with extra spacing');
    expect(compact.tone).toBe('neutral');
    expect(compact.showsIdleDot).toBe(true);
    expect(compact.showsLoadingDots).toBe(false);
    expect(compact.showsErrorDot).toBe(false);
    expect(compact.textColor).toBe('rgba(255,255,255,0.92)');
  });

  it('selectCompactConversationPillFlow shows error styling from the shared flow state', () => {
    const compact = selectCompactConversationPillFlow({
      messages: [
        makeMessage({ role: 'user', content: 'Use unavailable model' }),
        makeMessage({
          role: 'assistant',
          content: 'Model is unavailable.',
          errorKind: 'NotRunning',
        }),
      ],
      isGenerating: false,
      isSubmitPending: false,
    });

    expect(compact.status).toBe('error');
    expect(compact.tone).toBe('error');
    expect(compact.showsErrorDot).toBe(true);
    expect(compact.showsLoadingDots).toBe(false);
    expect(compact.showsIdleDot).toBe(false);
    expect(compact.textColor).toBe('#fca5a5');
    expect(compact.indicatorBackground).toBe('rgba(239,68,68,0.16)');
    expect(compact.indicatorBorder).toBe('rgba(239,68,68,0.28)');
  });
});
