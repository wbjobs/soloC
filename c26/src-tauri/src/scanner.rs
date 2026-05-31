use std::collections::HashMap;
use std::path::Path;
use walkdir::WalkDir;
use regex::Regex;

use crate::models::{MarkdownFile, ExtractedLinks};

pub fn scan_markdown_files(directory: &str) -> Result<Vec<MarkdownFile>, String> {
    let mut files = Vec::new();
    
    for entry in WalkDir::new(directory)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok()) {
        let path = entry.path();
        
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "md" || ext == "markdown" {
                    if let Some(file) = read_markdown_file(path) {
                        files.push(file);
                    }
                }
            }
        }
    }
    
    update_backlinks_in_files(&mut files);
    
    Ok(files)
}

fn read_markdown_file(path: &Path) -> Option<MarkdownFile> {
    let content = std::fs::read_to_string(path).ok()?;
    let name = path.file_name()?.to_string_lossy().to_string();
    let path_str = path.to_string_lossy().to_string();
    
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let last_modified = modified
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    
    let links = extract_links(&path_str, &content);
    
    Some(MarkdownFile {
        path: path_str,
        name,
        content,
        last_modified,
        backlinks: Vec::new(),
        outgoing_links: links.outgoing,
    })
}

pub fn extract_links(current_file: &str, content: &str) -> ExtractedLinks {
    let mut raw_links = Vec::new();
    
    let patterns = [
        Regex::new(r"\[\[([^\]]+)\]\]").unwrap(),
        Regex::new(r"\[([^\]]+)\]\(([^)]+\.md)\)").unwrap(),
    ];
    
    for pattern in &patterns {
        for cap in pattern.captures_iter(content) {
            if pattern.as_str().contains("\\[\\[") {
                if let Some(link) = cap.get(1) {
                    raw_links.push(link.as_str().to_string());
                }
            } else {
                if let Some(link) = cap.get(2) {
                    raw_links.push(link.as_str().to_string());
                }
            }
        }
    }
    
    let current_dir = Path::new(current_file)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    
    let mut outgoing = Vec::new();
    for link in &raw_links {
        let link_path = if link.ends_with(".md") {
            Path::new(link)
        } else {
            Path::new(&format!("{}.md", link))
        };
        
        let resolved_path = if link_path.is_absolute() {
            link_path.to_path_buf()
        } else {
            current_dir.join(link_path)
        };
        
        let normalized = if let Ok(canon) = resolved_path.canonicalize() {
            canon.to_string_lossy().to_string()
        } else {
            resolved_path.to_string_lossy().to_string()
        };
        
        outgoing.push(normalized);
    }
    
    outgoing.dedup();
    
    ExtractedLinks {
        outgoing,
        raw_links,
    }
}

pub fn update_backlinks_in_files(files: &mut Vec<MarkdownFile>) {
    let paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
    
    for file in files.iter_mut() {
        let mut backlinks = Vec::new();
        for other in &paths {
            if *other != file.path {
                if let Some(other_file) = files.iter().find(|f| f.path == *other) {
                    if other_file.outgoing_links.contains(&file.path) {
                        backlinks.push(other.clone());
                    }
                }
            }
        }
        backlinks.dedup();
        file.backlinks = backlinks;
    }
}

pub fn update_backlinks(files: &mut HashMap<String, MarkdownFile>) {
    let paths: Vec<String> = files.keys().cloned().collect();
    
    for path in &paths {
        let mut backlinks = Vec::new();
        for other in &paths {
            if other != path {
                if let Some(other_file) = files.get(other) {
                    if other_file.outgoing_links.contains(path) {
                        backlinks.push(other.clone());
                    }
                }
            }
        }
        backlinks.dedup();
        
        if let Some(file) = files.get_mut(path) {
            file.backlinks = backlinks;
        }
    }
}
