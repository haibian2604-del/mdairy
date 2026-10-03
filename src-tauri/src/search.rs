use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub rel: String,
    pub line: u32,
    pub column: u32,
    pub line_text: String,
}

fn skipped(name: &str) -> bool {
    // 与 files.rs 的过滤规则保持一致：隐藏文件/_assets/node_modules
    name.starts_with('.') || name == "_assets" || name == "node_modules"
}

fn search_dir(root: &Path, dir: &Path, query: &str, out: &mut Vec<SearchHit>, limit: usize) {
    if out.len() >= limit {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    // read_dir 顺序不确定，按名字排序保证结果顺序稳定（同目录下文件先于子目录内命中）
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        if out.len() >= limit {
            return;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if skipped(&name) {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            search_dir(root, &p, query, out, limit);
        } else if name.to_lowercase().ends_with(".md") {
            let Ok(bytes) = fs::read(&p) else { continue };
            // 与 files.rs 相同的解码策略：BOM → UTF-8 校验 → 由 files::decode 提供
            let (text, _) = crate::files::decode_public(&bytes);
            let rel = p
                .strip_prefix(root)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            let mut per_file = 0;
            for (i, line) in text.lines().enumerate() {
                if let Some(col) = line.to_lowercase().find(&query.to_lowercase()) {
                    out.push(SearchHit {
                        rel: rel.clone(),
                        line: i as u32,
                        column: col as u32,
                        line_text: line.to_string(),
                    });
                    per_file += 1;
                    if per_file >= 20 || out.len() >= limit {
                        break;
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn search_vault(vault: String, query: String) -> Result<Vec<SearchHit>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let root = fs::canonicalize(&vault).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    search_dir(&root, &root, &query, &mut out, 200);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_vault() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mdairy-search-{}-{}",
            std::process::id(),
            chrono_like_counter()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::create_dir_all(dir.join("_assets")).unwrap();
        fs::write(dir.join("a.md"), "第一行\n苹果馅饼\n第三行").unwrap();
        fs::write(dir.join("sub/b.md"), "苹果手机").unwrap();
        fs::write(dir.join("_assets/x.md"), "苹果不应命中").unwrap();
        dir
    }

    fn chrono_like_counter() -> u32 {
        use std::sync::atomic::{AtomicU32, Ordering};
        static C: AtomicU32 = AtomicU32::new(0);
        C.fetch_add(1, Ordering::SeqCst)
    }

    #[test]
    fn finds_case_insensitive_substring_with_positions() {
        let v = temp_vault();
        let hits = search_vault(v.to_str().unwrap().to_string(), "苹果".into()).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].rel, "a.md");
        assert_eq!(hits[0].line, 1);
        assert_eq!(hits[0].line_text, "苹果馅饼");
        assert_eq!(hits[1].rel, "sub/b.md");
    }

    #[test]
    fn skips_hidden_and_assets_and_node_modules() {
        let v = temp_vault();
        let hits = search_vault(v.to_str().unwrap().to_string(), "不应命中".into()).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn empty_query_returns_empty() {
        let v = temp_vault();
        let hits = search_vault(v.to_str().unwrap().to_string(), "".into()).unwrap();
        assert!(hits.is_empty());
    }
}
