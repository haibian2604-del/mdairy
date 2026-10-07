import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const activeTab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));
  const encoding = activeTab?.encoding ?? "";
  const isDirty = useTabsStore((s) => s.isDirty(s.activeRel));

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
    </>
  );
}
