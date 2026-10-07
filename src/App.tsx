import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen } from "lucide-react";
import { api } from "./api";
import { AppShell } from "./components/AppShell";
import { CloseConfirmDialog } from "./components/CloseConfirmDialog";
import { CommandPalette } from "./components/CommandPalette";
import { ConflictDialog } from "./components/ConflictDialog";
import { MilkdownPane } from "./components/MilkdownPane";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { useVaultEvents } from "./hooks/useVaultEvents";
import { openAbsolutePath, pickAndOpenFile, pickAndOpenVault } from "./lib/pickVault";
import type { ThemeMode } from "./stores/settings";
import { useSettingsStore } from "./stores/settings";
import { useTabsStore } from "./stores/tabs";
import { useUiStore, type SidebarTab } from "./stores/ui";
import { useWorkspaceStore } from "./stores/workspace";

export default function App() {
  const vault = useWorkspaceStore((s) => s.vault);
  const error = useWorkspaceStore((s) => s.error);
  // 侧栏显隐：提升到 ui store（⌘⇧O、TabBar 按钮、菜单/Sidebar 子菜单共用），不持久化
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  // 命令面板：null 关闭；⌘⇧P 开 all、⌘P 开 files
  const [paletteMode, setPaletteMode] = useState<"all" | "files" | null>(null);

  useEffect(() => {
    // Typora 式全新启动：只开一个未命名缓冲区，不恢复上次 vault/标签。
    // 守卫幂等：StrictMode 下 effect 双跑不重复开（store 跨卸载保留）
    if (useTabsStore.getState().tabs.length === 0) useTabsStore.getState().newUntitled();
  }, []);
  // 顶部菜单（Rust 侧）点选 → 同步 store（与状态栏按钮共用一套状态）。
  // listen 异步注册，须带清理：StrictMode 双挂载会注册两份监听器，
  // "再点当前项=隐藏"这类非幂等动作就会被一次点击触发两次（表现为点了没反应且勾选消失）。
  useEffect(() => {
    let disposed = false;
    const unlistens: Array<() => void> = [];
    void listen<ThemeMode>("theme-menu", (e) => useSettingsStore.getState().setThemeMode(e.payload)).then(
      (un) => { if (disposed) un(); else unlistens.push(un); },
    );
    void listen<SidebarTab>("sidebar-menu", (e) => useUiStore.getState().setSidebarTab(e.payload)).then(
      (un) => { if (disposed) un(); else unlistens.push(un); },
    );
    // File 菜单（新建文件 ⌘N / 打开文件夹 ⌘O / 打开文件）→ 前端动作；
    // ⌘N/⌘O 由原生菜单加速键拦截，webview keydown 里的同名分支仅在无菜单环境兜底
    void listen<string>("file-menu", (e) => {
      if (e.payload === "open-folder") void pickAndOpenVault();
      else if (e.payload === "open-file") void pickAndOpenFile();
      else if (e.payload === "new-file") useTabsStore.getState().newUntitled();
    }).then((un) => { if (disposed) un(); else unlistens.push(un); });
    // 系统打开请求（双击 md / Finder「打开方式」）：运行期事件 + 启动竞态缓冲领取
    const openPaths = (paths: string[]) => {
      for (const p of paths) {
        if (/\.(md|markdown)$/i.test(p)) void openAbsolutePath(p);
      }
    };
    void listen<string[]>("open-paths", (e) => openPaths(e.payload)).then(
      (un) => { if (disposed) un(); else unlistens.push(un); },
    );
    void api.takeOpenedFiles().then(openPaths).catch(() => {});
    return () => {
      disposed = true;
      unlistens.forEach((un) => un());
    };
  }, []);
  // 前端边栏状态变化 → 回写菜单勾选态（null = 隐藏）
  useEffect(() => {
    void api.syncSidebarMenu(sidebarOpen ? sidebarTab : null).catch(() => {});
  }, [sidebarOpen, sidebarTab]);
  useVaultEvents(vault);

  // 主题三态：恒写 data-theme 到 root（CSS 据此切换暗色 token）；
  // system 态用 matchMedia 解析并监听系统外观变化，其余态直接生效。
  const themeMode = useSettingsStore((s) => s.themeMode);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        themeMode === "system" ? (mq.matches ? "dark" : "light") : themeMode;
    };
    apply();
    // 菜单勾选态回写（状态栏按钮/菜单点选/持久化恢复共用这一条同步通道）
    void api.syncThemeMenu(themeMode).catch(() => {});
    if (themeMode !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [themeMode]);

  // 全局快捷键统一收敛在这一个 window keydown 处理器：
  // ⌘S 保存；⌘⇧O 切换侧栏显隐；⌘⇧F 聚焦搜索；⌘⇧P/⌘P 命令面板。
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
      // ⌘⇧O/ctrl+⇧O 切换侧栏显隐（大纲在侧栏页签内）
      if (modShift && e.key.toLowerCase() === "o") {
        e.preventDefault();
        useUiStore.getState().toggleSidebar();
      }
      // ⌘N 新建未命名缓冲区（Typora 式）
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useTabsStore.getState().newUntitled();
      }
      // ⌘⇧F/ctrl+⇧F 切到搜索页签并聚焦输入框
      if (modShift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useUiStore.getState().focusSearch();
      }
      // ⌘⇧P 开/关命令面板（all）/ ⌘P 开/关文件模式（preventDefault 拦截 WebView 默认打印）：
      // 再按同模式关闭，切到另一模式则直接切换。
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteMode((p) => (p === (e.shiftKey ? "all" : "files") ? null : (e.shiftKey ? "all" : "files")));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 无 vault 时侧栏放引导（选择文件夹）；主区仍给标签栏+编辑器——
  // 启动即有未命名缓冲区可写（Typora 语义），⌘S 时再引导选位置
  const vaultGuide = (
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
        sidebar={sidebarOpen ? (vault ? <Sidebar /> : vaultGuide) : null}
        main={
          <>
            <TabBar />
            <MilkdownPane />
          </>
        }
        statusBar={<StatusBar />}
      />
      <ConflictDialog />
      <CloseConfirmDialog />
      {paletteMode && <CommandPalette mode={paletteMode} onClose={() => setPaletteMode(null)} />}
    </>
  );
}
