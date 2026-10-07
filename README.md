# mdairy

一款本地优先的桌面 Markdown 笔记软件——打开一个文件夹，查看和编辑其中的 `.md` 文件。

纯本地、无服务器、无私有格式：笔记就是硬盘上的普通文件，不被任何工具锁定。

## 当前状态

项目处于 **M1 里程碑（骨架）已完成** 阶段，已可日常使用的基础功能：

- 打开文件夹（vault），启动为全新未命名笔记（Typora 式，不恢复上次会话）
- 文件树浏览（过滤非 md 文件与 `_assets/`），多标签页编辑
- Milkdown（ProseMirror）WYSIWYG 编辑，⌘S 保存，未保存圆点标记
- 路径安全防护（拒绝 `..` 与越界路径）与文件读写
- 亮/暗双主题设计 token（跟随系统）
- 全中文界面

规划中（按里程碑推进，详见 [开发文档](docs/开发文档.md)）：

- **M2** 编辑闭环：外部修改冲突处理、GBK 等编码识别、关闭确认
- **M3** 渲染：markdown-it 预览、三态视图（编辑/分栏/预览）、KaTeX/Mermaid
- **M4** 检索导航：全文搜索、大纲、命令面板
- **M5** 收尾：图片粘贴、文件 CRUD、应用图标与打包

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Tauri 2（Rust） |
| 前端 | React 19 + TypeScript + Vite |
| 状态管理 | Zustand |
| 编辑器 | CodeMirror 6 |
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
  workspace.rs   工作区选择与路径校验
  files.rs       文件列树/读/存，路径穿越防护
  watcher.rs     外部文件变更监听（M2）
src/
  api.ts         Tauri command 封装（前后端唯一边界）
  stores/        workspace（文件树/工作区）、tabs（标签页/脏状态/保存）
  components/    AppShell / Sidebar / FileTree / TabBar / MilkdownPane / StatusBar
  hooks/         useVaultEvents
docs/
  开发文档.md       立项分析、需求共识、技术栈、里程碑
  页面需求文档.md   设计系统与界面交互规格
```

## 文档

- [开发文档](docs/开发文档.md)——产品定义、参考项目（SoloMD）分析、已确认的需求共识
- [页面需求文档](docs/页面需求文档.md)——设计系统（色彩/字体/布局）、界面交互规格、验收清单
- [M1 实施计划](docs/superpowers/plans/2026-10-03-mdairy-m1-skeleton.md)——首个里程碑的逐任务实施记录
