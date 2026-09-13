use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

use crate::settings::{OverlaySettings, Settings, DEFAULT_TARGET};

/// Name of the bundled Node.js sidecar (see `bundle.externalBin`).
pub const SIDECAR_NAME: &str = "flagcount-sidecar";
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
    AddManualVote,
    Reset,
    SetTarget { target: u32 },
    SetOverlaySettings { overlay: OverlaySettings },
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
    pub votes: VoteSnapshot,
    pub overlay_url: Option<String>,
    pub settings: Settings,
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
    Ready { port: u16, token: String },
    Status { connection: ConnectionState },
    Votes { votes: VoteSnapshot },
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
    None,
}

pub fn apply_event(
    state: &mut AppState,
    session: &mut Option<SidecarSession>,
    event: SidecarEvent,
) -> StateUpdate {
    match event {
        SidecarEvent::Ready { port, token } => {
            *session = Some(SidecarSession { port, token });
            state.overlay_url = Some(overlay_url(port));
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
pub fn startup_commands(settings: &Settings, reconnect_to: Option<&str>) -> Vec<SidecarCommand> {
    let mut commands = vec![
        SidecarCommand::SetTarget {
            target: settings.target,
        },
        SidecarCommand::SetOverlaySettings {
            overlay: settings.overlay,
        },
    ];
    if let Some(username) = reconnect_to {
        commands.push(SidecarCommand::Connect {
            username: username.to_string(),
        });
    }
    commands
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
                StateUpdate::None => Outcome::Nothing,
            };
            let startup = if is_ready {
                let reconnect = std::mem::take(&mut inner.restore_pending);
                let reconnect_to = if reconnect {
                    inner.desired.username.as_deref()
                } else {
                    None
                };
                startup_commands(&inner.state.settings, reconnect_to)
            } else {
                Vec::new()
            };
            (outcome, startup)
        };

        match outcome {
            Outcome::State(state) => emit_state(app, &state),
            Outcome::Error(error) => {
                log::warn!("sidecar reported error: {}", error.code);
                emit_error(app, &error);
            }
            Outcome::Log(level, message) => log_sidecar_message(level, &message),
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

    fn lock(&self) -> Result<MutexGuard<'_, Inner>, AppError> {
        self.inner
            .lock()
            .map_err(|_| AppError::new("unknown", "sidecar state is poisoned"))
    }
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
            (SidecarCommand::AddManualVote, json!({ "type": "addManualVote" })),
            (SidecarCommand::Reset, json!({ "type": "reset" })),
            (
                SidecarCommand::SetTarget { target: 25 },
                json!({ "type": "setTarget", "target": 25 }),
            ),
            (
                SidecarCommand::SetOverlaySettings {
                    overlay: OverlaySettings {
                        show_background: false,
                        show_progress: true,
                    },
                },
                json!({
                    "type": "setOverlaySettings",
                    "overlay": { "showBackground": false, "showProgress": true }
                }),
            ),
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
            parse(r#"{"type":"ready","port":4321,"token":"secret"}"#),
        );

        assert!(matches!(update, StateUpdate::State));
        let session = session.expect("session stored");
        assert_eq!((session.port, session.token.as_str()), (4321, "secret"));
        assert_eq!(
            state.overlay_url.as_deref(),
            Some("http://127.0.0.1:4321/overlay")
        );
        assert!(!serde_json::to_string(&state).unwrap().contains("secret"));
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
                "overlayUrl": null,
                "settings": {
                    "username": "",
                    "target": 100,
                    "overlay": { "showBackground": true, "showProgress": true }
                }
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
        let settings = Settings {
            username: "saved".into(),
            target: 25,
            overlay: OverlaySettings {
                show_background: false,
                show_progress: true,
            },
        };

        assert_eq!(
            startup_commands(&settings, None),
            [
                SidecarCommand::SetTarget { target: 25 },
                SidecarCommand::SetOverlaySettings {
                    overlay: settings.overlay
                },
            ]
        );
        assert_eq!(
            startup_commands(&settings, Some("streamer")).last(),
            Some(&SidecarCommand::Connect {
                username: "streamer".into()
            })
        );
    }

    #[test]
    fn remembers_the_desired_connection() {
        let mut desired = DesiredConnection::default();

        desired.remember(&SidecarCommand::Connect {
            username: "streamer".into(),
        });
        desired.remember(&SidecarCommand::SetTarget { target: 5 });
        assert_eq!(desired.username.as_deref(), Some("streamer"));

        desired.remember(&SidecarCommand::Disconnect);
        assert_eq!(desired.username, None);
    }
}
