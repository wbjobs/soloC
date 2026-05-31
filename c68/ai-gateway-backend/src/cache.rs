use fastembed::{Embedding, EmbeddingModel, InitOptions};
use qdrant_client::prelude::*;
use qdrant_client::qdrant::*;
use std::sync::Arc;
use lru::LruCache;
use std::num::NonZeroUsize;
use std::collections::{HashSet, HashMap};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

const VECTOR_SIZE: usize = 384;
const LRU_CACHE_SIZE: usize = 1000;
const KEYWORD_OVERLAP_THRESHOLD: f32 = 0.6;
const FINAL_SCORE_THRESHOLD: f32 = 0.85;
const DEFAULT_TENANT: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QAPair {
    pub question: String,
    pub answer: String,
    #[serde(default)]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarmupRequest {
    pub tenant_id: Option<String>,
    pub qa_pairs: Vec<QAPair>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WarmupResult {
    pub tenant_id: String,
    pub total: usize,
    pub success: usize,
    pub failed: usize,
}

#[derive(Clone)]
struct CacheEntry {
    response: String,
    keywords: HashSet<String>,
    fingerprint: String,
    timestamp: u64,
    tenant_id: String,
}

#[derive(Clone)]
struct TenantCache {
    lru: LruCache<String, CacheEntry>,
    fingerprint_index: HashMap<String, String>,
}

pub struct SemanticCache {
    qdrant: Arc<QdrantClient>,
    embedding_model: EmbeddingModel,
    tenant_caches: Arc<RwLock<HashMap<String, TenantCache>>>,
}

impl SemanticCache {
    pub async fn new() -> Self {
        let qdrant = Self::connect_qdrant().await;
        let embedding_model = Self::init_embedding_model();
        let tenant_caches = Arc::new(RwLock::new(HashMap::new()));

        Self {
            qdrant: Arc::new(qdrant),
            embedding_model,
            tenant_caches,
        }
    }

    fn get_collection_name(tenant_id: &str) -> String {
        format!("ai_gateway_cache_{}", tenant_id)
    }

    async fn get_or_create_tenant_cache(&self, tenant_id: &str) -> TenantCache {
        let mut caches = self.tenant_caches.write().await;
        
        if !caches.contains_key(tenant_id) {
            let tenant_cache = TenantCache {
                lru: LruCache::new(NonZeroUsize::new(LRU_CACHE_SIZE).unwrap()),
                fingerprint_index: HashMap::new(),
            };
            caches.insert(tenant_id.to_string(), tenant_cache);
            
            Self::ensure_tenant_collection(&self.qdrant, tenant_id).await;
        }
        
        caches.get(tenant_id).cloned().unwrap()
    }

    async fn connect_qdrant() -> QdrantClient {
        match QdrantClient::from_url("http://localhost:6334").build() {
            Ok(client) => {
                Self::ensure_tenant_collection(&client, DEFAULT_TENANT).await;
                client
            }
            Err(e) => {
                eprintln!("Failed to connect to Qdrant: {}. Using in-memory cache only.", e);
                QdrantClient::from_url("http://localhost:6334").build().unwrap_or_else(|_| {
                    panic!("Qdrant connection failed. Please start Qdrant with docker-compose up")
                })
            }
        }
    }

    async fn ensure_tenant_collection(client: &QdrantClient, tenant_id: &str) {
        let collection_name = Self::get_collection_name(tenant_id);
        
        match client.collection_exists(&collection_name).await {
            Ok(true) => return,
            _ => {}
        }

        let _ = client.create_collection(&CreateCollection {
            collection_name,
            vectors_config: Some(VectorsConfig {
                config: Some(vectors_config::Config::Params(VectorParams {
                    size: VECTOR_SIZE as u64,
                    distance: Distance::Cosine.into(),
                    ..Default::default()
                })),
            }),
            ..Default::default()
        }).await;
    }

    fn init_embedding_model() -> EmbeddingModel {
        EmbeddingModel::try_init(InitOptions::new(Embedding::AllMiniLML6V2)).unwrap()
    }

    fn embed(&self, text: &str) -> Result<Vec<f32>, String> {
        match self.embedding_model.embed(&[text]) {
            Ok(embeddings) => Ok(embeddings[0].clone()),
            Err(e) => Err(format!("Embedding failed: {}", e)),
        }
    }

    fn extract_keywords(&self, text: &str) -> HashSet<String> {
        text.split_whitespace()
            .map(|s| s.to_lowercase())
            .filter(|s| s.len() > 2)
            .collect()
    }

    fn calculate_fingerprint(&self, text: &str, keywords: &HashSet<String>) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        
        let mut sorted_keywords: Vec<_> = keywords.iter().cloned().collect();
        sorted_keywords.sort();
        
        for kw in &sorted_keywords {
            kw.hash(&mut hasher);
        }
        
        text.len().hash(&mut hasher);
        
        format!("{:x}", hasher.finish())
    }

    fn calculate_keyword_overlap(&self, k1: &HashSet<String>, k2: &HashSet<String>) -> f32 {
        if k1.is_empty() || k2.is_empty() {
            return 0.0;
        }
        
        let intersection = k1.intersection(k2).count();
        let union = k1.union(k2).count();
        
        intersection as f32 / union as f32
    }

    pub async fn get(&self, prompt: &str, tenant_id: Option<&str>) -> Option<String> {
        let tenant_id = tenant_id.unwrap_or(DEFAULT_TENANT);
        let prompt_keywords = self.extract_keywords(prompt);
        let prompt_fingerprint = self.calculate_fingerprint(prompt, &prompt_keywords);
        
        {
            let mut caches = self.tenant_caches.write().await;
            let tenant_cache = caches.get_mut(tenant_id);
            
            if let Some(cache) = tenant_cache {
                if let Some(fingerprint_match) = cache.fingerprint_index.get(&prompt_fingerprint) {
                    if let Some(entry) = cache.lru.get(fingerprint_match) {
                        return Some(entry.response.clone());
                    }
                }
                
                if let Some(entry) = cache.lru.get(prompt) {
                    return Some(entry.response.clone());
                }
            }
        }

        let vector = match self.embed(prompt) {
            Ok(v) => v,
            Err(_) => return None,
        };

        let collection_name = Self::get_collection_name(tenant_id);
        
        let search_result = self.qdrant.search_points(&SearchPoints {
            collection_name,
            vector,
            limit: 5,
            score_threshold: Some(0.7),
            with_payload: Some(true.into()),
            ..Default::default()
        }).await;

        if let Ok(result) = search_result {
            let mut candidates: Vec<(f32, String, HashSet<String>, String)> = Vec::new();

            for point in result.result.iter() {
                if let Some(payload) = &point.payload {
                    if let (Some(response), Some(stored_keywords_str), Some(stored_fingerprint)) = (
                        payload.get("response").map(|v| v.to_string()),
                        payload.get("keywords").and_then(|v| v.as_str()),
                        payload.get("fingerprint").and_then(|v| v.as_str())
                    ) {
                        if stored_fingerprint == prompt_fingerprint {
                            return Some(response);
                        }

                        let stored_keywords: HashSet<String> = stored_keywords_str
                            .split(',')
                            .map(|s| s.to_string())
                            .collect();

                        let keyword_overlap = self.calculate_keyword_overlap(
                            &prompt_keywords,
                            &stored_keywords
                        );

                        if keyword_overlap >= KEYWORD_OVERLAP_THRESHOLD {
                            let vector_score = point.score;
                            let final_score = vector_score * 0.6 + keyword_overlap * 0.4;
                            
                            if final_score >= FINAL_SCORE_THRESHOLD {
                                candidates.push((
                                    final_score, 
                                    response, 
                                    stored_keywords, 
                                    stored_fingerprint.to_string()
                                ));
                            }
                        }
                    }
                }
            }

            if !candidates.is_empty() {
                candidates.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
                
                let best_match = &candidates[0];
                let entry = CacheEntry {
                    response: best_match.1.clone(),
                    keywords: best_match.2.clone(),
                    fingerprint: best_match.3.clone(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                    tenant_id: tenant_id.to_string(),
                };

                let mut caches = self.tenant_caches.write().await;
                if let Some(cache) = caches.get_mut(tenant_id) {
                    cache.lru.put(prompt.to_string(), entry.clone());
                    cache.fingerprint_index.insert(best_match.3.clone(), prompt.to_string());
                }
                
                return Some(best_match.1.clone());
            }
        }

        None
    }

    pub async fn set(&self, prompt: &str, response: &str, tenant_id: Option<&str>) {
        let tenant_id = tenant_id.unwrap_or(DEFAULT_TENANT);
        let keywords = self.extract_keywords(prompt);
        let fingerprint = self.calculate_fingerprint(prompt, &keywords);
        let keywords_str: String = keywords.iter().cloned().collect::<Vec<_>>().join(",");

        let entry = CacheEntry {
            response: response.to_string(),
            keywords: keywords.clone(),
            fingerprint: fingerprint.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            tenant_id: tenant_id.to_string(),
        };

        {
            let mut caches = self.tenant_caches.write().await;
            if !caches.contains_key(tenant_id) {
                let tenant_cache = TenantCache {
                    lru: LruCache::new(NonZeroUsize::new(LRU_CACHE_SIZE).unwrap()),
                    fingerprint_index: HashMap::new(),
                };
                caches.insert(tenant_id.to_string(), tenant_cache);
            }
            
            if let Some(cache) = caches.get_mut(tenant_id) {
                cache.lru.put(prompt.to_string(), entry);
                cache.fingerprint_index.insert(fingerprint.clone(), prompt.to_string());
            }
        }

        let vector = match self.embed(prompt) {
            Ok(v) => v,
            Err(_) => return,
        };

        let id = uuid::Uuid::new_v4().to_string();
        
        let mut payload = Payload::new();
        payload.insert("prompt", prompt);
        payload.insert("response", response);
        payload.insert("keywords", keywords_str);
        payload.insert("fingerprint", fingerprint);

        let collection_name = Self::get_collection_name(tenant_id);
        
        let _ = self.qdrant.upsert_points(&UpsertPoints {
            collection_name,
            points: vec![PointStruct::new(id, vector, payload)],
            ..Default::default()
        }).await;
    }

    pub async fn warmup(&self, request: WarmupRequest) -> WarmupResult {
        let tenant_id = request.tenant_id.unwrap_or_else(|| DEFAULT_TENANT.to_string());
        let mut success = 0;
        let mut failed = 0;

        Self::ensure_tenant_collection(&self.qdrant, &tenant_id).await;

        let mut points: Vec<PointStruct> = Vec::new();
        let mut cache_entries: Vec<(String, CacheEntry)> = Vec::new();

        for qa in &request.qa_pairs {
            let keywords = self.extract_keywords(&qa.question);
            let fingerprint = self.calculate_fingerprint(&qa.question, &keywords);
            let keywords_str: String = keywords.iter().cloned().collect::<Vec<_>>().join(",");

            match self.embed(&qa.question) {
                Ok(vector) => {
                    let id = uuid::Uuid::new_v4().to_string();
                    
                    let mut payload = Payload::new();
                    payload.insert("prompt", qa.question.as_str());
                    payload.insert("response", qa.answer.as_str());
                    payload.insert("keywords", keywords_str);
                    payload.insert("fingerprint", fingerprint.clone());
                    
                    if let Some(category) = &qa.category {
                        payload.insert("category", category.as_str());
                    }

                    points.push(PointStruct::new(id, vector, payload));

                    let entry = CacheEntry {
                        response: qa.answer.clone(),
                        keywords: keywords.clone(),
                        fingerprint: fingerprint.clone(),
                        timestamp: std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_secs(),
                        tenant_id: tenant_id.clone(),
                    };
                    
                    cache_entries.push((qa.question.clone(), entry));
                    success += 1;
                }
                Err(_) => {
                    failed += 1;
                }
            }
        }

        if !points.is_empty() {
            let collection_name = Self::get_collection_name(&tenant_id);
            let _ = self.qdrant.upsert_points(&UpsertPoints {
                collection_name,
                points,
                ..Default::default()
            }).await;
        }

        {
            let mut caches = self.tenant_caches.write().await;
            if !caches.contains_key(&tenant_id) {
                let tenant_cache = TenantCache {
                    lru: LruCache::new(NonZeroUsize::new(LRU_CACHE_SIZE).unwrap()),
                    fingerprint_index: HashMap::new(),
                };
                caches.insert(tenant_id.clone(), tenant_cache);
            }
            
            if let Some(cache) = caches.get_mut(&tenant_id) {
                for (question, entry) in cache_entries {
                    let fp = entry.fingerprint.clone();
                    cache.lru.put(question.clone(), entry);
                    cache.fingerprint_index.insert(fp, question);
                }
            }
        }

        WarmupResult {
            tenant_id: tenant_id.clone(),
            total: request.qa_pairs.len(),
            success,
            failed,
        }
    }

    pub async fn clear(&self, tenant_id: Option<&str>) {
        let tenant_id = tenant_id.unwrap_or(DEFAULT_TENANT);
        
        {
            let mut caches = self.tenant_caches.write().await;
            if let Some(cache) = caches.get_mut(tenant_id) {
                cache.lru.clear();
                cache.fingerprint_index.clear();
            }
        }
        
        let collection_name = Self::get_collection_name(tenant_id);
        let _ = self.qdrant.delete_collection(&collection_name).await;
        Self::ensure_tenant_collection(&self.qdrant, tenant_id).await;
    }

    pub async fn clear_all(&self) {
        let mut caches = self.tenant_caches.write().await;
        let tenants: Vec<String> = caches.keys().cloned().collect();
        
        for tenant_id in &tenants {
            if let Some(cache) = caches.get_mut(tenant_id) {
                cache.lru.clear();
                cache.fingerprint_index.clear();
            }
            
            let collection_name = Self::get_collection_name(tenant_id);
            let _ = self.qdrant.delete_collection(&collection_name).await;
        }
        
        caches.clear();
    }
}
