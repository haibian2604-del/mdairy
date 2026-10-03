import { render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markdownUpdatedCb = { fn: null as null | ((
  ctx: unknown, markdown: string, prev: string,
) => void) };
const mockReplaceAll = vi.fn();
const crepeInstances: any[] = [];

vi.mock("@milkdown/crepe", () => ({
  Crepe: class {
    editor = { action: mockReplaceAll };
    defaultValueOpt = "";
    constructor(opts: any) {
      this.defaultValueOpt = opts?.defaultValue ?? "";
      crepeInstances.push(this);
    }
    async create() {
      return this;
    }
    on(cb: (l: any) => void) {
      cb({ markdownUpdated: (fn: any) => { markdownUpdatedCb.fn = fn; } });
      return this;
    }
    async getMarkdown() { return this.current ?? ""; }
    current = "";
  },
}));
// 适配注记：brief 原稿为 `replaceAll: (md) => mockReplaceAll(md)`（返回 undefined），
// 而 editor.action(replaceAll(md)) 会把 action 的入参（即 replaceAll 的返回值）再次记入 mock，
// 导致 toHaveBeenLastCalledWith 永远只见到 undefined。此处让 mock 返回 md 以保持
// "记录替换内容" 的测试语义（与实包 replaceAll 返回 action 函数再被 action 执行的形态对齐）。
vi.mock("@milkdown/kit/utils", () => ({ replaceAll: (md: string) => { mockReplaceAll(md); return md; } }));

import { MilkdownPane } from "./MilkdownPane";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

function openTab(content: string, rel = "a.md") {
  useWorkspaceStore.setState({ vault: "/canon/v", tree: [] });
  useTabsStore.setState({
    tabs: [{ rel, name: "a", content, savedContent: content, mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false }],
    activeRel: rel,
  });
}

describe("MilkdownPane", () => {
  beforeEach(() => {
    crepeInstances.length = 0;
    mockReplaceAll.mockClear();
    markdownUpdatedCb.fn = null;
    useTabsStore.setState({ tabs: [], activeRel: null, conflict: null, pendingCloseRel: null });
  });

  it("无 active tab 渲染占位", () => {
    render(<MilkdownPane />);
    expect(screen.getByText("从左侧选择一个文件")).toBeInTheDocument();
  });

  it("挂载时以 store 内容创建编辑器", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    expect(crepeInstances).toHaveLength(1);
    expect(crepeInstances[0].defaultValueOpt).toBe("# 你好");
  });

  it("编辑器变更回写 updateActive", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    await act(async () => { markdownUpdatedCb.fn!({}, "# 你好改", "# 你好"); });
    expect(useTabsStore.getState().tabs[0].content).toBe("# 你好改");
    expect(useTabsStore.getState().isDirty("a.md")).toBe(true);
  });

  it("切换标签时以新内容 replaceAll，且不重创建实例", async () => {
    openTab("# 甲", "a.md");
    render(<MilkdownPane />);
    await act(async () => {});
    act(() => { useTabsStore.getState().open({ rel: "b.md", name: "b", content: "# 乙", mtimeMillis: 1, encoding: "UTF-8" }); useTabsStore.getState().setActive("b.md"); });
    await act(async () => {});
    expect(crepeInstances).toHaveLength(1); // 不重建
    expect(mockReplaceAll).toHaveBeenCalledWith("# 乙");
  });

  it("外部重载（content 变但 rel 不变）同样 replaceAll", async () => {
    openTab("# 旧", "a.md");
    render(<MilkdownPane />);
    await act(async () => {});
    act(() => { useTabsStore.setState({ tabs: [{ rel: "a.md", name: "a", content: "# 磁盘新内容", savedContent: "# 磁盘新内容", mtimeMillis: 99, encoding: "UTF-8", overrideExternal: false }] }); });
    await act(async () => {});
    expect(mockReplaceAll).toHaveBeenLastCalledWith("# 磁盘新内容");
  });

  it("回写引发的 content 变化不再触发 replaceAll（无死循环）", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    mockReplaceAll.mockClear();
    await act(async () => { markdownUpdatedCb.fn!({}, "# 你好改", "# 你好"); });
    await act(async () => {});
    expect(mockReplaceAll).not.toHaveBeenCalled();
  });
});
