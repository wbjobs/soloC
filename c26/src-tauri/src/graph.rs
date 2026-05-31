use std::collections::HashMap;

use crate::models::{MarkdownFile, GraphData, FileNode, FileLink};

pub fn build_graph_data(files: &HashMap<String, MarkdownFile>) -> GraphData {
    let mut nodes = Vec::new();
    let mut links = Vec::new();
    let mut existing_links = std::collections::HashSet::new();
    
    let path_to_id: HashMap<String, String> = files
        .iter()
        .enumerate()
        .map(|(i, (path, _))| (path.clone(), format!("node-{}", i)))
        .collect();
    
    for (path, file) in files {
        if let Some(id) = path_to_id.get(path) {
            nodes.push(FileNode {
                id: id.clone(),
                name: file.name.clone(),
                path: path.clone(),
            });
        }
    }
    
    for (source_path, file) in files {
        let source_id = match path_to_id.get(source_path) {
            Some(id) => id,
            None => continue,
        };
        
        for target_path in &file.outgoing_links {
            let target_id = match path_to_id.get(target_path) {
                Some(id) => id,
                None => continue,
            };
            
            let link_key = if source_id < target_id {
                (source_id.clone(), target_id.clone())
            } else {
                (target_id.clone(), source_id.clone())
            };
            
            if !existing_links.contains(&link_key) {
                existing_links.insert(link_key);
                links.push(FileLink {
                    source: source_id.clone(),
                    target: target_id.clone(),
                });
            }
        }
    }
    
    GraphData {
        nodes,
        links,
    }
}
