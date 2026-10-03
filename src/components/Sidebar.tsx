import { useEffect, useRef } from "react";
import { FileTree } from "./FileTree";
import { SearchPanel } from "./SearchPanel";
import { useOpenFile } from "../hooks/useOpenFile";
import { pickAndOpenVault } from "../lib/pickVault";
import { useUiStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspace";

export function Sidebar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const tree = useWorkspaceStore((s) => s.tree);
  const onOpenFile = useOpenFile();
  // 页签 state 提升到 ui store（⌘⇧F 与命令面板"搜索笔记"共用 setter）
  const tab = useUiStore((s) => s.sidebarTab);
  const setTab = useUiStore((s) => s.setSidebarTab);
  const searchFocusNonce = useUiStore((s) => s.searchFocusNonce);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const vaultName = vault?.split("/").pop() ?? "";

  // 聚焦信号：⌘⇧F / 命令面板切到搜索页签后聚焦输入框
  // （SearchPanel 本体不改，经容器 DOM 聚焦其 .search-input）
  useEffect(() => {
    if (searchFocusNonce > 0) {
      searchWrapRef.current?.querySelector<HTMLInputElement>(".search-input")?.focus();
    }
  }, [searchFocusNonce]);

  return (
    <>
      <button className="vault-name" title="重新选择文件夹" onClick={() => void pickAndOpenVault()}>
        {vaultName}
      </button>
      <div className="sidebar-tabs" role="tablist" aria-label="侧栏视图">
        <button
          role="tab"
          aria-selected={tab === "files"}
          className="sidebar-tab"
          onClick={() => setTab("files")}
        >
          文件
        </button>
        <button
          role="tab"
          aria-selected={tab === "search"}
          className="sidebar-tab"
          onClick={() => setTab("search")}
        >
          搜索
        </button>
      </div>
      {tab === "files" ? (
        <FileTree nodes={tree} onOpenFile={onOpenFile} />
      ) : (
        <div ref={searchWrapRef}>
          <SearchPanel />
        </div>
      )}
    </>
  );
}
