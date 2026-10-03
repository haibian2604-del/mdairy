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
