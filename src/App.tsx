import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { CommandPalette } from "./components/CommandPalette";
import { ConflictDialog } from "./components/ConflictDialog";
import { MilkdownPane } from "./components/MilkdownPane";
import { OutlinePanel } from "./components/OutlinePanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { useVaultEvents } from "./hooks/useVaultEvents";
import { pickAndOpenVault } from "./lib/pickVault";
import { useTabsStore } from "./stores/tabs";
import { useUiStore } from "./stores/ui";
import { useWorkspaceStore } from "./stores/workspace";

export default function App() {
  const vault = useWorkspaceStore((s) => s.vault);
  const error = useWorkspaceStore((s) => s.error);
  // 大纲面板折叠：提升到 ui store（⌘⇧O 与命令面板共用），不持久化（M6 统一 settings 时再定）
  const outlineOpen = useUiStore((s) => s.outlineOpen);
  // 命令面板：null 关闭；⌘⇧P 开 all、⌘P 开 files
  const [paletteMode, setPaletteMode] = useState<"all" | "files" | null>(null);

  useEffect(() => {
    void useWorkspaceStore.getState().restoreLastVault();
  }, []);
  useVaultEvents(vault);

  // 全局快捷键统一收敛在这一个 window keydown 处理器：
  // ⌘S 保存；⌘⇧O 折叠/展开大纲；⌘⇧F 聚焦搜索；⌘⇧P/⌘P 命令面板。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 防御纵深：若组件内快捷键已处理（defaultPrevented）则跳过，避免双重保存。
      // 编辑器统一为 Milkdown（无组件级保存 keymap）后由这里统一处理，
      // 守卫保留以防未来再引入组件级 keymap。
      if (e.defaultPrevented) return;
      const mod = (e.metaKey || e.ctrlKey) && !e.shiftKey;
      const modShift = (e.metaKey || e.ctrlKey) && e.shiftKey;
      // ⌘S/ctrl+S 全局保存（Milkdown 无组件级保存 keymap，由这里统一处理）
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useTabsStore.getState().saveActive();
      }
      // ⌘⇧O/ctrl+⇧O 折叠/展开右栏大纲
      if (modShift && e.key.toLowerCase() === "o") {
        e.preventDefault();
        useUiStore.getState().toggleOutline();
      }
      // ⌘⇧F/ctrl+⇧F 切到搜索页签并聚焦输入框
      if (modShift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useUiStore.getState().focusSearch();
      }
      // ⌘⇧P 开命令面板（all）/ ⌘P 开文件模式（preventDefault 拦截 WebView 默认打印）
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteMode(e.shiftKey ? "all" : "files");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const emptyState = (
    <div className="empty-state">
      <FolderOpen size={48} strokeWidth={1.5} />
      <p>打开一个文件夹，开始笔记</p>
      {error && <p className="error-text">{error}</p>}
      <button className="btn-primary" onClick={() => void pickAndOpenVault()}>选择文件夹…</button>
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
      {paletteMode && <CommandPalette mode={paletteMode} onClose={() => setPaletteMode(null)} />}
    </>
  );
}
