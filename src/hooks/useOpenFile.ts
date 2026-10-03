import { useCallback } from "react";
import { api } from "../api";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

export function useOpenFile() {
  return useCallback(async (rel: string) => {
    const { tabs, setActive, open } = useTabsStore.getState();
    if (tabs.some((x) => x.rel === rel)) {
      setActive(rel);
      return;
    }
    const vault = useWorkspaceStore.getState().vault;
    if (!vault) return;
    const res = await api.readFile(vault, rel);
    const name = rel.split("/").pop() ?? rel;
    open({ rel, name, content: res.content, mtimeMillis: res.mtimeMillis });
  }, []);
}
