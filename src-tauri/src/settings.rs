use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

/// Stored in the app data directory. Active votes are deliberately never persisted.
pub const SETTINGS_FILE: &str = "settings.json";
pub const DEFAULT_TARGET: u32 = 100;
pub const MIN_TARGET: u32 = 1;
pub const MAX_TARGET: u32 = 100_000;
/// Generous upper bound: profile URLs are accepted and normalized by the sidecar.
pub const MAX_USERNAME_LENGTH: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub show_background: bool,
    pub show_progress: bool,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            show_background: true,
            show_progress: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Last TikTok username the user connected to; empty if none.
    pub username: String,
    pub target: u32,
    pub overlay: OverlaySettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            username: String::new(),
            target: DEFAULT_TARGET,
            overlay: OverlaySettings::default(),
        }
    }
}

pub fn is_valid_target(target: u32) -> bool {
    (MIN_TARGET..=MAX_TARGET).contains(&target)
}

/// Trims the input and rejects empty or oversized usernames; the sidecar does the full TikTok check.
pub fn normalize_username(username: &str) -> Option<String> {
    let trimmed = username.trim();
    (!trimmed.is_empty() && trimmed.chars().count() <= MAX_USERNAME_LENGTH).then(|| trimmed.to_string())
}

impl Settings {
    /// Reads persisted values leniently: anything missing or invalid falls back to its default.
    pub fn from_values(username: Option<Value>, target: Option<Value>, overlay: Option<Value>) -> Self {
        let defaults = Self::default();

        let username = username
            .as_ref()
            .and_then(Value::as_str)
            .and_then(normalize_username)
            .unwrap_or(defaults.username);
        let target = target
            .as_ref()
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())
            .filter(|value| is_valid_target(*value))
            .unwrap_or(defaults.target);
        // serde would also accept a struct written as an array; only objects are valid here.
        let overlay = overlay
            .filter(Value::is_object)
            .and_then(|value| serde_json::from_value::<OverlaySettings>(value).ok())
            .unwrap_or(defaults.overlay);

        Self {
            username,
            target,
            overlay,
        }
    }
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> Settings {
    match app.store(SETTINGS_FILE) {
        Ok(store) => Settings::from_values(store.get("username"), store.get("target"), store.get("overlay")),
        Err(_) => {
            log::warn!("could not open the settings store, using defaults");
            Settings::default()
        }
    }
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &Settings) {
    let result = app.store(SETTINGS_FILE).and_then(|store| {
        store.set("username", settings.username.clone());
        store.set("target", settings.target);
        store.set(
            "overlay",
            serde_json::to_value(settings.overlay).unwrap_or_default(),
        );
        store.save()
    });
    if result.is_err() {
        log::warn!("could not save the settings");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn uses_defaults_when_nothing_is_stored() {
        assert_eq!(Settings::from_values(None, None, None), Settings::default());
        assert_eq!(
            serde_json::to_value(Settings::default()).unwrap(),
            json!({
                "username": "",
                "target": 100,
                "overlay": { "showBackground": true, "showProgress": true }
            })
        );
    }

    #[test]
    fn restores_valid_stored_values() {
        let settings = Settings::from_values(
            Some(json!("  @streamer ")),
            Some(json!(250)),
            Some(json!({ "showBackground": false, "showProgress": true })),
        );

        assert_eq!(
            settings,
            Settings {
                username: "@streamer".into(),
                target: 250,
                overlay: OverlaySettings {
                    show_background: false,
                    show_progress: true,
                },
            }
        );
    }

    #[test]
    fn replaces_invalid_values_with_defaults() {
        let invalid = [
            (json!(42), json!(0), json!({ "showBackground": "yes" })),
            (json!(""), json!(MAX_TARGET + 1), json!(null)),
            (json!("x".repeat(MAX_USERNAME_LENGTH + 1)), json!(-5), json!([true, false])),
            (json!(null), json!(12.5), json!({ "showProgress": false })),
        ];

        for (username, target, overlay) in invalid {
            assert_eq!(
                Settings::from_values(Some(username), Some(target), Some(overlay)),
                Settings::default()
            );
        }
    }

    #[test]
    fn validates_usernames_and_targets() {
        assert_eq!(normalize_username(" name "), Some("name".into()));
        assert_eq!(normalize_username("   "), None);
        assert!(is_valid_target(MIN_TARGET) && is_valid_target(MAX_TARGET));
        assert!(!is_valid_target(0) && !is_valid_target(MAX_TARGET + 1));
    }
}
