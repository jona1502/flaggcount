use std::collections::HashSet;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::entitlements::{has_feature, PARALLEL_COUNTERS};
use crate::license::LicenseState;
use crate::profiles::{effective_profile, pro_required, validated_profile_name};
use crate::settings::{
    OverlayAlignment, OverlayLayout, OverlaySceneItem, OverlayView, Settings, AUTO_SCENE_ID, MAX_NAME_LENGTH,
    MAX_OVERLAY_VIEWS,
};
use crate::sidecar::AppError;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayViewInput {
    pub name: String,
    pub items: Vec<OverlaySceneItem>,
    pub layout: OverlayLayout,
    pub gap: u8,
    pub horizontal_align: OverlayAlignment,
    pub vertical_align: OverlayAlignment,
    pub scale: u8,
}

fn invalid(message: &str) -> AppError {
    AppError::new("invalid-overlay-view", message)
}

fn require_pro(license: &LicenseState) -> Result<(), AppError> {
    has_feature(license, PARALLEL_COUNTERS)
        .then_some(())
        .ok_or_else(|| pro_required("Custom overlay views require Audience Live Pro"))
}

pub fn new_view_id() -> String {
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u128(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0),
    );
    format!("v-{:016x}", hasher.finish())
}

fn profile_index(settings: &Settings, license: &LicenseState) -> Result<usize, AppError> {
    let id = effective_profile(settings, license)
        .map(|profile| profile.id.as_str())
        .ok_or_else(|| invalid("The active profile does not exist"))?;
    settings
        .profiles
        .iter()
        .position(|profile| profile.id == id)
        .ok_or_else(|| invalid("The active profile does not exist"))
}

fn build(input: OverlayViewInput, id: String, now: &str, counter_ids: &HashSet<String>) -> Result<OverlayView, AppError> {
    OverlayView {
        id,
        name: input.name,
        items: input.items,
        counter_ids: Vec::new(),
        layout: input.layout,
        gap: input.gap,
        horizontal_align: input.horizontal_align,
        vertical_align: input.vertical_align,
        scale: input.scale,
        created_at: now.into(),
        updated_at: now.into(),
    }
    .validated(counter_ids)
    .ok_or_else(|| invalid("The overlay view is invalid"))
}

pub fn create(
    settings: &mut Settings,
    license: &LicenseState,
    input: OverlayViewInput,
    id: String,
    now: &str,
) -> Result<String, AppError> {
    require_pro(license)?;
    let index = profile_index(settings, license)?;
    let profile = &mut settings.profiles[index];
    if profile.overlay_views.len() >= MAX_OVERLAY_VIEWS {
        return Err(pro_required("The overlay view limit has been reached"));
    }
    let counters = profile.counters.iter().map(|counter| counter.id.clone()).collect();
    let view = build(input, id.clone(), now, &counters)?;
    if profile.overlay_views.iter().any(|candidate| candidate.id == id) {
        return Err(invalid("The overlay view id already exists"));
    }
    profile.overlay_views.push(view);
    profile.updated_at = now.into();
    Ok(id)
}

pub fn update(
    settings: &mut Settings,
    license: &LicenseState,
    view_id: &str,
    input: OverlayViewInput,
    now: &str,
) -> Result<(), AppError> {
    require_pro(license)?;
    let index = profile_index(settings, license)?;
    let profile = &mut settings.profiles[index];
    let position = profile
        .overlay_views
        .iter()
        .position(|view| view.id == view_id)
        .ok_or_else(|| invalid("The overlay view does not exist"))?;
    let counters = profile.counters.iter().map(|counter| counter.id.clone()).collect();
    let mut replacement = build(input, view_id.into(), now, &counters)?;
    replacement.created_at = profile.overlay_views[position].created_at.clone();
    profile.overlay_views[position] = replacement;
    profile.updated_at = now.into();
    Ok(())
}

pub fn delete(settings: &mut Settings, license: &LicenseState, view_id: &str, now: &str) -> Result<(), AppError> {
    require_pro(license)?;
    let index = profile_index(settings, license)?;
    let profile = &mut settings.profiles[index];
    let before = profile.overlay_views.len();
    profile.overlay_views.retain(|view| view.id != view_id);
    if profile.overlay_views.len() == before {
        return Err(invalid("The overlay view does not exist"));
    }
    if profile.live_scene_id == view_id {
        profile.live_scene_id = AUTO_SCENE_ID.into();
    }
    profile.updated_at = now.into();
    Ok(())
}

pub fn duplicate(
    settings: &mut Settings,
    license: &LicenseState,
    view_id: &str,
    id: String,
    now: &str,
) -> Result<String, AppError> {
    require_pro(license)?;
    let index = profile_index(settings, license)?;
    let profile = &settings.profiles[index];
    let source = profile
        .overlay_views
        .iter()
        .find(|view| view.id == view_id)
        .cloned()
        .ok_or_else(|| invalid("The overlay view does not exist"))?;
    let suffix = " (Kopie)";
    let base: String = source
        .name
        .chars()
        .take(MAX_NAME_LENGTH - suffix.chars().count())
        .collect();
    create(
        settings,
        license,
        OverlayViewInput {
            name: validated_profile_name(&format!("{}{suffix}", base.trim_end()))?,
            items: source.items,
            layout: source.layout,
            gap: source.gap,
            horizontal_align: source.horizontal_align,
            vertical_align: source.vertical_align,
            scale: source.scale,
        },
        id.clone(),
        now,
    )?;
    Ok(id)
}

/// Chooses the scene shown under `/overlay/live`; the automatic scene is always allowed.
pub fn set_live_scene(settings: &mut Settings, license: &LicenseState, scene_id: &str, now: &str) -> Result<(), AppError> {
    let index = profile_index(settings, license)?;
    if scene_id != AUTO_SCENE_ID {
        require_pro(license)?;
        if !settings.profiles[index].overlay_views.iter().any(|view| view.id == scene_id) {
            return Err(invalid("The scene does not exist"));
        }
    }
    let profile = &mut settings.profiles[index];
    profile.live_scene_id = scene_id.into();
    profile.updated_at = now.into();
    Ok(())
}

/// Hides or shows the live overlay; it keeps its scene either way.
pub fn set_live_hidden(settings: &mut Settings, license: &LicenseState, hidden: bool, now: &str) -> Result<(), AppError> {
    let index = profile_index(settings, license)?;
    let profile = &mut settings.profiles[index];
    profile.live_hidden = hidden;
    profile.updated_at = now.into();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: &str = "2026-09-15T00:00:00.000Z";

    fn pro() -> LicenseState {
        LicenseState {
            plan: "pro".into(),
            status: "active".into(),
            features: vec![PARALLEL_COUNTERS.into()],
            ..LicenseState::default()
        }
    }

    fn input(name: &str) -> OverlayViewInput {
        OverlayViewInput {
            name: name.into(),
            items: vec![OverlaySceneItem { id: "i-1".into(), counter_id: "red-flags".into(), scale: 100 }],
            layout: OverlayLayout::Horizontal,
            gap: 18,
            horizontal_align: OverlayAlignment::Center,
            vertical_align: OverlayAlignment::Center,
            scale: 92,
        }
    }

    #[test]
    fn creates_updates_duplicates_and_deletes_views() {
        let mut settings = Settings::default();
        create(&mut settings, &pro(), input("Hauptszene"), "v-main".into(), NOW).unwrap();
        assert_eq!(settings.profiles[0].overlay_views[0].name, "Hauptszene");

        update(&mut settings, &pro(), "v-main", input("Neue Szene"), NOW).unwrap();
        assert_eq!(settings.profiles[0].overlay_views[0].name, "Neue Szene");

        duplicate(&mut settings, &pro(), "v-main", "v-copy".into(), NOW).unwrap();
        assert_eq!(settings.profiles[0].overlay_views.len(), 2);
        assert!(settings.profiles[0].overlay_views[1].name.ends_with(" (Kopie)"));

        delete(&mut settings, &pro(), "v-main", NOW).unwrap();
        assert_eq!(settings.profiles[0].overlay_views[0].id, "v-copy");
    }

    #[test]
    fn switches_and_hides_the_live_scene() {
        let mut settings = Settings::default();
        create(&mut settings, &pro(), input("Hauptszene"), "v-main".into(), NOW).unwrap();

        set_live_scene(&mut settings, &pro(), "v-main", NOW).unwrap();
        assert_eq!(settings.profiles[0].live_scene_id, "v-main");
        assert_eq!(set_live_scene(&mut settings, &pro(), "v-gone", NOW).unwrap_err().code, "invalid-overlay-view");
        assert_eq!(
            set_live_scene(&mut settings, &LicenseState::default(), "v-main", NOW).unwrap_err().code,
            "pro-required"
        );
        set_live_scene(&mut settings, &LicenseState::default(), AUTO_SCENE_ID, NOW).unwrap();
        assert_eq!(settings.profiles[0].live_scene_id, AUTO_SCENE_ID);

        set_live_hidden(&mut settings, &LicenseState::default(), true, NOW).unwrap();
        assert!(settings.profiles[0].live_hidden);
    }

    #[test]
    fn shows_the_same_counter_twice_and_resets_the_live_scene_on_delete() {
        let mut settings = Settings::default();
        let mut twice = input("Doppelt");
        twice.items.push(OverlaySceneItem { id: "i-2".into(), counter_id: "red-flags".into(), scale: 60 });
        create(&mut settings, &pro(), twice, "v-main".into(), NOW).unwrap();
        assert_eq!(settings.profiles[0].overlay_views[0].items.len(), 2);

        settings.profiles[0].live_scene_id = "v-main".into();
        delete(&mut settings, &pro(), "v-main", NOW).unwrap();
        assert_eq!(settings.profiles[0].live_scene_id, AUTO_SCENE_ID);
    }

    #[test]
    fn free_and_invalid_counter_ids_are_rejected_without_changes() {
        let mut settings = Settings::default();
        assert_eq!(
            create(&mut settings, &LicenseState::default(), input("Szene"), "v-main".into(), NOW)
                .unwrap_err()
                .code,
            "pro-required"
        );
        let mut invalid = input("Szene");
        invalid.items[0].counter_id = "missing".into();
        assert_eq!(
            create(&mut settings, &pro(), invalid, "v-main".into(), NOW)
                .unwrap_err()
                .code,
            "invalid-overlay-view"
        );
        assert!(settings.profiles[0].overlay_views.is_empty());
    }
}
