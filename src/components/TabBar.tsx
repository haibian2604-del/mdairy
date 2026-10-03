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
