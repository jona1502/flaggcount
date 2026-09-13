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

pub const MIN_OVERLAY_SIZE: u8 = 20;
pub const MAX_OVERLAY_SIZE: u8 = 100;
pub const MAX_BACKGROUND_OPACITY: u8 = 100;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverlayPosition {
    Top,
    #[default]
    Center,
    Bottom,
}

/// `Wave` runs continuously; `Bounce` and `Pulse` play on every new vote.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlagAnimation {
    #[default]
    None,
    Wave,
    Bounce,
    Pulse,
}

/// Plays once the target is reached.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TargetEffect {
    #[default]
    None,
    Glow,
    Confetti,
}

/// Appearance of the streaming overlay. Missing fields take their defaults, so settings saved
/// by older versions keep loading.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OverlaySettings {
    pub show_background: bool,
    pub show_progress: bool,
    /// Progress bar and highlights, `#rrggbb`.
    pub accent_color: String,
    pub text_color: String,
    pub background_color: String,
    /// Opacity of the background panel in percent.
    pub background_opacity: u8,
    pub position: OverlayPosition,
    /// Share of the streaming source the overlay may fill, in percent.
    pub size: u8,
    pub flag_animation: FlagAnimation,
    pub target_effect: TargetEffect,
}

/// Matches the original overlay, so nothing changes until the streamer customizes it.
impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            show_background: true,
            show_progress: true,
            accent_color: "#e82634".into(),
            text_color: "#ffffff".into(),
            background_color: "#0c0c10".into(),
            background_opacity: 80,
            position: OverlayPosition::Center,
            size: 92,
            flag_animation: FlagAnimation::None,
            target_effect: TargetEffect::None,
        }
    }
}

impl OverlaySettings {
    /// Checks colors and ranges and lowercases the colors; `None` if anything is invalid.
    pub fn validated(mut self) -> Option<Self> {
        for color in [
            &mut self.accent_color,
            &mut self.text_color,
            &mut self.background_color,
        ] {
            if !is_hex_color(color) {
                return None;
            }
            color.make_ascii_lowercase();
        }
        let in_range = self.background_opacity <= MAX_BACKGROUND_OPACITY
            && (MIN_OVERLAY_SIZE..=MAX_OVERLAY_SIZE).contains(&self.size);
        in_range.then_some(self)
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
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
            .and_then(OverlaySettings::validated)
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
            serde_json::to_value(&settings.overlay).unwrap_or_default(),
        );
        store.save()
    });
    if result.is_err() {
        log::warn!("could not save the settings");
    }
}

/// Persists settings: the app writes to the Tauri store, tests record the calls in memory.
pub struct SettingsSaver(Box<dyn Fn(&Settings) + Send + Sync>);

impl SettingsSaver {
    pub fn new(save: impl Fn(&Settings) + Send + Sync + 'static) -> Self {
        Self(Box::new(save))
    }

    pub fn save(&self, settings: &Settings) {
        (self.0)(settings);
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
                "overlay": {
                    "showBackground": true,
                    "showProgress": true,
                    "accentColor": "#e82634",
                    "textColor": "#ffffff",
                    "backgroundColor": "#0c0c10",
                    "backgroundOpacity": 80,
                    "position": "center",
                    "size": 92,
                    "flagAnimation": "none",
                    "targetEffect": "none"
                }
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
                    ..OverlaySettings::default()
                },
            }
        );
    }

    #[test]
    fn fills_missing_overlay_fields_and_validates_the_rest() {
        let overlay = Settings::from_values(
            None,
            None,
            Some(json!({ "showProgress": false, "accentColor": "#00FF88", "size": 50, "flagAnimation": "wave" })),
        )
        .overlay;
        assert_eq!(
            overlay,
            OverlaySettings {
                show_progress: false,
                accent_color: "#00ff88".into(),
                size: 50,
                flag_animation: FlagAnimation::Wave,
                ..OverlaySettings::default()
            }
        );

        for invalid in [
            json!({ "size": 5 }),
            json!({ "backgroundOpacity": 101 }),
            json!({ "position": "left" }),
            json!({ "targetEffect": "fireworks" }),
            json!({ "textColor": "#fff" }),
        ] {
            assert_eq!(
                Settings::from_values(None, None, Some(invalid)).overlay,
                OverlaySettings::default()
            );
        }
    }

    #[test]
    fn replaces_invalid_values_with_defaults() {
        let invalid = [
            (json!(42), json!(0), json!({ "showBackground": "yes" })),
            (json!(""), json!(MAX_TARGET + 1), json!(null)),
            (json!("x".repeat(MAX_USERNAME_LENGTH + 1)), json!(-5), json!([true, false])),
            (json!(null), json!(12.5), json!({ "accentColor": "red" })),
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
