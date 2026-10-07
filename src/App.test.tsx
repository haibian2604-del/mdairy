import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  api: {
    setVault: vi.fn(),
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
import { useTabsStore } from "./stores/tabs";
import { useWorkspaceStore } from "./stores/workspace";

describe("App", () => {
  it("未打开 vault 时显示空状态", async () => {
    render(<App />);
    expect(await screen.findByText("打开一个文件夹，开始笔记")).toBeInTheDocument();
  });

  it("启动即创建一个未命名缓冲区标签", () => {
    render(<App />);
    expect(document.querySelector(".tab-title")?.textContent).toBe("未命名");
    expect(useTabsStore.getState().tabs[0].untitled).toBe(true);
  });

  it("有 vault 时显示侧栏", () => {
    useWorkspaceStore.setState({ vault: "/canon/my-vault", tree: [] });
    render(<App />);
    expect(screen.getByText("my-vault")).toBeInTheDocument();
  });
});
