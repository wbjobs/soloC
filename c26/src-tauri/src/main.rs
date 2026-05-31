#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod models;
mod scanner;
mod search;
mod graph;
mod pdf_export;
mod git_versioning;
mod tag_manager;

use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

use models::*;
use scanner::*;
use search::*;
use graph::*;
use pdf_export::*;
use git_versioning::*;
use tag_manager::*;

static FILES: Lazy<Mutex<HashMap<String, MarkdownFile>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

static ROOT_DIR: Lazy<Mutex<Option<String>>> = Lazy::new(|| {
    Mutex::new(None)
});

fn get_root_dir() -> Result<String, String> {
    ROOT_DIR.lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "No root directory selected".to_string())
}

fn add_tags_to_file(file: &mut MarkdownFile, root_dir: &str) {
    let tags = get_file_tags(root_dir, &file.path);
    file.tags = tags;
}

#[tauri::command]
fn initialize_app() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn scan_directory(directory: String) -> Result<(), String> {
    let mut files = scan_markdown_files(&directory)?;
    
    for file in files.iter_mut() {
        add_tags_to_file(file, &directory);
    }
    
    let mut files_map = FILES.lock().map_err(|e| e.to_string())?;
    files_map.clear();
    
    for file in files {
        files_map.insert(file.path.clone(), file);
    }
    
    let mut root_dir = ROOT_DIR.lock().map_err(|e| e.to_string())?;
    *root_dir = Some(directory);
    
    Ok(())
}

#[tauri::command]
fn get_all_files() -> Result<HashMap<String, MarkdownFile>, String> {
    let files = FILES.lock().map_err(|e| e.to_string())?;
    Ok(files.clone())
}

#[tauri::command]
fn get_file(path: String) -> Result<Option<MarkdownFile>, String> {
    let files = FILES.lock().map_err(|e| e.to_string())?;
    Ok(files.get(&path).cloned())
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    
    let root_dir = get_root_dir()?;
    let mut files = FILES.lock().map_err(|e| e.to_string())?;
    
    let name = std::path::Path::new(&path)
        .file_name()
        .ok_or("Invalid path")?
        .to_string_lossy()
        .to_string();
    
    let links = extract_links(&path, &content);
    let tags = get_file_tags(&root_dir, &path);
    
    let file = MarkdownFile {
        path: path.clone(),
        name,
        content,
        last_modified: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        backlinks: vec![],
        outgoing_links: links.outgoing,
        tags,
    };
    
    files.insert(path, file);
    
    update_backlinks(&mut files);
    
    Ok(())
}

#[tauri::command]
fn create_file(directory: String, name: String) -> Result<String, String> {
    let path = std::path::Path::new(&directory).join(&name);
    
    if path.exists() {
        return Err("File already exists".into());
    }
    
    std::fs::write(&path, "").map_err(|e| e.to_string())?;
    
    let file_path = path.to_string_lossy().to_string();
    
    let mut files = FILES.lock().map_err(|e| e.to_string())?;
    
    let file = MarkdownFile {
        path: file_path.clone(),
        name,
        content: String::new(),
        last_modified: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        backlinks: vec![],
        outgoing_links: vec![],
        tags: vec![],
    };
    
    files.insert(file_path.clone(), file);
    
    Ok(file_path)
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    
    let mut files = FILES.lock().map_err(|e| e.to_string())?;
    files.remove(&path);
    
    update_backlinks(&mut files);
    
    Ok(())
}

#[tauri::command]
fn search_files(query: String) -> Result<Vec<SearchResult>, String> {
    let files = FILES.lock().map_err(|e| e.to_string())?;
    let results = tfidf_search(&files, &query, 50);
    Ok(results)
}

#[tauri::command]
fn build_graph() -> Result<GraphData, String> {
    let files = FILES.lock().map_err(|e| e.to_string())?;
    Ok(build_graph_data(&files))
}

#[tauri::command]
fn export_to_pdf(file_path: String, html_content: String) -> Result<(), String> {
    export_html_to_pdf(&file_path, &html_content)
}

#[tauri::command]
fn git_init() -> Result<(), String> {
    let root_dir = get_root_dir()?;
    init_git_repo(&root_dir)
}

#[tauri::command]
fn git_is_initialized() -> Result<bool, String> {
    let root_dir = get_root_dir()?;
    Ok(is_git_repo(&root_dir))
}

#[tauri::command]
fn git_has_changes() -> Result<bool, String> {
    let root_dir = get_root_dir()?;
    has_uncommitted_changes(&root_dir)
}

#[tauri::command]
fn git_commit(message: String) -> Result<String, String> {
    let root_dir = get_root_dir()?;
    commit_changes(&root_dir, &message)
}

#[tauri::command]
fn git_get_history(file_path: String) -> Result<FileHistory, String> {
    let root_dir = get_root_dir()?;
    get_file_history(&root_dir, &file_path)
}

#[tauri::command]
fn git_get_version(file_path: String, commit_id: String) -> Result<String, String> {
    let root_dir = get_root_dir()?;
    get_file_version(&root_dir, &file_path, &commit_id)
}

#[tauri::command]
fn git_restore(file_path: String, commit_id: String, commit_restore: bool) -> Result<Option<String>, String> {
    let root_dir = get_root_dir()?;
    
    if commit_restore {
        let commit_id_result = restore_and_commit(&root_dir, &file_path, &commit_id)?;
        Ok(Some(commit_id_result))
    } else {
        restore_version(&root_dir, &file_path, &commit_id)?;
        Ok(None)
    }
}

#[tauri::command]
fn tag_get_all() -> Result<Vec<String>, String> {
    let root_dir = get_root_dir()?;
    Ok(get_all_tags(&root_dir))
}

#[tauri::command]
fn tag_get_for_file(file_path: String) -> Result<Vec<String>, String> {
    let root_dir = get_root_dir()?;
    Ok(get_file_tags(&root_dir, &file_path))
}

#[tauri::command]
fn tag_add(file_path: String, tag: String) -> Result<(), String> {
    let root_dir = get_root_dir()?;
    add_tag(&root_dir, &file_path, &tag)?;
    
    let mut files = FILES.lock().map_err(|e| e.to_string())?;
    if let Some(file) = files.get_mut(&file_path) {
        file.tags = get_file_tags(&root_dir, &file_path);
    }
    
    Ok(())
}

#[tauri::command]
fn tag_remove(file_path: String, tag: String) -> Result<(), String> {
    let root_dir = get_root_dir()?;
    remove_tag(&root_dir, &file_path, &tag)?;
    
    let mut files = FILES.lock().map_err(|e| e.to_string())?;
    if let Some(file) = files.get_mut(&file_path) {
        file.tags = get_file_tags(&root_dir, &file_path);
    }
    
    Ok(())
}

#[tauri::command]
fn tag_set(file_path: String, tags: Vec<String>) -> Result<(), String> {
    let root_dir = get_root_dir()?;
    set_file_tags(&root_dir, &file_path, tags)?;
    
    let mut files = FILES.lock().map_err(|e| e.to_string())?;
    if let Some(file) = files.get_mut(&file_path) {
        file.tags = get_file_tags(&root_dir, &file_path);
    }
    
    Ok(())
}

#[tauri::command]
fn tag_get_files(tag: String) -> Result<Vec<String>, String> {
    let root_dir = get_root_dir()?;
    Ok(get_files_by_tag(&root_dir, &tag))
}

#[tauri::command]
fn tag_get_data() -> Result<TagData, String> {
    let root_dir = get_root_dir()?;
    Ok(get_tag_data(&root_dir))
}

#[tauri::command]
fn tag_get_counts() -> Result<HashMap<String, usize>, String> {
    let root_dir = get_root_dir()?;
    Ok(get_tag_counts(&root_dir))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            initialize_app,
            scan_directory,
            get_all_files,
            get_file,
            save_file,
            create_file,
            delete_file,
            search_files,
            build_graph,
            export_to_pdf,
            git_init,
            git_is_initialized,
            git_has_changes,
            git_commit,
            git_get_history,
            git_get_version,
            git_restore,
            tag_get_all,
            tag_get_for_file,
            tag_add,
            tag_remove,
            tag_set,
            tag_get_files,
            tag_get_data,
            tag_get_counts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
