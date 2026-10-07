import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "system" | "light" | "dark";
interface SettingsState {
  /** 三态主题：system 跟随系统外观（matchMedia 解析），light/dark 强制指定；
      切换入口在 macOS 菜单栏 Theme 菜单（App 侧联动 sync_theme_menu） */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: "system",
      setThemeMode: (mode) => set({ themeMode: mode }),
    }),
    { name: "mdairy-theme", partialize: (s) => ({ themeMode: s.themeMode }) },
  ),
);
