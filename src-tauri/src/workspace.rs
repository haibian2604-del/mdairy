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

/// 校验并规范化 vault 路径。启动为全新会话（Typora 式），不再持久化 last_vault。
#[tauri::command]
pub fn set_vault(path: String) -> Result<String, String> {
    let canonical = validate_vault(&path)?;
    Ok(canonical.to_string_lossy().into_owned())
}

/// 领取缓冲的系统打开请求（双击 md 冷启动时 Opened 先于 webview 的竞态兜底），取后即清。
#[tauri::command]
pub fn take_opened_files(app: tauri::AppHandle) -> Vec<String> {
    app.state::<crate::OpenedFiles>().0.lock().unwrap().drain(..).collect()
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
