mod files;
mod menu;
mod search;
mod watcher;
mod workspace;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// 系统请求打开的文件路径缓冲。启动竞态兜底：双击 md 冷启动时 Opened 事件
/// 可能先于 webview 就绪到达，先入缓冲，前端挂载后经 take_opened_files 领取；
/// 运行期则同时 emit("open-paths") 即时分发。
pub struct OpenedFiles(pub Mutex<Vec<String>>);

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedFiles(Mutex::new(Vec::new())))
        .manage(watcher::WatcherState(std::sync::Mutex::new(None)))
        .on_menu_event(|app, event| menu::on_menu_event(app, event.id().0.as_str()))
        .setup(|app| {
            menu::init(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace::set_vault,
            workspace::take_opened_files,
            files::list_tree,
            files::read_file,
            files::save_file,
            files::save_new_file,
            files::create_entry,
            files::rename_entry,
            files::write_asset,
            files::trash_entry,
            search::search_vault,
            watcher::watch_vault,
            menu::sync_theme_menu,
            menu::sync_sidebar_menu
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|app, event| {
        if let tauri::RunEvent::Opened { urls } = event {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if paths.is_empty() {
                return;
            }
            app.state::<OpenedFiles>()
                .0
                .lock()
                .unwrap()
                .extend(paths.iter().cloned());
            eprintln!("[open] buffered+emitted {paths:?}");
            let _ = app.emit("open-paths", &paths);
        }
    });
}
