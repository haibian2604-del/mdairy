# mdairy M5（检索导航）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐检索导航三件套——vault 全文搜索（Rust 侧，点击命中定位）、文档大纲（从 activeTab 内容提取，点击跳转）、命令面板（⌘⇧P 命令+文件混排，⌘P 纯文件模式）；顺带清理旧渲染管线的孤儿依赖。

**Architecture:** Rust 新增 `search.rs`（逐文件读入按 encoding 解码、大小写不敏感子串匹配、返回命中行与列）——搜索在 Rust 侧做避免把全 vault 内容拉进前端。前端 `searchStore`（查询/结果/防抖）、`OutlinePanel`（解析 activeTab markdown 标题，ProseMirror 文档不可靠改从源文本提取——纯函数 `extractHeadings`）、`CommandPalette`（命令注册表 + 文件树扁平化，模糊匹配用连续子串）。大纲跳转经 `open+scrollToHeading`（Milkdown Crepe `setScrollTo` 无 API——用 `editor.action(replaceAll)` 不可取，改用 DOM 查询 ProseMirror 渲染的标题节点 + `scrollIntoView`）。

**Tech Stack:** 既有栈，零新增依赖；删除依赖：markdown-it、@vscode/markdown-it-katex、@hedgedoc/markdown-it-task-lists、dompurify、highlight.js、mermaid（孤儿清理）

**Spec:** [docs/开发文档.md](../../开发文档.md) §4 F7/F8/F11、§7 M5 · [docs/页面需求文档.md](../../页面需求文档.md) W2/W3/W1-O

## Global Constraints

- 继承全部项目约束：UI 中文、单组件 ≤400 行、Lucide 图标、无 emoji、serde camelCase、路径安全、离线无 CDN、conventional commits。
- 搜索范围：vault 内全部 md（Rust read_dir 复用 files.rs 的 `skipped` 过滤：隐藏/`_assets`/node_modules）；大小写不敏感；结果上限 200 条（防巨型 vault 卡死）。
- 命令面板是命令唯一注册点（页面需求 §3 W2 实施约定）：新增命令只往注册表加条目。
- 快捷键：⌘⇧P 命令面板、⌘P 纯文件模式（同一组件不同初始 tab）、⌘⇧F 搜索页签聚焦输入框、⌘⇧O 大纲折叠。
- ⌘S 处理器保留 `defaultPrevented` 守卫；不新增与其他监听冲突的键位。
- 大纲提取的标题语义：`# `～`###### ` 行首标记（跳过代码块内的 `#`——fenced code 状态机）。
- 孤儿依赖删除后 grep 零残留；若删除引发 hidden 依赖崩（真机冒烟发现），回退该依赖删除并记录。

## 本计划不做（路线图）

M6：暗色主题切换按钮、图片粘贴（F12）、文件 CRUD（F2 完整版）、应用图标与打包、mermaid 图形预览评估、重载竞态击键丢失策略、`mdairy-settings` 残留 key 清理、`.editor-pane` 等死样式盘点（ponytail-audit 复跑定夺）。

---

### Task 1: Rust search.rs（全文搜索命令）+ 孤儿依赖清理

**Files:**
- Create: `src-tauri/src/search.rs`
- Modify: `src-tauri/src/lib.rs`（mod + generate_handler 注册 `search_vault`）、`src/api.ts`（SearchHit/SearchResults + api.searchVault）
- Modify: `package.json`/`pnpm-lock.yaml`（`pnpm remove markdown-it @vscode/markdown-it-katex @hedgedoc/markdown-it-task-lists dompurify highlight.js mermaid`）；`pnpm-workspace.yaml` 若 task-lists 的 patchedDependencies 成空则删除该条目
- Modify: `src/styles.css`（删 hljs @import 与暗色 .hljs 覆盖规则——含 katex @import 保留判定：milkdown 公式需要，保留）
- Test: `src-tauri/src/search.rs` tests 模块

**Interfaces:**
- Consumes: `files.rs` 的过滤语义（`skipped` 函数——从 files.rs `pub(crate)` 导出复用，或复制小函数并在注释注明来源）。
- Produces: `#[tauri::command] search_vault(vault: String, query: String) -> Result<Vec<SearchHit>, String>`；`SearchHit { rel: String, line: u32, column: u32, line_text: String }`（serde camelCase）；语义：大小写不敏感子串、每文件最多 20 条命中、全局 200 条上限即停、`line/column` 0 基、`line_text` 为原行（前端负责高亮标记）。空 query 返回空数组。
- 前端：`api.searchVault(vault, query): Promise<SearchHit[]>`。

- [ ] **Step 1: 写失败测试**

`src-tauri/src/search.rs` 首版（测试先行）：

```rust
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
```

Run: `cd src-tauri && cargo test search`
Expected: FAIL（search_vault 不存在——编译错误即红）。

- [ ] **Step 2: 实现**

`src-tauri/src/search.rs`：

```rust
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
    for e in entries.flatten() {
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
```

files.rs 增加公开包装：`pub fn decode_public(bytes: &[u8]) -> (String, encoding_rs::EncodingRef)`——直接调既有私有 `decode` 返回其结果（如 decode 返回 `&'static Encoding`，包装签名与之对齐，避免克隆编码名）。

`lib.rs`：`mod search;` + `generate_handler!` 追加 `search::search_vault`。

`src/api.ts`：

```ts
export interface SearchHit {
  rel: string;
  line: number;
  column: number;
  lineText: string;
}
// api 对象内追加：
searchVault: (vault: string, query: string) => invoke<SearchHit[]>("search_vault", { vault, query }),
```

- [ ] **Step 3: 孤儿依赖清理**

```bash
pnpm remove markdown-it @vscode/markdown-it-katex @hedgedoc/markdown-it-task-lists dompurify highlight.js mermaid
```

`pnpm remove @hedgedoc/markdown-it-task-lists` 后若 `pnpm-workspace.yaml` 的 patchedDependencies 悬空则删该条目（报错才处理）。styles.css 删 `@import "highlight.js/styles/github.css"` 与暗色 `.hljs` 覆盖块；`@import "katex/dist/katex.min.css"` **保留**（milkdown 公式用）。`katex` 依赖保留（同上）。
Run: `grep -rn "markdown-it\|dompurify\|highlight.js\|mermaid" src/ package.json` → src 零命中、package.json 无这六个依赖。

- [ ] **Step 4: 验证**

Run: `cd src-tauri && cargo test`（预期 11 + 3 = 14）、`pnpm test`（33/33，不受影响）、`pnpm build`、grep 残留。
**真机冒烟（红线）**：起 dev → 打开大一点的 vault → 应用正常（依赖删除未引发 hidden 崩溃，白屏则回退该依赖并记录）→ 停进程。截图入报告。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(rust): vault full-text search command; drop orphan render deps"
```

---

### Task 2: searchStore + SearchPanel（侧栏搜索页签）

**Files:**
- Create: `src/stores/search.ts`、`src/stores/search.test.ts`、`src/components/SearchPanel.tsx`
- Modify: `src/components/Sidebar.tsx`（文件/搜索双页签）、`src/hooks/useOpenFile.ts`（可选命中定位支持）、`src/styles.css`、`src/components/TabBar.tsx`（不动，确认页签切换不影响）

**Interfaces:**
- Consumes: Task 1 `api.searchVault`、`useWorkspaceStore`。
- Produces: `useSearchStore`：`{ query: string; hits: SearchHit[]; searching: boolean; setQuery(q): void; }`——setQuery 内部 250ms 防抖调 `api.searchVault`（query 空/空白直接清空结果不发请求；响应乱序以最后一次 query 为准——seq 计数守卫）；`SearchPanel`：输入框（autofocus 由 ⌘⇧F 触发，本任务先手动点页签）、命中数「N 处」、按文件分组（rel → 命中行列表，行内命中词 `<mark>` 高亮——`lineText` 切片渲染非 innerHTML）、点击命中 → `useOpenFile(rel)` 后按 line/column 定位（定位机制见下）。
- 定位机制（跨任务接口，Task 3 消费）：tabsStore 新增 `pendingJump: { rel: string; line: number } | null` 与 `requestJump(rel, line)`——open/setActive 后设置；MilkdownPane 消费 pendingJump：ProseMirror 容器内查 `[data-path]` 不可靠，改用**行号→第 N 个块级节点**近似定位（`.ProseMirror > *` 的第 min(line, children-1) 个子节点 `scrollIntoView`），消费后置 null。M1 先例：近似定位允许误差。

- [ ] **Step 1: 写失败测试**

`src/stores/search.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    searchVault: vi.fn(),
  },
}));

import { useSearchStore } from "./search";
import { api } from "../api";

describe("searchStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSearchStore.setState({ query: "", hits: [], searching: false });
    vi.mocked(api.searchVault).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("setQuery 防抖后搜索并写入 hits", async () => {
    vi.mocked(api.searchVault).mockResolvedValue([
      { rel: "a.md", line: 1, column: 0, lineText: "苹果" },
    ]);
    useSearchStore.getState().setQuery("苹果");
    expect(api.searchVault).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchVault).toHaveBeenCalledWith("/canon/v", "苹果");
    expect(useSearchStore.getState().hits).toHaveLength(1);
  });

  it("乱序响应以最后一次 query 为准", async () => {
    let r1: (v: any) => void = () => {};
    vi.mocked(api.searchVault).mockImplementationOnce(() => new Promise((r) => (r1 = r)));
    useSearchStore.setState({ vaultlessHint: undefined } as never);
    useWorkspaceSeed();
    useSearchStore.getState().setQuery("第一");
    await vi.advanceTimersByTimeAsync(300);
    useSearchStore.getState().setQuery("第二");
    await vi.advanceTimersByTimeAsync(300);
    r1([{ rel: "old.md", line: 0, column: 0, lineText: "过期响应" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(useSearchStore.getState().hits).toEqual([]); // 过期响应被丢弃
  });

  it("空 query 清空结果且不发请求", async () => {
    useSearchStore.setState({ hits: [{ rel: "a.md", line: 0, column: 0, lineText: "x" }] });
    useSearchStore.getState().setQuery("  ");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchVault).not.toHaveBeenCalled();
    expect(useSearchStore.getState().hits).toEqual([]);
  });
});

function useWorkspaceSeed() {
  // searchStore 读 vault via useWorkspaceStore.getState()
  const { useWorkspaceStore } = require("../stores/workspace");
  useWorkspaceStore.setState({ vault: "/canon/v", tree: [] });
}
```

注：`useWorkspaceSeed` 的 require 写法在 ESM 下不可用——直接在文件顶部 `import { useWorkspaceStore } from "./workspace"` 并在其 beforeEach 里 setState（workspace 模块依赖 api，已有全局 mock 需补 listTree/readFile/saveFile/setVault/getLastVault——照 tabs.test.ts 现有 mock 形态复制）。测试代码以可执行为准，语义保持。

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 确认通过**

`src/stores/search.ts` 要点：seq 自增 + 响应校验 `if (seq !== mySeq) return`；`set.push` 到 `setTimeout` 的句柄在再次 setQuery 时 clearTimeout。

SearchPanel/Sidebar 双页签按页面需求 W1-S/W3（中文文案「文件」/「搜索」、`<mark>` 用 accent 10% 背景切片渲染、命中数「N 处」、空态「没有找到与 "xx" 匹配的内容」）。tabsStore 加 `pendingJump`（+1 个测试：requestJump 设置、消费置 null 由 MilkdownPane 测试覆盖）。

Run: `pnpm test`（预期 +4 左右）、`pnpm build`；真机冒烟：搜索中文词 → 结果分组展示 → 点击命中打开文件。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: vault search panel with debounced store and jump-to-hit"
```

---

### Task 3: OutlinePanel（大纲）+ MilkdownPane 定位消费

**Files:**
- Create: `src/lib/headings.ts`、`src/lib/headings.test.ts`、`src/components/OutlinePanel.tsx`
- Modify: `src/components/MilkdownPane.tsx`（消费 pendingJump）、`src/App.tsx`（右栏大纲 + ⌘⇧O 折叠 + ⌘⇧F/⌘⇧P/⌘P 快捷键接线——命令面板未建前 ⌘⇧P/⌘P 占位不发）、`src/components/AppShell.tsx`（三列布局：右栏可折叠 220px）、`src/styles.css`

**Interfaces:**
- Consumes: Task 2 `pendingJump`、`useTabsStore`（activeTab content）。
- Produces: `extractHeadings(content: string): { level: number; text: string; line: number }[]`——行首 `#{1,6} ` 提取，fenced code（```/~~~ 状态机）内跳过，line 0 基；`<OutlinePanel />`——activeTab 的标题层级树（缩进按 level），点击 → `requestJump(rel, line)`；当前态高亮可后置。AppShell props 扩展 `right?: ReactNode`（220px 右栏，无则不渲染）。

- [ ] **Step 1: 写失败测试**

`src/lib/headings.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { extractHeadings } from "./headings";

describe("extractHeadings", () => {
  it("提取标题层级与行号，跳过代码块内的 #", () => {
    const content = "# 一级\n正文\n```\n# 不是标题\n```\n## 二级\n### 三级";
    expect(extractHeadings(content)).toEqual([
      { level: 1, text: "一级", line: 0 },
      { level: 2, text: "二级", line: 5 },
      { level: 3, text: "三级", line: 6 },
    ]);
  });

  it("波浪线围栏同样跳过，无标题返回空", () => {
    expect(extractHeadings("~~~\n# nope\n~~~")).toEqual([]);
    expect(extractHeadings("没有标题").toEqual([]));
  });
});
```

（第二处 `expect(...).toEqual` 括号笔误——正确为 `expect(extractHeadings("没有标题")).toEqual([])`，实现时以此为准。）

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 确认通过**

`src/lib/headings.ts`：单遍扫描，fence 开/闭状态机（``` 与 ~~~，开栏字符必须与闭栏一致），标题行 `/^(#{1,6})\s+(.+)$/`。
`OutlinePanel`：`useMemo(() => extractHeadings(tab?.content ?? ""), [tab?.content])`；空标题「暂无标题」占位；点击 `requestJump(activeRel, line)`。
`MilkdownPane` 消费 pendingJump：effect 监听 `pendingJump?.rel === activeRel` → 容器 `.ProseMirror` 子元素第 min(line, len-1) 个 `scrollIntoView({block:"start"})` → `consumeJump()`（置 null）。近似定位（搜索命中行/大纲行 → 块级节点序），允许误差——页面需求"允许 ±1 块"精神延续。
AppShell 右栏 + ⌘⇧O 折叠（App 内 state 即可，不持久化——M6 统一 settings 时再定）。

Run: `pnpm test`（+3 左右）、`pnpm build`；真机冒烟：大纲展示、点击跳转滚动。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: document outline panel with heading jump in wysiwyg"
```

---

### Task 4: CommandPalette（命令面板）

**Files:**
- Create: `src/components/CommandPalette.tsx`、`src/components/CommandPalette.test.tsx`、`src/lib/commands.ts`
- Modify: `src/App.tsx`（⌘⇧P/⌘P 接线 + 挂载）、`src/stores/workspace.ts`（flatFiles selector：树扁平为 `{rel,name}[]`——放组件 useMemo 亦可，倾向 selector）、`src/styles.css`

**Interfaces:**
- Produces: `Command = { id: string; label: string; hint?: string; run: () => void }`；`useCommands(): Command[]`（lib/commands.ts 注册表——打开文件夹、搜索聚焦、大纲折叠、（占位注释：M6 主题/新建等））；`<CommandPalette mode: "all" | "files" />`——输入模糊匹配（连续子串，大小写不敏感）、命令组+文件组（修改时间暂不可得，按树序）、↑↓ 循环选择、↵ 执行、esc 关闭、遮罩点击关闭、`aria-role="dialog"`；文件项 ↵ 用 `useOpenFile(rel)`。⌘⇧P 开 all 模式、⌘P 开 files 模式（App state `paletteMode`）。

- [ ] **Step 1: 写失败测试**

`src/components/CommandPalette.test.tsx`：

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runSpy = vi.fn();

vi.mock("../lib/commands", () => ({
  useCommands: () => [
    { id: "toggle-outline", label: "切换大纲", run: runSpy },
  ],
}));
vi.mock("../hooks/useOpenFile", () => ({ useOpenFile: () => vi.fn() }));
vi.mock("../stores/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stores/workspace")>();
  return {
    ...actual,
    useWorkspaceStore: Object.assign(actual.useWorkspaceStore, {
      getState: () => ({ ...actual.useWorkspaceStore.getState(), tree: [
        { kind: "file", name: "日记.md", rel: "日记.md", children: [] },
      ], }),
    }),
  };
});

import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  beforeEach(() => runSpy.mockClear());

  it("all 模式展示命令与文件，输入过滤", () => {
    render(<CommandPalette mode="all" onClose={() => {}} />);
    expect(screen.getByPlaceholderText("输入命令或文件名…")).toBeInTheDocument();
    expect(screen.getByText("切换大纲")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("输入命令或文件名…"), { target: { value: "大纲" } });
    expect(screen.queryByText("日记")).not.toBeInTheDocument();
    expect(screen.getByText("切换大纲")).toBeInTheDocument();
  });

  it("回车执行选中命令并关闭", () => {
    const onClose = vi.fn();
    render(<CommandPalette mode="all" onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText("输入命令或文件名…"), { key: "Enter" });
    expect(runSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("esc 关闭", () => {
    const onClose = vi.fn();
    render(<CommandPalette mode="files" onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText("输入命令或文件名…"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
```

（workspace mock 形态如与 zustand v5 实际不符，以"mock 后 palette 能拿到扁平文件列表"为准适配，语义保持。）

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 确认通过**

按 Interfaces 实现；⌘P 事件与 ⌘⇧P 区分（`e.shiftKey`）；两个快捷键均在 App window keydown 统一处理器（含 defaultPrevented 守卫惯例）。
Run: `pnpm test`（+3）、`pnpm build`；真机冒烟：⌘⇧P 打开、输中文过滤、回车执行、esc 关闭。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: command palette with commands and fuzzy file mode"
```

---

### Task 5: M5 人工验收（用户执行）

**Files:** 无新代码；仅修复验收发现的问题。

- [ ] 全量自动化：`pnpm test && pnpm build && cd src-tauri && cargo test`
- [ ] 人工走查（controller 记录报告）：

- [ ] 侧栏出现 文件/搜索 双页签；搜索中文词 → 按「文件 → 命中行」分组、命中词高亮、显示「N 处」
- [ ] 点击命中行 → 打开文件并滚动到命中附近（±1 块内）
- [ ] 空结果/空 vault 占位文案正确
- [ ] 右栏大纲列出当前文档标题层级；点击标题滚动跳转；代码块内的 `#` 不入大纲
- [ ] ⌘⇧O 折叠/展开大纲
- [ ] ⌘⇧P 面板：中文过滤命令与文件、↑↓ 选择、↵ 执行（切换大纲可执行）、esc/遮罩关闭
- [ ] ⌘P 纯文件模式：回车打开文件
- [ ] WYSIWYG 回归：编辑/⌘S/图片/公式/冲突无回归
- [ ] 暗色模式：搜索面板/大纲/命令面板可读性
- [ ] devtools 无 console 报错

- [ ] **收尾（controller，验收通过后）**：合并 main、推送、`git tag m5-done`、台账关闭、清理

---

## Self-Review 记录

1. **Spec 覆盖**：F7 全文搜索（T1 Rust + T2 面板 + 点击定位）、F8 大纲（T3）、F11 命令面板（T4）；⌘⇧F/⌘⇧O/⌘⇧P/⌘P 快捷键（页面需求 §5）分布在 T2/T3/T4；孤儿依赖清理（用户记忆与预检裁定）→ T1。✅
2. **占位符扫描**：两处测试代码笔误（require 写法、括号）已就地注明正确写法；Milkdown 定位 API 假设（`[data-path]` 不可靠改子节点序近似）已声明依据；其余完整。✅
3. **类型一致性**：SearchHit（Rust camelCase ↔ TS）字段核对一致；`requestJump/pendingJump/consumeJump` T2 定义 ↔ T3 消费；`extractHeadings` 返回结构 ↔ OutlinePanel；Command 类型 ↔ useCommands ↔ 测试 mock。⚠️ 自查修正：T2 测试里 searchVault mock 需含 workspace 依赖的完整 api mock（已注明照 tabs.test 形态复制）。✅
