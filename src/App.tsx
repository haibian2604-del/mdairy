import { useEffect } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { ConflictDialog } from "./components/ConflictDialog";
import { EditorPane } from "./components/EditorPane";
import { MilkdownPane } from "./components/MilkdownPane";
import { PreviewPane } from "./components/PreviewPane";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { useVaultEvents } from "./hooks/useVaultEvents";
import { useSettingsStore } from "./stores/settings";
import { useTabsStore } from "./stores/tabs";
import { useWorkspaceStore } from "./stores/workspace";

export default function App() {
  const vault = useWorkspaceStore((s) => s.vault);
  const error = useWorkspaceStore((s) => s.error);
  const openVault = useWorkspaceStore((s) => s.openVault);
  const viewMode = useSettingsStore((s) => s.viewMode);

  useEffect(() => {
    void useWorkspaceStore.getState().restoreLastVault();
  }, []);
  useVaultEvents(vault);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        useSettingsStore.getState().cycleViewMode();
      }
      // ⌘S/ctrl+S 全局保存（与 ⌘E 并列；EditorPane 的 CM6 Mod-s keymap 在 split
      // 并存期对 MilkdownPane 不生效，由这里兜底）
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useTabsStore.getState().saveActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
            {viewMode === "edit" ? (
              <EditorPane />
            ) : viewMode === "split" ? (
              <div className="split">
                <MilkdownPane />
                <PreviewPane />
              </div>
            ) : (
              <div className="preview-full"><PreviewPane /></div>
            )}
          </>
        ) : emptyState}
        statusBar={<StatusBar />}
      />
      <ConflictDialog />
      <CloseConfirmDialog />
    </>
  );
}
