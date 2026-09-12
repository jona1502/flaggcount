pub mod sidecar;

use tauri::{Manager, RunEvent};

use sidecar::Sidecar;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar::default())
        .setup(|app| {
            let handle = app.handle();
            if let Err(error) = handle.state::<Sidecar>().start(handle) {
                eprintln!("failed to start sidecar: {error}");
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
