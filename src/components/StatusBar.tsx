import { Monitor, Moon, Sun } from "lucide-react";
import { useSettingsStore } from "../stores/settings";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const activeTab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));
  const encoding = activeTab?.encoding ?? "";
  const isDirty = useTabsStore((s) => s.isDirty(s.activeRel));
  const themeMode = useSettingsStore((s) => s.themeMode);
  const cycleTheme = useSettingsStore((s) => s.cycleTheme);

  const themeTitle = themeMode === "system" ? "主题：跟随系统" : themeMode === "light" ? "主题：亮色" : "主题：暗色";
  const ThemeIcon = themeMode === "system" ? Monitor : themeMode === "light" ? Sun : Moon;

  // 未命名缓冲区无真实路径：只显示标签名，不把伪 rel（~untitled-N）当路径展示
  const pathText = activeTab
    ? activeTab.untitled
      ? activeTab.name
      : vault
        ? `${vault}/${activeTab.rel}`
        : activeTab.rel
    : (vault ?? "");

  return (
    <>
      <span className="status-path">{pathText}</span>
      {activeTab && <span>{isDirty ? "未保存" : "已保存"}</span>}
      {activeTab && encoding && <span>{encoding}</span>}
      <button className="status-theme" title={themeTitle} aria-label={themeTitle} onClick={cycleTheme}>
        <ThemeIcon size={14} />
      </button>
    </>
  );
}
