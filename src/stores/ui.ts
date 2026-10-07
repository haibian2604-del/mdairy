import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 轻量 UI 状态：侧栏显隐、侧栏视图（文件/搜索/大纲）。
 * 视图选择与显隐入口在 macOS 菜单栏 Sidebar（勾选单选/全不选=隐藏），
 * 键盘入口 ⌘⇧O；命令面板与快捷键经此 store 统一。
 * 显隐与页签持久化（同 settings 的 persist 模式）：下次启动恢复上次状态，
 * App 挂载时的 syncSidebarMenu 回写让菜单勾选一并还原。
 */
export type SidebarTab = "files" | "search" | "outline";

interface UiState {
  /** 侧栏整体显隐（false = 编辑区独占；菜单 Sidebar 全不选 / 再点当前勾选项 / ⌘⇧O 切换） */
  sidebarOpen: boolean;
  /** 侧栏页签：文件 / 搜索 / 大纲 */
  sidebarTab: SidebarTab;
  /** 搜索输入框聚焦信号：自增触发 Sidebar 副作用聚焦（0 为初始不聚焦） */
  searchFocusNonce: number;
  toggleSidebar: () => void;
  /** 切换页签；再点当前已展开的页签 = 收起侧栏（Typora 式） */
  setSidebarTab: (tab: SidebarTab) => void;
  /** 切到搜索页签并聚焦输入框（⌘⇧F 与命令面板共用，顺带展开侧栏） */
  focusSearch: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarTab: "files",
      searchFocusNonce: 0,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarTab: (tab) =>
        set((s) =>
          s.sidebarOpen && s.sidebarTab === tab
            ? { sidebarOpen: false }
            : { sidebarOpen: true, sidebarTab: tab },
        ),
      /** 切到搜索页签并聚焦输入框（⌘⇧F 与命令面板共用）；已在搜索页签时也重新聚焦 */
      focusSearch: () =>
        set((s) => ({ sidebarOpen: true, sidebarTab: "search", searchFocusNonce: s.searchFocusNonce + 1 })),
    }),
    // searchFocusNonce 是运行时聚焦信号，不入存储
    { name: "mdairy-sidebar", partialize: (s) => ({ sidebarOpen: s.sidebarOpen, sidebarTab: s.sidebarTab }) },
  ),
);
