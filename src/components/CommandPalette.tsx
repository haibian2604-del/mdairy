import { useMemo, useState, type KeyboardEvent } from "react";
import { File, SquareSlash } from "lucide-react";
import type { TreeNode } from "../api";
import { useCommands, type Command } from "../lib/commands";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

type Item =
  | { kind: "command"; key: string; command: Command }
  | { kind: "file"; key: string; rel: string; name: string };

/**
 * 命令面板：⌘⇧P 开 all 模式（命令组 + 文件组）、⌘P 开 files 模式（仅文件）。
 * 匹配为连续子串、大小写不敏感（中文即直接子串）；↑↓ 循环选择、↵ 执行并关闭、
 * esc / 遮罩点击关闭；文件项经 useOpenFile 打开。
 */
export function CommandPalette({ mode, onClose }: { mode: "all" | "files"; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const tree = useWorkspaceStore((s) => s.tree);
  const commands = useCommands();

  // 树扁平为文件列表（递归遍历，按树序；修改时间暂不可得）
  const files = useMemo(() => {
    const out: { rel: string; name: string }[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.kind === "file") out.push({ rel: n.rel, name: n.name });
        else walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree]);

  const q = query.trim().toLowerCase();
  const items = useMemo<Item[]>(() => {
    const cmds =
      mode === "all"
        ? commands.filter((c) => c.label.toLowerCase().includes(q))
        : [];
    const fils = files.filter(
      (f) => f.name.toLowerCase().includes(q) || f.rel.toLowerCase().includes(q),
    );
    return [
      ...cmds.map((c) => ({ kind: "command" as const, key: c.id, command: c })),
      ...fils.map((f) => ({ kind: "file" as const, key: f.rel, rel: f.rel, name: f.name })),
    ];
  }, [mode, commands, files, q]);

  const commandItems = items.filter((i) => i.kind === "command");
  const fileItems = items.slice(commandItems.length);
  // 输入变化时重置为 0（onChange），此处再钳制防越界
  const sel = Math.min(selected, Math.max(items.length - 1, 0));

  const execute = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === "command") item.command.run();
    else void useTabsStore.getState().openOrFocus(item.rel);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // IME 组合态守卫：拼音等输入法组合中回车=上屏候选词、↑↓=选候选词，
    // 这些 keydown（isComposing 或 keyCode 229）不应驱动面板的选择/执行/关闭
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length > 0) setSelected((i) => (Math.min(i, items.length - 1) + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length > 0)
        setSelected((i) => (Math.min(i, items.length - 1) - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(items[sel]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const renderItem = (item: Item, index: number) => (
    <button
      key={item.key}
      role="option"
      aria-selected={index === sel}
      className="palette-item"
      title={item.kind === "file" ? item.rel : undefined}
      ref={index === sel ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
      onClick={() => execute(item)}
    >
      {item.kind === "command"
        ? (
          <>
            <SquareSlash size={15} className="palette-icon" />
            <span>{item.command.label}</span>
            {item.command.hint && <kbd className="palette-hint">{item.command.hint}</kbd>}
          </>
        )
        : (
          <>
            <File size={15} strokeWidth={1.75} className="palette-icon" />
            <span>{item.name.replace(/\.md$/i, "")}</span>
            {item.rel !== item.name && <span className="palette-hint">{item.rel}</span>}
          </>
        )}
    </button>
  );

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          className="palette-input"
          type="text"
          placeholder="输入命令或文件名…"
          aria-label="搜索命令与文件"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" role="listbox" aria-label="命令与文件">
          {items.length === 0 && <div className="palette-empty">没有匹配项</div>}
          {commandItems.length > 0 && <div className="palette-group">命令</div>}
          {commandItems.map((item, i) => renderItem(item, i))}
          {fileItems.length > 0 && <div className="palette-group">文件</div>}
          {fileItems.map((item, i) => renderItem(item, commandItems.length + i))}
        </div>
      </div>
    </div>
  );
}
