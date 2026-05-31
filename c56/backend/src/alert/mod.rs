use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use crate::plugins::{QueryResult, TimeSeries};
use crate::notify::{Notifier, Notification, ChannelConfig, ChannelType, NotifyError};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AlertLevel {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThresholdType {
    Above,
    Below,
    Equal,
    NotEqual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: String,
    pub name: String,
    pub query: String,
    pub database_type: String,
    pub threshold: f64,
    pub threshold_type: ThresholdType,
    pub level: AlertLevel,
    pub duration: String,
    pub enabled: bool,
    pub channels: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub last_triggered: Option<DateTime<Utc>>,
}

impl AlertRule {
    pub fn new(
        name: String,
        query: String,
        database_type: String,
        threshold: f64,
        threshold_type: ThresholdType,
        level: AlertLevel,
        duration: String,
    ) -> Self {
        AlertRule {
            id: Uuid::new_v4().to_string(),
            name,
            query,
            database_type,
            threshold,
            threshold_type,
            level,
            duration,
            enabled: true,
            channels: Vec::new(),
            created_at: Utc::now(),
            last_triggered: None,
        }
    }

    pub fn with_channels(mut self, channels: Vec<String>) -> Self {
        self.channels = channels;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub rule_id: String,
    pub rule_name: String,
    pub level: AlertLevel,
    pub message: String,
    pub timestamp: DateTime<Utc>,
    pub value: f64,
    pub threshold: f64,
}

pub struct AlertEngine {
    rules: HashMap<String, AlertRule>,
    alerts: Vec<Alert>,
    notifiers: HashMap<ChannelType, Arc<dyn Notifier>>,
    channels: HashMap<String, ChannelConfig>,
}

impl AlertEngine {
    pub fn new() -> Self {
        let mut engine = AlertEngine {
            rules: HashMap::new(),
            alerts: Vec::new(),
            notifiers: HashMap::new(),
            channels: HashMap::new(),
        };
        
        engine.register_default_notifiers();
        engine.register_default_channel();
        
        engine
    }

    fn register_default_notifiers(&mut self) {
        use crate::notify::console::ConsoleNotifier;
        use crate::notify::webhook::WebhookNotifier;
        
        self.notifiers.insert(
            ChannelType::Console,
            Arc::new(ConsoleNotifier::new()) as Arc<dyn Notifier>
        );
        self.notifiers.insert(
            ChannelType::Webhook,
            Arc::new(WebhookNotifier::new()) as Arc<dyn Notifier>
        );
    }

    fn register_default_channel(&mut self) {
        let console_config = ChannelConfig::new(
            "default-console".to_string(),
            ChannelType::Console,
            HashMap::new(),
        );
        self.channels.insert(console_config.id.clone(), console_config);
    }

    pub fn register_notifier(&mut self, notifier: Arc<dyn Notifier>) {
        self.notifiers.insert(notifier.channel_type(), notifier);
    }

    pub fn add_channel(&mut self, channel: ChannelConfig) {
        self.channels.insert(channel.id.clone(), channel);
    }

    pub fn remove_channel(&mut self, channel_id: &str) -> Option<ChannelConfig> {
        self.channels.remove(channel_id)
    }

    pub fn get_channel(&self, channel_id: &str) -> Option<&ChannelConfig> {
        self.channels.get(channel_id)
    }

    pub fn get_all_channels(&self) -> Vec<ChannelConfig> {
        self.channels.values().cloned().collect()
    }

    pub fn add_rule(&mut self, rule: AlertRule) {
        self.rules.insert(rule.id.clone(), rule);
    }

    pub fn remove_rule(&mut self, rule_id: &str) -> Option<AlertRule> {
        self.rules.remove(rule_id)
    }

    pub fn get_rule(&self, rule_id: &str) -> Option<&AlertRule> {
        self.rules.get(rule_id)
    }

    pub fn get_all_rules(&self) -> Vec<AlertRule> {
        self.rules.values().cloned().collect()
    }

    pub fn update_rule(&mut self, rule_id: &str, updated_rule: AlertRule) -> Option<AlertRule> {
        if self.rules.contains_key(rule_id) {
            self.rules.insert(rule_id.to_string(), updated_rule.clone());
            Some(updated_rule)
        } else {
            None
        }
    }

    pub async fn evaluate_and_notify(&mut self, rule: &AlertRule, result: &QueryResult) -> Vec<Alert> {
        let alerts = self.evaluate_rule(rule, result);
        
        for alert in &alerts {
            self.add_alert(alert.clone());
            
            let notification = self.create_notification(alert);
            
            let channels = if !rule.channels.is_empty() {
                rule.channels.clone()
            } else {
                self.channels.keys().cloned().collect()
            };
            
            for channel_id in channels {
                if let Some(channel_config) = self.channels.get(&channel_id) {
                    if channel_config.enabled {
                        if let Some(notifier) = self.notifiers.get(&channel_config.channel_type) {
                            match notifier.send(&notification, channel_config).await {
                                Ok(_) => println!("Notification sent to channel: {}", channel_config.name),
                                Err(e) => eprintln!("Failed to send notification to {}: {}", channel_config.name, e),
                            }
                        }
                    }
                }
            }
        }
        
        alerts
    }

    fn create_notification(&self, alert: &Alert) -> Notification {
        let level_str = match alert.level {
            AlertLevel::Info => "info",
            AlertLevel::Warning => "warning",
            AlertLevel::Critical => "critical",
        }.to_string();
        
        Notification::new(
            alert.id.clone(),
            alert.rule_name.clone(),
            level_str,
            alert.message.clone(),
            alert.timestamp.to_rfc3339(),
            alert.value,
            alert.threshold,
        )
    }

    pub fn evaluate_rule(&self, rule: &AlertRule, result: &QueryResult) -> Vec<Alert> {
        let mut alerts = Vec::new();

        if !rule.enabled {
            return alerts;
        }

        for series in &result.series {
            if let Some((timestamp, value)) = self.get_latest_value(series) {
                if self.check_threshold(value, rule.threshold, &rule.threshold_type) {
                    let alert = Alert {
                        id: Uuid::new_v4().to_string(),
                        rule_id: rule.id.clone(),
                        rule_name: rule.name.clone(),
                        level: rule.level.clone(),
                        message: format!(
                            "Alert '{}' triggered: {} {} {} (value: {})",
                            rule.name,
                            series.name,
                            match rule.threshold_type {
                                ThresholdType::Above => ">",
                                ThresholdType::Below => "<",
                                ThresholdType::Equal => "==",
                                ThresholdType::NotEqual => "!=",
                            },
                            rule.threshold,
                            value
                        ),
                        timestamp,
                        value,
                        threshold: rule.threshold,
                    };
                    alerts.push(alert);
                }
            }
        }

        alerts
    }

    fn get_latest_value(&self, series: &TimeSeries) -> Option<(DateTime<Utc>, f64)> {
        series
            .points
            .first()
            .map(|(ts, val)| (*ts, *val))
    }

    fn check_threshold(&self, value: f64, threshold: f64, threshold_type: &ThresholdType) -> bool {
        match threshold_type {
            ThresholdType::Above => value > threshold,
            ThresholdType::Below => value < threshold,
            ThresholdType::Equal => (value - threshold).abs() < f64::EPSILON,
            ThresholdType::NotEqual => (value - threshold).abs() >= f64::EPSILON,
        }
    }

    pub fn get_alerts(&self, limit: Option<usize>) -> Vec<Alert> {
        let mut alerts = self.alerts.clone();
        alerts.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        
        if let Some(limit) = limit {
            alerts.truncate(limit);
        }
        
        alerts
    }

    pub fn add_alert(&mut self, alert: Alert) {
        self.alerts.push(alert);
    }
}

impl Default for AlertEngine {
    fn default() -> Self {
        Self::new()
    }
}
