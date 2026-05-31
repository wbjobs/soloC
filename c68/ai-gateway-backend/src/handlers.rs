use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use crate::AppState;
use crate::cache::{WarmupRequest, WarmupResult};

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub prompt: String,
    #[serde(default)]
    pub tenant_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub response: String,
    pub model: String,
    pub cached: bool,
    pub tenant_id: String,
}

pub async fn chat_handler(
    state: web::Data<AppState>,
    req: web::Json<ChatRequest>,
) -> impl Responder {
    let prompt = &req.prompt;
    let tenant_id = req.tenant_id.as_deref();
    let model = state.router.route(prompt);
    
    if let Some(cached_response) = state.cache.get(prompt, tenant_id).await {
        state.stats.record_request(&model.to_string(), true);
        
        return HttpResponse::Ok().json(ChatResponse {
            response: cached_response,
            model: model.to_string(),
            cached: true,
            tenant_id: tenant_id.unwrap_or("default").to_string(),
        });
    }

    let response = state.router.call_model(model, prompt).await;
    
    match response {
        Ok(resp) => {
            state.cache.set(prompt, &resp, tenant_id).await;
            state.stats.record_request(&model.to_string(), false);
            
            HttpResponse::Ok().json(ChatResponse {
                response: resp,
                model: model.to_string(),
                cached: false,
                tenant_id: tenant_id.unwrap_or("default").to_string(),
            })
        }
        Err(e) => HttpResponse::InternalServerError().body(e),
    }
}

pub async fn stats_handler(state: web::Data<AppState>) -> impl Responder {
    HttpResponse::Ok().json(state.stats.get_stats())
}

#[derive(Debug, Deserialize)]
pub struct ClearCacheRequest {
    #[serde(default)]
    pub tenant_id: Option<String>,
    #[serde(default)]
    pub all: Option<bool>,
}

pub async fn clear_cache_handler(
    state: web::Data<AppState>,
    req: web::Json<ClearCacheRequest>,
) -> impl Responder {
    if req.all.unwrap_or(false) {
        state.cache.clear_all().await;
    } else {
        state.cache.clear(req.tenant_id.as_deref()).await;
    }
    
    HttpResponse::Ok().json(serde_json::json!({ 
        "status": "success",
        "message": "Cache cleared successfully"
    }))
}

pub async fn warmup_handler(
    state: web::Data<AppState>,
    req: web::Json<WarmupRequest>,
) -> impl Responder {
    let result = state.cache.warmup(req.into_inner()).await;
    HttpResponse::Ok().json(result)
}
