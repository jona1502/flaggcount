use tauri::State;

use crate::sidecar::{AppError, AppState, Sidecar, SidecarCommand};

/// Generous upper bound: profile URLs are accepted and normalized by the sidecar.
pub const MAX_USERNAME_LENGTH: usize = 100;
pub const MIN_TARGET: u32 = 1;
pub const MAX_TARGET: u32 = 100_000;

/// Rejects obviously invalid input early; the sidecar performs the full TikTok validation.
pub fn validate_username(username: &str) -> Result<String, AppError> {
    let trimmed = username.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_USERNAME_LENGTH {
        return Err(AppError::new("invalid-username", "Invalid TikTok username"));
    }
    Ok(trimmed.to_string())
}

pub fn validate_target(target: u32) -> Result<u32, AppError> {
    if (MIN_TARGET..=MAX_TARGET).contains(&target) {
        Ok(target)
    } else {
        Err(AppError::new(
            "invalid-target",
            format!("Target must be between {MIN_TARGET} and {MAX_TARGET}"),
        ))
    }
}

#[tauri::command]
pub fn get_state(sidecar: State<'_, Sidecar>) -> AppState {
    sidecar.state()
}

#[tauri::command]
pub fn connect(sidecar: State<'_, Sidecar>, username: String) -> Result<(), AppError> {
    let username = validate_username(&username)?;
    sidecar.send(&SidecarCommand::Connect { username })
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
pub fn set_target(sidecar: State<'_, Sidecar>, target: u32) -> Result<(), AppError> {
    let target = validate_target(target)?;
    sidecar.send(&SidecarCommand::SetTarget { target })
}

#[cfg(test)]
mod tests {
    use super::*;

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
