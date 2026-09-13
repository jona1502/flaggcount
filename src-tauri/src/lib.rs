pub mod commands;
pub mod settings;
pub mod sidecar;

use tauri::{Manager, RunEvent};
use tauri_plugin_log::RotationStrategy;

use sidecar::Sidecar;

pub fn run() {
    tauri::Builder::default()
        // Logs go to stdout and to a file in the app's log directory. Only sanitized
        // messages are logged: no usernames, chat content, paths or session tokens.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(1_000_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Sidecar::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::connect,
            commands::disconnect,
            commands::reset_votes,
            commands::set_target,
            commands::set_overlay_settings
        ])
        .setup(|app| {
            let handle = app.handle();
            let sidecar = handle.state::<Sidecar>();
            sidecar.init_settings(settings::load(handle));
            if let Err(error) = sidecar.start(handle) {
                log::error!("failed to start the sidecar ({})", error.code);
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
