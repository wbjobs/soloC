use super::*;
use async_trait::async_trait;
use reqwest::Client;
use std::time::Duration;

pub struct WebhookNotifier {
    client: Client,
}

impl Default for WebhookNotifier {
    fn default() -> Self {
        Self::new()
    }
}

impl WebhookNotifier {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        WebhookNotifier { client }
    }
}

#[async_trait]
impl Notifier for WebhookNotifier {
    fn name(&self) -> &str {
        "webhook"
    }

    fn channel_type(&self) -> ChannelType {
        ChannelType::Webhook
    }

    async fn send(&self, notification: &Notification, config: &ChannelConfig) -> Result<(), NotifyError> {
        let url = config
            .config
            .get("url")
            .ok_or_else(|| NotifyError::ConfigError("Webhook URL not configured".to_string()))?;

        let method = config.config.get("method").map(|s| s.as_str()).unwrap_or("POST");
        let content_type = config
            .config
            .get("content_type")
            .map(|s| s.as_str())
            .unwrap_or("application/json");

        let mut headers = std::collections::HashMap::new();
        for (k, v) in &config.config {
            if k.starts_with("header_") {
                let header_name = k.strip_prefix("header_").unwrap_or(k);
                headers.insert(header_name.to_string(), v.clone());
            }
        }

        let body = serde_json::to_string(notification)
            .map_err(|e| NotifyError::SendError(format!("Failed to serialize notification: {}", e)))?;

        let mut request = match method.to_uppercase().as_str() {
            "POST" => self.client.post(url),
            "PUT" => self.client.put(url),
            "GET" => self.client.get(url),
            _ => self.client.post(url),
        };

        request = request.header("Content-Type", content_type);

        for (k, v) in headers {
            request = request.header(&k, &v);
        }

        let response = if method.to_uppercase().as_str() == "GET" {
            request.send().await
        } else {
            request.body(body).send().await
        };

        match response {
            Ok(resp) => {
                if resp.status().is_success() {
                    Ok(())
                } else {
                    let status = resp.status();
                    let body = resp
                        .text()
                        .await
                        .unwrap_or_else(|_| "No response body".to_string());
                    Err(NotifyError::SendError(format!(
                        "Webhook returned non-success status: {}, body: {}",
                        status, body
                    )))
                }
            }
            Err(e) => Err(NotifyError::SendError(format!(
                "Failed to send webhook request: {}",
                e
            ))),
        }
    }
}
