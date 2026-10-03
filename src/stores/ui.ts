import { create } from "zustand";

/**
 * 轻量 UI 状态：大纲折叠、侧栏页签。
 * 从 App/Sidebar 的组件内 state 提升到这里，命令面板（useCommands）与
 * 全局快捷键（App window keydown）无需 prop 钻透即可触发同一行为。
 */
interface UiState {
  /** 右栏大纲折叠（不持久化，M6 统一 settings 时再定） */
  outlineOpen: boolean;
  /** 侧栏页签：文件 / 搜索 */
  sidebarTab: "files" | "search";
  /** 搜索输入框聚焦信号：自增触发 Sidebar 副作用聚焦（0 为初始不聚焦） */
  searchFocusNonce: number;
  toggleOutline: () => void;
  setSidebarTab: (tab: "files" | "search") => void;
  /** 切到搜索页签并聚焦输入框（⌘⇧F 与命令面板共用） */
  focusSearch: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  outlineOpen: true,
  sidebarTab: "files",
  searchFocusNonce: 0,
  toggleOutline: () => set((s) => ({ outlineOpen: !s.outlineOpen })),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  focusSearch: () => set((s) => ({ sidebarTab: "search", searchFocusNonce: s.searchFocusNonce + 1 })),
}));
