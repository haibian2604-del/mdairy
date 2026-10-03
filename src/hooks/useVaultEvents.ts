import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

interface VaultChangedPayload {
  paths: string[];
}

export function useVaultEvents(vault: string | null) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string[]>([]);

  useEffect(() => {
    if (!vault) return;
    void api.watchVault(vault).catch(() => {});
    const unlisten = listen<VaultChangedPayload>("vault-changed", (e) => {
      pending.current = pending.current.concat(e.payload.paths);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const paths = Array.from(new Set(pending.current));
        pending.current = [];
        void useWorkspaceStore.getState().refreshTree();
        void useTabsStore.getState().handleExternalChanges(paths);
      }, 200);
    });
    return () => {
      void unlisten.then((f) => f());
      if (timer.current) clearTimeout(timer.current);
    };
  }, [vault]);
}
