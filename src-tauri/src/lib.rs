pub mod branding;
pub mod commands;
pub mod entitlements;
pub mod license;
pub mod overlay_views;
pub mod profiles;
pub mod settings;
pub mod sidecar;
pub mod twitch;

use tauri::{Manager, RunEvent, Runtime};
use tauri_plugin_log::RotationStrategy;

use license::{LicenseVault, SystemSecretStore};
use settings::SettingsSaver;
use sidecar::Sidecar;
use twitch::TwitchVault;

/// Registers the sidecar state and the commands the UI may call; shared by the app and its tests.
pub fn with_commands<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(Sidecar::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::connect,
            commands::disconnect,
            commands::add_manual_vote,
            commands::remove_manual_vote,
            commands::reset_votes,
            commands::set_target,
            commands::set_overlay_settings,
            commands::set_counter_overlay_settings,
            commands::create_overlay_view,
            commands::update_overlay_view,
            commands::delete_overlay_view,
            commands::duplicate_overlay_view,
            commands::import_overlay_asset,
            commands::clear_history,
            commands::export_history_csv,
            commands::create_profile,
            commands::duplicate_profile,
            commands::rename_profile,
            commands::delete_profile,
            commands::switch_profile,
            commands::save_counters,
            commands::activate_license,
            commands::refresh_license,
            commands::deactivate_license,
            commands::open_customer_portal,
            commands::open_pro_page,
            commands::start_twitch_auth,
            commands::disconnect_twitch_account
        ])
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
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
        .plugin(tauri_plugin_clipboard_manager::init());

    with_commands(builder)
        .setup(|app| {
            let handle = app.handle().clone();
            let store_handle = handle.clone();
            app.manage(SettingsSaver::new(move |settings| {
                settings::save(&store_handle, settings)
            }));

            let license_handle = handle.clone();
            app.manage(LicenseVault::new(move |license| {
                license::save(&license_handle, &SystemSecretStore, license)
            }));

            let sidecar = handle.state::<Sidecar>();
            sidecar.init_settings(settings::load(&handle));
            sidecar.init_license(license::load(&handle, &SystemSecretStore));
            let twitch_vault = TwitchVault;
            let twitch_credentials = twitch_vault.load().unwrap_or(None);
            sidecar.init_twitch_credentials(twitch_credentials);
            app.manage(twitch_vault);
            if let Err(error) = sidecar.start(&handle) {
                log::error!("failed to start the sidecar ({})", error.code);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Audience Live")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Sidecar>().stop();
            }
        });
}
