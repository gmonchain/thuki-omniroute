import { motion } from 'framer-motion';
import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import thukiLogo from '../../../src-tauri/icons/128x128.png';

/** How often to poll for permission grants after the user requests them. */
const POLL_INTERVAL_MS = 500;

type AccessibilityStatus = 'pending' | 'requesting' | 'granted';
type ScreenRecordingStatus = 'idle' | 'settings-opened';

/** Inline macOS-style keyboard key chip for showing hotkey symbols. */
const KeyChip = ({ label }: { label: string }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1px 5px',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderBottom: '2px solid rgba(255,255,255,0.12)',
      borderRadius: 4,
      fontSize: 11,
      lineHeight: 1.4,
      color: 'rgba(255,255,255,0.75)',
      verticalAlign: 'middle',
      margin: '0 1px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}
  >
    {label}
  </span>
);

/** Checkmark icon for the granted step state. */
const CheckIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M4 9l3.5 3.5 7-7"
      stroke="#22c55e"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Keyboard/accessibility icon for the active step 1. */
const KeyboardIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    aria-hidden="true"
  >
    <rect
      x="2"
      y="4"
      width="14"
      height="10"
      rx="2"
      stroke="#ff8d5c"
      strokeWidth="1.5"
    />
    <path
      d="M5 8h1M8 8h1M11 8h1M5 11h8"
      stroke="#ff8d5c"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Screen/camera icon for step 2. */
const ScreenIcon = ({ active }: { active: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    aria-hidden="true"
  >
    <rect
      x="2"
      y="5"
      width="14"
      height="9"
      rx="2"
      stroke={active ? '#ff8d5c' : '#6b6660'}
      strokeWidth="1.5"
    />
    <circle cx="9" cy="9.5" r="2" fill={active ? '#ff8d5c' : '#6b6660'} />
    <circle
      cx="9"
      cy="9.5"
      r="3.5"
      stroke={active ? '#ff8d5c' : '#6b6660'}
      strokeWidth="0.8"
      opacity="0.4"
    />
  </svg>
);

/** Minimal animated spinner. */
const Spinner = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-label="Checking..."
    style={{ animation: 'spin 0.8s linear infinite' }}
  >
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke="rgba(255,255,255,0.2)"
      strokeWidth="2"
    />
    <path
      d="M8 2a6 6 0 0 1 6 6"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Onboarding screen shown at first launch when required macOS permissions
 * (Accessibility and Screen Recording) have not yet been granted.
 *
 * Follows a sequential flow: Accessibility first (polls until granted,
 * no restart needed), then Screen Recording (registers the app via
 * CGRequestScreenCaptureAccess, opens System Settings, and lets the user
 * continue manually once the permission has been enabled).
 *
 * Visual direction: Warm Ambient: dark base with a warm orange radial glow.
 * The outer container is transparent so the rounded panel corners are visible
 * against the macOS desktop.
 */
interface PermissionsStepProps {
  onNext?: () => void;
}

export function PermissionsStep({ onNext }: PermissionsStepProps) {
  const [accessibilityStatus, setAccessibilityStatus] =
    useState<AccessibilityStatus>('pending');
  const [screenRecordingStatus, setScreenRecordingStatus] =
    useState<ScreenRecordingStatus>('idle');
  const axPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards that prevent a new poll tick from firing while a previous invoke
  // call is still in-flight. Without these, a slow IPC response (> POLL_INTERVAL_MS)
  // could queue multiple concurrent permission checks.
  const axInFlightRef = useRef(false);
  // Prevents state updates from resolving in-flight invocations after unmount.
  const mountedRef = useRef(true);

  const stopAxPolling = useCallback(() => {
    if (axPollRef.current !== null) {
      clearInterval(axPollRef.current);
      axPollRef.current = null;
    }
  }, []);

  // On mount: check whether Accessibility is already granted so we can skip
  // step 1 and show step 2 immediately.
  useEffect(() => {
    // Reset on every mount so that a remount after unmount gets a fresh guard.
    mountedRef.current = true;
    void invoke<boolean>('check_accessibility_permission').then((granted) => {
      if (!mountedRef.current) return;
      if (granted) {
        setAccessibilityStatus('granted');
      }
    });
    return () => {
      mountedRef.current = false;
      stopAxPolling();
    };
  }, [stopAxPolling]);

  const handleGrantAccessibility = useCallback(async () => {
    setAccessibilityStatus('requesting');
    await invoke('open_accessibility_settings');
    axPollRef.current = setInterval(async () => {
      if (axInFlightRef.current) return;
      axInFlightRef.current = true;
      try {
        const granted = await invoke<boolean>('check_accessibility_permission');
        if (!mountedRef.current) return;
        if (granted) {
          stopAxPolling();
          setAccessibilityStatus('granted');
        }
      } finally {
        axInFlightRef.current = false;
      }
    }, POLL_INTERVAL_MS);
  }, [stopAxPolling]);

  const handleOpenScreenRecording = useCallback(async () => {
    // Register Thuki in TCC (adds it to the Screen Recording list) then open
    // System Settings directly so the user can toggle it on without hunting.
    // The registration call may briefly show a macOS system prompt on first use.
    await invoke('request_screen_recording_access');
    await invoke('open_screen_recording_settings');
    if (!mountedRef.current) return;
    setScreenRecordingStatus('settings-opened');
  }, []);

  const handleContinue = useCallback(() => {
    onNext?.();
  }, [onNext]);

  const accessibilityGranted = accessibilityStatus === 'granted';
  const isAxRequesting = accessibilityStatus === 'requesting';
  const hasOpenedScreenRecordingSettings =
    screenRecordingStatus === 'settings-opened';

  return (
    // Transparent outer container so the rounded panel corners show through
    // against the macOS desktop (window has transparent: true in tauri.conf.json).
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        style={{
          width: 420,
          background: 'var(--color-surface-elevated)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 24,
          padding: '32px 26px 26px',
          // Drop shadow handled by native macOS (set_has_shadow(true) in
          // show_onboarding_window). CSS provides the warm inner glow only.
          boxShadow: 'var(--shadow-chat)',
          position: 'relative',
          overflow: 'hidden',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* Top edge highlight */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background:
              'linear-gradient(90deg, transparent, var(--color-surface-border), transparent)',
          }}
        />

        {/* Logo mark + title, drag region so the user can reposition the
            onboarding window when it overlaps System Settings. */}
        <div
          data-tauri-drag-region
          style={{ textAlign: 'center', marginBottom: 18, cursor: 'grab' }}
        >
          <img
            src={thukiLogo}
            width={64}
            height={64}
            alt="Thuki"
            style={{
              objectFit: 'contain',
              pointerEvents: 'none',
              display: 'block',
              margin: '0 auto',
            }}
          />
        </div>

        {/* Title */}
        <h1
          style={{
            textAlign: 'center',
            fontSize: 22,
            fontWeight: 700,
            color: '#f0f0f2',
            letterSpacing: '-0.4px',
            lineHeight: 1.2,
            margin: '0 0 20px',
          }}
        >
          {"Let's get Thuki set up"}
        </h1>

        {/* Steps */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 20,
          }}
        >
          {/* Step 1: Accessibility */}
          <StepCard active={!accessibilityGranted} done={accessibilityGranted}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: accessibilityGranted
                  ? 'rgba(34,197,94,0.12)'
                  : 'rgba(100, 100, 100, 0.12)',
                border: `1px solid ${accessibilityGranted ? 'rgba(34,197,94,0.2)' : 'var(--color-surface-border)'}`,
              }}
            >
              {accessibilityGranted ? <CheckIcon /> : <KeyboardIcon />}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#f0f0f2',
                  marginBottom: 2,
                }}
              >
                Accessibility
              </div>
              <div style={{ fontSize: 12, color: '#6b6660', lineHeight: 1.5 }}>
                Lets Thuki respond to activator key (<KeyChip label="⌃" />
                <KeyChip label="⌃" />)
              </div>
            </div>
            {accessibilityGranted && (
              <div style={{ flexShrink: 0 }}>
                <Badge color="green">Granted</Badge>
              </div>
            )}
          </StepCard>

          {/* Step 2: Screen Recording */}
          <StepCard
            active={accessibilityGranted}
            done={hasOpenedScreenRecordingSettings}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: accessibilityGranted
                  ? 'rgba(100, 100, 100, 0.12)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${accessibilityGranted ? 'var(--color-surface-border)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <ScreenIcon active={accessibilityGranted} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: accessibilityGranted ? '#f0f0f2' : '#4a4a4e',
                  marginBottom: 2,
                }}
              >
                Screen Recording
              </div>
              <div style={{ fontSize: 12, color: '#6b6660', lineHeight: 1.35 }}>
                Needed for /screen to capture your entire screen
              </div>
            </div>
          </StepCard>
        </div>

        {/* Step 1 CTA: Grant Accessibility */}
        {!accessibilityGranted && (
          <>
            <CTAButton
              onClick={handleGrantAccessibility}
              disabled={isAxRequesting}
              aria-label={
                isAxRequesting ? 'Checking...' : 'Grant Accessibility Access'
              }
              loading={isAxRequesting}
            >
              {isAxRequesting ? 'Checking...' : 'Grant Accessibility Access'}
            </CTAButton>
            {isAxRequesting && onNext && (
              <CTAButton onClick={onNext} aria-label="Continue" secondary>
                Continue
              </CTAButton>
            )}
          </>
        )}

        {/* Step 2 CTAs: Open Settings, then continue manually */}
        {/* Step 2 CTAs: Open Settings, then continue manually */}
        {accessibilityGranted && (
          <>
            {!hasOpenedScreenRecordingSettings && (
              <CTAButton
                onClick={handleOpenScreenRecording}
                aria-label="Open Screen Recording Settings"
              >
                Open Screen Recording Settings
              </CTAButton>
            )}
            {hasOpenedScreenRecordingSettings && (
              <>
                <CTAButton
                  onClick={handleContinue}
                  aria-label="Continue to API Setup"
                >
                  Continue
                </CTAButton>
                <p
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  After enabling Screen Recording in System Settings, click
                  Continue to move on to API setup.
                </p>
              </>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface CTAButtonProps {
  onClick: () => void;
  disabled?: boolean;
  'aria-label'?: string;
  loading?: boolean;
  secondary?: boolean;
  primary?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** Primary action button with a subtle lift-and-brighten hover effect. */
export function CTAButton({
  onClick,
  disabled,
  'aria-label': ariaLabel,
  loading,
  secondary = false,
  primary = false,
  style,
  children,
}: CTAButtonProps) {
  const [hovered, setHovered] = useState(false);

  const isDisabled = disabled || loading;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      onMouseEnter={() => !isDisabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '13px',
        background: secondary
          ? 'rgba(255,255,255,0.06)'
          : primary
            ? 'white'
            : isDisabled
              ? 'rgba(100, 100, 100, 0.4)'
              : 'white',
        color: secondary ? '#f0f0f2' : primary ? 'black' : 'black',
        fontSize: 14,
        fontWeight: 600,
        border: secondary ? '1px solid rgba(255,255,255,0.12)' : 'none',
        borderRadius: 14,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        letterSpacing: '-0.1px',
        marginBottom: 10,
        opacity: isDisabled ? 0.7 : 1,
        boxShadow: isDisabled
          ? 'none'
          : secondary
            ? 'none'
            : 'var(--shadow-chat), 0 1px 0 rgba(255,255,255,0.12) inset',
        filter: hovered && !isDisabled ? 'brightness(1.1)' : 'none',
        transition: 'filter 0.15s ease',
        ...style,
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

interface StepCardProps {
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}

function StepCard({ active, done, children }: StepCardProps) {
  const borderColor = done
    ? 'rgba(34,197,94,0.2)'
    : active
      ? 'var(--color-surface-border)'
      : 'rgba(255,255,255,0.06)';

  const background = done
    ? 'rgba(34,197,94,0.05)'
    : active
      ? 'rgba(100, 100, 100, 0.07)'
      : 'rgba(255,255,255,0.03)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderRadius: 16,
        border: `1px solid ${borderColor}`,
        background,
        boxShadow:
          active && !done
            ? '0 0 10px rgba(100, 100, 100, 0.1), inset 0 1px 0 rgba(100, 100, 100, 0.1)'
            : 'none',
      }}
    >
      {children}
    </div>
  );
}

interface BadgeProps {
  color: 'green';
  children: React.ReactNode;
}

function Badge({ color, children }: BadgeProps) {
  const styles: Record<string, React.CSSProperties> = {
    green: {
      color: '#22c55e',
      background: 'rgba(34,197,94,0.1)',
      border: '1px solid rgba(34,197,94,0.2)',
    },
  };

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: 20,
        ...styles[color],
      }}
    >
      {children}
    </span>
  );
}
