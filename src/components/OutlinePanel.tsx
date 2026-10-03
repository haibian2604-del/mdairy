import { useMemo } from "react";
import { extractHeadings } from "../lib/headings";
import { useTabsStore } from "../stores/tabs";

/** 右栏大纲：activeTab 标题层级树，点击滚动到对应块级节点（经 requestJump → MilkdownPane 消费） */
export function OutlinePanel() {
  const activeRel = useTabsStore((s) => s.activeRel);
  const content = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel)?.content);
  const requestJump = useTabsStore((s) => s.requestJump);

  const headings = useMemo(() => extractHeadings(content ?? ""), [content]);

  return (
    <div className="outline-panel">
      <div className="outline-title">大纲</div>
      {headings.length === 0 ? (
        <div className="outline-empty">暂无标题</div>
      ) : (
        headings.map((h) => (
          <button
            key={h.line}
            className="outline-item"
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
