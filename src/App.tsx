import { useEffect } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { ConflictDialog } from "./components/ConflictDialog";
import { MilkdownPane } from "./components/MilkdownPane";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { useVaultEvents } from "./hooks/useVaultEvents";
import { useTabsStore } from "./stores/tabs";
import { useWorkspaceStore } from "./stores/workspace";

export default function App() {
  const vault = useWorkspaceStore((s) => s.vault);
  const error = useWorkspaceStore((s) => s.error);
  const openVault = useWorkspaceStore((s) => s.openVault);

  useEffect(() => {
    void useWorkspaceStore.getState().restoreLastVault();
  }, []);
  useVaultEvents(vault);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 防御纵深：若组件内快捷键已处理（defaultPrevented）则跳过，避免双重保存。
      // 编辑器统一为 Milkdown（无组件级保存 keymap）后由这里统一处理，
      // 守卫保留以防未来再引入组件级 keymap。
      if (e.defaultPrevented) return;
      // ⌘S/ctrl+S 全局保存（Milkdown 无组件级保存 keymap，由这里统一处理）
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
            <MilkdownPane />
          </>
        ) : emptyState}
        statusBar={<StatusBar />}
      />
      <ConflictDialog />
      <CloseConfirmDialog />
    </>
  );
}
