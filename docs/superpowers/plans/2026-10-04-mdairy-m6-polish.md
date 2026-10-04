# mdairy M6（收尾·除打包）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 主题三态切换、图片粘贴进 `_assets/`、文件 CRUD（新建/重命名/删除进废纸篓）、⌘⇧P 开关语义、mermaid 预览评估。**不含 dmg 打包**——用户在 M6 验收后自行页面检查修复，再单独做最终打包。

**Architecture:** 全部复用既有模式：文件 CRUD = files.rs 新增三个薄 command + FileTree 行内 `⋯` 菜单与内联输入（modal 样式复用）；主题 = 极简 settings store（persist 三态）+ `data-theme` 属性驱动既有 CSS 暗色块；图片粘贴 = Rust `write_asset` 二进制 command + MilkdownPane paste 拦截，插入 asset URL 形态的 markdown（toStoredMarkdown 既有往返自动还原为相对路径）。

**Tech Stack:** 既有栈；Rust 新增 `trash` crate（废纸篓删除，1 个调用）。

**Spec:** [docs/开发文档.md](../../开发文档.md) §4 F2/F10/F12、§7 M6 · [docs/页面需求文档.md](../../页面需求文档.md) W5/§3 W1-B/§4

## Global Constraints

- 继承全部项目约束：UI 中文、单组件 ≤400 行、Lucide 图标、无 emoji、serde camelCase、路径安全（CRUD 命令全部走 resolve_secure 语义）、离线无 CDN、conventional commits。
- 删除必须进废纸篓（`trash` crate），不直接 rm。
- 图片文件名 `YYYYMMDD-HHmmss.<ext>`，存 `vault/_assets/`（目录不存在则创建）；ext 只接受 png/jpg/jpeg/gif/webp。
- 真机冒烟红线（CJS 教训）继续适用于所有涉编辑器的任务。
- 主题暗色 CSS 从 `@media + :root:not([data-theme="light"])` 切换为 `[data-theme="dark"]` 单一驱动（App 每次渲染把解析后的三态写到 root 上），历史 task-lists patch 无关不受影响。

## 本计划不做（用户明确与裁定）

- **dmg 打包**：用户 M6 验收 + 页面检查修复后单独执行。
- posToPos 精确定位增强（近似 ±1 块已满足，真需要再说）。
- `mdairy-settings` 残留 localStorage key（无消费者，纯用户侧旧数据，代码无物可删）。
- ⌘⇧F 重复按语义、⌘⇧P 开关语义之外的关闭途径（按需再说）。
- mermaid 图形预览：只做评估（T4），默认结论"后置"，除非存在 ≤半天的集成路径。

---

### Task 1: 文件 CRUD（Rust 命令 + FileTree 操作）

**Files:**
- Modify: `src-tauri/src/files.rs`（三个 command + 测试）、`src-tauri/Cargo.toml`（`cargo add trash`）
- Modify: `src/api.ts`、`src/components/FileTree.tsx`（⋯ 菜单 + 内联输入 + 删除确认复用 modal 样式）、`src/hooks/useOpenFile.ts`（不动，消费方适配）、`src/stores/workspace.ts`（refreshTree 已有）、`src/styles.css`

**Interfaces:**
- Produces: `create_entry(vault, parent_rel, name, kind: "file"|"dir")`（name 拒绝 `/`、`\`、`..`；重名拒绝）；`rename_entry(vault, rel, new_name)`（同名校验；新路径父目录与原父目录一致）；`trash_entry(vault, rel)`（trash::delete）。FileTree：行 hover `⋯` 菜单（新建文件/新建文件夹/重命名/删除——文件夹行另可"在此新建"）；目标位置内联输入行（回车确认/esc/失焦取消、重名红框行内提示）；删除弹确认（复用 `.modal-*` 样式，danger 主按钮）；操作成功后 `refreshTree()`；重命名/删除已打开文件时同步 tabs（重命名→更新 rel/name/重新 readFile；删除→close）。
- tabs 同步：`tabsStore` 新增 `renameTab(oldRel, newRel)`（保持脏状态：content 不变，savedContent 不变——磁盘内容未变）与既有 close 复用。

- [ ] **Step 1: Rust 测试先行**（create/rename/trash 各 1 测试 + 重名拒绝 + name 非法拒绝，约 5 用例）→ 红
- [ ] **Step 2: 实现**（每个 command ≤20 行，路径校验复用 resolve_secure/resolve_for_save 语义）→ 绿；`cargo test` 14+5=19
- [ ] **Step 3: 前端**（api.ts 三方法 → FileTree 菜单/内联输入/确认框 → tabs.renameTab + 消费）TDD：tabs.renameTab 1 测试 + FileTree 交互 2 测试（菜单展开、内联确认回调）
- [ ] **Step 4: 真机冒烟（红线）**：新建文件→输入→⌘S；重命名已打开文件→标签跟随；删除已打开文件→标签关闭；Finder 校验删除进废纸篓。截图入报告。
- [ ] **Step 5: Commit** `feat: file crud with trash deletion and tree operations`

---

### Task 2: 主题三态 + ⌘⇧P 开关

**Files:**
- Create: `src/stores/settings.ts`（极简：`{ themeMode: "system"|"light"|"dark", cycleTheme() }`，persist key `mdairy-theme`）
- Modify: `src/App.tsx`（effect：解析三态→`document.documentElement.dataset.theme`；statusBar 区域加主题按钮）、`src/components/StatusBar.tsx`（按钮：Sun/Moon/Monitor 图标循环，title 中文提示）、`src/styles.css`（暗色块选择器改 `[data-theme="dark"]`）、`src/components/CommandPalette.tsx`（不改，开关语义在 App）

**Interfaces:**
- Produces: 状态栏右侧主题按钮，循环 system→light→dark→system；`[data-theme="dark"|"light"]` 恒在 root 上（system 态由 matchMedia 解析并监听变化）；⌘⇧P：`setPaletteMode(p => (p === target ? null : target))`——再按同模式关闭。

- [ ] **Step 1: settings 测试**（默认 system、cycle 顺序、persist 写入）→ 红
- [ ] **Step 2: 实现**（settings ≤25 行；App effect 含 matchMedia change 监听清理；CSS 选择器替换为 `[data-theme="dark"]`，亮色 token 保持 :root 默认）→ 绿
- [ ] **Step 3: ⌘⇧P 开关**（App 内一行函数式 setState）+ 1 测试可选（键盘事件已在既有测试模式覆盖外，真机验证为准）
- [ ] **Step 4: 真机冒烟**：三态循环按钮、暗色全 UI（含 milkdown/crepe 变量覆盖仍生效）、重启保持、⌘⇧P 再按关闭。
- [ ] **Step 5: Commit** `feat: theme mode cycle with status bar switch and palette toggle`

---

### Task 3: 图片粘贴

**Files:**
- Modify: `src-tauri/src/files.rs`（`write_asset` command + 2 测试：正常写入/非法 ext 拒绝）、`src/api.ts`
- Modify: `src/components/MilkdownPane.tsx`（容器 onPaste 拦截）

**Interfaces:**
- Produces: `write_asset(vault, ext: String, data: Vec<u8>) -> Result<String, String>`（ext ∈ {png,jpg,jpeg,gif,webp}，文件名时间戳，返回 rel 如 `_assets/20261004-153000.png`；`_assets` 不存在则创建）。MilkdownPane：paste 事件含图片文件 → preventDefault → `arrayBuffer()` → invoke → 在光标处插入 `![img](<convertFileSrc(vault/rel)>)`（asset URL 形态——编辑器立即可渲染，保存时 toStoredMarkdown 既有往返自动转回相对路径）；插入用 milkdown `insertMarkdown`（@milkdown/kit/utils，以实包为准；不可用则 `editor.action(replaceAll(当前文档+插入))` 降级并记录）。非图片粘贴不拦截。

- [ ] **Step 1: Rust 测试**（2 用例）→ 红 → 实现 → 绿（19+2=21）
- [ ] **Step 2: 前端**（api + paste 拦截；MilkdownPane 组件测试 1 条：mock clipboard 事件调用 writeAsset 并断言 insertMarkdown 收到 asset URL）
- [ ] **Step 3: 真机冒烟（红线）**：截图 → Cmd+Ctrl+Shift+4 复制 → 编辑器 ⌘V → 图片显示；⌘S → 磁盘 md 为 `_assets/…` 相对路径且文件存在。截图入报告。
- [ ] **Step 4: Commit** `feat: paste images into _assets with instant preview`

---

### Task 4: mermaid 评估 + 回归 + 人工验收

**Files:** 无新代码（评估结论为"集成"才加）；仅修复验收问题。

- [ ] **Step 1: mermaid 评估**（controller 派一名子代理调查：Crepe/ProseMirror 下 code block 渲染替换的现成路径是否存在 ≤半天的集成方案；结论"后置"则台账记录一句理由，"可行"则出补充计划征用户确认）
- [ ] **Step 2: 全量回归**：`pnpm test && pnpm build && cd src-tauri && cargo test`
- [ ] **Step 3: 人工验收清单（用户执行）**：

- [ ] 文件树：新建文件/文件夹、重命名（已打开标签跟随）、删除（确认框、进废纸篓、已打开标签关闭）
- [ ] 重名/非法名字行内红框提示
- [ ] 状态栏主题按钮三态循环；暗色下全部 UI（含编辑器/搜索/大纲/面板）可读；重启保持
- [ ] ⌘⇧P 再按关闭；⌘P files 模式正常
- [ ] 截图粘贴：⌘V 后图片立即显示；⌘S 后磁盘为 `_assets/` 相对路径
- [ ] 搜索/大纲/命令面板/WYSIWYG 无回归（重点：⌘S、冲突弹窗、GBK）
- [ ] devtools 无 console 报错

- [ ] **Step 4: 收尾（controller，验收通过后）**：合并 main、推送、`git tag m6-done`、台账关闭。**不打包 dmg**（用户页面检查后另行执行，届时可参考 tauri build + 图标设置）。

---

## Self-Review 记录

1. **Spec 覆盖**：F2 完整版 CRUD（T1）、F10 主题按钮（T2）、F12 图片粘贴（T3）、mermaid 评估（T4）、⌘⇧P 开关（T2，预检裁定并入）；dmg 明确移出。✅
2. **占位符扫描**：insertMarkdown 以实包为准为执行注记（含降级路径），无 TBD。✅
3. **类型一致性**：write_asset 返回 rel ↔ 插入 URL 构造；renameTab(oldRel,newRel) ↔ FileTree 重命名调用；themeMode 三态 ↔ CSS 选择器。✅
