import { describe, expect, it } from "vitest";
import { extractHeadings } from "./headings";

describe("extractHeadings", () => {
  it("提取标题层级与行号，跳过代码块内的 #", () => {
    const content = "# 一级\n正文\n```\n# 不是标题\n```\n## 二级\n### 三级";
    expect(extractHeadings(content)).toEqual([
      { level: 1, text: "一级", line: 0 },
      { level: 2, text: "二级", line: 5 },
      { level: 3, text: "三级", line: 6 },
    ]);
  });

  it("波浪线围栏同样跳过，无标题返回空", () => {
    expect(extractHeadings("~~~\n# nope\n~~~")).toEqual([]);
    expect(extractHeadings("没有标题")).toEqual([]);
  });
});
