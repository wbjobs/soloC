use super::*;
use crate::query::Query;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;

pub struct InfluxDBPlugin {
    client: Option<Client>,
    url: String,
    db_name: String,
    org: String,
    token: Option<String>,
    use_flux: bool,
}

impl InfluxDBPlugin {
    pub fn new() -> Self {
        InfluxDBPlugin {
            client: None,
            url: String::new(),
            db_name: String::new(),
            org: String::new(),
            token: None,
            use_flux: false,
        }
    }

    async fn query_flux(&self, query: &str) -> Result<QueryResult, PluginError> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| PluginError::ConnectionError("Not connected".to_string()))?;

        let url = format!("{}/api/v2/query", self.url);
        let mut request = client.post(&url).header("Content-Type", "application/vnd.flux");
        
        if let Some(token) = &self.token {
            request = request.header("Authorization", format!("Token {}", token));
        }
        
        let response = request
            .body(query.to_string())
            .send()
            .await
            .map_err(|e| PluginError::QueryError(e.to_string()))?;

        let json: Value = response
            .json()
            .await
            .map_err(|e| PluginError::QueryError(e.to_string()))?;

        let mut result = QueryResult { series: Vec::new() };

        if let Some(array) = json.as_array() {
            let mut series_map = std::collections::HashMap::new();
            
            for table in array {
                if let Some(records) = table.get("records").and_then(|r| r.as_array()) {
                    for record in records {
                        let measurement = record
                            .get("_measurement")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        
                        let mut labels = std::collections::HashMap::new();
                        if let Some(obj) = record.as_object() {
                            for (k, v) in obj {
                                if !k.starts_with('_') {
                                    if let Some(s) = v.as_str() {
                                        labels.insert(k.clone(), s.to_string());
                                    }
                                }
                            }
                        }
                        
                        let key = format!("{:?}", labels);
                        let series_entry = series_map
                            .entry(key)
                            .or_insert_with(|| TimeSeries {
                                name: measurement.clone(),
                                labels: labels.clone(),
                                points: Vec::new(),
                            });
                        
                        if let (Some(time_str), Some(val)) = (
                            record.get("_time").and_then(|t| t.as_str()),
                            record.get("_value").and_then(|v| v.as_f64()),
                        ) {
                            if let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(time_str) {
                                series_entry.points.push((timestamp.with_timezone(&chrono::Utc), val));
                            }
                        }
                    }
                }
            }
            
            result.series = series_map.into_values().collect();
        }

        Ok(result)
    }

    async fn query_influxql(&self, query: &str) -> Result<QueryResult, PluginError> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| PluginError::ConnectionError("Not connected".to_string()))?;

        let url = format!("{}/query", self.url);
        let response = client
            .post(&url)
            .form(&[("db", &self.db_name), ("q", query)])
            .send()
            .await
            .map_err(|e| PluginError::QueryError(e.to_string()))?;

        let json: Value = response
            .json()
            .await
            .map_err(|e| PluginError::QueryError(e.to_string()))?;

        let mut result = QueryResult { series: Vec::new() };

        if let Some(results) = json.get("results") {
            if let Some(array) = results.as_array() {
                for res in array {
                    if let Some(series) = res.get("series") {
                        if let Some(series_array) = series.as_array() {
                            for s in series_array {
                                let name = s
                                    .get("name")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("unknown")
                                    .to_string();

                                let mut labels = std::collections::HashMap::new();
                                if let Some(tags) = s.get("tags") {
                                    if let Some(obj) = tags.as_object() {
                                        for (k, v) in obj {
                                            if let Some(s) = v.as_str() {
                                                labels.insert(k.clone(), s.to_string());
                                            }
                                        }
                                    }
                                }

                                let mut points = Vec::new();
                                if let Some(values) = s.get("values") {
                                    if let Some(val_array) = values.as_array() {
                                        for row in val_array {
                                            if let Some(row_arr) = row.as_array() {
                                                if row_arr.len() >= 2 {
                                                    if let (Some(time_str), Some(val)) =
                                                        (row_arr[0].as_str(), row_arr[1].as_f64())
                                                    {
                                                        if let Ok(timestamp) =
                                                            chrono::DateTime::parse_from_rfc3339(time_str)
                                                        {
                                                            points.push((timestamp.with_timezone(&chrono::Utc), val));
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                result.series.push(TimeSeries {
                                    name,
                                    labels,
                                    points,
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(result)
    }
}

#[async_trait]
impl DatabasePlugin for InfluxDBPlugin {
    fn name(&self) -> &str {
        "influxdb"
    }

    async fn connect(&mut self, config: &DatabaseConfig) -> Result<(), PluginError> {
        self.url = config.url.clone();
        self.db_name = config.name.clone().unwrap_or_else(|| "default".to_string());
        self.org = "default".to_string();
        self.token = config.password.clone();
        self.use_flux = self.token.is_some();
        self.client = Some(Client::new());
        Ok(())
    }

    async fn query(&self, query: &str) -> Result<QueryResult, PluginError> {
        if self.use_flux {
            self.query_flux(query).await
        } else {
            self.query_influxql(query).await
        }
    }

    fn translate_query(&self, ast: &Query) -> Result<String, PluginError> {
        if self.use_flux {
            Ok(crate::query::translate_to_flux(ast))
        } else {
            Ok(crate::query::translate_to_influxql(ast))
        }
    }
}
