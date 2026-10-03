import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((p: string) => `asset://localhost/${encodeURIComponent(p)}`),
  invoke: vi.fn(),
}));

import { toEditableMarkdown, toStoredMarkdown } from "./assetPaths";

const VAULT = "/canon/v";

describe("assetPaths", () => {
  it("相对图片路径转为 asset URL，外链与已转换的不动", () => {
    const md = "![](_assets/p.png)\n![外](https://x.com/a.png)\n[链接](_assets/doc.md)";
    const out = toEditableMarkdown(md, VAULT);
    expect(out).toContain(`asset://localhost/${encodeURIComponent(VAULT + "/_assets/p.png")}`);
    expect(out).toContain("https://x.com/a.png");
    expect(out).not.toContain("](_assets/");
  });

  it("往返恒等：含相对图片的文档转换后还原", () => {
    const md = "# 标题\n\n![](_assets/中文 图.png)\n正文";
    expect(toStoredMarkdown(toEditableMarkdown(md, VAULT), VAULT)).toBe(md);
  });

  it("无图片的文档是恒等函数", () => {
    const md = "# 纯文本\n- 列表";
    expect(toEditableMarkdown(md, VAULT)).toBe(md);
    expect(toStoredMarkdown(md, VAULT)).toBe(md);
  });
});
