# mdairy M2（编辑闭环）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐编辑闭环的安全网——外部修改检测与冲突处理、非 UTF-8 编码识别与保真回写、脏标签关闭确认、保存竞态修复。

**Architecture:** Rust 侧 `files.rs` 升级为 v2（encoding_rs/chardetng 编码检测、保存允许新建文件、mtime 冲突校验），新增 `watcher.rs`（notify-debouncer-full 递归监听 → `vault-changed` 事件）。前端 tabsStore 升级为冲突状态机（干净自动重载 / 脏弹冲突对话框 / 删除分支），`ConflictDialog` 与 `CloseConfirmDialog` 两个模态，App 统一接线事件 → 树刷新 + 标签外部变更处理。

**Tech Stack:** encoding_rs + chardetng · notify-debouncer-full（Rust）· Tauri event（`vault-changed`）· 既有 React/Zustand/Vitest 栈

**Spec:** [docs/开发文档.md](../../开发文档.md) §4 F5/F6/§7 M2 · [docs/页面需求文档.md](../../页面需求文档.md) W4/§4

## Global Constraints

- 继承 M1 全部约束：UI 中文、单组件 ≤400 行、Lucide 图标、无 emoji、serde camelCase、路径安全校验、离线无 CDN、conventional commits、不修改 docs/（本计划自身除外）。
- watcher 事件必须过滤：隐藏文件（`.` 开头）、`_assets`、`node_modules`。
- Rust 面向用户的错误文案为中文；保存冲突错误以固定前缀 `外部修改冲突` 开头（前端据此分支）。
- 文件编码：读入检测（BOM → UTF-8 校验 → chardetng 猜测），**保存默认按原编码回写**（不可表示字符由 encoding_rs 替换），无编码信息时 UTF-8。
- 前一里程碑的裁定（M1 台账）：`saveActive` 必须改为**快照语义**（`savedContent` = 发出保存请求时的内容快照，而非保存完成后的最新内容）——本计划 Task 3 落实。
- 新增依赖仅限：`encoding_rs`、`chardetng`（Rust），`notify-debouncer-full`（Rust，自带 notify）。

## 本计划不做（路线图）

M3 渲染（markdown-it 管线、三态视图、滚动同步）；M4 检索导航；M5：⌘W 关闭标签（需 Tauri 窗口 CloseRequested 拦截，避免 WebView 默认行为关窗）、config.json 原子写、build_tree 遍历侧 symlink 过滤、index.html 标题品牌化、bundle 代码分割、图片粘贴、文件 CRUD、打包。

---

### Task 1: Rust 文件接口 v2（编码检测/回写 + 允许新建 + mtime 冲突校验）

**Files:**
- Modify: `src-tauri/src/files.rs`（decode/encode/resolve_for_save/save_file v2）
- Modify: `src-tauri/Cargo.toml`（`cargo add encoding_rs chardetng`，在 src-tauri/ 内执行）
- Modify: `src/api.ts`（FileContent.encoding、saveFile opts）
- Test: `src-tauri/src/files.rs` tests 模块内新增

**Interfaces:**
- Consumes: M1 的 `resolve_secure`/`file_mtime`/`TreeNode`（不动）。
- Produces: `FileContent { content: String, mtime_millis: u64, encoding: String }`（serde camelCase → `{content, mtimeMillis, encoding}`）；纯函数 `decode(bytes: &[u8]) -> (String, &'static Encoding)`、`encode(content: &str, encoding: &str) -> Vec<u8>`、`resolve_for_save(vault: &str, rel: &str) -> Result<PathBuf, String>`（允许目标不存在但父目录在 vault 内）；命令 `save_file(vault, rel, content, encoding: Option<String>, expected_mtime_millis: Option<u64>)`——`expected_mtime_millis` 给出且磁盘 mtime 不等时返回 `Err("外部修改冲突: ...")`；`read_file` 返回值多 `encoding` 字段，签名不变。
- 前端：`api.saveFile(vault, rel, content, opts?: { encoding?: string; expectedMtimeMillis?: number })`，`null` 传给 Rust 转 None。

- [ ] **Step 1: 安装依赖**

Run: `cd src-tauri && cargo add encoding_rs chardetng`

- [ ] **Step 2: 写失败测试**

`src-tauri/src/files.rs` 的 `mod tests` 内追加（`use encoding_rs::GBK;` 加入测试模块头部）：

```rust
#[test]
fn read_detects_gbk_and_save_roundtrips_in_gbk() {
    let vault = temp_vault();
    let v = vault.to_str().unwrap();
    let (gbk_bytes, _, _) = GBK.encode("中文日记");
    fs::write(vault.join("gbk.md"), gk_bytes_for(&gbk_bytes)).unwrap();
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
```

注意：上面 `gk_bytes_for` 是笔误防护——直接写 `fs::write(vault.join("gbk.md"), gbk_bytes)` 即可（GBK bytes 是 Vec<u8>，`fs::write` 直接收）。

- [ ] **Step 3: 运行确认失败**

Run: `cd src-tauri && cargo test files`
Expected: FAIL——`encoding` 字段不存在、save_file 参数不匹配等编译错误（编译失败即红）。

- [ ] **Step 4: 实现**

`src-tauri/src/files.rs` 顶部 use 增加：

```rust
use chardetng::EncodingDetector;
use encoding_rs::{Encoding, UTF_8};
```

`FileContent` 增加字段 `pub encoding: String`。新增三个纯函数并改写 `save_file`（`read_content` 改为返回 encoding；M1 审计修复已有的 `read_content` 助手保留）：

```rust
fn decode(bytes: &[u8]) -> (String, &'static Encoding) {
    if let Some((enc, decoded)) = Encoding::for_bom(bytes) {
        return (decoded.into_owned(), enc);
    }
    if std::str::from_utf8(bytes).is_ok() {
        return (String::from_utf8_lossy(bytes).into_owned(), UTF_8);
    }
    let mut det = EncodingDetector::new();
    det.feed(bytes, true);
    let enc = det.guess(None, None, true);
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
```

`read_content` 内改为：

```rust
let (content, enc) = decode(&bytes);
Ok(FileContent {
    content,
    mtime_millis: file_mtime(p),
    encoding: enc.name().to_string(),
})
```

`save_file` 整体替换：

```rust
#[tauri::command]
pub fn save_file(
    vault: String,
    rel: String,
    content: String,
    encoding: Option<String>,
    expected_mtime_millis: Option<u64>,
) -> Result<FileContent, String> {
    let p = resolve_for_save(&vault, &rel)?;
    if p.exists() {
        if let Some(expected) = expected_mtime_millis {
            if file_mtime(&p) != expected {
                return Err("外部修改冲突: 磁盘上的文件与保存时不同".into());
            }
        }
    }
    fs::write(&p, encode(&content, encoding.as_deref().unwrap_or("UTF-8")))
        .map_err(|e| e.to_string())?;
    read_content(&p)
}
```

`src/api.ts` 的 `FileContent` 增加 `encoding: string;`；`saveFile` 替换为：

```ts
saveFile: (vault: string, rel: string, content: string, opts?: { encoding?: string; expectedMtimeMillis?: number }) =>
  invoke<FileContent>("save_file", {
    vault, rel, content,
    encoding: opts?.encoding ?? null,
    expectedMtimeMillis: opts?.expectedMtimeMillis ?? null,
  }),
```

- [ ] **Step 5: 运行确认通过**

Run: `cd src-tauri && cargo test`（预期 10 用例：原 6 + 新 4）与 `pnpm test`（12/12，tabs.test 的 saveFile mock 返回值需补 `encoding` 字段——mock 返回 `{ content: c, mtimeMillis: 42, encoding: "UTF-8" }`）。
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/files.rs src-tauri/Cargo.toml src-tauri/Cargo.lock src/api.ts src/stores/tabs.test.ts
git commit -m "feat: encoding detection, save-allow-create and mtime conflict guard"
```

---

### Task 2: Rust watcher.rs（vault 监听 → vault-changed 事件）

**Files:**
- Create: `src-tauri/src/watcher.rs`
- Modify: `src-tauri/Cargo.toml`（`cargo add notify-debouncer-full`，src-tauri/ 内）、`src-tauri/src/lib.rs`（mod/manage/command 注册）

**Interfaces:**
- Produces: `#[tauri::command] watch_vault(app, state: State<WatcherState>, vault: String) -> Result<(), String>`——启动/替换递归监听；事件 `app.emit("vault-changed", { paths: Vec<String> })`（rel 路径，`/` 分隔，已过滤隐藏/`_assets`/`node_modules`）；可测纯函数 `filter_paths(root: &Path, paths: &[PathBuf]) -> Vec<String>`；`pub struct WatcherState(pub Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>)`。

- [ ] **Step 1: 安装依赖**

Run: `cd src-tauri && cargo add notify-debouncer-full`
（以装到的版本为准核对 `new_debouncer` 签名：`new_debouncer(timeout, tick_rate: Option<Duration>, handler)`，0.4+ 如此。）

- [ ] **Step 2: 写失败测试（纯函数部分）**

`src-tauri/src/watcher.rs` 首版——纯函数 + 测试，集成留给 Task 5 人工验收：

```rust
use notify_debouncer_full::{Debouncer, RecommendedCache};
use notify::RecommendedWatcher;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct WatcherState(pub Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>);

pub fn filter_paths(root: &Path, paths: &[PathBuf]) -> Vec<String> {
    unimplemented!()
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
```

Run: `cd src-tauri && cargo test watcher`
Expected: FAIL（unimplemented）。

- [ ] **Step 3: 实现**

```rust
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use serde::Serialize;
use std::fs;
use std::time::Duration;
use tauri::{Emitter, State};

fn skipped(name: &str) -> bool {
    name.starts_with('.') || name == "_assets" || name == "node_modules"
}

pub fn filter_paths(root: &Path, paths: &[PathBuf]) -> Vec<String> {
    let mut rels: Vec<String> = Vec::new();
    for p in paths {
        let Ok(rel) = p.strip_prefix(root) else { continue };
        let rel = rel.to_string_lossy().replace('\\', "/");
        let name = rel.rsplit('/').next().unwrap_or("");
        if skipped(name) || rel.is_empty() {
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
    debouncer
        .watcher()
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *guard = Some(debouncer);
    Ok(())
}
```

`lib.rs`：

```rust
mod watcher;
// Builder 链上追加：
.manage(watcher::WatcherState(std::sync::Mutex::new(None)))
// generate_handler! 追加：
watcher::watch_vault
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src-tauri && cargo test`
Expected: 全绿（files 10 + watcher 1 = 11）。`cargo check` 无警告级错误。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/watcher.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(rust): recursive vault watcher emitting vault-changed events"
```

---

### Task 3: tabsStore v2（冲突状态机 + 快照保存 + 关闭确认状态）

**Files:**
- Modify: `src/stores/tabs.ts`
- Modify: `src/stores/tabs.test.ts`（既有用例适配 + 新用例）
- Modify: `src/hooks/useOpenFile.ts`（open 传入 encoding）
- Modify: `src/stores/workspace.ts`（新增 `refreshTree` action；workspace.test.ts 补 1 用例）

**Interfaces:**
- Consumes: Task 1 的 `api.saveFile(vault, rel, content, opts?)`/`api.readFile`；`api.watchVault`（Task 2，本任务仅在类型上准备）。
- Produces（后续任务依赖，签名精确）：
  - `Tab` 增加 `encoding: string; overrideExternal: boolean`
  - `open(t: { rel; name; content; mtimeMillis; encoding })`
  - `saveActive(force?: boolean): Promise<void>`——快照语义：成功后 `savedContent = snapshot`；冲突错误（`String(e).startsWith("外部修改冲突")`）→ `conflict: { rel, reason: "modified" }` 且**不抛出**；其他错误向上抛
  - `conflict: { rel: string; reason: "modified" | "deleted" } | null`；`reloadConflict(): Promise<void>`（重新加载失败=文件已删→关该标签）；`keepConflict(): void`（置该 tab `overrideExternal = true`）；`dismissConflict(): void`
  - `pendingCloseRel: string | null`；`requestClose(rel)`（clean→直接 close；dirty→pendingCloseRel）；`confirmClose(): Promise<void>`（saveActive 然后关；保存失败不清 pendingCloseRel 之外的标签状态）；`discardClose(): void`（直接关）；`cancelClose(): void`
  - `handleExternalChanges(paths: string[]): Promise<void>`——对打开且受影响的 tab：readFile 失败 → 干净自动关/脏置 conflict(deleted)；`res.mtimeMillis === tab.mtimeMillis` → 忽略；干净 → 静默重载；脏 → conflict(modified)。已是 conflict 的 rel 跳过
  - `workspace.refreshTree(): Promise<void>`（listTree → set tree；失败静默保持旧树）

- [ ] **Step 1: 写失败测试**

`src/stores/tabs.test.ts`：既有 mock 的 saveFile 改为

```ts
vi.mock("../api", () => ({
  api: {
    saveFile: vi.fn(async (_v: string, _r: string, c: string) => ({ content: c, mtimeMillis: 42, encoding: "UTF-8" })),
    readFile: vi.fn(),
  },
}));
```

新增 describe 块（沿用 beforeEach，另加 `useTabsStore.setState({ conflict: null, pendingCloseRel: null })`）：

```ts
it("saveActive 快照语义：保存期间的新输入不被误标已保存", async () => {
  const { api } = await import("../api");
  let resolveSave: (v: unknown) => void = () => {};
  vi.mocked(api.saveFile).mockImplementationOnce(
    () => new Promise((r) => { resolveSave = r; }),
  );
  useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# v1", mtimeMillis: 1, encoding: "UTF-8" });
  const saving = useTabsStore.getState().saveActive();
  useTabsStore.getState().updateActive("# v1 加了字");
  resolveSave({ content: "# v1", mtimeMillis: 42, encoding: "UTF-8" });
  await saving;
  expect(useTabsStore.getState().isDirty("a.md")).toBe(true); // 新输入仍是脏的
});

it("saveActive 冲突错误置 conflict 且不抛出", async () => {
  const { api } = await import("../api");
  vi.mocked(api.saveFile).mockRejectedValueOnce("外部修改冲突: 磁盘上的文件与保存时不同");
  useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# v1", mtimeMillis: 1, encoding: "UTF-8" });
  useTabsStore.getState().updateActive("# 改");
  await expect(useTabsStore.getState().saveActive()).resolves.toBeUndefined();
  expect(useTabsStore.getState().conflict).toEqual({ rel: "a.md", reason: "modified" });
});

it("keepConflict 后下一次保存跳过 mtime 校验并清除 overrideExternal", async () => {
  const { api } = await import("../api");
  useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# v1", mtimeMillis: 1, encoding: "UTF-8" });
  useTabsStore.getState().updateActive("# 改");
  useTabsStore.getState().keepConflict();
  await useTabsStore.getState().saveActive();
  expect(vi.mocked(api.saveFile)).toHaveBeenLastCalledWith(
    "/canon/v", "a.md", "# 改", { encoding: "UTF-8", expectedMtimeMillis: null },
  );
  expect(useTabsStore.getState().tabs[0].overrideExternal).toBe(false);
});

it("外部修改：干净 tab 静默重载", async () => {
  const { api } = await import("../api");
  vi.mocked(api.readFile).mockResolvedValueOnce({ content: "磁盘新内容", mtimeMillis: 99, encoding: "UTF-8" });
  useTabsStore.getState().open({ rel: "a.md", name: "a", content: "旧", mtimeMillis: 1, encoding: "UTF-8" });
  await useTabsStore.getState().handleExternalChanges(["a.md"]);
  const t = useTabsStore.getState().tabs[0];
  expect(t.content).toBe("磁盘新内容");
  expect(t.mtimeMillis).toBe(99);
  expect(useTabsStore.getState().conflict).toBeNull();
});

it("外部修改：脏 tab 置 conflict(modified)", async () => {
  const { api } = await import("../api");
  vi.mocked(api.readFile).mockResolvedValueOnce({ content: "磁盘新内容", mtimeMillis: 99, encoding: "GBK" });
  useTabsStore.getState().open({ rel: "a.md", name: "a", content: "我的", mtimeMillis: 1, encoding: "GBK" });
  useTabsStore.getState().updateActive("我的改动");
  await useTabsStore.getState().handleExternalChanges(["a.md"]);
  expect(useTabsStore.getState().conflict).toEqual({ rel: "a.md", reason: "modified" });
});

it("外部删除：干净 tab 自动关闭，脏 tab 置 conflict(deleted)", async () => {
  const { api } = await import("../api");
  vi.mocked(api.readFile).mockRejectedValue("不存在");
  useTabsStore.getState().open({ rel: "clean.md", name: "c", content: "x", mtimeMillis: 1, encoding: "UTF-8" });
  useTabsStore.getState().open({ rel: "dirty.md", name: "d", content: "y", mtimeMillis: 1, encoding: "UTF-8" });
  useTabsStore.getState().updateActive("脏了");
  await useTabsStore.getState().handleExternalChanges(["clean.md", "dirty.md"]);
  const s = useTabsStore.getState();
  expect(s.tabs.map((t) => t.rel)).toEqual(["dirty.md"]);
  expect(s.conflict).toEqual({ rel: "dirty.md", reason: "deleted" });
});

it("reloadConflict 失败（文件已删）时关闭该标签", async () => {
  const { api } = await import("../api");
  vi.mocked(api.readFile).mockRejectedValue("没了");
  useTabsStore.getState().open({ rel: "a.md", name: "a", content: "x", mtimeMillis: 1, encoding: "UTF-8" });
  useTabsStore.getState().setState?.call(null as never, undefined as never); // 占位防误用
  useTabsStore.setState({ conflict: { rel: "a.md", reason: "modified" } });
  await useTabsStore.getState().reloadConflict();
  expect(useTabsStore.getState().tabs).toHaveLength(0);
  expect(useTabsStore.getState().conflict).toBeNull();
});

it("requestClose/confirmClose/discardClose/cancelClose", async () => {
  const { api } = await import("../api");
  useTabsStore.getState().open({ rel: "clean.md", name: "c", content: "x", mtimeMillis: 1, encoding: "UTF-8" });
  useTabsStore.getState().requestClose("clean.md");
  expect(useTabsStore.getState().tabs).toHaveLength(0); // 干净直接关

  useTabsStore.getState().open({ rel: "dirty.md", name: "d", content: "y", mtimeMillis: 1, encoding: "UTF-8" });
  useTabsStore.getState().updateActive("脏");
  useTabsStore.getState().requestClose("dirty.md");
  expect(useTabsStore.getState().pendingCloseRel).toBe("dirty.md");
  useTabsStore.getState().cancelClose();
  expect(useTabsStore.getState().pendingCloseRel).toBeNull();
  expect(useTabsStore.getState().tabs).toHaveLength(1);

  useTabsStore.getState().requestClose("dirty.md");
  await useTabsStore.getState().confirmClose();
  expect(useTabsStore.getState().tabs).toHaveLength(0);
  expect(vi.mocked(api.saveFile)).toHaveBeenCalled();
});
```

注意上面 `setState?.call(null as never, ...)` 一行是排版事故，删除——`reloadConflict` 用例直接：

```ts
useTabsStore.setState({ conflict: { rel: "a.md", reason: "modified" } });
```

`src/stores/workspace.test.ts` 追加：

```ts
it("refreshTree 刷新文件树，失败保持旧树", async () => {
  const { api } = await import("../api");
  await useWorkspaceStore.getState().openVault("v");
  vi.mocked(api.listTree).mockRejectedValueOnce("io error");
  await useWorkspaceStore.getState().refreshTree();
  expect(useWorkspaceStore.getState().tree).toHaveLength(1); // 保持 openVault 时的树
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（新接口不存在/编译错）。

- [ ] **Step 3: 实现**

`src/stores/tabs.ts` 关键形态（在 M1 基础上改，完整签名如下）：

```ts
export interface Tab {
  rel: string;
  name: string;
  content: string;
  savedContent: string;
  mtimeMillis: number;
  encoding: string;
  overrideExternal: boolean;
}

export interface ExternalConflict {
  rel: string;
  reason: "modified" | "deleted";
}

interface OpenArgs {
  rel: string; name: string; content: string; mtimeMillis: number; encoding: string;
}
```

state 增加 `conflict: ExternalConflict | null; pendingCloseRel: string | null;`；`open` 里 `overrideExternal: false`；`saveActive(force = false)` 按本任务 Interfaces 的快照语义实现（`expectedMtimeMillis: force || tab.overrideExternal ? null : tab.mtimeMillis`，成功后 `overrideExternal: false`）；新增各 action 按 Interfaces 实现；`handleExternalChanges` 对已处于 conflict 的 rel 先 `dismiss` 逻辑：跳过（不改已弹窗状态）。

`src/hooks/useOpenFile.ts` 的 open 调用补 `encoding: res.encoding`。

`src/stores/workspace.ts` 追加 action：

```ts
refreshTree: async () => {
  const vault = get().vault;
  if (!vault) return;
  try {
    set({ tree: await api.listTree(vault) });
  } catch {
    /* 保持旧树 */
  }
},
```

（`create` 的 setter 已有，需把 `(set)` 改为 `(set, get)`。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test`
Expected: 全绿（12 旧 + 约 8 新 + workspace 1 ≈ 21；以实际用例数为准，全部通过即可）。

- [ ] **Step 5: Commit**

```bash
git add src/stores src/hooks
git commit -m "feat: tab conflict state machine, snapshot save and close confirmation"
```

---

### Task 4: ConflictDialog + CloseConfirmDialog + StatusBar 编码显示

**Files:**
- Create: `src/components/ConflictDialog.tsx`、`src/components/CloseConfirmDialog.tsx`
- Modify: `src/components/StatusBar.tsx`（编码显示）、`src/components/TabBar.tsx`（close → requestClose）、`src/styles.css`（模态样式）
- Test: `src/components/ConflictDialog.test.tsx`

**Interfaces:**
- Consumes: Task 3 全部 action。
- Produces: `<ConflictDialog />`——无 conflict 时返回 null；`reason: "modified"` 标题「文件已在编辑器外被修改」，按钮 从磁盘重新加载（`reloadConflict`）/ 保留我的版本（`keepConflict`）/ 取消（`dismissConflict`）；`reason: "deleted"` 标题「文件已在外部被删除」，按钮 在编辑器中保留（保存时重建 → `keepConflict`）/ 关闭标签（`dismissConflict` 后 `close(conflict.rel)`）/ 取消。`<CloseConfirmDialog />`——pendingCloseRel 为空返回 null，按钮 保存并关闭（`confirmClose`）/ 放弃更改（`discardClose`）/ 取消（`cancelClose`）。StatusBar 在 activeRel 存在时显示 active tab 的 `encoding`。

- [ ] **Step 1: 写失败测试**

`src/components/ConflictDialog.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "./ConflictDialog";
import { useTabsStore } from "../stores/tabs";

vi.mock("../stores/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stores/tabs")>();
  return actual; // 用真实 store，setState 驱动
});

describe("ConflictDialog", () => {
  beforeEach(() => useTabsStore.setState({ conflict: null, tabs: [], activeRel: null, pendingCloseRel: null }));

  it("无 conflict 时渲染 null", () => {
    const { container } = render(<ConflictDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it("modified：三个动作各自调用 store action", async () => {
    const spy = vi.spyOn(useTabsStore.getState(), "reloadConflict").mockResolvedValue(undefined);
    useTabsStore.setState({ conflict: { rel: "a.md", reason: "modified" } });
    render(<ConflictDialog />);
    expect(screen.getByText("文件已在编辑器外被修改")).toBeInTheDocument();
    await userEvent.click(screen.getByText("从磁盘重新加载"));
    expect(spy).toHaveBeenCalled();
  });

  it("deleted：显示删除文案并有关闭标签路径", async () => {
    useTabsStore.setState({
      conflict: { rel: "a.md", reason: "deleted" },
      tabs: [{ rel: "a.md", name: "a", content: "x", savedContent: "x", mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false }],
      activeRel: "a.md",
    });
    render(<ConflictDialog />);
    expect(screen.getByText("文件已在外部被删除")).toBeInTheDocument();
    await userEvent.click(screen.getByText("关闭标签"));
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useTabsStore.getState().conflict).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

`src/components/ConflictDialog.tsx`（模态遮罩 + 面板；esc 无动作——W4 要求三选一不可绕过）：

```tsx
import { useTabsStore } from "../stores/tabs";

export function ConflictDialog() {
  const conflict = useTabsStore((s) => s.conflict);
  const reloadConflict = useTabsStore((s) => s.reloadConflict);
  const keepConflict = useTabsStore((s) => s.keepConflict);
  const dismissConflict = useTabsStore((s) => s.dismissConflict);
  const close = useTabsStore((s) => s.close);
  if (!conflict) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={conflict.reason === "modified" ? "文件已被外部修改" : "文件已被外部删除"}>
      <div className="modal-panel">
        <h2>{conflict.reason === "modified" ? "文件已在编辑器外被修改" : "文件已在外部被删除"}</h2>
        <p className="modal-desc">
          {conflict.reason === "modified"
            ? "磁盘上的版本与编辑器中的版本不一致，请选择如何处理。"
            : "该文件在磁盘上已不存在，编辑器中仍有未保存的修改。"}
        </p>
        <div className="modal-actions">
          {conflict.reason === "modified" ? (
            <>
              <button className="btn-primary" onClick={() => void reloadConflict()}>从磁盘重新加载</button>
              <button className="btn" onClick={keepConflict}>保留我的版本</button>
              <button className="btn" onClick={dismissConflict}>取消</button>
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={keepConflict}>在编辑器中保留（保存时重建）</button>
              <button className="btn" onClick={() => { close(conflict.rel); dismissConflict(); }}>关闭标签</button>
              <button className="btn" onClick={dismissConflict}>取消</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

`src/components/CloseConfirmDialog.tsx`：

```tsx
import { useTabsStore } from "../stores/tabs";

export function CloseConfirmDialog() {
  const pendingCloseRel = useTabsStore((s) => s.pendingCloseRel);
  const confirmClose = useTabsStore((s) => s.confirmClose);
  const discardClose = useTabsStore((s) => s.discardClose);
  const cancelClose = useTabsStore((s) => s.cancelClose);
  if (!pendingCloseRel) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="未保存更改">
      <div className="modal-panel">
        <h2>有未保存的更改</h2>
        <p className="modal-desc">「{useTabsStore.getState().tabs.find((t) => t.rel === pendingCloseRel)?.name ?? pendingCloseRel}」尚未保存，关闭前如何处理？</p>
        <div className="modal-actions">
          <button className="btn-primary" onClick={() => void confirmClose()}>保存并关闭</button>
          <button className="btn" onClick={discardClose}>放弃更改</button>
          <button className="btn" onClick={cancelClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
```

`src/styles.css` 追加：

```css
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.4);
  display: grid; place-items: center; z-index: 50;
}
.modal-panel {
  background: var(--bg); color: var(--fg); border: 1px solid var(--border);
  border-radius: 8px; padding: 20px 24px; width: 420px; max-width: calc(100vw - 48px);
  box-shadow: 0 8px 30px rgba(0,0,0,.2);
}
.modal-panel h2 { margin: 0 0 8px; font-size: 16px; }
.modal-desc { margin: 0 0 16px; color: var(--fg-muted); font-size: 13px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn { border: 1px solid var(--border); border-radius: 6px; padding: 6px 14px; }
```

`src/components/StatusBar.tsx`：`const encoding = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel)?.encoding ?? "");`，渲染区追加 `{activeRel && encoding && <span>{encoding}</span>}`。

`src/components/TabBar.tsx`：`const requestClose = useTabsStore((s) => s.requestClose);`，关闭按钮与中键改调 `requestClose(t.rel)`（删除对 `close` 的直接引用）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test`
Expected: 全绿（Task 3 基础上 +3）。

- [ ] **Step 5: Commit**

```bash
git add src/components src/styles.css
git commit -m "feat: conflict and close-confirm dialogs, encoding in status bar"
```

---

### Task 5: 事件接线（树刷新 + 外部变更分发）与 M2 人工验收

**Files:**
- Modify: `src/api.ts`（`watchVault: (vault: string) => invoke<void>("watch_vault", { vault })`；`import { listen } from "@tauri-apps/api/event"` 不放 api.ts，listen 在 App 中直接用）
- Modify: `src/App.tsx`（watch effect + 事件监听 + 防抖分发 + 两个对话框挂载）
- Create: `src/hooks/useVaultEvents.ts`
- Modify: `src/styles.css`（如需微调）

**Interfaces:**
- Consumes: Task 2 事件 `vault-changed`（payload `{ paths: string[] }`）、`api.watchVault`、Task 3 `handleExternalChanges`/workspace `refreshTree`、Task 4 两个对话框。
- Produces: `useVaultEvents(vault: string | null): void`——vault 变化时调用 `api.watchVault(vault)`；订阅 `vault-changed`，对 payload.paths 做 200ms 防抖后依次执行 `useWorkspaceStore.getState().refreshTree()` 与 `useTabsStore.getState().handleExternalChanges(paths)`；卸载/切换 vault 时退订。

- [ ] **Step 1: 实现**

`src/hooks/useVaultEvents.ts`：

```ts
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

interface VaultChangedPayload {
  paths: string[];
}

export function useVaultEvents(vault: string | null) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string[]>([]);

  useEffect(() => {
    if (!vault) return;
    void api.watchVault(vault).catch(() => {});
    const unlisten = listen<VaultChangedPayload>("vault-changed", (e) => {
      pending.current = pending.current.concat(e.payload.paths);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const paths = Array.from(new Set(pending.current));
        pending.current = [];
        void useWorkspaceStore.getState().refreshTree();
        void useTabsStore.getState().handleExternalChanges(paths);
      }, 200);
    });
    return () => {
      void unlisten.then((f) => f());
      if (timer.current) clearTimeout(timer.current);
    };
  }, [vault]);
}
```

`src/api.ts` 追加：`watchVault: (vault: string) => invoke<void>("watch_vault", { vault }),`

`src/App.tsx`：`useVaultEvents(vault);`（hooks 顶部区）；`main-area` 之后挂载 `<ConflictDialog />` 与 `<CloseConfirmDialog />`（放 AppShell 外层或 main 内均可，fixed 定位）。

- [ ] **Step 2: 回归与构建**

Run: `pnpm test && pnpm build && cd src-tauri && cargo test`
Expected: 全绿。前端新用例数以 Task 3/4 累计为准。

- [ ] **Step 3: 人工验收走查（用户执行，controller 在报告中记录）**

`pnpm tauri dev`，准备：一个含 **GBK 编码 .md**（可 `iconv -t GBK 生成`）与普通 UTF-8 md 的文件夹。

- [ ] GBK 文件打开显示正常（无乱码），状态栏显示 `GBK`，修改后 ⌘S 保存，终端 `iconv -f GBK -t UTF-8` 确认仍是 GBK 且内容正确
- [ ] UTF-8 文件状态栏显示 `UTF-8`，M1 功能回归正常
- [ ] 干净标签下外部修改文件（终端 `echo x >> file`）→ 无弹窗，内容自动刷新为新内容
- [ ] 脏标签下外部修改 → 弹「文件已在编辑器外被修改」：三个按钮行为分别正确（重新加载后标签变干净；保留我的版本后 ⌘S 不再弹冲突、成功覆盖；取消保持脏）
- [ ] 「保留我的版本」后 ⌘S 走 force 路径（`expectedMtimeMillis: null`），保存成功且标签变干净
- [ ] 保存前外部修改（脏标签 + 外部 echo 后直接 ⌘S）→ 弹冲突对话框而非静默覆盖
- [ ] 外部删除文件：干净标签自动关闭；脏标签弹「文件已在外部被删除」，「在编辑器中保留」后 ⌘S 重建文件成功
- [ ] 脏标签点 × → 关闭确认三选一各自正确；干净标签点 × 直接关
- [ ] vault 外部新建/删除 md → 侧栏文件树 1 秒内自动刷新
- [ ] 控制台无报错

- [ ] **Step 4: 收尾提交与标记**

```bash
git add src
git commit -m "feat: vault event wiring with debounced tree refresh"
git tag m2-done && git push origin m2-done
```

（tag 在人工验收通过后由 controller 执行。）

---

## Self-Review 记录

1. **Spec 覆盖（M2 范围）**：开发文档 §7 M2 = 外部修改检测（T2/T3/T5）+ 编码识别（T1/StatusBar）+ 标签页/脏标记收尾（关闭确认 T3/T4）；页面需求 W4 冲突对话框（T4，含 deleted 分支与 W4 的"保存时重建"）；W1-T 关闭确认（T4）；W1-B 状态栏（编码显示）。M1 台账裁定的 saveActive 快照语义 → T3（Global Constraints 明示）。✅ 无缺口。⌘W 移交 M5（已声明）。
2. **占位符扫描**：Task 2 Step 2 的 `unimplemented!()` 是 TDD 先红；Task 1 测试里的 `gk_bytes_for` 笔误已就地注明正确写法；Task 3 测试里一处排版事故已就地注明删除。其余步骤均含完整代码/命令/预期。✅
3. **类型一致性**：`FileContent.encoding`（Rust `enc.name()` 如 "UTF-8"/"GBK"）↔ TS `encoding: string` ↔ saveFile opts.encoding 传回；`ExternalConflict{rel,reason}` 前后一致；`handleExternalChanges(paths: string[])` ↔ 事件 payload `{paths: string[]}`（camelCase serde）↔ `useVaultEvents` 调用；`requestClose/confirmClose/discardClose/cancelClose` 在 T3 定义与 T4 组件调用一致；`watch_vault` ↔ `api.watchVault` 参数 `{ vault }`。✅
