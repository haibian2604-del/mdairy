import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { pickAndOpenFile } from "./pickVault";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("../api", () => ({
  api: {
    setVault: vi.fn(async (p: string) => p),
    listTree: vi.fn(async () => []),
    readFile: vi.fn(async () => ({ content: "# hi", mtimeMillis: 1, encoding: "UTF-8" })),
  },
}));

describe("pickAndOpenFile", () => {
  beforeEach(() => {
    vi.mocked(open).mockReset();
    useTabsStore.setState({ tabs: [], activeRel: null });
    useWorkspaceStore.setState({ vault: null, tree: [], error: null });
  });

  it("vault 内文件直接打开为标签，不切换 vault", async () => {
    useWorkspaceStore.setState({ vault: "/v", tree: [] });
    vi.mocked(open).mockResolvedValue("/v/日记/a.md");
    await pickAndOpenFile();
    expect(useTabsStore.getState().tabs.map((t) => t.rel)).toEqual(["日记/a.md"]);
    expect(api.setVault).not.toHaveBeenCalled();
  });

  it("vault 外文件以其所在目录为 vault 打开", async () => {
    useWorkspaceStore.setState({ vault: "/v", tree: [] });
    vi.mocked(open).mockResolvedValue("/other/b.md");
    await pickAndOpenFile();
    expect(api.setVault).toHaveBeenCalledWith("/other");
    expect(useWorkspaceStore.getState().vault).toBe("/other");
    expect(useTabsStore.getState().tabs.map((t) => t.rel)).toEqual(["b.md"]);
  });

  it("取消选择则不动任何状态", async () => {
    useWorkspaceStore.setState({ vault: "/v", tree: [] });
    vi.mocked(open).mockResolvedValue(null);
    await pickAndOpenFile();
    expect(useTabsStore.getState().tabs).toEqual([]);
    expect(api.setVault).not.toHaveBeenCalled();
  });
});
