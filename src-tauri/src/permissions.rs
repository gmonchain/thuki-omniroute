/*!
 * Permissions Module
 *
 * Exposes Tauri commands for querying and requesting macOS privacy permissions
 * required by Thuki (Accessibility and Screen Recording), plus the pure-logic
 * helper that decides whether the onboarding screen must be shown.
 *
 * Architecture: thin command wrappers (excluded from coverage) delegate to
 * small, testable functions. The only logic exercised at test-time is
 * `needs_onboarding`, which is a pure predicate with no OS side-effects.
 */

// ─── Pure Logic ──────────────────────────────────────────────────────────────

/// Returns `true` when at least one required permission has not been granted.
///
/// Both Accessibility (hotkey listener) and Screen Recording (/screen command)
/// must be granted for Thuki to function fully. If either is missing the
/// onboarding screen is shown instead of the normal overlay.
pub fn needs_onboarding(accessibility: bool, screen_recording: bool) -> bool {
    !accessibility || !screen_recording
}

// ─── macOS Permission Checks ─────────────────────────────────────────────────

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

/// Returns whether the process currently has Accessibility permission.
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn is_accessibility_granted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

/// Returns whether the process currently has Screen Recording permission.
///
/// Uses `CGPreflightScreenCaptureAccess`, which only returns `true` after
/// a full restart post-grant (unlike `CGWindowListCopyWindowInfo` which
/// returns non-null immediately but before pixels are actually accessible).
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn is_screen_recording_granted() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}

/// Returns whether Screen Recording has been recorded in TCC for this app.
///
/// Unlike `CGPreflightScreenCaptureAccess`, this detects the
/// "granted but pending restart" state needed by onboarding: once the user
/// enables the toggle in System Settings, `CGWindowListCopyWindowInfo` returns
/// a non-null list immediately even before pixels are accessible to the
/// current process.
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn is_screen_recording_tcc_granted() -> bool {
    type CFArrayRef = *const std::ffi::c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relativeToWindow: u32) -> CFArrayRef;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const std::ffi::c_void);
    }

    const K_CG_NULL_WINDOW_ID: u32 = 0;
    const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1 << 0;
    const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;

    let option = K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;

    unsafe {
        let probe = CGWindowListCopyWindowInfo(option, K_CG_NULL_WINDOW_ID);
        if probe.is_null() {
            return false;
        }
        CFRelease(probe);
        true
    }
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

/// Returns whether Accessibility permission has been granted.
#[tauri::command]
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn check_accessibility_permission() -> bool {
    is_accessibility_granted()
}

/// Opens System Settings to the Accessibility privacy pane so the user can
/// enable the permission without encountering the native system popup.
///
/// This gives a consistent onboarding experience: both Accessibility and
/// Screen Recording are granted via System Settings rather than native dialogs.
#[tauri::command]
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn open_accessibility_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg(
            "x-apple.systempreferences:com.apple.preference.security\
             ?Privacy_Accessibility",
        )
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Returns whether Screen Recording permission has been granted.
#[tauri::command]
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn check_screen_recording_permission() -> bool {
    is_screen_recording_granted()
}

/// Opens System Settings to the Screen Recording privacy pane so the user
/// can enable the permission without navigating there manually.
#[tauri::command]
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn open_screen_recording_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg(
            "x-apple.systempreferences:com.apple.preference.security\
             ?Privacy_ScreenCapture",
        )
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Registers Thuki in the Screen Recording privacy pane and shows the macOS
/// permission prompt.
///
/// `CGRequestScreenCaptureAccess` is the only API that both adds the app to
/// System Settings > Privacy & Security > Screen & System Audio Recording and
/// triggers the native "allow screen recording" alert. Without calling this
/// first, Thuki will not appear in the Screen Recording list at all.
#[tauri::command]
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn request_screen_recording_access() {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestScreenCaptureAccess() -> bool;
    }
    unsafe {
        CGRequestScreenCaptureAccess();
    }
}

/// Returns `true` once Screen Recording has been recorded in TCC for this app.
///
/// Unlike `CGPreflightScreenCaptureAccess`, this intentionally treats
/// "granted but pending restart" as granted so onboarding can stop polling and
/// prompt the user to quit and relaunch immediately after they enable the
/// toggle in System Settings.
#[tauri::command]
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn check_screen_recording_tcc_granted() -> bool {
    is_screen_recording_tcc_granted()
}

/// Quits Thuki and immediately relaunches it.
///
/// Called after the user grants Screen Recording permission. macOS requires
/// a full process restart before the new permission takes effect.
///
/// Writes "intro" to the DB before restarting so `notify_frontend_ready`
/// shows the intro screen on the next launch without calling any permission
/// API. Permission APIs (CGPreflightScreenCaptureAccess) can return stale
/// results immediately after a restart on macOS 15+; trusting the DB stage
/// avoids that unreliability entirely.
#[tauri::command]
#[cfg(target_os = "macos")]
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn quit_and_relaunch(app_handle: tauri::AppHandle, db: tauri::State<crate::history::Database>) {
    if let Ok(conn) = db.0.lock() {
        let _ = crate::onboarding::set_stage(&conn, &crate::onboarding::OnboardingStage::ApiSetup);
    }
    app_handle.restart();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn needs_onboarding_false_when_both_granted() {
        assert!(!needs_onboarding(true, true));
    }

    #[test]
    fn needs_onboarding_true_when_accessibility_missing() {
        assert!(needs_onboarding(false, true));
    }

    #[test]
    fn needs_onboarding_true_when_screen_recording_missing() {
        assert!(needs_onboarding(true, false));
    }

    #[test]
    fn needs_onboarding_true_when_both_missing() {
        assert!(needs_onboarding(false, false));
    }
}
