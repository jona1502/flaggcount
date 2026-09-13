use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use serde_json::Value;

use crate::license::{
    is_allowed_external_url, LicenseCredentials, LicenseState, LicenseVault, StoredLicense,
};
use crate::entitlements::profile_limit;
use crate::profiles::effective_profile;
use crate::settings::{CounterDefinition, CounterMode, Settings, DEFAULT_TARGET};

/// Line protocol version this app speaks; the sidecar reports its own on `ready`.
pub const PROTOCOL_VERSION: u32 = 4;

/// Name of the bundled Node.js sidecar (see `bundle.externalBin`).
pub const SIDECAR_NAME: &str = "flagcount-sidecar";
/// Tells the sidecar where to keep its files, such as the key of the online overlay.
pub const DATA_DIR_ENV: &str = "FLAGCOUNT_DATA_DIR";
/// The only window that receives app events.
pub const MAIN_WINDOW: &str = "main";
pub const STATE_CHANGED_EVENT: &str = "state-changed";
pub const APP_ERROR_EVENT: &str = "app-error";
/// Consecutive restarts before the app stops reviving a crashing sidecar.
pub const MAX_RESTART_ATTEMPTS: u32 = 5;

/// A sidecar that ran this long counts as healthy again and gets a fresh restart budget.
const STABLE_RUNTIME: Duration = Duration::from_secs(60);
const MAX_LOG_MESSAGE_CHARS: usize = 300;

/// Commands understood by the sidecar, sent as one JSON object per stdin line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SidecarCommand {
    Connect { username: String },
    Disconnect,
    /// Without ids the vote goes to the first counter; single counters need no option id.
    #[serde(rename_all = "camelCase")]
    AddManualVote {
        #[serde(skip_serializing_if = "Option::is_none")]
        counter_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        option_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    RemoveManualVote {
        #[serde(skip_serializing_if = "Option::is_none")]
        counter_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        option_id: Option<String>,
    },
    /// Without a counter id every round starts over.
    #[serde(rename_all = "camelCase")]
    Reset {
        #[serde(skip_serializing_if = "Option::is_none")]
        counter_id: Option<String>,
    },
    /// The counters of the active profile; running rounds of counters that keep their id continue.
    ConfigureCounters { counters: Vec<CounterDefinition> },
    /// The stored license, sent after every start. The secret only travels over the private stdin pipe.
    #[serde(rename_all = "camelCase")]
    ConfigureLicense {
        installation_id: String,
        credentials: Option<LicenseCredentials>,
        entitlement: Option<Value>,
    },
    #[serde(rename_all = "camelCase")]
    ActivateLicense {
        code: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        replace_installation_id: Option<String>,
    },
    RefreshLicense,
    DeactivateLicense,
    OpenCustomerPortal,
    SetTelemetryEnabled { enabled: bool },
    GetState,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectInfo {
    pub attempt: u32,
    pub max_attempts: u32,
    pub delay_ms: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectionState {
    pub status: ConnectionStatus,
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reconnect: Option<ReconnectInfo>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoteSnapshot {
    pub count: u32,
    pub target: u32,
    pub round_id: String,
    pub target_reached: bool,
}

impl Default for VoteSnapshot {
    fn default() -> Self {
        Self {
            count: 0,
            target: DEFAULT_TARGET,
            round_id: String::new(),
            target_reached: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionSnapshot {
    pub option_id: String,
    pub label: String,
    pub count: u32,
}

/// Aggregated counts of one counter; the sidecar never sends viewer identities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterSnapshot {
    pub counter_id: String,
    pub name: String,
    pub mode: CounterMode,
    pub options: Vec<OptionSnapshot>,
    pub total_count: u32,
    pub target: Option<u32>,
    pub target_reached: bool,
    pub round_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    pub fn sidecar_unavailable() -> Self {
        Self::new(
            "sidecar-unavailable",
            "The TikTok connection service is not running",
        )
    }
}

/// Sanitized state sent to the UI.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    pub sidecar_running: bool,
    pub connection: ConnectionState,
    /// The first counter in the single-count format of 0.2.
    pub votes: VoteSnapshot,
    pub counters: Vec<CounterSnapshot>,
    pub overlay_url: Option<String>,
    /// Online overlay mirrored through the FlagCount server, e.g. for TikTok LIVE Studio.
    pub public_overlay_url: Option<String>,
    /// Online Pro overlays keyed by counter id and `all` for the overview.
    pub counter_overlay_urls: BTreeMap<String, String>,
    pub settings: Settings,
    /// Plan and license status; never the activation code or secret.
    pub license: LicenseState,
}

/// URL of the streaming browser/link source served by the sidecar.
pub fn overlay_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/overlay")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

/// Events emitted by the sidecar. Deliberately not `Debug`: `Ready` carries the session token.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SidecarEvent {
    Ready {
        #[serde(default, rename = "protocolVersion")]
        protocol_version: Option<u32>,
        port: u16,
        token: String,
        #[serde(default, rename = "publicOverlayUrl")]
        public_overlay_url: Option<String>,
    },
    Status { connection: ConnectionState },
    Votes { votes: VoteSnapshot },
    Counters { counters: Vec<CounterSnapshot> },
    OverlayUrls { urls: BTreeMap<String, String> },
    License { license: LicenseState },
    /// Credentials and entitlement to store on this computer; `None` removes them.
    LicenseCredentials {
        credentials: Option<LicenseCredentials>,
        entitlement: Option<Value>,
    },
    OpenUrl { url: String },
    Error { error: AppError },
    Log { level: LogLevel, message: String },
}

/// Access data for the sidecar's local server, valid for this app start only.
pub struct SidecarSession {
    pub port: u16,
    pub token: String,
}

pub enum StateUpdate {
    State,
    Error(AppError),
    Log(LogLevel, String),
    Credentials(Option<LicenseCredentials>, Option<Value>),
    OpenUrl(String),
    None,
}

pub fn apply_event(
    state: &mut AppState,
    session: &mut Option<SidecarSession>,
    event: SidecarEvent,
) -> StateUpdate {
    match event {
        SidecarEvent::Ready {
            protocol_version,
            port,
            token,
            public_overlay_url,
        } => {
            if protocol_version != Some(PROTOCOL_VERSION) {
                log::warn!(
                    "the sidecar speaks protocol version {protocol_version:?}, expected {PROTOCOL_VERSION}"
                );
            }
            *session = Some(SidecarSession { port, token });
            state.overlay_url = Some(overlay_url(port));
            state.public_overlay_url = public_overlay_url.filter(|url| url.starts_with("https://"));
            StateUpdate::State
        }
        SidecarEvent::Status { connection } => {
            state.connection = connection;
            StateUpdate::State
        }
        SidecarEvent::Votes { votes } => {
            state.votes = votes;
            StateUpdate::State
        }
        SidecarEvent::Counters { counters } => {
            state.counters = counters;
            StateUpdate::State
        }
        SidecarEvent::OverlayUrls { urls } => {
            state.counter_overlay_urls = urls
                .into_iter()
                .filter(|(scope, url)| {
                    !scope.is_empty()
                        && scope.len() <= 64
                        && scope
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
                        && url.starts_with("https://")
                })
                .take(5)
                .collect();
            StateUpdate::State
        }
        SidecarEvent::License { license } => {
            state.license = license;
            StateUpdate::State
        }
        SidecarEvent::LicenseCredentials {
            credentials,
            entitlement,
        } => StateUpdate::Credentials(credentials, entitlement),
        SidecarEvent::OpenUrl { url } => StateUpdate::OpenUrl(url),
        SidecarEvent::Error { error } => StateUpdate::Error(error),
        SidecarEvent::Log { level, message } => {
            StateUpdate::Log(level, message.chars().take(MAX_LOG_MESSAGE_CHARS).collect())
        }
    }
}

/// Delay before the n-th consecutive restart: 1 s, 2 s, 4 s, 8 s, then 16 s.
pub fn restart_delay(attempt: u32) -> Duration {
    Duration::from_secs(1u64 << attempt.saturating_sub(1).min(4))
}

/// Commands that bring a freshly started sidecar in line with the saved settings, and, after
/// a crash, back to the stream the user was connected to.
pub fn startup_commands(
    settings: &Settings,
    license_state: &LicenseState,
    license: &StoredLicense,
    reconnect_to: Option<&str>,
) -> Vec<SidecarCommand> {
    let mut commands: Vec<SidecarCommand> = configure_counters(settings, license_state).into_iter().collect();
    commands.push(SidecarCommand::SetTelemetryEnabled {
        enabled: settings.telemetry_enabled,
    });
    commands.push(SidecarCommand::ConfigureLicense {
        installation_id: license.installation_id.clone(),
        credentials: license.credentials.clone(),
        entitlement: license.entitlement.clone(),
    });
    if let Some(username) = reconnect_to {
        commands.push(SidecarCommand::Connect {
            username: username.to_string(),
        });
    }
    commands
}

/// Sends the counters of the profile the plan allows: the active one, or the first after a downgrade.
pub fn configure_counters(settings: &Settings, license: &LicenseState) -> Option<SidecarCommand> {
    effective_profile(settings, license).map(|profile| SidecarCommand::ConfigureCounters {
        counters: profile.counters.clone(),
    })
}

/// Becoming Pro runs the chosen profile at once. Losing Pro waits for the next change or start, so a
/// running stream keeps its counters.
pub fn counters_after_license_change(
    settings: &Settings,
    before: &LicenseState,
    after: &LicenseState,
) -> Option<SidecarCommand> {
    let previous = effective_profile(settings, before).map(|profile| profile.id.as_str());
    let current = effective_profile(settings, after).map(|profile| profile.id.as_str());
    (previous != current && profile_limit(after) > profile_limit(before))
        .then(|| configure_counters(settings, after))
        .flatten()
}

/// The stream the user wants to be connected to, so a restarted sidecar can resume it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DesiredConnection {
    pub username: Option<String>,
}

impl DesiredConnection {
    pub fn remember(&mut self, command: &SidecarCommand) {
        match command {
            SidecarCommand::Connect { username } => self.username = Some(username.clone()),
            SidecarCommand::Disconnect => self.username = None,
            _ => {}
        }
    }
}

#[derive(Default)]
struct Inner {
    child: Option<CommandChild>,
    session: Option<SidecarSession>,
    state: AppState,
    license: StoredLicense,
    desired: DesiredConnection,
    stopping: bool,
    started_at: Option<Instant>,
    restart_attempts: u32,
    restore_pending: bool,
}

enum Outcome {
    State(AppState),
    Error(AppError),
    Log(LogLevel, String),
    SaveLicense(StoredLicense),
    OpenUrl(String),
    Nothing,
}

/// Owns the sidecar process and the latest state it reported.
#[derive(Default)]
pub struct Sidecar {
    inner: Mutex<Inner>,
}

impl Sidecar {
    /// Uses the loaded settings for the UI and every sidecar start.
    pub fn init_settings(&self, settings: Settings) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.state.settings = settings;
        }
    }

    /// Uses the stored license for every sidecar start.
    pub fn init_license(&self, license: StoredLicense) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.license = license;
        }
    }

    /// Applies a change that may be refused, e.g. by the plan's limits. On an error nothing changes.
    pub fn try_update_settings<R: Runtime, T>(
        &self,
        app: &AppHandle<R>,
        change: impl FnOnce(&mut Settings, &LicenseState) -> Result<T, AppError>,
    ) -> Result<(T, Settings), AppError> {
        let (value, state) = {
            let mut inner = self.lock()?;
            let mut settings = inner.state.settings.clone();
            let value = change(&mut settings, &inner.state.license)?;
            inner.state.settings = settings;
            (value, inner.state.clone())
        };
        emit_state(app, &state);
        Ok((value, state.settings))
    }

    /// Changes the settings, notifies the UI and returns the result for saving.
    pub fn update_settings<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        change: impl FnOnce(&mut Settings),
    ) -> Settings {
        let state = match self.inner.lock() {
            Ok(mut inner) => {
                change(&mut inner.state.settings);
                inner.state.clone()
            }
            Err(_) => return Settings::default(),
        };
        emit_state(app, &state);
        state.settings
    }

    pub fn start<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), AppError> {
        let state = {
            let mut inner = self.lock()?;
            if inner.child.is_some() {
                return Ok(());
            }

            let (mut events, child) = app
                .shell()
                .sidecar(SIDECAR_NAME)
                .map(|command| match app.path().app_data_dir() {
                    Ok(dir) => command.env(DATA_DIR_ENV, dir),
                    Err(_) => command,
                })
                .and_then(|command| command.spawn())
                .map_err(|_| AppError::sidecar_unavailable())?;

            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    let sidecar = app_handle.state::<Sidecar>();
                    match event {
                        CommandEvent::Stdout(line) => sidecar.handle_stdout(&app_handle, &line),
                        CommandEvent::Stderr(_line) => {
                            // Raw library output may contain usernames or chat content, so it
                            // is only shown on the console of debug builds and never persisted.
                            #[cfg(debug_assertions)]
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&_line).trim_end());
                        }
                        CommandEvent::Error(_) => log::warn!("failed to read sidecar output"),
                        CommandEvent::Terminated(payload) => {
                            sidecar.handle_terminated(&app_handle, payload.code);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            inner.child = Some(child);
            inner.stopping = false;
            inner.started_at = Some(Instant::now());
            inner.state.sidecar_running = true;
            inner.state.clone()
        };

        log::info!("sidecar started");
        emit_state(app, &state);
        Ok(())
    }

    pub fn send(&self, command: &SidecarCommand) -> Result<(), AppError> {
        let mut line =
            serde_json::to_vec(command).map_err(|error| AppError::new("unknown", error.to_string()))?;
        line.push(b'\n');

        let mut inner = self.lock()?;
        inner.desired.remember(command);
        let child = inner
            .child
            .as_mut()
            .ok_or_else(AppError::sidecar_unavailable)?;
        child.write(&line).map_err(|_| {
            log::warn!("failed to write a command to the sidecar");
            AppError::sidecar_unavailable()
        })
    }

    pub fn state(&self) -> AppState {
        self.lock()
            .map(|inner| inner.state.clone())
            .unwrap_or_default()
    }

    pub fn stop(&self) {
        let child = self.inner.lock().ok().and_then(|mut inner| {
            inner.stopping = true;
            inner.child.take()
        });
        if let Some(child) = child {
            let _ = child.kill();
        }
    }

    fn handle_stdout<R: Runtime>(&self, app: &AppHandle<R>, line: &[u8]) {
        let Ok(event) = serde_json::from_slice::<SidecarEvent>(line) else {
            log::warn!("ignoring malformed sidecar event");
            return;
        };

        let (outcome, startup) = {
            let Ok(mut guard) = self.inner.lock() else {
                return;
            };
            let inner = &mut *guard;
            let is_ready = matches!(event, SidecarEvent::Ready { .. });
            let license_before =
                matches!(event, SidecarEvent::License { .. }).then(|| inner.state.license.clone());

            if let SidecarEvent::Status { connection } = &event {
                // Once a connection has been closed for good, a restart must not reopen it.
                if connection.status == ConnectionStatus::Disconnected
                    && inner.state.connection.status != ConnectionStatus::Disconnected
                {
                    inner.desired.username = None;
                }
            }

            let outcome = match apply_event(&mut inner.state, &mut inner.session, event) {
                StateUpdate::State => Outcome::State(inner.state.clone()),
                StateUpdate::Error(error) => Outcome::Error(error),
                StateUpdate::Log(level, message) => Outcome::Log(level, message),
                StateUpdate::Credentials(credentials, entitlement) => {
                    inner.license.credentials = credentials;
                    inner.license.entitlement = entitlement;
                    Outcome::SaveLicense(inner.license.clone())
                }
                StateUpdate::OpenUrl(url) => Outcome::OpenUrl(url),
                StateUpdate::None => Outcome::Nothing,
            };
            let follow_up = license_before.and_then(|before| {
                counters_after_license_change(&inner.state.settings, &before, &inner.state.license)
            });
            let mut startup = if is_ready {
                let reconnect = std::mem::take(&mut inner.restore_pending);
                let reconnect_to = if reconnect {
                    inner.desired.username.as_deref()
                } else {
                    None
                };
                startup_commands(&inner.state.settings, &inner.state.license, &inner.license, reconnect_to)
            } else {
                Vec::new()
            };
            startup.extend(follow_up);
            (outcome, startup)
        };

        match outcome {
            Outcome::State(state) => emit_state(app, &state),
            Outcome::Error(error) => {
                log::warn!("sidecar reported error: {}", error.code);
                emit_error(app, &error);
            }
            Outcome::Log(level, message) => log_sidecar_message(level, &message),
            Outcome::SaveLicense(license) => self.save_license(app, &license),
            Outcome::OpenUrl(url) => {
                if let Err(error) = open_external(app, &url) {
                    emit_error(app, &error);
                }
            }
            Outcome::Nothing => {}
        }

        for command in startup {
            if let Err(error) = self.send(&command) {
                log::warn!("failed to configure the sidecar: {}", error.code);
            }
        }
    }

    fn handle_terminated<R: Runtime>(&self, app: &AppHandle<R>, code: Option<i32>) {
        let (state, restart_in) = {
            let Ok(mut inner) = self.inner.lock() else {
                return;
            };
            inner.child = None;
            inner.session = None;
            inner.state.sidecar_running = false;
            inner.state.overlay_url = None;
            inner.state.public_overlay_url = None;
            inner.state.counter_overlay_urls.clear();
            inner.state.connection.status = ConnectionStatus::Disconnected;
            inner.state.connection.reconnect = None;
            if inner.stopping {
                return;
            }

            if inner
                .started_at
                .is_some_and(|started| started.elapsed() >= STABLE_RUNTIME)
            {
                inner.restart_attempts = 0;
            }
            inner.restart_attempts += 1;
            let restart_in = (inner.restart_attempts <= MAX_RESTART_ATTEMPTS)
                .then(|| restart_delay(inner.restart_attempts));
            (inner.state.clone(), restart_in)
        };

        emit_state(app, &state);

        match restart_in {
            Some(delay) => {
                log::warn!(
                    "sidecar exited unexpectedly (exit code {code:?}), restarting in {} ms",
                    delay.as_millis()
                );
                let app = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(delay);
                    app.state::<Sidecar>().restart(&app);
                });
            }
            None => {
                log::error!(
                    "sidecar exited unexpectedly (exit code {code:?}), giving up after {MAX_RESTART_ATTEMPTS} restarts"
                );
                emit_error(app, &AppError::sidecar_unavailable());
            }
        }
    }

    fn restart<R: Runtime>(&self, app: &AppHandle<R>) {
        match self.inner.lock() {
            Ok(mut inner) if !inner.stopping => inner.restore_pending = true,
            _ => return,
        }
        if let Err(error) = self.start(app) {
            log::error!("failed to restart the sidecar ({})", error.code);
            emit_error(app, &error);
        }
    }

    /// Pro keeps working for this session if storing fails; the UI shows why it will not survive a restart.
    fn save_license<R: Runtime>(&self, app: &AppHandle<R>, license: &StoredLicense) {
        let saved = app
            .try_state::<LicenseVault>()
            .map_or(Err(()), |vault| vault.save(license));
        if saved.is_ok() {
            return;
        }
        log::warn!("could not store the license on this computer");
        let state = match self.inner.lock() {
            Ok(mut inner) => {
                inner.state.license.last_error = Some("secret-storage".into());
                inner.state.clone()
            }
            Err(_) => return,
        };
        emit_state(app, &state);
    }

    fn lock(&self) -> Result<MutexGuard<'_, Inner>, AppError> {
        self.inner
            .lock()
            .map_err(|_| AppError::new("unknown", "sidecar state is poisoned"))
    }
}

/// Opens a FlagCount or Paddle page in the default browser; anything else is refused.
#[allow(deprecated)]
pub fn open_external<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), AppError> {
    if !is_allowed_external_url(url) {
        log::warn!("refused to open a link to an unexpected site");
        return Err(AppError::new("unknown", "This link cannot be opened"));
    }
    app.shell().open(url, None).map_err(|_| {
        log::warn!("could not open the browser");
        AppError::new("unknown", "The browser could not be opened")
    })
}

/// The sidecar only sends sanitized messages built from fixed templates and error codes.
fn log_sidecar_message(level: LogLevel, message: &str) {
    match level {
        LogLevel::Info => log::info!(target: "sidecar", "{message}"),
        LogLevel::Warn => log::warn!(target: "sidecar", "{message}"),
        LogLevel::Error => log::error!(target: "sidecar", "{message}"),
    }
}

fn emit_state<R: Runtime>(app: &AppHandle<R>, state: &AppState) {
    if app.emit_to(MAIN_WINDOW, STATE_CHANGED_EVENT, state).is_err() {
        log::warn!("failed to emit the app state");
    }
}

fn emit_error<R: Runtime>(app: &AppHandle<R>, error: &AppError) {
    if app.emit_to(MAIN_WINDOW, APP_ERROR_EVENT, error).is_err() {
        log::warn!("failed to emit an app error");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::OverlaySettings;
    use serde_json::json;

    fn parse(line: &str) -> SidecarEvent {
        serde_json::from_str(line).expect("valid sidecar event")
    }

    #[test]
    fn serializes_commands_as_tagged_json() {
        let cases = [
            (
                SidecarCommand::Connect {
                    username: "streamer".into(),
                },
                json!({ "type": "connect", "username": "streamer" }),
            ),
            (SidecarCommand::Disconnect, json!({ "type": "disconnect" })),
            (
                SidecarCommand::AddManualVote {
                    counter_id: None,
                    option_id: None,
                },
                json!({ "type": "addManualVote" }),
            ),
            (
                SidecarCommand::AddManualVote {
                    counter_id: Some("teams".into()),
                    option_id: Some("blue".into()),
                },
                json!({ "type": "addManualVote", "counterId": "teams", "optionId": "blue" }),
            ),
            (
                SidecarCommand::RemoveManualVote {
                    counter_id: None,
                    option_id: None,
                },
                json!({ "type": "removeManualVote" }),
            ),
            (SidecarCommand::Reset { counter_id: None }, json!({ "type": "reset" })),
            (
                SidecarCommand::Reset {
                    counter_id: Some("teams".into()),
                },
                json!({ "type": "reset", "counterId": "teams" }),
            ),
            (
                SidecarCommand::ConfigureCounters {
                    counters: vec![CounterDefinition::red_flags(25, OverlaySettings::default())],
                },
                json!({
                    "type": "configureCounters",
                    "counters": [{
                        "id": "red-flags",
                        "name": "Rote Flaggen",
                        "mode": "single",
                        "target": 25,
                        "options": [{
                            "id": "red-flag",
                            "label": "Rote Flagge",
                            "triggers": [{ "kind": "emoji", "value": "\u{1F6A9}", "match": "contains" }],
                            "accentColor": "#e82634"
                        }],
                        "withdrawalTriggers": [{ "kind": "emoji", "value": "\u{1F3F3}\u{FE0F}", "match": "contains" }],
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
                    }]
                }),
            ),
            (
                SidecarCommand::ConfigureLicense {
                    installation_id: "inst-0123456789abcdef".into(),
                    credentials: Some(LicenseCredentials {
                        license_id: "license-1".into(),
                        secret: "secret".into(),
                    }),
                    entitlement: None,
                },
                json!({
                    "type": "configureLicense",
                    "installationId": "inst-0123456789abcdef",
                    "credentials": { "licenseId": "license-1", "secret": "secret" },
                    "entitlement": null
                }),
            ),
            (
                SidecarCommand::ActivateLicense {
                    code: "FC-1".into(),
                    replace_installation_id: None,
                },
                json!({ "type": "activateLicense", "code": "FC-1" }),
            ),
            (
                SidecarCommand::ActivateLicense {
                    code: "FC-1".into(),
                    replace_installation_id: Some("inst-fedcba9876543210".into()),
                },
                json!({ "type": "activateLicense", "code": "FC-1", "replaceInstallationId": "inst-fedcba9876543210" }),
            ),
            (SidecarCommand::RefreshLicense, json!({ "type": "refreshLicense" })),
            (SidecarCommand::DeactivateLicense, json!({ "type": "deactivateLicense" })),
            (SidecarCommand::OpenCustomerPortal, json!({ "type": "openCustomerPortal" })),
            (SidecarCommand::GetState, json!({ "type": "getState" })),
        ];

        for (command, expected) in cases {
            assert_eq!(serde_json::to_value(&command).unwrap(), expected);
        }
    }

    #[test]
    fn publishes_the_overlay_url_but_keeps_the_token_private() {
        let mut state = AppState::default();
        let mut session = None;

        let update = apply_event(
            &mut state,
            &mut session,
            parse(
                r#"{"type":"ready","protocolVersion":2,"port":4321,"token":"secret","publicOverlayUrl":"https://overlay.example/o/abc"}"#,
            ),
        );

        assert!(matches!(update, StateUpdate::State));
        let session = session.expect("session stored");
        assert_eq!((session.port, session.token.as_str()), (4321, "secret"));
        assert_eq!(
            state.overlay_url.as_deref(),
            Some("http://127.0.0.1:4321/overlay")
        );
        assert_eq!(
            state.public_overlay_url.as_deref(),
            Some("https://overlay.example/o/abc")
        );
        assert!(!serde_json::to_string(&state).unwrap().contains("secret"));
    }

    #[test]
    fn accepts_only_https_online_overlay_urls() {
        let mut state = AppState::default();
        let mut session = None;

        apply_event(
            &mut state,
            &mut session,
            parse(r#"{"type":"ready","port":1,"token":"t","publicOverlayUrl":"http://overlay.example/o/abc"}"#),
        );
        assert_eq!(state.public_overlay_url, None);

        apply_event(
            &mut state,
            &mut session,
            parse(r#"{"type":"ready","port":1,"token":"t"}"#),
        );
        assert_eq!(state.public_overlay_url, None);
    }

    #[test]
    fn sanitizes_pro_counter_overlay_urls() {
        let mut state = AppState::default();
        let mut session = None;

        let update = apply_event(
            &mut state,
            &mut session,
            parse(
                r#"{"type":"overlayUrls","urls":{"counter-1":"https://overlay.example/ob/one","all":"https://overlay.example/ob/all","bad scope":"https://overlay.example/ob/bad","counter-2":"http://overlay.example/ob/two"}}"#,
            ),
        );

        assert!(matches!(update, StateUpdate::State));
        assert_eq!(state.counter_overlay_urls.len(), 2);
        assert_eq!(
            state.counter_overlay_urls.get("counter-1").map(String::as_str),
            Some("https://overlay.example/ob/one")
        );
        assert_eq!(
            state.counter_overlay_urls.get("all").map(String::as_str),
            Some("https://overlay.example/ob/all")
        );
    }

    #[test]
    fn applies_status_and_vote_updates() {
        let mut state = AppState::default();
        let mut session = None;

        let status = apply_event(
            &mut state,
            &mut session,
            parse(r#"{"type":"status","connection":{"status":"connected","username":"streamer"}}"#),
        );
        let votes = apply_event(
            &mut state,
            &mut session,
            parse(r#"{"type":"votes","votes":{"count":3,"target":5,"roundId":"r1","targetReached":false}}"#),
        );

        assert!(matches!(status, StateUpdate::State));
        assert!(matches!(votes, StateUpdate::State));
        assert_eq!(
            state.connection,
            ConnectionState {
                status: ConnectionStatus::Connected,
                username: Some("streamer".into()),
                reconnect: None,
            }
        );
        assert_eq!(state.votes.count, 3);
        assert_eq!(state.votes.round_id, "r1");
    }

    #[test]
    fn passes_the_license_status_on_but_keeps_its_secret_out_of_the_ui_state() {
        let mut state = AppState::default();
        let mut session = None;

        let status = apply_event(
            &mut state,
            &mut session,
            parse(
                r#"{"type":"license","license":{"plan":"pro","status":"active","reference":"FC-1","expiresAt":"2026-10-13T10:00:00.000Z","refreshAfter":"2026-09-20T10:00:00.000Z","needsRefresh":false,"lastError":null,"features":["history"],"installations":[]}}"#,
            ),
        );
        assert!(matches!(status, StateUpdate::State));
        assert!(state.license.is_pro());

        match apply_event(
            &mut state,
            &mut session,
            parse(
                r#"{"type":"licenseCredentials","credentials":{"licenseId":"license-1","secret":"top-secret"},"entitlement":{"version":1}}"#,
            ),
        ) {
            StateUpdate::Credentials(Some(credentials), Some(_)) => {
                assert_eq!(credentials.license_id, "license-1")
            }
            _ => panic!("expected credentials"),
        }
        assert!(!serde_json::to_string(&state).unwrap().contains("top-secret"));

        let open = apply_event(
            &mut state,
            &mut session,
            parse(r#"{"type":"openUrl","url":"https://customer-portal.paddle.com/cpl_01"}"#),
        );
        assert!(matches!(open, StateUpdate::OpenUrl(url) if url == "https://customer-portal.paddle.com/cpl_01"));
    }

    #[test]
    fn applies_counter_snapshots() {
        let mut state = AppState::default();
        let mut session = None;

        let update = apply_event(
            &mut state,
            &mut session,
            parse(
                r#"{"type":"counters","counters":[{"counterId":"poll","name":"Umfrage","mode":"poll","options":[{"optionId":"a","label":"A","count":2},{"optionId":"b","label":"B","count":1}],"totalCount":3,"target":null,"targetReached":false,"roundId":"r2"}]}"#,
            ),
        );

        assert!(matches!(update, StateUpdate::State));
        assert_eq!(state.counters.len(), 1);
        assert_eq!(state.counters[0].mode, CounterMode::Poll);
        assert_eq!(state.counters[0].options[1].count, 1);
        assert_eq!(state.counters[0].target, None);
    }

    #[test]
    fn passes_reconnect_details_through_to_the_ui() {
        let mut state = AppState::default();
        let mut session = None;

        apply_event(
            &mut state,
            &mut session,
            parse(
                r#"{"type":"status","connection":{"status":"reconnecting","username":"streamer","reconnect":{"attempt":2,"maxAttempts":8,"delayMs":4000}}}"#,
            ),
        );

        assert_eq!(state.connection.status, ConnectionStatus::Reconnecting);
        assert_eq!(
            serde_json::to_value(&state.connection).unwrap(),
            json!({
                "status": "reconnecting",
                "username": "streamer",
                "reconnect": { "attempt": 2, "maxAttempts": 8, "delayMs": 4000 }
            })
        );
    }

    #[test]
    fn forwards_sidecar_errors() {
        let mut state = AppState::default();
        let mut session = None;

        let update = apply_event(
            &mut state,
            &mut session,
            parse(r#"{"type":"error","error":{"code":"user-offline","message":"offline"}}"#),
        );

        match update {
            StateUpdate::Error(error) => assert_eq!(error, AppError::new("user-offline", "offline")),
            _ => panic!("expected an error update"),
        }
        assert_eq!(state, AppState::default());
    }

    #[test]
    fn truncates_sidecar_log_messages() {
        let mut state = AppState::default();
        let mut session = None;
        let line = json!({ "type": "log", "level": "warn", "message": "x".repeat(1000) }).to_string();

        match apply_event(&mut state, &mut session, parse(&line)) {
            StateUpdate::Log(level, message) => {
                assert_eq!(level, LogLevel::Warn);
                assert_eq!(message.chars().count(), MAX_LOG_MESSAGE_CHARS);
            }
            _ => panic!("expected a log update"),
        }
    }

    #[test]
    fn rejects_unknown_events() {
        assert!(serde_json::from_str::<SidecarEvent>(r#"{"type":"chat","message":{}}"#).is_err());
    }

    #[test]
    fn serializes_the_app_state_for_the_ui() {
        assert_eq!(
            serde_json::to_value(AppState::default()).unwrap(),
            json!({
                "sidecarRunning": false,
                "connection": { "status": "disconnected", "username": null },
                "votes": { "count": 0, "target": 100, "roundId": "", "targetReached": false },
                "counters": [],
                "overlayUrl": null,
                "publicOverlayUrl": null,
                "counterOverlayUrls": {},
                "settings": serde_json::to_value(Settings::default()).unwrap(),
                "license": serde_json::to_value(LicenseState::default()).unwrap()
            })
        );
    }

    #[test]
    fn restart_delay_grows_and_is_capped() {
        let seconds: Vec<u64> = [1, 2, 3, 4, 5, 9]
            .into_iter()
            .map(|attempt| restart_delay(attempt).as_secs())
            .collect();

        assert_eq!(seconds, [1, 2, 4, 8, 16, 16]);
    }

    #[test]
    fn configures_every_new_sidecar_from_the_saved_settings() {
        let overlay = OverlaySettings {
            show_background: false,
            ..OverlaySettings::default()
        };
        let mut settings = Settings::default();
        settings.update_primary_counter(crate::settings::EPOCH_TIMESTAMP, |counter| {
            counter.target = Some(25);
            counter.overlay = overlay.clone();
        });

        let license = StoredLicense {
            installation_id: "inst-0123456789abcdef".into(),
            ..StoredLicense::default()
        };

        assert_eq!(
            startup_commands(&settings, &LicenseState::default(), &license, None),
            [
                SidecarCommand::ConfigureCounters {
                    counters: vec![CounterDefinition::red_flags(25, overlay)],
                },
                SidecarCommand::SetTelemetryEnabled { enabled: false },
                SidecarCommand::ConfigureLicense {
                    installation_id: "inst-0123456789abcdef".into(),
                    credentials: None,
                    entitlement: None,
                },
            ]
        );
        assert_eq!(
            startup_commands(&settings, &LicenseState::default(), &license, Some("streamer")).last(),
            Some(&SidecarCommand::Connect {
                username: "streamer".into()
            })
        );
    }

    #[test]
    fn runs_the_chosen_profile_as_soon_as_pro_becomes_active_but_never_on_a_downgrade() {
        let pro = LicenseState {
            plan: "pro".into(),
            status: "active".into(),
            features: vec![crate::entitlements::MULTIPLE_PROFILES.into()],
            ..LicenseState::default()
        };
        let free = LicenseState::default();
        let mut settings = Settings::default();
        crate::profiles::create_profile(&mut settings, &pro, "Quiz", "quiz".into(), "now").unwrap();
        settings.profiles[1].counters[0].target = Some(7);
        crate::profiles::switch_profile(&mut settings, &pro, "quiz").unwrap();

        assert!(matches!(
            counters_after_license_change(&settings, &free, &pro),
            Some(SidecarCommand::ConfigureCounters { counters }) if counters[0].target == Some(7)
        ));
        assert_eq!(counters_after_license_change(&settings, &pro, &free), None);
        assert_eq!(counters_after_license_change(&settings, &pro, &pro), None);
    }

    #[test]
    fn remembers_the_desired_connection() {
        let mut desired = DesiredConnection::default();

        desired.remember(&SidecarCommand::Connect {
            username: "streamer".into(),
        });
        desired.remember(&SidecarCommand::GetState);
        assert_eq!(desired.username.as_deref(), Some("streamer"));

        desired.remember(&SidecarCommand::Disconnect);
        assert_eq!(desired.username, None);
    }
}
