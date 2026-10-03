import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "edit" | "split" | "preview";
const ORDER: ViewMode[] = ["edit", "split", "preview"];

interface SettingsState {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  cycleViewMode: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      viewMode: "split",
      setViewMode: (m) => set({ viewMode: m }),
      cycleViewMode: () =>
        set((s) => ({ viewMode: ORDER[(ORDER.indexOf(s.viewMode) + 1) % ORDER.length] })),
    }),
    { name: "mdairy-settings", partialize: (s) => ({ viewMode: s.viewMode }) },
  ),
);
