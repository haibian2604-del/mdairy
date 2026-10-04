import { invoke } from "@tauri-apps/api/core";

export type TreeNode =
  | { kind: "dir"; name: string; rel: string; children: TreeNode[] }
  | { kind: "file"; name: string; rel: string };

export interface FileContent {
  content: string;
  mtimeMillis: number;
  encoding: string;
}

export interface SearchHit {
  rel: string;
  line: number;
  column: number;
  lineText: string;
}

export const api = {
  setVault: (path: string) => invoke<string>("set_vault", { path }),
  getLastVault: () => invoke<string | null>("get_last_vault"),
  listTree: (vault: string) => invoke<TreeNode[]>("list_tree", { vault }),
  readFile: (vault: string, rel: string) => invoke<FileContent>("read_file", { vault, rel }),
  saveFile: (vault: string, rel: string, content: string, opts?: { encoding?: string; expectedMtimeMillis?: number | null }) =>
    invoke<FileContent>("save_file", {
      vault, rel, content,
      encoding: opts?.encoding ?? null,
      expectedMtimeMillis: opts?.expectedMtimeMillis ?? null,
    }),
  watchVault: (vault: string) => invoke<void>("watch_vault", { vault }),
  searchVault: (vault: string, query: string) => invoke<SearchHit[]>("search_vault", { vault, query }),
  createEntry: (vault: string, parentRel: string, name: string, kind: "file" | "dir") =>
    invoke<void>("create_entry", { vault, parentRel, name, kind }),
  renameEntry: (vault: string, rel: string, newName: string) =>
    invoke<void>("rename_entry", { vault, rel, newName }),
  trashEntry: (vault: string, rel: string) => invoke<void>("trash_entry", { vault, rel }),
  // Uint8Array 经 JSON 序列化为数字数组后还原为 Vec<u8>（本地 IPC，图片体积可接受）
  writeAsset: (vault: string, ext: string, data: Uint8Array) =>
    invoke<string>("write_asset", { vault, ext, data: Array.from(data) }),
};
