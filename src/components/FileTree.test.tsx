import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree";
import type { TreeNode } from "../api";

vi.mock("../api", () => ({
  api: {
    createEntry: vi.fn(async () => {}),
    renameEntry: vi.fn(async () => {}),
    trashEntry: vi.fn(async () => {}),
    listTree: vi.fn(async () => []),
  },
}));

import { api } from "../api";
import { useWorkspaceStore } from "../stores/workspace";

const tree: TreeNode[] = [
  { kind: "dir", name: "日记", rel: "日记", children: [
    { kind: "file", name: "b.md", rel: "日记/b.md" },
  ] },
  { kind: "file", name: "a.md", rel: "a.md" },
];

describe("FileTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ vault: "/canon/v", tree: [] });
  });

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

  it("⋯ 菜单：文件夹行含新建项，文件行只有重命名/删除", async () => {
    render(<FileTree nodes={tree} onOpenFile={vi.fn()} />);
    const moreButtons = screen.getAllByLabelText("更多操作");

    await userEvent.click(moreButtons[0]); // 文件夹行
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("新建文件");
    expect(menu).toHaveTextContent("新建文件夹");
    expect(menu).toHaveTextContent("重命名");
    expect(menu).toHaveTextContent("删除");

    await userEvent.click(document.querySelector(".menu-overlay")!); // 点外部关闭
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(moreButtons[1]); // 文件行
    const fileMenu = screen.getByRole("menu");
    expect(fileMenu).not.toHaveTextContent("新建文件");
    expect(fileMenu).toHaveTextContent("重命名");
    expect(fileMenu).toHaveTextContent("删除");
  });

  it("新建文件：内联输入回车调用 createEntry 并刷新树", async () => {
    render(<FileTree nodes={tree} onOpenFile={vi.fn()} />);
    await userEvent.click(screen.getAllByLabelText("更多操作")[0]);
    await userEvent.click(screen.getByRole("menuitem", { name: "新建文件" }));
    const input = screen.getByPlaceholderText("新建笔记.md");
    await userEvent.type(input, "c.md");
    await userEvent.type(input, "{Enter}");
    expect(api.createEntry).toHaveBeenCalledWith("/canon/v", "日记", "c.md", "file");
    expect(api.listTree).toHaveBeenCalled(); // refreshTree
    expect(screen.queryByPlaceholderText("新建笔记.md")).not.toBeInTheDocument();
  });
});
