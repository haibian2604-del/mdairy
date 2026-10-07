import { open } from "@tauri-apps/plugin-dialog";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

/** 弹出系统文件夹选择框，选中后打开 vault（空状态/侧栏/命令面板共用） */
export async function pickAndOpenVault(): Promise<void> {
  const path = await open({ directory: true });
  if (path) await useWorkspaceStore.getState().openVault(path);
}

/** 弹出系统文件选择框选取 .md 打开为标签（菜单栏 File > 打开文件，⌘O 同效给打开文件夹）：
    在当前 vault 内直接打开；不在（含未打开 vault）→ 以所选文件所在目录为 vault 打开后再开文件。 */
export async function pickAndOpenFile(): Promise<void> {
  const path = await open({ multiple: false, filters: [{ name: "Markdown", extensions: ["md"] }] });
  if (!path) return;
  const vault = useWorkspaceStore.getState().vault;
  if (vault && path.startsWith(`${vault}/`)) {
    await useTabsStore.getState().openOrFocus(path.slice(vault.length + 1));
    return;
  }
  const dir = path.slice(0, path.lastIndexOf("/"));
  await useWorkspaceStore.getState().openVault(dir);
  await useTabsStore.getState().openOrFocus(path.slice(dir.length + 1));
}
