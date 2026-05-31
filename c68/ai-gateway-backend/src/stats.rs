use dashmap::DashMap;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Serialize, Default)]
pub struct ModelStats {
    pub total_requests: u64,
    pub cached_requests: u64,
}

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub total_requests: u64,
    pub total_cached: u64,
    pub cache_hit_rate: f64,
    pub models: dashmap::mapref::one::Ref<'static, String, ModelStats>,
}

pub struct StatsCollector {
    total_requests: AtomicU64,
    total_cached: AtomicU64,
    model_stats: DashMap<String, ModelStats>,
}

impl StatsCollector {
    pub fn new() -> Self {
        Self {
            total_requests: AtomicU64::new(0),
            total_cached: AtomicU64::new(0),
            model_stats: DashMap::new(),
        }
    }

    pub fn record_request(&self, model: &str, cached: bool) {
        self.total_requests.fetch_add(1, Ordering::SeqCst);
        
        if cached {
            self.total_cached.fetch_add(1, Ordering::SeqCst);
        }

        let mut entry = self.model_stats.entry(model.to_string()).or_insert(ModelStats {
            total_requests: 0,
            cached_requests: 0,
        });

        entry.total_requests += 1;
        if cached {
            entry.cached_requests += 1;
        }
    }

    pub fn get_stats(&self) -> serde_json::Value {
        let total = self.total_requests.load(Ordering::SeqCst);
        let cached = self.total_cached.load(Ordering::SeqCst);
        let hit_rate = if total > 0 {
            (cached as f64) / (total as f64) * 100.0
        } else {
            0.0
        };

        let mut models = serde_json::Map::new();
        for entry in self.model_stats.iter() {
            models.insert(entry.key().clone(), serde_json::to_value(entry.value()).unwrap());
        }

        serde_json::json!({
            "total_requests": total,
            "total_cached": cached,
            "cache_hit_rate": hit_rate,
            "models": models,
        })
    }
}
