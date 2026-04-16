/**
 * CommandSuggestion: slash command autocomplete popover.
 *
 * Renders above the ask bar when the user types a "/" prefix.
 * The parent (AskBarView) is responsible for computing `filteredCommands`
 * and managing `highlightedIndex`. This component is purely presentational.
 */

import type React from 'react';
import type { Command } from '../config/commands';

/** Hoisted static screen-capture SVG icon. */
const SCREEN_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect
      x="1"
      y="2"
      width="14"
      height="10"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path
      d="M5 14h6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M8 12v2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Brain icon for /think command. */
const THINK_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M8 13C7 13 5.5 12.5 4.5 11.5C3.5 10.5 2.5 9.5 2.5 7.5C2.5 5.5 3.5 4 5 3C6 2.5 7 2.5 8 3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <path
      d="M8 13C9 13 10.5 12.5 11.5 11.5C12.5 10.5 13.5 9.5 13.5 7.5C13.5 5.5 12.5 4 11 3C10 2.5 9 2.5 8 3"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <path
      d="M8 3.5V12.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <path
      d="M5 6.5C5.5 6 6 6 6.5 6.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <path
      d="M4.5 9.5C5 9 6 9 6.5 9.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <path
      d="M11 6.5C10.5 6 10 6 9.5 6.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
    <path
      d="M11.5 9.5C11 9 10 9 9.5 9.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    />
  </svg>
);

/** Globe icon for /translate command. */
const TRANSLATE_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
    <ellipse
      cx="8"
      cy="8"
      rx="3"
      ry="6.5"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

/** Pencil icon for /rewrite command. */
const REWRITE_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Lines icon for /tldr command. */
const TLDR_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M3 3h10M3 7h10M3 11h6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Sparkle icon for /refine command. */
const REFINE_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M8 1v3M8 12v3M1 8h3M12 8h3M3.5 3.5l2 2M10.5 10.5l2 2M12.5 3.5l-2 2M5.5 10.5l-2 2"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

/** Bullet list icon for /bullets command. */
const BULLETS_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="3" cy="4" r="1.2" fill="currentColor" />
    <circle cx="3" cy="8" r="1.2" fill="currentColor" />
    <circle cx="3" cy="12" r="1.2" fill="currentColor" />
    <path
      d="M6.5 4h7M6.5 8h7M6.5 12h7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Checkbox icon for /todos command. */
const ACTION_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect
      x="1.5"
      y="2"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path
      d="M3 4.5L4 5.5L6 3"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="1.5"
      y="9"
      width="5"
      height="5"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path
      d="M9 4.5h5.5M9 11.5h5.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Model icon for /model-related UI. */
const MODEL_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <ellipse
      cx="8"
      cy="3.5"
      rx="5.5"
      ry="2"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <path
      d="M2.5 3.5v4c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2.5 7.5v4c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Clock icon for /history command. */
const HISTORY_ICON = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M8 4.5V8L10.5 9.5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Delete icon shown on model rows. */
const DELETE_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M4 4L12 12M12 4L4 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Returns the icon for a given command trigger. */
function iconForTrigger(trigger: string): React.ReactNode {
  switch (trigger) {
    case '/screen':
      return SCREEN_ICON;
    case '/think':
      return THINK_ICON;
    case '/model':
    case '/add-model':
    case '/del-model':
      return MODEL_ICON;
    case '/history':
      return HISTORY_ICON;
    case '/translate':
      return TRANSLATE_ICON;
    case '/rewrite':
      return REWRITE_ICON;
    case '/tldr':
      return TLDR_ICON;
    case '/refine':
      return REFINE_ICON;
    case '/bullets':
      return BULLETS_ICON;
    case '/todos':
      return ACTION_ICON;
    default:
      return SCREEN_ICON;
  }
}

interface CommandSuggestionProps {
  /** Filtered list of matching commands to display (computed by parent). */
  commands?: readonly Command[];
  /** Optional runtime model items shown in the same suggestion popover UI. */
  models?: readonly string[];
  /** List of favorite model names (used to show star icon). */
  favoriteModels?: readonly string[];
  /** Index of the currently highlighted row (-1 means nothing highlighted). */
  highlightedIndex: number;
  /** Called with the selected trigger or model name when a row is clicked. */
  onSelect: (value: string) => void;
  /** Called when the user clicks the delete button on a model row. */
  onDeleteModel?: (model: string) => void;
  /** Called when the user clicks the star button on a model row. */
  onToggleFavorite?: (model: string) => void;
}

/**
 * Renders the slash command suggestion popover.
 *
 * When `commands` is empty, shows a "No commands found" placeholder row.
 * Otherwise renders one row per command with an icon, label, description,
 * and a Tab badge on the highlighted row.
 */
export function CommandSuggestion({
  commands = [],
  models,
  favoriteModels = [],
  highlightedIndex,
  onSelect,
  onDeleteModel,
  onToggleFavorite,
}: CommandSuggestionProps) {
  const isModelMode = models !== undefined;
  const listboxLabel = isModelMode
    ? 'Model suggestions'
    : 'Command suggestions';
  const headerLabel = isModelMode ? 'Models' : 'Commands';
  const emptyLabel = isModelMode ? 'No models found' : 'No commands found';

  return (
    <div
      className="mb-1 rounded-xl border border-surface-border bg-surface-base backdrop-blur-2xl shadow-bar overflow-hidden"
      role="listbox"
      aria-label={listboxLabel}
    >
      {/* Header */}
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10px] font-semibold tracking-widest text-text-secondary uppercase">
          {headerLabel}
        </span>
      </div>

      {isModelMode ? (
        models.length === 0 ? (
          <div className="px-3 pb-2 text-sm text-text-secondary italic">
            {emptyLabel}
          </div>
        ) : (
          <ul
            className="pb-1 max-h-[112px] overflow-y-auto"
            role="presentation"
          >
            {models.map((model, index) => {
              const isHighlighted = index === highlightedIndex;
              const isFavorite = favoriteModels.includes(model);
              return (
                <li
                  key={model}
                  role="option"
                  aria-selected={isHighlighted}
                  className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none transition-colors duration-100 ${
                    isHighlighted
                      ? 'bg-white/8 text-text-primary'
                      : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(model);
                  }}
                >
                  <span
                    className={`shrink-0 ${isHighlighted ? 'text-primary' : ''}`}
                  >
                    {MODEL_ICON}
                  </span>

                  <span className="text-sm font-medium text-text-primary min-w-0 truncate flex-1">
                    {model}
                  </span>

                  {onToggleFavorite && (
                    <button
                      type="button"
                      aria-label={
                        isFavorite ? `Unfavorite ${model}` : `Favorite ${model}`
                      }
                      className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-md transition-colors duration-100 ${
                        isFavorite
                          ? 'text-yellow-400 hover:bg-yellow-500/10'
                          : 'text-text-secondary hover:bg-white/5 hover:text-yellow-400'
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleFavorite(model);
                      }}
                    >
                      {isFavorite ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-4 h-4"
                        >
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      )}
                    </button>
                  )}

                  {onDeleteModel && (
                    <button
                      type="button"
                      aria-label={`Delete ${model}`}
                      className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-text-secondary hover:bg-red-500/10 hover:text-red-400 transition-colors duration-100"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteModel(model);
                      }}
                    >
                      {DELETE_ICON}
                    </button>
                  )}

                  {isHighlighted && (
                    <span className="shrink-0 text-[10px] font-medium text-text-secondary border border-surface-border rounded px-1 py-0.5 leading-none">
                      Tab
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : commands.length === 0 ? (
        <div className="px-3 pb-2 text-sm text-text-secondary italic">
          {emptyLabel}
        </div>
      ) : (
        <ul className="pb-1 max-h-[112px] overflow-y-auto" role="presentation">
          {commands.map((cmd, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <li
                key={cmd.trigger}
                role="option"
                aria-selected={isHighlighted}
                className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none transition-colors duration-100 ${
                  isHighlighted
                    ? 'bg-white/8 text-text-primary'
                    : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                }`}
                onMouseDown={(e) => {
                  // Use mousedown + preventDefault so the textarea doesn't lose
                  // focus before the click is registered.
                  e.preventDefault();
                  onSelect(cmd.trigger);
                }}
              >
                {/* Icon */}
                <span
                  className={`shrink-0 ${isHighlighted ? 'text-primary' : ''}`}
                >
                  {iconForTrigger(cmd.trigger)}
                </span>

                {/* Trigger label */}
                <span className="text-sm font-medium text-text-primary shrink-0">
                  {cmd.label}
                </span>

                {/* Description */}
                <span className="text-xs text-text-secondary min-w-0 truncate flex-1">
                  {cmd.description}
                </span>

                {/* Tab badge on highlighted row only */}
                {isHighlighted && (
                  <span className="shrink-0 text-[10px] font-medium text-text-secondary border border-surface-border rounded px-1 py-0.5 leading-none">
                    Tab
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
