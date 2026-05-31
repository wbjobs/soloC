#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod db;
mod extractors;
mod nlp;
mod graph;
mod cross_book;
mod commands;

use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    db: Mutex<Option<db::Database>>,
    nlp: Mutex<Option<nlp::NlpEngine>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("获取应用目录失败");
            std::fs::create_dir_all(&app_dir).expect("创建应用目录失败");
            
            let db_path = app_dir.join("knowledge_reader.db");
            let db = db::Database::new(&db_path).expect("初始化数据库失败");
            
            let nlp = nlp::NlpEngine::new().expect("初始化 NLP 引擎失败");
            
            app.manage(AppState {
                db: Mutex::new(Some(db)),
                nlp: Mutex::new(Some(nlp)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::import_file,
            commands::list_books,
            commands::get_book_content,
            commands::search_text,
            commands::add_highlight,
            commands::add_annotation,
            commands::get_annotations,
            commands::extract_entities,
            commands::build_knowledge_graph,
            commands::export_graph_jsonld,
            commands::analyze_cross_book,
            commands::get_entity_timeline_for_entity,
            commands::get_all_entity_timelines_command,
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
