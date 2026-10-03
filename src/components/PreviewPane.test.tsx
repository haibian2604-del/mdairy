import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((p: string) => `asset://localhost/${encodeURIComponent(p)}`),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => {}) }));
vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: "<svg>ok</svg>" })) },
}));

import { PreviewPane } from "./PreviewPane";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";
import { openUrl } from "@tauri-apps/plugin-opener";

function setActive(content: string, rel = "a.md") {
  useWorkspaceStore.setState({ vault: "/canon/v", tree: [] });
  useTabsStore.setState({
    tabs: [{ rel, name: "a", content, savedContent: content, mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false }],
    activeRel: rel,
  });
}

describe("PreviewPane", () => {
  beforeEach(() => useTabsStore.setState({ tabs: [], activeRel: null, conflict: null, pendingCloseRel: null }));

  it("无 active tab 渲染占位", () => {
    render(<PreviewPane />);
    expect(screen.getByText("当前标签没有内容")).toBeInTheDocument();
  });

  it("渲染 markdown 为 HTML（含标题）", () => {
    setActive("# 你好\n\n段落");
    render(<PreviewPane />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("你好");
  });

  it("图片 src 以 vault 根为基准重写为 asset URL", () => {
    setActive("![图](_assets/p.png)");
    render(<PreviewPane />);
    const img = screen.getByRole("img") as HTMLImageElement;
    // jsdom 对非特殊 scheme 原样保留（asset://localhost/...），断言重写确实发生
    expect(img.src).toMatch(/^asset:/);
    expect(decodeURIComponent(img.src)).toContain("/canon/v/_assets/p.png");
  });

  it("http 外链点击走 openUrl 且不跳转", async () => {
    setActive("[官网](https://example.com)");
    render(<PreviewPane />);
    fireEvent.click(screen.getByText("官网"));
    expect(openUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("相对链接不调用 openUrl", () => {
    setActive("[内链](b.md)");
    render(<PreviewPane />);
    fireEvent.click(screen.getByText("内链"));
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("mermaid 占位被懒渲染替换为 svg", async () => {
    setActive("```mermaid\ngraph TD; A-->B;\n```");
    const { container } = render(<PreviewPane />);
    const placeholder = container.querySelector(".mermaid-block");
    expect(placeholder).not.toBeNull();
    // svg 容器无 img role，以"占位内出现 svg 元素"为语义
    await waitFor(() => expect(placeholder?.querySelector("svg")).not.toBeNull());
  });
});
