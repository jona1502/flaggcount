use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Name of the bundled Node.js sidecar (see `bundle.externalBin`).
pub const SIDECAR_NAME: &str = "flagcount-sidecar";
/// The only window that receives app events.
pub const MAIN_WINDOW: &str = "main";
pub const STATE_CHANGED_EVENT: &str = "state-changed";
pub const APP_ERROR_EVENT: &str = "app-error";

const DEFAULT_TARGET: u32 = 100;

/// Commands understood by the sidecar, sent as one JSON object per stdin line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SidecarCommand {
    Connect { username: String },
    Disconnect,
    Reset,
    SetTarget { target: u32 },
    GetState,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    #[default]
    Disconnected,
    Connecting,
    Connected,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectionState {
    pub status: ConnectionStatus,
    pub username: Option<String>,
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
}

/// Events emitted by the sidecar. Deliberately not `Debug`: `Ready` carries the session token.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SidecarEvent {
    Ready { port: u16, token: String },
    Status { connection: ConnectionState },
    Votes { votes: VoteSnapshot },
    Error { error: AppError },
}

/// Access data for the sidecar's local server, valid for this app start only.
pub struct SidecarSession {
    pub port: u16,
    pub token: String,
}

pub enum StateUpdate {
    State,
    Error(AppError),
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
            StateUpdate::None
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
    }
}

#[derive(Default)]
struct Inner {
    child: Option<CommandChild>,
    session: Option<SidecarSession>,
    state: AppState,
    stopping: bool,
}

/// Owns the sidecar process and the latest state it reported.
#[derive(Default)]
pub struct Sidecar {
    inner: Mutex<Inner>,
}

impl Sidecar {
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
                .map_err(|error| AppError::new("sidecar-unavailable", error.to_string()))?;

            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    let sidecar = app_handle.state::<Sidecar>();
                    match event {
                        CommandEvent::Stdout(line) => sidecar.handle_stdout(&app_handle, &line),
                        CommandEvent::Stderr(line) => {
                            eprintln!("[sidecar] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Error(error) => eprintln!("[sidecar] error: {error}"),
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
            inner.state.sidecar_running = true;
            inner.state.clone()
        };

        emit_state(app, &state);
        Ok(())
    }

    pub fn send(&self, command: &SidecarCommand) -> Result<(), AppError> {
        let mut line =
            serde_json::to_vec(command).map_err(|error| AppError::new("unknown", error.to_string()))?;
        line.push(b'\n');

        let mut inner = self.lock()?;
        let child = inner
            .child
            .as_mut()
            .ok_or_else(AppError::sidecar_unavailable)?;
        child
            .write(&line)
            .map_err(|_| AppError::sidecar_unavailable())
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
            eprintln!("[sidecar] ignoring malformed event");
            return;
        };

        let update = {
            let Ok(mut guard) = self.inner.lock() else {
                return;
            };
            let inner = &mut *guard;
            match apply_event(&mut inner.state, &mut inner.session, event) {
                StateUpdate::State => Some(Ok(inner.state.clone())),
                StateUpdate::Error(error) => Some(Err(error)),
                StateUpdate::None => None,
            }
        };

        match update {
            Some(Ok(state)) => emit_state(app, &state),
            Some(Err(error)) => emit_error(app, &error),
            None => {}
        }
    }

    fn handle_terminated<R: Runtime>(&self, app: &AppHandle<R>, code: Option<i32>) {
        let (state, unexpected) = {
            let Ok(mut inner) = self.inner.lock() else {
                return;
            };
            inner.child = None;
            inner.session = None;
            inner.state.sidecar_running = false;
            inner.state.connection.status = ConnectionStatus::Disconnected;
            (inner.state.clone(), !inner.stopping)
        };

        if unexpected {
            eprintln!("[sidecar] terminated unexpectedly (code: {code:?})");
            emit_state(app, &state);
            emit_error(app, &AppError::sidecar_unavailable());
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, Inner>, AppError> {
        self.inner
            .lock()
            .map_err(|_| AppError::new("unknown", "sidecar state is poisoned"))
    }
}

fn emit_state<R: Runtime>(app: &AppHandle<R>, state: &AppState) {
    if let Err(error) = app.emit_to(MAIN_WINDOW, STATE_CHANGED_EVENT, state) {
        eprintln!("failed to emit state: {error}");
    }
}

fn emit_error<R: Runtime>(app: &AppHandle<R>, error: &AppError) {
    if let Err(emit_error) = app.emit_to(MAIN_WINDOW, APP_ERROR_EVENT, error) {
        eprintln!("failed to emit error: {emit_error}");
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
            (SidecarCommand::Reset, json!({ "type": "reset" })),
            (
                SidecarCommand::SetTarget { target: 25 },
                json!({ "type": "setTarget", "target": 25 }),
            ),
            (SidecarCommand::GetState, json!({ "type": "getState" })),
        ];

        for (command, expected) in cases {
            assert_eq!(serde_json::to_value(&command).unwrap(), expected);
        }
    }

    #[test]
    fn stores_the_session_without_exposing_it_in_the_state() {
        let mut state = AppState::default();
        let mut session = None;

        let update = apply_event(
            &mut state,
            &mut session,
            parse(r#"{"type":"ready","port":4321,"token":"secret"}"#),
        );

        assert!(matches!(update, StateUpdate::None));
        let session = session.expect("session stored");
        assert_eq!((session.port, session.token.as_str()), (4321, "secret"));
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
            }
        );
        assert_eq!(state.votes.count, 3);
        assert_eq!(state.votes.round_id, "r1");
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
                "votes": { "count": 0, "target": 100, "roundId": "", "targetReached": false }
            })
        );
    }
}
