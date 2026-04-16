import { AnimatePresence, motion } from 'framer-motion';
import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  KeyboardEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandSuggestion } from '../components/CommandSuggestion';
import { ImageThumbnails } from '../components/ImageThumbnails';
import { Tooltip } from '../components/Tooltip';
import { quote } from '../config';
import { COMMANDS } from '../config/commands';
import { MAX_IMAGE_SIZE_BYTES } from '../types/image';
import type { AttachedImage } from '../types/image';
import { formatQuotedText } from '../utils/formatQuote';
import { selectAskBarFlow } from './conversationFlow';

/**
 * Hoisted static SVG — prevents re-allocation on every render cycle.
 * @see Vercel React Best Practices §6.3 — Hoist Static JSX Elements
 */
const ARROW_UP_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M8 13V3M8 3L3 8M8 3L13 8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Hoisted static SVG — square stop icon displayed during active generation. */
const STOP_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
  </svg>
);

/**
 * SVG overlay that traces a glowing comet-tail along the button's border.
 * Uses `pathLength="100"` so dash math is in clean percentages regardless
 * of the actual rect perimeter.
 */
const BORDER_TRACE_RING = (
  <svg
    className="stop-ring-svg"
    viewBox="0 0 40 40"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect
      className="stop-trace-tail"
      x="1"
      y="1"
      width="38"
      height="38"
      rx="19"
      pathLength="100"
    />
    <rect
      className="stop-trace-mid"
      x="1"
      y="1"
      width="38"
      height="38"
      rx="19"
      pathLength="100"
    />
    <rect
      className="stop-trace-head"
      x="1"
      y="1"
      width="38"
      height="38"
      rx="19"
      pathLength="100"
    />
  </svg>
);

const DEFAULT_MODEL_OPTIONS = [
  'qw/qwen3-coder-plus',
  'qw/vision-model',
  'kr/claude-haiku-4.5',
  'cx/gpt-5.4-mini',
  'cx/gpt-5.2',
] as const;

/**
 * Renders text with command triggers highlighted in violet for the mirror div.
 * Only the first occurrence of each command is highlighted; duplicates render plain.
 */
export function renderHighlightedText(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  const highlighted = new Set<string>();

  while (remaining.length > 0) {
    let earliest = -1;
    let matchedTrigger = '';

    for (const cmd of COMMANDS) {
      if (highlighted.has(cmd.trigger)) continue;

      const idx = remaining.indexOf(cmd.trigger);
      if (idx === -1) continue;

      const before = idx === 0 || remaining[idx - 1] === ' ';
      const after =
        idx + cmd.trigger.length >= remaining.length ||
        remaining[idx + cmd.trigger.length] === ' ';

      if (before && after && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        matchedTrigger = cmd.trigger;
      }
    }

    if (earliest === -1) {
      parts.push(<span key={parts.length}>{remaining}</span>);
      break;
    }

    if (earliest > 0) {
      parts.push(
        <span key={parts.length}>{remaining.slice(0, earliest)}</span>,
      );
    }

    parts.push(
      <span key={parts.length} className="text-violet-400">
        {matchedTrigger}
      </span>,
    );

    highlighted.add(matchedTrigger);
    remaining = remaining.slice(earliest + matchedTrigger.length);
  }

  return <>{parts}</>;
}

/**
 * Maximum number of manually attached images per message. The backend allows
 * one additional image from /screen capture, for a total of 4 per message
 * (MAX_IMAGES_PER_MESSAGE in images.rs).
 */
export const MAX_IMAGES = 3;

interface AskBarViewProps {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  isChatMode: boolean;
  isGenerating: boolean;
  isSubmitPending?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  selectedText?: string;
  onHistoryOpen?: () => void;
  attachedImages: AttachedImage[];
  onImagesAttached: (files: File[]) => void;
  onImageRemove: (id: string) => void;
  onImagePreview: (id: string) => void;
  onScreenshot: () => void;
  selectedModel?: string;
  modelOptions?: readonly string[];
  onModelChange?: (model: string) => void;
  onModelDelete?: (model: string) => void;
  isDragOver?: 'normal' | 'max';
}

/**
 * Renders the persistent bottom input bar of the application.
 *
 * Window dragging is handled by the application root container via event
 * bubbling — mousedown events from this component propagate up naturally.
 */
export function AskBarView({
  query,
  setQuery,
  isChatMode,
  isGenerating,
  isSubmitPending = false,
  onSubmit,
  onCancel,
  inputRef,
  selectedText,
  attachedImages,
  onImagesAttached,
  onImageRemove,
  onImagePreview,
  onScreenshot,
  selectedModel,
  modelOptions = DEFAULT_MODEL_OPTIONS,
  onModelChange,
  onModelDelete,
  isDragOver,
}: AskBarViewProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  const safeModelOptions = modelOptions.length
    ? modelOptions
    : DEFAULT_MODEL_OPTIONS;

  const flow = useMemo(
    () =>
      selectAskBarFlow({
        messages: [],
        query,
        selectedText,
        attachedImages,
        isGenerating,
        isSubmitPending,
        isChatMode,
        selectedModel,
        modelOptions: safeModelOptions,
      }),
    [
      query,
      selectedText,
      attachedImages,
      isGenerating,
      isSubmitPending,
      isChatMode,
      selectedModel,
      safeModelOptions,
    ],
  );

  const initialModel =
    flow.selectedModel ??
    flow.modelOptions[0] ??
    DEFAULT_MODEL_OPTIONS[0] ??
    '';

  const isBusy = flow.isBusy;
  const canSubmit = flow.canSubmit;

  const [pasteMaxError, setPasteMaxError] = useState(false);
  const [internalSelectedModel, setInternalSelectedModel] =
    useState(initialModel);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dismissedQuery, setDismissedQuery] = useState('');

  useEffect(() => {
    if (!pasteMaxError) return;

    const timer = window.setTimeout(() => {
      setPasteMaxError(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [pasteMaxError]);

  useEffect(() => {
    if (!selectedModel) return;
    setInternalSelectedModel((prev) =>
      prev === selectedModel ? prev : selectedModel,
    );
  }, [selectedModel]);

  useEffect(() => {
    if (selectedModel) return;
    if (!safeModelOptions.includes(internalSelectedModel)) {
      setInternalSelectedModel(safeModelOptions[0] ?? '');
    }
  }, [safeModelOptions, internalSelectedModel, selectedModel]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [query, inputRef]);

  const rawQuery = query.trimStart();

  const modelSuggestionMatch = useMemo(
    () => rawQuery.match(/^\/model(?:\s+(.*))?$/),
    [rawQuery],
  );

  const lastSlashWord = useMemo(() => {
    const match = rawQuery.match(/(?:^|\s)(\/\S*)$/);
    return match ? match[1] : '';
  }, [rawQuery]);

  const showModelSuggestions =
    !isBusy && modelSuggestionMatch !== null && rawQuery !== dismissedQuery;

  const modelFilter = (modelSuggestionMatch?.[1] ?? '').trim().toLowerCase();

  const showSuggestions =
    !showModelSuggestions &&
    !isBusy &&
    lastSlashWord.length > 0 &&
    lastSlashWord !== dismissedQuery;

  const commandPrefix = showSuggestions ? lastSlashWord : '';

  const usedCommands = useMemo(() => {
    const textBeforeSlash = rawQuery.slice(
      0,
      rawQuery.length - lastSlashWord.length,
    );

    return new Set(
      COMMANDS.filter((cmd) => {
        const idx = textBeforeSlash.indexOf(cmd.trigger);
        if (idx === -1) return false;

        const before = idx === 0 || textBeforeSlash[idx - 1] === ' ';
        const after =
          idx + cmd.trigger.length >= textBeforeSlash.length ||
          textBeforeSlash[idx + cmd.trigger.length] === ' ';

        return before && after;
      }).map((cmd) => cmd.trigger),
    );
  }, [rawQuery, lastSlashWord]);

  const filteredCommands = useMemo(
    () =>
      showSuggestions
        ? COMMANDS.filter(
            (cmd) =>
              cmd.trigger.startsWith(commandPrefix) &&
              !usedCommands.has(cmd.trigger),
          )
        : [],
    [showSuggestions, commandPrefix, usedCommands],
  );

  const filteredModels = useMemo(
    () =>
      showModelSuggestions
        ? safeModelOptions.filter((model) =>
            model.toLowerCase().includes(modelFilter),
          )
        : [],
    [showModelSuggestions, safeModelOptions, modelFilter],
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [commandPrefix, modelFilter, showModelSuggestions]);

  const handleCommandSelect = useCallback(
    (trigger: string) => {
      setDismissedQuery('');
      setHighlightedIndex(0);

      const beforeSlash = rawQuery.slice(
        0,
        rawQuery.length - lastSlashWord.length,
      );

      setQuery(beforeSlash + trigger + ' ');
    },
    [setQuery, rawQuery, lastSlashWord],
  );

  const handleModelSuggestionSelect = useCallback(
    (model: string) => {
      setDismissedQuery('');
      setHighlightedIndex(0);
      setInternalSelectedModel(model);
      onModelChange?.(model);
      setQuery('');
    },
    [onModelChange, setQuery],
  );

  const handleModelSuggestionDelete = useCallback(
    (model: string) => {
      onModelDelete?.(model);
    },
    [onModelDelete],
  );

  const handleTextareaChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setDismissedQuery('');
      setQuery(newValue);

      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
    },
    [setQuery],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showModelSuggestions) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (filteredModels.length > 0) {
            setHighlightedIndex((i) => (i + 1) % filteredModels.length);
          }
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (filteredModels.length > 0) {
            setHighlightedIndex(
              (i) => (i - 1 + filteredModels.length) % filteredModels.length,
            );
          }
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          if (filteredModels.length > 0) {
            const idx = Math.min(highlightedIndex, filteredModels.length - 1);
            handleModelSuggestionSelect(filteredModels[idx]);
          }
          return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (filteredModels.length > 0) {
            const idx = Math.min(highlightedIndex, filteredModels.length - 1);
            handleModelSuggestionSelect(filteredModels[idx]);
          }
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          setDismissedQuery(rawQuery);
          return;
        }
      }

      if (showSuggestions) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (filteredCommands.length > 0) {
            setHighlightedIndex((i) => (i + 1) % filteredCommands.length);
          }
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (filteredCommands.length > 0) {
            setHighlightedIndex(
              (i) =>
                (i - 1 + filteredCommands.length) % filteredCommands.length,
            );
          }
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          if (filteredCommands.length > 0) {
            const idx = Math.min(highlightedIndex, filteredCommands.length - 1);
            handleCommandSelect(filteredCommands[idx].trigger);
          }
          return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          if (
            filteredCommands.length > 0 &&
            highlightedIndex < filteredCommands.length
          ) {
            const selectedTrigger = filteredCommands[highlightedIndex].trigger;
            if (lastSlashWord !== selectedTrigger) {
              e.preventDefault();
              handleCommandSelect(selectedTrigger);
              return;
            }
          }
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          setDismissedQuery(lastSlashWord);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSubmit) {
          onSubmit();
        }
      }
    },
    [
      showModelSuggestions,
      filteredModels,
      highlightedIndex,
      handleModelSuggestionSelect,
      rawQuery,
      showSuggestions,
      filteredCommands,
      handleCommandSelect,
      lastSlashWord,
      canSubmit,
      onSubmit,
    ],
  );

  const handleTextareaScroll = useCallback(() => {
    if (!mirrorRef.current || !inputRef.current) return;
    mirrorRef.current.scrollTop = inputRef.current.scrollTop;
  }, [inputRef]);

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items || isBusy) return;

      const remaining = MAX_IMAGES - attachedImages.length;
      if (remaining <= 0) {
        const hasImageItem = Array.from(items).some((item) =>
          item.type.startsWith('image/'),
        );
        if (hasImageItem) setPasteMaxError(true);
        return;
      }

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length && imageFiles.length < remaining; i++) {
        if (!items[i].type.startsWith('image/')) continue;

        const file = items[i].getAsFile();
        if (file && file.size <= MAX_IMAGE_SIZE_BYTES) {
          imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return;

      e.preventDefault();
      onImagesAttached(imageFiles);
    },
    [isBusy, attachedImages.length, onImagesAttached],
  );

  const showMaxLabel = isDragOver === 'max' || (pasteMaxError && !isDragOver);
  const ringClass =
    isDragOver === 'max'
      ? 'ring-2 ring-red-500/60 ring-inset rounded-lg'
      : isDragOver === 'normal'
        ? 'ring-2 ring-primary/40 ring-inset rounded-lg'
        : '';

  const effectiveModel = flow.selectedModel ?? internalSelectedModel;

  const handleModelSelect = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const nextModel = e.target.value;
      setInternalSelectedModel(nextModel);
      onModelChange?.(nextModel);
    },
    [onModelChange],
  );

  return (
    <div className={`flex w-full shrink-0 flex-col ${ringClass}`}>
      {flow.selectedText && (
        <div className="px-4 pb-2.5 pt-2.5">
          <p className="select-text whitespace-pre-wrap text-xs italic text-text-secondary">
            &ldquo;
            {formatQuotedText(
              flow.selectedText,
              quote.maxDisplayLines,
              quote.maxDisplayChars,
            )}
            &rdquo;
          </p>
        </div>
      )}

      {showMaxLabel && (
        <p className="px-4 pb-2.5 pt-2.5 text-xs text-red-400">Max 3 images</p>
      )}

      {attachedImages.length > 0 && (
        <div className="px-4 pb-2.5 pt-2.5">
          <ImageThumbnails
            items={attachedImages.map((img) => ({
              id: img.id,
              src: img.blobUrl,
              loading: img.filePath === null,
            }))}
            onPreview={onImagePreview}
            onRemove={onImageRemove}
            size={56}
          />
        </div>
      )}

      <AnimatePresence>
        {(showSuggestions || showModelSuggestions) && (
          <motion.div
            key={
              showModelSuggestions ? 'model-suggestion' : 'command-suggestion'
            }
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0.15 },
            }}
            style={{ overflow: 'hidden' }}
          >
            {showModelSuggestions ? (
              <CommandSuggestion
                models={filteredModels}
                highlightedIndex={highlightedIndex}
                onSelect={handleModelSuggestionSelect}
                onDeleteModel={handleModelSuggestionDelete}
              />
            ) : (
              <CommandSuggestion
                commands={filteredCommands}
                highlightedIndex={highlightedIndex}
                onSelect={handleCommandSelect}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        <Tooltip label="Screenshot">
          <button
            type="button"
            onClick={onScreenshot}
            disabled={isBusy || attachedImages.length >= MAX_IMAGES}
            aria-label="Take screenshot"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary outline-none transition-colors duration-150 hover:bg-white/8 hover:text-text-primary disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="13"
                r="4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </Tooltip>

        <div className="relative min-w-0 flex-1">
          <div
            ref={mirrorRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden bg-transparent px-2 py-2.5 text-sm leading-relaxed text-text-primary whitespace-pre-wrap wrap-break-word"
          >
            {renderHighlightedText(query)}
          </div>

          <textarea
            ref={inputRef}
            value={query}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onScroll={handleTextareaScroll}
            disabled={isBusy}
            autoFocus
            rows={1}
            placeholder={flow.placeholder}
            className="relative w-full resize-none border-none bg-transparent px-2 pt-2 pb-0 text-sm leading-relaxed text-transparent outline-none placeholder:text-text-secondary disabled:opacity-50"
            style={{ caretColor: 'var(--color-text-primary)' }}
          />
        </div>

        <div className="max-w-35 min-w-35 shrink-0">
          <label htmlFor="askbar-model-select" className="sr-only">
            Select model
          </label>
          <select
            id="askbar-model-select"
            value={effectiveModel}
            onChange={handleModelSelect}
            disabled={isBusy}
            aria-label="Select model"
            className="h-9 w-full rounded-lg border border-surface-border bg-surface-elevated px-3 text-xs text-text-primary outline-none transition-colors duration-150 disabled:cursor-default disabled:opacity-40"
          >
            {safeModelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <motion.button
          type="button"
          onClick={flow.canCancel ? onCancel : onSubmit}
          disabled={!canSubmit && !flow.canCancel}
          whileHover={canSubmit || flow.canCancel ? { scale: 1.08 } : undefined}
          whileTap={canSubmit || flow.canCancel ? { scale: 0.92 } : undefined}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
            flow.canCancel
              ? 'stop-btn-ring cursor-pointer bg-red-500/10 text-red-400'
              : canSubmit
                ? 'cursor-pointer bg-primary text-neutral'
                : 'cursor-default bg-surface-elevated text-text-secondary'
          }`}
          aria-label={flow.actionButtonLabel}
        >
          {flow.canCancel ? (
            <>
              {BORDER_TRACE_RING}
              {STOP_ICON}
            </>
          ) : (
            ARROW_UP_ICON
          )}
        </motion.button>
      </div>
    </div>
  );
}
