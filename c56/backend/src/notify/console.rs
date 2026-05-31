use super::*;
use async_trait::async_trait;

pub struct ConsoleNotifier;

#[async_trait]
impl Notifier for ConsoleNotifier {
    fn name(&self) -> &str {
        "console"
    }

    fn channel_type(&self) -> ChannelType {
        ChannelType::Console
    }

    async fn send(&self, notification: &Notification, _config: &ChannelConfig) -> Result<(), NotifyError> {
        let level_color = match notification.level.as_str() {
            "critical" => "\x1b[31m",
            "warning" => "\x1b[33m",
            "info" => "\x1b[36m",
            _ => "\x1b[0m",
        };
        let reset = "\x1b[0m";

        println!("\n{}=============================================={}", level_color, reset);
        println!("{}🔔 ALERT: {}{}", level_color, notification.alert_name, reset);
        println!("{}=============================================={}", level_color, reset);
        println!("  Level: {}{}{}", level_color, notification.level.to_uppercase(), reset);
        println!("  Time:  {}", notification.timestamp);
        println!("  Value: {} (threshold: {})", notification.value, notification.threshold);
        println!("  Msg:   {}", notification.message);
        
        if !notification.labels.is_empty() {
            println!("  Labels:");
            for (k, v) in &notification.labels {
                println!("    - {}: {}", k, v);
            }
        }
        
        println!("{}=============================================={}\n", level_color, reset);

        Ok(())
    }
}

impl Default for ConsoleNotifier {
    fn default() -> Self {
        Self::new()
    }
}

impl ConsoleNotifier {
    pub fn new() -> Self {
        ConsoleNotifier
    }
}
