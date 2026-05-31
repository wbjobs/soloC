use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::plugins::*;
use crate::query::parse_query;
use crate::alert::*;

pub struct AppState {
    pub plugins: Mutex<std::collections::HashMap<String, Box<dyn DatabasePlugin + Send + Sync>>>,
    pub alert_engine: Mutex<AlertEngine>,
}

#[derive(Debug, Deserialize)]
pub struct QueryRequest {
    pub query: String,
    pub database_type: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAlertRuleRequest {
    pub name: String,
    pub query: String,
    pub database_type: String,
    pub threshold: f64,
    pub threshold_type: String,
    pub level: String,
    pub duration: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAlertRuleRequest {
    pub name: Option<String>,
    pub query: Option<String>,
    pub database_type: Option<String>,
    pub threshold: Option<f64>,
    pub threshold_type: Option<String>,
    pub level: Option<String>,
    pub duration: Option<String>,
    pub enabled: Option<bool>,
}

pub async fn execute_query(
    state: web::Data<AppState>,
    req: web::Json<QueryRequest>,
) -> impl Responder {
    let ast = match parse_query(&req.query) {
        Ok(ast) => ast,
        Err(e) => return HttpResponse::BadRequest().body(format!("Parse error: {}", e)),
    };

    let plugins = state.plugins.lock().unwrap();
    let plugin = match plugins.get(&req.database_type) {
        Some(p) => p,
        None => return HttpResponse::BadRequest().body("Database type not supported"),
    };

    let translated_query = match plugin.translate_query(&ast) {
        Ok(q) => q,
        Err(e) => return HttpResponse::InternalServerError().body(format!("Translation error: {}", e)),
    };

    let result = match plugin.query(&translated_query).await {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().body(format!("Query error: {}", e)),
    };

    HttpResponse::Ok().json(result)
}

pub async fn test_parse(
    req: web::Json<QueryRequest>,
) -> impl Responder {
    let ast = match parse_query(&req.query) {
        Ok(ast) => ast,
        Err(e) => return HttpResponse::BadRequest().body(format!("Parse error: {}", e)),
    };

    let promql = crate::query::translate_to_promql(&ast);
    let influxql = crate::query::translate_to_influxql(&ast);
    let sql = crate::query::translate_to_sql(&ast);

    #[derive(Serialize)]
    struct TranslationResult {
        parsed: crate::query::Query,
        prometheus: String,
        influxdb: String,
        timescaledb: String,
    }

    HttpResponse::Ok().json(TranslationResult {
        parsed: ast,
        prometheus: promql,
        influxdb: influxql,
        timescaledb: sql,
    })
}

pub async fn generate_mock_data(
    req: web::Json<QueryRequest>,
) -> impl Responder {
    let ast = match parse_query(&req.query) {
        Ok(ast) => ast,
        Err(e) => return HttpResponse::BadRequest().body(format!("Parse error: {}", e)),
    };

    use chrono::Utc;
    use rand::Rng;
    let mut rng = rand::thread_rng();

    let mut series = Vec::new();
    let mut points = Vec::new();
    
    for i in 0..60 {
        let timestamp = Utc::now() - chrono::Duration::minutes(i);
        let value = 50.0 + rng.gen_range(-20.0..20.0);
        points.push((timestamp, value));
    }
    
    points.sort_by(|a, b| a.0.cmp(&b.0));

    series.push(TimeSeries {
        name: ast.metric,
        labels: std::collections::HashMap::new(),
        points,
    });

    let result = QueryResult { series };
    HttpResponse::Ok().json(result)
}

pub async fn create_alert_rule(
    state: web::Data<AppState>,
    req: web::Json<CreateAlertRuleRequest>,
) -> impl Responder {
    let threshold_type = match req.threshold_type.as_str() {
        "above" => ThresholdType::Above,
        "below" => ThresholdType::Below,
        "equal" => ThresholdType::Equal,
        "not_equal" => ThresholdType::NotEqual,
        _ => return HttpResponse::BadRequest().body("Invalid threshold type"),
    };

    let level = match req.level.as_str() {
        "info" => AlertLevel::Info,
        "warning" => AlertLevel::Warning,
        "critical" => AlertLevel::Critical,
        _ => return HttpResponse::BadRequest().body("Invalid alert level"),
    };

    let rule = AlertRule::new(
        req.name.clone(),
        req.query.clone(),
        req.database_type.clone(),
        req.threshold,
        threshold_type,
        level,
        req.duration.clone(),
    );

    let mut alert_engine = state.alert_engine.lock().unwrap();
    alert_engine.add_rule(rule.clone());

    HttpResponse::Created().json(rule)
}

pub async fn get_alert_rules(
    state: web::Data<AppState>,
) -> impl Responder {
    let alert_engine = state.alert_engine.lock().unwrap();
    let rules = alert_engine.get_all_rules();
    HttpResponse::Ok().json(rules)
}

pub async fn get_alert_rule(
    state: web::Data<AppState>,
    rule_id: web::Path<String>,
) -> impl Responder {
    let alert_engine = state.alert_engine.lock().unwrap();
    match alert_engine.get_rule(&rule_id) {
        Some(rule) => HttpResponse::Ok().json(rule),
        None => HttpResponse::NotFound().body("Rule not found"),
    }
}

pub async fn update_alert_rule(
    state: web::Data<AppState>,
    rule_id: web::Path<String>,
    req: web::Json<UpdateAlertRuleRequest>,
) -> impl Responder {
    let mut alert_engine = state.alert_engine.lock().unwrap();
    
    let mut rule = match alert_engine.get_rule(&rule_id) {
        Some(r) => r.clone(),
        None => return HttpResponse::NotFound().body("Rule not found"),
    };

    if let Some(name) = &req.name {
        rule.name = name.clone();
    }
    if let Some(query) = &req.query {
        rule.query = query.clone();
    }
    if let Some(database_type) = &req.database_type {
        rule.database_type = database_type.clone();
    }
    if let Some(threshold) = req.threshold {
        rule.threshold = threshold;
    }
    if let Some(threshold_type) = &req.threshold_type {
        rule.threshold_type = match threshold_type.as_str() {
            "above" => ThresholdType::Above,
            "below" => ThresholdType::Below,
            "equal" => ThresholdType::Equal,
            "not_equal" => ThresholdType::NotEqual,
            _ => return HttpResponse::BadRequest().body("Invalid threshold type"),
        };
    }
    if let Some(level) = &req.level {
        rule.level = match level.as_str() {
            "info" => AlertLevel::Info,
            "warning" => AlertLevel::Warning,
            "critical" => AlertLevel::Critical,
            _ => return HttpResponse::BadRequest().body("Invalid alert level"),
        };
    }
    if let Some(duration) = &req.duration {
        rule.duration = duration.clone();
    }
    if let Some(enabled) = req.enabled {
        rule.enabled = enabled;
    }

    alert_engine.update_rule(&rule_id, rule.clone());

    HttpResponse::Ok().json(rule)
}

pub async fn delete_alert_rule(
    state: web::Data<AppState>,
    rule_id: web::Path<String>,
) -> impl Responder {
    let mut alert_engine = state.alert_engine.lock().unwrap();
    match alert_engine.remove_rule(&rule_id) {
        Some(_) => HttpResponse::NoContent().finish(),
        None => HttpResponse::NotFound().body("Rule not found"),
    }
}

pub async fn get_alerts(
    state: web::Data<AppState>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> impl Responder {
    let alert_engine = state.alert_engine.lock().unwrap();
    let limit = query.get("limit").and_then(|l| l.parse().ok());
    let alerts = alert_engine.get_alerts(limit);
    HttpResponse::Ok().json(alerts)
}

pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}
