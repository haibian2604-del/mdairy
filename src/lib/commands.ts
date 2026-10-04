import { useUiStore } from "../stores/ui";
import { useTabsStore } from "../stores/tabs";
import { pickAndOpenVault } from "./pickVault";

export interface Command {
  id: string;
  label: string;
  /** 快捷键提示文本（如 "⌘⇧O"），无快捷键则省略 */
  hint?: string;
  run: () => void;
}

/** 命令面板命令注册表（顺序即展示顺序，按树序/注册序，修改时间暂不可得） */
export function useCommands(): Command[] {
  return [
    {
      id: "toggle-sidebar",
      label: "切换侧栏",
      hint: "⌘⇧O",
      run: () => useUiStore.getState().toggleSidebar(),
    },
    {
      id: "focus-search",
      label: "搜索笔记",
      hint: "⌘⇧F",
      run: () => useUiStore.getState().focusSearch(),
    },
    {
      id: "new-note",
      label: "新建笔记",
      hint: "⌘N",
      run: () => useTabsStore.getState().newUntitled(),
    },
    {
      id: "open-folder",
      label: "打开文件夹",
      run: () => void pickAndOpenVault(),
    },
    // M6 占位：切换主题（亮/暗/跟随系统）、最近文件等在此注册。
  ];
}
