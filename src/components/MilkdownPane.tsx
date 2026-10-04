import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { convertFileSrc } from "@tauri-apps/api/core";
import { replaceAll } from "@milkdown/kit/utils";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { Node, Schema } from "@milkdown/kit/prose/model";
import type { Ctx } from "@milkdown/kit/ctx";
import { api } from "../api";
import { toEditableMarkdown, toStoredMarkdown } from "../lib/assetPaths";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

// 与 Rust write_asset 的 ext 白名单一致（小写化后比对）
const ASSET_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export function MilkdownPane() {
  const vault = useWorkspaceStore((s) => s.vault);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));
  // 无 tab 时不渲染编辑器容器：内层编辑器随 tab 打开挂载、关闭卸载，
  // 避免"挂载时无 tab 导致编辑器永不创建"的时序问题
  if (!tab) return <div className="editor-empty">从左侧选择一个文件</div>;
  // 进编辑器的永远是可编辑形态（相对路径 → asset URL）；store/磁盘始终保持存储形态
  return <MilkdownEditor defaultValue={toEditableMarkdown(tab.content, vault ?? "")} vault={vault ?? ""} />;
}

function MilkdownEditor({ defaultValue, vault }: { defaultValue: string; vault: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const creatingRef = useRef<Promise<unknown> | null>(null);
  // 程序化载入（defaultValue/replaceAll）完成时的文档序列化快照。
  // milkdown 的 markdownUpdated 经 200ms debounce 异步回放，且 crepe 的序列化往返
  // 可能与磁盘原文有归一化差异——若不拦截，"打开/切换文件"就会被误标为未保存(dirty)。
  // 回声内容与快照相等 ⇒ 载入后无用户编辑 ⇒ 非用户输入，不回写 store；
  // 一旦有真实编辑（≠ 快照），放行并清空快照，此后（含撤销回原状）的编辑都正常回写。
  const snapshotRef = useRef<string | null>(null);
  const loadedRef = useRef<{ rel: string | null; content: string | null }>({ rel: null, content: null });
  const activeRel = useTabsStore((s) => s.activeRel);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));
  const pendingJump = useTabsStore((s) => s.pendingJump);

  // activeRel 在 markdownUpdated 闭包（创建于挂载时）中会过期，经 ref 转发最新值
  const activeRelRef = useRef<string | null>(activeRel);
  activeRelRef.current = activeRel;

  // 图片粘贴/拖入的自定义 uploader（注入 crepe 内置 upload 插件的 uploadConfig）。
  // 不自己写容器 onPaste/handlePaste 拦截：crepe 的 upload 插件 handlePaste 优先级更高，
  // 会先用默认 uploader（base64）插图；走它的扩展点替换 uploader 才是正确缝位。
  // 行为：图片字节 → Rust write_asset 落盘 `_assets/<时间戳>.<ext>` → 以 asset URL 建
  // image 节点插入光标处。URL 与 assetPaths.toEditableMarkdown 同一 convertFileSrc 形态，
  // 保存时 toStoredMarkdown 既有往返自动还原为 `_assets/…` 相对路径。
  const uploader = async (files: FileList, schema: Schema, _ctx: Ctx, _pos: number): Promise<Node[]> => {
    if (!vault) return [];
    const imgs = Array.from(files).filter((f) => {
      const ext = f.type.split("/")[1]?.toLowerCase() ?? "";
      return f.type.startsWith("image/") && ASSET_EXTS.has(ext);
    });
    if (imgs.length === 0) return [];
    const nodes: Node[] = [];
    for (const file of imgs) {
      const ext = file.type.split("/")[1]!.toLowerCase();
      const data = new Uint8Array(await file.arrayBuffer());
      const rel = await api.writeAsset(vault, ext, data);
      const node = schema.nodes.image.createAndFill({
        src: convertFileSrc(`${vault}/${rel}`),
        alt: "img",
      });
      if (node) nodes.push(node);
    }
    return nodes;
  };

  // 创建一次；replace effect 需等 create() 完成才能 editor.action，故记录 promise
  useEffect(() => {
    if (!containerRef.current || crepeRef.current) return;
    const crepe = new Crepe({ root: containerRef.current, defaultValue });
    crepe.editor.config((ctx) => {
      ctx.update(uploadConfig.key, (prev) => ({ ...prev, uploader }));
    });
    creatingRef.current = crepe.create().then(() => {
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (snapshotRef.current !== null && markdown === snapshotRef.current) return;
          snapshotRef.current = null;
          // 回写用存储形态（asset URL → 相对路径）。loadedRef 与 store content 均存
          // 同一存储形态，保证下方 effect 的 selfEcho 比较两端形态一致（无死循环）；
          // 守卫快照（snapshotRef）则始终用编辑器原生产出，不做形态变换
          const stored = toStoredMarkdown(markdown, vault);
          loadedRef.current = { rel: activeRelRef.current, content: stored };
          useTabsStore.getState().updateActive(stored);
        });
      });
      snapshotRef.current = crepe.getMarkdown();
      // 打开文件即聚焦编辑器：⌘P 打开后可直接输入/粘贴（否则焦点残留在 body，⌘V 无处落地）
      window.setTimeout(() => {
        containerRef.current?.querySelector<HTMLElement>(".ProseMirror")?.focus();
      }, 100);
    });
    crepeRef.current = crepe;
    return () => {
      // create 未完成时也要能销毁；catch 吞掉创建失败与 destroy 自身的清理期错误
      void creatingRef.current
        ?.catch(() => {})
        .then(() => crepe.destroy())
        .catch(() => {});
      crepeRef.current = null;
      creatingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换标签/外部重载：rel 变化，或（非自身回写的）content 变化 → replaceAll
  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || !tab) return;
    const loaded = loadedRef.current;
    // selfEcho：store 中的 content 即编辑器最新内容（编辑器自身回写），无需替换
    if (loaded.rel === activeRel && loaded.content === tab.content) return;
    loadedRef.current = { rel: activeRel, content: tab.content };
    void creatingRef.current
      ?.then(() => {
        crepe.editor.action(replaceAll(toEditableMarkdown(tab.content, vault)));
        snapshotRef.current = crepe.getMarkdown();
      })
      .catch(() => {}); // 卸载竞态下 editor 可能已销毁，忽略清理期错误
  }, [activeRel, tab?.content]);

  // 大纲/搜索命中跳转定位：pendingJump.rel 匹配当前 tab 时，把 .ProseMirror 的
  // 第 min(line, 块数-1) 个直接子元素（块级节点）滚入视口，然后 consumeJump。
  // 时序：① 必须等编辑器就绪——action 挂在 creatingRef 之后；.ProseMirror 也在
  // then 里查（create 未完成时元素尚未挂载），找不到则静默放弃（consumeJump 照做）。
  // ② 本 effect 必须声明在上方 replaceAll effect 之后：requestJump 的 setActive 与
  // set(pendingJump) 同一 commit 批处理时，两个 effect 的 .then 链按声明序 FIFO，
  // 跳转若先注册会在旧文档上滚动、随后被 replaceAll 复位——跳转静默丢失。
  // 行号→块序为近似定位，允许 ±1 块误差。
  useEffect(() => {
    if (!pendingJump || pendingJump.rel !== activeRel) return;
    const jump = pendingJump;
    let stale = false;
    void creatingRef.current
      ?.then(() => {
        if (stale) return;
        const blocks = containerRef.current?.querySelector(".ProseMirror")?.children;
        if (blocks && blocks.length > 0) {
          blocks[Math.min(jump.line, blocks.length - 1)]?.scrollIntoView({ block: "start" });
        }
      })
      .catch(() => {}) // 卸载竞态下 editor 可能已销毁，忽略清理期错误
      .finally(() => {
        // 仍是同一个跳转请求才消费（期间来了新请求则留给新请求的 effect 处理）
        if (!stale && useTabsStore.getState().pendingJump === jump) {
          useTabsStore.getState().consumeJump();
        }
      });
    return () => {
      stale = true;
    };
  }, [pendingJump, activeRel]);

  return <div ref={containerRef} className="milkdown-pane" />;
}
