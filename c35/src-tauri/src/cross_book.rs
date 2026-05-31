use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use crate::db::{Annotation, Book, Entity};
use crate::graph::canonicalize_entity;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MergedEntityAnnotation {
    pub entity_name: String,
    pub entity_type: String,
    pub annotations: Vec<AnnotationWithContext>,
    pub total_occurrences: usize,
    pub book_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AnnotationWithContext {
    pub annotation: Annotation,
    pub book: Book,
    pub entities_in_annotation: Vec<Entity>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EntityCoOccurrence {
    pub entity1: String,
    pub entity1_type: String,
    pub entity2: String,
    pub entity2_type: String,
    pub co_occurrence_count: usize,
    pub book_count: usize,
    pub relationship_strength: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimelineEntry {
    pub timestamp: String,
    pub annotation: Annotation,
    pub book: Book,
    pub related_entities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CrossBookAnalysis {
    pub merged_entities: Vec<MergedEntityAnnotation>,
    pub co_occurrences: Vec<EntityCoOccurrence>,
    pub books_analyzed: Vec<Book>,
    pub total_annotations: usize,
    pub total_entities: usize,
}

pub fn analyze_cross_book_entities(
    books: &[Book],
    annotations_with_books_and_entities: &[(Annotation, Book, Vec<Entity>)],
) -> CrossBookAnalysis {
    let mut entity_annotations_map: HashMap<String, Vec<AnnotationWithContext>> = HashMap::new();
    let mut annotation_entities: HashMap<String, Vec<String>> = HashMap::new();
    let mut entity_types: HashMap<String, String> = HashMap::new();
    
    for (annotation, book, entities) in annotations_with_books_and_entities {
        let mut entity_keys_in_annotation = Vec::new();
        
        for entity in entities {
            let canonical = canonicalize_entity(&entity.name, &entity.entity_type);
            let type_and_canonical = format!("{}_{}", entity.entity_type, canonical);
            
            entity_types.insert(type_and_canonical.clone(), entity.entity_type.clone());
            entity_keys_in_annotation.push(type_and_canonical.clone());
            
            let entry = entity_annotations_map.entry(type_and_canonical).or_default();
            entry.push(AnnotationWithContext {
                annotation: annotation.clone(),
                book: book.clone(),
                entities_in_annotation: entities.clone(),
            });
        }
        
        annotation_entities.insert(annotation.id.clone(), entity_keys_in_annotation);
    }
    
    let mut merged_entities: Vec<MergedEntityAnnotation> = entity_annotations_map
        .into_iter()
        .map(|(type_and_canonical, annotations)| {
            let entity_type = entity_types.get(&type_and_canonical).cloned().unwrap_or_default();
            let first_annotation = annotations.first();
            let entity_name = first_annotation
                .and_then(|aw| aw.entities_in_annotation.iter().find(|e| {
                    let canonical = canonicalize_entity(&e.name, &e.entity_type);
                    format!("{}_{}", e.entity_type, canonical) == type_and_canonical
                }))
                .map(|e| e.name.clone())
                .unwrap_or_else(|| {
                    type_and_canonical.splitn(2, '_').nth(1).unwrap_or("").to_string()
                });
            
            let book_ids: HashSet<String> = annotations.iter()
                .map(|aw| aw.book.id.clone())
                .collect();
            
            MergedEntityAnnotation {
                entity_name,
                entity_type,
                total_occurrences: annotations.len(),
                book_count: book_ids.len(),
                annotations,
            }
        })
        .collect();
    
    merged_entities.sort_by(|a, b| b.total_occurrences.cmp(&a.total_occurrences));
    
    let mut co_occurrence_map: HashMap<(String, String), (usize, HashSet<String>)> = HashMap::new();
    
    for (_, entity_keys) in &annotation_entities {
        for i in 0..entity_keys.len() {
            for j in (i + 1)..entity_keys.len() {
                let key = if entity_keys[i] < entity_keys[j] {
                    (entity_keys[i].clone(), entity_keys[j].clone())
                } else {
                    (entity_keys[j].clone(), entity_keys[i].clone())
                };
                
                let entry = co_occurrence_map.entry(key).or_insert((0, HashSet::new()));
                entry.0 += 1;
                if let Some(ann) = annotations_with_books_and_entities.first() {
                    entry.1.insert(ann.1.id.clone());
                }
            }
        }
    }
    
    let mut co_occurrences: Vec<EntityCoOccurrence> = co_occurrence_map
        .into_iter()
        .map(|((key1, key2), (count, books))| {
            let type1 = entity_types.get(&key1).cloned().unwrap_or_default();
            let type2 = entity_types.get(&key2).cloned().unwrap_or_default();
            let name1 = key1.splitn(2, '_').nth(1).unwrap_or("").to_string();
            let name2 = key2.splitn(2, '_').nth(1).unwrap_or("").to_string();
            
            let total_occurrences1 = merged_entities.iter()
                .find(|e| format!("{}_{}", e.entity_type, canonicalize_entity(&e.entity_name, &e.entity_type)) == key1)
                .map(|e| e.total_occurrences)
                .unwrap_or(1);
            let total_occurrences2 = merged_entities.iter()
                .find(|e| format!("{}_{}", e.entity_type, canonicalize_entity(&e.entity_name, &e.entity_type)) == key2)
                .map(|e| e.total_occurrences)
                .unwrap_or(1);
            
            let strength = count as f64 / (total_occurrences1.max(total_occurrences2) as f64).sqrt();
            
            EntityCoOccurrence {
                entity1: name1,
                entity1_type: type1,
                entity2: name2,
                entity2_type: type2,
                co_occurrence_count: count,
                book_count: books.len(),
                relationship_strength: strength,
            }
        })
        .collect();
    
    co_occurrences.sort_by(|a, b| b.relationship_strength.partial_cmp(&a.relationship_strength).unwrap_or(std::cmp::Ordering::Equal));
    
    CrossBookAnalysis {
        merged_entities,
        co_occurrences,
        books_analyzed: books.to_vec(),
        total_annotations: annotations_with_books_and_entities.len(),
        total_entities: merged_entities.len(),
    }
}

pub fn get_entity_timeline(
    entity_name: &str,
    entity_type: &str,
    annotations_with_books_and_entities: &[(Annotation, Book, Vec<Entity>)],
) -> Vec<TimelineEntry> {
    let canonical = canonicalize_entity(entity_name, entity_type);
    
    let mut timeline: Vec<TimelineEntry> = annotations_with_books_and_entities
        .iter()
        .filter(|(_, _, entities)| {
            entities.iter().any(|e| {
                let e_canonical = canonicalize_entity(&e.name, &e.entity_type);
                e_canonical == canonical && e.entity_type == entity_type
            })
        })
        .map(|(annotation, book, entities)| {
            let related_entities: Vec<String> = entities.iter()
                .filter(|e| {
                    let e_canonical = canonicalize_entity(&e.name, &e.entity_type);
                    e_canonical != canonical || e.entity_type != entity_type
                })
                .map(|e| e.name.clone())
                .collect();
            
            TimelineEntry {
                timestamp: annotation.created_at.clone(),
                annotation: annotation.clone(),
                book: book.clone(),
                related_entities,
            }
        })
        .collect();
    
    timeline.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    
    timeline
}

pub fn get_all_entity_timelines(
    annotations_with_books_and_entities: &[(Annotation, Book, Vec<Entity>)],
) -> HashMap<String, Vec<TimelineEntry>> {
    let mut entity_map: HashMap<String, Vec<TimelineEntry>> = HashMap::new();
    
    for (annotation, book, entities) in annotations_with_books_and_entities {
        for entity in entities {
            let canonical = canonicalize_entity(&entity.name, &entity.entity_type);
            let key = format!("{}_{}", entity.entity_type, canonical);
            
            let related_entities: Vec<String> = entities.iter()
                .filter(|e| e.id != entity.id)
                .map(|e| e.name.clone())
                .collect();
            
            let entry = TimelineEntry {
                timestamp: annotation.created_at.clone(),
                annotation: annotation.clone(),
                book: book.clone(),
                related_entities,
            };
            
            entity_map.entry(key).or_default().push(entry);
        }
    }
    
    for timeline in entity_map.values_mut() {
        timeline.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    }
    
    entity_map
}
