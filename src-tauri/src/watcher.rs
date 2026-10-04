use crate::files::skipped;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, State};

pub struct WatcherState(pub Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>);

pub fn filter_paths(root: &Path, paths: &[PathBuf]) -> Vec<String> {
    let mut rels: Vec<String> = Vec::new();
    for p in paths {
        let Ok(rel) = p.strip_prefix(root) else { continue };
        let rel = rel.to_string_lossy().replace('\\', "/");
        // 任一路径分段命中（隐藏文件/_assets/node_modules）都整体过滤，
        // 例如 `_assets/p.png`、`node_modules/x.md`、`.hidden.md`。
        if rel.is_empty() || rel.split('/').any(skipped) {
            continue;
        }
        if !rels.contains(&rel) {
            rels.push(rel);
        }
    }
    rels
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultChanged {
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn watch_vault(
    app: tauri::AppHandle,
    state: State<WatcherState>,
    vault: String,
) -> Result<(), String> {
    let root = fs::canonicalize(&vault).map_err(|e| e.to_string())?;
    let mut guard = state.0.lock().map_err(|_| "watcher 状态锁错误".to_string())?;
    if let Some(old) = guard.take() {
        drop(old); // 旧 watcher 随 drop 停止
    }
    let app = app.clone();
    let watch_root = root.clone();
    let debouncer = new_debouncer(Duration::from_millis(300), None, move |res: DebounceEventResult| {
        let Ok(events) = res else { return };
        let paths: Vec<PathBuf> = events.iter().flat_map(|e| e.paths.iter().cloned()).collect();
        let changed = filter_paths(&watch_root, &paths);
        if !changed.is_empty() {
            let _ = app.emit("vault-changed", VaultChanged { paths: changed });
        }
    })
    .map_err(|e| e.to_string())?;
    let mut debouncer = debouncer;
    // notify-debouncer-full 0.7: Debouncer 自身实现 watch/unwatch（watcher() 原地修改返回 ()），
    // 语义与 brief 一致：递归监听 vault 根目录。
    debouncer
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *guard = Some(debouncer);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_and_converts_to_rel() {
        let root = Path::new("/vault");
        let paths = vec![
            PathBuf::from("/vault/日记/a.md"),
            PathBuf::from("/vault/_assets/p.png"),
            PathBuf::from("/vault/.hidden.md"),
            PathBuf::from("/vault/node_modules/x.md"),
            PathBuf::from("/vault/日记/a.md"), // 去重
            PathBuf::from("/elsewhere/b.md"),  // vault 外忽略
        ];
        assert_eq!(filter_paths(root, &paths), vec!["日记/a.md"]);
    }
}
