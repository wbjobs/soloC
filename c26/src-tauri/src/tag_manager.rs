use std::collections::HashMap;
use std::path::Path;
use std::fs;
use serde::{Serialize, Deserialize};

use crate::models::TagData;

const TAG_FILENAME: &str = ".markdown_kb_tags.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TagStorage {
    version: u32,
    file_tags: HashMap<String, Vec<String>>,
}

impl Default for TagStorage {
    fn default() -> Self {
        TagStorage {
            version: 1,
            file_tags: HashMap::new(),
        }
    }
}

fn get_tag_file_path(root_dir: &str) -> std::path::PathBuf {
    Path::new(root_dir).join(TAG_FILENAME)
}

fn load_tags(root_dir: &str) -> TagStorage {
    let tag_path = get_tag_file_path(root_dir);
    
    if tag_path.exists() {
        if let Ok(content) = fs::read_to_string(&tag_path) {
            if let Ok(storage) = serde_json::from_str::<TagStorage>(&content) {
                return storage;
            }
        }
    }
    
    TagStorage::default()
}

fn save_tags(root_dir: &str, storage: &TagStorage) -> Result<(), String> {
    let tag_path = get_tag_file_path(root_dir);
    
    let json = serde_json::to_string_pretty(storage)
        .map_err(|e| format!("Failed to serialize tags: {}", e))?;
    
    fs::write(&tag_path, json)
        .map_err(|e| format!("Failed to write tags file: {}", e))?;
    
    Ok(())
}

pub fn add_tag(root_dir: &str, file_path: &str, tag: &str) -> Result<(), String> {
    let tag = tag.trim().to_string();
    if tag.is_empty() {
        return Err("Tag cannot be empty".into());
    }
    
    let mut storage = load_tags(root_dir);
    let tags = storage.file_tags.entry(file_path.to_string())
        .or_insert_with(Vec::new);
    
    if !tags.contains(&tag) {
        tags.push(tag);
        tags.sort();
    }
    
    save_tags(root_dir, &storage)?;
    Ok(())
}

pub fn remove_tag(root_dir: &str, file_path: &str, tag: &str) -> Result<(), String> {
    let mut storage = load_tags(root_dir);
    
    if let Some(tags) = storage.file_tags.get_mut(file_path) {
        tags.retain(|t| t != tag);
        
        if tags.is_empty() {
            storage.file_tags.remove(file_path);
        }
    }
    
    save_tags(root_dir, &storage)?;
    Ok(())
}

pub fn get_file_tags(root_dir: &str, file_path: &str) -> Vec<String> {
    let storage = load_tags(root_dir);
    storage.file_tags.get(file_path)
        .cloned()
        .unwrap_or_default()
}

pub fn set_file_tags(root_dir: &str, file_path: &str, tags: Vec<String>) -> Result<(), String> {
    let mut tags: Vec<String> = tags.into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    
    tags.sort();
    tags.dedup();
    
    let mut storage = load_tags(root_dir);
    
    if tags.is_empty() {
        storage.file_tags.remove(file_path);
    } else {
        storage.file_tags.insert(file_path.to_string(), tags);
    }
    
    save_tags(root_dir, &storage)?;
    Ok(())
}

pub fn get_all_tags(root_dir: &str) -> Vec<String> {
    let storage = load_tags(root_dir);
    let mut all_tags: std::collections::HashSet<String> = std::collections::HashSet::new();
    
    for tags in storage.file_tags.values() {
        for tag in tags {
            all_tags.insert(tag.clone());
        }
    }
    
    let mut sorted_tags: Vec<String> = all_tags.into_iter().collect();
    sorted_tags.sort();
    sorted_tags
}

pub fn get_files_by_tag(root_dir: &str, tag: &str) -> Vec<String> {
    let storage = load_tags(root_dir);
    let mut files = Vec::new();
    
    for (file_path, tags) in storage.file_tags.iter() {
        if tags.contains(&tag.to_string()) {
            files.push(file_path.clone());
        }
    }
    
    files.sort();
    files
}

pub fn get_tag_data(root_dir: &str) -> TagData {
    let storage = load_tags(root_dir);
    let all_tags = get_all_tags(root_dir);
    
    TagData {
        file_tags: storage.file_tags,
        all_tags,
    }
}

pub fn get_tag_counts(root_dir: &str) -> HashMap<String, usize> {
    let storage = load_tags(root_dir);
    let mut counts: HashMap<String, usize> = HashMap::new();
    
    for tags in storage.file_tags.values() {
        for tag in tags {
            *counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }
    
    counts
}
