import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runSpy = vi.fn();

vi.mock("../lib/commands", () => ({
  useCommands: () => [
    { id: "toggle-outline", label: "切换大纲", run: runSpy },
  ],
}));
vi.mock("../hooks/useOpenFile", () => ({ useOpenFile: () => vi.fn() }));
// zustand v5 的 store 实例无法在 vi.mock 工厂里 Object.assign 挂 getState，
// 故用标准形态：工厂内真实 create() 建 store，tree 直接 seed——
// 语义保持"palette 能拿到扁平文件列表"。
vi.mock("../stores/workspace", async () => {
  const { create } = await import("zustand");
  const useWorkspaceStore = create(() => ({
    vault: "/tmp/vault",
    tree: [{ kind: "file", name: "日记.md", rel: "日记.md" }],
    error: null,
  }));
  return { useWorkspaceStore };
});

import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  beforeEach(() => runSpy.mockClear());

  it("all 模式展示命令与文件，输入过滤", () => {
    render(<CommandPalette mode="all" onClose={() => {}} />);
    expect(screen.getByPlaceholderText("输入命令或文件名…")).toBeInTheDocument();
    expect(screen.getByText("切换大纲")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("输入命令或文件名…"), { target: { value: "大纲" } });
    expect(screen.queryByText("日记")).not.toBeInTheDocument();
    expect(screen.getByText("切换大纲")).toBeInTheDocument();
  });

  it("回车执行选中命令并关闭", () => {
    const onClose = vi.fn();
    render(<CommandPalette mode="all" onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText("输入命令或文件名…"), { key: "Enter" });
    expect(runSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("esc 关闭", () => {
    const onClose = vi.fn();
    render(<CommandPalette mode="files" onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText("输入命令或文件名…"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
