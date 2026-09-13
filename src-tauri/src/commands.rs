use tauri::{AppHandle, Runtime, State};

use crate::license::{self, LicenseState};
use crate::profiles::{self, effective_profile};
use crate::settings::{self, OverlaySettings, Settings, SettingsSaver, MAX_TARGET, MIN_TARGET};
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

/// A sidecar that is (re)starting applies saved settings once it is ready, so that is no error here.
fn ignore_unavailable(result: Result<(), AppError>) -> Result<(), AppError> {
    match result {
        Err(error) if error.code == "sidecar-unavailable" => Ok(()),
        result => result,
    }
}

/// Settings are saved first; the sidecar then runs the counters of the profile the plan allows.
fn send_counters(sidecar: &Sidecar, settings: &Settings) -> Result<(), AppError> {
    match configure_counters(settings, &sidecar.state().license) {
        Some(command) => ignore_unavailable(sidecar.send(&command)),
        None => Ok(()),
    }
}

/// Changes the first counter of the profile that is actually running.
fn update_running_counter(
    settings: &mut Settings,
    license: &LicenseState,
    now: &str,
    change: impl FnOnce(&mut settings::CounterDefinition),
) {
    let profile_id = effective_profile(settings, license)
        .map(|profile| profile.id.clone())
        .unwrap_or_default();
    settings.update_profile_counter(&profile_id, now, change);
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

/// Counter and option ids come from the UI; the sidecar ignores ids it does not know.
fn validated_id(id: Option<String>) -> Result<Option<String>, AppError> {
    match id {
        Some(id) if !settings::is_valid_id(&id) => {
            Err(AppError::new("invalid-counters", "Unknown counter or option"))
        }
        id => Ok(id),
    }
}

#[tauri::command]
pub fn add_manual_vote(
    sidecar: State<'_, Sidecar>,
    counter_id: Option<String>,
    option_id: Option<String>,
) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::AddManualVote {
        counter_id: validated_id(counter_id)?,
        option_id: validated_id(option_id)?,
    })
}

#[tauri::command]
pub fn remove_manual_vote(
    sidecar: State<'_, Sidecar>,
    counter_id: Option<String>,
    option_id: Option<String>,
) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::RemoveManualVote {
        counter_id: validated_id(counter_id)?,
        option_id: validated_id(option_id)?,
    })
}

#[tauri::command]
pub fn reset_votes(sidecar: State<'_, Sidecar>, counter_id: Option<String>) -> Result<(), AppError> {
    sidecar.send(&SidecarCommand::Reset {
        counter_id: validated_id(counter_id)?,
    })
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
    let ((), settings) = sidecar.try_update_settings(&app, |settings, license| {
        update_running_counter(settings, license, &now, |counter| counter.target = Some(target));
        Ok(())
    })?;
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
    let ((), settings) = sidecar.try_update_settings(&app, |settings, license| {
        update_running_counter(settings, license, &now, |counter| counter.overlay = overlay);
        Ok(())
    })?;
    saver.save(&settings);
    send_counters(&sidecar, &settings)
}

#[tauri::command]
pub fn create_profile<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    name: String,
) -> Result<String, AppError> {
    let now = settings::now_timestamp();
    let (id, settings) = sidecar.try_update_settings(&app, |settings, license| {
        profiles::create_profile(settings, license, &name, profiles::new_profile_id(), &now)
    })?;
    saver.save(&settings);
    Ok(id)
}

#[tauri::command]
pub fn duplicate_profile<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    profile_id: String,
) -> Result<String, AppError> {
    let now = settings::now_timestamp();
    let (id, settings) = sidecar.try_update_settings(&app, |settings, license| {
        profiles::duplicate_profile(settings, license, &profile_id, profiles::new_profile_id(), &now)
    })?;
    saver.save(&settings);
    Ok(id)
}

#[tauri::command]
pub fn rename_profile<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    profile_id: String,
    name: String,
) -> Result<(), AppError> {
    let now = settings::now_timestamp();
    let ((), settings) = sidecar.try_update_settings(&app, |settings, license| {
        profiles::rename_profile(settings, license, &profile_id, &name, &now)
    })?;
    saver.save(&settings);
    Ok(())
}

/// Saves the counters of the running profile; rounds of counters that keep their id continue.
#[tauri::command]
pub fn save_counters<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    counters: Vec<settings::CounterDefinition>,
) -> Result<(), AppError> {
    let now = settings::now_timestamp();
    let ((), settings) = sidecar.try_update_settings(&app, |settings, license| {
        profiles::replace_counters(settings, license, counters, &now)
    })?;
    saver.save(&settings);
    send_counters(&sidecar, &settings)
}

/// Switching the running profile ends the running rounds, which the UI confirms beforehand.
fn run_other_profile(sidecar: &Sidecar, settings: &Settings) -> Result<(), AppError> {
    send_counters(sidecar, settings)?;
    ignore_unavailable(sidecar.send(&SidecarCommand::Reset { counter_id: None }))
}

#[tauri::command]
pub fn delete_profile<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    profile_id: String,
) -> Result<(), AppError> {
    let (active_changed, settings) =
        sidecar.try_update_settings(&app, |settings, _license| profiles::delete_profile(settings, &profile_id))?;
    saver.save(&settings);
    if active_changed {
        run_other_profile(&sidecar, &settings)?;
    }
    Ok(())
}

#[tauri::command]
pub fn switch_profile<R: Runtime>(
    app: AppHandle<R>,
    sidecar: State<'_, Sidecar>,
    saver: State<'_, SettingsSaver>,
    profile_id: String,
) -> Result<(), AppError> {
    let (changed, settings) = sidecar.try_update_settings(&app, |settings, license| {
        profiles::switch_profile(settings, license, &profile_id)
    })?;
    if changed {
        saver.save(&settings);
        run_other_profile(&sidecar, &settings)?;
    }
    Ok(())
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
