import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Message } from '../../hooks/useAiChat';
import { selectCompactConversationPillFlow } from '../conversationFlow';
import { PixelGridIndicator } from '../../components/PixelGridIndicator';

interface CompactConversationPillProps {
  messages: Message[];
  isGenerating: boolean;
  onClick?: () => void;
}

export const CompactConversationPill = memo(function CompactConversationPill({
  messages,
  isGenerating,
  onClick,
}: CompactConversationPillProps) {
  const [shouldFade, setShouldFade] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldFade(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  const flow = selectCompactConversationPillFlow({
    messages,
    isGenerating,
  });

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{
        width: shouldFade ? 45 : 290,
        opacity: shouldFade ? 0.4 : 1,
        transition: {
          type: 'spring',
          stiffness: 300,
          damping: 25,
          duration: shouldFade ? 0.8 : 0.4,
        },
      }}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      onClick={onClick}
      style={{
        height: 45,
        marginRight: 230,
        pointerEvents: onClick ? 'auto' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        display: 'grid',
        gridTemplateColumns: shouldFade ? '1fr' : '44px minmax(0, 1fr) 32px',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 8px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.09)',
        background:
          'linear-gradient(180deg, rgba(32,28,26,0.94) 0%, rgba(24,21,20,0.96) 100%)',
        boxShadow:
          '0 10px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        overflow: 'hidden',
      }}
    >
      {/* Status indicator */}
      <motion.div
        aria-hidden="true"
        animate={{
          opacity: 1,
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {flow.showsErrorDot ? (
          <PixelGridIndicator type="error" />
        ) : flow.showsLoadingDots ? (
          <PixelGridIndicator type="loading" />
        ) : (
          <PixelGridIndicator type="idle" />
        )}
      </motion.div>

      {/* Preview text */}
      {!shouldFade && (
        <motion.span
          initial={{ opacity: 1 }}
          animate={{ opacity: shouldFade ? 0 : 1 }}
          transition={{ duration: 0.4 }}
          style={{
            display: 'block',
            width: '100%',
            fontSize: 12.5,
            lineHeight: 1.25,
            fontWeight: 500,
            color: flow.textColor,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '-0.08px',
            textAlign: 'center',
          }}
        >
          {flow.displayText}
        </motion.span>
      )}

      {/* Right icon */}
      {!shouldFade && (
        <motion.div
          initial={{ opacity: 0.5 }}
          animate={{ opacity: shouldFade ? 0 : 0.5 }}
          transition={{ duration: 0.4 }}
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
          >
            <g fill="none" fillRule="evenodd">
              <path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
              <path
                fill="currentColor"
                d="M16.06 10.94a1.5 1.5 0 0 1 0 2.12l-5.656 5.658a1.5 1.5 0 1 1-2.121-2.122L12.879 12L8.283 7.404a1.5 1.5 0 0 1 2.12-2.122l5.658 5.657Z"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              />
            </g>
          </svg>
        </motion.div>
      )}
    </motion.div>
  );
});
