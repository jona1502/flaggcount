//! Calls the app's Tauri commands through the IPC layer, exactly like `invoke()` in the
//! frontend, on Tauri's mock runtime without a sidecar process or settings file.

use std::sync::{Arc, Mutex};

use flagcount_lib::license::LicenseState;
use flagcount_lib::settings::{CounterDefinition, OverlaySettings, Settings, SettingsSaver};
use flagcount_lib::with_commands;
use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, WebviewWindow, WebviewWindowBuilder};

struct TestApp {
    _app: App<MockRuntime>,
    webview: WebviewWindow<MockRuntime>,
    saved: Arc<Mutex<Vec<Settings>>>,
}

fn create_app() -> TestApp {
    let saved = Arc::new(Mutex::new(Vec::new()));
    let recorder = Arc::clone(&saved);
    let app = with_commands(mock_builder())
        .manage(SettingsSaver::new(move |settings| {
            recorder.lock().unwrap().push(settings.clone())
        }))
        .build(mock_context(noop_assets()))
        .expect("failed to build the mock app");
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .expect("failed to create the main window");

    TestApp {
        _app: app,
        webview,
        saved,
    }
}

fn invoke(app: &TestApp, cmd: &str, args: Value) -> Result<Value, Value> {
    get_ipc_response(
        &app.webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: "http://tauri.localhost".parse().unwrap(),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|body| body.deserialize::<Value>().unwrap())
}

fn error_code(result: Result<Value, Value>) -> String {
    result.expect_err("command should fail")["code"]
        .as_str()
        .unwrap_or_default()
        .to_string()
}

fn primary_counter(settings: &Value) -> &Value {
    &settings["profiles"][0]["counters"][0]
}

#[test]
fn returns_the_initial_state() {
    let app = create_app();

    let state = invoke(&app, "get_state", json!({})).unwrap();

    assert_eq!(
        state,
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
fn validates_input_before_anything_is_sent_or_saved() {
    let app = create_app();

    assert_eq!(error_code(invoke(&app, "set_target", json!({ "target": 0 }))), "invalid-target");
    assert_eq!(
        error_code(invoke(&app, "set_target", json!({ "target": 100_001 }))),
        "invalid-target"
    );
    assert_eq!(error_code(invoke(&app, "connect", json!({ "username": "   " }))), "invalid-username");
    assert_eq!(
        error_code(invoke(&app, "set_overlay_settings", json!({ "overlay": { "size": 0 } }))),
        "invalid-overlay-settings"
    );
    assert_eq!(
        error_code(invoke(&app, "set_overlay_settings", json!({ "overlay": { "accentColor": "red" } }))),
        "invalid-overlay-settings"
    );
    assert!(app.saved.lock().unwrap().is_empty());
}

#[test]
fn rejects_malformed_arguments_and_unknown_commands() {
    let app = create_app();

    assert!(invoke(&app, "set_target", json!({ "target": "many" })).is_err());
    assert!(invoke(&app, "set_target", json!({ "target": -1 })).is_err());
    assert!(invoke(&app, "connect", json!({})).is_err());
    assert!(invoke(&app, "set_overlay_settings", json!({ "overlay": { "showBackground": 1 } })).is_err());
    assert!(invoke(&app, "delete_everything", json!({})).is_err());
    assert!(app.saved.lock().unwrap().is_empty());
}

#[test]
fn saves_settings_even_while_the_sidecar_is_not_running() {
    let app = create_app();

    assert_eq!(invoke(&app, "set_target", json!({ "target": 25 })), Ok(Value::Null));
    assert_eq!(
        invoke(
            &app,
            "set_overlay_settings",
            json!({ "overlay": { "showBackground": false, "showProgress": true } })
        ),
        Ok(Value::Null)
    );

    let state = invoke(&app, "get_state", json!({})).unwrap();
    let counter = primary_counter(&state["settings"]);
    assert_eq!(counter["target"], json!(25));
    assert_eq!(
        counter["overlay"],
        json!({
            "theme": "standard",
            "font": "system",
            "logoAsset": null,
            "backgroundAsset": null,
            "showBackground": false,
            "showProgress": true,
            "accentColor": "#e82634",
            "textColor": "#ffffff",
            "backgroundColor": "#0c0c10",
            "backgroundOpacity": 80,
            "position": "center",
            "size": 92,
            "flagAnimation": "none",
            "targetEffect": "none"
        })
    );
    assert_ne!(state["settings"]["profiles"][0]["updatedAt"], json!("1970-01-01T00:00:00.000Z"));
    let saved = app.saved.lock().unwrap();
    assert_eq!(saved.len(), 2);
    assert_eq!(serde_json::to_value(saved.last().unwrap()).unwrap(), state["settings"]);
}

#[test]
fn reports_an_unavailable_sidecar_for_stream_actions() {
    let app = create_app();

    for (cmd, args) in [
        ("connect", json!({ "username": "streamer" })),
        ("disconnect", json!({})),
        ("add_manual_vote", json!({})),
        ("remove_manual_vote", json!({})),
        ("reset_votes", json!({})),
    ] {
        assert_eq!(error_code(invoke(&app, cmd, args)), "sidecar-unavailable", "{cmd}");
    }

    // A failed connect must not overwrite the saved username.
    assert!(app.saved.lock().unwrap().is_empty());
    assert_eq!(
        invoke(&app, "get_state", json!({})).unwrap()["settings"]["username"],
        json!("")
    );
}

#[test]
fn validates_license_input_before_it_reaches_the_sidecar() {
    let app = create_app();

    assert_eq!(error_code(invoke(&app, "activate_license", json!({ "code": "   " }))), "invalid-code");
    assert_eq!(
        error_code(invoke(
            &app,
            "activate_license",
            json!({ "code": "FC-7K2QM", "replaceInstallationId": "../other" })
        )),
        "invalid-installation"
    );
    for (cmd, args) in [
        ("activate_license", json!({ "code": "FC-7K2QM-9XH4D-PZ1RT-W8C3N" })),
        ("refresh_license", json!({})),
        ("deactivate_license", json!({})),
        ("open_customer_portal", json!({})),
    ] {
        assert_eq!(error_code(invoke(&app, cmd, args)), "sidecar-unavailable", "{cmd}");
    }
}

#[test]
fn manages_profiles_within_the_free_plan() {
    let app = create_app();

    assert_eq!(error_code(invoke(&app, "create_profile", json!({ "name": "Quiz" }))), "pro-required");
    assert_eq!(
        error_code(invoke(&app, "duplicate_profile", json!({ "profileId": "default" }))),
        "pro-required"
    );
    assert_eq!(
        error_code(invoke(&app, "rename_profile", json!({ "profileId": "default", "name": "   " }))),
        "invalid-profile"
    );
    assert_eq!(
        error_code(invoke(&app, "switch_profile", json!({ "profileId": "missing" }))),
        "invalid-profile"
    );
    assert_eq!(
        error_code(invoke(&app, "delete_profile", json!({ "profileId": "default" }))),
        "invalid-profile"
    );
    assert!(app.saved.lock().unwrap().is_empty());

    assert_eq!(
        invoke(&app, "rename_profile", json!({ "profileId": "default", "name": " Hauptprofil " })),
        Ok(Value::Null)
    );
    assert_eq!(invoke(&app, "switch_profile", json!({ "profileId": "default" })), Ok(Value::Null));

    let state = invoke(&app, "get_state", json!({})).unwrap();
    assert_eq!(state["settings"]["profiles"][0]["name"], json!("Hauptprofil"));
    assert_eq!(app.saved.lock().unwrap().len(), 1);
}

#[test]
fn saves_counters_the_free_plan_allows_and_refuses_pro_counters() {
    let app = create_app();
    let mut counter = serde_json::to_value(CounterDefinition::red_flags(100, OverlaySettings::default())).unwrap();
    counter["name"] = json!("Flaggen-Runde");

    assert_eq!(invoke(&app, "save_counters", json!({ "counters": [counter.clone()] })), Ok(Value::Null));
    let state = invoke(&app, "get_state", json!({})).unwrap();
    assert_eq!(state["settings"]["profiles"][0]["counters"][0]["name"], json!("Flaggen-Runde"));

    let mut poll = counter.clone();
    poll["id"] = json!("poll");
    poll["mode"] = json!("poll");
    poll["options"] = json!([
        { "id": "a", "label": "A", "triggers": [{ "kind": "text", "value": "a", "match": "word" }], "accentColor": "#112233" },
        { "id": "b", "label": "B", "triggers": [{ "kind": "text", "value": "b", "match": "word" }], "accentColor": "#445566" }
    ]);
    assert_eq!(error_code(invoke(&app, "save_counters", json!({ "counters": [poll] }))), "pro-required");
    assert_eq!(error_code(invoke(&app, "save_counters", json!({ "counters": [] }))), "invalid-counters");
    assert_eq!(app.saved.lock().unwrap().len(), 1);
}

#[test]
fn targets_manual_votes_and_resets_only_with_valid_ids() {
    let app = create_app();

    for (cmd, args) in [
        ("add_manual_vote", json!({ "counterId": "mit leerzeichen" })),
        ("remove_manual_vote", json!({ "counterId": "teams", "optionId": "../blue" })),
        ("reset_votes", json!({ "counterId": "" })),
    ] {
        assert_eq!(error_code(invoke(&app, cmd, args)), "invalid-counters", "{cmd}");
    }
    for (cmd, args) in [
        ("add_manual_vote", json!({ "counterId": "teams", "optionId": "blue" })),
        ("remove_manual_vote", json!({ "counterId": "teams", "optionId": "blue" })),
        ("reset_votes", json!({ "counterId": "teams" })),
    ] {
        assert_eq!(error_code(invoke(&app, cmd, args)), "sidecar-unavailable", "{cmd}");
    }
}
