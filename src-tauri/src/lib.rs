mod commands;

use commands::{read_file, get_recent_files, add_recent_file, remove_recent_file, clear_recent_files, export_file, search_file_for_line};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            get_recent_files,
            add_recent_file,
            remove_recent_file,
            clear_recent_files,
            export_file,
            search_file_for_line
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
