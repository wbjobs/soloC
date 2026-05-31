use super::*;
use crate::query::Query;
use async_trait::async_trait;
use sqlx::{postgres::PgPoolOptions, Row};

pub struct TimescaleDBPlugin {
    pool: Option<sqlx::PgPool>,
    connection_string: String,
}

impl TimescaleDBPlugin {
    pub fn new() -> Self {
        TimescaleDBPlugin {
            pool: None,
            connection_string: String::new(),
        }
    }
}

#[async_trait]
impl DatabasePlugin for TimescaleDBPlugin {
    fn name(&self) -> &str {
        "timescaledb"
    }

    async fn connect(&mut self, config: &DatabaseConfig) -> Result<(), PluginError> {
        let db_name = config.name.clone().unwrap_or_else(|| "postgres".to_string());
        let user = config.username.clone().unwrap_or_else(|| "postgres".to_string());
        let pass = config.password.clone().unwrap_or_default();
        
        self.connection_string = format!(
            "postgres://{}:{}@{}/{}",
            user, pass, config.url, db_name
        );

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&self.connection_string)
            .await
            .map_err(|e| PluginError::ConnectionError(e.to_string()))?;

        self.pool = Some(pool);
        Ok(())
    }

    async fn query(&self, query: &str) -> Result<QueryResult, PluginError> {
        let pool = self
            .pool
            .as_ref()
            .ok_or_else(|| PluginError::ConnectionError("Not connected".to_string()))?;

        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| PluginError::QueryError(e.to_string()))?;

        let mut result = QueryResult { series: Vec::new() };
        let mut series_map = std::collections::HashMap::new();

        for row in rows {
            let bucket: chrono::DateTime<chrono::Utc> = row.try_get("bucket").unwrap_or_else(|_| chrono::Utc::now());
            let value: f64 = row.try_get("value").unwrap_or(0.0);
            
            let series_name = "metric".to_string();
            let labels = std::collections::HashMap::new();

            let entry = series_map
                .entry(series_name.clone())
                .or_insert_with(|| TimeSeries {
                    name: series_name,
                    labels,
                    points: Vec::new(),
                });
            
            entry.points.push((bucket, value));
        }

        result.series = series_map.into_values().collect();

        Ok(result)
    }

    fn translate_query(&self, ast: &Query) -> Result<String, PluginError> {
        Ok(crate::query::translate_to_sql(ast))
    }
}
