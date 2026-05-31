use tauri::State;
use std::path::PathBuf;
use crate::db::{Book, Annotation};
use crate::extractors::extract_text;
use crate::nlp::NamedEntity;
use crate::graph::{KnowledgeGraph, build_graph, export_to_jsonld};
use crate::cross_book::{CrossBookAnalysis, TimelineEntry, analyze_cross_book_entities, get_entity_timeline, get_all_entity_timelines};
use crate::AppState;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub book_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub book_id: String,
    pub book_title: String,
    pub matches: Vec<MatchResult>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MatchResult {
    pub start: usize,
    pub end: usize,
    pub context: String,
}

#[tauri::command(async)]
pub async fn import_file(
    path: String,
    state: State<'_, AppState>,
) -> ImportResult {
    let path_clone = path.clone();
    
    match tokio::task::spawn_blocking(move || {
        extract_text(Path::new(&path_clone))
    }).await {
        Ok(Ok(extracted)) => {
            let db_guard = state.db.lock().unwrap();
            let db = db_guard.as_ref().unwrap();
            
            match db.add_book(
                &extracted.title,
                &extracted.author,
                &path,
                &extracted.file_type,
                &extracted.content,
            ) {
                Ok(book_id) => ImportResult {
                    success: true,
                    book_id: Some(book_id),
                    message: format!("成功导入: {}", extracted.title),
                },
                Err(e) => ImportResult {
                    success: false,
                    book_id: None,
                    message: format!("数据库错误: {}", e),
                },
            }
        }
        Ok(Err(e)) => ImportResult {
            success: false,
            book_id: None,
            message: format!("文件解析错误: {}", e),
        },
        Err(e) => ImportResult {
            success: false,
            book_id: None,
            message: format!("任务执行错误: {}", e),
        },
    }
}

#[tauri::command]
pub fn list_books(state: State<'_, AppState>) -> Vec<Book> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    db.get_books().unwrap_or_default()
}

#[tauri::command]
pub fn get_book_content(book_id: String, state: State<'_, AppState>) -> Option<Book> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    db.get_book(&book_id).ok()
}

#[tauri::command]
pub fn search_text(query: String, state: State<'_, AppState>) -> Vec<SearchResult> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    let books = db.search_books(&query).unwrap_or_default();
    
    let mut results = Vec::new();
    
    for book in books {
        let mut matches = Vec::new();
        let content = &book.content;
        let query_lower = query.to_lowercase();
        let content_lower = content.to_lowercase();
        
        let mut start = 0;
        while let Some(pos) = content_lower[start..].find(&query_lower) {
            let abs_start = start + pos;
            let abs_end = abs_start + query.len();
            
            let ctx_start = if abs_start > 50 { abs_start - 50 } else { 0 };
            let ctx_end = if abs_end + 50 < content.len() { abs_end + 50 } else { content.len() };
            
            matches.push(MatchResult {
                start: abs_start,
                end: abs_end,
                context: content[ctx_start..ctx_end].to_string(),
            });
            
            start = abs_end;
        }
        
        if !matches.is_empty() {
            results.push(SearchResult {
                book_id: book.id,
                book_title: book.title,
                matches,
            });
        }
    }
    
    results
}

#[tauri::command]
pub fn add_highlight(
    book_id: String,
    start_pos: usize,
    end_pos: usize,
    text: String,
    color: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    db.add_highlight(&book_id, start_pos, end_pos, &text, &color)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_annotation(
    book_id: String,
    highlight_id: Option<String>,
    start_pos: usize,
    end_pos: usize,
    selected_text: String,
    note: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    
    let annotation_id = db.add_annotation(
        &book_id,
        highlight_id.as_deref(),
        start_pos,
        end_pos,
        &selected_text,
        &note,
    ).map_err(|e| e.to_string())?;
    
    let nlp_guard = state.nlp.lock().unwrap();
    let nlp = nlp_guard.as_ref().unwrap();
    
    if let Ok(entities) = nlp.extract_entities(&note) {
        for entity in entities {
            let _ = db.add_entity(
                &entity.text,
                &entity.label,
                &annotation_id,
                &book_id,
                start_pos + entity.start,
                start_pos + entity.end,
            );
        }
    }
    
    if let Ok(entities) = nlp.extract_entities(&selected_text) {
        for entity in entities {
            let _ = db.add_entity(
                &entity.text,
                &entity.label,
                &annotation_id,
                &book_id,
                start_pos + entity.start,
                start_pos + entity.end,
            );
        }
    }
    
    Ok(annotation_id)
}

#[tauri::command]
pub fn get_annotations(book_id: String, state: State<'_, AppState>) -> Vec<Annotation> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    db.get_annotations(&book_id).unwrap_or_default()
}

#[tauri::command]
pub fn extract_entities(text: String, state: State<'_, AppState>) -> Vec<NamedEntity> {
    let nlp_guard = state.nlp.lock().unwrap();
    let nlp = nlp_guard.as_ref().unwrap();
    nlp.extract_entities(&text).unwrap_or_default()
}

#[tauri::command]
pub fn build_knowledge_graph(state: State<'_, AppState>) -> KnowledgeGraph {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    
    let books = db.get_books().unwrap_or_default();
    let annotations_with_entities = db.get_annotations_with_entities().unwrap_or_default();
    
    build_graph(&books, &annotations_with_entities)
}

#[tauri::command]
pub fn export_graph_jsonld(state: State<'_, AppState>) -> serde_json::Value {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    
    let books = db.get_books().unwrap_or_default();
    let annotations_with_entities = db.get_annotations_with_entities().unwrap_or_default();
    
    let graph = build_graph(&books, &annotations_with_entities);
    export_to_jsonld(&graph)
}

#[tauri::command]
pub fn analyze_cross_book(book_ids: Vec<String>, state: State<'_, AppState>) -> CrossBookAnalysis {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    
    let books = if book_ids.is_empty() {
        db.get_books().unwrap_or_default()
    } else {
        let mut result = Vec::new();
        for id in &book_ids {
            if let Ok(book) = db.get_book(id) {
                result.push(book);
            }
        }
        result
    };
    
    let book_ids_vec: Vec<String> = books.iter().map(|b| b.id.clone()).collect();
    let annotations_with_entities = if book_ids_vec.is_empty() {
        Vec::new()
    } else {
        db.get_annotations_with_entities_for_books(&book_ids_vec).unwrap_or_default()
    };
    
    let annotations_with_books_and_entities: Vec<_> = annotations_with_entities
        .into_iter()
        .filter_map(|(ann, entities)| {
            books.iter()
                .find(|b| b.id == ann.book_id)
                .map(|book| (ann, book.clone(), entities))
        })
        .collect();
    
    analyze_cross_book_entities(&books, &annotations_with_books_and_entities)
}

#[tauri::command]
pub fn get_entity_timeline_for_entity(
    entity_name: String,
    entity_type: String,
    state: State<'_, AppState>,
) -> Vec<TimelineEntry> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    
    let annotations_with_books = db.get_all_annotations_with_books().unwrap_or_default();
    get_entity_timeline(&entity_name, &entity_type, &annotations_with_books)
}

#[tauri::command]
pub fn get_all_entity_timelines_command(
    state: State<'_, AppState>,
) -> HashMap<String, Vec<TimelineEntry>> {
    let db_guard = state.db.lock().unwrap();
    let db = db_guard.as_ref().unwrap();
    
    let annotations_with_books = db.get_all_annotations_with_books().unwrap_or_default();
    get_all_entity_timelines(&annotations_with_books)
}

