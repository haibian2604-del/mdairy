import { useMemo } from "react";
import type { SearchHit } from "../api";
import { byteColumnToCharIndex, useSearchStore } from "../stores/search";
import { useTabsStore } from "../stores/tabs";

/**
 * 命中行渲染：lineText 切成 [前缀, 命中词, 后缀] 三段（React 节点，非 innerHTML），
 * 命中词段用 <mark> 高亮。column 是 Rust 侧 UTF-8 字节偏移，先换算字符索引。
 */
function HitLine({ hit, matchLen, onJump }: {
  hit: SearchHit;
  matchLen: number;
  onJump: (rel: string, line: number) => void;
}) {
  const chars = Array.from(hit.lineText);
  const start = byteColumnToCharIndex(hit.lineText, hit.column);
  const before = chars.slice(0, start).join("");
  const match = chars.slice(start, start + matchLen).join("");
  const after = chars.slice(start + matchLen).join("");
  return (
    <button className="search-hit-row" onClick={() => onJump(hit.rel, hit.line)}>
      {before}
      {match !== "" && <mark>{match}</mark>}
      {after}
    </button>
  );
}

export function SearchPanel() {
  const query = useSearchStore((s) => s.query);
  const hits = useSearchStore((s) => s.hits);
  const searching = useSearchStore((s) => s.searching);
  const setQuery = useSearchStore((s) => s.setQuery);
  const requestJump = useTabsStore((s) => s.requestJump);

  const trimmed = query.trim();
  const matchLen = Array.from(trimmed).length;

  // 按文件分组：rel → 命中行列表（保持返回顺序）
  const groups = useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const h of hits) {
      const list = map.get(h.rel);
      if (list) list.push(h);
      else map.set(h.rel, [h]);
    }
    return [...map.entries()];
  }, [hits]);

  return (
    <div className="search-panel">
      <input
        className="search-input"
        type="text"
        placeholder="搜索全部笔记…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {trimmed === "" ? null : (
        <>
          {hits.length > 0 && <div className="search-summary">{hits.length} 处</div>}
          {hits.length === 0 && !searching && (
            <div className="search-empty">没有找到与 “{trimmed}” 匹配的内容</div>
          )}
          {groups.map(([rel, list]) => (
            <div key={rel} className="search-group">
              <div className="search-group-name">{rel.replace(/\.md$/i, "")}</div>
              {list.map((h, i) => (
                <HitLine
                  key={`${h.line}-${h.column}-${i}`}
                  hit={h}
                  matchLen={matchLen}
                  onJump={(rel, line) => void requestJump(rel, line)}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
