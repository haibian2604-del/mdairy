import { useState } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FileTree } from "./FileTree";
import { SearchPanel } from "./SearchPanel";
import { useOpenFile } from "../hooks/useOpenFile";
import { useWorkspaceStore } from "../stores/workspace";

export function Sidebar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const tree = useWorkspaceStore((s) => s.tree);
  const openVault = useWorkspaceStore((s) => s.openVault);
  const onOpenFile = useOpenFile();
  const [tab, setTab] = useState<"files" | "search">("files");
  const vaultName = vault?.split("/").pop() ?? "";

  const repick = async () => {
    const path = await pickFolder({ directory: true });
    if (path) await openVault(path);
  };

  return (
    <>
      <button className="vault-name" title="重新选择文件夹" onClick={repick}>
        {vaultName}
      </button>
      <div className="sidebar-tabs" role="tablist" aria-label="侧栏视图">
        <button
          role="tab"
          aria-selected={tab === "files"}
          className="sidebar-tab"
          onClick={() => setTab("files")}
        >
          文件
        </button>
        <button
          role="tab"
          aria-selected={tab === "search"}
          className="sidebar-tab"
          onClick={() => setTab("search")}
        >
          搜索
        </button>
      </div>
      {tab === "files" ? <FileTree nodes={tree} onOpenFile={onOpenFile} /> : <SearchPanel />}
    </>
  );
}
