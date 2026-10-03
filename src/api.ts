import { invoke } from "@tauri-apps/api/core";

export type TreeNode =
  | { kind: "dir"; name: string; rel: string; children: TreeNode[] }
  | { kind: "file"; name: string; rel: string };

export interface FileContent {
  content: string;
  mtimeMillis: number;
}

export const api = {
  setVault: (path: string) => invoke<string>("set_vault", { path }),
  getLastVault: () => invoke<string | null>("get_last_vault"),
  listTree: (vault: string) => invoke<TreeNode[]>("list_tree", { vault }),
  readFile: (vault: string, rel: string) => invoke<FileContent>("read_file", { vault, rel }),
  saveFile: (vault: string, rel: string, content: string) =>
    invoke<FileContent>("save_file", { vault, rel, content }),
};
