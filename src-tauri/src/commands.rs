use tauri::{AppHandle, Runtime, State};

use crate::settings::{self, OverlaySettings, MAX_TARGET, MIN_TARGET};
use crate::sidecar::{AppError, AppState, Sidecar, SidecarCommand};

/// Rejects obviously invalid input early; the sidecar performs the full TikTok validation.
pub fn validate_username(username: &str) -> Result<String, AppError> {
    settings::normalize_username(username)
        .ok_or_else(|| AppError::new("invalid-username", "Invalid TikTok username"))
}

pub fn validate_target(target: u32) -> Result<u32, AppError> {
    if settings::is_valid_target(target) {
        Ok(target)
    } else {
        Err(AppError::new(
            "invalid-target",
            format!("Target must be between {MIN_TARGET} and {MAX_TARGET}"),
        ))
    }
}

/// Settings are saved first; a sidecar that is (re)starting applies them once it is ready.
fn send_setting(sidecar: &Sidecar, command: &SidecarCommand) -> Result<(), AppError> {
    match sidecar.send(command) {
        Err(error) if error.code == "sidecar-unavailable" => Ok(()),
        result => result,
    }
}

#[tauri::command]
pub fn get_state(sidecar: State<'_, Sidecar>) -> AppState {
    sidecar.state()
}

#[tauri::command]
pub fn connect<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    username: String,
) -> Result<(), AppError> {
    let username = validate_username(&username)?;
    sidecar.send(&SidecarCommand::Connect {
        username: username.clone(),
    })?;

    let saved = sidecar.update_settings(&app, |settings| settings.username = username);
    settings::save(&app, &saved);
    Ok(())
}

#[tauri::command]
pub fn disconnect(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::Disconnect)
}

#[tauri::command]
pub fn reset_votes(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::Reset)
}

#[tauri::command]
pub fn set_target<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    target: u32,
) -> Result<(), AppError> {
    let target = validate_target(target)?;
    let saved = sidecar.update_settings(&app, |settings| settings.target = target);
    settings::save(&app, &saved);
    send_setting(&sidecar, &SidecarCommand::SetTarget { target })
}

#[tauri::command]
pub fn set_overlay_settings<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    overlay: OverlaySettings,
) -> Result<(), AppError> {
    let saved = sidecar.update_settings(&app, |settings| settings.overlay = overlay);
    settings::save(&app, &saved);
    send_setting(&sidecar, &SidecarCommand::SetOverlaySettings { overlay })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::MAX_USERNAME_LENGTH;

    #[test]
    fn trims_valid_usernames() {
        assert_eq!(validate_username("  @streamer ").unwrap(), "@streamer");
    }

    #[test]
    fn rejects_empty_or_oversized_usernames() {
        for username in ["", "   ", &"x".repeat(MAX_USERNAME_LENGTH + 1)] {
            let error = validate_username(username).unwrap_err();
            assert_eq!(error.code, "invalid-username");
        }
    }

    #[test]
    fn accepts_targets_within_bounds() {
        assert_eq!(validate_target(MIN_TARGET).unwrap(), MIN_TARGET);
        assert_eq!(validate_target(MAX_TARGET).unwrap(), MAX_TARGET);
    }

    #[test]
    fn rejects_targets_out_of_bounds() {
        for target in [0, MAX_TARGET + 1] {
            assert_eq!(validate_target(target).unwrap_err().code, "invalid-target");
        }
    }
}
