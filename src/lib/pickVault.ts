import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "../stores/workspace";

/** 弹出系统文件夹选择框，选中后打开 vault（空状态/侧栏/命令面板共用） */
export async function pickAndOpenVault(): Promise<void> {
  const path = await pickFolder({ directory: true });
  if (path) await useWorkspaceStore.getState().openVault(path);
}
