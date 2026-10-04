import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileContent } from "../api";

vi.mock("../api", () => ({
  api: {
    saveFile: vi.fn(async (_v: string, _r: string, c: string) => ({ content: c, mtimeMillis: 42, encoding: "UTF-8" })),
    readFile: vi.fn(),
  },
}));

import { useTabsStore } from "./tabs";
import { useWorkspaceStore } from "./workspace";

describe("tabsStore", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeRel: null, conflict: null, pendingCloseRel: null, pendingJump: null });
    useWorkspaceStore.setState({ vault: "/canon/v" });
  });

  it("open 打开并激活，name 去掉 .md 后缀", () => {
    useTabsStore.getState().open({ rel: "a.md", name: "a.md", content: "# hi", mtimeMillis: 1, encoding: "UTF-8" });
    const s = useTabsStore.getState();
    expect(s.activeRel).toBe("a.md");
    expect(s.tabs[0].name).toBe("a");
  });

  it("重复 open 同一文件只聚焦不新建", () => {
    const o = { rel: "a.md", name: "a", content: "# hi", mtimeMillis: 1, encoding: "UTF-8" };
    useTabsStore.getState().open(o);
    useTabsStore.getState().open({ ...o, content: "# 改了" });
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0].content).toBe("# hi");
  });

  it("updateActive 产生脏标记，保存后清除", async () => {
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# hi", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().updateActive("# 改了");
    expect(useTabsStore.getState().isDirty("a.md")).toBe(true);
    await useTabsStore.getState().saveActive();
    const s = useTabsStore.getState();
    expect(s.isDirty("a.md")).toBe(false);
    expect(s.tabs[0].mtimeMillis).toBe(42);
  });

  it("close 激活项后把焦点挪到相邻标签", () => {
    const s = useTabsStore.getState();
    s.open({ rel: "a.md", name: "a", content: "1", mtimeMillis: 1, encoding: "UTF-8" });
    s.open({ rel: "b.md", name: "b", content: "2", mtimeMillis: 1, encoding: "UTF-8" });
    s.close("b.md");
    expect(useTabsStore.getState().activeRel).toBe("a.md");
  });

  it("renameTab 更新 rel/name 并保持内容与脏状态", () => {
    const s = useTabsStore.getState();
    s.open({ rel: "日记/a.md", name: "a", content: "# hi", mtimeMillis: 7, encoding: "GBK" });
    useTabsStore.getState().updateActive("# 改了");
    useTabsStore.getState().renameTab("日记/a.md", "日记/b.md");
    const t = useTabsStore.getState().tabs[0];
    expect(t.rel).toBe("日记/b.md");
    expect(t.name).toBe("b");
    expect(t.content).toBe("# 改了"); // 脏内容保留
    expect(t.savedContent).toBe("# hi");
    expect(t.mtimeMillis).toBe(7); // 磁盘内容未变
    expect(t.encoding).toBe("GBK");
    expect(useTabsStore.getState().isDirty("日记/b.md")).toBe(true);
    expect(useTabsStore.getState().activeRel).toBe("日记/b.md");
  });

  it("renameTab 目录改名迁移后代标签并保持内容与脏状态", () => {
    const s = useTabsStore.getState();
    s.open({ rel: "日记/a.md", name: "a.md", content: "# a", mtimeMillis: 1, encoding: "UTF-8" });
    s.open({ rel: "日记/子/b.md", name: "b.md", content: "# b", mtimeMillis: 2, encoding: "UTF-8" });
    useTabsStore.getState().updateActive("# b 改"); // 后代标签有未保存编辑
    useTabsStore.getState().renameTab("日记", "周记");
    const tabs = useTabsStore.getState().tabs;
    expect(tabs.map((t) => t.rel)).toEqual(["周记/a.md", "周记/子/b.md"]);
    expect(tabs[0].name).toBe("a");
    expect(tabs[1].name).toBe("b");
    expect(tabs[1].content).toBe("# b 改"); // 脏内容保留
    expect(tabs[1].savedContent).toBe("# b");
    expect(useTabsStore.getState().isDirty("周记/子/b.md")).toBe(true);
    expect(useTabsStore.getState().activeRel).toBe("周记/子/b.md");
  });

  it("无 vault 时 saveActive 静默跳过", async () => {
    useWorkspaceStore.setState({ vault: null });
    useTabsStore.getState().open({ rel: "a.md", name: "a.md", content: "x", mtimeMillis: 1, encoding: "UTF-8" });
    await expect(useTabsStore.getState().saveActive()).resolves.toBeUndefined();
  });

  it("requestJump 未开先 open 再置 pendingJump，已开 setActive；consumeJump 清空", async () => {
    const { api } = await import("../api");
    vi.mocked(api.readFile).mockResolvedValueOnce({ content: "第一行\n苹果行", mtimeMillis: 5, encoding: "UTF-8" });
    await useTabsStore.getState().requestJump("hit.md", 1); // 未开：读文件后 open
    expect(useTabsStore.getState().tabs.map((t) => t.rel)).toEqual(["hit.md"]);
    expect(useTabsStore.getState().activeRel).toBe("hit.md");
    expect(useTabsStore.getState().pendingJump).toEqual({ rel: "hit.md", line: 1 });

    useTabsStore.getState().open({ rel: "b.md", name: "b", content: "2", mtimeMillis: 1, encoding: "UTF-8" });
    await useTabsStore.getState().requestJump("hit.md", 0); // 已开：只 setActive，不再读文件
    expect(vi.mocked(api.readFile)).toHaveBeenCalledTimes(1);
    expect(useTabsStore.getState().activeRel).toBe("hit.md");
    expect(useTabsStore.getState().pendingJump).toEqual({ rel: "hit.md", line: 0 });

    useTabsStore.getState().consumeJump();
    expect(useTabsStore.getState().pendingJump).toBeNull();
  });

  it("requestJump 无 vault 或文件读取失败时静默不跳转", async () => {
    const { api } = await import("../api");
    useWorkspaceStore.setState({ vault: null });
    await useTabsStore.getState().requestJump("gone.md", 0);
    expect(useTabsStore.getState().pendingJump).toBeNull(); // 无 vault：不发请求不置跳转

    useWorkspaceStore.setState({ vault: "/canon/v" });
    vi.mocked(api.readFile).mockRejectedValueOnce("不存在"); // 大纲/搜索点击已删文件
    await useTabsStore.getState().requestJump("gone.md", 0);
    expect(useTabsStore.getState().pendingJump).toBeNull();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
  });
});

describe("tabsStore v2: 冲突状态机 / 快照保存 / 关闭确认", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeRel: null, conflict: null, pendingCloseRel: null, pendingJump: null });
    useWorkspaceStore.setState({ vault: "/canon/v" });
  });

  it("saveActive 快照语义：保存期间的新输入不被误标已保存", async () => {
    const { api } = await import("../api");
    let resolveSave: (v: FileContent) => void = () => {};
    vi.mocked(api.saveFile).mockImplementationOnce(
      () => new Promise((r) => { resolveSave = r; }),
    );
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# v1", mtimeMillis: 1, encoding: "UTF-8" });
    const saving = useTabsStore.getState().saveActive();
    useTabsStore.getState().updateActive("# v1 加了字");
    resolveSave({ content: "# v1", mtimeMillis: 42, encoding: "UTF-8" });
    await saving;
    expect(useTabsStore.getState().isDirty("a.md")).toBe(true); // 新输入仍是脏的
  });

  it("saveActive 冲突错误置 conflict 且不抛出", async () => {
    const { api } = await import("../api");
    vi.mocked(api.saveFile).mockRejectedValueOnce("外部修改冲突: 磁盘上的文件与保存时不同");
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# v1", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().updateActive("# 改");
    await expect(useTabsStore.getState().saveActive()).resolves.toBeUndefined();
    expect(useTabsStore.getState().conflict).toEqual({ rel: "a.md", reason: "modified" });
  });

  it("keepConflict 后下一次保存跳过 mtime 校验并清除 overrideExternal", async () => {
    const { api } = await import("../api");
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# v1", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().updateActive("# 改");
    useTabsStore.getState().keepConflict();
    await useTabsStore.getState().saveActive();
    expect(vi.mocked(api.saveFile)).toHaveBeenLastCalledWith(
      "/canon/v", "a.md", "# 改", { encoding: "UTF-8", expectedMtimeMillis: null },
    );
    expect(useTabsStore.getState().tabs[0].overrideExternal).toBe(false);
  });

  it("外部修改：干净 tab 静默重载", async () => {
    const { api } = await import("../api");
    vi.mocked(api.readFile).mockResolvedValueOnce({ content: "磁盘新内容", mtimeMillis: 99, encoding: "UTF-8" });
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "旧", mtimeMillis: 1, encoding: "UTF-8" });
    await useTabsStore.getState().handleExternalChanges(["a.md"]);
    const t = useTabsStore.getState().tabs[0];
    expect(t.content).toBe("磁盘新内容");
    expect(t.mtimeMillis).toBe(99);
    expect(useTabsStore.getState().conflict).toBeNull();
  });

  it("外部修改：脏 tab 置 conflict(modified)", async () => {
    const { api } = await import("../api");
    vi.mocked(api.readFile).mockResolvedValueOnce({ content: "磁盘新内容", mtimeMillis: 99, encoding: "GBK" });
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "我的", mtimeMillis: 1, encoding: "GBK" });
    useTabsStore.getState().updateActive("我的改动");
    await useTabsStore.getState().handleExternalChanges(["a.md"]);
    expect(useTabsStore.getState().conflict).toEqual({ rel: "a.md", reason: "modified" });
  });

  it("外部删除：干净 tab 自动关闭，脏 tab 置 conflict(deleted)", async () => {
    const { api } = await import("../api");
    vi.mocked(api.readFile).mockRejectedValue("不存在");
    useTabsStore.getState().open({ rel: "clean.md", name: "c", content: "x", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().open({ rel: "dirty.md", name: "d", content: "y", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().updateActive("脏了");
    await useTabsStore.getState().handleExternalChanges(["clean.md", "dirty.md"]);
    const s = useTabsStore.getState();
    expect(s.tabs.map((t) => t.rel)).toEqual(["dirty.md"]);
    expect(s.conflict).toEqual({ rel: "dirty.md", reason: "deleted" });
  });

  it("reloadConflict 失败（文件已删）时关闭该标签", async () => {
    const { api } = await import("../api");
    vi.mocked(api.readFile).mockRejectedValue("没了");
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "x", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.setState({ conflict: { rel: "a.md", reason: "modified" } });
    await useTabsStore.getState().reloadConflict();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useTabsStore.getState().conflict).toBeNull();
  });

  it("requestClose/confirmClose/discardClose/cancelClose", async () => {
    const { api } = await import("../api");
    useTabsStore.getState().open({ rel: "clean.md", name: "c", content: "x", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().requestClose("clean.md");
    expect(useTabsStore.getState().tabs).toHaveLength(0); // 干净直接关

    useTabsStore.getState().open({ rel: "dirty.md", name: "d", content: "y", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().updateActive("脏");
    useTabsStore.getState().requestClose("dirty.md");
    expect(useTabsStore.getState().pendingCloseRel).toBe("dirty.md");
    useTabsStore.getState().cancelClose();
    expect(useTabsStore.getState().pendingCloseRel).toBeNull();
    expect(useTabsStore.getState().tabs).toHaveLength(1);

    useTabsStore.getState().requestClose("dirty.md");
    await useTabsStore.getState().confirmClose();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(vi.mocked(api.saveFile)).toHaveBeenCalled();
  });
});
