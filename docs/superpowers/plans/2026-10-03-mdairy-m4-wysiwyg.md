# mdairy M4（所见即所得编辑）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Milkdown（ProseMirror 系开源 WYSIWYG markdown 编辑器）替换 CodeMirror 编辑层——单个编辑面直接呈现渲染结果（Typora 式），标记符号隐藏；M2 的保存快照/外部修改冲突机制无回归。

**Architecture:** 新建 `MilkdownPane` 成为唯一编辑视图：store content → 编辑器（切换/外部重载时 `replaceAll`，loadedRel 守卫防回写循环），编辑器变更 → `updateActive`，⌘S 走窗口级监听 → `saveActive`。图片 src 做**加载前 vault 根→asset URL、保存前还原相对路径**的往返变换（纯函数，可测）。移除整个旧渲染层（PreviewPane、markdown.ts 管线、滚动同步、三态视图/⌘E、CM6 依赖）。

**Tech Stack:** @milkdown/crepe（编辑器，batteries-included）+ @milkdown/plugin-math（KaTeX 公式，含失败后置路径）· 其余栈不变

**Spec:** [docs/开发文档.md](../../开发文档.md) §7 M4（2026-10-03 用户决策变更）· [docs/页面需求文档.md](../../页面需求文档.md) 相应交互以本计划为准（三态/分栏章节作废）

## Global Constraints

- 继承全部项目约束：UI 中文、单组件 ≤400 行、Lucide 图标、无 emoji、serde camelCase、路径安全、离线无 CDN（KaTeX 字体 npm 打包）、conventional commits、不修改 docs/（本计划自身除外）。
- **保存语义红线**：`saveActive` 快照语义、`expectedMtimeMillis` 冲突校验、`overrideExternal`、`handleExternalChanges`/`reloadConflict` 全部保留——编辑层只换"内容如何被编辑"，不换"内容如何被保存"。
- **CJS 互操作教训**（commit 7abce32）：Milkdown 相关依赖合入后必须真机冒烟（`pnpm tauri dev` 截屏确认渲染），每个任务收尾都要做，不能只靠 vitest。
- 设计约束（design-taste-frontend 普适条）：双主题实测（编辑器亮暗两模式对比度/可读性达标）、颜色走 token 或主题变量、形状锁、零 em-dash、无 emoji。
- 新增依赖仅限：`@milkdown/crepe`、`@milkdown/kit`（crepe 传递依赖，允许显式声明）、`@milkdown/plugin-math`、`katex`（已有）。
- 版本漂移预期：Milkdown v7 系列 API 以实包为准（先例：chardetng 1.0、notify-debouncer-full 0.7、@vscode/katex 互操作——适配保持测试语义即可，裁定记录）。

## 本计划不做（路线图）

Mermaid 块的实时图形预览（WYSIWYG 内以可编辑代码块呈现，M6 评估）；图片粘贴进 `_assets/`（M6）；检索导航（原 M5：全文搜索/大纲/命令面板，顺延为 M5）；收尾项（原 M6：主题切换按钮、文件 CRUD、打包等）；M3 遗留 Minor（strip-raw-html 收紧等随旧管线删除自然消亡）。

---

### Task 1: MilkdownPane 最小可用（加载/编辑/保存/切换）

**Files:**
- Create: `src/components/MilkdownPane.tsx`、`src/components/MilkdownPane.test.tsx`
- Modify: `package.json`（`pnpm add @milkdown/crepe @milkdown/kit`）、`src/styles.css`（编辑器主题样式）、`src/App.tsx`（临时并挂：split 分支中 EditorPane 换成 MilkdownPane——本任务先并存，Task 3 再删旧件）

**Interfaces:**
- Consumes: `useTabsStore`（activeRel/tabs/updateActive/saveActive）、`useWorkspaceStore`（vault）。
- Produces: `<MilkdownPane />`——无 active tab 渲染「从左侧选择一个文件」；挂载/activeRel 变化时以 store 的 `tab.content` 初始化编辑器（loadedRel 守卫，同一 rel 只初始化一次）；编辑器内容变更 → `updateActive(markdown)`；模块级防回写守卫：由 store 变化触发的 set 不得再次触发 updateActive 成死循环。
- 外部修改重载（`reloadConflict`/干净自动重载）更新 `tab.content` 后编辑器必须跟随——通过 `rel+content` 双信号守卫实现：仅当 `loadedRel !== activeRel` 或 `loadedContent !== tab.content`（且差异并非来自编辑器自身回写）时替换全文。

- [ ] **Step 1: 安装依赖**

```bash
pnpm add @milkdown/crepe @milkdown/kit
```

以实包为准核对 Crepe v7 API：`new Crepe({ root, defaultValue })`、`await crepe.create()`、`crepe.on(l => l.markdownUpdated((ctx, markdown, prev) => {}))`、`crepe.getMarkdown()`、`crepe.editor.action(replaceAll(markdown))`（replaceAll 自 `@milkdown/kit/utils` 或 `@milkdown/utils`）。若有出入，适配并保持测试语义，报告中记录。

- [ ] **Step 2: 写失败测试（mock Crepe 类，测接线逻辑）**

`src/components/MilkdownPane.test.tsx`：

```tsx
import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markdownUpdatedCb = { fn: null as null | ((
  ctx: unknown, markdown: string, prev: string,
) => void) };
const mockReplaceAll = vi.fn();
const crepeInstances: any[] = [];

vi.mock("@milkdown/crepe", () => ({
  Crepe: class {
    editor = { action: mockReplaceAll };
    constructor(_opts: any) { crepeInstances.push(this); }
    async create() {
      return this;
    }
    on(cb: (l: any) => void) {
      cb({ markdownUpdated: (fn: any) => { markdownUpdatedCb.fn = fn; } });
      return this;
    }
    async getMarkdown() { return this.current ?? ""; }
    current = "";
  },
}));
vi.mock("@milkdown/kit/utils", () => ({ replaceAll: (md: string) => mockReplaceAll(md) }));

import { MilkdownPane } from "./MilkdownPane";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

function openTab(content: string, rel = "a.md") {
  useWorkspaceStore.setState({ vault: "/canon/v", tree: [] });
  useTabsStore.setState({
    tabs: [{ rel, name: "a", content, savedContent: content, mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false }],
    activeRel: rel,
  });
}

describe("MilkdownPane", () => {
  beforeEach(() => {
    crepeInstances.length = 0;
    mockReplaceAll.mockClear();
    markdownUpdatedCb.fn = null;
    useTabsStore.setState({ tabs: [], activeRel: null, conflict: null, pendingCloseRel: null, cursorLine: 0 });
  });

  it("无 active tab 渲染占位", () => {
    render(<MilkdownPane />);
    expect(screen.getByText("从左侧选择一个文件")).toBeInTheDocument();
  });

  it("挂载时以 store 内容创建编辑器", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    expect(crepeInstances).toHaveLength(1);
    expect(crepeInstances[0].defaultValueOpt).toBe("# 你好");
  });

  it("编辑器变更回写 updateActive", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    await act(async () => { markdownUpdatedCb.fn!({}, "# 你好改", "# 你好"); });
    expect(useTabsStore.getState().tabs[0].content).toBe("# 你好改");
    expect(useTabsStore.getState().isDirty("a.md")).toBe(true);
  });

  it("切换标签时以新内容 replaceAll，且不重创建实例", async () => {
    openTab("# 甲", "a.md");
    render(<MilkdownPane />);
    await act(async () => {});
    act(() => { useTabsStore.getState().open({ rel: "b.md", name: "b", content: "# 乙", mtimeMillis: 1, encoding: "UTF-8" }); useTabsStore.getState().setActive("b.md"); });
    await act(async () => {});
    expect(crepeInstances).toHaveLength(1); // 不重建
    expect(mockReplaceAll).toHaveBeenCalledWith("# 乙");
  });

  it("外部重载（content 变但 rel 不变）同样 replaceAll", async () => {
    openTab("# 旧", "a.md");
    render(<MilkdownPane />);
    await act(async () => {});
    act(() => { useTabsStore.setState({ tabs: [{ rel: "a.md", name: "a", content: "# 磁盘新内容", savedContent: "# 磁盘新内容", mtimeMillis: 99, encoding: "UTF-8", overrideExternal: false }] }); });
    await act(async () => {});
    expect(mockReplaceAll).toHaveBeenLastCalledWith("# 磁盘新内容");
  });

  it("回写引发的 content 变化不再触发 replaceAll（无死循环）", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    mockReplaceAll.mockClear();
    await act(async () => { markdownUpdatedCb.fn!({}, "# 你好改", "# 你好"); });
    await act(async () => {});
    expect(mockReplaceAll).not.toHaveBeenCalled();
  });
});
```

注：`defaultValueOpt` 断言对应实现里把 `defaultValue` 存进实例字段（或直接改断言为 `crepeInstances[0]` 构造参数——以 mock 记录构造参数为准，保持语义即可）。

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（组件不存在）。

- [ ] **Step 4: 实现**

`src/components/MilkdownPane.tsx`：

```tsx
import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { useTabsStore } from "../stores/tabs";

export function MilkdownPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const loadedRef = useRef<{ rel: string | null; content: string | null }>({ rel: null, content: null });
  const activeRel = useTabsStore((s) => s.activeRel);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));

  // 创建一次
  useEffect(() => {
    if (!containerRef.current || crepeRef.current) return;
    const crepe = new Crepe({ root: containerRef.current, defaultValue: "" });
    void crepe.create().then(() => {
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (loadedRef.current.content === markdown) return; // 自身回写守卫
          useTabsStore.getState().updateActive(markdown);
        });
      });
    });
    crepeRef.current = crepe;
    return () => { void crepe.destroy(); crepeRef.current = null; };
  }, []);

  // 切换/外部重载：loadedRel 或（非自身回写的）content 变化 → replaceAll
  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || !tab) return;
    const selfEcho = loadedRef.current.rel === activeRel && loadedRef.current.content === tab.content;
    if (loadedRef.current.rel === activeRel && (selfEcho || loadedRef.current.content === tab.content)) return;
    loadedRef.current = { rel: activeRel, content: tab.content };
    void crepe.create().then(() => {
      crepe.editor.action(replaceAll(tab.content));
    });
  }, [activeRel, tab?.content]);

  if (!tab) return <div className="editor-empty">从左侧选择一个文件</div>;
  return <div ref={containerRef} className="milkdown-pane" />;
}
```

注意：Crepe 构造后需 `create()` 完成才能 `editor.action`——replace effect 等 create 的 promise；`tab?.content` 变化由 updateActive 驱动时，`loadedRef.content` 先在 markdownUpdated 里同步为最新 markdown（把守卫改为在回写处更新 `loadedRef.current.content = markdown`），保证"回写引发的 content 变化"走 selfEcho 分支不再 replaceAll。以测试 6 为准调整守卫实现。

`src/styles.css`：引入 crepe 主题（`@import "@milkdown/crepe/theme/common/style.css"` 与 frame 主题，以实包路径为准）+ `.milkdown-pane { flex: 1; min-height: 0; overflow-y: auto; }` + **双主题覆盖**：Crepe 主题变量在暗色 media 块下的适配（ Crepe 提供 CSS 变量主题色则覆盖变量；否则 Nord 之外手写暗色变量组；验收标准：亮暗两模式正文/代码块对比度 AA）。移除 `.split` 使用但不删类（Task 3 统一清理）。

`src/App.tsx`：split 分支 `<EditorPane />` 暂替换为 `<MilkdownPane />`（本任务仅此一处并存验证，其余不动）。

- [ ] **Step 5: 运行确认通过 + 真机冒烟**

Run: `pnpm test`（预期 43 + 6 = 49）、`pnpm build`。
**真机冒烟（CJS 教训，必做）**：`pnpm tauri dev` 后台起 → 截屏确认编辑器渲染出已打开文件内容（非白屏）→ controller 在报告附截图路径。白屏则按 7abce32 先例排查模块互操作。

- [ ] **Step 6: Commit**

```bash
git add src package.json pnpm-lock.yaml
git commit -m "feat: milkdown wysiwyg pane wired to tab store"
```

---

### Task 2: ⌘S 全局保存 + 图片 src 往返

**Files:**
- Create: `src/lib/assetPaths.ts`、`src/lib/assetPaths.test.ts`
- Modify: `src/App.tsx`（⌘S window 监听 → `saveActive()`；Task 1 的临时 split 分支保持）、`src/components/MilkdownPane.tsx`（加载/回写链路接入 assetPaths）

**Interfaces:**
- Consumes: Task 1 MilkdownPane；`convertFileSrc`。
- Produces: `toEditableMarkdown(md: string, vault: string): string`——markdown 图片/链接语法 `](path)` 中以 vault 根为基准的相对路径（`_assets/…` 等，非 http/asset 开头）替换为 `convertFileSrc(vault + "/" + path)`；`toStoredMarkdown(md: string, vault: string): string`——逆向还原（asset URL → 相对路径）。往返恒等：`toStoredMarkdown(toEditableMarkdown(m, v), v) === m`（对含 `_assets` 图片的文档）。
- MilkdownPane：初始化/replaceAll 用 `toEditableMarkdown(tab.content, vault)`；markdownUpdated 回写 `updateActive(toStoredMarkdown(markdown, vault))`。⌘S：App 内 `mod+s` window keydown → `preventDefault` + `void saveActive()`。

- [ ] **Step 1: 写失败测试**

`src/lib/assetPaths.test.ts`：

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((p: string) => `asset://localhost/${encodeURIComponent(p)}`),
  invoke: vi.fn(),
}));

import { toEditableMarkdown, toStoredMarkdown } from "./assetPaths";

const VAULT = "/canon/v";

describe("assetPaths", () => {
  it("相对图片路径转为 asset URL，外链与已转换的不动", () => {
    const md = "![](_assets/p.png)\\n![外](https://x.com/a.png)\\n[链接](_assets/doc.md)";
    const out = toEditableMarkdown(md, VAULT);
    expect(out).toContain(`asset://localhost/${encodeURIComponent(VAULT + "/_assets/p.png")}`);
    expect(out).toContain("https://x.com/a.png");
    expect(out).not.toContain("](_assets/");
  });

  it("往返恒等：含相对图片的文档转换后还原", () => {
    const md = "# 标题\\n\\n![](_assets/中文 图.png)\\n正文";
    expect(toStoredMarkdown(toEditableMarkdown(md, VAULT), VAULT)).toBe(md);
  });

  it("无图片的文档是恒等函数", () => {
    const md = "# 纯文本\\n- 列表";
    expect(toEditableMarkdown(md, VAULT)).toBe(md);
    expect(toStoredMarkdown(md, VAULT)).toBe(md);
  });
});
```

- [ ] **Step 2: 运行确认失败 → Step 3: 实现 → Step 4: 确认通过**

实现要点（`src/lib/assetPaths.ts`）：正则限定 markdown 内联图片/链接 `(!?\\]\\()([^\\s)]+)(?=\\))` 逐个判断——路径非 `http(s)://`、非 `asset://`、非 `#` 开头即视为 vault 相对路径；转回时只匹配 `asset://localhost/<encoded>` 形态且解码后以 `vault + "/"` 开头的路径。往返用同一套正则与解码（`decodeURIComponent` try/catch）。若 Crepe/ProseMirror 序列化会改变 markdown 形态（如转义符）导致严格恒等测试失败，测试放宽为"图片 src 被还原为相对路径"的语义断言（以实际序列化行为为准，报告中记录）。

⌘S（App.tsx，与 ⌘E 并列——⌘E 本任务还活着，Task 3 才删）：

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void useTabsStore.getState().saveActive();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);
```

EditorPane 的 CM6 Mod-s keymap 在 split 并存期对 MilkdownPane 不生效，无冲突。

Run: `pnpm test`（+3）、`pnpm build`；**真机冒烟**：编辑含 `_assets` 图片的文档 → 图片显示；⌘S → 磁盘文件内容为相对路径（终端 `grep _assets 文件`）。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: asset path round-trip and global cmd-s save for wysiwyg"
```

---

### Task 3: 数学公式 + 旧渲染层清理

**Files:**
- Modify: `package.json`（`pnpm add @milkdown/plugin-math`）、`src/components/MilkdownPane.tsx`（math 插件接入，若 Crepe 可配置则走配置）
- Delete: `src/components/PreviewPane.tsx`、`src/components/PreviewPane.test.tsx`、`src/components/ViewModeSwitch.tsx`、`src/components/EditorPane.tsx`、`src/lib/markdown.ts`、`src/lib/markdown.test.ts`、`src/lib/assetPaths.ts` 的对偶无、`src/hooks/useVaultEvents.ts` **保留**（watch/外部变更仍在用）
- Modify: `src/stores/settings.ts`（删除 viewMode 字段与 persist，主题字段 M6 再建——若文件因此为空则删除文件与测试）、`src/stores/tabs.ts`（删 `cursorLine`/`setCursorLine` 及其测试）、`src/App.tsx`（唯一编辑视图：`<TabBar /><MilkdownPane />`；删 ⌘E/三分支/split；保留 ⌘S）、`src/components/TabBar.tsx`（移除 ViewModeSwitch）、`src/App.test.tsx`/`src/styles.css`（适配与清理 .split/.preview-*/.view-switch 规则）
- Modify: `package.json`（`pnpm remove codemirror @codemirror/view @codemirror/state @codemirror/lang-markdown`）

**Interfaces:**
- Produces: App 主区恒为 `<TabBar /><MilkdownPane />`；tabsStore 无 cursorLine；package.json 无 CM6 依赖；全仓无 PreviewPane/markdown.ts 引用残留（grep 验证）。

- [ ] **Step 1: 数学公式**

```bash
pnpm add @milkdown/plugin-math
```

在 MilkdownPane 的 Crepe 配置或 editor 上接入 math 插件（`@milkdown/plugin-math` 导出 `math` / `mathBlock`，以实包为准；KaTeX 字体已在前 m3 样式中，若被本任务清理则随 Crepe 样式重新引入 `katex/dist/katex.min.css`）。若插件与 milkdown 版本不兼容（peer 冲突或运行时报错），**裁定路径**：后置公式支持到 M6（记录台账），不得阻塞本任务。
验证：`pnpm test` 全绿（存量适配）；真机冒烟含 `$E=mc^2$` 的文档（若公式后置，记录状态即可）。

- [ ] **Step 2: 清理旧渲染层**

- 删除 Files 清单所列文件；App.tsx 改为唯一视图：

```tsx
main={vault ? (
  <>
    <TabBar />
    <MilkdownPane />
  </>
) : emptyState}
```

- 删除 ⌘E effect、settingsStore 的 viewMode 及相关测试（settings.ts 若仅剩空壳则整删，主题按钮 M6 再建 settings）；
- tabsStore 删 cursorLine/setCursorLine（测试同步删）；
- `pnpm remove codemirror @codemirror/view @codemirror/state @codemirror/lang-markdown`；
- styles.css 删 `.split`/`.preview-full`/`.preview-pane`/`.view-switch*` 规则（milkdown-pane 规则保留）；
- `grep -rn "PreviewPane\\|markdown.ts\\|ViewModeSwitch\\|codemirror" src/` 零残留（styles 的 katex 引入除外）。

- [ ] **Step 3: 全量验证**

Run: `pnpm test && pnpm build && cd src-tauri && cargo test`
Expected: 全绿（前端用例数以清理后实际为准，约 40 上下；Rust 11）。真机冒烟：打开/切换/编辑/⌘S/外部修改冲突弹窗/GBK 文件——M2 行为无回归。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: math support and remove legacy render layer"
```

---

### Task 4: M4 人工验收（用户执行）

**Files:** 无新代码；仅修复验收发现的问题。

- [ ] 全量自动化：`pnpm test && pnpm build && cd src-tauri && cargo test`
- [ ] 人工走查清单（controller 记录报告）：

- [ ] 打开 vault → 点文件 → 编辑器直接呈现渲染后的标题/粗体/列表/表格/代码块
- [ ] 输入 `# 空格` 变标题、`**粗体**` 变粗体（WYSIWYG 基本体验）
- [ ] 编辑内容 ⌘S → 磁盘 markdown 正确（终端 cat 验证），标签脏标记/已保存状态正确
- [ ] 含 `_assets` 图片的文档：图片直接显示；编辑保存后磁盘上仍是相对路径
- [ ] 外部修改文件：干净自动重载 / 脏弹冲突框，三选一行为与 M2 一致
- [ ] GBK 文件打开正常、保存仍 GBK（状态栏编码显示）
- [ ] 暗色模式下编辑器可读性达标（系统切深色后截屏确认）
- [ ] 标签切换/关闭确认/新建标签行为无回归
- [ ] devtools 无 console 报错
- [ ] 确认 mermaid 以代码块形式可编辑（图形预览缺失为已知范围）

- [ ] **收尾（controller，验收通过后）**：合并 main、推送、`git tag m4-done`、台账关闭、清理工作区

---

## Self-Review 记录

1. **Spec 覆盖**：用户决策"单编辑面直接渲染 markdown（Typora 式）"→ T1 编辑器 + T2 保存/图片 + T3 清理；"保存快照与冲突机制保留"→ Global Constraints 红线 + T4 回归项。外部修改/编码/GBK → T4 走查。✅
2. **占位符扫描**：Milkdown API 以实包为准的适配说明为执行注记（先例惯例），各步骤含完整代码/命令/预期；测试 mock 形态可能随 Crepe 构造参数形态微调（已注明保持语义）。✅
3. **类型一致性**：`toEditableMarkdown/toStoredMarkdown` 定义与 pane 接入一致；`replaceAll` mock 与实现 import 路径一致（@milkdown/kit/utils）；`markdownUpdated` 回调签名两处一致；⌘S 监听与 saveActive 签名一致。⚠️ 自查修正一处：回写守卫必须"在 markdownUpdated 里同步 loadedRef.content"，否则测试 6（无死循环）不成立——已写进 T1 实现注记。✅
