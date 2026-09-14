use serde::{Deserialize, Serialize};

const TWITCH_SECRET_SERVICE: &str = "com.jona1502.flagcount.twitch";
const TWITCH_ACCOUNT: &str = "oauth";

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwitchCredentials {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: String,
}

impl std::fmt::Debug for TwitchCredentials {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("TwitchCredentials")
            .field("access_token", &"<redacted>")
            .field("refresh_token", &"<redacted>")
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

#[derive(Default)]
pub struct TwitchVault;

impl TwitchVault {
    pub fn load(&self) -> Result<Option<TwitchCredentials>, ()> {
        let entry = keyring::Entry::new(TWITCH_SECRET_SERVICE, TWITCH_ACCOUNT).map_err(|_| ())?;
        match entry.get_password() {
            Ok(secret) => serde_json::from_str(&secret).map(Some).map_err(|_| ()),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(()),
        }
    }

    pub fn save(&self, credentials: Option<&TwitchCredentials>) -> Result<(), ()> {
        let entry = keyring::Entry::new(TWITCH_SECRET_SERVICE, TWITCH_ACCOUNT).map_err(|_| ())?;
        match credentials {
            Some(credentials) => entry.set_password(&serde_json::to_string(credentials).map_err(|_| ())?).map_err(|_| ()),
            None => match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err(()),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_never_print_tokens() {
        let value = TwitchCredentials { access_token: "access-secret".into(), refresh_token: "refresh-secret".into(), expires_at: "2026-01-01T00:00:00Z".into() };
        let debug = format!("{value:?}");
        assert!(!debug.contains("access-secret"));
        assert!(!debug.contains("refresh-secret"));
    }
}
