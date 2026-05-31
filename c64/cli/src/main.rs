use clap::Parser;
use log::{info, warn, error, debug};
use rand::Rng;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use chrono::Utc;

const BATCH_SIZE: usize = 500;
const MAX_CACHED_MESSAGES: u64 = 100_000;
const WARNING_WATERMARK: u64 = 80_000;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(short, long, default_value_t = 100)]
    devices: u32,

    #[arg(short, long, default_value_t = 1000)]
    interval_ms: u64,

    #[arg(short, long, default_value = "localhost")]
    mqtt_host: String,

    #[arg(short, long, default_value_t = 1883)]
    mqtt_port: u16,

    #[arg(long, default_value_t = 100_000)]
    max_cache: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SensorData {
    device_id: String,
    sensor_type: String,
    value: f64,
    timestamp: i64,
    sequence: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RuleAction {
    #[serde(rename = "type")]
    action_type: String,
    actuator: String,
    params: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Rule {
    id: String,
    name: String,
    description: Option<String>,
    condition: String,
    action: RuleAction,
    enabled: Option<bool>,
    created_at: Option<i64>,
    updated_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RuleEvent {
    id: String,
    rule_id: String,
    rule_name: String,
    device_id: String,
    sensor_type: String,
    value: f64,
    action: RuleAction,
    timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct RuleSyncMessage {
    #[serde(rename = "type")]
    msg_type: String,
    rules: Vec<Rule>,
    timestamp: i64,
}

struct AppState {
    db: Arc<Mutex<Connection>>,
    is_connected: Arc<Mutex<bool>>,
    sequence: Arc<Mutex<u64>>,
    is_resending: Arc<Mutex<bool>>,
    batch_buffer: Arc<Mutex<Vec<SensorData>>>,
    last_flush: Arc<Mutex<i64>>,
    rules: Arc<Mutex<Vec<Rule>>>,
    actuators: Arc<Mutex<HashMap<String, ActuatorState>>>,
    rule_events: Arc<Mutex<Vec<RuleEvent>>>,
}

#[derive(Debug, Clone)]
struct ActuatorState {
    name: String,
    is_active: bool,
    last_triggered: i64,
    trigger_count: u64,
}

impl AppState {
    fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let mut db = Connection::open("iot_cache.db")?;
        
        db.pragma_update(None, "journal_mode", "WAL")?;
        db.pragma_update(None, "synchronous", "NORMAL")?;
        db.pragma_update(None, "cache_size", "-20000")?;
        
        db.execute(
            "CREATE TABLE IF NOT EXISTS pending_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                sensor_type TEXT NOT NULL,
                value REAL NOT NULL,
                timestamp INTEGER NOT NULL,
                sequence INTEGER NOT NULL UNIQUE,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;
        
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_sequence ON pending_messages(sequence ASC)",
            [],
        )?;

        db.execute(
            "CREATE TABLE IF NOT EXISTS rule_events (
                id TEXT PRIMARY KEY,
                rule_id TEXT NOT NULL,
                rule_name TEXT NOT NULL,
                device_id TEXT NOT NULL,
                sensor_type TEXT NOT NULL,
                value REAL NOT NULL,
                action_json TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )",
            [],
        )?;

        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            is_connected: Arc::new(Mutex::new(true)),
            sequence: Arc::new(Mutex::new(0)),
            is_resending: Arc::new(Mutex::new(false)),
            batch_buffer: Arc::new(Mutex::new(Vec::with_capacity(BATCH_SIZE))),
            last_flush: Arc::new(Mutex::new(0)),
            rules: Arc::new(Mutex::new(Vec::new())),
            actuators: Arc::new(Mutex::new(HashMap::new())),
            rule_events: Arc::new(Mutex::new(Vec::new())),
        })
    }

    async fn evaluate_rule(&self, rule: &Rule, data: &SensorData) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let mut condition = rule.condition.clone();
        
        condition = condition
            .replace("temp", "value")
            .replace("temperature", "value")
            .replace("humidity", "value")
            .replace("pressure", "value");
        
        let device_num: u32 = data.device_id
            .split('_')
            .nth(1)
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        if condition.contains("device_id in") {
            let re = Regex::new(r"device_id\s+in\s*\[([\d\s,.]+)\]")?;
            if let Some(caps) = re.captures(&condition) {
                let range_str = &caps[1];
                let in_range = Self::parse_device_range(range_str, device_num)?;
                condition = re.replace(&condition, &in_range.to_string()).to_string();
            }
        }

        if condition.contains("device_id ==") {
            let re = Regex::new(r"device_id\s*==\s*(\d+)")?;
            if let Some(caps) = re.captures(&condition) {
                let target: u32 = caps[1].parse()?;
                let matches = device_num == target;
                condition = re.replace(&condition, &matches.to_string()).to_string();
            }
        }

        let expr = condition.replace("&&", "and").replace("||", "or");
        
        let mut context = evalexpr::HashMapContext::new();
        context.set_value("value".to_string(), evalexpr::Value::Float(data.value))?;
        context.set_value("device_num".to_string(), evalexpr::Value::Int(device_num as i64))?;

        match evalexpr::eval_with_context(&expr, &context) {
            Ok(result) => Ok(result.as_boolean().unwrap_or(false)),
            Err(e) => {
                debug!("规则计算失败 {}: {}, expr: {}", rule.id, e, expr);
                Ok(false)
            }
        }
    }

    fn parse_device_range(range_str: &str, device_num: u32) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let clean: String = range_str.chars().filter(|c| !c.is_whitespace()).collect();
        let parts: Vec<&str> = clean.split(',').collect();
        
        for part in parts {
            if part.contains("..") {
                let bounds: Vec<&str> = part.split("..").collect();
                if bounds.len() == 2 {
                    let start: u32 = bounds[0].parse()?;
                    let end: u32 = bounds[1].parse()?;
                    if device_num >= start && device_num <= end {
                        return Ok(true);
                    }
                }
            } else {
                let val: u32 = part.parse()?;
                if device_num == val {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    async fn process_rules_for_data(&self, data: &SensorData) -> Result<Vec<RuleEvent>, Box<dyn std::error::Error + Send + Sync>> {
        let rules = self.rules.lock().await;
        let mut events = Vec::new();

        for rule in rules.iter() {
            if !rule.enabled.unwrap_or(true) {
                continue;
            }

            let sensor_type_match = match rule.condition.as_str() {
                c if c.contains("temp") || c.contains("temperature") => data.sensor_type == "temperature",
                c if c.contains("humidity") => data.sensor_type == "humidity",
                c if c.contains("pressure") => data.sensor_type == "pressure",
                _ => true,
            };

            if !sensor_type_match {
                continue;
            }

            match self.evaluate_rule(rule, data).await {
                Ok(true) => {
                    let event = RuleEvent {
                        id: format!("evt_{}_{}", Utc::now().timestamp_millis(), rand::thread_rng().gen::<u16>()),
                        rule_id: rule.id.clone(),
                        rule_name: rule.name.clone(),
                        device_id: data.device_id.clone(),
                        sensor_type: data.sensor_type.clone(),
                        value: data.value,
                        action: rule.action.clone(),
                        timestamp: Utc::now().timestamp_millis(),
                    };
                    events.push(event);
                }
                Ok(false) => {}
                Err(e) => {
                    debug!("规则 {} 计算错误: {}", rule.id, e);
                }
            }
        }

        Ok(events)
    }

    async fn trigger_actuator(&self, event: &RuleEvent) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut actuators = self.actuators.lock().await;
        let actuator_name = event.action.actuator.clone();
        
        let actuator = actuators.entry(actuator_name.clone())
            .or_insert(ActuatorState {
                name: actuator_name.clone(),
                is_active: false,
                last_triggered: 0,
                trigger_count: 0,
            });

        let action_type = event.action.action_type.as_str();
        match action_type {
            "actuator" | "toggle" => {
                actuator.is_active = !actuator.is_active;
                actuator.last_triggered = event.timestamp;
                actuator.trigger_count += 1;
                
                let state = if actuator.is_active { "激活" } else { "关闭" };
                info!("[执行器] {} {} - 设备: {}, 传感器: {}, 值: {:.2}",
                    actuator_name, state, event.device_id, event.sensor_type, event.value);
            }
            "on" => {
                actuator.is_active = true;
                actuator.last_triggered = event.timestamp;
                actuator.trigger_count += 1;
                info!("[执行器] {} 开启 - 设备: {}", actuator_name, event.device_id);
            }
            "off" => {
                actuator.is_active = false;
                actuator.last_triggered = event.timestamp;
                actuator.trigger_count += 1;
                info!("[执行器] {} 关闭 - 设备: {}", actuator_name, event.device_id);
            }
            _ => {
                debug!("未知动作类型: {}", action_type);
            }
        }

        Ok(())
    }

    async fn save_rule_event(&self, event: &RuleEvent) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let db = self.db.lock().await;
        let action_json = serde_json::to_string(&event.action)?;
        
        db.execute(
            "INSERT INTO rule_events (id, rule_id, rule_name, device_id, sensor_type, value, action_json, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                event.id,
                event.rule_id,
                event.rule_name,
                event.device_id,
                event.sensor_type,
                event.value,
                action_json,
                event.timestamp,
            ],
        )?;

        Ok(())
    }

    async fn get_cached_count(&self) -> Result<u64, Box<dyn std::error::Error>> {
        let db = self.db.lock().await;
        let count: u64 = db.query_row(
            "SELECT COUNT(*) FROM pending_messages",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    async fn save_message_batch(&self, data: SensorData) -> Result<(), Box<dyn std::error::Error>> {
        let mut buffer = self.batch_buffer.lock().await;
        buffer.push(data);

        let now = Utc::now().timestamp_millis();
        let mut last_flush = self.last_flush.lock().await;
        
        if buffer.len() >= BATCH_SIZE || (now - *last_flush) > 1000 {
            let db = self.db.lock().await;
            let tx = db.transaction()?;
            
            {
                let mut stmt = tx.prepare(
                    "INSERT OR IGNORE INTO pending_messages 
                     (device_id, sensor_type, value, timestamp, sequence, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
                )?;
                
                for item in buffer.iter() {
                    stmt.execute(params![
                        item.device_id,
                        item.sensor_type,
                        item.value,
                        item.timestamp,
                        item.sequence,
                        Utc::now().timestamp_millis()
                    ])?;
                }
            }
            
            tx.commit()?;
            *last_flush = now;
            let flushed = buffer.len();
            buffer.clear();
            drop(buffer);
            
            let count = self.get_cached_count().await?;
            if count >= WARNING_WATERMARK {
                warn!("缓存水位警告: {} 条记录 (阈值: {})", count, WARNING_WATERMARK);
            }
            if count > MAX_CACHED_MESSAGES {
                error!("缓存已满 ({} 条)，丢弃最早数据", MAX_CACHED_MESSAGES);
                self.trim_oldest_messages(MAX_CACHED_MESSAGES / 2).await?;
            }
            
            debug!("批量刷新: {} 条记录写入 SQLite", flushed);
        }
        
        Ok(())
    }

    async fn trim_oldest_messages(&self, keep: u64) -> Result<(), Box<dyn std::error::Error>> {
        let db = self.db.lock().await;
        db.execute(
            "DELETE FROM pending_messages WHERE sequence <= (
                SELECT sequence FROM pending_messages ORDER BY sequence DESC LIMIT 1 OFFSET ?
            )",
            params![keep as i64],
        )?;
        Ok(())
    }

    async fn flush_remaining(&self) -> Result<(), Box<dyn std::error::Error>> {
        let buffer = self.batch_buffer.lock().await;
        if buffer.is_empty() {
            return Ok(());
        }
        
        let db = self.db.lock().await;
        let tx = db.transaction()?;
        
        {
            let mut stmt = tx.prepare(
                "INSERT OR IGNORE INTO pending_messages 
                 (device_id, sensor_type, value, timestamp, sequence, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            )?;
            
            for item in buffer.iter() {
                stmt.execute(params![
                    item.device_id,
                    item.sensor_type,
                    item.value,
                    item.timestamp,
                    item.sequence,
                    Utc::now().timestamp_millis()
                ])?;
            }
        }
        
        tx.commit()?;
        Ok(())
    }

    async fn get_pending_messages_batch(&self, limit: usize) -> Result<(Vec<SensorData>, u64), Box<dyn std::error::Error>> {
        let db = self.db.lock().await;
        let mut stmt = db.prepare(
            "SELECT device_id, sensor_type, value, timestamp, sequence 
             FROM pending_messages 
             ORDER BY sequence ASC 
             LIMIT ?"
        )?;
        
        let rows = stmt.query_map([limit as i64], |row| {
            Ok(SensorData {
                device_id: row.get(0)?,
                sensor_type: row.get(1)?,
                value: row.get(2)?,
                timestamp: row.get(3)?,
                sequence: row.get(4)?,
            })
        })?;
        
        let messages: Vec<SensorData> = rows.collect::<Result<Vec<_>, _>>()?;
        let max_sequence = messages.last().map(|m| m.sequence).unwrap_or(0);
        
        Ok((messages, max_sequence))
    }

    async fn delete_messages_up_to(&self, sequence: u64) -> Result<usize, Box<dyn std::error::Error>> {
        let db = self.db.lock().await;
        let changed = db.execute(
            "DELETE FROM pending_messages WHERE sequence <= ?",
            params![sequence],
        )?;
        Ok(changed)
    }
}

async fn simulate_network_jitter(is_connected: Arc<Mutex<bool>>) {
    let mut rng = rand::thread_rng();
    loop {
        let wait_time = rng.gen_range(60..120);
        tokio::time::sleep(tokio::time::Duration::from_secs(wait_time)).await;
        
        warn!("模拟网络中断 - 持续 30 秒");
        *is_connected.lock().await = false;
        
        tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
        
        warn!("网络恢复 - 开始重传缓存数据");
        *is_connected.lock().await = true;
    }
}

async fn publish_sensor_data(
    client: &rumqttc::AsyncClient,
    data: &SensorData,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let payload = serde_json::to_string(data)?;
    let topic = format!("iot/devices/{}/sensors/{}", data.device_id, data.sensor_type);
    client.publish(topic, rumqttc::QoS::AtLeastOnce, false, payload).await?;
    Ok(())
}

async fn resend_cached_data(
    state: Arc<Mutex<AppState>>,
    client: &rumqttc::AsyncClient,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state_guard = state.lock().await;
    
    {
        let mut resending = state_guard.is_resending.lock().await;
        if *resending {
            debug!("重传正在进行中，跳过");
            return Ok(());
        }
        *resending = true;
    }
    
    let state_clone = state.clone();
    let client_clone = client.clone();
    
    tokio::spawn(async move {
        let total_start = std::time::Instant::now();
        let mut total_sent = 0;
        
        loop {
            let (batch, max_sequence) = {
                let s = state_clone.lock().await;
                match s.get_pending_messages_batch(BATCH_SIZE).await {
                    Ok(result) => result,
                    Err(e) => {
                        error!("获取缓存批次失败: {}", e);
                        break;
                    }
                }
            };
            
            if batch.is_empty() {
                break;
            }
            
            info!("重传批次: {} 条 (sequence 范围: {} - {})", 
                  batch.len(), 
                  batch.first().map(|m| m.sequence).unwrap_or(0),
                  max_sequence);
            
            for data in &batch {
                if let Err(e) = publish_sensor_data(&client_clone, data).await {
                    error!("重传失败: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    continue;
                }
            }
            
            {
                let s = state_clone.lock().await;
                if let Err(e) = s.delete_messages_up_to(max_sequence).await {
                    error!("删除已重传消息失败: {}", e);
                }
            }
            
            total_sent += batch.len();
            
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        }
        
        if total_sent > 0 {
            info!("重传完成！总计 {} 条，耗时 {:?}", total_sent, total_start.elapsed());
        }
        
        let mut resending = state_clone.lock().await.is_resending.lock().await;
        *resending = false;
    });
    
    Ok(())
}

async fn device_worker(
    device_id: u32,
    state: Arc<Mutex<AppState>>,
    client: rumqttc::AsyncClient,
    interval_ms: u64,
) {
    let device_id_str = format!("device_{:03}", device_id);
    let sensors = vec!["temperature", "humidity", "pressure"];
    let mut rng = rand::thread_rng();

    loop {
        for sensor in &sensors {
            let value = match *sensor {
                "temperature" => rng.gen_range(20.0..85.0),
                "humidity" => rng.gen_range(30.0..95.0),
                "pressure" => rng.gen_range(980.0..1050.0),
                _ => 0.0,
            };

            let sequence = {
                let state_guard = state.lock().await;
                let mut seq_guard = state_guard.sequence.lock().await;
                *seq_guard += 1;
                *seq_guard
            };

            let data = SensorData {
                device_id: device_id_str.clone(),
                sensor_type: sensor.to_string(),
                value,
                timestamp: Utc::now().timestamp_millis(),
                sequence,
            };

            {
                let s = state.lock().await;
                let events = s.process_rules_for_data(&data).await.unwrap_or_default();
                for event in events {
                    let _ = s.trigger_actuator(&event).await;
                    let _ = s.save_rule_event(&event).await;
                }
            }

            let is_connected = {
                let state_guard = state.lock().await;
                *state_guard.is_connected.lock().await
            };

            if is_connected {
                match publish_sensor_data(&client, &data).await {
                    Ok(_) => {
                        debug!("[{}] {}: {:.2}", device_id_str, sensor, value);
                    }
                    Err(e) => {
                        debug!("发送失败，缓存数据: {}", e);
                        let state_guard = state.lock().await;
                        let _ = state_guard.save_message_batch(data).await;
                    }
                }
            } else {
                let state_guard = state.lock().await;
                let _ = state_guard.save_message_batch(data).await;
                
                if sequence % 1000 == 0 {
                    let count = state_guard.get_cached_count().await.unwrap_or(0);
                    warn!("[{}] 网络断开，累计缓存 {} 条数据", device_id_str, count);
                }
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(interval_ms)).await;
    }
}

async fn handle_rule_sync(
    state: Arc<Mutex<AppState>>,
    payload: &[u8],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let msg: RuleSyncMessage = serde_json::from_slice(payload)?;
    
    if msg.msg_type == "rules_sync" {
        let mut rules = state.lock().await.rules.lock().await;
        let old_count = rules.len();
        *rules = msg.rules;
        info!("规则同步完成: {} -> {} 条规则", old_count, rules.len());
    }
    
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    let args = Args::parse();

    info!("启动 IoT 模拟器: {} 个设备，间隔 {}ms", args.devices, args.interval_ms);
    info!("最大缓存限制: {} 条，警告水位: {} 条", MAX_CACHED_MESSAGES, WARNING_WATERMARK);

    let state = Arc::new(Mutex::new(AppState::new()?));
    
    {
        let state_guard = state.lock().await;
        let count = state_guard.get_cached_count().await?;
        info!("启动时已有缓存: {} 条", count);
    }

    let mut mqtt_opts = rumqttc::MqttOptions::new("iot-simulator", &args.mqtt_host, args.mqtt_port);
    mqtt_opts.set_keep_alive(std::time::Duration::from_secs(30));
    mqtt_opts.set_inflight(100);
    
    let (client, mut eventloop) = rumqttc::AsyncClient::new(mqtt_opts, 10);

    let is_connected_clone = state.lock().await.is_connected.clone();
    tokio::spawn(async move {
        simulate_network_jitter(is_connected_clone).await;
    });

    let state_clone = state.clone();
    let client_clone = client.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            let is_connected = {
                let s = state_clone.lock().await;
                *s.is_connected.lock().await
            };
            if is_connected {
                let _ = resend_cached_data(state_clone.clone(), &client_clone).await;
            }
        }
    });

    let state_clone = state.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            {
                let s = state_clone.lock().await;
                let _ = s.flush_remaining().await;
            }
        }
    });

    let state_clone = state.clone();
    let client_clone = client.clone();
    tokio::spawn(async move {
        client_clone.subscribe("iot/rules/update", rumqttc::QoS::AtLeastOnce).await.unwrap();
        
        loop {
            if let Err(e) = eventloop.poll().await {
                error!("MQTT 事件循环错误: {}", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            }
        }
    });

    let eventloop_client = client.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        let mut rx = eventloop_client.subscribe("iot/rules/update", rumqttc::QoS::AtLeastOnce).await.unwrap();
        
        while let Some(msg) = rx.recv().await {
            if let rumqttc::Event::Incoming(rumqttc::Packet::Publish(publish)) = msg {
                let _ = handle_rule_sync(state_clone.clone(), &publish.payload).await;
            }
        }
    });

    let client_clone = client.clone();
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        info!("请求同步规则...");
        let _ = client_clone.publish("iot/rules/request_sync", rumqttc::QoS::AtLeastOnce, false, vec![]).await;
    });

    for device_id in 1..=args.devices {
        let state_clone = state.clone();
        let client_clone = client.clone();
        tokio::spawn(async move {
            device_worker(device_id, state_clone, client_clone, args.interval_ms).await;
        });
    }

    info!("所有设备已启动，按 Ctrl+C 退出");
    tokio::signal::ctrl_c().await?;
    
    info!("正在刷新剩余缓存...");
    {
        let s = state.lock().await;
        let _ = s.flush_remaining().await;
    }
    
    info!("退出中...");
    Ok(())
}
