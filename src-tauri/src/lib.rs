mod files;
mod search;
mod watcher;
mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(watcher::WatcherState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            workspace::get_last_vault,
            workspace::set_vault,
            files::list_tree,
            files::read_file,
            files::save_file,
            files::create_entry,
            files::rename_entry,
            files::write_asset,
            files::trash_entry,
            search::search_vault,
            watcher::watch_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
