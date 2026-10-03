import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree";
import type { TreeNode } from "../api";

const tree: TreeNode[] = [
  { kind: "dir", name: "日记", rel: "日记", children: [
    { kind: "file", name: "b.md", rel: "日记/b.md" },
  ] },
  { kind: "file", name: "a.md", rel: "a.md" },
];

describe("FileTree", () => {
  it("渲染文件与文件夹，文件夹需展开后才显示子文件", async () => {
    const onOpen = vi.fn();
    render(<FileTree nodes={tree} onOpenFile={onOpen} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.queryByText("b")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("日记"));
    expect(await screen.findByText("b")).toBeInTheDocument();
  });

  it("点击文件回调 rel", async () => {
    const onOpen = vi.fn();
    render(<FileTree nodes={tree} onOpenFile={onOpen} />);
    await userEvent.click(screen.getByText("a"));
    expect(onOpen).toHaveBeenCalledWith("a.md");
  });
});
