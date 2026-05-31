use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use thiserror::Error;

pub mod influxdb;
pub mod prometheus;
pub mod timescaledb;

#[derive(Error, Debug)]
pub enum PluginError {
    #[error("Database connection error: {0}")]
    ConnectionError(String),
    #[error("Query execution error: {0}")]
    QueryError(String),
    #[error("Translation error: {0}")]
    TranslationError(String),
    #[error("Configuration error: {0}")]
    ConfigError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataPoint {
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub series: Vec<TimeSeries>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeries {
    pub name: String,
    pub labels: HashMap<String, String>,
    pub points: Vec<(DateTime<Utc>, f64)>,
}

#[async_trait]
pub trait DatabasePlugin: Send + Sync {
    fn name(&self) -> &str;
    async fn connect(&mut self, config: &DatabaseConfig) -> Result<(), PluginError>;
    async fn query(&self, query: &str) -> Result<QueryResult, PluginError>;
    fn translate_query(&self, ast: &crate::query::Query) -> Result<String, PluginError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub db_type: DatabaseType,
    pub url: String,
    pub name: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseType {
    InfluxDB,
    Prometheus,
    TimescaleDB,
}

impl DatabaseType {
    pub fn as_str(&self) -> &str {
        match self {
            DatabaseType::InfluxDB => "influxdb",
            DatabaseType::Prometheus => "prometheus",
            DatabaseType::TimescaleDB => "timescaledb",
        }
    }
}
