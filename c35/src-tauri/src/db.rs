use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: String,
    pub path: String,
    pub file_type: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Highlight {
    pub id: String,
    pub book_id: String,
    pub start_pos: usize,
    pub end_pos: usize,
    pub text: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Annotation {
    pub id: String,
    pub book_id: String,
    pub highlight_id: Option<String>,
    pub start_pos: usize,
    pub end_pos: usize,
    pub selected_text: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Entity {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    pub annotation_id: String,
    pub book_id: String,
    pub start_pos: usize,
    pub end_pos: usize,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                author TEXT,
                path TEXT NOT NULL,
                file_type TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS highlights (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                start_pos INTEGER NOT NULL,
                end_pos INTEGER NOT NULL,
                text TEXT NOT NULL,
                color TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (book_id) REFERENCES books(id)
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS annotations (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                highlight_id TEXT,
                start_pos INTEGER NOT NULL,
                end_pos INTEGER NOT NULL,
                selected_text TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (book_id) REFERENCES books(id),
                FOREIGN KEY (highlight_id) REFERENCES highlights(id)
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS entities (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                annotation_id TEXT NOT NULL,
                book_id TEXT NOT NULL,
                start_pos INTEGER NOT NULL,
                end_pos INTEGER NOT NULL,
                FOREIGN KEY (annotation_id) REFERENCES annotations(id),
                FOREIGN KEY (book_id) REFERENCES books(id)
            )",
            [],
        )?;
        
        Ok(Self { conn })
    }
    
    pub fn add_book(&self, title: &str, author: &str, path: &str, file_type: &str, content: &str) -> Result<String, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO books (id, title, author, path, file_type, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, title, author, path, file_type, content, created_at],
        )?;
        Ok(id)
    }
    
    pub fn get_books(&self) -> Result<Vec<Book>, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT id, title, author, path, file_type, content, created_at FROM books ORDER BY created_at DESC")?;
        let books = stmt.query_map([], |row| {
            Ok(Book {
                id: row.get(0)?,
                title: row.get(1)?,
                author: row.get(2)?,
                path: row.get(3)?,
                file_type: row.get(4)?,
                content: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        books.collect()
    }
    
    pub fn get_book(&self, book_id: &str) -> Result<Book, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT id, title, author, path, file_type, content, created_at FROM books WHERE id = ?1")?;
        stmt.query_row(params![book_id], |row| {
            Ok(Book {
                id: row.get(0)?,
                title: row.get(1)?,
                author: row.get(2)?,
                path: row.get(3)?,
                file_type: row.get(4)?,
                content: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
    }
    
    pub fn search_books(&self, query: &str) -> Result<Vec<Book>, rusqlite::Error> {
        let like_query = format!("%{}%", query);
        let mut stmt = self.conn.prepare("SELECT id, title, author, path, file_type, content, created_at FROM books WHERE content LIKE ?1 OR title LIKE ?1 OR author LIKE ?1 ORDER BY created_at DESC")?;
        let books = stmt.query_map(params![like_query], |row| {
            Ok(Book {
                id: row.get(0)?,
                title: row.get(1)?,
                author: row.get(2)?,
                path: row.get(3)?,
                file_type: row.get(4)?,
                content: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        books.collect()
    }
    
    pub fn add_highlight(&self, book_id: &str, start_pos: usize, end_pos: usize, text: &str, color: &str) -> Result<String, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO highlights (id, book_id, start_pos, end_pos, text, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, book_id, start_pos as i64, end_pos as i64, text, color, created_at],
        )?;
        Ok(id)
    }
    
    pub fn add_annotation(&self, book_id: &str, highlight_id: Option<&str>, start_pos: usize, end_pos: usize, selected_text: &str, note: &str) -> Result<String, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO annotations (id, book_id, highlight_id, start_pos, end_pos, selected_text, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, book_id, highlight_id, start_pos as i64, end_pos as i64, selected_text, note, created_at],
        )?;
        Ok(id)
    }
    
    pub fn get_annotations(&self, book_id: &str) -> Result<Vec<Annotation>, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT id, book_id, highlight_id, start_pos, end_pos, selected_text, note, created_at FROM annotations WHERE book_id = ?1 ORDER BY created_at DESC")?;
        let annotations = stmt.query_map(params![book_id], |row| {
            Ok(Annotation {
                id: row.get(0)?,
                book_id: row.get(1)?,
                highlight_id: row.get(2)?,
                start_pos: row.get::<_, i64>(3)? as usize,
                end_pos: row.get::<_, i64>(4)? as usize,
                selected_text: row.get(5)?,
                note: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        annotations.collect()
    }
    
    pub fn add_entity(&self, name: &str, entity_type: &str, annotation_id: &str, book_id: &str, start_pos: usize, end_pos: usize) -> Result<String, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO entities (id, name, entity_type, annotation_id, book_id, start_pos, end_pos) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, name, entity_type, annotation_id, book_id, start_pos as i64, end_pos as i64],
        )?;
        Ok(id)
    }
    
    pub fn get_all_entities(&self) -> Result<Vec<Entity>, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT id, name, entity_type, annotation_id, book_id, start_pos, end_pos FROM entities")?;
        let entities = stmt.query_map([], |row| {
            Ok(Entity {
                id: row.get(0)?,
                name: row.get(1)?,
                entity_type: row.get(2)?,
                annotation_id: row.get(3)?,
                book_id: row.get(4)?,
                start_pos: row.get::<_, i64>(5)? as usize,
                end_pos: row.get::<_, i64>(6)? as usize,
            })
        })?;
        entities.collect()
    }
    
    pub fn get_annotations_with_entities(&self) -> Result<Vec<(Annotation, Vec<Entity>)>, rusqlite::Error> {
        let annotations = self.conn.prepare("SELECT id, book_id, highlight_id, start_pos, end_pos, selected_text, note, created_at FROM annotations ORDER BY created_at DESC")?
            .query_map([], |row| {
                Ok(Annotation {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    highlight_id: row.get(2)?,
                    start_pos: row.get::<_, i64>(3)? as usize,
                    end_pos: row.get::<_, i64>(4)? as usize,
                    selected_text: row.get(5)?,
                    note: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        
        let mut result = Vec::new();
        for ann in annotations {
            let entities = self.conn.prepare("SELECT id, name, entity_type, annotation_id, book_id, start_pos, end_pos FROM entities WHERE annotation_id = ?1")?
                .query_map(params![ann.id], |row| {
                    Ok(Entity {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        entity_type: row.get(2)?,
                        annotation_id: row.get(3)?,
                        book_id: row.get(4)?,
                        start_pos: row.get::<_, i64>(5)? as usize,
                        end_pos: row.get::<_, i64>(6)? as usize,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            result.push((ann, entities));
        }
        
        Ok(result)
    }
    
    pub fn get_annotations_with_entities_for_books(&self, book_ids: &[String]) -> Result<Vec<(Annotation, Vec<Entity>)>, rusqlite::Error> {
        let placeholders: Vec<String> = (0..book_ids.len()).map(|i| format!("?{}", i + 1)).collect();
        let sql = format!(
            "SELECT id, book_id, highlight_id, start_pos, end_pos, selected_text, note, created_at 
             FROM annotations 
             WHERE book_id IN ({}) 
             ORDER BY created_at DESC",
            placeholders.join(", ")
        );
        
        let mut stmt = self.conn.prepare(&sql)?;
        let annotations = stmt.query_map(rusqlite::params_from_iter(book_ids), |row| {
            Ok(Annotation {
                id: row.get(0)?,
                book_id: row.get(1)?,
                highlight_id: row.get(2)?,
                start_pos: row.get::<_, i64>(3)? as usize,
                end_pos: row.get::<_, i64>(4)? as usize,
                selected_text: row.get(5)?,
                note: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        let mut result = Vec::new();
        for ann in annotations {
            let entities = self.conn.prepare("SELECT id, name, entity_type, annotation_id, book_id, start_pos, end_pos FROM entities WHERE annotation_id = ?1")?
                .query_map(params![ann.id], |row| {
                    Ok(Entity {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        entity_type: row.get(2)?,
                        annotation_id: row.get(3)?,
                        book_id: row.get(4)?,
                        start_pos: row.get::<_, i64>(5)? as usize,
                        end_pos: row.get::<_, i64>(6)? as usize,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            result.push((ann, entities));
        }
        
        Ok(result)
    }
    
    pub fn get_annotations_for_entity(&self, entity_name: &str, entity_type: &str) -> Result<Vec<(Annotation, Book)>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT a.id, a.book_id, a.highlight_id, a.start_pos, a.end_pos, a.selected_text, a.note, a.created_at,
                    b.id, b.title, b.author, b.path, b.file_type, b.content, b.created_at
             FROM annotations a
             JOIN entities e ON a.id = e.annotation_id
             JOIN books b ON a.book_id = b.id
             WHERE e.name = ?1 AND e.entity_type = ?2
             ORDER BY a.created_at DESC"
        )?;
        
        let results = stmt.query_map(params![entity_name, entity_type], |row| {
            Ok((
                Annotation {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    highlight_id: row.get(2)?,
                    start_pos: row.get::<_, i64>(3)? as usize,
                    end_pos: row.get::<_, i64>(4)? as usize,
                    selected_text: row.get(5)?,
                    note: row.get(6)?,
                    created_at: row.get(7)?,
                },
                Book {
                    id: row.get(8)?,
                    title: row.get(9)?,
                    author: row.get(10)?,
                    path: row.get(11)?,
                    file_type: row.get(12)?,
                    content: row.get(13)?,
                    created_at: row.get(14)?,
                }
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(results)
    }
    
    pub fn get_all_annotations_with_books(&self) -> Result<Vec<(Annotation, Book, Vec<Entity>)>, rusqlite::Error> {
        let annotations_with_books = self.conn.prepare(
            "SELECT a.id, a.book_id, a.highlight_id, a.start_pos, a.end_pos, a.selected_text, a.note, a.created_at,
                    b.id, b.title, b.author, b.path, b.file_type, b.content, b.created_at
             FROM annotations a
             JOIN books b ON a.book_id = b.id
             ORDER BY a.created_at DESC"
        )?
        .query_map([], |row| {
            Ok((
                Annotation {
                    id: row.get(0)?,
                    book_id: row.get(1)?,
                    highlight_id: row.get(2)?,
                    start_pos: row.get::<_, i64>(3)? as usize,
                    end_pos: row.get::<_, i64>(4)? as usize,
                    selected_text: row.get(5)?,
                    note: row.get(6)?,
                    created_at: row.get(7)?,
                },
                Book {
                    id: row.get(8)?,
                    title: row.get(9)?,
                    author: row.get(10)?,
                    path: row.get(11)?,
                    file_type: row.get(12)?,
                    content: row.get(13)?,
                    created_at: row.get(14)?,
                }
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        let mut result = Vec::new();
        for (ann, book) in annotations_with_books {
            let entities = self.conn.prepare("SELECT id, name, entity_type, annotation_id, book_id, start_pos, end_pos FROM entities WHERE annotation_id = ?1")?
                .query_map(params![ann.id], |row| {
                    Ok(Entity {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        entity_type: row.get(2)?,
                        annotation_id: row.get(3)?,
                        book_id: row.get(4)?,
                        start_pos: row.get::<_, i64>(5)? as usize,
                        end_pos: row.get::<_, i64>(6)? as usize,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            result.push((ann, book, entities));
        }
        
        Ok(result)
    }
}
