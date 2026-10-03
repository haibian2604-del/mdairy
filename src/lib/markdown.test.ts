import { describe, expect, it } from "vitest";
import { renderMarkdown, MERMAID_PLACEHOLDER_CLASS } from "./markdown";

describe("renderMarkdown", () => {
  it("渲染 GFM 表格与删除线", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~划线~~");
    expect(html).toContain("<table>");
    expect(html).toContain("<del>划线</del>");
  });

  it("任务列表渲染 checkbox 且禁用不回写", () => {
    const html = renderMarkdown("- [ ] 未完成\n- [x] 已完成");
    expect(html).toContain("<input");
    expect(html).toContain("disabled");
  });

  it("代码块走 highlight.js，未知语言转义输出", () => {
    const html = renderMarkdown("```js\nconst a = 1;\n```");
    expect(html).toContain("hljs");
    const plain = renderMarkdown("```\n<b>not html</b>\n```");
    expect(plain).not.toContain("<b>not html</b>");
  });

  it("KaTeX 行内公式", () => {
    const html = renderMarkdown("$E=mc^2$");
    expect(html).toContain("katex");
  });

  it("mermaid 块渲染为占位符并携带转义后的源码", () => {
    const html = renderMarkdown("```mermaid\ngraph TD; A-->B;\n```");
    expect(html).toContain(MERMAID_PLACEHOLDER_CLASS);
    expect(html).toContain(`data-mermaid="graph TD; A--&gt;B;"`);
    expect(html).not.toContain("<svg");
  });

  it("块级元素携带 data-source-line（0 基起始行）", () => {
    const html = renderMarkdown("第一段\n\n## 标题");
    expect(html).toContain('data-source-line="0"');
    expect(html).toContain('data-source-line="2"');
  });

  it("DOMPurify 消毒：script 与事件属性被剥离", () => {
    const html = renderMarkdown("<script>alert(1)</script>文本\n\n<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).toContain("文本");
  });

  it("html: false——内联 HTML 标签转义为文本", () => {
    expect(renderMarkdown("<b>x</b>")).not.toContain("<b>");
  });
});
