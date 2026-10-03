import { useEffect, useState } from "react";
import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { ConflictDialog } from "./components/ConflictDialog";
import { MilkdownPane } from "./components/MilkdownPane";
import { OutlinePanel } from "./components/OutlinePanel";
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
  // 大纲面板折叠：App 内 state，不持久化（M6 统一 settings 时再定）
  const [outlineOpen, setOutlineOpen] = useState(true);

  useEffect(() => {
    void useWorkspaceStore.getState().restoreLastVault();
  }, []);
  useVaultEvents(vault);

  // 全局快捷键统一收敛在这一个 window keydown 处理器：
  // ⌘S 保存；⌘⇧O 折叠/展开大纲；⌘⇧F 聚焦搜索与 ⌘⇧P/⌘P 命令面板由 Task 4 接入。
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
      // ⌘⇧O/ctrl+⇧O 折叠/展开右栏大纲
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setOutlineOpen((v) => !v);
      }
      // ⌘⇧P / ⌘P：命令面板快捷键——命令面板 Task 4 落地时在此接入（占位不发）。
      // ⌘⇧F：聚焦搜索输入框，随 Task 4 的命令面板一起接线。
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
        right={vault && outlineOpen ? <OutlinePanel /> : null}
        statusBar={<StatusBar />}
      />
      <ConflictDialog />
      <CloseConfirmDialog />
    </>
  );
}
