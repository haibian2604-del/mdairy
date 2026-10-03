import { create } from "zustand";
import { api, type SearchHit } from "../api";
import { useWorkspaceStore } from "./workspace";

interface SearchState {
  query: string;
  hits: SearchHit[];
  searching: boolean;
  setQuery: (q: string) => void;
}

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Rust 侧 SearchHit.column 是 UTF-8 字节偏移（str::find 返回字节下标），
 * 而 JS 字符串切片按码点计——中文等多字节字符直接当字符索引用会错位，
 * 必须先换算成字符（码点）索引。
 */
export function byteColumnToCharIndex(lineText: string, byteColumn: number): number {
  const chars = Array.from(lineText);
  let bytes = 0;
  for (let i = 0; i < chars.length; i++) {
    if (bytes >= byteColumn) return i;
    const cp = chars[i].codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return chars.length;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  hits: [],
  searching: false,
  setQuery: (q) => {
    set({ query: q });
    if (timer !== null) clearTimeout(timer);
    const trimmed = q.trim();
    if (!trimmed) {
      seq += 1; // 使在途请求过期，防止迟到响应回填
      set({ hits: [], searching: false });
      return;
    }
    const mySeq = (seq += 1);
    timer = setTimeout(() => {
      if (seq !== mySeq) return;
      const vault = useWorkspaceStore.getState().vault;
      if (!vault) {
        set({ hits: [], searching: false });
        return;
      }
      set({ searching: true });
      api
        .searchVault(vault, trimmed)
        .then((hits) => {
          if (seq !== mySeq) return; // 乱序响应：以最后一次 query 为准
          set({ hits, searching: false });
        })
        .catch(() => {
          if (seq !== mySeq) return;
          set({ hits: [], searching: false });
        });
    }, 250);
  },
}));
