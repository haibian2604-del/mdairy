import { create } from "zustand";
import { api } from "../api";
import { useWorkspaceStore } from "./workspace";

export interface Tab {
  rel: string;
  name: string;
  content: string;
  savedContent: string;
  mtimeMillis: number;
  encoding: string;
  overrideExternal: boolean;
}

export interface ExternalConflict {
  rel: string;
  reason: "modified" | "deleted";
}

interface OpenArgs {
  rel: string;
  name: string;
  content: string;
  mtimeMillis: number;
  encoding: string;
}

interface TabsState {
  tabs: Tab[];
  activeRel: string | null;
  conflict: ExternalConflict | null;
  pendingCloseRel: string | null;
  open: (t: OpenArgs) => void;
  close: (rel: string) => void;
  setActive: (rel: string) => void;
  updateActive: (content: string) => void;
  isDirty: (rel: string | null) => boolean;
  saveActive: (force?: boolean) => Promise<void>;
  reloadConflict: () => Promise<void>;
  keepConflict: () => void;
  dismissConflict: () => void;
  requestClose: (rel: string) => void;
  confirmClose: () => Promise<void>;
  discardClose: () => void;
  cancelClose: () => void;
  handleExternalChanges: (paths: string[]) => Promise<void>;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeRel: null,
  conflict: null,
  pendingCloseRel: null,
  open: (t) =>
    set((s) => {
      if (s.tabs.some((x) => x.rel === t.rel)) return { activeRel: t.rel };
      const name = t.name.replace(/\.md$/i, "");
      return {
        tabs: [...s.tabs, { ...t, name, savedContent: t.content, overrideExternal: false }],
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
  saveActive: async (force = false) => {
    const { activeRel, tabs } = get();
    const tab = tabs.find((x) => x.rel === activeRel);
    const vault = useWorkspaceStore.getState().vault;
    if (!tab || !vault) return;
    // 快照语义：记录发出请求时的内容，成功后以此为已保存基线
    const snapshot = tab.content;
    const skipMtimeCheck = force || tab.overrideExternal;
    let res;
    try {
      res = await api.saveFile(vault, tab.rel, tab.content, {
        encoding: tab.encoding,
        // 跳过校验时显式传 null（api 层 null 即不做 mtime 比对）
        expectedMtimeMillis: skipMtimeCheck ? null : tab.mtimeMillis,
      });
    } catch (e) {
      if (String(e).startsWith("外部修改冲突")) {
        set({ conflict: { rel: tab.rel, reason: "modified" } });
        return;
      }
      throw e;
    }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.rel === tab.rel
          ? {
              ...t,
              savedContent: snapshot,
              mtimeMillis: res.mtimeMillis,
              encoding: res.encoding,
              overrideExternal: false,
            }
          : t,
      ),
    }));
  },
  reloadConflict: async () => {
    const conflict = get().conflict;
    if (!conflict) return;
    const vault = useWorkspaceStore.getState().vault;
    const tab = get().tabs.find((x) => x.rel === conflict.rel);
    try {
      if (!vault || !tab) throw new Error("no tab");
      const res = await api.readFile(vault, conflict.rel);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.rel === conflict.rel
            ? {
                ...t,
                content: res.content,
                savedContent: res.content,
                mtimeMillis: res.mtimeMillis,
                encoding: res.encoding,
                overrideExternal: false,
              }
            : t,
        ),
        conflict: null,
      }));
    } catch {
      // 重新加载失败（文件已删）→ 关闭该标签
      get().close(conflict.rel);
      set({ conflict: null });
    }
  },
  keepConflict: () =>
    set((s) => {
      // 以冲突 rel 为准；无冲突时（直接对当前编辑的 tab 保持）退回 activeRel
      const rel = s.conflict?.rel ?? s.activeRel;
      return {
        tabs: s.tabs.map((t) => (t.rel === rel ? { ...t, overrideExternal: true } : t)),
        conflict: null,
      };
    }),
  dismissConflict: () => set({ conflict: null }),
  requestClose: (rel) => {
    if (!get().isDirty(rel)) {
      get().close(rel);
      return;
    }
    set({ pendingCloseRel: rel });
  },
  confirmClose: async () => {
    const rel = get().pendingCloseRel;
    if (!rel) return;
    get().setActive(rel);
    try {
      await get().saveActive();
    } catch {
      set({ pendingCloseRel: null });
      return;
    }
    // 保存触发了冲突（或已有冲突）→ 标签保持打开
    if (get().conflict?.rel === rel) {
      set({ pendingCloseRel: null });
      return;
    }
    get().close(rel);
    set({ pendingCloseRel: null });
  },
  discardClose: () => {
    const rel = get().pendingCloseRel;
    if (rel) get().close(rel);
    set({ pendingCloseRel: null });
  },
  cancelClose: () => set({ pendingCloseRel: null }),
  handleExternalChanges: async (paths) => {
    const vault = useWorkspaceStore.getState().vault;
    if (!vault) return;
    const pathSet = new Set(paths);
    for (const tab of get().tabs) {
      if (!pathSet.has(tab.rel)) continue;
      // 已处于冲突弹窗状态的 rel 跳过，不覆盖已有状态
      if (get().conflict?.rel === tab.rel) continue;
      try {
        const res = await api.readFile(vault, tab.rel);
        if (res.mtimeMillis === tab.mtimeMillis) continue; // mtime 未变，忽略
        if (get().isDirty(tab.rel)) {
          set({ conflict: { rel: tab.rel, reason: "modified" } });
        } else {
          // 干净：静默重载
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.rel === tab.rel
                ? {
                    ...t,
                    content: res.content,
                    savedContent: res.content,
                    mtimeMillis: res.mtimeMillis,
                    encoding: res.encoding,
                    overrideExternal: false,
                  }
                : t,
            ),
          }));
        }
      } catch {
        if (get().isDirty(tab.rel)) {
          set({ conflict: { rel: tab.rel, reason: "deleted" } });
        } else {
          // 干净：文件已删，自动关闭
          get().close(tab.rel);
        }
      }
    }
  },
}));
