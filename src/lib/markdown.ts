import MarkdownIt from "markdown-it";
import taskLists from "@hedgedoc/markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

export const MERMAID_PLACEHOLDER_CLASS = "mermaid-block";

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (str: string, lang: string) => {
    if (lang === "mermaid") {
      // trim 掉围栏携带的首尾空白，占位属性只承载 mermaid 源码本身
      return `<pre class="${MERMAID_PLACEHOLDER_CLASS}" data-mermaid="${md.utils.escapeHtml(str.trim())}"></pre>`;
    }
    const body =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        : md.utils.escapeHtml(str);
    return `<pre class="hljs"><code>${body}</code></pre>`;
  },
});

// 外链加 target/rel（DOMPurify 需 ADD_ATTR 放行 target）
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") ?? "";
  if (/^https?:\/\//.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// 块级锚点：滚动同步与 M4 大纲共用的基建。
// table 开标签保持 <table> 原样，表格块锚点由其子元素（thead/tr）承担。
md.core.ruler.push("source-line", (state) => {
  for (const tok of state.tokens) {
    if (tok.map && !tok.hidden && tok.tag !== "table") {
      tok.attrSet("data-source-line", String(tok.map[0]));
    }
  }
});

// html: false 下，原始 HTML 会以转义文本形式残留在输出中（如 onerror=... 的明文）。
// 在 token 层剥离正文里标签形态的文本，注入型内容不留痕迹；
// 围栏代码块与行内代码是独立 token 类型，不受影响（仍按转义文本完整显示）。
md.core.ruler.push("strip-raw-html", (state) => {
  for (const tok of state.tokens) {
    if (tok.type !== "inline" || !tok.children) continue;
    for (const child of tok.children) {
      if (child.type === "text") {
        child.content = child.content.replace(/<\/?[a-zA-Z][^>]*>/g, "");
      }
    }
  }
});

// 对齐 markdown-it 15 的 GFM 语义：~~文字~~ 渲染 <del>（单个 ~ 仍为 <s>）。
// v14 一律输出 <s>，按 markup 区分改写 token 类型。
md.core.ruler.push("double-tilde-del", (state) => {
  for (const tok of state.tokens) {
    if (tok.type !== "inline" || !tok.children) continue;
    for (const child of tok.children) {
      if (child.markup !== "~~") continue;
      if (child.type === "s_open") {
        child.type = "del_open";
        child.tag = "del";
      } else if (child.type === "s_close") {
        child.type = "del_close";
        child.tag = "del";
      }
    }
  }
});

md.use(taskLists, { enabled: false, label: true });
md.use(katexPlugin);

// DOMPurify 的 SAFE_FOR_XML（默认开）会剥离含 "-->" 的属性值，而 mermaid 源码几乎必含箭头。
// 消毒前摘下 data-mermaid 的值（escapeHtml 产物，不含引号，仅出现在我们生成的标签上），
// 消毒后原位回填，DOMPurify 其余防护全部保留。
const MERMAID_ATTR_STASH = "mdairy-mmd-stash-";

export function renderMarkdown(content: string): string {
  const stash: string[] = [];
  const stripped = md.render(content).replace(
    /data-mermaid="([^"]*)"/g,
    (_m, value: string) => {
      stash.push(value);
      return `data-mermaid="${MERMAID_ATTR_STASH}${stash.length - 1}"`;
    },
  );
  const clean = DOMPurify.sanitize(stripped, {
    ADD_ATTR: ["target", "data-source-line", "data-mermaid"],
  });
  return clean.replace(
    new RegExp(`data-mermaid="${MERMAID_ATTR_STASH}(\\d+)"`, "g"),
    (_m, i: string) => `data-mermaid="${stash[Number(i)]}"`,
  );
}
