import { Monitor, Moon, Sun } from "lucide-react";
import { useSettingsStore } from "../stores/settings";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const activeRel = useTabsStore((s) => s.activeRel);
  const encoding = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel)?.encoding ?? "");
  const isDirty = useTabsStore((s) => s.isDirty(s.activeRel));
  const themeMode = useSettingsStore((s) => s.themeMode);
  const cycleTheme = useSettingsStore((s) => s.cycleTheme);

  const themeTitle = themeMode === "system" ? "主题：跟随系统" : themeMode === "light" ? "主题：亮色" : "主题：暗色";
  const ThemeIcon = themeMode === "system" ? Monitor : themeMode === "light" ? Sun : Moon;

  return (
    <>
      <span className="status-path">
        {vault && activeRel ? `${vault}/${activeRel}` : (vault ?? "")}
      </span>
      {activeRel && <span>{isDirty ? "未保存" : "已保存"}</span>}
      {activeRel && encoding && <span>{encoding}</span>}
      <button className="status-theme" title={themeTitle} aria-label={themeTitle} onClick={cycleTheme}>
        <ThemeIcon size={14} />
      </button>
    </>
  );
}
