use super::*;
use crate::query::Query;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;

pub struct PrometheusPlugin {
    client: Option<Client>,
    url: String,
}

impl PrometheusPlugin {
    pub fn new() -> Self {
        PrometheusPlugin {
            client: None,
            url: String::new(),
        }
    }
}

#[async_trait]
impl DatabasePlugin for PrometheusPlugin {
    fn name(&self) -> &str {
        "prometheus"
    }

    async fn connect(&mut self, config: &DatabaseConfig) -> Result<(), PluginError> {
        self.url = config.url.clone();
        self.client = Some(Client::new());
        Ok(())
    }

    async fn query(&self, query: &str) -> Result<QueryResult, PluginError> {
        let client = self
            .client
            .as_ref()
            .ok_or_else(|| PluginError::ConnectionError("Not connected".to_string()))?;

        let url = format!("{}/api/v1/query", self.url);
        let response = client
            .get(&url)
            .query(&[("query", query)])
            .send()
            .await
            .map_err(|e| PluginError::QueryError(e.to_string()))?;

        let json: Value = response
            .json()
            .await
            .map_err(|e| PluginError::QueryError(e.to_string()))?;

        let mut result = QueryResult { series: Vec::new() };

        if let Some(data) = json.get("data") {
            if let Some(result_array) = data.get("result") {
                if let Some(array) = result_array.as_array() {
                    for item in array {
                        let mut labels = std::collections::HashMap::new();
                        
                        if let Some(metric) = item.get("metric") {
                            if let Some(obj) = metric.as_object() {
                                for (k, v) in obj {
                                    if let Some(s) = v.as_str() {
                                        labels.insert(k.clone(), s.to_string());
                                    }
                                }
                            }
                        }

                        let metric_name = labels
                            .get("__name__")
                            .cloned()
                            .unwrap_or_else(|| "unknown".to_string());
                        labels.remove("__name__");

                        let mut points = Vec::new();
                        if let Some(value) = item.get("value") {
                            if let Some(arr) = value.as_array() {
                                if arr.len() >= 2 {
                                    if let (Some(ts), Some(val)) = (arr[0].as_f64(), arr[1].as_str()) {
                                        if let Ok(fval) = val.parse::<f64>() {
                                            use chrono::TimeZone;
                                            let timestamp = chrono::Utc
                                                .timestamp_opt(ts as i64, ((ts % 1.0) * 1e9) as u32)
                                                .single()
                                                .unwrap_or_else(chrono::Utc::now);
                                            points.push((timestamp, fval));
                                        }
                                    }
                                }
                            }
                        }

                        result.series.push(TimeSeries {
                            name: metric_name,
                            labels,
                            points,
                        });
                    }
                }
            }
        }

        Ok(result)
    }

    fn translate_query(&self, ast: &Query) -> Result<String, PluginError> {
        Ok(crate::query::translate_to_promql(ast))
    }
}
