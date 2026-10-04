import { useEffect, useRef } from "react";
import { FileTree } from "./FileTree";
import { OutlinePanel } from "./OutlinePanel";
import { SearchPanel } from "./SearchPanel";
import { pickAndOpenVault } from "../lib/pickVault";
import { useTabsStore } from "../stores/tabs";
import { useUiStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspace";

/** 侧栏内容：视图选择已移至 macOS 菜单栏 Sidebar（文件/搜索/大纲），此处只按 store 状态渲染 */
export function Sidebar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const tree = useWorkspaceStore((s) => s.tree);
  const onOpenFile = (rel: string) => void useTabsStore.getState().openOrFocus(rel);
  const tab = useUiStore((s) => s.sidebarTab);
  const searchFocusNonce = useUiStore((s) => s.searchFocusNonce);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const vaultName = vault?.split("/").pop() ?? "";

  // 聚焦信号：⌘⇧F / 命令面板切到搜索视图后聚焦输入框
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
      {tab === "files" ? (
        <FileTree nodes={tree} onOpenFile={onOpenFile} />
      ) : tab === "search" ? (
        <div ref={searchWrapRef}>
          <SearchPanel />
        </div>
      ) : (
        <OutlinePanel />
      )}
    </>
  );
}
