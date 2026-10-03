import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { saveFile: vi.fn(async (_v: string, _r: string, c: string) => ({ content: c, mtimeMillis: 42 })) },
}));

import { useTabsStore } from "./tabs";
import { useWorkspaceStore } from "./workspace";

describe("tabsStore", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeRel: null });
    useWorkspaceStore.setState({ vault: "/canon/v" });
  });

  it("open 打开并激活，name 去掉 .md 后缀", () => {
    useTabsStore.getState().open({ rel: "a.md", name: "a.md", content: "# hi", mtimeMillis: 1 });
    const s = useTabsStore.getState();
    expect(s.activeRel).toBe("a.md");
    expect(s.tabs[0].name).toBe("a");
  });

  it("重复 open 同一文件只聚焦不新建", () => {
    const o = { rel: "a.md", name: "a", content: "# hi", mtimeMillis: 1 };
    useTabsStore.getState().open(o);
    useTabsStore.getState().open({ ...o, content: "# 改了" });
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0].content).toBe("# hi");
  });

  it("updateActive 产生脏标记，保存后清除", async () => {
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "# hi", mtimeMillis: 1 });
    useTabsStore.getState().updateActive("# 改了");
    expect(useTabsStore.getState().isDirty("a.md")).toBe(true);
    await useTabsStore.getState().saveActive();
    const s = useTabsStore.getState();
    expect(s.isDirty("a.md")).toBe(false);
    expect(s.tabs[0].mtimeMillis).toBe(42);
  });

  it("close 激活项后把焦点挪到相邻标签", () => {
    const s = useTabsStore.getState();
    s.open({ rel: "a.md", name: "a", content: "1", mtimeMillis: 1 });
    s.open({ rel: "b.md", name: "b", content: "2", mtimeMillis: 1 });
    s.close("b.md");
    expect(useTabsStore.getState().activeRel).toBe("a.md");
  });

  it("无 vault 时 saveActive 静默跳过", async () => {
    useWorkspaceStore.setState({ vault: null });
    useTabsStore.getState().open({ rel: "a.md", name: "a", content: "x", mtimeMillis: 1 });
    await expect(useTabsStore.getState().saveActive()).resolves.toBeUndefined();
  });
});
