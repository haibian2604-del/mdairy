import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    setVault: vi.fn(async (p: string) => `/canon/${p}`),
    getLastVault: vi.fn(async () => "last-vault"),
    listTree: vi.fn(async () => [{ kind: "file", name: "a", rel: "a.md" }]),
    readFile: vi.fn(),
    saveFile: vi.fn(),
  },
}));

import { useWorkspaceStore } from "./workspace";

describe("workspaceStore", () => {
  beforeEach(() => useWorkspaceStore.setState({ vault: null, tree: [], loading: false, error: null }));

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

  it("restoreLastVault 恢复上次工作区", async () => {
    await useWorkspaceStore.getState().restoreLastVault();
    expect(useWorkspaceStore.getState().vault).toBe("/canon/last-vault");
  });
});
