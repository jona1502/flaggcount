use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

/// Installation id, license id and the signed entitlement. The secret is never written here.
pub const LICENSE_FILE: &str = "license.json";
/// Credential Manager entries are named after the app, one per installation.
pub const SECRET_SERVICE: &str = "com.jona1502.flagcount";
/// The FlagCount website; besides it the app only opens the payment provider's checkout and customer portal.
pub const FLAGCOUNT_HOST: &str = "overlay.muhrindustries.com";
/// Stripe Checkout and the Stripe customer portal. Exact hosts, no wildcard for other Stripe pages.
pub const STRIPE_HOSTS: [&str; 2] = ["checkout.stripe.com", "billing.stripe.com"];
pub const TWITCH_AUTH_HOST: &str = "www.twitch.tv";
/// Pricing, terms and checkout of FlagCount Pro.
pub const PRO_PAGE_URL: &str = "https://overlay.muhrindustries.com/pro";
pub const MAX_ACTIVATION_CODE_LENGTH: usize = 64;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationSummary {
    pub installation_id: String,
    pub activated_at: String,
    pub last_seen_at: String,
}

/// License status for the UI, mirroring `LicenseState` in `shared/licensing.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseState {
    pub plan: String,
    pub status: String,
    pub reference: Option<String>,
    pub expires_at: Option<String>,
    pub refresh_after: Option<String>,
    pub needs_refresh: bool,
    pub last_error: Option<String>,
    pub features: Vec<String>,
    #[serde(default)]
    pub installations: Vec<InstallationSummary>,
}

impl Default for LicenseState {
    fn default() -> Self {
        Self {
            plan: "free".into(),
            status: "none".into(),
            reference: None,
            expires_at: None,
            refresh_after: None,
            needs_refresh: false,
            last_error: None,
            features: Vec::new(),
            installations: Vec::new(),
        }
    }
}

impl LicenseState {
    pub fn is_pro(&self) -> bool {
        self.plan == "pro"
    }
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseCredentials {
    pub license_id: String,
    /// Proves this installation to the license service; stored in the Windows Credential Manager.
    pub secret: String,
}

/// Never prints the secret, not even in debug output or test failures.
impl std::fmt::Debug for LicenseCredentials {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("LicenseCredentials")
            .field("license_id", &self.license_id)
            .field("secret", &"<redacted>")
            .finish()
    }
}

/// What the app keeps about its license between starts.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StoredLicense {
    pub installation_id: String,
    pub credentials: Option<LicenseCredentials>,
    pub entitlement: Option<Value>,
}

pub fn is_installation_id(value: &str) -> bool {
    (16..=64).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

/// A random, pseudonymous id for this installation; not derived from the computer or the user.
pub fn new_installation_id() -> String {
    // RandomState is seeded from the operating system's random source.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let part = |salt: u64| {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u128(nanos);
        hasher.write_u64(salt);
        hasher.write_u32(std::process::id());
        hasher.finish()
    };
    format!("inst-{:016x}{:016x}", part(1), part(2))
}

/// Only HTTPS pages of FlagCount, Stripe (checkout and customer portal) and, until the migration is
/// finished, Paddle may be opened.
pub fn is_allowed_external_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.contains('@') || authority.contains(':') {
        return false;
    }
    let host = authority.to_ascii_lowercase();
    host == FLAGCOUNT_HOST
        || STRIPE_HOSTS.contains(&host.as_str())
        || (host == TWITCH_AUTH_HOST && rest.split(['?', '#']).next().unwrap_or_default().starts_with("www.twitch.tv/activate"))
        || host == "paddle.com"
        || host.ends_with(".paddle.com")
}

/// Trims the entered code; the license service normalizes and checks it.
pub fn normalize_activation_code(code: &str) -> Option<String> {
    let trimmed = code.trim();
    (!trimmed.is_empty() && trimmed.chars().count() <= MAX_ACTIVATION_CODE_LENGTH)
        .then(|| trimmed.to_string())
}

/// Access to the operating system's secret store; tests use an in-memory implementation.
pub trait SecretStore: Send + Sync {
    fn get(&self, installation_id: &str) -> Result<Option<String>, ()>;
    fn set(&self, installation_id: &str, secret: &str) -> Result<(), ()>;
    fn delete(&self, installation_id: &str) -> Result<(), ()>;
}

/// The Windows Credential Manager.
pub struct SystemSecretStore;

#[cfg(windows)]
impl SecretStore for SystemSecretStore {
    fn get(&self, installation_id: &str) -> Result<Option<String>, ()> {
        let entry = keyring::Entry::new(SECRET_SERVICE, installation_id).map_err(|_| ())?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(()),
        }
    }

    fn set(&self, installation_id: &str, secret: &str) -> Result<(), ()> {
        keyring::Entry::new(SECRET_SERVICE, installation_id)
            .and_then(|entry| entry.set_password(secret))
            .map_err(|_| ())
    }

    fn delete(&self, installation_id: &str) -> Result<(), ()> {
        let entry = keyring::Entry::new(SECRET_SERVICE, installation_id).map_err(|_| ())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(()),
        }
    }
}

/// FlagCount only ships for Windows; elsewhere Pro cannot be activated.
#[cfg(not(windows))]
impl SecretStore for SystemSecretStore {
    fn get(&self, _installation_id: &str) -> Result<Option<String>, ()> {
        Ok(None)
    }

    fn set(&self, _installation_id: &str, _secret: &str) -> Result<(), ()> {
        Err(())
    }

    fn delete(&self, _installation_id: &str) -> Result<(), ()> {
        Ok(())
    }
}

/// Stores the license: the Tauri store for ids and entitlement, the secret store for the secret.
pub struct LicenseVault {
    save: Box<dyn Fn(&StoredLicense) -> Result<(), ()> + Send + Sync>,
}

impl LicenseVault {
    pub fn new(save: impl Fn(&StoredLicense) -> Result<(), ()> + Send + Sync + 'static) -> Self {
        Self {
            save: Box::new(save),
        }
    }

    pub fn save(&self, license: &StoredLicense) -> Result<(), ()> {
        (self.save)(license)
    }
}

/// Loads the stored license and creates the installation id on the first start.
pub fn load<R: Runtime>(app: &AppHandle<R>, secrets: &dyn SecretStore) -> StoredLicense {
    let Ok(store) = app.store(LICENSE_FILE) else {
        log::warn!("could not open the license store");
        return StoredLicense {
            installation_id: new_installation_id(),
            ..StoredLicense::default()
        };
    };

    let installation_id = match store
        .get("installationId")
        .and_then(|value| value.as_str().map(str::to_string))
        .filter(|id| is_installation_id(id))
    {
        Some(id) => id,
        None => {
            let id = new_installation_id();
            store.set("installationId", id.clone());
            if store.save().is_err() {
                log::warn!("could not save the installation id");
            }
            id
        }
    };

    let license_id = store
        .get("licenseId")
        .and_then(|value| value.as_str().map(str::to_string));
    let secret = secrets.get(&installation_id).unwrap_or_else(|()| {
        log::warn!("could not read the license secret from the credential manager");
        None
    });
    let credentials = match (license_id, secret) {
        (Some(license_id), Some(secret)) => Some(LicenseCredentials { license_id, secret }),
        _ => None,
    };

    StoredLicense {
        installation_id,
        credentials,
        entitlement: store.get("entitlement").filter(Value::is_object),
    }
}

/// Writes the license; the secret goes to the secret store first, so a failure never leaves a half-saved license.
pub fn save<R: Runtime>(app: &AppHandle<R>, secrets: &dyn SecretStore, license: &StoredLicense) -> Result<(), ()> {
    match &license.credentials {
        Some(credentials) => secrets.set(&license.installation_id, &credentials.secret)?,
        None => secrets.delete(&license.installation_id)?,
    }
    let store = app.store(LICENSE_FILE).map_err(|_| ())?;
    store.set("installationId", license.installation_id.clone());
    match &license.credentials {
        Some(credentials) => store.set("licenseId", credentials.license_id.clone()),
        None => {
            store.delete("licenseId");
        }
    }
    match &license.entitlement {
        Some(entitlement) => store.set("entitlement", entitlement.clone()),
        None => {
            store.delete("entitlement");
        }
    }
    store.save().map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_distinct_valid_installation_ids() {
        let first = new_installation_id();
        let second = new_installation_id();

        assert!(is_installation_id(&first), "{first}");
        assert_ne!(first, second);
        assert!(!is_installation_id("short"));
        assert!(!is_installation_id("installation id with spaces"));
    }

    #[test]
    fn opens_only_flagcount_and_payment_provider_pages() {
        for allowed in [
            PRO_PAGE_URL,
            "https://billing.stripe.com/p/session/test_YWNjdF8x",
            "https://checkout.stripe.com/c/pay/cs_test_a1b2",
            "https://BILLING.stripe.com/p/session/live_1",
            "https://customer-portal.paddle.com/cpl_01",
            "https://sandbox-customer-portal.paddle.com/cpl_01?x=1",
        ] {
            assert!(is_allowed_external_url(allowed), "{allowed}");
        }
        for denied in [
            "http://overlay.muhrindustries.com/pro",
            "http://billing.stripe.com/p/session/test_1",
            "https://dashboard.stripe.com/test/customers",
            "https://stripe.com",
            "https://billing.stripe.com.evil.example",
            "https://evil.example/billing.stripe.com",
            "https://user@billing.stripe.com/p/session/test_1",
            "https://evil.example/paddle.com",
            "https://paddle.com.evil.example",
            "https://user@customer-portal.paddle.com",
            "https://overlay.muhrindustries.com:8443/pro",
            "file:///C:/Windows",
            "javascript:alert(1)",
        ] {
            assert!(!is_allowed_external_url(denied), "{denied}");
        }
    }

    #[test]
    fn never_prints_the_secret() {
        let credentials = LicenseCredentials {
            license_id: "license-1".into(),
            secret: "top-secret".into(),
        };

        assert!(!format!("{credentials:?}").contains("top-secret"));
    }

    #[test]
    fn trims_and_limits_activation_codes() {
        assert_eq!(
            normalize_activation_code("  FC-7K2QM-9XH4D-PZ1RT-W8C3N "),
            Some("FC-7K2QM-9XH4D-PZ1RT-W8C3N".into())
        );
        assert_eq!(normalize_activation_code("   "), None);
        assert_eq!(normalize_activation_code(&"x".repeat(MAX_ACTIVATION_CODE_LENGTH + 1)), None);
    }

    #[test]
    fn serializes_the_free_state_like_the_shared_model() {
        assert_eq!(
            serde_json::to_value(LicenseState::default()).unwrap(),
            serde_json::json!({
                "plan": "free",
                "status": "none",
                "reference": null,
                "expiresAt": null,
                "refreshAfter": null,
                "needsRefresh": false,
                "lastError": null,
                "features": [],
                "installations": []
            })
        );
    }
}
