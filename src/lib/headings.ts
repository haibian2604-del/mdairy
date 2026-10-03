/** 文档大纲：单个标题（层级 1-6、文本、0 基行号） */
export interface Heading {
  level: number;
  text: string;
  line: number;
}

// 顶栏围栏（``` / ~~~）：CommonMark 允许至多 3 个前导空格
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
// ATX 标题：行首 #{1,6} 后须有空白再接文本（"#tag" 不算标题）
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+)$/;

/**
 * 单遍扫描提取标题。fenced code（``` 与 ~~~）内的 # 不算标题：
 * 状态机记录开栏字符，闭栏必须与开栏同字符（``` 内的 ~~~ 行不闭合，反之亦然）。
 * line 为 0 基行号，供大纲点击后按块级节点序近似定位。
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  let fenceChar: string | null = null;
  const lines = content.split("\n");
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    const fence = FENCE_RE.exec(text);
    if (fence) {
      const ch = fence[1][0];
      if (fenceChar === null) fenceChar = ch; // 开栏
      else if (fenceChar === ch) fenceChar = null; // 同字符闭栏
      continue;
    }
    if (fenceChar !== null) continue; // 围栏内：跳过
    const m = HEADING_RE.exec(text);
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line });
  }
  return headings;
}
