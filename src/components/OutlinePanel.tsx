import { useEffect, useMemo, useRef, useState } from "react";
import { extractHeadings } from "../lib/headings";
import { useTabsStore } from "../stores/tabs";

/** 大纲面板：标题列表 + 编辑器滚动跟随。
    跟随语义（ Typora 式）：右侧内容滚过下一条标题时，高亮才切换、大纲才滚动；
    标题之间的滚动不动大纲。 */
export function OutlinePanel() {
  const activeRel = useTabsStore((s) => s.activeRel);
  const content = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel)?.content);
  const requestJump = useTabsStore((s) => s.requestJump);

  const headings = useMemo(() => extractHeadings(content ?? ""), [content]);
  // 视口顶已越过的最后一条标题下标（-1 = 尚未到第一条）
  const [activeIdx, setActiveIdx] = useState(-1);
  const activeIdxRef = useRef(-1);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editorRoot = document.querySelector(".milkdown-pane");
    if (!editorRoot || headings.length === 0) return;
    const compute = () => {
      const editor = editorRoot.querySelector(".ProseMirror");
      const domHeads = editor?.querySelectorAll(
        ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6",
      );
      // 源码标题与渲染标题一一对应才可信（setext/嵌套标题会造成数量偏差，此时不跟随）
      if (!domHeads || domHeads.length !== headings.length) return;
      const top = editorRoot.getBoundingClientRect().top;
      let idx = -1;
      domHeads.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= top + 1) idx = i;
      });
      if (idx === activeIdxRef.current) return;
      activeIdxRef.current = idx;
      setActiveIdx(idx);
      // 仅在高亮切换点滚动大纲，把当前项带进视野（nearest：已在视野则不动）
      panelRef.current?.children[idx]?.scrollIntoView({ block: "nearest" });
    };
    // scroll 事件不冒泡，用捕获截获编辑器内部滚动；rAF 合帧避免逐事件 layout 抖动
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    document.addEventListener("scroll", onScroll, true);
    compute(); // 切换文件/内容变化时先校准一次当前位置
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [headings]);

  return (
    <div className="outline-panel" ref={panelRef}>
      {headings.length === 0 ? (
        <div className="outline-empty">暂无标题</div>
      ) : (
        headings.map((h, i) => (
          <button
            key={h.line}
            className={`outline-item${i === activeIdx ? " active" : ""}`}
            style={{ paddingLeft: 8 + (h.level - 1) * 12 }}
            title={h.text}
            onClick={() => {
              if (activeRel) void requestJump(activeRel, h.line);
            }}
          >
            {h.text}
          </button>
        ))
      )}
    </div>
  );
}
