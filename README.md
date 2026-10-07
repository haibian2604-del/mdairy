# mdairy

一款本地优先的桌面 Markdown 笔记软件——打开一个文件夹，所见即所得地编辑其中的 `.md` 文件。

纯本地、无服务器、无私有格式：笔记就是硬盘上的普通文件，不被任何工具锁定。

## 当前状态

**M1–M6 里程碑全部完成，日常可用**；dmg 打包（`pnpm tauri build`，未配签名公证）待复检后进行。

- Typora 式 WYSIWYG 编辑（Milkdown / ProseMirror），启动即开全新未命名缓冲区（不恢复上次会话）；⌘N 新建，⌘S 保存（vault 内转正为真实文件，vault 外落盘后关闭）
- 打开文件夹（vault），文件树 CRUD（新建 / 重命名 / 删除进废纸篓），多标签页与未保存标记，关闭前确认
- 外部修改冲突三选（从磁盘重载 / 保留我的版本 / 取消）；GBK 等非 UTF-8 编码自动识别
- 全文搜索（范围限定活动文件所在文件夹，含子目录）；大纲（跟随编辑滚动高亮、点击跳转）；命令面板（⌘⇧P 命令+文件 / ⌘P 快速打开）
- 图片粘贴 / 拖入自动存 `vault/_assets/`，插入相对路径
- 原生 macOS 菜单栏：**Theme**（跟随系统 / 浅色 / 深色）、**Sidebar**（文件 / 搜索 / 大纲，记住上次勾选）、**File**（新建文件 ⌘N、打开文件夹 ⌘O、打开文件）
- 暗色主题（跟随系统 + 手动，首帧无闪烁）、克制的动效与 `prefers-reduced-motion` 适配
- 安全与稳健：路径穿越防护（拒绝 `..` 与越界）、文件监听实时响应外部变更、WCAG AA 对比度与键盘可达、中文输入法（IME）组合态正确处理

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19 + TypeScript + Vite |
| 状态管理 | Zustand |
| 编辑器 | Milkdown（Crepe / ProseMirror） |
| 测试 | Vitest + Testing Library（前端）· cargo test（Rust） |

## 本地开发

前置要求：Node 18+、pnpm、Rust stable、Xcode Command Line Tools（macOS）。

```bash
pnpm install
pnpm tauri dev      # 开发模式，热重载
pnpm tauri build    # 打包
```

测试：

```bash
pnpm test           # 前端（Vitest）
cd src-tauri && cargo test   # Rust
```

## 项目结构

```
src-tauri/src/
  workspace.rs   vault 选择与路径校验
  files.rs       文件树/读写/CRUD/图片资产，编码检测，路径穿越防护
  search.rs      全文搜索（范围限定、跳过隐藏与 _assets）
  watcher.rs     外部文件变更监听与事件推送
  menu.rs        原生菜单（Theme/Sidebar/File）与勾选态同步
src/
  api.ts         Tauri command 封装（前后端唯一边界）
  stores/        workspace（文件树/工作区）、tabs（标签页/脏状态/保存）、
                 search（搜索）、settings（主题）、ui（侧栏显隐/视图）
  components/    AppShell / Sidebar / FileTree / TabBar / MilkdownPane /
                 OutlinePanel / SearchPanel / CommandPalette / Modal / 弹窗与状态栏
  lib/           assetPaths（图片路径往返）、pickVault（系统对话框打开）、
                 headings（大纲提取）、commands（命令面板注册表）
  hooks/         useVaultEvents（vault 变更事件 → 刷新树/冲突处理）
docs/
  开发文档.md       立项分析、需求共识、技术栈、里程碑
  页面需求文档.md   设计系统与界面交互规格
```

## 文档

- [开发文档](docs/开发文档.md)——产品定义、参考项目（SoloMD）分析、已确认的需求共识
- [页面需求文档](docs/页面需求文档.md)——设计系统（色彩/字体/布局）、界面交互规格、验收清单
- [PRODUCT.md](PRODUCT.md)——产品上下文（用户、定位、原则、无障碍底线）
