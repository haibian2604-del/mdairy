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
  listTree: (vault: string) => invoke<TreeNode[]>("list_tree", { vault }),
  readFile: (vault: string, rel: string) => invoke<FileContent>("read_file", { vault, rel }),
  saveFile: (vault: string, rel: string, content: string, opts?: { encoding?: string; expectedMtimeMillis?: number | null }) =>
    invoke<FileContent>("save_file", {
      vault, rel, content,
      encoding: opts?.encoding ?? null,
      expectedMtimeMillis: opts?.expectedMtimeMillis ?? null,
    }),
  watchVault: (vault: string) => invoke<void>("watch_vault", { vault }),
  // dir = 活动文件所在文件夹（vault 相对路径，null/空 = 全库）
  searchVault: (vault: string, query: string, dir?: string | null) =>
    invoke<SearchHit[]>("search_vault", { vault, query, dir: dir ?? null }),
  createEntry: (vault: string, parentRel: string, name: string, kind: "file" | "dir") =>
    invoke<void>("create_entry", { vault, parentRel, name, kind }),
  renameEntry: (vault: string, rel: string, newName: string) =>
    invoke<void>("rename_entry", { vault, rel, newName }),
  trashEntry: (vault: string, rel: string) => invoke<void>("trash_entry", { vault, rel }),
  // Uint8Array 经 JSON 序列化为数字数组后还原为 Vec<u8>（本地 IPC，图片体积可接受）
  writeAsset: (vault: string, ext: string, data: Uint8Array) =>
    invoke<string>("write_asset", { vault, ext, data: Array.from(data) }),
  // 未命名缓冲区保存到 vault 外：路径来自系统保存对话框（用户显式选择），Rust 侧不做 vault 限制
  saveNewFile: (path: string, content: string) => invoke<number>("save_new_file", { path, content }),
  syncThemeMenu: (mode: string) => invoke<void>("sync_theme_menu", { mode }),
  // null = 边栏隐藏（菜单三项全不勾）
  syncSidebarMenu: (mode: string | null) => invoke<void>("sync_sidebar_menu", { mode }),
};
