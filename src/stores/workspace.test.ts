import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    setVault: vi.fn(async (p: string) => `/canon/${p}`),
    listTree: vi.fn(async () => [{ kind: "file", name: "a", rel: "a.md" }]),
    readFile: vi.fn(),
    saveFile: vi.fn(),
  },
}));

import { useWorkspaceStore } from "./workspace";

describe("workspaceStore", () => {
  beforeEach(() => useWorkspaceStore.setState({ vault: null, tree: [], error: null }));

  it("openVault 规范化路径并加载文件树", async () => {
    await useWorkspaceStore.getState().openVault("my-vault");
    const s = useWorkspaceStore.getState();
    expect(s.vault).toBe("/canon/my-vault");
    expect(s.tree).toHaveLength(1);
    expect(s.error).toBeNull();
  });

  it("openVault 失败时写入 error 且不设 vault", async () => {
    const { api } = await import("../api");
    vi.mocked(api.setVault).mockRejectedValueOnce("不是文件夹");
    await useWorkspaceStore.getState().openVault("bad");
    const s = useWorkspaceStore.getState();
    expect(s.vault).toBeNull();
    expect(s.error).toContain("不是文件夹");
  });

  it("refreshTree 刷新文件树，失败保持旧树", async () => {
    const { api } = await import("../api");
    await useWorkspaceStore.getState().openVault("v");
    vi.mocked(api.listTree).mockRejectedValueOnce("io error");
    await useWorkspaceStore.getState().refreshTree();
    expect(useWorkspaceStore.getState().tree).toHaveLength(1); // 保持 openVault 时的树
  });
});
