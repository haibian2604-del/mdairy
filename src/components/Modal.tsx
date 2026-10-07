import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** 共享模态壳：打开时焦点移入面板（首个可聚焦元素）、关闭时归还给触发点，
    Tab 在面板内圈闭，Escape 触发 onClose。三个确认弹窗共用。 */
export function Modal({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // onClose 用 ref 转发：效果只挂一次，父组件每轮渲染的新闭包不会重跑（否则焦点被拽回首项）
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const prev = document.activeElement as HTMLElement | null;
    (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const active = document.activeElement;
      const inside = panel.contains(active);
      if (e.shiftKey && (active === items[0] || !inside)) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (active === items[items.length - 1] || !inside)) {
        e.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal-panel" role="dialog" aria-modal="true" aria-label={label} ref={panelRef} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}
