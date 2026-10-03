# mdairy M1（骨架）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通"打开文件夹 → 文件树 → 读文件进 CodeMirror 编辑 → ⌘S 保存"的完整闭环，验证 Tauri 2 + React 技术栈可用。

**Architecture:** Rust 侧三个模块（`workspace.rs` 工作区选择与记忆、`files.rs` 文件读取/保存/列树、路径安全校验内聚其中），前端 Zustand 双 store（workspace/tabs）+ React 组件壳（Sidebar/TabBar/EditorPane/StatusBar/EmptyState）。所有文件 IO 走自定义 Tauri command，前端不直接碰 fs。

**Tech Stack:** Tauri 2 · React + TypeScript + Vite · Zustand · CodeMirror 6 · tauri-plugin-dialog · Vitest + Testing Library · cargo test

**Spec:** [docs/开发文档.md](../../开发文档.md) §3/§4/§5/§6 · [docs/页面需求文档.md](../../页面需求文档.md) §1/§3(W1,W5,W6)/§5/§6

## Global Constraints

- UI 文案全部中文（开发文档 §4 F13）。
- 单组件不超过约 400 行，超了就拆（开发文档 §6）。
- 所有接受路径的 Tauri command 拒绝 `..` 与越界路径（开发文档 §6）。
- 不从 CDN 加载字体，用系统字体栈（页面需求文档 §1.3）。
- 图标一律 Lucide SVG，无 emoji 图标（页面需求文档 §1.1）。
- 窗口默认 1280×800，最小 960×600（页面需求文档 §1.4）。
- 亮/暗 token 本任务就位（CSS 变量），主题切换按钮在 M5。
- Node 18+ / pnpm；macOS 优先。
- Rust command 参数 snake_case，`invoke` 端 camelCase；跨端结构体加 `#[serde(rename_all = "camelCase")]`。
- 提交信息用 conventional commits（feat/fix/chore/test/docs）。

## 后续里程碑（非本计划任务，仅路线图）

M2 编辑闭环（标签确认关闭、外部修改冲突、编码识别）、M3 渲染（markdown-it 管线、三态视图、滚动同步）、M4 检索导航（全文搜索、大纲、命令面板）、M5 收尾（暗色切换按钮、图片粘贴、文件 CRUD、打包）。每个里程碑在前一个**人工验收通过后**依据当时真实代码另行出计划，不在本计划内细化。

---

### Task 1: 脚手架与窗口配置

**Files:**
- Create: `package.json`、`vite.config.ts`、`index.html`、`tsconfig.json`、`src-tauri/`（由 create-tauri-app 模板生成后并入仓库）
- Modify: `.gitignore`、`src-tauri/tauri.conf.json`

**Interfaces:**
- Produces: 可运行的 Tauri 2 + React-TS 工程；`pnpm tauri dev` 启动窗口；后续任务的 npm 依赖基座。

- [ ] **Step 1: 检查工具链**

Run: `node -v && pnpm -v && rustc --version`
Expected: node ≥ 18；任一缺失则先安装（pnpm: `corepack enable`；rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`），并安装 macOS 所需 Xcode CLT（`xcode-select --install`）。

- [ ] **Step 2: 用 CTA 生成模板到临时目录**

```bash
cd /tmp && rm -rf mdairy-cta && pnpm create tauri-app@latest mdairy-cta --template react-ts --manager pnpm --yes
```

- [ ] **Step 3: 并入现有仓库（保留已有 README/docs）**

```bash
cd /Users/kk/code/project/mdairy
rsync -a --exclude node_modules --exclude .git /tmp/mdairy-cta/ ./
```

- [ ] **Step 4: 修正 .gitignore 与窗口配置**

`.gitignore` 追加：

```gitignore
node_modules/
dist/
src-tauri/target/
```

`src-tauri/tauri.conf.json` 中 `app.windows` 改为（并把 `identifier` 改为 `com.mdairy.app`）：

```json
"windows": [
  {
    "title": "mdairy",
    "width": 1280,
    "height": 800,
    "minWidth": 960,
    "minHeight": 600
  }
]
```

- [ ] **Step 5: 安装依赖并冒烟**

```bash
pnpm install && pnpm tauri dev
```

Expected: 弹出 1280×800 空白窗口（人工确认后 Ctrl+C 退出）。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold tauri2+react-ts project, window 1280x800"
```

---

### Task 2: 设计 token 与 AppShell 静态布局

**Files:**
- Modify: `src/App.tsx`、`src/main.tsx`（引入样式）
- Create: `src/styles.css`、`src/components/AppShell.tsx`、`src/App.test.tsx`
- Modify: `vite.config.ts`（vitest 配置）

**Interfaces:**
- Produces: CSS 变量 `--bg/--bg-sidebar/--fg/--fg-muted/--border/--accent/--accent-fg/--danger/--ring`（亮暗两组）；组件 `AppShell`（props: `sidebar: ReactNode; main: ReactNode; statusBar: ReactNode`）。

- [ ] **Step 1: 安装测试与 UI 基础依赖**

```bash
pnpm add zustand lucide-react
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

`vite.config.ts` 整体替换为：

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: "./src/test-setup.ts" },
});
```

同目录创建 `src/test-setup.ts`：

```ts
import "@testing-library/jest-dom/vitest";
```

`package.json` scripts 增加 `"test": "vitest run"`。

- [ ] **Step 2: 写失败测试**

`src/App.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./components/EditorPane", () => ({ EditorPane: () => <div>editor-mock</div> }));
vi.mock("./api", () => ({
  api: {
    setVault: vi.fn(),
    getLastVault: vi.fn(async () => null),
    listTree: vi.fn(async () => []),
    readFile: vi.fn(),
    saveFile: vi.fn(),
  },
}));

import App from "./App";

describe("App", () => {
  it("未打开 vault 时显示空状态", async () => {
    render(<App />);
    expect(await screen.findByText("打开一个文件夹，开始笔记")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（App.tsx 还是 CTA 模板内容，没有该文案）。

- [ ] **Step 4: 实现 token 与布局**

`src/styles.css`（`main.tsx` 中 `import "./styles.css"`，删除模板的 App.css）：

```css
:root {
  --bg: #fafaf9; --bg-sidebar: #f5f5f4; --bg-inset: #f5f5f4;
  --fg: #1c1917; --fg-muted: #57534e; --border: #e7e5e4;
  --accent: #d97706; --accent-fg: #ffffff;
  --danger: #dc2626; --ring: #d97706;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0c0a09; --bg-sidebar: #171412; --bg-inset: #1c1917;
    --fg: #fafaf9; --fg-muted: #a8a29e; --border: #292524;
    --accent: #f59e0b; --accent-fg: #0c0a09;
    --danger: #ef4444; --ring: #f59e0b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.6 -apple-system, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif;
}
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; padding: 0; }
button:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--ring); outline-offset: -1px; }

.app-shell {
  display: grid; height: 100vh;
  grid-template-columns: 260px 1fr; grid-template-rows: 1fr 28px;
}
.app-shell.no-vault { grid-template-columns: 1fr; }
.sidebar {
  grid-row: 1; background: var(--bg-sidebar); border-right: 1px solid var(--border);
  overflow-y: auto; display: flex; flex-direction: column;
}
.main-area { display: flex; flex-direction: column; min-width: 0; grid-row: 1; }
.status-bar {
  grid-column: 1 / -1; display: flex; align-items: center; gap: 16px;
  padding: 0 12px; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--fg-muted); white-space: nowrap;
}
.status-path { overflow: hidden; text-overflow: ellipsis; }

.empty-state {
  place-self: center; display: flex; flex-direction: column; align-items: center; gap: 12px;
  color: var(--fg-muted);
}
.btn-primary {
  background: var(--accent); color: var(--accent-fg);
  padding: 8px 20px; border-radius: 6px; font-weight: 500;
}
.error-text { color: var(--danger); }
```

`src/components/AppShell.tsx`：

```tsx
import type { ReactNode } from "react";

export function AppShell({ sidebar, main, statusBar, hasSidebar }: {
  sidebar: ReactNode; main: ReactNode; statusBar: ReactNode; hasSidebar: boolean;
}) {
  return (
    <div className={`app-shell ${hasSidebar ? "" : "no-vault"}`}>
      {hasSidebar && <aside className="sidebar">{sidebar}</aside>}
      <main className="main-area">{main}</main>
      <footer className="status-bar">{statusBar}</footer>
    </div>
  );
}
```

`src/App.tsx` 先用最小实现（vault 状态在 Task 5 接入，这里先用本地 state 让测试通过并看到空状态）：

```tsx
import { AppShell } from "./components/AppShell";

export default function App() {
  return (
    <AppShell hasSidebar={false} sidebar={null} main={
      <div className="empty-state">
        <p>打开一个文件夹，开始笔记</p>
      </div>
    } statusBar={<span />} />
  );
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test`
Expected: PASS（1 个用例）。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: design tokens + app shell layout + vitest setup"
```

---

### Task 3: Rust 工作区命令（选择/记忆 vault）

**Files:**
- Create: `src-tauri/src/workspace.rs`
- Modify: `src-tauri/src/lib.rs`（注册模块与命令）、`src-tauri/Cargo.toml`（`cargo add tauri-plugin-dialog`，在 `src-tauri/` 目录内执行）
- Modify: `src-tauri/capabilities/default.json`（permissions 增加 `"dialog:default"`）

**Interfaces:**
- Produces: 纯函数 `validate_vault(path: &str) -> Result<PathBuf, String>`；命令 `set_vault(app, path) -> Result<String, String>`（校验并持久化，返回规范化路径）、`get_last_vault(app) -> Option<String>`。配置文件位于 `app_config_dir()/config.json`，结构 `{"last_vault": "..."}`。

- [ ] **Step 1: 写失败测试**

`src-tauri/src/workspace.rs` 先只写测试骨架与被测纯函数签名：

```rust
use std::path::PathBuf;

pub fn validate_vault(path: &str) -> Result<PathBuf, String> {
    unimplemented!()
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
```

Run: `cd src-tauri && cargo test workspace`
Expected: FAIL（`unimplemented!()` panic）。

- [ ] **Step 2: 实现**

```rust
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
    load_config(app).last_vault
}
```

`src-tauri/src/lib.rs`：

```rust
mod files;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            workspace::get_last_vault,
            workspace::set_vault,
            files::list_tree,
            files::read_file,
            files::save_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`files` 模块在 Task 4 才创建；为让本任务可编译，先建占位文件 `src-tauri/src/files.rs` 内容仅 `// Task 4 实现`，并在 `invoke_handler` 中暂只注册 workspace 两个命令（Task 4 再补注册）。

- [ ] **Step 3: 运行确认通过**

Run: `cd src-tauri && cargo test workspace`
Expected: PASS（2 个用例）。`cargo build` 无错误。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(rust): vault validate/persist commands with config file"
```

---

### Task 4: Rust 文件命令（列树/读/存 + 路径安全）

**Files:**
- Modify: `src-tauri/src/files.rs`（替换占位）
- Modify: `src-tauri/src/lib.rs`（补注册三个命令）

**Interfaces:**
- Produces: 结构体 `TreeNode { name: String, rel: String, kind: "dir"|"file", children: Option<Vec<TreeNode>> }`（serde camelCase + tag）；`FileContent { content: String, mtime_millis: u64 }`（serde camelCase）；纯函数 `resolve_secure(vault: &str, rel: &str) -> Result<PathBuf, String>`、`build_tree(root: &Path, dir: &Path) -> Result<Vec<TreeNode>, String>`、`read_file(vault: &str, rel: &str) -> Result<FileContent, String>`、`save_file(vault: &str, rel: &str, content: &str) -> Result<FileContent, String>`；命令 `list_tree(vault) -> Result<Vec<TreeNode>, String>`。`rel` 恒用 `/` 分隔、相对 vault 根。

- [ ] **Step 1: 写失败测试**

`src-tauri/src/files.rs` 整体替换为测试先行版本：

```rust
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, PartialEq)]
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

pub fn resolve_secure(_vault: &str, _rel: &str) -> Result<PathBuf, String> {
    unimplemented!()
}

pub fn build_tree(_root: &Path, _dir: &Path) -> Result<Vec<TreeNode>, String> {
    unimplemented!()
}

pub fn read_file(_vault: &str, _rel: &str) -> Result<FileContent, String> {
    unimplemented!()
}

pub fn save_file(_vault: &str, _rel: &str, _content: &str) -> Result<FileContent, String> {
    unimplemented!()
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
```

Run: `cd src-tauri && cargo test files`
Expected: FAIL（panic: not implemented）。

- [ ] **Step 2: 实现**

```rust
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
    let mut dirs: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();
    for e in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().to_string();
        if skipped(&name) {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            dirs.push(TreeNode::Dir {
                name: name.clone(),
                rel: rel_of(root, &p),
                children: build_tree(root, &p)?,
            });
        } else if name.to_lowercase().ends_with(".md") {
            files.push(TreeNode::File { name, rel: rel_of(root, &p) });
        }
    }
    dirs.sort_by(|a, b| match (a, b) {
        (TreeNode::Dir { name: an, .. }, TreeNode::Dir { name: bn, .. }) => an.cmp(bn),
        _ => std::cmp::Ordering::Equal,
    });
    files.sort_by(|a, b| match (a, b) {
        (TreeNode::File { name: an, .. }, TreeNode::File { name: bn, .. }) => an.cmp(bn),
        _ => std::cmp::Ordering::Equal,
    });
    dirs.extend(files);
    Ok(dirs)
}

pub fn read_file(vault: &str, rel: &str) -> Result<FileContent, String> {
    let p = resolve_secure(vault, rel)?;
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    Ok(FileContent {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        mtime_millis: file_mtime(&p),
    })
}

pub fn save_file(vault: &str, rel: &str, content: &str) -> Result<FileContent, String> {
    let p = resolve_secure(vault, rel)?;
    fs::write(&p, content).map_err(|e| e.to_string())?;
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    Ok(FileContent {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        mtime_millis: file_mtime(&p),
    })
}
```

`lib.rs` 的 `generate_handler!` 补齐为五个命令（见 Task 3 代码块中的最终形态）。

- [ ] **Step 3: 运行确认通过**

Run: `cd src-tauri && cargo test`
Expected: PASS（workspace 2 + files 4，共 6 个用例）。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(rust): tree/read/save commands with path traversal guard"
```

---

### Task 5: 前端 api 层与 workspaceStore

**Files:**
- Create: `src/api.ts`、`src/stores/workspace.ts`、`src/stores/workspace.test.ts`

**Interfaces:**
- Produces: `api.setVault(path: string): Promise<string>`、`api.getLastVault(): Promise<string | null>`、`api.listTree(vault: string): Promise<TreeNode[]>`、`api.readFile(vault, rel): Promise<FileContent>`、`api.saveFile(vault, rel, content): Promise<FileContent>`；`TreeNode = { kind: "dir"; name: string; rel: string; children: TreeNode[] } | { kind: "file"; name: string; rel: string }`；`FileContent = { content: string; mtimeMillis: number }`；`useWorkspaceStore`：`{ vault: string | null; tree: TreeNode[]; loading: boolean; error: string | null; openVault(path): Promise<void>; restoreLastVault(): Promise<void> }`。

- [ ] **Step 1: 安装 Tauri 依赖**

```bash
pnpm add @tauri-apps/plugin-dialog
```

- [ ] **Step 2: 写失败测试**

`src/stores/workspace.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    setVault: vi.fn(async (p: string) => `/canon/${p}`),
    getLastVault: vi.fn(async () => "/canon/last-vault"),
    listTree: vi.fn(async () => [{ kind: "file", name: "a", rel: "a.md" }]),
    readFile: vi.fn(),
    saveFile: vi.fn(),
  },
}));

import { useWorkspaceStore } from "./workspace";

describe("workspaceStore", () => {
  beforeEach(() => useWorkspaceStore.setState({ vault: null, tree: [], loading: false, error: null }));

  it("openVault 规范化路径并加载文件树", async () => {
    await useWorkspaceStore.getState().openVault("my-vault");
    const s = useWorkspaceStore.getState();
    expect(s.vault).toBe("/canon/my-vault");
    expect(s.tree).toHaveLength(1);
    expect(s.error).toBeNull();
  });

  it("openVault 失败时写入 error 且不设 vault", async () => {
    const { api } = await import("../api");
    vi.mocked(api.setVault).mockRejectedValueOnce("不是文件夹");
    await useWorkspaceStore.getState().openVault("bad");
    const s = useWorkspaceStore.getState();
    expect(s.vault).toBeNull();
    expect(s.error).toContain("不是文件夹");
  });

  it("restoreLastVault 恢复上次工作区", async () => {
    await useWorkspaceStore.getState().restoreLastVault();
    expect(useWorkspaceStore.getState().vault).toBe("/canon/last-vault");
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现**

`src/api.ts`：

```ts
import { invoke } from "@tauri-apps/api/core";

export type TreeNode =
  | { kind: "dir"; name: string; rel: string; children: TreeNode[] }
  | { kind: "file"; name: string; rel: string };

export interface FileContent {
  content: string;
  mtimeMillis: number;
}

export const api = {
  setVault: (path: string) => invoke<string>("set_vault", { path }),
  getLastVault: () => invoke<string | null>("get_last_vault"),
  listTree: (vault: string) => invoke<TreeNode[]>("list_tree", { vault }),
  readFile: (vault: string, rel: string) => invoke<FileContent>("read_file", { vault, rel }),
  saveFile: (vault: string, rel: string, content: string) =>
    invoke<FileContent>("save_file", { vault, rel, content }),
};
```

`src/stores/workspace.ts`：

```ts
import { create } from "zustand";
import { api, type TreeNode } from "../api";

interface WorkspaceState {
  vault: string | null;
  tree: TreeNode[];
  loading: boolean;
  error: string | null;
  openVault: (path: string) => Promise<void>;
  restoreLastVault: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  vault: null,
  tree: [],
  loading: false,
  error: null,
  openVault: async (path) => {
    set({ loading: true, error: null });
    try {
      const vault = await api.setVault(path);
      const tree = await api.listTree(vault);
      set({ vault, tree, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },
  restoreLastVault: async () => {
    const last = await api.getLastVault().catch(() => null);
    if (last) await useWorkspaceStore.getState().openVault(last);
  },
}));
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test`
Expected: PASS（此前 1 + 新增 3）。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: frontend api layer + workspace store"
```

---

### Task 6: tabsStore（打开/关闭/脏标记/保存）

**Files:**
- Create: `src/stores/tabs.ts`、`src/stores/tabs.test.ts`

**Interfaces:**
- Consumes: `api.saveFile`、`useWorkspaceStore.getState().vault`。
- Produces: `Tab = { rel: string; name: string; content: string; savedContent: string; mtimeMillis: number }`；`useTabsStore`：`{ tabs: Tab[]; activeRel: string | null; open(t: { rel; name; content; mtimeMillis }): void; close(rel): void; setActive(rel): void; updateActive(content): void; isDirty(rel: string | null): boolean; saveActive(): Promise<void> }`。`name` 存储时去掉 `.md` 后缀。

- [ ] **Step 1: 写失败测试**

`src/stores/tabs.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { saveFile: vi.fn(async (_v: string, _r: string, c: string) => ({ content: c, mtimeMillis: 42 })) },
}));

import { useTabsStore } from "./tabs";
import { useWorkspaceStore } from "./workspace";

describe("tabsStore", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeRel: null });
    useWorkspaceStore.setState({ vault: "/canon/v" });
  });

  it("open 打开并激活，name 去掉 .md 后缀", () => {
    useTabsStore.getState().open({ rel: "a.md", name: "a.md", content: "# hi", mtimeMillis: 1 });
    const s = useTabsStore.getState();
    expect(s.activeRel).toBe("a.md");
    expect(s.tabs[0].name).toBe("a");
  });

  it("重复 open 同一文件只聚焦不新建", () => {
    const o = { rel: "a.md", name: "a", content: "# hi", mtimeMillis: 1 };
    useTabsStore.getState().open(o);
    useTabsStore.getState().open({ ...o, content: "# 改了" });
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0].content).toBe("# hi");
  });

  it("updateActive 产生脏标记，保存后清除", async () => {
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# hi", mtimeMillis: 1 });
    useTabsStore.getState().updateActive("# 改了");
    expect(useTabsStore.getState().isDirty("a.md")).toBe(true);
    await useTabsStore.getState().saveActive();
    const s = useTabsStore.getState();
    expect(s.isDirty("a.md")).toBe(false);
    expect(s.tabs[0].mtimeMillis).toBe(42);
  });

  it("close 激活项后把焦点挪到相邻标签", () => {
    const s = useTabsStore.getState();
    s.open({ rel: "a.md", name: "a", content: "1", mtimeMillis: 1 });
    s.open({ rel: "b.md", name: "b", content: "2", mtimeMillis: 1 });
    s.close("b.md");
    expect(useTabsStore.getState().activeRel).toBe("a.md");
  });

  it("无 vault 时 saveActive 静默跳过", async () => {
    useWorkspaceStore.setState({ vault: null });
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "x", mtimeMillis: 1 });
    await expect(useTabsStore.getState().saveActive()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`src/stores/tabs.ts`：

```ts
import { create } from "zustand";
import { api } from "../api";
import { useWorkspaceStore } from "./workspace";

export interface Tab {
  rel: string;
  name: string;
  content: string;
  savedContent: string;
  mtimeMillis: number;
}

interface OpenArgs {
  rel: string;
  name: string;
  content: string;
  mtimeMillis: number;
}

interface TabsState {
  tabs: Tab[];
  activeRel: string | null;
  open: (t: OpenArgs) => void;
  close: (rel: string) => void;
  setActive: (rel: string) => void;
  updateActive: (content: string) => void;
  isDirty: (rel: string | null) => boolean;
  saveActive: () => Promise<void>;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeRel: null,
  open: (t) =>
    set((s) => {
      if (s.tabs.some((x) => x.rel === t.rel)) return { activeRel: t.rel };
      const name = t.name.replace(/\.md$/i, "");
      return {
        tabs: [...s.tabs, { ...t, name, savedContent: t.content }],
        activeRel: t.rel,
      };
    }),
  close: (rel) =>
    set((s) => {
      const idx = s.tabs.findIndex((x) => x.rel === rel);
      const tabs = s.tabs.filter((x) => x.rel !== rel);
      let activeRel = s.activeRel;
      if (s.activeRel === rel) {
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeRel = next ? next.rel : null;
      }
      return { tabs, activeRel };
    }),
  setActive: (rel) => set({ activeRel: rel }),
  updateActive: (content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.rel === s.activeRel ? { ...t, content } : t)),
    })),
  isDirty: (rel) => {
    if (!rel) return false;
    const t = get().tabs.find((x) => x.rel === rel);
    return !!t && t.content !== t.savedContent;
  },
  saveActive: async () => {
    const { activeRel, tabs } = get();
    const tab = tabs.find((x) => x.rel === activeRel);
    const vault = useWorkspaceStore.getState().vault;
    if (!tab || !vault) return;
    const res = await api.saveFile(vault, tab.rel, tab.content);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.rel === tab.rel ? { ...t, savedContent: t.content, mtimeMillis: res.mtimeMillis } : t,
      ),
    }));
  },
}));
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test`
Expected: PASS（累计 9 个用例）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: tabs store with dirty tracking and save"
```

---

### Task 7: FileTree 组件与 Sidebar

**Files:**
- Create: `src/components/FileTree.tsx`、`src/components/FileTree.test.tsx`、`src/hooks/useOpenFile.ts`、`src/components/Sidebar.tsx`
- Modify: `src/App.tsx`（接入 store：vault 有值渲染 Sidebar）、`src/styles.css`（树样式）

**Interfaces:**
- Consumes: `TreeNode`、`useWorkspaceStore`、`api.readFile`、`useTabsStore.open/setActive`。
- Produces: `<FileTree nodes={TreeNode[]} onOpenFile={(rel: string) => void} />`；`useOpenFile(): (rel: string) => Promise<void>`；`<Sidebar />`（顶部 vault 名按钮 + FileTree）。

- [ ] **Step 1: 写失败测试**

`src/components/FileTree.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree";
import type { TreeNode } from "../api";

const tree: TreeNode[] = [
  { kind: "dir", name: "日记", rel: "日记", children: [
    { kind: "file", name: "b.md", rel: "日记/b.md" },
  ] },
  { kind: "file", name: "a.md", rel: "a.md" },
];

describe("FileTree", () => {
  it("渲染文件与文件夹，文件夹需展开后才显示子文件", async () => {
    const onOpen = vi.fn();
    render(<FileTree nodes={tree} onOpenFile={onOpen} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.queryByText("b")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("日记"));
    expect(await screen.findByText("b")).toBeInTheDocument();
  });

  it("点击文件回调 rel", async () => {
    const onOpen = vi.fn();
    render(<FileTree nodes={tree} onOpenFile={onOpen} />);
    await userEvent.click(screen.getByText("a"));
    expect(onOpen).toHaveBeenCalledWith("a.md");
  });
});
```

注意：文件名展示去掉 `.md` 后缀（与标签页一致），断言用 `getByText("a")`。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

`src/components/FileTree.tsx`：

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import type { TreeNode } from "../api";

const displayName = (name: string) => name.replace(/\.md$/i, "");

export function FileTree({ nodes, depth = 0, onOpenFile }: {
  nodes: TreeNode[];
  depth?: number;
  onOpenFile: (rel: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (nodes.length === 0) {
    return depth === 0 ? <div className="tree-empty">空文件夹</div> : null;
  }
  const toggle = (rel: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(rel)) n.delete(rel); else n.add(rel);
      return n;
    });

  return (
    <ul className="file-tree" role="tree">
      {nodes.map((n) => (
        <li key={n.rel} role="treeitem" aria-expanded={n.kind === "dir" ? expanded.has(n.rel) : undefined}>
          {n.kind === "dir" ? (
            <button className="tree-row" style={{ paddingLeft: depth * 16 + 8 }} onClick={() => toggle(n.rel)}>
              {expanded.has(n.rel)
                ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {expanded.has(n.rel)
                ? <FolderOpen size={16} /> : <Folder size={16} />}
              <span>{n.name}</span>
            </button>
          ) : (
            <button className="tree-row" style={{ paddingLeft: depth * 16 + 24 }} onClick={() => onOpenFile(n.rel)}>
              <FileText size={16} />
              <span>{displayName(n.name)}</span>
            </button>
          )}
          {n.kind === "dir" && expanded.has(n.rel) && (
            <FileTree nodes={n.children} depth={depth + 1} onOpenFile={onOpenFile} />
          )}
        </li>
      ))}
    </ul>
  );
}
```

`src/hooks/useOpenFile.ts`：

```ts
import { useCallback } from "react";
import { api } from "../api";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

export function useOpenFile() {
  return useCallback(async (rel: string) => {
    const { tabs, setActive, open } = useTabsStore.getState();
    if (tabs.some((x) => x.rel === rel)) {
      setActive(rel);
      return;
    }
    const vault = useWorkspaceStore.getState().vault;
    if (!vault) return;
    const res = await api.readFile(vault, rel);
    const name = rel.split("/").pop() ?? rel;
    open({ rel, name, content: res.content, mtimeMillis: res.mtimeMillis });
  }, []);
}
```

`src/components/Sidebar.tsx`：

```tsx
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FileTree } from "./FileTree";
import { useOpenFile } from "../hooks/useOpenFile";
import { useWorkspaceStore } from "../stores/workspace";

export function Sidebar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const tree = useWorkspaceStore((s) => s.tree);
  const openVault = useWorkspaceStore((s) => s.openVault);
  const onOpenFile = useOpenFile();
  const vaultName = vault?.split("/").pop() ?? "";

  const repick = async () => {
    const path = await pickFolder({ directory: true });
    if (path) await openVault(path);
  };

  return (
    <>
      <button className="vault-name" title="重新选择文件夹" onClick={repick}>
        {vaultName}
      </button>
      <FileTree nodes={tree} onOpenFile={onOpenFile} />
    </>
  );
}
```

`src/styles.css` 追加：

```css
.vault-name {
  padding: 10px 12px; text-align: left; font-weight: 600;
  border-bottom: 1px solid var(--border);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tree-empty { padding: 16px 12px; color: var(--fg-muted); font-size: 13px; }
.file-tree { list-style: none; margin: 0; padding: 4px 0; }
.tree-row {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 4px 8px; border-radius: 4px; text-align: left; font-size: 13px;
}
.tree-row:hover { background: var(--bg-inset); }
.tree-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

`src/App.tsx` 改为（空状态补图标与按钮，接通 store 与 restore）：

```tsx
import { useEffect } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { Sidebar } from "./components/Sidebar";
import { useWorkspaceStore } from "./stores/workspace";

export default function App() {
  const vault = useWorkspaceStore((s) => s.vault);
  const error = useWorkspaceStore((s) => s.error);
  const openVault = useWorkspaceStore((s) => s.openVault);

  useEffect(() => {
    void useWorkspaceStore.getState().restoreLastVault();
  }, []);

  const pick = async () => {
    const path = await pickFolder({ directory: true });
    if (path) await openVault(path);
  };

  const emptyState = (
    <div className="empty-state">
      <FolderOpen size={48} strokeWidth={1.5} />
      <p>打开一个文件夹，开始笔记</p>
      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" onClick={pick}>选择文件夹…</button>
    </div>
  );

  return (
    <AppShell
      hasSidebar={!!vault}
      sidebar={vault ? <Sidebar /> : null}
      main={vault ? <div>editor-placeholder</div> : emptyState}
      statusBar={<span />}
    />
  );
}
```

同时更新 `src/App.test.tsx`：mock `@tauri-apps/plugin-dialog`（`vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }))`），并在已有用例后追加一个用例——预置 store 后显示侧栏 vault 名：

```tsx
import { useWorkspaceStore } from "./stores/workspace";

it("有 vault 时显示侧栏", () => {
  useWorkspaceStore.setState({ vault: "/canon/my-vault", tree: [] });
  render(<App />);
  expect(screen.getByText("my-vault")).toBeInTheDocument();
});
```

（`restoreLastVault` 在该用例中会调用 `getLastVault`，mock 返回 null 故无副作用。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test`
Expected: PASS（累计 12 个用例）。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: file tree, sidebar and empty state wired to stores"
```

---

### Task 8: EditorPane（CM6 + ⌘S）、TabBar、StatusBar 装配

**Files:**
- Create: `src/components/EditorPane.tsx`、`src/components/TabBar.tsx`、`src/components/StatusBar.tsx`
- Modify: `src/App.tsx`（主区装配 TabBar/EditorPane；底部 StatusBar）、`src/styles.css`（编辑器/标签样式）、`src-tauri/tauri.conf.json`（无需改，⌘S 由 CM6 keymap 拦截）

**Interfaces:**
- Consumes: `useTabsStore`（tab/activeRel/updateActive/saveActive/isDirty）、`useWorkspaceStore`（vault）。
- Produces: `<EditorPane />`（读 activeRel，⌘S 存盘）、`<TabBar />`、`<StatusBar />`。CM6 keymap `Mod-s` 返回 true 阻断默认行为。

- [ ] **Step 1: 安装 CodeMirror**

```bash
pnpm add codemirror @codemirror/lang-markdown @codemirror/view @codemirror/state
```

- [ ] **Step 2: 实现（CM6 在 jsdom 无法可靠挂载，本任务以人工验证为主，不做组件测试）**

`src/components/EditorPane.tsx`：

```tsx
import { useEffect, useRef } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useTabsStore } from "../stores/tabs";

export function EditorPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedRel = useRef<string | null>(null);
  const activeRel = useTabsStore((s) => s.activeRel);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          markdown(),
          Prec.high(keymap.of([{
            key: "Mod-s",
            run: () => { void useTabsStore.getState().saveActive(); return true; },
          }])),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) useTabsStore.getState().updateActive(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    loadedRel.current = null;
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (loadedRel.current === activeRel) return;
    loadedRel.current = activeRel;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: tab?.content ?? "" },
    });
  }, [activeRel, tab?.content]);

  if (!tab) return <div className="editor-empty">从左侧选择一个文件</div>;
  return <div ref={containerRef} className="editor-pane" />;
}
```

`src/components/TabBar.tsx`（M1 先不做关闭确认弹窗，M2 补；`role="tab"` 用 div 避免按钮嵌套）：

```tsx
import { X } from "lucide-react";
import { useTabsStore } from "../stores/tabs";

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeRel = useTabsStore((s) => s.activeRel);
  const setActive = useTabsStore((s) => s.setActive);
  const close = useTabsStore((s) => s.close);
  const isDirty = useTabsStore((s) => s.isDirty);

  if (tabs.length === 0) return null;
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((t) => (
        <div
          key={t.rel}
          role="tab"
          tabIndex={0}
          aria-selected={t.rel === activeRel}
          className={`tab ${t.rel === activeRel ? "active" : ""}`}
          onClick={() => setActive(t.rel)}
          onAuxClick={(e) => { if (e.button === 1) close(t.rel); }}
        >
          <span className="tab-title">{t.name}</span>
          {isDirty(t.rel) && <span className="dirty-dot" aria-label="未保存" />}
          <button
            className="tab-close" aria-label={`关闭 ${t.name}`}
            onClick={(e) => { e.stopPropagation(); close(t.rel); }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
```

`src/components/StatusBar.tsx`：

```tsx
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const activeRel = useTabsStore((s) => s.activeRel);
  const isDirty = useTabsStore((s) => s.isDirty(s.activeRel));

  return (
    <>
      <span className="status-path">
        {vault && activeRel ? `${vault}/${activeRel}` : (vault ?? "")}
      </span>
      {activeRel && <span>{isDirty ? "未保存" : "已保存"}</span>}
    </>
  );
}
```

`src/App.tsx` 主区与状态栏替换：

```tsx
import { EditorPane } from "./components/EditorPane";
import { TabBar } from "./components/TabBar";
import { StatusBar } from "./components/StatusBar";
// main={vault ? <div>editor-placeholder</div> : emptyState} 改为：
main={vault ? (
  <>
    <TabBar />
    <EditorPane />
  </>
) : emptyState}
// statusBar={<span />} 改为：
statusBar={<StatusBar />}
```

`src/styles.css` 追加：

```css
.tab-bar {
  display: flex; gap: 2px; padding: 4px 8px 0;
  border-bottom: 1px solid var(--border); overflow-x: auto;
}
.tab {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 6px 6px 0 0; font-size: 13px;
  cursor: pointer; max-width: 200px;
}
.tab.active { background: var(--bg-inset); font-weight: 500; }
.tab-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dirty-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
.tab-close { display: flex; color: var(--fg-muted); flex: none; }
.editor-pane { flex: 1; min-height: 0; overflow: auto; }
.editor-pane .cm-editor { height: 100%; font-size: 14px; }
.editor-pane .cm-editor.cm-focused { outline: none; }
.editor-empty {
  flex: 1; display: grid; place-items: center; color: var(--fg-muted);
}
```

- [ ] **Step 3: 回归测试与冒烟**

Run: `pnpm test`
Expected: PASS（12 个用例；App.test 里 `editor-placeholder` 断言如不存在则不必改，测试只断言空状态与侧栏）。

Run: `pnpm tauri dev` 人工冒烟：
1. 空状态点"选择文件夹…"选一个含 md 的目录 → 侧栏出现树；
2. 点文件 → 标签出现，内容进编辑器；
3. 改字符 → 标签出圆点、状态栏"未保存"；
4. ⌘S → 圆点消失、"已保存"；
5. 重启应用 → 自动恢复上次 vault。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: codemirror editor pane, tab bar, status bar wired"
```

---

### Task 9: M1 人工验收与收尾

**Files:**
- Modify: 无新代码；仅修复验收发现的问题

**Interfaces:** 无（验收关卡）。

- [ ] **Step 1: 全量自动化测试**

Run: `pnpm test && cd src-tauri && cargo test`
Expected: 前端 12 用例 + Rust 6 用例全 PASS。

- [ ] **Step 2: 对照页面需求文档走查**

真实 vault（含中文文件名、子目录、非 md 文件、`_assets/`）逐项验证：

- [ ] 窗口 1280×800、最小 960×600、标题 mdairy
- [ ] 首次启动空状态 → 选择文件夹 → 文件树显示（隐藏文件/`_assets`/非 md 被过滤，目录在前按字母序）
- [ ] 打开/切换/关闭标签，脏标记正确
- [ ] ⌘S 落盘（用终端 `cat` 验证内容真实写入）
- [ ] 编辑器外部修改文件后不崩溃（M1 允许不弹窗，M2 处理）
- [ ] 重启恢复 vault
- [ ] 中文文件名正常显示与打开
- [ ] 无 console 报错（devtools）

- [ ] **Step 3: 修复走查发现的问题并提交**

```bash
git add -A && git commit -m "fix: m1 acceptance fixes"
```

- [ ] **Step 4: 合并/标记**

```bash
git tag m1-done
```

---

## Self-Review 记录

1. **Spec 覆盖（M1 范围）**：开发文档 §7 M1 = "Tauri+React 跑通；打开文件夹→文件树→读文件进编辑器→⌘S 保存" → Task 1（跑通）、Task 3/5（打开文件夹+记忆）、Task 4/7（文件树/读）、Task 6/8（编辑器+⌘S）。页面需求 W6 空状态 → Task 2/7；W1-S 文件树过滤与排序规则 → Task 4 测试与实现；W1-T 标签脏标记 → Task 6/8（关闭确认与中键关闭：中键已做，确认弹窗按计划在 M2 与冲突处理一起落地，已在上文注明）。§1.4 窗口尺寸 → Task 1。✅ 无缺口。
2. **占位符扫描**：Task 3 Step 1 的 `unimplemented!()` 是 TDD 的"先红"实现步骤，非计划占位；其余步骤均含完整代码/命令/预期。✅
3. **类型一致性**：`FileContent.mtimeMillis`（serde camelCase）在 api.ts/Tab/tabsStore 测试一致；`TreeNode` 判别联合 `kind: "dir"|"file"` 与 Rust `#[serde(tag = "kind")]` 枚举一致；`open({rel,name,content,mtimeMillis})` 签名在 Task 5/6/7 调用点一致；`isDirty` 签名一致。⚠️ 已修正一处：Rust `TreeNode` 从结构体+`Option` 改为带 tag 枚举，使 JSON 天然匹配 TS 判别联合。✅
