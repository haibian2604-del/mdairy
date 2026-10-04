import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    setVault: vi.fn(),
    getLastVault: vi.fn(),
    listTree: vi.fn(),
    readFile: vi.fn(),
    saveFile: vi.fn(),
    searchVault: vi.fn(),
  },
}));

import { useSearchStore } from "./search";
import { useWorkspaceStore } from "./workspace";
import { byteColumnToCharIndex } from "./search";
import { api } from "../api";

describe("searchStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSearchStore.setState({ query: "", hits: [], searching: false, scope: null });
    useWorkspaceStore.setState({ vault: "/canon/v", tree: [] });
    vi.mocked(api.searchVault).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("setQuery 防抖后搜索并写入 hits", async () => {
    vi.mocked(api.searchVault).mockResolvedValue([
      { rel: "a.md", line: 1, column: 0, lineText: "苹果" },
    ]);
    useSearchStore.getState().setQuery("苹果");
    expect(api.searchVault).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchVault).toHaveBeenCalledWith("/canon/v", "苹果", null);
    expect(useSearchStore.getState().hits).toHaveLength(1);
  });

  it("范围 = 活动文件所在文件夹；未命名/无活动文件 = 全库", async () => {
    vi.mocked(api.searchVault).mockResolvedValue([]);
    const { useTabsStore } = await import("./tabs");
    useTabsStore.setState({
      tabs: [{ rel: "日记/2026/a.md", name: "a", content: "", savedContent: "", mtimeMillis: 1, encoding: "UTF-8", overrideExternal: false }],
      activeRel: "日记/2026/a.md",
    });
    useSearchStore.getState().setQuery("苹果");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchVault).toHaveBeenLastCalledWith("/canon/v", "苹果", "日记/2026");

    useTabsStore.setState({
      tabs: [{ rel: "~untitled-1", name: "未命名", content: "", savedContent: "", mtimeMillis: 0, encoding: "UTF-8", overrideExternal: false, untitled: true }],
      activeRel: "~untitled-1",
    });
    useSearchStore.getState().setQuery("苹果");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchVault).toHaveBeenLastCalledWith("/canon/v", "苹果", null);
  });

  it("乱序响应以最后一次 query 为准", async () => {
    let r1: (v: any) => void = () => {};
    vi.mocked(api.searchVault).mockResolvedValue([]);
    vi.mocked(api.searchVault).mockImplementationOnce(() => new Promise((r) => (r1 = r)));
    useSearchStore.getState().setQuery("第一");
    await vi.advanceTimersByTimeAsync(300);
    useSearchStore.getState().setQuery("第二");
    await vi.advanceTimersByTimeAsync(300);
    r1([{ rel: "old.md", line: 0, column: 0, lineText: "过期响应" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(useSearchStore.getState().hits).toEqual([]); // 过期响应被丢弃
  });

  it("空 query 清空结果且不发请求", async () => {
    useSearchStore.setState({ hits: [{ rel: "a.md", line: 0, column: 0, lineText: "x" }] });
    useSearchStore.getState().setQuery("  ");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchVault).not.toHaveBeenCalled();
    expect(useSearchStore.getState().hits).toEqual([]);
  });

  it("column 是 UTF-8 字节偏移，需换算为字符索引", () => {
    // 苹=3字节 果=3字节 空格=1字节 → "Apple" 的 A 起始于第 7 字节 = 第 3 个字符
    expect(byteColumnToCharIndex("苹果 Apple", 7)).toBe(3);
    // ASCII 内字节偏移与字符索引一致
    expect(byteColumnToCharIndex("hello world", 6)).toBe(6);
    // 超出行尾时钳制到行长度
    expect(byteColumnToCharIndex("苹果", 99)).toBe(2);
  });
});
