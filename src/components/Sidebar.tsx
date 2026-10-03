import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { FileTree } from "./FileTree";
import { useOpenFile } from "../hooks/useOpenFile";
import { useWorkspaceStore } from "../stores/workspace";

export function Sidebar() {
  const vault = useWorkspaceStore((s) => s.vault);
  const tree = useWorkspaceStore((s) => s.tree);
  const openVault = useWorkspaceStore((s) => s.openVault);
  const onOpenFile = useOpenFile();
  const vaultName = vault?.split("/").pop() ?? "";

  const repick = async () => {
    const path = await pickFolder({ directory: true });
    if (path) await openVault(path);
  };

  return (
    <>
      <button className="vault-name" title="重新选择文件夹" onClick={repick}>
        {vaultName}
      </button>
      <FileTree nodes={tree} onOpenFile={onOpenFile} />
    </>
  );
}
