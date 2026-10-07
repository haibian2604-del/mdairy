import { create } from "zustand";
import { open as pickFolder, save as pickSavePath } from "@tauri-apps/plugin-dialog";
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
  /** Typora 式未命名缓冲区：不落盘，⌘S 弹保存对话框后转正为真实文件（或 vault 外落盘后关闭） */
  untitled?: boolean;
}

export interface ExternalConflict {
  rel: string;
  reason: "modified" | "deleted";
}

/** 搜索命中跳转：打开/聚焦目标文件后待 MilkdownPane 消费的定位请求 */
export interface PendingJump {
  rel: string;
  line: number;
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
  pendingJump: PendingJump | null;
  /** 未命名缓冲区自增序号（rel 唯一性保证，与展示名无关） */
  untitledSeq: number;
  /** 启动引导已处理：纯启动 → 建未命名；系统带文件打开 → 只开文件。StrictMode 双挂载幂等标记 */
  launchHandled: boolean;
  open: (t: OpenArgs) => void;
  close: (rel: string) => void;
  newUntitled: () => void;
  /** 磁盘改名（内容未变）：只更新 rel/name（含目录改名时迁移后代标签），保持 content/savedContent/mtimeMillis */
  renameTab: (oldRel: string, newRel: string) => void;
  setActive: (rel: string) => void;
  updateActive: (content: string) => void;
  isDirty: (rel: string | null) => boolean;
  /** true=已保存/无需保存；false=取消或冲突（标签保持原状） */
  saveActive: () => Promise<boolean>;
  reloadConflict: () => Promise<void>;
  keepConflict: () => void;
  dismissConflict: () => void;
  requestClose: (rel: string) => void;
  confirmClose: () => Promise<void>;
  discardClose: () => void;
  cancelClose: () => void;
  handleExternalChanges: (paths: string[]) => Promise<void>;
  requestJump: (rel: string, line: number) => Promise<void>;
  consumeJump: () => void;
  /** 已打开则聚焦，未打开先读文件再开；文件树/命令面板/requestJump 共用 */
  openOrFocus: (rel: string) => Promise<boolean>;
  saveUntitled: (tab: Tab) => Promise<boolean>;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeRel: null,
  conflict: null,
  pendingCloseRel: null,
  pendingJump: null,
  untitledSeq: 0,
  launchHandled: false,
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
  newUntitled: () =>
    set((s) => {
      const seq = s.untitledSeq + 1;
      const count = s.tabs.filter((t) => t.untitled).length;
      const rel = `~untitled-${seq}`;
      return {
        untitledSeq: seq,
        tabs: [
          ...s.tabs,
          {
            rel,
            name: count === 0 ? "未命名" : `未命名 ${count + 1}`,
            content: "",
            savedContent: "",
            mtimeMillis: 0,
            encoding: "UTF-8",
            overrideExternal: false,
            untitled: true,
          },
        ],
        activeRel: rel,
      };
    }),
  renameTab: (oldRel, newRel) =>
    set((s) => {
      // 目录改名时后代文件标签一并迁移，避免悬空旧 rel
      const moved = (rel: string) =>
        rel === oldRel
          ? newRel
          : rel.startsWith(`${oldRel}/`)
            ? `${newRel}${rel.slice(oldRel.length)}`
            : null;
      return {
        tabs: s.tabs.map((t) => {
          const rel = moved(t.rel);
          return rel
            ? { ...t, rel, name: (rel.split("/").pop() ?? rel).replace(/\.md$/i, "") }
            : t;
        }),
        activeRel: (s.activeRel && moved(s.activeRel)) ?? s.activeRel,
      };
    }),
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
    if (!tab) return true;
    if (tab.untitled) return get().saveUntitled(tab);
    const vault = useWorkspaceStore.getState().vault;
    if (!vault) return false;
    // 快照语义：记录发出请求时的内容，成功后以此为已保存基线
    const snapshot = tab.content;
    const skipMtimeCheck = tab.overrideExternal;
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
        return false;
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
    return true;
  },
  /** 未命名缓冲区保存：无 vault 先选文件夹；系统保存对话框（默认 vault 根/未命名.md）。
      vault 内 → saveFile 转正为真实标签；vault 外 → save_new_file 落盘后关闭标签
      （watcher/重载只覆盖 vault 内，留标签会成为无法重载的悬空标签）。 */
  saveUntitled: async (tab) => {
    let vault = useWorkspaceStore.getState().vault;
    if (!vault) {
      const dir = await pickFolder({ directory: true });
      if (!dir) return false;
      await useWorkspaceStore.getState().openVault(dir);
      vault = useWorkspaceStore.getState().vault;
      if (!vault) return false;
    }
    const path = await pickSavePath({
      defaultPath: `${vault}/未命名.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return false;
    if (path.startsWith(`${vault}/`)) {
      const rel = path.slice(vault.length + 1);
      const res = await api.saveFile(vault, rel, tab.content);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.rel === tab.rel
            ? {
                ...t,
                rel,
                name: (rel.split("/").pop() ?? rel).replace(/\.md$/i, ""),
                untitled: undefined,
                savedContent: t.content,
                mtimeMillis: res.mtimeMillis,
                encoding: res.encoding,
              }
            : t,
        ),
        activeRel: s.activeRel === tab.rel ? rel : s.activeRel,
      }));
    } else {
      await api.saveNewFile(path, tab.content);
      get().close(tab.rel);
    }
    return true;
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
      // 保存被取消（未命名保存对话框取消）或触发冲突 → 标签保持打开
      if (!(await get().saveActive())) {
        set({ pendingCloseRel: null });
        return;
      }
    } catch {
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
  /** 已打开则聚焦；未打开先读文件再开（vault 缺失/读取失败返回 false）。
      文件树、命令面板、requestJump 共用这一条打开通路。 */
  openOrFocus: async (rel) => {
    if (!get().tabs.some((x) => x.rel === rel)) {
      const vault = useWorkspaceStore.getState().vault;
      if (!vault) return false;
      let res;
      try {
        res = await api.readFile(vault, rel);
      } catch {
        return false; // 文件已不存在等 → 不打开
      }
      get().open({
        rel,
        name: rel.split("/").pop() ?? rel,
        content: res.content,
        mtimeMillis: res.mtimeMillis,
        encoding: res.encoding,
      });
    } else {
      get().setActive(rel);
    }
    return true;
  },
  // 打开（未开时先读）或聚焦目标文件，然后记下待消费的跳转定位；
  // MilkdownPane 消费后 consumeJump 置 null
  requestJump: async (rel, line) => {
    if (!(await get().openOrFocus(rel))) return;
    set({ pendingJump: { rel, line } });
  },
  consumeJump: () => set({ pendingJump: null }),
}));
