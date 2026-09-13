use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};
use crate::sidecar::AppError;

pub const LOGO_LIMIT: usize = 2 * 1024 * 1024;
pub const BACKGROUND_LIMIT: usize = 5 * 1024 * 1024;

fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Some("png"); }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) { return Some("jpg"); }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" { return Some("webp"); }
    None
}

fn random_name(bytes: &[u8], extension: &str) -> String {
    let seed = SystemTime::now().duration_since(UNIX_EPOCH).map(|value| value.as_nanos()).unwrap_or_default();
    let mut first = DefaultHasher::new();
    (seed, std::process::id(), bytes.len()).hash(&mut first);
    let a = first.finish();
    let mut second = DefaultHasher::new();
    (a, bytes.get(..64)).hash(&mut second);
    format!("{a:016x}{:016x}.{extension}", second.finish())
}

pub fn import<R: Runtime>(app: &AppHandle<R>, kind: &str, bytes: &[u8]) -> Result<String, AppError> {
    let limit = match kind { "logo" => LOGO_LIMIT, "background" => BACKGROUND_LIMIT, _ => return Err(AppError::new("invalid-asset", "Unknown asset kind")) };
    if bytes.is_empty() || bytes.len() > limit { return Err(AppError::new("invalid-asset", "Image exceeds the allowed size")); }
    let extension = image_extension(bytes).ok_or_else(|| AppError::new("invalid-asset", "Only PNG, JPEG and WebP images are allowed"))?;
    let directory = app.path().app_data_dir().map_err(|_| AppError::new("asset-unavailable", "Asset storage is unavailable"))?.join("overlay-assets");
    fs::create_dir_all(&directory).map_err(|_| AppError::new("asset-unavailable", "Asset storage is unavailable"))?;
    let name = random_name(bytes, extension);
    let temporary = directory.join(format!("{name}.tmp"));
    fs::write(&temporary, bytes).and_then(|_| fs::rename(&temporary, directory.join(&name))).map_err(|_| AppError::new("asset-unavailable", "Image could not be stored"))?;
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_raster_signatures() {
        assert_eq!(image_extension(b"\x89PNG\r\n\x1a\nrest"), Some("png"));
        assert_eq!(image_extension(b"<svg></svg>"), None);
    }
}
