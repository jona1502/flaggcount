fn main() {
    // Declaring the app commands generates `allow-<command>` permissions, so every
    // command must be granted explicitly in a capability file.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_state",
            "connect",
            "disconnect",
            "reset_votes",
            "set_target",
            "set_overlay_settings",
        ]),
    ))
    .expect("failed to run tauri-build");
}
