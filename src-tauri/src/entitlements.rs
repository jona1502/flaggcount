//! The Free and Pro limits Tauri enforces before it changes settings, mirroring `shared/entitlements.ts`.
//! The UI checks them too, but only these checks count.

use crate::license::LicenseState;
use crate::settings::{MAX_COUNTERS, MAX_PROFILES};

pub const MULTIPLE_PROFILES: &str = "multiple-profiles";
pub const PARALLEL_COUNTERS: &str = "parallel-counters";
pub const MULTI_OPTION_POLLS: &str = "multi-option-polls";
pub const CUSTOM_TRIGGERS: &str = "custom-triggers";

/// A feature is usable while a verified Pro license lists it.
pub fn has_feature(license: &LicenseState, feature: &str) -> bool {
    license.is_pro() && license.features.iter().any(|granted| granted == feature)
}

pub fn profile_limit(license: &LicenseState) -> usize {
    if has_feature(license, MULTIPLE_PROFILES) {
        MAX_PROFILES
    } else {
        1
    }
}

pub fn counter_limit(license: &LicenseState) -> usize {
    if has_feature(license, PARALLEL_COUNTERS) {
        MAX_COUNTERS
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pro(features: &[&str]) -> LicenseState {
        LicenseState {
            plan: "pro".into(),
            status: "active".into(),
            features: features.iter().map(|feature| feature.to_string()).collect(),
            ..LicenseState::default()
        }
    }

    #[test]
    fn free_allows_one_profile_and_one_counter() {
        let free = LicenseState::default();

        assert_eq!(profile_limit(&free), 1);
        assert_eq!(counter_limit(&free), 1);
        assert!(!has_feature(&free, MULTIPLE_PROFILES));
    }

    #[test]
    fn pro_unlocks_only_the_listed_features() {
        let license = pro(&[MULTIPLE_PROFILES]);

        assert_eq!(profile_limit(&license), MAX_PROFILES);
        assert_eq!(counter_limit(&license), 1);
    }

    #[test]
    fn expired_licenses_unlock_nothing() {
        let expired = LicenseState {
            plan: "free".into(),
            status: "expired".into(),
            features: vec![MULTIPLE_PROFILES.into()],
            ..LicenseState::default()
        };

        assert_eq!(profile_limit(&expired), 1);
    }
}
