use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Name of the bundled Node.js sidecar (see `bundle.externalBin`).
pub const SIDECAR_NAME: &str = "flagcount-sidecar";

/// Commands understood by the sidecar, sent as one JSON object per stdin line.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SidecarCommand {
    Connect { username: String },
    Disconnect,
}

/// Owns the sidecar process for the lifetime of the app.
#[derive(Default)]
pub struct Sidecar {
    child: Mutex<Option<CommandChild>>,
}

impl Sidecar {
    pub fn start<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        let mut child_slot = self.lock_child()?;
        if child_slot.is_some() {
            return Ok(());
        }

        let (mut events, child) = app
            .shell()
            .sidecar(SIDECAR_NAME)
            .map_err(|error| error.to_string())?
            .spawn()
            .map_err(|error| error.to_string())?;
        *child_slot = Some(child);

        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(event) = events.recv().await {
                match event {
                    CommandEvent::Stdout(line) => log_sidecar_event(&line),
                    CommandEvent::Stderr(line) => {
                        eprintln!("[sidecar] {}", String::from_utf8_lossy(&line).trim_end());
                    }
                    CommandEvent::Error(error) => eprintln!("[sidecar] error: {error}"),
                    CommandEvent::Terminated(payload) => {
                        eprintln!("[sidecar] terminated (code: {:?})", payload.code);
                        if let Ok(mut slot) = app.state::<Sidecar>().child.lock() {
                            *slot = None;
                        }
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub fn send(&self, command: &SidecarCommand) -> Result<(), String> {
        let mut line = serde_json::to_vec(command).map_err(|error| error.to_string())?;
        line.push(b'\n');

        let mut child_slot = self.lock_child()?;
        let child = child_slot
            .as_mut()
            .ok_or_else(|| "sidecar is not running".to_string())?;
        child.write(&line).map_err(|error| error.to_string())
    }

    pub fn stop(&self) {
        let child = self.child.lock().ok().and_then(|mut slot| slot.take());
        if let Some(child) = child {
            let _ = child.kill();
        }
    }

    fn lock_child(&self) -> Result<std::sync::MutexGuard<'_, Option<CommandChild>>, String> {
        self.child
            .lock()
            .map_err(|_| "sidecar state is poisoned".to_string())
    }
}

/// Logs only the event type; usernames and chat content stay out of the logs.
fn log_sidecar_event(line: &[u8]) {
    let event_type = serde_json::from_slice::<serde_json::Value>(line)
        .ok()
        .and_then(|value| value.get("type")?.as_str().map(str::to_owned));

    match event_type {
        Some(event_type) => eprintln!("[sidecar] event: {event_type}"),
        None => eprintln!("[sidecar] ignoring malformed stdout line"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_commands_as_tagged_json() {
        let connect = SidecarCommand::Connect {
            username: "streamer".into(),
        };

        assert_eq!(
            serde_json::to_string(&connect).unwrap(),
            r#"{"type":"connect","username":"streamer"}"#
        );
        assert_eq!(
            serde_json::to_string(&SidecarCommand::Disconnect).unwrap(),
            r#"{"type":"disconnect"}"#
        );
    }
}
