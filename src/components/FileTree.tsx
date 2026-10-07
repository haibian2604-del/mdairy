import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, MoreHorizontal } from "lucide-react";
import { api, type TreeNode } from "../api";
import { Modal } from "./Modal";
import { useTabsStore } from "../stores/tabs";
import { useWorkspaceStore } from "../stores/workspace";

const displayName = (name: string) => name.replace(/\.md$/i, "");

/** 行内输入：新建（目标目录内）或重命名（原行位置） */
type Inline =
  | { mode: "new"; parentRel: string; kind: "file" | "dir"; siblings: string[] }
  | { mode: "rename"; rel: string; siblings: string[] };

function nameError(name: string, siblings: string[]): string | null {
  if (!name.trim()) return "名称不能为空";
  if (name.includes("/") || name.includes("\\") || name === "..") return "名称不能包含 / \\ 或 ..";
  if (siblings.includes(name)) return "已存在同名文件或文件夹";
  return null;
}

function InlineInput({ initial, siblings, placeholder, serverError, onServerErrorClear, onConfirm, onCancel }: {
  initial: string;
  siblings: string[];
  placeholder: string;
  serverError: string | null;
  onServerErrorClear: () => void;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const clientError = nameError(value, siblings);
  const error = serverError ?? (touched ? clientError : null);
  const confirm = () => {
    if (error) { setTouched(true); return; }
    if (value.trim() === initial) { onCancel(); return; } // 未改动直接取消
    onConfirm(value.trim());
  };
  return (
    <div className="inline-input-row">
      <input
        ref={ref}
        className={`inline-input${error ? " invalid" : ""}`}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => { setValue(e.target.value); setTouched(true); onServerErrorClear(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirm();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => onCancel()}
      />
      {error && <span className="inline-error" role="alert">{error}</span>}
    </div>
  );
}

export function FileTree({ nodes, depth = 0, onOpenFile }: {
  nodes: TreeNode[];
  depth?: number;
  onOpenFile: (rel: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuRel, setMenuRel] = useState<string | null>(null);
  const [inline, setInline] = useState<Inline | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingTrash, setPendingTrash] = useState<TreeNode | null>(null);

  if (nodes.length === 0) {
    return depth === 0 ? <div className="tree-empty">空文件夹</div> : null;
  }
  const toggle = (rel: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(rel)) n.delete(rel); else n.add(rel);
      return n;
    });

  const confirmNew = async (parentRel: string, kind: "file" | "dir", name: string) => {
    const vault = useWorkspaceStore.getState().vault;
    if (!vault) return;
    try {
      await api.createEntry(vault, parentRel, name, kind);
    } catch (e) {
      setServerError(String(e)); // 后端拒绝（如重名）→ 行内提示
      return;
    }
    setInline(null);
    setServerError(null);
    await useWorkspaceStore.getState().refreshTree();
  };

  const confirmRename = async (rel: string, newName: string) => {
    const vault = useWorkspaceStore.getState().vault;
    if (!vault) return;
    const parent = rel.split("/").slice(0, -1).join("/");
    const newRel = parent ? `${parent}/${newName}` : newName;
    try {
      await api.renameEntry(vault, rel, newName);
    } catch (e) {
      setServerError(String(e));
      return;
    }
    setInline(null);
    setServerError(null);
    useTabsStore.getState().renameTab(rel, newRel); // 已打开则标签跟随，未打开为 no-op
    await useWorkspaceStore.getState().refreshTree();
  };

  const confirmTrash = async () => {
    if (!pendingTrash) return;
    const vault = useWorkspaceStore.getState().vault;
    setPendingTrash(null);
    if (!vault) return;
    try {
      await api.trashEntry(vault, pendingTrash.rel);
    } catch {
      await useWorkspaceStore.getState().refreshTree();
      return;
    }
    // 已打开的自身/后代（目录删除）标签批量关闭
    const { tabs, close } = useTabsStore.getState();
    for (const t of [...tabs]) {
      if (t.rel === pendingTrash.rel || t.rel.startsWith(`${pendingTrash.rel}/`)) close(t.rel);
    }
    await useWorkspaceStore.getState().refreshTree();
  };

  const inlineInput = (initial: string, siblings: string[], placeholder: string, onConfirm: (name: string) => void, style?: React.CSSProperties) => (
    <div style={style}>
      <InlineInput
        initial={initial}
        siblings={siblings}
        placeholder={placeholder}
        serverError={serverError}
        onServerErrorClear={() => setServerError(null)}
        onConfirm={onConfirm}
        onCancel={() => { setInline(null); setServerError(null); }}
      />
    </div>
  );

  return (
    <>
      <ul className="file-tree" role="tree">
        {nodes.map((n) => {
          const indent = depth * 16 + (n.kind === "dir" ? 8 : 24);
          const isRenaming = inline?.mode === "rename" && inline.rel === n.rel;
          return (
            <li key={n.rel} role="treeitem" aria-expanded={n.kind === "dir" ? expanded.has(n.rel) : undefined}>
              {isRenaming ? (
                inlineInput(n.name, nodes.map((x) => x.name), "新名称", (name) => void confirmRename(n.rel, name), { paddingLeft: indent })
              ) : (
                <div className="tree-row-wrap">
                  {n.kind === "dir" ? (
                    <button className="tree-row" style={{ paddingLeft: indent }} onClick={() => toggle(n.rel)}>
                      {expanded.has(n.rel)
                        ? <ChevronDown size={14} strokeWidth={1.75} /> : <ChevronRight size={14} strokeWidth={1.75} />}
                      {expanded.has(n.rel)
                        ? <FolderOpen size={16} strokeWidth={1.75} /> : <Folder size={16} strokeWidth={1.75} />}
                      <span>{n.name}</span>
                    </button>
                  ) : (
                    <button className="tree-row" style={{ paddingLeft: indent }} onClick={() => onOpenFile(n.rel)}>
                      <File size={16} strokeWidth={1.75} />
                      <span>{displayName(n.name)}</span>
                    </button>
                  )}
                  <button className="tree-more" aria-label="更多操作" onClick={() => setMenuRel(menuRel === n.rel ? null : n.rel)}>
                    <MoreHorizontal size={14} />
                  </button>
                  {menuRel === n.rel && (
                    <>
                      <div className="menu-overlay" onClick={() => setMenuRel(null)} />
                      <div className="tree-menu" role="menu">
                        {n.kind === "dir" && (
                          <>
                            <button role="menuitem" onClick={() => {
                              setMenuRel(null);
                              setServerError(null);
                              setInline({ mode: "new", parentRel: n.rel, kind: "file", siblings: n.children.map((c) => c.name) });
                            }}>新建文件</button>
                            <button role="menuitem" onClick={() => {
                              setMenuRel(null);
                              setServerError(null);
                              setInline({ mode: "new", parentRel: n.rel, kind: "dir", siblings: n.children.map((c) => c.name) });
                            }}>新建文件夹</button>
                          </>
                        )}
                        <button role="menuitem" onClick={() => {
                          setMenuRel(null);
                          setServerError(null);
                          setInline({ mode: "rename", rel: n.rel, siblings: nodes.map((x) => x.name) });
                        }}>重命名</button>
                        <button role="menuitem" className="menu-danger" onClick={() => {
                          setMenuRel(null);
                          setPendingTrash(n);
                        }}>删除</button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {inline?.mode === "new" && inline.parentRel === n.rel && inlineInput(
                "",
                inline.siblings,
                inline.kind === "file" ? "新建笔记.md" : "文件夹名称",
                (name) => void confirmNew(n.rel, inline.kind, name),
                { paddingLeft: depth * 16 + 24 },
              )}
              {n.kind === "dir" && expanded.has(n.rel) && (
                <FileTree nodes={n.children} depth={depth + 1} onOpenFile={onOpenFile} />
              )}
            </li>
          );
        })}
      </ul>
      {pendingTrash && (
        <Modal label="删除确认" onClose={() => setPendingTrash(null)}>
          <h1>删除</h1>
          <p className="modal-desc">删除 “{displayName(pendingTrash.name)}”？此操作将移入废纸篓。</p>
          <div className="modal-actions">
            <button className="btn-primary btn-danger" onClick={() => void confirmTrash()}>删除</button>
            <button className="btn" onClick={() => setPendingTrash(null)}>取消</button>
          </div>
        </Modal>
      )}
    </>
  );
}
