import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  api: {
    setVault: vi.fn(async (p: string) => p),
    takeOpenedFiles: vi.fn(async () => []),
    listTree: vi.fn(async () => []),
    readFile: vi.fn(),
    saveFile: vi.fn(),
    saveNewFile: vi.fn(),
    syncThemeMenu: vi.fn(async () => {}),
    syncSidebarMenu: vi.fn(async () => {}),
    watchVault: vi.fn(async () => {}),
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
// 启动即开未命名缓冲区 → 会挂载编辑器；App 层测试不关心 Milkdown 内部，打桩
vi.mock("./components/MilkdownPane", () => ({ MilkdownPane: () => <div data-testid="milkdown-stub" /> }));

import App from "./App";
import { api } from "./api";
import { useTabsStore } from "./stores/tabs";
import { useWorkspaceStore } from "./stores/workspace";

describe("App", () => {
  beforeEach(() => {
    vi.mocked(api.takeOpenedFiles).mockResolvedValue([]);
    useTabsStore.setState({ tabs: [], activeRel: null, launchHandled: false });
    useWorkspaceStore.setState({ vault: null, tree: [], error: null });
  });

  it("无 vault 时显示空状态", async () => {
    render(<App />);
    expect(await screen.findByText("打开一个文件夹，开始笔记")).toBeInTheDocument();
  });

  it("纯启动创建一个未命名缓冲区标签", async () => {
    render(<App />);
    await waitFor(() => expect(document.querySelector(".tab-title")?.textContent).toBe("未命名"));
    expect(useTabsStore.getState().tabs[0].untitled).toBe(true);
  });

  it("系统带文件打开时只开该文件，不建未命名", async () => {
    vi.mocked(api.takeOpenedFiles).mockResolvedValue(["/v/notes/file.md"]);
    vi.mocked(api.readFile).mockResolvedValue({ content: "# hi", mtimeMillis: 1, encoding: "UTF-8" });
    render(<App />);
    expect(await screen.findByText("file")).toBeInTheDocument();
    expect(useTabsStore.getState().tabs.map((t) => t.rel)).toEqual(["file.md"]);
    expect(useTabsStore.getState().tabs.some((t) => t.untitled)).toBe(false);
  });

  it("有 vault 时显示侧栏", async () => {
    useWorkspaceStore.setState({ vault: "/canon/my-vault", tree: [] });
    render(<App />);
    expect(await screen.findByText("my-vault")).toBeInTheDocument();
  });
});
