import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "system" | "light" | "dark";
interface SettingsState {
  /** 三态主题：system 跟随系统外观（matchMedia 解析），light/dark 强制指定 */
  themeMode: ThemeMode;
  /** 状态栏按钮循环：system→light→dark→system */
  cycleTheme: () => void;
  /** 直接设置（顶部"主题"菜单与状态栏共用，App 侧联动 sync_theme_menu） */
  setThemeMode: (mode: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      themeMode: "system",
      cycleTheme: () =>
        set({ themeMode: get().themeMode === "system" ? "light" : get().themeMode === "light" ? "dark" : "system" }),
      setThemeMode: (mode) => set({ themeMode: mode }),
    }),
    { name: "mdairy-theme", partialize: (s) => ({ themeMode: s.themeMode }) },
  ),
);
