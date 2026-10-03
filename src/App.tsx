import { useEffect } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { ConflictDialog } from "./components/ConflictDialog";
import { EditorPane } from "./components/EditorPane";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { useVaultEvents } from "./hooks/useVaultEvents";
import { useWorkspaceStore } from "./stores/workspace";

export default function App() {
  const vault = useWorkspaceStore((s) => s.vault);
  const error = useWorkspaceStore((s) => s.error);
  const openVault = useWorkspaceStore((s) => s.openVault);

  useEffect(() => {
    void useWorkspaceStore.getState().restoreLastVault();
  }, []);
  useVaultEvents(vault);

  const pick = async () => {
    const path = await pickFolder({ directory: true });
    if (path) await openVault(path);
  };

  const emptyState = (
    <div className="empty-state">
      <FolderOpen size={48} strokeWidth={1.5} />
      <p>打开一个文件夹，开始笔记</p>
      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" onClick={pick}>选择文件夹…</button>
    </div>
  );

  return (
    <>
      <AppShell
        sidebar={vault ? <Sidebar /> : null}
        main={vault ? (
          <>
            <TabBar />
            <EditorPane />
          </>
        ) : emptyState}
        statusBar={<StatusBar />}
      />
      <ConflictDialog />
      <CloseConfirmDialog />
    </>
  );
}
