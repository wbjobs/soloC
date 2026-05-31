use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum NotifyError {
    #[error("Configuration error: {0}")]
    ConfigError(String),
    #[error("Notification send failed: {0}")]
    SendError(String),
    #[error("Channel not found: {0}")]
    ChannelNotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Console,
    Webhook,
    Slack,
    Email,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub alert_id: String,
    pub alert_name: String,
    pub level: String,
    pub message: String,
    pub timestamp: String,
    pub value: f64,
    pub threshold: f64,
    pub labels: HashMap<String, String>,
}

impl Notification {
    pub fn new(
        alert_id: String,
        alert_name: String,
        level: String,
        message: String,
        timestamp: String,
        value: f64,
        threshold: f64,
    ) -> Self {
        Notification {
            id: Uuid::new_v4().to_string(),
            alert_id,
            alert_name,
            level,
            message,
            timestamp,
            value,
            threshold,
            labels: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConfig {
    pub id: String,
    pub name: String,
    pub channel_type: ChannelType,
    pub enabled: bool,
    pub config: HashMap<String, String>,
    pub created_at: String,
}

impl ChannelConfig {
    pub fn new(name: String, channel_type: ChannelType, config: HashMap<String, String>) -> Self {
        ChannelConfig {
            id: Uuid::new_v4().to_string(),
            name,
            channel_type,
            enabled: true,
            config,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

#[async_trait]
pub trait Notifier: Send + Sync {
    fn name(&self) -> &str;
    fn channel_type(&self) -> ChannelType;
    async fn send(&self, notification: &Notification, config: &ChannelConfig) -> Result<(), NotifyError>;
}

pub mod console;
pub mod webhook;
