use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalEvent {
    pub timestamp: f64,
    pub event_type: EventType,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum EventType {
    Output,
    Input,
    Resize { cols: u16, rows: u16 },
    CommandStart,
    CommandEnd,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingHeader {
    pub version: String,
    pub created_at: DateTime<Utc>,
    pub shell: String,
    pub term: String,
    pub cols: u16,
    pub rows: u16,
    pub duration: f64,
    pub event_count: usize,
    pub encrypted: bool,
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingFile {
    pub header: RecordingHeader,
    pub events: Vec<TerminalEvent>,
}

impl RecordingFile {
    pub fn new(shell: String, cols: u16, rows: u16) -> Self {
        Self {
            header: RecordingHeader {
                version: "1.0".to_string(),
                created_at: Utc::now(),
                shell,
                term: std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string()),
                cols,
                rows,
                duration: 0.0,
                event_count: 0,
                encrypted: false,
                checksum: None,
            },
            events: Vec::new(),
        }
    }

    pub fn add_event(&mut self, event: TerminalEvent) {
        self.events.push(event);
        self.header.event_count = self.events.len();
    }

    pub fn finalize(&mut self) {
        if let Some(last_event) = self.events.last() {
            self.header.duration = last_event.timestamp;
        }
    }
}
