import { useEffect, useMemo, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown, MERMAID_PLACEHOLDER_CLASS } from "../lib/markdown";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;
// render id 用模块级自增计数器：快速切换内容时 Date.now() 同毫秒同序号会碰撞
let mermaidSeq = 0;
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

  // 图片 src：以 vault 根为基准解析（剥离 ./，丢弃越出 vault 的 .. 段）
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !vault) return;
    for (const img of root.querySelectorAll("img")) {
      let src = img.getAttribute("src") ?? "";
      if (!src || src.startsWith("asset:") || /^https?:/.test(src)) continue;
      // markdown-it 已对 src 做过 URL 编码（如中文 → %E5...），先解码得到真实相对路径，
      // 否则 convertFileSrc 内部再编码会产生双重编码，asset 协议端解出的路径与磁盘不符
      try {
        src = decodeURIComponent(src);
      } catch {
        /* 非法百分号序列，保持原样 */
      }
      const clean = src.replace(/^\.\//, "").split("/").filter((s) => s !== "..").join("/");
      img.src = convertFileSrc(`${vault}/${clean}`);
    }
  }, [html, vault]);

  // mermaid 懒渲染：data-mermaid 在消毒回填后经 getAttribute 取到解码后的原始源码
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll(`.${MERMAID_PLACEHOLDER_CLASS}`));
    if (blocks.length === 0) return;
    let cancelled = false;
    void (async () => {
      const mermaid = await getMermaid();
      for (const el of blocks) {
        if (cancelled) return;
        const code = el.getAttribute("data-mermaid") ?? "";
        try {
          const { svg } = await mermaid.render(`mmd-${mermaidSeq++}`, code);
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
        if (!a || !href) return;
        // 带 href 的链接一律 preventDefault：相对链接若放行，webview 会同源导航替换整个应用视图
        e.preventDefault();
        if (/^https?:\/\//.test(href)) void openUrl(href);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
