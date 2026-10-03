import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  api: {
    setVault: vi.fn(),
    getLastVault: vi.fn(async () => null),
    listTree: vi.fn(async () => []),
    readFile: vi.fn(),
    saveFile: vi.fn(),
    watchVault: vi.fn(async () => {}),
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

import App from "./App";
import { useWorkspaceStore } from "./stores/workspace";

describe("App", () => {
  it("未打开 vault 时显示空状态", async () => {
    render(<App />);
    expect(await screen.findByText("打开一个文件夹，开始笔记")).toBeInTheDocument();
  });

  it("有 vault 时显示侧栏", () => {
    useWorkspaceStore.setState({ vault: "/canon/my-vault", tree: [] });
    render(<App />);
    expect(screen.getByText("my-vault")).toBeInTheDocument();
  });
});
