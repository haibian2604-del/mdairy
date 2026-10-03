import { create } from "zustand";
import { api } from "../api";
import { useWorkspaceStore } from "./workspace";

export interface Tab {
  rel: string;
  name: string;
  content: string;
  savedContent: string;
  mtimeMillis: number;
}

interface OpenArgs {
  rel: string;
  name: string;
  content: string;
  mtimeMillis: number;
}

interface TabsState {
  tabs: Tab[];
  activeRel: string | null;
  open: (t: OpenArgs) => void;
  close: (rel: string) => void;
  setActive: (rel: string) => void;
  updateActive: (content: string) => void;
  isDirty: (rel: string | null) => boolean;
  saveActive: () => Promise<void>;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeRel: null,
  open: (t) =>
    set((s) => {
      if (s.tabs.some((x) => x.rel === t.rel)) return { activeRel: t.rel };
      const name = t.name.replace(/\.md$/i, "");
      return {
        tabs: [...s.tabs, { ...t, name, savedContent: t.content }],
        activeRel: t.rel,
      };
    }),
  close: (rel) =>
    set((s) => {
      const idx = s.tabs.findIndex((x) => x.rel === rel);
      const tabs = s.tabs.filter((x) => x.rel !== rel);
      let activeRel = s.activeRel;
      if (s.activeRel === rel) {
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeRel = next ? next.rel : null;
      }
      return { tabs, activeRel };
    }),
  setActive: (rel) => set({ activeRel: rel }),
  updateActive: (content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.rel === s.activeRel ? { ...t, content } : t)),
    })),
  isDirty: (rel) => {
    if (!rel) return false;
    const t = get().tabs.find((x) => x.rel === rel);
    return !!t && t.content !== t.savedContent;
  },
  saveActive: async () => {
    const { activeRel, tabs } = get();
    const tab = tabs.find((x) => x.rel === activeRel);
    const vault = useWorkspaceStore.getState().vault;
    if (!tab || !vault) return;
    const res = await api.saveFile(vault, tab.rel, tab.content);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.rel === tab.rel ? { ...t, savedContent: t.content, mtimeMillis: res.mtimeMillis } : t,
      ),
    }));
  },
}));
