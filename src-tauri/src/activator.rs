//! Unified activation and visibility management for the Thuki overlay.
//!
//! This module coordinates the interaction between system-level input events
//! and the application's visibility state. It provides a non-intrusive monitoring
//! layer that detects two distinct intents:
//! - double-tap Control to toggle the overlay
//! - single-tap Option to trigger compact-mode behavior
//!
//! The implementation uses a high-performance background listener with its own
//! event loop, ensuring zero latency impact on the main application or the
//! host system's responsiveness.
//!
//! **macOS Permissions**: This module requires Accessibility permission to
//! monitor system-wide modifier key transitions. It includes self-diagnostic
//! checks and automated permission prompting.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::CFDictionary;
use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
use core_foundation::string::CFString;
use core_graphics::event::{
    CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, CallbackResult, EventField,
};

/// Maximum temporal proximity between trigger events to qualify as an activation signal.
const ACTIVATION_WINDOW: Duration = Duration::from_millis(400);

/// Primary keycodes used for the double-tap activation sequence (macOS Control keys).
const KC_PRIMARY_L: i64 = 0x3b;
const KC_PRIMARY_R: i64 = 0x3e;

/// Primary keycodes used for the compact toggle gesture (macOS Option keys).
const KC_OPTION_L: i64 = 0x3a;
const KC_OPTION_R: i64 = 0x3d;

/// Maximum number of attempts to establish the event tap while waiting for system permissions.
const MAX_PERMISSION_ATTEMPTS: u32 = 6;

/// Interval between permission check cycles.
const PERMISSION_POLL_INTERVAL: Duration = Duration::from_secs(5);

// ─── Native Framework Interop (macOS ApplicationServices) ──────────────────

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    /// Returns true if the current process is trusted for Accessibility access.
    fn AXIsProcessTrusted() -> bool;

    /// Checks for Accessibility trust, optionally triggering the system-level privacy prompt.
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
}

/// Verifies and optionally requests Accessibility authorization from the OS.
///
/// Under development builds launched via terminal, macOS attributes this
/// permission to the terminal emulator. In production `.app` bundles, the
/// permission is correctly attributed to the application identity.
#[cfg_attr(coverage_nightly, coverage(off))]
fn request_authorization(prompt: bool) -> bool {
    unsafe {
        if AXIsProcessTrusted() {
            return true;
        }

        if prompt {
            // "AXTrustedCheckOptionPrompt" key is the standard mechanism to
            // trigger the macOS Privacy & Security dialog.
            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let value = CFBoolean::true_value();
            let dict = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), value.as_CFType())]);
            AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef() as *const c_void);
        }

        false
    }
}

// ─── Activation Logic ────────────────────────────────────────────────────────

/// Internal state tracking for the double-tap Control activation sequence.
struct ActivationState {
    /// Timestamp of the last verified event in the sequence.
    last_trigger: Option<Instant>,
    /// Tracks the current physical state of the trigger key.
    is_pressed: bool,
}

/// Internal state tracking for the single-tap Option gesture.
struct OptionTapState {
    /// Tracks the current physical state of the Option key.
    is_pressed: bool,
}

/// Evaluates a raw Control-key event to determine whether it completes the
/// existing double-tap activation sequence.
///
/// Implements a state machine that filters for state transitions (press/release)
/// and enforces temporal constraints defined by [`ACTIVATION_WINDOW`].
fn evaluate_activation(state: &mut ActivationState, is_press: bool) -> bool {
    if is_press && !state.is_pressed {
        state.is_pressed = true;
        let now = Instant::now();

        if let Some(last) = state.last_trigger {
            if now.duration_since(last) < ACTIVATION_WINDOW {
                state.last_trigger = None;
                return true;
            }
        }
        state.last_trigger = Some(now);
        return false;
    } else if !is_press {
        state.is_pressed = false;
    }

    false
}

/// Evaluates a raw Option-key event to determine whether it represents a
/// single-tap gesture for toggling compact mode.
fn evaluate_option_tap(state: &mut OptionTapState, is_press: bool) -> bool {
    if is_press && !state.is_pressed {
        state.is_pressed = true;
        return true;
    }

    if !is_press {
        state.is_pressed = false;
    }

    false
}

// ─── Public Interface ────────────────────────────────────────────────────────

/// Orchestrates the lifecycle and threading of the background activation listener.
pub struct OverlayActivator {
    is_active: Arc<AtomicBool>,
}

impl OverlayActivator {
    /// Creates a new, inactive instance of the activator.
    pub fn new() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Spawns the background monitoring thread and initializes the event loop.
    ///
    /// The method handles initial authorization checks and enters a retry loop
    /// if permissions are not yet available, allowing the user to interact
    /// with system prompts without needing to restart the application.
    ///
    /// # Arguments
    ///
    /// * `on_activation` - A thread-safe closure executed whenever the activation
    ///   sequence is detected.
    #[allow(dead_code)]
    #[cfg_attr(coverage_nightly, coverage(off))]
    pub fn start<F>(&self, on_activation: F)
    where
        F: Fn() + Send + Sync + 'static,
    {
        self.start_with_single_tap(on_activation, || {});
    }

    /// Spawns the background monitoring thread and initializes the event loop.
    ///
    /// Emits a callback on the first qualifying Option tap for compact-mode
    /// behavior and a second callback when the existing double-tap Control
    /// activation completes.
    ///
    /// # Arguments
    ///
    /// * `on_activation` - A thread-safe closure executed whenever the
    ///   double-tap Control activation sequence is detected.
    /// * `on_single_tap` - A thread-safe closure executed on the first
    ///   qualifying Option tap.
    #[cfg_attr(coverage_nightly, coverage(off))]
    pub fn start_with_single_tap<F, G>(&self, on_activation: F, on_single_tap: G)
    where
        F: Fn() + Send + Sync + 'static,
        G: Fn() + Send + Sync + 'static,
    {
        if self.is_active.load(Ordering::SeqCst) {
            return;
        }
        self.is_active.store(true, Ordering::SeqCst);

        // Check authorization without prompting. The onboarding screen owns
        // the responsibility of directing the user to System Settings when
        // Accessibility is not yet granted.
        request_authorization(false);

        let is_active = self.is_active.clone();
        let on_activation = Arc::new(on_activation);
        let on_single_tap = Arc::new(on_single_tap);

        std::thread::spawn(move || {
            run_loop_with_retry(is_active, on_activation, on_single_tap);
        });
    }
}

/// Reason the event tap run loop exited.
enum TapExitReason {
    /// Activator was intentionally stopped via [`OverlayActivator`]. Do not retry.
    Deactivated,
    /// CGEventTap::new failed (Accessibility permission not yet granted). Retry
    /// after waiting for the user to grant permission.
    CreationFailed,
    /// The tap was created and the run loop ran, but macOS disabled the tap
    /// (timeout or user-input disable) or the run loop exited for an unexpected
    /// reason. Retry immediately — no permission change is needed.
    TapDied,
}

/// Persistence layer that maintains the event loop through permission and
/// tap-death cycles.
///
/// Two distinct failure modes are handled separately:
/// - **Permission failure** (`CreationFailed`): tap could not be installed at
///   all. Waits [`PERMISSION_POLL_INTERVAL`] between attempts, up to
///   [`MAX_PERMISSION_ATTEMPTS`] total.
/// - **Tap death** (`TapDied`): tap was running but macOS disabled it (e.g.
///   `TapDisabledByTimeout`). Retries immediately with no attempt limit so the
///   listener recovers as fast as possible.
#[cfg_attr(coverage_nightly, coverage(off))]
fn run_loop_with_retry<F, G>(
    is_active: Arc<AtomicBool>,
    on_activation: Arc<F>,
    on_single_tap: Arc<G>,
) where
    F: Fn() + Send + Sync + 'static,
    G: Fn() + Send + Sync + 'static,
{
    let mut permission_failures: u32 = 0;

    loop {
        if !is_active.load(Ordering::SeqCst) {
            return;
        }

        match try_initialize_tap(&is_active, &on_activation, &on_single_tap) {
            TapExitReason::Deactivated => return,

            TapExitReason::TapDied => {
                // Tap was running then killed by macOS. Reinstall immediately.
                eprintln!("thuki: [activator] tap died — reinstalling");
                permission_failures = 0;
            }

            TapExitReason::CreationFailed => {
                permission_failures += 1;
                if permission_failures >= MAX_PERMISSION_ATTEMPTS {
                    eprintln!(
                        "thuki: [error] activation listener failed after \
                         maximum retries; check system permissions."
                    );
                    return;
                }
                eprintln!(
                    "thuki: [activator] tap creation failed \
                     (attempt {permission_failures}/{MAX_PERMISSION_ATTEMPTS}); \
                     retrying in {}s",
                    PERMISSION_POLL_INTERVAL.as_secs()
                );
                std::thread::sleep(PERMISSION_POLL_INTERVAL);
            }
        }
    }
}

/// Core initialization of the Mach event tap.
///
/// Returns the reason the run loop exited so the caller can decide whether
/// to retry.
#[cfg_attr(coverage_nightly, coverage(off))]
fn try_initialize_tap<F, G>(
    is_active: &Arc<AtomicBool>,
    on_activation: &Arc<F>,
    on_single_tap: &Arc<G>,
) -> TapExitReason
where
    F: Fn() + Send + Sync + 'static,
    G: Fn() + Send + Sync + 'static,
{
    let activation_state = Arc::new(Mutex::new(ActivationState {
        last_trigger: None,
        is_pressed: false,
    }));
    let option_tap_state = Arc::new(Mutex::new(OptionTapState { is_pressed: false }));

    let cb_active = is_active.clone();
    let cb_on_activation = on_activation.clone();
    let cb_on_single_tap = on_single_tap.clone();
    let cb_activation_state = activation_state.clone();
    let cb_option_tap_state = option_tap_state.clone();

    // Create the event tap at HID level — the lowest level before events reach
    // any application. This is what Karabiner-Elements, BetterTouchTool, and
    // every other reliable system-wide key interceptor uses.
    //
    // Session-level taps (kCGSessionEventTap) sit above the window server
    // routing layer and are subject to focus-based filtering introduced in
    // macOS 15 Sequoia: they silently receive zero events from other apps.
    // HID-level taps bypass this entirely and require only Accessibility
    // permission, which Thuki already holds.
    let tap_result = CGEventTap::new(
        CGEventTapLocation::HID,
        CGEventTapPlacement::HeadInsertEventTap,
        // Use Default (active) tap, not ListenOnly. Active taps at HID level
        // are not disabled by secure input mode (iTerm Secure Keyboard Entry,
        // password fields, etc.). We still return CallbackResult::Keep so no
        // events are blocked or modified. Requires Accessibility permission,
        // which Thuki already holds.
        CGEventTapOptions::Default,
        // Only register for FlagsChanged. TapDisabledByTimeout and
        // TapDisabledByUserInput have sentinel values (0xFFFFFFFE/0xFFFFFFFF)
        // that overflow the bitmask and cannot be included here — macOS delivers
        // them to the callback automatically without registration.
        vec![CGEventType::FlagsChanged],
        move |_proxy, event_type, event: &CGEvent| -> CallbackResult {
            // macOS auto-disables event taps whose callback is too slow.
            // Stop the run loop so the outer retry loop reinstalls the tap.
            if matches!(
                event_type,
                CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput
            ) {
                eprintln!(
                    "thuki: [activator] event tap disabled by macOS \
                     ({event_type:?}) — stopping run loop for reinstall"
                );
                CFRunLoop::get_current().stop();
                return CallbackResult::Keep;
            }

            if !cb_active.load(Ordering::SeqCst) {
                CFRunLoop::get_current().stop();
                return CallbackResult::Keep;
            }

            let keycode = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
            let flags = event.get_flags();

            // Filter for the supported modifier triggers only.
            let is_control_key = keycode == KC_PRIMARY_L || keycode == KC_PRIMARY_R;
            let is_option_key = keycode == KC_OPTION_L || keycode == KC_OPTION_R;
            if !is_control_key && !is_option_key {
                return CallbackResult::Keep;
            }

            if is_control_key {
                let is_press = flags.contains(CGEventFlags::CGEventFlagControl);
                let mut s = cb_activation_state.lock().unwrap();
                let emit_activation = evaluate_activation(&mut s, is_press);
                drop(s);

                if emit_activation {
                    cb_on_activation();
                }
            } else {
                let is_press = flags.contains(CGEventFlags::CGEventFlagAlternate);
                let mut s = cb_option_tap_state.lock().unwrap();
                let emit_single_tap = evaluate_option_tap(&mut s, is_press);
                drop(s);

                if emit_single_tap {
                    cb_on_single_tap();
                }
            }

            CallbackResult::Keep
        },
    );

    match tap_result {
        Ok(tap) => {
            eprintln!("thuki: [activator] event tap created (HID level) — listening for double-tap Control and single-tap Option");
            unsafe {
                let loop_source = tap
                    .mach_port()
                    .create_runloop_source(0)
                    .expect("failed to create run loop source");

                let run_loop = CFRunLoop::get_current();
                run_loop.add_source(&loop_source, kCFRunLoopCommonModes);
                tap.enable();

                CFRunLoop::run_current();
            }
            eprintln!("thuki: [activator] event tap run loop exited");
            // If still supposed to be active the run loop exited unexpectedly.
            if is_active.load(Ordering::SeqCst) {
                TapExitReason::TapDied
            } else {
                TapExitReason::Deactivated
            }
        }
        Err(()) => {
            eprintln!(
                "thuki: [activator] event tap creation FAILED; check Accessibility permission"
            );
            TapExitReason::CreationFailed
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_activator_is_inactive() {
        let activator = OverlayActivator::new();
        assert!(!activator
            .is_active
            .load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn first_control_press_starts_activation_sequence() {
        let mut state = ActivationState {
            last_trigger: None,
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, true));
        assert!(state.last_trigger.is_some());
    }

    #[test]
    fn second_control_press_within_window_emits_activation() {
        let mut state = ActivationState {
            last_trigger: None,
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, true));
        assert!(!evaluate_activation(&mut state, false));
        assert!(evaluate_activation(&mut state, true));
    }

    #[test]
    fn rejects_stale_control_sequence() {
        let mut state = ActivationState {
            last_trigger: None,
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, true));
        assert!(!evaluate_activation(&mut state, false));

        state.last_trigger = Some(Instant::now() - Duration::from_millis(500));

        assert!(!evaluate_activation(&mut state, true));
    }

    #[test]
    fn second_double_tap_can_reactivate_immediately() {
        let mut state = ActivationState {
            last_trigger: None,
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, true));
        assert!(!evaluate_activation(&mut state, false));
        assert!(evaluate_activation(&mut state, true));
        assert!(!evaluate_activation(&mut state, false));

        assert!(!evaluate_activation(&mut state, true));
        assert!(!evaluate_activation(&mut state, false));
        assert!(evaluate_activation(&mut state, true));
    }

    #[test]
    fn boundary_timing_at_exactly_400ms_starts_a_new_control_sequence() {
        let mut state = ActivationState {
            last_trigger: Some(Instant::now() - Duration::from_millis(400)),
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, true));
    }

    #[test]
    fn boundary_timing_at_399ms_is_accepted() {
        let mut state = ActivationState {
            last_trigger: Some(Instant::now() - Duration::from_millis(399)),
            is_pressed: false,
        };

        assert!(evaluate_activation(&mut state, true));
    }

    #[test]
    fn state_resets_after_successful_control_activation() {
        let mut state = ActivationState {
            last_trigger: None,
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, true));
        assert!(!evaluate_activation(&mut state, false));
        assert!(evaluate_activation(&mut state, true));

        assert!(state.last_trigger.is_none());
    }

    #[test]
    fn repeated_control_press_without_release_is_ignored() {
        let mut state = ActivationState {
            last_trigger: None,
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, true));
        assert!(!evaluate_activation(&mut state, true));
    }

    #[test]
    fn release_without_control_press_does_nothing() {
        let mut state = ActivationState {
            last_trigger: None,
            is_pressed: false,
        };

        assert!(!evaluate_activation(&mut state, false));
        assert!(state.last_trigger.is_none());
    }

    #[test]
    fn first_option_press_emits_compact_toggle_signal() {
        let mut state = OptionTapState { is_pressed: false };

        assert!(evaluate_option_tap(&mut state, true));
    }

    #[test]
    fn repeated_option_press_without_release_is_ignored() {
        let mut state = OptionTapState { is_pressed: false };

        assert!(evaluate_option_tap(&mut state, true));
        assert!(!evaluate_option_tap(&mut state, true));
    }

    #[test]
    fn option_release_resets_pressed_state_for_next_compact_toggle() {
        let mut state = OptionTapState { is_pressed: false };

        assert!(evaluate_option_tap(&mut state, true));
        assert!(!evaluate_option_tap(&mut state, false));
        assert!(evaluate_option_tap(&mut state, true));
    }
}
