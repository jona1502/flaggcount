fn main() {
    embed_test_manifest();

    // Declaring the app commands generates `allow-<command>` permissions, so every
    // command must be granted explicitly in a capability file.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_state",
            "connect",
            "disconnect",
            "add_manual_vote",
            "reset_votes",
            "set_target",
            "set_overlay_settings",
        ]),
    ))
    .expect("failed to run tauri-build");
}

/// tauri-build embeds the Common Controls v6 manifest only into the app binary. Integration
/// tests on Tauri's mock runtime need it as well, otherwise Windows refuses to start them with
/// STATUS_ENTRYPOINT_NOT_FOUND (https://github.com/tauri-apps/tauri/issues/13419).
fn embed_test_manifest() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os != "windows" || target_env != "msvc" {
        return;
    }

    let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("windows-test-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifest.display());
}
