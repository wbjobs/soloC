use serde::{Deserialize, Serialize};
use crate::db::{Annotation, Entity, Book};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub node_type: String,
    pub data: Option<NodeData>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeData {
    pub book_title: Option<String>,
    pub book_id: Option<String>,
    pub annotation_id: Option<String>,
    pub original_text: Option<String>,
    pub note: Option<String>,
    pub start_pos: Option<usize>,
    pub end_pos: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub relationship: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

pub fn build_graph(
    books: &[Book],
    annotations_with_entities: &[(Annotation, Vec<Entity>)],
) -> KnowledgeGraph {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut node_ids = std::collections::HashSet::new();
    let mut entity_canonical_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut entity_occurrences: std::collections::HashMap<String, Vec<(Entity, String)>> = std::collections::HashMap::new();
    
    for book in books {
        let book_node_id = format!("book_{}", book.id);
        if node_ids.insert(book_node_id.clone()) {
            nodes.push(GraphNode {
                id: book_node_id.clone(),
                label: book.title.clone(),
                node_type: "BOOK".to_string(),
                data: Some(NodeData {
                    book_title: Some(book.title.clone()),
                    book_id: Some(book.id.clone()),
                    annotation_id: None,
                    original_text: None,
                    note: None,
                    start_pos: None,
                    end_pos: None,
                }),
            });
        }
    }
    
    for (annotation, entities) in annotations_with_entities {
        let annotation_node_id = format!("annotation_{}", annotation.id);
        let book_node_id = format!("book_{}", annotation.book_id);
        
        if node_ids.insert(annotation_node_id.clone()) {
            nodes.push(GraphNode {
                id: annotation_node_id.clone(),
                label: truncate(&annotation.note, 30),
                node_type: "ANNOTATION".to_string(),
                data: Some(NodeData {
                    book_title: None,
                    book_id: Some(annotation.book_id.clone()),
                    annotation_id: Some(annotation.id.clone()),
                    original_text: Some(annotation.selected_text.clone()),
                    note: Some(annotation.note.clone()),
                    start_pos: Some(annotation.start_pos),
                    end_pos: Some(annotation.end_pos),
                }),
            });
        }
        
        edges.push(GraphEdge {
            id: format!("edge_book_ann_{}_{}", annotation.book_id, annotation.id),
            source: book_node_id,
            target: annotation_node_id.clone(),
            relationship: "HAS_ANNOTATION".to_string(),
        });
        
        for entity in entities {
            let canonical = canonicalize_entity(&entity.name, &entity.entity_type);
            let type_and_canonical = format!("{}_{}", entity.entity_type, canonical);
            
            entity_occurrences
                .entry(type_and_canonical.clone())
                .or_default()
                .push((entity.clone(), annotation.id.clone()));
            
            if !entity_canonical_map.contains_key(&type_and_canonical) {
                entity_canonical_map.insert(type_and_canonical.clone(), entity.name.clone());
            }
        }
    }
    
    for (type_and_canonical, occurrences) in entity_occurrences {
        let canonical_name = entity_canonical_map.get(&type_and_canonical).unwrap();
        let entity_node_id = format!("entity_{}", sanitize_id(&type_and_canonical));
        let entity_type = type_and_canonical.split('_').next().unwrap_or("UNKNOWN").to_string();
        
        let all_book_ids: Vec<String> = occurrences.iter()
            .map(|(e, _)| e.book_id.clone())
            .collect();
        
        let all_annotation_ids: Vec<String> = occurrences.iter()
            .map(|(_, ann_id)| ann_id.clone())
            .collect();
        
        let first_entity = &occurrences[0].0;
        
        if node_ids.insert(entity_node_id.clone()) {
            nodes.push(GraphNode {
                id: entity_node_id.clone(),
                label: canonical_name.clone(),
                node_type: entity_type,
                data: Some(NodeData {
                    book_title: None,
                    book_id: if all_book_ids.len() == 1 { Some(first_entity.book_id.clone()) } else { None },
                    annotation_id: if all_annotation_ids.len() == 1 { Some(first_entity.annotation_id.clone()) } else { None },
                    original_text: None,
                    note: Some(format!("出现 {} 次", occurrences.len())),
                    start_pos: None,
                    end_pos: None,
                }),
            });
        }
        
        for (entity, annotation_id) in occurrences {
            let annotation_node_id = format!("annotation_{}", annotation_id);
            edges.push(GraphEdge {
                id: format!("edge_ann_ent_{}_{}", annotation_id, entity.id),
                source: annotation_node_id,
                target: entity_node_id.clone(),
                relationship: "MENTIONS".to_string(),
            });
        }
    }
    
    KnowledgeGraph {
        nodes,
        edges,
    }
}

pub fn export_to_jsonld(graph: &KnowledgeGraph) -> serde_json::Value {
    let mut nodes_jsonld = Vec::new();
    let mut edges_jsonld = Vec::new();
    
    for node in &graph.nodes {
        let mut obj = serde_json::Map::new();
        obj.insert("@id".to_string(), serde_json::Value::String(node.id.clone()));
        obj.insert("@type".to_string(), serde_json::Value::String(node.node_type.clone()));
        obj.insert("label".to_string(), serde_json::Value::String(node.label.clone()));
        
        if let Some(data) = &node.data {
            if let Some(book_title) = &data.book_title {
                obj.insert("bookTitle".to_string(), serde_json::Value::String(book_title.clone()));
            }
            if let Some(book_id) = &data.book_id {
                obj.insert("bookId".to_string(), serde_json::Value::String(book_id.clone()));
            }
            if let Some(annotation_id) = &data.annotation_id {
                obj.insert("annotationId".to_string(), serde_json::Value::String(annotation_id.clone()));
            }
            if let Some(original_text) = &data.original_text {
                obj.insert("originalText".to_string(), serde_json::Value::String(original_text.clone()));
            }
            if let Some(note) = &data.note {
                obj.insert("note".to_string(), serde_json::Value::String(note.clone()));
            }
        }
        
        nodes_jsonld.push(serde_json::Value::Object(obj));
    }
    
    for edge in &graph.edges {
        let mut obj = serde_json::Map::new();
        obj.insert("@id".to_string(), serde_json::Value::String(edge.id.clone()));
        obj.insert("@type".to_string(), serde_json::Value::String("Relationship".to_string()));
        obj.insert("source".to_string(), serde_json::Value::String(edge.source.clone()));
        obj.insert("target".to_string(), serde_json::Value::String(edge.target.clone()));
        obj.insert("relationship".to_string(), serde_json::Value::String(edge.relationship.clone()));
        edges_jsonld.push(serde_json::Value::Object(obj));
    }
    
    let mut root = serde_json::Map::new();
    root.insert("@context".to_string(), serde_json::json!({
        "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
        "label": "rdfs:label",
        "bookTitle": "http://schema.org/name",
        "bookId": "http://schema.org/identifier",
        "annotationId": "http://schema.org/identifier",
        "originalText": "http://schema.org/text",
        "note": "http://schema.org/description",
        "source": "http://schema.org/source",
        "target": "http://schema.org/target",
        "relationship": "http://schema.org/relationship"
    }));
    root.insert("@graph".to_string(), serde_json::Value::Array([nodes_jsonld, edges_jsonld].concat()));
    
    serde_json::Value::Object(root)
}

fn truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        s.chars().take(max_chars).collect::<String>() + "..."
    }
}

pub fn canonicalize_entity(name: &str, entity_type: &str) -> String {
    let mut result = name.to_lowercase();
    
    result = result.trim().to_string();
    
    result = singularize(&result, entity_type);
    
    result
}

pub fn singularize(s: &str, entity_type: &str) -> String {
    if entity_type == "PERSON" {
        return s.to_string();
    }
    
    if s.len() < 3 {
        return s.to_string();
    }
    
    if s.ends_with("ies") && s.len() > 4 {
        return format!("{}y", &s[0..s.len() - 3]);
    }
    if s.ends_with("es") && s.len() > 3 {
        let prefix = &s[0..s.len() - 2];
        if prefix.ends_with("s") || prefix.ends_with("x") || 
           prefix.ends_with("ch") || prefix.ends_with("sh") {
            return prefix.to_string();
        }
    }
    if s.ends_with('s') && !s.ends_with("ss") {
        return s[0..s.len() - 1].to_string();
    }
    
    s.to_string()
}

fn sanitize_id(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}
