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
}

fn rel_of(root: &Path, p: &Path) -> String {
    let rel = p.strip_prefix(root).unwrap_or(p);
    rel.to_string_lossy().replace('\\', "/")
}

fn skipped(name: &str) -> bool {
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

fn read_content(p: &Path) -> Result<FileContent, String> {
    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    Ok(FileContent {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        mtime_millis: file_mtime(p),
    })
}

#[tauri::command]
pub fn read_file(vault: &str, rel: &str) -> Result<FileContent, String> {
    let p = resolve_secure(vault, rel)?;
    read_content(&p)
}

#[tauri::command]
pub fn save_file(vault: &str, rel: &str, content: &str) -> Result<FileContent, String> {
    let p = resolve_secure(vault, rel)?;
    fs::write(&p, content).map_err(|e| e.to_string())?;
    read_content(&p)
}

#[tauri::command]
pub fn list_tree(vault: String) -> Result<Vec<TreeNode>, String> {
    let root = fs::canonicalize(&vault).map_err(|e| e.to_string())?;
    build_tree(&root, &root)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mdairy-test-{}", std::process::id()));
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
        let saved = save_file(v, "a.md", "# 新内容").unwrap();
        let read = read_file(v, "a.md").unwrap();
        assert_eq!(read.content, "# 新内容");
        assert!(saved.mtime_millis > 0 && read.mtime_millis >= saved.mtime_millis);
    }
}
