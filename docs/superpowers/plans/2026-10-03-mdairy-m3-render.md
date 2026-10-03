# mdairy M3（渲染）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通渲染预览——markdown-it 管线（GFM/代码高亮/KaTeX/Mermaid 懒加载/DOMPurify）、三态视图（编辑/分栏/预览，⌘E + 分段控件 + 持久化）、分栏滚动同步（块级锚点）。

**Architecture:** `src/lib/markdown.ts` 为无 React 依赖的渲染管线（markdown-it + 插件族 + DOMPurify，块级 token 注入 `data-source-line`，mermaid 块渲染占位符）；`PreviewPane` 消费管线并处理图片 src 重写（Tauri asset protocol + convertFileSrc）、外链拦截（tauri-plugin-opener）、mermaid 懒渲染；`settingsStore`（zustand persist）持有 viewMode；滚动同步为单向（编辑器光标 → 预览锚点），cursorLine 经 tabsStore 传递。

**Tech Stack:** markdown-it + @hedgedoc/markdown-it-task-lists + @vscode/markdown-it-katex + katex + highlight.js + dompurify + mermaid（懒加载）· tauri-plugin-opener（重新引入）· asset protocol

**Spec:** [docs/开发文档.md](../../开发文档.md) §4 F3/F9/§7 M3 · [docs/页面需求文档.md](../../页面需求文档.md) W1-E/W1-T/§1.3/§6

## Global Constraints

- 继承 M1/M2 全部约束：UI 中文、单组件 ≤400 行、Lucide 图标、无 emoji、serde camelCase、路径安全、离线无 CDN（KaTeX 字体由 npm 打包，禁止 Google Fonts）、conventional commits。
- **渲染安全：所有 HTML 输出一律过 DOMPurify 后再入 DOM；markdown-it 配置 `html: false`。**
- 任务列表复选框只渲染不回写（disabled，页面需求 W1-E 明确本期禁用勾选交互）。
- Mermaid 懒加载（动态 import，不得进主 bundle）；`securityLevel: "strict"`；渲染失败显示原始代码 + 错误提示，不崩溃。
- 图片相对路径以 **vault 根**为基准解析（页面需求 W1-E）；`_assets/` 过滤规则不变。
- 外链（http/https）用系统浏览器打开（tauri-plugin-opener 的 `openUrl`），库内相对链接本期不处理跳转。
- 滚动同步：编辑器光标所在块为锚点，允许 ±1 块误差；单向（编辑器→预览）。
- 三态默认 `split`，切换立即生效并持久化（localStorage，zustand persist）。
- 新增依赖仅限：markdown-it、@hedgedoc/markdown-it-task-lists、@vscode/markdown-it-katex、katex、highlight.js、dompurify、mermaid、@types/markdown-it（前端）；@tauri-apps/plugin-opener + tauri-plugin-opener（重引入，前端有真实调用方了）。

## 本计划不做（路线图）

M4 检索导航（全文搜索、大纲、命令面板——大纲面板将复用本计划的 `data-source-line` 基建）；M5：⌘W、config.json 原子写、symlink 遍历过滤、index.html 品牌化、bundle 分割盘点、图片粘贴（F12，依赖本计划的 asset protocol）、文件 CRUD、主题切换按钮、watcher pending ref 清理、ConflictDialog aria-label 措辞。M2 审计（ponytail-review）的 5 项复杂度削减（约 -25 行）**未获批准，不在本计划内**，获批后另行派单。

---

### Task 1: markdown 渲染管线 lib/markdown.ts

**Files:**
- Create: `src/lib/markdown.ts`、`src/lib/markdown.test.ts`
- Modify: `package.json`（依赖安装）

**Interfaces:**
- Produces: `renderMarkdown(content: string): string`（返回经 DOMPurify 消毒的 HTML 字符串）；导出 `MERMAID_PLACEHOLDER_CLASS = "mermaid-block"`（占位 `<pre class="mermaid-block" data-mermaid="…"></pre>`，code 经 escapeHtml 放入 data-mermaid）；块级 open token 带 `data-source-line="<起始行 0 基>"`。

- [ ] **Step 1: 安装依赖**

```bash
pnpm add markdown-it @hedgedoc/markdown-it-task-lists @vscode/markdown-it-katex katex highlight.js dompurify
pnpm add -D @types/markdown-it
```

`src/styles.css` 追加（highlight.js 主题与 KaTeX 字体走 npm 打包，离线可用）：

```css
@import "katex/dist/katex.min.css";
@import "highlight.js/styles/github.css";
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .hljs { filter: invert(1) hue-rotate(180deg); background: transparent; }
}
```

（hljs 暗色用 filter 反色方案，避免引第二套主题 CSS；不接受的话换 github-dark.css 双主题 media 切换，二选一，实现者以效果定。）

- [ ] **Step 2: 写失败测试**

`src/lib/markdown.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { renderMarkdown, MERMAID_PLACEHOLDER_CLASS } from "./markdown";

describe("renderMarkdown", () => {
  it("渲染 GFM 表格与删除线", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~划线~~");
    expect(html).toContain("<table>");
    expect(html).toContain("<del>划线</del>");
  });

  it("任务列表渲染 checkbox 且禁用不回写", () => {
    const html = renderMarkdown("- [ ] 未完成\n- [x] 已完成");
    expect(html).toContain("<input");
    expect(html).toContain("disabled");
  });

  it("代码块走 highlight.js，未知语言转义输出", () => {
    const html = renderMarkdown("```js\nconst a = 1;\n```");
    expect(html).toContain("hljs");
    const plain = renderMarkdown("```\n<b>not html</b>\n```");
    expect(plain).not.toContain("<b>not html</b>");
  });

  it("KaTeX 行内公式", () => {
    const html = renderMarkdown("$E=mc^2$");
    expect(html).toContain("katex");
  });

  it("mermaid 块渲染为占位符并携带转义后的源码", () => {
    const html = renderMarkdown("```mermaid\ngraph TD; A-->B;\n```");
    expect(html).toContain(MERMAID_PLACEHOLDER_CLASS);
    expect(html).toContain(`data-mermaid="graph TD; A--&gt;B;"`);
    expect(html).not.toContain("<svg");
  });

  it("块级元素携带 data-source-line（0 基起始行）", () => {
    const html = renderMarkdown("第一段\n\n## 标题");
    expect(html).toContain('data-source-line="0"');
    expect(html).toContain('data-source-line="2"');
  });

  it("DOMPurify 消毒：script 与事件属性被剥离", () => {
    const html = renderMarkdown("<script>alert(1)</script>文本\n\n<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).toContain("文本");
  });

  it("html: false——内联 HTML 标签转义为文本", () => {
    expect(renderMarkdown("<b>x</b>")).not.toContain("<b>");
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现**

`src/lib/markdown.ts`：

```ts
import MarkdownIt from "markdown-it";
import taskLists from "@hedgedoc/markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

export const MERMAID_PLACEHOLDER_CLASS = "mermaid-block";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (str: string, lang: string) => {
    if (lang === "mermaid") {
      return `<pre class="${MERMAID_PLACEHOLDER_CLASS}" data-mermaid="${md.utils.escapeHtml(str)}"></pre>`;
    }
    const body =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        : md.utils.escapeHtml(str);
    return `<pre class="hljs"><code>${body}</code></pre>`;
  },
});

// 外链加 target/rel（DOMPurify 需 ADD_ATTR 放行 target）
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") ?? "";
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// 块级锚点：滚动同步与 M4 大纲共用的基建
md.core.ruler.push("source-line", (state) => {
  for (const tok of state.tokens) {
    if (tok.map && !tok.hidden) tok.attrSet("data-source-line", String(tok.map[0]));
  }
});

md.use(taskLists, { enabled: false, label: true });
md.use(katexPlugin);

export function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(md.render(content), {
    ADD_ATTR: ["target", "data-source-line", "data-mermaid"],
  });
}
```

注：`data-*` 属性 DOMPurify 默认放行，ADD_ATTR 中列 data-* 属显式声明（无害）；若 @vscode/markdown-it-katex 的默认导出形态不同（v2 起可能是命名导出），以实际包为准适配并保持测试语义。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test`
Expected: 全绿（24 + 8 = 32）。

- [ ] **Step 6: Commit**

```bash
git add src/lib package.json pnpm-lock.yaml src/styles.css
git commit -m "feat: markdown render pipeline with katex, hljs, task-lists and source-line anchors"
```

---

### Task 2: PreviewPane（图片/外链/Mermaid）与打开基建

**Files:**
- Create: `src/components/PreviewPane.tsx`、`src/components/PreviewPane.test.tsx`
- Modify: `package.json`（`pnpm add @tauri-apps/plugin-opener`）、`src-tauri/Cargo.toml`（`cargo add tauri-plugin-opener`，src-tauri/ 内）、`src-tauri/src/lib.rs`（重注册 opener 插件）、`src-tauri/capabilities/default.json`（追加 `"opener:allow-open-url"`）、`src-tauri/tauri.conf.json`（启用 asset protocol）、`src/styles.css`（预览排版）

**Interfaces:**
- Consumes: Task 1 `renderMarkdown`/`MERMAID_PLACEHOLDER_CLASS`、`useTabsStore`（activeRel + active tab content）、`useWorkspaceStore`（vault）。
- Produces: `<PreviewPane />`——无 active tab 时渲染占位「当前标签没有内容」；从 store 读内容渲染；图片 src 重写为 `convertFileSrc(vaultRoot + "/" + 规范化路径)`（以 vault 根为基准，剥离 `./`）；http/https 链接点击 → `openUrl(href)`（@tauri-apps/plugin-opener）且 preventDefault；mermaid 占位在挂载/内容变化后懒渲染（`await import("mermaid")`，模块级缓存，`securityLevel: "strict"`，主题跟随系统亮暗，失败显示原始代码 + 「Mermaid 渲染失败」提示行）。

- [ ] **Step 1: Rust/配置基建**

```bash
cd src-tauri && cargo add tauri-plugin-opener
pnpm add @tauri-apps/plugin-opener
```

`lib.rs` Builder 链追加（M1 审计时删过，现在有真实调用方）：

```rust
.plugin(tauri_plugin_opener::init())
```

`capabilities/default.json` permissions 数组追加：`"opener:allow-open-url"`。

`tauri.conf.json` `app.security` 增加（asset protocol 放行本地文件给 convertFileSrc；个人工具、本机文件，scope 放宽为全局并记录在案）：

```json
"assetProtocol": { "enable": true, "scope": ["**"] }
```

- [ ] **Step 2: 写失败测试**

`src/components/PreviewPane.test.tsx`：

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((p: string) => `asset://localhost/${encodeURIComponent(p)}`),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => {}) }));
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg>ok</svg>" })) },
}));

import { PreviewPane } from "./PreviewPane";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";
import { openUrl } from "@tauri-apps/plugin-opener";

function setActive(content: string, rel = "a.md") {
  useWorkspaceStore.setState({ vault: "/canon/v", tree: [] });
  useTabsStore.setState({
    tabs: [{ rel, name: "a", content, savedContent: content, mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false }],
    activeRel: rel,
  });
}

describe("PreviewPane", () => {
  beforeEach(() => useTabsStore.setState({ tabs: [], activeRel: null, conflict: null, pendingCloseRel: null }));

  it("无 active tab 渲染占位", () => {
    render(<PreviewPane />);
    expect(screen.getByText("当前标签没有内容")).toBeInTheDocument();
  });

  it("渲染 markdown 为 HTML（含标题）", () => {
    setActive("# 你好\n\n段落");
    render(<PreviewPane />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("你好");
  });

  it("图片 src 以 vault 根为基准重写为 asset URL", () => {
    setActive("![图](_assets/p.png)");
    render(<PreviewPane />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toContain("asset%3A%2F%2F"); // convertFileSrc 被调用
    expect(decodeURIComponent(img.src)).toContain("/canon/v/_assets/p.png");
  });

  it("http 外链点击走 openUrl 且不跳转", async () => {
    setActive("[官网](https://example.com)");
    render(<PreviewPane />);
    fireEvent.click(screen.getByText("官网"));
    expect(openUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("相对链接不调用 openUrl", () => {
    setActive("[内链](b.md)");
    render(<PreviewPane />);
    fireEvent.click(screen.getByText("内链"));
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("mermaid 占位被懒渲染替换为 svg", async () => {
    setActive("```mermaid\ngraph TD; A-->B;\n```");
    render(<PreviewPane />);
    expect(await screen.findByRole("img", { hidden: true })).toBeInTheDocument();
  });
});
```

注：最后一条断言以实际 mermaid.render 注入形态为准（svg 容器 role 不是 img 时，改断言容器内存在 `svg` 元素，用 `container.querySelector("svg")`）；`findByRole` 命不中不算失败信号，以"占位被替换为 svg"为准。

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（组件不存在）。

- [ ] **Step 4: 实现**

`src/components/PreviewPane.tsx`：

```tsx
import { useEffect, useMemo, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown, MERMAID_PLACEHOLDER_CLASS } from "../lib/markdown";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;
async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

export function PreviewPane() {
  const vault = useWorkspaceStore((s) => s.vault);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => (tab ? renderMarkdown(tab.content) : ""), [tab?.content]);

  // 图片 src：以 vault 根为基准解析
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !vault) return;
    for (const img of root.querySelectorAll("img")) {
      const src = img.getAttribute("src") ?? "";
      if (!src || src.startsWith("asset:") || /^https?:/.test(src)) continue;
      const clean = src.replace(/^\.\//, "").split("/").filter((s) => s !== "..").join("/");
      img.src = convertFileSrc(`${vault}/${clean}`);
    }
  }, [html, vault]);

  // mermaid 懒渲染
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll(`.${MERMAID_PLACEHOLDER_CLASS}`));
    if (blocks.length === 0) return;
    let cancelled = false;
    void (async () => {
      const mermaid = await getMermaid();
      for (const [i, el] of blocks.entries()) {
        if (cancelled) return;
        const code = el.getAttribute("data-mermaid") ?? "";
        try {
          const { svg } = await mermaid.render(`mmd-${Date.now()}-${i}`, code);
          if (!cancelled) el.innerHTML = svg;
        } catch (err) {
          if (!cancelled) {
            el.innerHTML = `<pre class="mermaid-error">${code.replace(/</g, "&lt;")}</pre><p class="mermaid-error-msg">Mermaid 渲染失败：${String(err).replace(/</g, "&lt;")}</p>`;
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [html]);

  if (!tab) return <div className="editor-empty">当前标签没有内容</div>;
  return (
    <div
      ref={containerRef}
      className="preview-pane"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href");
        if (a && href && /^https?:\/\//.test(href)) {
          e.preventDefault();
          void openUrl(href);
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

`src/styles.css` 追加（预览排版，纯预览态的居中 760px 由 Task 3 的外层容器控制）：

```css
.preview-pane { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 24px; font-size: 15px; }
.preview-pane h1, .preview-pane h2, .preview-pane h3 { font-weight: 600; line-height: 1.3; }
.preview-pane pre.hljs { background: var(--bg-inset); padding: 12px; border-radius: 6px; overflow-x: auto; }
.preview-pane pre.hljs code { background: none; padding: 0; font-size: 13px; }
.preview-pane code { background: var(--bg-inset); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
.preview-pane blockquote { border-left: 3px solid var(--border); margin: 8px 0; padding: 2px 12px; color: var(--fg-muted); }
.preview-pane img { max-width: 100%; }
.preview-pane .task-list-item input[type="checkbox"] { pointer-events: none; }
.preview-pane .mermaid-error { background: var(--bg-inset); padding: 12px; border-radius: 6px; }
.preview-pane .mermaid-error-msg { color: var(--danger); font-size: 13px; }
.split { display: flex; min-height: 0; flex: 1; }
.split > * { min-width: 0; }
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test && pnpm build && cd src-tauri && cargo test`
Expected: 全绿（32 + 6 ≈ 38 前端；Rust 11）。mermaid 动态 import 自动分包，主 bundle 不含 mermaid。

- [ ] **Step 6: Commit**

```bash
git add src src-tauri
git commit -m "feat: preview pane with asset images, external links and lazy mermaid"
```

---

### Task 3: settingsStore 与三态视图（分段控件 + ⌘E + 持久化）

**Files:**
- Create: `src/stores/settings.ts`、`src/stores/settings.test.ts`、`src/components/ViewModeSwitch.tsx`
- Modify: `src/App.tsx`（按 viewMode 渲染 + ⌘E 全局监听 + 纯预览居中容器）、`src/components/TabBar.tsx`（右侧嵌入 ViewModeSwitch）、`src/styles.css`

**Interfaces:**
- Produces: `type ViewMode = "edit" | "split" | "preview"`；`useSettingsStore`：`{ viewMode: ViewMode; setViewMode(m): void; cycleViewMode(): void }`，zustand `persist`（key `mdairy-settings`，仅存 viewMode），默认 `"split"`；`cycleViewMode` 按序 edit→split→preview→edit；`<ViewModeSwitch />`——三个中文按钮（编辑/分栏/预览），aria-pressed 标记当前态。

- [ ] **Step 1: 写失败测试**

`src/stores/settings.test.ts`：

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settings";

describe("settingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({ viewMode: "split" });
  });

  it("默认 split，setViewMode 生效并持久化", () => {
    expect(useSettingsStore.getState().viewMode).toBe("split");
    useSettingsStore.getState().setViewMode("preview");
    expect(useSettingsStore.getState().viewMode).toBe("preview");
    expect(JSON.parse(localStorage.getItem("mdairy-settings")!)).toMatchObject({ state: { viewMode: "preview" } });
  });

  it("cycleViewMode 按 edit→split→preview→edit 循环", () => {
    useSettingsStore.getState().setViewMode("edit");
    useSettingsStore.getState().cycleViewMode();
    expect(useSettingsStore.getState().viewMode).toBe("split");
    useSettingsStore.getState().cycleViewMode();
    expect(useSettingsStore.getState().viewMode).toBe("preview");
    useSettingsStore.getState().cycleViewMode();
    expect(useSettingsStore.getState().viewMode).toBe("edit");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`src/stores/settings.ts`：

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "edit" | "split" | "preview";
const ORDER: ViewMode[] = ["edit", "split", "preview"];

interface SettingsState {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  cycleViewMode: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      viewMode: "split",
      setViewMode: (m) => set({ viewMode: m }),
      cycleViewMode: () =>
        set((s) => ({ viewMode: ORDER[(ORDER.indexOf(s.viewMode) + 1) % ORDER.length] })),
    }),
    { name: "mdairy-settings", partialize: (s) => ({ viewMode: s.viewMode }) },
  ),
);
```

`src/components/ViewModeSwitch.tsx`：

```tsx
import { useSettingsStore } from "../stores/settings";

const LABELS = { edit: "编辑", split: "分栏", preview: "预览" } as const;

export function ViewModeSwitch() {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const setViewMode = useSettingsStore((s) => s.setViewMode);
  return (
    <div className="view-switch" role="group" aria-label="视图模式">
      {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((m) => (
        <button key={m} className="view-switch-btn" aria-pressed={viewMode === m} onClick={() => setViewMode(m)}>
          {LABELS[m]}
        </button>
      ))}
    </div>
  );
}
```

`src/App.tsx` 改动（main 区替换为按 viewMode 渲染；⌘E 监听；纯预览居中）：

```tsx
import { useSettingsStore } from "./stores/settings";
import { PreviewPane } from "./components/PreviewPane";
import { ViewModeSwitch } from "./components/ViewModeSwitch";

// 组件内：
const viewMode = useSettingsStore((s) => s.viewMode);

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      useSettingsStore.getState().cycleViewMode();
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []);

// main（vault 有值时）：
main={vault ? (
  <>
    <TabBar />
    {viewMode === "edit" ? (
      <EditorPane />
    ) : viewMode === "split" ? (
      <div className="split">
        <EditorPane />
        <PreviewPane />
      </div>
    ) : (
      <div className="preview-full"><PreviewPane /></div>
    )}
  </>
) : emptyState}
```

`TabBar.tsx`：右侧（tab 列表之后）插入 `<ViewModeSwitch />`，tab-bar 样式允许 margin-left:auto。

`src/styles.css` 追加：

```css
.view-switch { margin-left: auto; display: flex; gap: 2px; background: var(--bg-inset); border-radius: 6px; padding: 2px; }
.view-switch-btn { padding: 3px 10px; border-radius: 4px; font-size: 12px; color: var(--fg-muted); }
.view-switch-btn[aria-pressed="true"] { background: var(--bg); color: var(--fg); font-weight: 500; }
.preview-full { flex: 1; min-height: 0; display: flex; justify-content: center; overflow-y: auto; }
.preview-full > .preview-pane { flex: none; width: 760px; max-width: 100%; }
```

（EditorPane 在纯预览态卸载、回到编辑态重挂载——CM6 会重建，内容由 store 加载，行为正确；若验收时发现重挂载闪烁明显，再评估常驻+隐藏方案，M5 处理。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test`
Expected: 全绿（Task 2 基础 + 2）。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: view mode switch with persistence and cmd-e cycling"
```

---

### Task 4: 分栏滚动同步（编辑器光标 → 预览锚点）

**Files:**
- Modify: `src/stores/tabs.ts`（+`cursorLine: number`、`setCursorLine`）、`src/stores/tabs.test.ts`（+1 用例）、`src/components/EditorPane.tsx`（光标上报）、`src/components/PreviewPane.tsx`（锚点滚动）、`src/lib/markdown.test.ts`（source-line 已测，不动）

**Interfaces:**
- Consumes: Task 1 的 `data-source-line`（0 基）、Task 3 的 split 布局。
- Produces: tabsStore 增加 `cursorLine: number`（默认 0）与 `setCursorLine(n: number): void`（值不变时 no-op，防循环）；EditorPane updateListener 中光标行变化 → 防抖 100ms → `setCursorLine(cursorLine0Based)`；PreviewPane effect [cursorLine, html]：取预览内所有 `[data-source-line]` 元素中 `line <= cursorLine` 的最大者，与上次锚点不同才 `scrollIntoView({ block: "start" })`（±1 块误差由此自然允许）。

- [ ] **Step 1: 写失败测试**

`src/stores/tabs.test.ts` 追加：

```ts
it("setCursorLine 更新且同值 no-op", () => {
  useTabsStore.getState().setCursorLine(5);
  expect(useTabsStore.getState().cursorLine).toBe(5);
  const before = useTabsStore.getState();
  useTabsStore.getState().setCursorLine(5);
  expect(useTabsStore.getState()).toBe(before); // 引用不变，未触发订阅
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test`
Expected: FAIL（cursorLine 不存在）。

- [ ] **Step 3: 实现**

`src/stores/tabs.ts`：state 加 `cursorLine: number`（初始 0）与

```ts
setCursorLine: (n) =>
  set((s) => (s.cursorLine === n ? s : { cursorLine: n })),
```

`src/components/EditorPane.tsx`：模块级防抖 ref（组件内 `useRef<ReturnType<typeof setTimeout> | null>(null)`），updateListener 改为：

```tsx
EditorView.updateListener.of((u) => {
  if (u.docChanged) useTabsStore.getState().updateActive(u.state.doc.toString());
  const line = u.state.doc.lineAt(u.state.selection.main.head).number - 1;
  if (line === useTabsStore.getState().cursorLine) return;
  if (debounceRef.current) clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => useTabsStore.getState().setCursorLine(line), 100);
}),
```

`src/components/PreviewPane.tsx`：新增 effect：

```tsx
const cursorLine = useTabsStore((s) => s.cursorLine);
const lastAnchor = useRef<Element | null>(null);
useEffect(() => {
  const root = containerRef.current;
  if (!root) return;
  let target: Element | null = null;
  for (const el of root.querySelectorAll("[data-source-line]")) {
    if (Number(el.getAttribute("data-source-line")) <= cursorLine) target = el;
    else break;
  }
  if (target && target !== lastAnchor.current) {
    lastAnchor.current = target;
    target.scrollIntoView({ block: "start" });
  }
}, [cursorLine, html]);
```

（`querySelectorAll` 按文档序返回，`else break` 依赖有序性成立；纯预览态无光标变化、不会滚动。）

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm build`
Expected: 全绿（+1）。

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: block-anchored scroll sync from editor cursor to preview"
```

---

### Task 5: 回归与 M3 人工验收

**Files:**
- Modify: 无新代码；仅修复验收发现的问题

**Interfaces:** 无（验收关卡）。

- [ ] **Step 1: 全量自动化**

Run: `pnpm test && pnpm build && cd src-tauri && cargo test`
Expected: 全绿（前端约 39、Rust 11）。

- [ ] **Step 2: 人工验收走查（用户执行）**

`pnpm tauri dev`，准备含公式/mermaid/代码块/表格/任务列表/图片（`_assets/` 放一张图）的 md：

- [ ] 默认分栏：左编辑右预览各 50%，输入中文/公式/代码渲染正确（KaTeX 公式、代码高亮）
- [ ] mermaid 图渲染为 svg；故意写错语法 → 显示原始代码 + 红色「Mermaid 渲染失败」提示，应用不崩
- [ ] 任务列表 checkbox 显示但点不动（pointer-events 禁用）
- [ ] 图片 `_assets/x.png` 正常显示（asset protocol）
- [ ] 点击 http 外链 → 系统浏览器打开（默认浏览器），应用内无跳转；相对链接点击无反应不报错
- [ ] ⌘E 循环 编辑→分栏→预览→编辑；分段控件三按钮点击切换、当前态高亮
- [ ] 重启应用 → 视图模式保持上次选择
- [ ] 分栏下：光标在编辑器某段/标题移动 → 预览滚动到对应块（±1 块内）；长文档从头滚到尾无跳动循环
- [ ] 纯预览态内容居中 760px；纯编辑态无预览区
- [ ] devtools 无 console 报错（尤其 mermaid 懒加载与 katex）

- [ ] **Step 3: 收尾（controller，验收通过后）**

```bash
git add -A && git commit -m "fix: m3 acceptance fixes"   # 如有
git tag m3-done && git push origin m3-done
```

---

## Self-Review 记录

1. **Spec 覆盖（M3 范围）**：开发文档 §7 M3 = markdown-it 管线（T1）、三态视图（T3）、滚动同步（T4）、KaTeX/Mermaid（T1/T2）。页面需求 W1-E 全条目映射：GFM/高亮/KaTeX（T1+测试）、Mermaid 懒加载与失败兜底（T1 占位 + T2 渲染）、DOMPurify（T1）、链接系统浏览器（T2 openUrl）、任务列表不回写（T1 enabled:false + CSS 禁点击）、图片 vault 根基准（T2 重写）、防抖 300ms 重渲染（useMemo 随 content 变化即时渲染，本地渲染无 IO，未再做 300ms 防抖——**偏差声明**：页面需求写"防抖 300ms 触发预览重渲染"，同步渲染成本低，直接渲染即可，若验收卡顿再加防抖）、纯预览 760px（T3）、分栏 50/50（T3 .split flex）、滚动同步块级 ±1（T4）。W1-T 三态分段控件 + ⌘E（T3）。settingsStore（开发文档 §6）落地 viewMode，主题字段 M5 扩展。✅ 无缺口。
2. **占位符扫描**：各步骤均含完整代码/命令/预期；Task 1 注明 katex 插件导出形态以实包为准、Task 2 注明 mermaid 断言以实际注入形态为准——均为"以实包为准适配、保持测试语义"的执行说明，非占位。✅
3. **类型一致性**：`renderMarkdown`/`MERMAID_PLACEHOLDER_CLASS` T1 定义 ↔ T2 消费；`data-source-line` 0 基 ↔ T4 cursorLine 0 基（`lineAt(...).number - 1`）；`useSettingsStore` 三方法 ↔ App/ViewModeSwitch 调用；`openUrl` ↔ capability `opener:allow-open-url`；`convertFileSrc` ↔ assetProtocol 启用。⚠️ 已自查一处：T2 `openUrl` 需 capability 明细权限，`opener:default` 不含 allow-open-url——Step 1 已写明追加 `opener:allow-open-url`。✅
