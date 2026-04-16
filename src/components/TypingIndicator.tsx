import { motion } from 'framer-motion';
import { PixelGridIndicator } from './PixelGridIndicator';

/**
 * Typing indicator shown before first AI token arrives.
 *
 * Uses PixelGridIndicator with wave-lr animation in cyan.
 */
export function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex w-full justify-start py-1"
      role="status"
      aria-label="AI is thinking"
    >
      <PixelGridIndicator type="loading" />
    </motion.div>
  );
}
