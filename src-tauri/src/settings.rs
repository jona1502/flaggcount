use std::collections::HashSet;
use std::hash::Hash;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::{Store, StoreExt};

/// Stored in the app data directory. Active votes are deliberately never persisted.
pub const SETTINGS_FILE: &str = "settings.json";
/// Copy of the 0.2 settings file, written once before it is migrated.
pub const SETTINGS_V1_BACKUP_FILE: &str = "settings.v1.backup.json";
/// Copy of a settings file that could not be read, written before it is replaced.
pub const SETTINGS_INVALID_BACKUP_FILE: &str = "settings.invalid.backup.json";
pub const SETTINGS_SCHEMA_VERSION: u8 = 2;

pub const DEFAULT_TARGET: u32 = 100;
pub const MIN_TARGET: u32 = 1;
pub const MAX_TARGET: u32 = 100_000;
/// Generous upper bound: profile URLs are accepted and normalized by the sidecar.
pub const MAX_USERNAME_LENGTH: usize = 100;

pub const MIN_OVERLAY_SIZE: u8 = 20;
pub const MAX_OVERLAY_SIZE: u8 = 100;
pub const MAX_BACKGROUND_OPACITY: u8 = 100;

/// Absolute upper bounds of the data model, mirroring `shared/profiles.ts`; plans may allow less.
pub const MAX_PROFILES: usize = 10;
pub const MAX_COUNTERS: usize = 4;
pub const MIN_POLL_OPTIONS: usize = 2;
pub const MAX_POLL_OPTIONS: usize = 6;
pub const MAX_OPTION_TRIGGERS: usize = 8;
pub const MAX_WITHDRAWAL_TRIGGERS: usize = 4;
pub const MAX_NAME_LENGTH: usize = 60;
/// Counted in UTF-16 code units, like JavaScript's `length`.
pub const MAX_TRIGGER_LENGTH: usize = 40;
const MAX_ID_LENGTH: usize = 64;
const MAX_TIMESTAMP_LENGTH: usize = 40;

pub const DEFAULT_PROFILE_ID: &str = "default";
pub const RED_FLAG_COUNTER_ID: &str = "red-flags";
pub const RED_FLAG_OPTION_ID: &str = "red-flag";
pub const RED_FLAG: &str = "\u{1F6A9}";
pub const WHITE_FLAG: &str = "\u{1F3F3}\u{FE0F}";
/// Timestamp of settings that were never saved, e.g. in tests.
pub const EPOCH_TIMESTAMP: &str = "1970-01-01T00:00:00.000Z";

/// Keys of the 0.2 settings; removed once a backup of them exists. `username` is still in use.
const LEGACY_KEYS: [&str; 2] = ["target", "overlay"];

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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OverlayTheme {
    #[default]
    Standard,
    Minimal,
    Glass,
    Neon,
    Scoreboard,
    VerticalPoll,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OverlayFont {
    #[default]
    System,
    Inter,
    SpaceGrotesk,
    RobotoSlab,
}

/// Appearance of the streaming overlay. Missing fields take their defaults, so settings saved
/// by older versions keep loading.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct OverlaySettings {
    pub theme: OverlayTheme,
    pub font: OverlayFont,
    pub logo_asset: Option<String>,
    pub background_asset: Option<String>,
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
            theme: OverlayTheme::Standard,
            font: OverlayFont::System,
            logo_asset: None,
            background_asset: None,
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
        let valid_asset = |asset: &Option<String>| asset.as_ref().is_none_or(|name| {
            let Some((stem, extension)) = name.rsplit_once('.') else { return false; };
            stem.len() == 32
                && stem.bytes().all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
                && matches!(extension, "png" | "jpg" | "webp")
        });
        (in_range && valid_asset(&self.logo_asset) && valid_asset(&self.background_asset)).then_some(self)
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub fn is_valid_id(value: &str) -> bool {
    (1..=MAX_ID_LENGTH).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn validated_name(value: &str) -> Option<String> {
    let name = value.trim();
    (1..=MAX_NAME_LENGTH)
        .contains(&name.chars().count())
        .then(|| name.to_string())
}

fn has_unique<T: Eq + Hash>(items: impl IntoIterator<Item = T>) -> bool {
    let mut seen = HashSet::new();
    items.into_iter().all(|item| seen.insert(item))
}

fn validated_list<T>(
    items: Vec<T>,
    min: usize,
    max: usize,
    validate: impl Fn(T) -> Option<T>,
) -> Option<Vec<T>> {
    if !(min..=max).contains(&items.len()) {
        return None;
    }
    items.into_iter().map(validate).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TriggerKind {
    Emoji,
    Text,
}

/// `Word` only matches whole words; emoji triggers always match anywhere in the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TriggerMatch {
    Contains,
    Word,
}

/// What a viewer writes in the chat to vote for an option or to withdraw their vote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Trigger {
    pub kind: TriggerKind,
    pub value: String,
    #[serde(rename = "match")]
    pub matching: TriggerMatch,
}

impl Trigger {
    pub fn emoji(value: &str) -> Self {
        Self {
            kind: TriggerKind::Emoji,
            value: value.to_string(),
            matching: TriggerMatch::Contains,
        }
    }

    /// Mirrors `parseTrigger` in `shared/voting/triggers.ts`. Rust has no Unicode emoji data, so
    /// emoji are only checked for letters and whitespace; the sidecar applies the full check.
    pub fn validated(mut self) -> Option<Self> {
        self.value = self.value.trim().to_string();
        if !(1..=MAX_TRIGGER_LENGTH).contains(&self.value.encode_utf16().count()) {
            return None;
        }
        match self.kind {
            TriggerKind::Emoji => {
                let valid = self.matching == TriggerMatch::Contains
                    && self.value.chars().any(|character| !character.is_ascii())
                    && !self
                        .value
                        .chars()
                        .any(|character| character.is_alphabetic() || character.is_whitespace());
                valid.then_some(self)
            }
            TriggerKind::Text => Some(self),
        }
    }

    /// Triggers with the same key match the same messages. Without NFKC this is slightly stricter
    /// than the sidecar's key, which catches the remaining duplicates.
    pub fn key(&self) -> String {
        match self.kind {
            TriggerKind::Emoji => self
                .value
                .chars()
                .filter(|character| !matches!(character, '\u{FE0E}' | '\u{FE0F}'))
                .collect(),
            TriggerKind::Text => self
                .value
                .to_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollOption {
    pub id: String,
    pub label: String,
    pub triggers: Vec<Trigger>,
    pub accent_color: String,
}

impl PollOption {
    pub fn validated(mut self) -> Option<Self> {
        if !is_valid_id(&self.id) || !is_hex_color(&self.accent_color) {
            return None;
        }
        self.label = validated_name(&self.label)?;
        self.triggers = validated_list(self.triggers, 1, MAX_OPTION_TRIGGERS, Trigger::validated)?;
        self.accent_color.make_ascii_lowercase();
        Some(self)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CounterMode {
    Single,
    Poll,
}

/// A single counter has exactly one option; a poll has two to six.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterDefinition {
    pub id: String,
    pub name: String,
    pub mode: CounterMode,
    /// `None` counts without a target.
    pub target: Option<u32>,
    pub options: Vec<PollOption>,
    pub withdrawal_triggers: Vec<Trigger>,
    pub overlay: OverlaySettings,
}

impl CounterDefinition {
    /// The counter every installation starts with, matching FlagCount 0.2: 🚩 votes, 🏳️ withdraws.
    pub fn red_flags(target: u32, overlay: OverlaySettings) -> Self {
        Self {
            id: RED_FLAG_COUNTER_ID.into(),
            name: "Rote Flaggen".into(),
            mode: CounterMode::Single,
            target: Some(target),
            options: vec![PollOption {
                id: RED_FLAG_OPTION_ID.into(),
                label: "Rote Flagge".into(),
                triggers: vec![Trigger::emoji(RED_FLAG)],
                accent_color: overlay.accent_color.clone(),
            }],
            withdrawal_triggers: vec![Trigger::emoji(WHITE_FLAG)],
            overlay,
        }
    }

    /// Mirrors `parseCounterDefinition` in `shared/profiles.ts`.
    pub fn validated(mut self) -> Option<Self> {
        if !is_valid_id(&self.id) || self.target.is_some_and(|target| !is_valid_target(target)) {
            return None;
        }
        self.name = validated_name(&self.name)?;
        let (min_options, max_options) = match self.mode {
            CounterMode::Single => (1, 1),
            CounterMode::Poll => (MIN_POLL_OPTIONS, MAX_POLL_OPTIONS),
        };
        self.options = validated_list(self.options, min_options, max_options, PollOption::validated)?;
        self.withdrawal_triggers = validated_list(
            self.withdrawal_triggers,
            0,
            MAX_WITHDRAWAL_TRIGGERS,
            Trigger::validated,
        )?;
        self.overlay = self.overlay.validated()?;

        let triggers = self
            .options
            .iter()
            .flat_map(|option| &option.triggers)
            .chain(&self.withdrawal_triggers)
            .map(Trigger::key);
        (has_unique(self.options.iter().map(|option| option.id.as_str())) && has_unique(triggers))
            .then_some(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamProfile {
    pub id: String,
    pub name: String,
    pub counters: Vec<CounterDefinition>,
    pub created_at: String,
    pub updated_at: String,
}

impl StreamProfile {
    pub fn validated(mut self) -> Option<Self> {
        let timestamps_valid = [&self.created_at, &self.updated_at]
            .iter()
            .all(|timestamp| (1..=MAX_TIMESTAMP_LENGTH).contains(&timestamp.len()));
        if !is_valid_id(&self.id) || !timestamps_valid {
            return None;
        }
        self.name = validated_name(&self.name)?;
        self.counters = validated_list(self.counters, 1, MAX_COUNTERS, CounterDefinition::validated)?;
        has_unique(self.counters.iter().map(|counter| counter.id.as_str())).then_some(self)
    }
}

/// Settings of FlagCount 0.2, only read to migrate them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsV1 {
    pub username: String,
    pub target: u32,
    pub overlay: OverlaySettings,
}

impl Default for SettingsV1 {
    fn default() -> Self {
        Self {
            username: String::new(),
            target: DEFAULT_TARGET,
            overlay: OverlaySettings::default(),
        }
    }
}

impl SettingsV1 {
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

/// How stored settings were turned into the current schema; anything but `None` is written back.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Migration {
    None,
    FromV1,
    ReplacedInvalid,
}

/// Settings persisted between app starts, mirroring `Settings` in `shared/profiles.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: u8,
    /// Last TikTok username the user connected to; empty if none.
    pub username: String,
    pub active_profile_id: String,
    #[serde(default)]
    pub telemetry_enabled: bool,
    /// Never empty.
    pub profiles: Vec<StreamProfile>,
}

impl Default for Settings {
    fn default() -> Self {
        Self::migrated(SettingsV1::default(), EPOCH_TIMESTAMP)
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
    /// Moves the settings of FlagCount 0.2 into one profile with a single red flag counter.
    pub fn migrated(settings: SettingsV1, now: &str) -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            username: settings.username,
            active_profile_id: DEFAULT_PROFILE_ID.into(),
            telemetry_enabled: false,
            profiles: vec![StreamProfile {
                id: DEFAULT_PROFILE_ID.into(),
                name: "Standard".into(),
                counters: vec![CounterDefinition::red_flags(settings.target, settings.overlay)],
                created_at: now.into(),
                updated_at: now.into(),
            }],
        }
    }

    /// Reads a current settings document; `None` if it is incomplete or invalid.
    pub fn from_document(
        username: Option<Value>,
        active_profile_id: Option<Value>,
        profiles: Option<Value>,
        telemetry_enabled: Option<Value>,
    ) -> Option<Self> {
        let profiles = profiles
            .filter(|value| value.as_array().is_some_and(|items| items.iter().all(Value::is_object)))
            .and_then(|value| serde_json::from_value::<Vec<StreamProfile>>(value).ok())
            .and_then(|profiles| validated_list(profiles, 1, MAX_PROFILES, StreamProfile::validated))
            .filter(|profiles| has_unique(profiles.iter().map(|profile| profile.id.as_str())))?;
        let active_profile_id = active_profile_id
            .as_ref()
            .and_then(Value::as_str)
            .filter(|id| profiles.iter().any(|profile| profile.id == *id))
            .unwrap_or(&profiles[0].id)
            .to_string();

        Some(Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            username: username
                .as_ref()
                .and_then(Value::as_str)
                .and_then(normalize_username)
                .unwrap_or_default(),
            active_profile_id,
            telemetry_enabled: telemetry_enabled.as_ref().and_then(Value::as_bool).unwrap_or(false),
            profiles,
        })
    }

    /// Reads stored settings of any version from the store keys. A damaged current document is
    /// replaced by a fresh profile that keeps whatever 0.2 fields are still readable.
    pub fn resolve(read: impl Fn(&str) -> Option<Value>, now: &str) -> (Self, Migration) {
        let legacy = || SettingsV1::from_values(read("username"), read("target"), read("overlay"));
        match read("schemaVersion") {
            None => (Self::migrated(legacy(), now), Migration::FromV1),
            Some(version) => {
                let current = (version.as_u64() == Some(u64::from(SETTINGS_SCHEMA_VERSION)))
                    .then(|| Self::from_document(read("username"), read("activeProfileId"), read("profiles"), read("telemetryEnabled")))
                    .flatten();
                match current {
                    Some(settings) => (settings, Migration::None),
                    None => (Self::migrated(legacy(), now), Migration::ReplacedInvalid),
                }
            }
        }
    }

    pub fn active_profile(&self) -> Option<&StreamProfile> {
        self.profiles
            .iter()
            .find(|profile| profile.id == self.active_profile_id)
            .or_else(|| self.profiles.first())
    }

    /// The first counter of the active profile: the one the dashboard and the overlay show today.
    pub fn primary_counter(&self) -> Option<&CounterDefinition> {
        self.active_profile().and_then(|profile| profile.counters.first())
    }

    pub fn update_primary_counter(&mut self, now: &str, change: impl FnOnce(&mut CounterDefinition)) {
        let profile_id = self.active_profile_id.clone();
        self.update_profile_counter(&profile_id, now, change);
    }

    /// Changes the first counter of a profile; an unknown id changes the first profile.
    pub fn update_profile_counter(
        &mut self,
        profile_id: &str,
        now: &str,
        change: impl FnOnce(&mut CounterDefinition),
    ) {
        let index = self
            .profiles
            .iter()
            .position(|profile| profile.id == profile_id)
            .unwrap_or(0);
        if let Some(profile) = self.profiles.get_mut(index) {
            if let Some(counter) = profile.counters.first_mut() {
                change(counter);
                profile.updated_at = now.into();
            }
        }
    }
}

/// Current UTC time as an RFC 3339 timestamp with milliseconds, like JavaScript's `toISOString`.
pub fn now_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0);
    format_timestamp(millis)
}

pub fn format_timestamp(millis: u64) -> String {
    const DAY_MS: u64 = 86_400_000;
    let (year, month, day) = civil_from_days(i64::try_from(millis / DAY_MS).unwrap_or(0));
    let time = millis % DAY_MS;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        time / 3_600_000,
        time / 60_000 % 60,
        time / 1000 % 60,
        time % 1000
    )
}

/// Converts days since 1970-01-01 into a proleptic Gregorian date (Howard Hinnant's algorithm).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 { month_index + 3 } else { month_index - 9 };
    (year_of_era + era * 400 + i64::from(month <= 2), month, day)
}

/// Copies the settings file before it is rewritten. `true` if a backup exists afterwards or there
/// was no file to back up.
fn backup_settings_file<R: Runtime>(app: &AppHandle<R>, name: &str, overwrite: bool) -> bool {
    let Ok(directory) = app.path().app_data_dir() else {
        return false;
    };
    let source = directory.join(SETTINGS_FILE);
    let backup = directory.join(name);
    if !source.exists() || (backup.exists() && !overwrite) {
        return true;
    }
    std::fs::copy(source, backup).is_ok()
}

fn write_settings<R: Runtime>(store: &Store<R>, settings: &Settings) -> tauri_plugin_store::Result<()> {
    store.set("schemaVersion", settings.schema_version);
    store.set("username", settings.username.clone());
    store.set("activeProfileId", settings.active_profile_id.clone());
    store.set(
        "profiles",
        serde_json::to_value(&settings.profiles).unwrap_or_default(),
    );
    store.save()
}

/// Loads the settings and migrates older or damaged files once, after backing them up. Without a
/// backup, 0.2 values stay in the file next to the migrated ones and damaged files stay untouched.
pub fn load<R: Runtime>(app: &AppHandle<R>) -> Settings {
    let now = now_timestamp();
    let Ok(store) = app.store(SETTINGS_FILE) else {
        log::warn!("could not open the settings store, using defaults");
        return Settings::migrated(SettingsV1::default(), &now);
    };

    let (settings, migration) = Settings::resolve(|key| store.get(key), &now);
    let (backup_name, overwrite) = match migration {
        Migration::None => return settings,
        Migration::FromV1 => (SETTINGS_V1_BACKUP_FILE, false),
        Migration::ReplacedInvalid => (SETTINGS_INVALID_BACKUP_FILE, true),
    };

    if backup_settings_file(app, backup_name, overwrite) {
        for key in LEGACY_KEYS {
            store.delete(key);
        }
    } else if migration == Migration::ReplacedInvalid {
        log::warn!("could not back up the unreadable settings; leaving the file untouched");
        return settings;
    } else {
        log::warn!("could not back up the old settings; keeping them next to the migrated ones");
    }

    if write_settings(&store, &settings).is_ok() {
        log::info!("migrated the settings to schema version {SETTINGS_SCHEMA_VERSION}");
    } else {
        log::warn!("could not save the migrated settings");
    }
    settings
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &Settings) {
    let result = app
        .store(SETTINGS_FILE)
        .and_then(|store| write_settings(&store, settings));
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
    use serde_json::{json, Map};

    const NOW: &str = "2026-09-13T21:30:00.123Z";

    fn resolve(stored: Value) -> (Settings, Migration) {
        let map: Map<String, Value> = stored.as_object().cloned().unwrap_or_default();
        Settings::resolve(|key| map.get(key).cloned(), NOW)
    }

    fn stored(settings: &Settings) -> Value {
        json!({
            "schemaVersion": settings.schema_version,
            "username": settings.username,
            "activeProfileId": settings.active_profile_id,
            "profiles": settings.profiles,
        })
    }

    fn poll(options: usize) -> CounterDefinition {
        CounterDefinition {
            id: "poll".into(),
            name: "Umfrage".into(),
            mode: CounterMode::Poll,
            target: None,
            options: (0..options)
                .map(|index| PollOption {
                    id: format!("option-{index}"),
                    label: format!("Option {index}"),
                    triggers: vec![Trigger {
                        kind: TriggerKind::Text,
                        value: format!("wahl{index}"),
                        matching: TriggerMatch::Word,
                    }],
                    accent_color: "#112233".into(),
                })
                .collect(),
            withdrawal_triggers: vec![],
            overlay: OverlaySettings::default(),
        }
    }

    #[test]
    fn migrates_the_settings_of_version_0_2_into_one_profile() {
        let (settings, migration) = resolve(json!({
            "username": "  @streamer ",
            "target": 250,
            "overlay": { "showBackground": false, "accentColor": "#00FF88" }
        }));

        assert_eq!(migration, Migration::FromV1);
        assert_eq!(settings.schema_version, SETTINGS_SCHEMA_VERSION);
        assert_eq!(settings.username, "@streamer");
        assert_eq!(settings.active_profile_id, DEFAULT_PROFILE_ID);
        let profile = settings.active_profile().unwrap();
        assert_eq!((profile.created_at.as_str(), profile.updated_at.as_str()), (NOW, NOW));
        let counter = settings.primary_counter().unwrap();
        assert_eq!(counter.mode, CounterMode::Single);
        assert_eq!(counter.target, Some(250));
        assert!(!counter.overlay.show_background);
        assert_eq!(counter.options[0].accent_color, "#00ff88");
        assert_eq!(counter.options[0].triggers, vec![Trigger::emoji(RED_FLAG)]);
        assert_eq!(counter.withdrawal_triggers, vec![Trigger::emoji(WHITE_FLAG)]);
    }

    #[test]
    fn migrating_twice_changes_nothing() {
        let (migrated, _) = resolve(json!({ "target": 12 }));

        let (loaded, migration) = resolve(stored(&migrated));

        assert_eq!(migration, Migration::None);
        assert_eq!(loaded, migrated);
    }

    #[test]
    fn matches_the_document_format_of_the_shared_typescript_model() {
        let value = serde_json::to_value(Settings::default()).unwrap();

        assert_eq!(
            value,
            json!({
                "schemaVersion": 2,
                "username": "",
                "activeProfileId": "default",
                "telemetryEnabled": false,
                "profiles": [{
                    "id": "default",
                    "name": "Standard",
                    "counters": [{
                        "id": "red-flags",
                        "name": "Rote Flaggen",
                        "mode": "single",
                        "target": 100,
                        "options": [{
                            "id": "red-flag",
                            "label": "Rote Flagge",
                            "triggers": [{ "kind": "emoji", "value": RED_FLAG, "match": "contains" }],
                            "accentColor": "#e82634"
                        }],
                        "withdrawalTriggers": [{ "kind": "emoji", "value": WHITE_FLAG, "match": "contains" }],
                        "overlay": serde_json::to_value(OverlaySettings::default()).unwrap()
                    }],
                    "createdAt": EPOCH_TIMESTAMP,
                    "updatedAt": EPOCH_TIMESTAMP
                }]
            })
        );
    }

    #[test]
    fn replaces_a_damaged_document_but_keeps_readable_values() {
        for profiles in [json!([]), json!("broken"), json!([{ "id": "x" }])] {
            let (settings, migration) = resolve(json!({
                "schemaVersion": 2,
                "username": "streamer",
                "target": 30,
                "profiles": profiles
            }));

            assert_eq!(migration, Migration::ReplacedInvalid);
            assert_eq!(settings.username, "streamer");
            assert_eq!(settings.primary_counter().unwrap().target, Some(30));
        }
        assert_eq!(resolve(json!({ "schemaVersion": 3 })).1, Migration::ReplacedInvalid);
    }

    #[test]
    fn falls_back_to_the_first_profile_if_the_active_one_is_missing() {
        let mut document = stored(&Settings::default());
        document["activeProfileId"] = json!("gone");

        assert_eq!(resolve(document).0.active_profile_id, DEFAULT_PROFILE_ID);
    }

    #[test]
    fn validates_counters_like_the_sidecar() {
        assert!(poll(2).validated().is_some());
        assert!(poll(6).validated().is_some());
        assert!(poll(1).validated().is_none());
        assert!(poll(7).validated().is_none());

        let mut single = CounterDefinition::red_flags(10, OverlaySettings::default());
        single.options.push(poll(2).options[0].clone());
        assert!(single.validated().is_none());

        let mut duplicate = poll(2);
        duplicate.options[1].triggers[0].value = " WAHL0 ".into();
        assert!(duplicate.validated().is_none());

        let mut withdrawal = CounterDefinition::red_flags(10, OverlaySettings::default());
        withdrawal.withdrawal_triggers.push(Trigger::emoji("\u{1F6A9}\u{FE0F}"));
        assert!(withdrawal.validated().is_none());

        let mut long_name = poll(2);
        long_name.name = "x".repeat(MAX_NAME_LENGTH + 1);
        assert!(long_name.validated().is_none());
    }

    #[test]
    fn validates_triggers() {
        let text = |value: &str| Trigger {
            kind: TriggerKind::Text,
            value: value.into(),
            matching: TriggerMatch::Contains,
        };
        assert_eq!(text("  Ja ").validated().unwrap().value, "Ja");
        assert!(text("   ").validated().is_none());
        assert!(text(&"x".repeat(MAX_TRIGGER_LENGTH + 1)).validated().is_none());
        assert!(Trigger::emoji("\u{1F525}").validated().is_some());
        assert!(Trigger::emoji("ja").validated().is_none());
        assert!(Trigger::emoji("\u{1F525} \u{1F525}").validated().is_none());
        assert_eq!(Trigger::emoji(WHITE_FLAG).key(), "\u{1F3F3}");
    }

    #[test]
    fn updates_the_primary_counter_of_the_active_profile() {
        let mut settings = Settings::default();

        settings.update_primary_counter(NOW, |counter| counter.target = Some(5));

        assert_eq!(settings.primary_counter().unwrap().target, Some(5));
        assert_eq!(settings.active_profile().unwrap().updated_at, NOW);
    }

    #[test]
    fn formats_timestamps_like_javascript() {
        assert_eq!(format_timestamp(0), EPOCH_TIMESTAMP);
        assert_eq!(format_timestamp(951_782_400_000), "2000-02-29T00:00:00.000Z");
        assert_eq!(format_timestamp(1_789_335_000_123), NOW);
    }

    #[test]
    fn reads_valid_0_2_values_and_replaces_invalid_ones() {
        let settings = SettingsV1::from_values(
            Some(json!("  @streamer ")),
            Some(json!(250)),
            Some(json!({ "showProgress": false, "size": 50, "flagAnimation": "wave" })),
        );
        assert_eq!(
            settings,
            SettingsV1 {
                username: "@streamer".into(),
                target: 250,
                overlay: OverlaySettings {
                    show_progress: false,
                    size: 50,
                    flag_animation: FlagAnimation::Wave,
                    ..OverlaySettings::default()
                },
            }
        );

        let invalid = [
            (json!(42), json!(0), json!({ "showBackground": "yes" })),
            (json!(""), json!(MAX_TARGET + 1), json!(null)),
            (json!("x".repeat(MAX_USERNAME_LENGTH + 1)), json!(-5), json!([true, false])),
            (json!(null), json!(12.5), json!({ "accentColor": "red" })),
            (json!(null), json!(null), json!({ "size": 5 })),
            (json!(null), json!(null), json!({ "position": "left" })),
        ];
        for (username, target, overlay) in invalid {
            assert_eq!(
                SettingsV1::from_values(Some(username), Some(target), Some(overlay)),
                SettingsV1::default()
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
