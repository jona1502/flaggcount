//! Profile management. Every operation changes a copy of the settings and is only applied when it
//! succeeds, so a refused action never leaves half-changed settings behind.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::entitlements::profile_limit;
use crate::license::LicenseState;
use crate::settings::{
    CounterDefinition, OverlaySettings, Settings, StreamProfile, DEFAULT_TARGET, MAX_NAME_LENGTH,
    MAX_PROFILES,
};
use crate::sidecar::AppError;

pub fn pro_required(message: &str) -> AppError {
    AppError::new("pro-required", message)
}

fn invalid_profile(message: &str) -> AppError {
    AppError::new("invalid-profile", message)
}

/// A random id for a new profile, e.g. `p-3f9c0e41a8b27d65`.
pub fn new_profile_id() -> String {
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u128(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0),
    );
    format!("p-{:016x}", hasher.finish())
}

pub fn validated_profile_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if (1..=MAX_NAME_LENGTH).contains(&name.chars().count()) {
        Ok(name.to_string())
    } else {
        Err(invalid_profile("Profile names need 1 to 60 characters"))
    }
}

fn index_of(settings: &Settings, profile_id: &str) -> Result<usize, AppError> {
    settings
        .profiles
        .iter()
        .position(|profile| profile.id == profile_id)
        .ok_or_else(|| invalid_profile("The profile does not exist"))
}

/// Only the first profiles up to the plan's limit can be used; the others stay stored.
pub fn is_usable(index: usize, license: &LicenseState) -> bool {
    index < profile_limit(license)
}

/// The profile whose counters run: the active one if the plan covers it, otherwise the first.
pub fn effective_profile<'a>(settings: &'a Settings, license: &LicenseState) -> Option<&'a StreamProfile> {
    let index = settings
        .profiles
        .iter()
        .position(|profile| profile.id == settings.active_profile_id)
        .filter(|index| is_usable(*index, license))
        .unwrap_or(0);
    settings.profiles.get(index)
}

fn require_room(settings: &Settings, license: &LicenseState) -> Result<(), AppError> {
    let limit = profile_limit(license).min(MAX_PROFILES);
    if settings.profiles.len() >= limit {
        return Err(pro_required("More profiles require FlagCount Pro"));
    }
    Ok(())
}

/// Adds a profile with the red flag counter and the default design.
pub fn create_profile(
    settings: &mut Settings,
    license: &LicenseState,
    name: &str,
    id: String,
    now: &str,
) -> Result<String, AppError> {
    let name = validated_profile_name(name)?;
    require_room(settings, license)?;
    settings.profiles.push(StreamProfile {
        id: id.clone(),
        name,
        counters: vec![CounterDefinition::red_flags(DEFAULT_TARGET, OverlaySettings::default())],
        created_at: now.into(),
        updated_at: now.into(),
    });
    Ok(id)
}

pub fn duplicate_profile(
    settings: &mut Settings,
    license: &LicenseState,
    source_id: &str,
    id: String,
    now: &str,
) -> Result<String, AppError> {
    let source = settings.profiles[index_of(settings, source_id)?].clone();
    require_room(settings, license)?;
    let suffix = " (Kopie)";
    let base: String = source
        .name
        .chars()
        .take(MAX_NAME_LENGTH - suffix.chars().count())
        .collect();
    settings.profiles.push(StreamProfile {
        id: id.clone(),
        name: format!("{}{suffix}", base.trim_end()),
        created_at: now.into(),
        updated_at: now.into(),
        ..source
    });
    Ok(id)
}

/// Profiles the plan does not cover are read-only until Pro is active again.
pub fn rename_profile(
    settings: &mut Settings,
    license: &LicenseState,
    profile_id: &str,
    name: &str,
    now: &str,
) -> Result<(), AppError> {
    let name = validated_profile_name(name)?;
    let index = index_of(settings, profile_id)?;
    if !is_usable(index, license) {
        return Err(pro_required("This profile can only be edited with FlagCount Pro"));
    }
    let profile = &mut settings.profiles[index];
    profile.name = name;
    profile.updated_at = now.into();
    Ok(())
}

/// Deletes a profile; the last one stays. Returns whether the active profile changed.
pub fn delete_profile(settings: &mut Settings, profile_id: &str) -> Result<bool, AppError> {
    let index = index_of(settings, profile_id)?;
    if settings.profiles.len() == 1 {
        return Err(invalid_profile("The last profile cannot be deleted"));
    }
    settings.profiles.remove(index);
    if settings.active_profile_id == profile_id {
        settings.active_profile_id = settings.profiles[0].id.clone();
        return Ok(true);
    }
    Ok(false)
}

/// Makes a profile active. Returns whether anything changed.
pub fn switch_profile(settings: &mut Settings, license: &LicenseState, profile_id: &str) -> Result<bool, AppError> {
    let index = index_of(settings, profile_id)?;
    if !is_usable(index, license) {
        return Err(pro_required("This profile requires FlagCount Pro"));
    }
    if settings.active_profile_id == profile_id {
        return Ok(false);
    }
    settings.active_profile_id = profile_id.into();
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entitlements::MULTIPLE_PROFILES;

    const NOW: &str = "2026-09-13T12:00:00.000Z";

    fn pro() -> LicenseState {
        LicenseState {
            plan: "pro".into(),
            status: "active".into(),
            features: vec![MULTIPLE_PROFILES.into()],
            ..LicenseState::default()
        }
    }

    fn with_profiles(count: usize) -> Settings {
        let mut settings = Settings::default();
        for index in 1..count {
            create_profile(&mut settings, &pro(), &format!("Profil {index}"), format!("p{index}"), NOW).unwrap();
        }
        settings
    }

    #[test]
    fn free_keeps_a_single_profile() {
        let mut settings = Settings::default();

        let error = create_profile(&mut settings, &LicenseState::default(), "Zweites", "p1".into(), NOW).unwrap_err();

        assert_eq!(error.code, "pro-required");
        assert_eq!(settings.profiles.len(), 1);
    }

    #[test]
    fn pro_allows_up_to_ten_profiles() {
        let mut settings = with_profiles(10);

        assert_eq!(settings.profiles.len(), 10);
        assert_eq!(
            create_profile(&mut settings, &pro(), "Elftes", "p10".into(), NOW).unwrap_err().code,
            "pro-required"
        );
        let created = &settings.profiles[1];
        assert_eq!(created.counters, vec![CounterDefinition::red_flags(DEFAULT_TARGET, OverlaySettings::default())]);
        assert_eq!((created.created_at.as_str(), created.name.as_str()), (NOW, "Profil 1"));
    }

    #[test]
    fn validates_names() {
        let mut settings = Settings::default();

        for name in ["", "   ", &"x".repeat(MAX_NAME_LENGTH + 1)] {
            assert_eq!(create_profile(&mut settings, &pro(), name, "p1".into(), NOW).unwrap_err().code, "invalid-profile");
        }
        assert_eq!(create_profile(&mut settings, &pro(), "  Quiz  ", "p1".into(), NOW).unwrap(), "p1");
        assert_eq!(settings.profiles[1].name, "Quiz");
    }

    #[test]
    fn duplicates_counters_and_design_with_a_new_name() {
        let mut settings = Settings::default();
        settings.update_primary_counter(NOW, |counter| counter.target = Some(42));
        settings.profiles[0].name = "ä".repeat(MAX_NAME_LENGTH);

        duplicate_profile(&mut settings, &pro(), "default", "copy".into(), NOW).unwrap();

        let copy = &settings.profiles[1];
        assert_eq!(copy.counters[0].target, Some(42));
        assert_eq!(copy.name.chars().count(), MAX_NAME_LENGTH);
        assert!(copy.name.ends_with(" (Kopie)"));
        assert_eq!(settings.active_profile_id, "default");
    }

    #[test]
    fn renames_only_usable_profiles() {
        let mut settings = with_profiles(3);

        rename_profile(&mut settings, &LicenseState::default(), "default", "Hauptprofil", NOW).unwrap();
        assert_eq!(settings.profiles[0].name, "Hauptprofil");
        assert_eq!(
            rename_profile(&mut settings, &LicenseState::default(), "p2", "Neu", NOW).unwrap_err().code,
            "pro-required"
        );
        assert_eq!(rename_profile(&mut settings, &pro(), "missing", "Neu", NOW).unwrap_err().code, "invalid-profile");
    }

    #[test]
    fn switches_only_to_profiles_the_plan_covers() {
        let mut settings = with_profiles(3);

        assert!(switch_profile(&mut settings, &pro(), "p2").unwrap());
        assert!(!switch_profile(&mut settings, &pro(), "p2").unwrap());
        assert_eq!(
            switch_profile(&mut settings, &LicenseState::default(), "p1").unwrap_err().code,
            "pro-required"
        );
        assert_eq!(settings.active_profile_id, "p2");
    }

    #[test]
    fn falls_back_to_the_first_profile_after_a_downgrade_without_deleting_anything() {
        let mut settings = with_profiles(3);
        switch_profile(&mut settings, &pro(), "p2").unwrap();

        assert_eq!(effective_profile(&settings, &pro()).unwrap().id, "p2");
        assert_eq!(effective_profile(&settings, &LicenseState::default()).unwrap().id, "default");
        assert_eq!(settings.profiles.len(), 3);
    }

    #[test]
    fn deletes_profiles_but_keeps_the_last_one() {
        let mut settings = with_profiles(2);
        switch_profile(&mut settings, &pro(), "p1").unwrap();

        assert!(delete_profile(&mut settings, "p1").unwrap());
        assert_eq!(settings.active_profile_id, "default");
        assert_eq!(delete_profile(&mut settings, "default").unwrap_err().code, "invalid-profile");
    }

    #[test]
    fn creates_distinct_profile_ids() {
        let first = new_profile_id();

        assert_ne!(first, new_profile_id());
        assert!(first.starts_with("p-") && first.len() == 18);
    }
}
