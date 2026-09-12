pub mod commands;
pub mod sidecar;

use tauri::{Manager, RunEvent};

use sidecar::Sidecar;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Sidecar::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::connect,
            commands::disconnect,
            commands::reset_votes,
            commands::set_target
        ])
        .setup(|app| {
            let handle = app.handle();
            if let Err(error) = handle.state::<Sidecar>().start(handle) {
                eprintln!("failed to start sidecar: {}", error.message);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building FlagCount")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Sidecar>().stop();
            }
        });
}
