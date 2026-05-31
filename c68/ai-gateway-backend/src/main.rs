mod router;
mod cache;
mod stats;
mod handlers;

use actix_web::{web, App, HttpServer};
use actix_cors::Cors;
use std::sync::Arc;
use dashmap::DashMap;

#[derive(Clone)]
pub struct AppState {
    pub router: Arc<router::LLMRouter>,
    pub cache: Arc<cache::SemanticCache>,
    pub stats: Arc<stats::StatsCollector>,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt::init();

    let router = Arc::new(router::LLMRouter::new());
    let cache = Arc::new(cache::SemanticCache::new().await);
    let stats = Arc::new(stats::StatsCollector::new());

    let app_state = AppState {
        router,
        cache,
        stats,
    };

    println!("Starting AI Gateway server on http://localhost:8080");

    HttpServer::new(move || {
        let cors = Cors::permissive();
        
        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .wrap(cors)
            .service(
                web::scope("/api")
                    .route("/chat", web::post().to(handlers::chat_handler))
                    .route("/stats", web::get().to(handlers::stats_handler))
                    .route("/cache/clear", web::post().to(handlers::clear_cache_handler))
                    .route("/cache/warmup", web::post().to(handlers::warmup_handler))
            )
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
