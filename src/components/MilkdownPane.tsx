import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { toEditableMarkdown, toStoredMarkdown } from "../lib/assetPaths";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

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

  // activeRel 在 markdownUpdated 闭包（创建于挂载时）中会过期，经 ref 转发最新值
  const activeRelRef = useRef<string | null>(activeRel);
  activeRelRef.current = activeRel;

  // 创建一次；replace effect 需等 create() 完成才能 editor.action，故记录 promise
  useEffect(() => {
    if (!containerRef.current || crepeRef.current) return;
    const crepe = new Crepe({ root: containerRef.current, defaultValue });
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

  return <div ref={containerRef} className="milkdown-pane" />;
}
