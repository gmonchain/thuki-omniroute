import { memo } from 'react';
import { motion } from 'framer-motion';
import type { Message } from '../../hooks/useAiChat';

interface CompactConversationPillProps {
  messages: Message[];
  isGenerating: boolean;
}

function getLatestAssistantMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i];
  }
  return undefined;
}

function toPreviewText(text: string, maxLength = 72): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

const LoadingDots = memo(function LoadingDots() {
  return (
    <div
      aria-hidden="true"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0.25, scale: 0.9 }}
          animate={{ opacity: [0.25, 0.95, 0.25], scale: [0.9, 1.05, 0.9] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.12,
          }}
          style={{
            width: 4,
            height: 4,
            borderRadius: 999,
            background: '#ff8d5c',
            display: 'block',
          }}
        />
      ))}
    </div>
  );
});

export const CompactConversationPill = memo(function CompactConversationPill({
  messages,
  isGenerating,
}: CompactConversationPillProps) {
  const latestAssistant = getLatestAssistantMessage(messages);
  const latestContent = latestAssistant?.content?.trim();
  const latestThinking = latestAssistant?.thinkingContent?.trim();

  const preview = latestContent || latestThinking || '';
  const displayText = preview
    ? toPreviewText(preview)
    : isGenerating
      ? 'Thinking...'
      : 'Open conversation';

  const statusTone = latestAssistant?.errorKind
    ? '#fca5a5'
    : isGenerating
      ? '#ffb089'
      : 'rgba(255,255,255,0.92)';

  return (
    <div
      style={{
        width: 384,
        height: 48,
        marginRight: 230,
        pointerEvents: 'none',
        display: 'grid',
        gridTemplateColumns: '44px minmax(0, 1fr) 44px',
        alignItems: 'center',
        padding: '0 8px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.09)',
        background:
          'linear-gradient(180deg, rgba(32,28,26,0.94) 0%, rgba(24,21,20,0.96) 100%)',
        boxShadow:
          '0 10px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Status dot */}
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: latestAssistant?.errorKind
              ? 'rgba(239,68,68,0.16)'
              : isGenerating
                ? 'rgba(255,141,92,0.16)'
                : 'rgba(255,255,255,0.08)',
            border: `1px solid ${
              latestAssistant?.errorKind
                ? 'rgba(239,68,68,0.28)'
                : isGenerating
                  ? 'rgba(255,141,92,0.22)'
                  : 'rgba(255,255,255,0.08)'
            }`,
          }}
        >
          {latestAssistant?.errorKind ? (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: '#ef4444',
              }}
            />
          ) : isGenerating ? (
            <LoadingDots />
          ) : (
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.7)',
              }}
            />
          )}
        </div>
      </div>

      {/* Preview text */}
      <span
        style={{
          display: 'block',
          width: '100%',
          fontSize: 13,
          lineHeight: 1.25,
          fontWeight: 500,
          color: statusTone,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          letterSpacing: '-0.08px',
          textAlign: 'center',
        }}
      >
        {displayText}
      </span>

      {/* Right spacer — keeps grid balanced */}
      <div aria-hidden="true" />
    </div>
  );
});
