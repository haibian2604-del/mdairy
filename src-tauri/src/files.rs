use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::{Encoding, UTF_8};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TreeNode {
    Dir { name: String, rel: String, children: Vec<TreeNode> },
    File { name: String, rel: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub mtime_millis: u64,
    pub encoding: String,
}

pub(crate) fn rel_of(root: &Path, p: &Path) -> String {
    let rel = p.strip_prefix(root).unwrap_or(p);
    rel.to_string_lossy().replace('\\', "/")
}

pub(crate) fn skipped(name: &str) -> bool {
    name.starts_with('.') || name == "_assets" || name == "node_modules"
}

fn file_mtime(p: &Path) -> u64 {
    fs::metadata(p).ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn resolve_secure(vault: &str, rel: &str) -> Result<PathBuf, String> {
    if rel.split('/').any(|seg| seg == "..") {
        return Err("路径不合法".into());
    }
    let root = fs::canonicalize(vault).map_err(|e| e.to_string())?;
    let target = fs::canonicalize(root.join(rel)).map_err(|e| e.to_string())?;
    if !target.starts_with(&root) {
        return Err("路径越界".into());
    }
    Ok(target)
}

pub fn build_tree(root: &Path, dir: &Path) -> Result<Vec<TreeNode>, String> {
    let mut nodes: Vec<(u8, TreeNode)> = Vec::new();
    for e in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().to_string();
        if skipped(&name) {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            nodes.push((0, TreeNode::Dir {
                name: name.clone(),
                rel: rel_of(root, &p),
                children: build_tree(root, &p)?,
            }));
        } else if name.to_lowercase().ends_with(".md") {
            nodes.push((1, TreeNode::File { name, rel: rel_of(root, &p) }));
        }
    }
    nodes.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| node_name(&a.1).cmp(node_name(&b.1))));
    Ok(nodes.into_iter().map(|(_, n)| n).collect())
}

fn node_name(n: &TreeNode) -> &str {
    match n {
        TreeNode::Dir { name, .. } | TreeNode::File { name, .. } => name,
    }
}

pub(crate) fn decode(bytes: &[u8]) -> (String, &'static Encoding) {
    if let Some((enc, _bom_len)) = Encoding::for_bom(bytes) {
        return (enc.decode(bytes).0.into_owned(), enc);
    }
    if std::str::from_utf8(bytes).is_ok() {
        return (String::from_utf8_lossy(bytes).into_owned(), UTF_8);
    }
    let mut det = EncodingDetector::new(Iso2022JpDetection::Deny);
    det.feed(bytes, true);
    let enc = det.guess(None, Utf8Detection::Allow);
    (enc.decode(bytes).0.into_owned(), enc)
}

fn encode(content: &str, encoding: &str) -> Vec<u8> {
    let enc = Encoding::for_label(encoding.as_bytes()).unwrap_or(UTF_8);
    enc.encode(content).0.into_owned()
}

fn resolve_for_save(vault: &str, rel: &str) -> Result<PathBuf, String> {
    if rel.split('/').any(|seg| seg == "..") {
        return Err("路径不合法".into());
    }
    let root = fs::canonicalize(vault).map_err(|e| e.to_string())?;
    let target = root.join(rel);
    if let Ok(c) = fs::canonicalize(&target) {
        if !c.starts_with(&root) {
            return Err("路径越界".into());
        }
        return Ok(c);
    }
    let parent = target.parent().ok_or_else(|| "路径不合法".to_string())?;
    let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
    if !parent.starts_with(&root) {
        return Err("路径越界".into());
    }
    Ok(target)
}

fn read_content(p: &Path) -> Result<FileContent, String> {
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    let (content, enc) = decode(&bytes);
    Ok(FileContent {
        content,
        mtime_millis: file_mtime(p),
        encoding: enc.name().to_string(),
    })
}

#[tauri::command]
pub fn read_file(vault: &str, rel: &str) -> Result<FileContent, String> {
    let p = resolve_secure(vault, rel)?;
    read_content(&p)
}

#[tauri::command]
pub fn save_file(
    vault: &str,
    rel: &str,
    content: &str,
    encoding: Option<String>,
    expected_mtime_millis: Option<u64>,
) -> Result<FileContent, String> {
    let p = resolve_for_save(vault, rel)?;
    if p.exists() {
        if let Some(expected) = expected_mtime_millis {
            if file_mtime(&p) != expected {
                return Err("外部修改冲突: 磁盘上的文件与保存时不同".into());
            }
        }
    }
    fs::write(&p, encode(content, encoding.as_deref().unwrap_or("UTF-8")))
        .map_err(|e| e.to_string())?;
    read_content(&p)
}

/// 未命名缓冲区保存到 vault 外时的落盘命令。路径来自系统保存对话框（用户显式选择），
/// 故不做 vault 限制；返回新文件 mtime 供前端记录。
#[tauri::command]
pub fn save_new_file(path: String, content: String) -> Result<u64, String> {
    let p = PathBuf::from(&path);
    fs::write(&p, content).map_err(|e| e.to_string())?;
    Ok(file_mtime(&p))
}

#[tauri::command]
pub fn list_tree(vault: String) -> Result<Vec<TreeNode>, String> {
    let root = fs::canonicalize(&vault).map_err(|e| e.to_string())?;
    build_tree(&root, &root)
}

/// 新建条目的名称只允许单个路径段
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name == ".." || name.contains('/') || name.contains('\\') {
        return Err("名称不合法".into());
    }
    Ok(())
}

#[tauri::command]
pub fn create_entry(vault: &str, parent_rel: &str, name: &str, kind: &str) -> Result<(), String> {
    validate_name(name)?;
    let parent = resolve_secure(vault, parent_rel)?;
    let target = parent.join(name);
    if target.exists() {
        return Err("已存在同名文件或文件夹".into());
    }
    match kind {
        "dir" => fs::create_dir(target).map_err(|e| e.to_string()),
        "file" => fs::write(target, b"").map_err(|e| e.to_string()),
        _ => Err("类型不合法".into()),
    }
}

#[tauri::command]
pub fn rename_entry(vault: &str, rel: &str, new_name: &str) -> Result<(), String> {
    validate_name(new_name)?;
    let old = resolve_secure(vault, rel)?;
    let parent = old.parent().ok_or_else(|| "路径不合法".to_string())?;
    // 新路径由原父目录拼出，天然同层；此处兜底校验防越界
    let root = fs::canonicalize(vault).map_err(|e| e.to_string())?;
    if !parent.starts_with(&root) {
        return Err("路径越界".into());
    }
    let target = parent.join(new_name);
    if target.exists() {
        return Err("已存在同名文件或文件夹".into());
    }
    fs::rename(&old, &target).map_err(|e| e.to_string())
}

/// 写入粘贴产生的图片资源到 `<vault>/_assets/`，返回 vault 相对路径如 `_assets/20261004-153000.png`。
/// ext 白名单（大小写不敏感）；时间戳文件名，同秒内冲突时追加序号保证不覆盖。
#[tauri::command]
pub fn write_asset(vault: &str, ext: &str, data: Vec<u8>) -> Result<String, String> {
    let ext = ext.to_ascii_lowercase();
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp") {
        return Err(format!("不支持的图片类型: {ext}"));
    }
    let dir = fs::canonicalize(vault).map_err(|e| e.to_string())?.join("_assets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let mut name = format!("{stamp}.{ext}");
    let mut n = 1;
    while dir.join(&name).exists() {
        n += 1;
        name = format!("{stamp}-{n}.{ext}");
    }
    fs::write(dir.join(&name), data).map_err(|e| e.to_string())?;
    Ok(format!("_assets/{name}"))
}

#[tauri::command]
pub fn trash_entry(vault: &str, rel: &str) -> Result<(), String> {
    let p = resolve_secure(vault, rel)?;
    trash::delete(&p).map_err(|e| format!("移入废纸篓失败: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use encoding_rs::GBK;

    fn temp_vault() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "mdairy-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("日记")).unwrap();
        fs::create_dir_all(dir.join("_assets")).unwrap();
        fs::write(dir.join("a.md"), "# hello").unwrap();
        fs::write(dir.join("日记/b.md"), "世界").unwrap();
        fs::write(dir.join("skip.txt"), "x").unwrap();
        fs::write(dir.join("_assets/pic.png"), "x").unwrap();
        dir
    }

    #[test]
    fn tree_lists_md_and_dirs_skips_hidden_and_assets() {
        let vault = temp_vault();
        let root = fs::canonicalize(&vault).unwrap();
        let tree = build_tree(&root, &root).unwrap();
        let names: Vec<&str> = tree.iter().map(|n| match n {
            TreeNode::Dir { name, .. } | TreeNode::File { name, .. } => name.as_str(),
        }).collect();
        assert_eq!(names, vec!["日记", "a.md"]);
    }

    #[test]
    fn read_rejects_traversal() {
        let vault = temp_vault();
        assert!(read_file(vault.to_str().unwrap(), "../outside.md").is_err());
    }

    #[test]
    fn read_rejects_missing_file() {
        let vault = temp_vault();
        assert!(read_file(vault.to_str().unwrap(), "nope.md").is_err());
    }

    #[test]
    fn save_then_read_roundtrip() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        let saved = save_file(v, "a.md", "# 新内容", None, None).unwrap();
        let read = read_file(v, "a.md").unwrap();
        assert_eq!(read.content, "# 新内容");
        assert!(saved.mtime_millis > 0 && read.mtime_millis >= saved.mtime_millis);
    }

    #[test]
    fn read_detects_gbk_and_save_roundtrips_in_gbk() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        let (gbk_bytes, _, _) = GBK.encode("中文日记");
        fs::write(vault.join("gbk.md"), gbk_bytes).unwrap();
        let read = read_file(v, "gbk.md").unwrap();
        assert_eq!(read.content, "中文日记");
        assert_eq!(read.encoding, "GBK");
        save_file(v, "gbk.md", "新内容", Some("GBK".into()), Some(read.mtime_millis)).unwrap();
        let again = read_file(v, "gbk.md").unwrap();
        assert_eq!(again.content, "新内容");
        assert_eq!(again.encoding, "GBK");
    }

    #[test]
    fn read_detects_utf8() {
        let vault = temp_vault();
        fs::write(vault.join("u.md"), "# hello").unwrap();
        assert_eq!(read_file(vault.to_str().unwrap(), "u.md").unwrap().encoding, "UTF-8");
    }

    #[test]
    fn save_allows_create_but_requires_existing_parent() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        save_file(v, "新建.md", "hi", None, None).unwrap();
        assert!(vault.join("新建.md").exists());
        assert!(save_file(v, "不存在目录/x.md", "hi", None, None).is_err());
    }

    #[test]
    fn save_rejects_stale_mtime() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        let read = read_file(v, "a.md").unwrap();
        let err = save_file(v, "a.md", "x", None, Some(read.mtime_millis + 999_999)).unwrap_err();
        assert!(err.starts_with("外部修改冲突"));
        save_file(v, "a.md", "y", None, Some(read.mtime_millis)).unwrap();
    }

    #[test]
    fn create_entry_creates_file_and_dir() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        create_entry(v, "", "新建.md", "file").unwrap();
        assert_eq!(read_file(v, "新建.md").unwrap().content, "");
        create_entry(v, "日记", "子目录", "dir").unwrap();
        assert!(vault.join("日记/子目录").is_dir());
    }

    #[test]
    fn create_entry_rejects_duplicate() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        let err = create_entry(v, "", "a.md", "file").unwrap_err();
        assert!(err.contains("已存在"));
        assert!(create_entry(v, "", "日记", "dir").is_err());
    }

    #[test]
    fn create_entry_rejects_invalid_name() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        assert!(create_entry(v, "", "..", "dir").is_err());
        assert!(create_entry(v, "", "a/b.md", "file").is_err());
        assert!(create_entry(v, "", "a\\b.md", "file").is_err());
        assert!(create_entry(v, "", "", "file").is_err());
    }

    #[test]
    fn rename_entry_roundtrip_and_rejects_duplicate_or_invalid() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        rename_entry(v, "a.md", "重命名.md").unwrap();
        assert!(!vault.join("a.md").exists());
        assert!(vault.join("重命名.md").exists());
        assert!(rename_entry(v, "重命名.md", "日记").is_err()); // 与已有目录同名
        assert!(rename_entry(v, "重命名.md", "skip.txt").is_err()); // 与兄弟文件同名
        assert!(rename_entry(v, "重命名.md", "../evil.md").is_err()); // 非法名
        assert!(rename_entry(v, "nope.md", "x.md").is_err()); // 原不存在
    }

    #[test]
    fn write_asset_writes_file_and_returns_rel() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        let rel = write_asset(v, "PNG", b"imgdata".to_vec()).unwrap();
        // rel 形态：_assets/<时间戳>.png
        assert!(rel.starts_with("_assets/") && rel.ends_with(".png"));
        let name = rel.trim_start_matches("_assets/");
        assert_eq!(fs::read(vault.join("_assets").join(name)).unwrap(), b"imgdata");
        // 同一秒内连写两张不冲突
        let rel2 = write_asset(v, "png", b"second".to_vec()).unwrap();
        assert_ne!(rel, rel2);
        assert_eq!(fs::read(vault.join(rel2)).unwrap(), b"second");
    }

    #[test]
    fn write_asset_rejects_bad_ext() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        assert!(write_asset(v, "exe", b"x".to_vec()).is_err());
        assert!(write_asset(v, "", b"x".to_vec()).is_err());
        assert!(write_asset(v, "png;rm", b"x".to_vec()).is_err());
    }

    #[test]
    fn trash_entry_moves_to_trash() {
        let vault = temp_vault();
        let v = vault.to_str().unwrap();
        trash_entry(v, "a.md").unwrap();
        assert!(!vault.join("a.md").exists());
        assert!(trash_entry(v, "nope.md").is_err());
    }
}
