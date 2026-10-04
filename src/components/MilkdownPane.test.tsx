import { render, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markdownUpdatedCb = { fn: null as null | ((
  ctx: unknown, markdown: string, prev: string,
) => void) };
const mockReplaceAll = vi.fn();
const mockInsert = vi.fn();
const mockWriteAsset = vi.fn();
const crepeInstances: any[] = [];
// editor.config(fn) 的 fn 由组件传入（注入 uploadConfig.uploader），mock 捕获后在用例里
// 以 fake ctx 求值：updater(prev) 取回新 config，即可直接驱动自定义 uploader
const capturedConfigFns: Array<(ctx: unknown) => void> = [];

vi.mock("@milkdown/crepe", () => ({
  Crepe: class {
    static Feature = { Placeholder: "placeholder" };
    editor = {
      action: mockReplaceAll,
      use: () => {},
      config: (fn: (ctx: unknown) => void) => { capturedConfigFns.push(fn); },
    };
    defaultValueOpt = "";
    root: HTMLElement | null = null;
    constructor(opts: any) {
      this.defaultValueOpt = opts?.defaultValue ?? "";
      this.root = opts?.root ?? null;
      crepeInstances.push(this);
    }
    async create() {
      // 模拟真实 Crepe：create 完成后容器内出现 .ProseMirror 及块级子节点，
      // 供跳转 effect 的 querySelector 命中（真实 DOM 由 milkdown 渲染）
      if (this.root) {
        const pm = document.createElement("div");
        pm.className = "ProseMirror";
        for (let i = 0; i < 3; i++) {
          const block = document.createElement("p");
          block.textContent = `block-${i}`;
          pm.appendChild(block);
        }
        this.root.appendChild(pm);
      }
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
vi.mock("@milkdown/kit/utils", () => ({
  replaceAll: (md: string) => { mockReplaceAll(md); return md; },
  insert: (md: string) => { mockInsert(md); return md; },
}));
vi.mock("../api", () => ({
  api: { writeAsset: (...args: unknown[]) => mockWriteAsset(...args) },
}));
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  invoke: vi.fn(),
}));

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
    capturedConfigFns.length = 0;
    mockReplaceAll.mockClear();
    mockInsert.mockClear();
    mockWriteAsset.mockReset();
    markdownUpdatedCb.fn = null;
    useTabsStore.setState({ tabs: [], activeRel: null, conflict: null, pendingCloseRel: null, pendingJump: null });
  });

  it("无 active tab 渲染空白占位（对标 Typora，无提示文字）", () => {
    render(<MilkdownPane />);
    const empty = document.querySelector(".editor-empty");
    expect(empty).toBeInTheDocument();
    expect(empty).toBeEmptyDOMElement();
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

  it("跨 tab 跳转：同 commit 批处理下 replaceAll 先注册，滚动见新文档（防静默丢失）", async () => {
    const order: string[] = [];
    mockReplaceAll.mockImplementation((md: string) => { order.push(`replace:${md}`); });
    Element.prototype.scrollIntoView = function scrollIntoViewStub(this: HTMLElement) {
      order.push(`scroll:${this.textContent}`);
    };
    // 场景：b.md 已在后台打开，当前激活 a.md；在 a 激活状态下跳往 b
    openTab("# 甲", "a.md");
    useTabsStore.getState().open({ rel: "b.md", name: "b", content: "# 乙", mtimeMillis: 1, encoding: "UTF-8" });
    useTabsStore.getState().setActive("a.md");
    render(<MilkdownPane />);
    await act(async () => {}); // 编辑器就绪（首建 a.md 文档）
    // requestJump 的 setActive(b.md) 与 set(pendingJump) 无 await 间隔，同一 commit 批处理
    await act(async () => { await useTabsStore.getState().requestJump("b.md", 1); });
    await act(async () => {});
    // .then 链按 effect 声明序 FIFO：必须先 replaceAll 换入 b 文档，再在新文档上定位
    // （replaceAll 被 mock wrapper 记两条：action 入参 + action 执行，见文件头适配注记。
    //   跳转 effect 若声明在前，scroll 会先于 replace:# 乙 执行——旧文档上滚动后被复位，跳转静默丢失）
    expect(order).toContain("replace:# 乙");
    expect(order).toContain("scroll:block-1");
    expect(order.indexOf("scroll:block-1")).toBeGreaterThan(order.lastIndexOf("replace:# 乙"));
    expect(useTabsStore.getState().pendingJump).toBeNull(); // 定位完成后已消费
  });

  // 取出组件注入 editor.config 的 updater，提取自定义 uploader（粘贴图片的入口）
  function extractUploader(): (files: FileList, schema: unknown, ctx: unknown, pos: number) => Promise<unknown[]> {
    let uploader!: (files: FileList, schema: unknown, ctx: unknown, pos: number) => Promise<unknown[]>;
    capturedConfigFns[0]({
      update: (_key: unknown, updater: (prev: unknown) => unknown) => {
        const next = updater({ uploader: null, enableHtmlFileUploader: false }) as { uploader: typeof uploader };
        uploader = next.uploader;
      },
    });
    return uploader;
  }

  // fake schema：image.createAndFill 回传 attrs，便于断言 src 形态
  const fakeSchema = {
    nodes: { image: { createAndFill: (attrs: { src: string; alt: string }) => ({ attrs }) } },
  };

  it("粘贴图片：uploader 调 writeAsset 落盘并以 convertFileSrc 形态建图节点", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    expect(capturedConfigFns).toHaveLength(1);
    mockWriteAsset.mockResolvedValue("_assets/20261004-153000.png");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
    const nodes = (await extractUploader()([file] as unknown as FileList, fakeSchema, null, 0)) as Array<{ attrs: { src: string; alt: string } }>;
    expect(nodes).toHaveLength(1);
    expect(mockWriteAsset).toHaveBeenCalledTimes(1);
    const [vaultArg, extArg, dataArg] = mockWriteAsset.mock.calls[0];
    expect(vaultArg).toBe("/canon/v");
    expect(extArg).toBe("png");
    expect(Array.from(dataArg as Uint8Array)).toEqual([137, 80, 78, 71]);
    // 节点 src 与 assetPaths.toEditableMarkdown 产出形态一致，保存时 toStoredMarkdown 可还原为相对路径
    expect(nodes[0].attrs.src).toBe(`asset://localhost/${encodeURIComponent("/canon/v/_assets/20261004-153000.png")}`);
    expect(nodes[0].attrs.alt).toBe("img");
  });

  it("非图片或白名单外类型不落盘：uploader 返回空数组", async () => {
    openTab("# 你好");
    render(<MilkdownPane />);
    await act(async () => {});
    const text = new File(["hello"], "a.txt", { type: "text/plain" });
    const exe = new File([new Uint8Array([1])], "a.exe", { type: "image/exe" });
    const nodes = (await extractUploader()([text, exe] as unknown as FileList, fakeSchema, null, 0)) as unknown[];
    expect(nodes).toHaveLength(0);
    expect(mockWriteAsset).not.toHaveBeenCalled();
  });
});
