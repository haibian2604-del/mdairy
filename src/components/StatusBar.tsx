import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

export function StatusBar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const activeRel = useTabsStore((s) => s.activeRel);
  const isDirty = useTabsStore((s) => s.isDirty(s.activeRel));

  return (
    <>
      <span className="status-path">
        {vault && activeRel ? `${vault}/${activeRel}` : (vault ?? "")}
      </span>
      {activeRel && <span>{isDirty ? "未保存" : "已保存"}</span>}
    </>
  );
}
