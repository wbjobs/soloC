use std::collections::HashMap;
use std::f64;

use crate::models::{MarkdownFile, SearchResult, SearchMatch};

pub fn tfidf_search(
    files: &HashMap<String, MarkdownFile>,
    query: &str,
    max_results: usize,
) -> Vec<SearchResult> {
    if query.trim().is_empty() {
        return Vec::new();
    }
    
    let query_tokens = tokenize(query);
    if query_tokens.is_empty() {
        return Vec::new();
    }
    
    let mut doc_frequencies: HashMap<String, usize> = HashMap::new();
    
    for file in files.values() {
        let tokens = tokenize(&file.content);
        let unique_tokens: std::collections::HashSet<_> = tokens.into_iter().collect();
        for token in unique_tokens {
            *doc_frequencies.entry(token).or_insert(0) += 1;
        }
    }
    
    let total_docs = files.len() as f64;
    
    let mut results: Vec<SearchResult> = Vec::new();
    
    for file in files.values() {
        let score = compute_tfidf_score(file, &query_tokens, &doc_frequencies, total_docs);
        
        if score > 0.0 {
            let matches = find_matches(file, &query_tokens);
            if !matches.is_empty() {
                results.push(SearchResult {
                    file: file.clone(),
                    score,
                    matches,
                });
            }
        }
    }
    
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(max_results);
    
    results
}

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty() && s.len() >= 2)
        .map(|s| s.to_string())
        .collect()
}

fn compute_tfidf_score(
    file: &MarkdownFile,
    query_tokens: &[String],
    doc_frequencies: &HashMap<String, usize>,
    total_docs: f64,
) -> f64 {
    let tokens = tokenize(&file.content);
    let total_tokens = tokens.len() as f64;
    
    if total_tokens == 0.0 {
        return 0.0;
    }
    
    let mut term_freq: HashMap<&str, usize> = HashMap::new();
    for token in &tokens {
        *term_freq.entry(token).or_insert(0) += 1;
    }
    
    let mut score = 0.0;
    
    for token in query_tokens {
        if let Some(&tf) = term_freq.get(token.as_str()) {
            let tf_norm = tf as f64 / total_tokens;
            let df = doc_frequencies.get(token).copied().unwrap_or(1) as f64;
            let idf = (total_docs / df).ln();
            score += tf_norm * idf;
        }
    }
    
    score
}

fn find_matches(file: &MarkdownFile, query_tokens: &[String]) -> Vec<SearchMatch> {
    let mut matches = Vec::new();
    let content = &file.content;
    let content_lower = content.to_lowercase();
    
    let snippet_length = 150;
    let mut seen_positions = Vec::new();
    
    for token in query_tokens {
        let token_lower = token.to_lowercase();
        let mut start = 0;
        
        while let Some(pos) = content_lower[start..].find(&token_lower) {
            let actual_pos = start + pos;
            
            if seen_positions.iter().any(|&p| (p as isize - actual_pos as isize).abs() < snippet_length as isize) {
                start = actual_pos + token_lower.len();
                continue;
            }
            
            seen_positions.push(actual_pos);
            
            let snippet_start = if actual_pos > snippet_length / 2 {
                actual_pos - snippet_length / 2
            } else {
                0
            };
            
            let snippet_end = std::cmp::min(
                snippet_start + snippet_length,
                content.len()
            );
            
            let mut snippet = &content[snippet_start..snippet_end];
            if snippet_start > 0 {
                snippet = &snippet[snippet.find(|c: char| c.is_whitespace()).unwrap_or(0)..];
            }
            if snippet_end < content.len() {
                if let Some(last_space) = snippet.rfind(|c: char| c.is_whitespace()) {
                    snippet = &snippet[..last_space];
                }
            }
            
            let snippet_trimmed = snippet.trim();
            if !snippet_trimmed.is_empty() {
                let positions = vec![actual_pos - snippet_start];
                
                matches.push(SearchMatch {
                    snippet: if snippet_start > 0 {
                        format!("...{}", snippet_trimmed)
                    } else {
                        snippet_trimmed.to_string()
                    } + if snippet_end < content.len() { "..." } else { "" },
                    positions,
                });
            }
            
            if matches.len() >= 5 {
                return matches;
            }
            
            start = actual_pos + token_lower.len();
        }
    }
    
    matches
}
