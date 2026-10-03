import { create } from "zustand";
import { api, type TreeNode } from "../api";

interface WorkspaceState {
  vault: string | null;
  tree: TreeNode[];
  error: string | null;
  openVault: (path: string) => Promise<void>;
  restoreLastVault: () => Promise<void>;
  refreshTree: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  vault: null,
  tree: [],
  error: null,
  openVault: async (path) => {
    set({ error: null });
    try {
      const vault = await api.setVault(path);
      const tree = await api.listTree(vault);
      set({ vault, tree });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  restoreLastVault: async () => {
    const last = await api.getLastVault().catch(() => null);
    if (last) await useWorkspaceStore.getState().openVault(last);
  },
  refreshTree: async () => {
    const vault = get().vault;
    if (!vault) return;
    try {
      set({ tree: await api.listTree(vault) });
    } catch {
      /* 保持旧树 */
    }
  },
}));
