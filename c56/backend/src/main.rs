use actix_web::{web, App, HttpServer};
use actix_cors::Cors;

mod plugins;
mod query;
mod alert;
mod api;

use api::AppState;
use plugins::*;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();

    let mut plugins = std::collections::HashMap::new();
    
    let prometheus_plugin = plugins::prometheus::PrometheusPlugin::new();
    plugins.insert("prometheus".to_string(), Box::new(prometheus_plugin) as Box<dyn DatabasePlugin + Send + Sync>);
    
    let influxdb_plugin = plugins::influxdb::InfluxDBPlugin::new();
    plugins.insert("influxdb".to_string(), Box::new(influxdb_plugin) as Box<dyn DatabasePlugin + Send + Sync>);
    
    let timescaledb_plugin = plugins::timescaledb::TimescaleDBPlugin::new();
    plugins.insert("timescaledb".to_string(), Box::new(timescaledb_plugin) as Box<dyn DatabasePlugin + Send + Sync>);

    let app_state = web::Data::new(AppState {
        plugins: std::sync::Mutex::new(plugins),
        alert_engine: std::sync::Mutex::new(alert::AlertEngine::new()),
    });

    println!("Starting server on http://localhost:8080");

    HttpServer::new(move || {
        let cors = Cors::permissive();

        App::new()
            .wrap(cors)
            .app_data(app_state.clone())
            .route("/health", web::get().to(api::health_check))
            .route("/api/query", web::post().to(api::execute_query))
            .route("/api/parse", web::post().to(api::test_parse))
            .route("/api/mock", web::post().to(api::generate_mock_data))
            .route("/api/alerts/rules", web::get().to(api::get_alert_rules))
            .route("/api/alerts/rules", web::post().to(api::create_alert_rule))
            .route("/api/alerts/rules/{id}", web::get().to(api::get_alert_rule))
            .route("/api/alerts/rules/{id}", web::put().to(api::update_alert_rule))
            .route("/api/alerts/rules/{id}", web::delete().to(api::delete_alert_rule))
            .route("/api/alerts", web::get().to(api::get_alerts))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
