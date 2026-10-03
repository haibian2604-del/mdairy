import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import type { TreeNode } from "../api";

const displayName = (name: string) => name.replace(/\.md$/i, "");

export function FileTree({ nodes, depth = 0, onOpenFile }: {
  nodes: TreeNode[];
  depth?: number;
  onOpenFile: (rel: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (nodes.length === 0) {
    return depth === 0 ? <div className="tree-empty">空文件夹</div> : null;
  }
  const toggle = (rel: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(rel)) n.delete(rel); else n.add(rel);
      return n;
    });

  return (
    <ul className="file-tree" role="tree">
      {nodes.map((n) => (
        <li key={n.rel} role="treeitem" aria-expanded={n.kind === "dir" ? expanded.has(n.rel) : undefined}>
          {n.kind === "dir" ? (
            <button className="tree-row" style={{ paddingLeft: depth * 16 + 8 }} onClick={() => toggle(n.rel)}>
              {expanded.has(n.rel)
                ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {expanded.has(n.rel)
                ? <FolderOpen size={16} /> : <Folder size={16} />}
              <span>{n.name}</span>
            </button>
          ) : (
            <button className="tree-row" style={{ paddingLeft: depth * 16 + 24 }} onClick={() => onOpenFile(n.rel)}>
              <FileText size={16} />
              <span>{displayName(n.name)}</span>
            </button>
          )}
          {n.kind === "dir" && expanded.has(n.rel) && (
            <FileTree nodes={n.children} depth={depth + 1} onOpenFile={onOpenFile} />
          )}
        </li>
      ))}
    </ul>
  );
}
