use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub fn validate_vault(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if !p.is_dir() {
        return Err("所选路径不是文件夹".into());
    }
    fs::canonicalize(&p).map_err(|e| format!("无法解析路径: {e}"))
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub last_vault: Option<String>,
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub fn load_config(app: &tauri::AppHandle) -> AppConfig {
    config_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_vault(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let canonical = validate_vault(&path)?;
    let s = canonical.to_string_lossy().into_owned();
    let cfg = AppConfig { last_vault: Some(s.clone()) };
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    fs::write(config_path(&app)?, json).map_err(|e| e.to_string())?;
    Ok(s)
}

#[tauri::command]
pub fn get_last_vault(app: tauri::AppHandle) -> Option<String> {
    load_config(&app).last_vault
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_dir() {
        assert!(validate_vault("/ definitely / not / exist").is_err());
    }

    #[test]
    fn accepts_real_dir_and_canonicalizes() {
        let tmp = std::env::temp_dir();
        let s = tmp.to_string_lossy().to_string();
        let p = validate_vault(&s).unwrap();
        assert!(p.is_absolute());
    }
}
