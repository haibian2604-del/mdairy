use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, MenuItem, Menu, Submenu},
    Emitter, Manager, Runtime,
};

/// 主题三项的勾选态句柄：菜单点击 → emit 给前端；前端状态栏切换 → sync 命令回写勾选。
struct ThemeMenuState<R: Runtime> {
    items: Mutex<Option<Vec<CheckMenuItem<R>>>>,
}

/// 边栏视图三项（文件/搜索/大纲）的勾选态句柄；全部不勾 = 边栏隐藏。
struct SidebarMenuState<R: Runtime> {
    items: Mutex<Option<Vec<CheckMenuItem<R>>>>,
}

const IDS: [&str; 3] = ["theme-system", "theme-light", "theme-dark"];
const MODES: [&str; 3] = ["system", "light", "dark"];
const SIDEBAR_IDS: [&str; 3] = ["sidebar-files", "sidebar-search", "sidebar-outline"];
const SIDEBAR_MODES: [&str; 3] = ["files", "search", "outline"];
/// File 菜单动作项：id 即 file-menu 事件 payload，前端直接按动作名分发
const FILE_ACTIONS: [&str; 3] = ["new-file", "open-folder", "open-file"];

/// 在默认 macOS 菜单（File/Edit/View/Window/Help）末尾追加 Theme 与 Sidebar 子菜单。
pub fn init<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let menu = Menu::default(app)?;

    // 默认 File 子菜单仅在 macOS/Windows 构建且无保留 id（只有 Window/Help 有）：
    // 按标题查找后把常用动作前置到 Close Window 之前，找不到则跳过
    if let Some(file) = menu.items()?.into_iter().find_map(|item| {
        let sub = item.as_submenu()?;
        (sub.text().ok().as_deref() == Some("File")).then(|| sub.clone())
    }) {
        let new_file = MenuItem::with_id(app, "new-file", "新建文件", true, Some("CmdOrCtrl+N"))?;
        let open_folder =
            MenuItem::with_id(app, "open-folder", "打开文件夹…", true, Some("CmdOrCtrl+O"))?;
        let open_file = MenuItem::with_id(app, "open-file", "打开文件…", true, None::<&str>)?;
        // 逐个前置 → 最终顺序：新建文件 / 打开文件夹… / 打开文件… / 关闭窗口
        file.prepend(&open_file)?;
        file.prepend(&open_folder)?;
        file.prepend(&new_file)?;
    }

    let theme = Submenu::with_id(app, "theme-submenu", "Theme", true)?;
    let theme_items = vec![
        CheckMenuItem::with_id(app, IDS[0], "跟随系统", true, true, None::<&str>)?,
        CheckMenuItem::with_id(app, IDS[1], "浅色", true, false, None::<&str>)?,
        CheckMenuItem::with_id(app, IDS[2], "深色", true, false, None::<&str>)?,
    ];
    for item in &theme_items {
        theme.append(item)?;
    }
    menu.append(&theme)?;

    let sidebar = Submenu::with_id(app, "sidebar-submenu", "Sidebar", true)?;
    let sidebar_items = vec![
        CheckMenuItem::with_id(app, SIDEBAR_IDS[0], "文件", true, true, None::<&str>)?,
        CheckMenuItem::with_id(app, SIDEBAR_IDS[1], "搜索", true, false, None::<&str>)?,
        CheckMenuItem::with_id(app, SIDEBAR_IDS[2], "大纲", true, false, None::<&str>)?,
    ];
    for item in &sidebar_items {
        sidebar.append(item)?;
    }
    menu.append(&sidebar)?;

    app.set_menu(menu)?;
    app.manage(ThemeMenuState { items: Mutex::new(Some(theme_items)) });
    app.manage(SidebarMenuState { items: Mutex::new(Some(sidebar_items)) });
    Ok(())
}

/// 菜单事件：主题项 → emit theme-menu；边栏项 → emit sidebar-menu（前端 setSidebarTab
/// 自带"再点当前项=收起边栏"语义）。
pub fn on_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) {
    if let Some(idx) = IDS.iter().position(|i| *i == id) {
        set_theme_checks(app, MODES[idx]);
        let _ = app.emit("theme-menu", MODES[idx]);
        return;
    }
    if let Some(idx) = SIDEBAR_IDS.iter().position(|i| *i == id) {
        set_sidebar_checks(app, Some(SIDEBAR_MODES[idx]));
        let _ = app.emit("sidebar-menu", SIDEBAR_MODES[idx]);
        return;
    }
    if FILE_ACTIONS.contains(&id) {
        let _ = app.emit("file-menu", id);
    }
}

fn set_theme_checks<R: Runtime>(app: &tauri::AppHandle<R>, mode: &str) {
    let state = app.state::<ThemeMenuState<R>>();
    let guard = state.items.lock().unwrap();
    if let Some(items) = guard.as_ref() {
        for (i, item) in items.iter().enumerate() {
            let _ = item.set_checked(MODES[i] == mode);
        }
    }
}

/// mode=None → 三项全部不勾（边栏隐藏）。
fn set_sidebar_checks<R: Runtime>(app: &tauri::AppHandle<R>, mode: Option<&str>) {
    let state = app.state::<SidebarMenuState<R>>();
    let guard = state.items.lock().unwrap();
    if let Some(items) = guard.as_ref() {
        for (i, item) in items.iter().enumerate() {
            let _ = item.set_checked(mode == Some(SIDEBAR_MODES[i]));
        }
    }
}

/// 前端主题变化（状态栏按钮/持久化恢复）→ 回写菜单勾选态。
#[tauri::command]
pub fn sync_theme_menu<R: Runtime>(app: tauri::AppHandle<R>, mode: String) {
    if MODES.contains(&mode.as_str()) {
        set_theme_checks(&app, &mode);
    }
}

/// 前端边栏状态（页签切换/显隐按钮/⌘⇧O）→ 回写菜单勾选态；None = 边栏隐藏。
#[tauri::command]
pub fn sync_sidebar_menu<R: Runtime>(app: tauri::AppHandle<R>, mode: Option<String>) {
    let valid = mode.as_deref().filter(|m| SIDEBAR_MODES.contains(m));
    set_sidebar_checks(&app, valid);
}
