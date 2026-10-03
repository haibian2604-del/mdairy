import { convertFileSrc } from "@tauri-apps/api/core";

// 限定内联图片/链接的 `](path)` 形态（引用式 ![alt][ref] 与 HTML img 不在处理范围，
// vault 内图片当前只由 _assets 内联语法产生）。
// 路径段不含空白与右括号：含空格的路径（如 `_assets/中文 图.png`）不匹配、原样保留。
const INLINE_PATH_RE = /(!?\]\()([^\s)]+)(?=\))/g;

// 非 vault 相对路径的形态：外链、已转换的 asset URL、data URI、页内锚点、文件系统绝对路径
const NOT_VAULT_RELATIVE_RE = /^(https?:\/\/|asset:|data:|#|\/)/;

function assetUrlFor(path: string, vault: string): string | null {
  if (NOT_VAULT_RELATIVE_RE.test(path)) return null;
  return convertFileSrc(`${vault}/${path}`);
}

// 存储形态（磁盘原文）→ 编辑器形态：相对路径替换为可被 webview 加载的 asset URL
export function toEditableMarkdown(md: string, vault: string): string {
  if (!vault) return md;
  return md.replace(INLINE_PATH_RE, (whole, prefix: string, path: string) => {
    const url = assetUrlFor(path, vault);
    return url === null ? whole : prefix + url;
  });
}

// 编辑器形态 → 存储形态：asset URL 还原为 vault 相对路径（仅还原本 vault 下的路径）
export function toStoredMarkdown(md: string, vault: string): string {
  if (!vault) return md;
  return md.replace(INLINE_PATH_RE, (whole, prefix: string, path: string) => {
    // macOS/Linux 的 convertFileSrc 产物：asset://localhost/<encodeURIComponent(绝对路径)>
    const m = /^asset:\/\/localhost\/(.+)$/.exec(path);
    if (!m) return whole;
    let decoded: string;
    try {
      decoded = decodeURIComponent(m[1]);
    } catch {
      return whole; // 非法百分号编码，原样保留
    }
    if (!decoded.startsWith(`${vault}/`)) return whole; // 其他 vault 的资源不动
    return prefix + decoded.slice(vault.length + 1);
  });
}
