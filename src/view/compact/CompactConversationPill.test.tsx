import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CompactConversationPill } from './CompactConversationPill';
import type { Message } from '../../hooks/useAiChat';

function makeMessage(overrides: Partial<Message>): Message {
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

describe('CompactConversationPill', () => {
  it('shows Thinking... while generating without assistant text', () => {
    render(
      <CompactConversationPill
        messages={[makeMessage({ role: 'user', content: 'Summarize this' })]}
        isGenerating
      />,
    );

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('shows the latest assistant content preview', () => {
    render(
      <CompactConversationPill
        messages={[
          makeMessage({ role: 'assistant', content: 'Old answer' }),
          makeMessage({ role: 'user', content: 'Follow-up question' }),
          makeMessage({
            role: 'assistant',
            content: 'Latest answer with   extra\n\nspacing',
          }),
        ]}
        isGenerating={false}
      />,
    );

    expect(
      screen.getByText('Latest answer with extra spacing'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Old answer')).toBeNull();
  });

  it('falls back to thinking content when assistant content is empty', () => {
    render(
      <CompactConversationPill
        messages={[
          makeMessage({
            role: 'assistant',
            content: '',
            thinkingContent: 'Reasoning through the screenshot contents',
          }),
        ]}
        isGenerating
      />,
    );

    expect(
      screen.getByText('Reasoning through the screenshot contents'),
    ).toBeInTheDocument();
  });

  it('shows Open conversation when not generating and no assistant preview exists', () => {
    render(
      <CompactConversationPill
        messages={[makeMessage({ role: 'user', content: 'Hello' })]}
        isGenerating={false}
      />,
    );

    expect(screen.getByText('Open conversation')).toBeInTheDocument();
  });

  it('truncates long assistant previews with an ellipsis', () => {
    const longText =
      'This is a very long assistant response preview that should be truncated before the entire sentence is shown to the user in the pill';

    render(
      <CompactConversationPill
        messages={[makeMessage({ role: 'assistant', content: longText })]}
        isGenerating={false}
      />,
    );

    expect(
      screen.getByText(
        'This is a very long assistant response preview that should be truncated…',
      ),
    ).toBeInTheDocument();
  });

  it('calls onClick when clicked if onClick is provided', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CompactConversationPill
        messages={[makeMessage({ role: 'assistant', content: 'Hello' })]}
        isGenerating={false}
        onClick={onClick}
      />,
    );

    const pill = container.firstChild as HTMLElement;
    fireEvent.click(pill);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has pointer cursor when onClick is provided', () => {
    const onClick = vi.fn();
    const { container } = render(
      <CompactConversationPill
        messages={[makeMessage({ role: 'assistant', content: 'Hello' })]}
        isGenerating={false}
        onClick={onClick}
      />,
    );

    const pill = container.firstChild as HTMLElement;
    expect(pill.style.cursor).toBe('pointer');
    expect(pill.style.pointerEvents).toBe('auto');
  });

  it('has no pointer events when onClick is not provided', () => {
    const { container } = render(
      <CompactConversationPill
        messages={[makeMessage({ role: 'assistant', content: 'Hello' })]}
        isGenerating={false}
      />,
    );

    const pill = container.firstChild as HTMLElement;
    expect(pill.style.cursor).toBe('default');
    expect(pill.style.pointerEvents).toBe('none');
  });
});
