use tauri::{AppHandle, Runtime, State};

use crate::settings::{self, OverlaySettings, SettingsSaver, MAX_TARGET, MIN_TARGET};
use crate::license;
use crate::settings::Settings;
use crate::sidecar::{configure_counters, open_external, AppError, AppState, Sidecar, SidecarCommand};

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

pub fn validate_overlay(overlay: OverlaySettings) -> Result<OverlaySettings, AppError> {
    overlay
        .validated()
        .ok_or_else(|| AppError::new("invalid-overlay-settings", "Invalid overlay settings"))
}

/// Settings are saved first; a sidecar that is (re)starting applies them once it is ready.
fn send_counters(sidecar: &Sidecar, settings: &Settings) -> Result<(), AppError> {
    let Some(command) = configure_counters(settings) else {
        return Ok(());
    };
    match sidecar.send(&command) {
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
    saver: State<'_, SettingsSaver>,
    username: String,
) -> Result<(), AppError> {
    let username = validate_username(&username)?;
    sidecar.send(&SidecarCommand::Connect {
        username: username.clone(),
    })?;

    saver.save(&sidecar.update_settings(&app, |settings| settings.username = username));
    Ok(())
}

#[tauri::command]
pub fn disconnect(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::Disconnect)
}

#[tauri::command]
pub fn add_manual_vote(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::AddManualVote)
}

#[tauri::command]
pub fn remove_manual_vote(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::RemoveManualVote)
}

#[tauri::command]
pub fn reset_votes(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::Reset)
}

#[tauri::command]
pub fn set_target<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    target: u32,
) -> Result<(), AppError> {
    let target = validate_target(target)?;
    let now = settings::now_timestamp();
    let settings = sidecar.update_settings(&app, |settings| {
        settings.update_primary_counter(&now, |counter| counter.target = Some(target))
    });
    saver.save(&settings);
    send_counters(&sidecar, &settings)
}

#[tauri::command]
pub fn set_overlay_settings<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    overlay: OverlaySettings,
) -> Result<(), AppError> {
    let overlay = validate_overlay(overlay)?;
    let now = settings::now_timestamp();
    let settings = sidecar.update_settings(&app, |settings| {
        settings.update_primary_counter(&now, |counter| counter.overlay = overlay)
    });
    saver.save(&settings);
    send_counters(&sidecar, &settings)
}

/// Activation goes through the sidecar, which talks to the license service and verifies the answer.
#[tauri::command]
pub fn activate_license(
    sidecar: State<'_, Sidecar>,
    code: String,
    replace_installation_id: Option<String>,
) -> Result<(), AppError> {
    let code = license::normalize_activation_code(&code)
        .ok_or_else(|| AppError::new("invalid-code", "Invalid activation code"))?;
    if replace_installation_id
        .as_deref()
        .is_some_and(|id| !license::is_installation_id(id))
    {
        return Err(AppError::new("invalid-installation", "Invalid installation"));
    }
    sidecar.send(&SidecarCommand::ActivateLicense {
        code,
        replace_installation_id,
    })
}

#[tauri::command]
pub fn refresh_license(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::RefreshLicense)
}

#[tauri::command]
pub fn deactivate_license(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::DeactivateLicense)
}

#[tauri::command]
pub fn open_customer_portal(sidecar: State<'_, Sidecar>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::OpenCustomerPortal)
}

/// Prices, terms and checkout live on the website, so they are always shown before a purchase.
#[tauri::command]
pub fn open_pro_page<R: Runtime>(app: AppHandle<R>) -> Result<(), AppError> {
    open_external(&app, license::PRO_PAGE_URL)
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
    fn validates_overlay_settings() {
        let custom = OverlaySettings {
            accent_color: "#ABCDEF".into(),
            ..OverlaySettings::default()
        };
        assert_eq!(validate_overlay(custom).unwrap().accent_color, "#abcdef");

        let invalid = OverlaySettings {
            size: 0,
            ..OverlaySettings::default()
        };
        assert_eq!(validate_overlay(invalid).unwrap_err().code, "invalid-overlay-settings");
    }

    #[test]
    fn rejects_targets_out_of_bounds() {
        for target in [0, MAX_TARGET + 1] {
            assert_eq!(validate_target(target).unwrap_err().code, "invalid-target");
        }
    }
}
