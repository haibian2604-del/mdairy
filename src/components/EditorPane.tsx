import { useEffect, useRef } from "react";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { useTabsStore } from "../stores/tabs";

export function EditorPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedRel = useRef<string | null>(null);
  const activeRel = useTabsStore((s) => s.activeRel);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.rel === s.activeRel));

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          markdown(),
          Prec.high(keymap.of([{
            key: "Mod-s",
            run: () => { void useTabsStore.getState().saveActive(); return true; },
          }])),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) useTabsStore.getState().updateActive(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    loadedRel.current = null;
    return () => { view.destroy(); viewRef.current = null; };
    // 容器 div 仅在有激活 tab 时渲染，必须随 `!!tab` 重建/销毁 view，
    // 否则首次打开 tab 时 effect 已空转过、view 永不创建；
    // 关闭最后一个 tab 后旧 view 会附着在已分离 DOM 上。
  }, [!!tab]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (loadedRel.current === activeRel) return;
    loadedRel.current = activeRel;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: tab?.content ?? "" },
    });
  }, [activeRel, tab?.content]);

  if (!tab) return <div className="editor-empty">从左侧选择一个文件</div>;
  return <div ref={containerRef} className="editor-pane" />;
}
