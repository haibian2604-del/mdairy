import { create } from "zustand";
import { api, type TreeNode } from "../api";

interface WorkspaceState {
  vault: string | null;
  tree: TreeNode[];
  loading: boolean;
  error: string | null;
  openVault: (path: string) => Promise<void>;
  restoreLastVault: () => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  vault: null,
  tree: [],
  loading: false,
  error: null,
  openVault: async (path) => {
    set({ loading: true, error: null });
    try {
      const vault = await api.setVault(path);
      const tree = await api.listTree(vault);
      set({ vault, tree, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },
  restoreLastVault: async () => {
    const last = await api.getLastVault().catch(() => null);
    if (last) await useWorkspaceStore.getState().openVault(last);
  },
}));
