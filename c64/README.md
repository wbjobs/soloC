# IoT 模拟系统 - CLI + Web 混合工具

这是一个完整的物联网模拟系统，包含设备模拟、消息队列、时序数据存储和可视化监控。

## 系统架构

```
┌─────────────────┐   MQTT    ┌─────────────────┐   HTTP    ┌─────────────────┐
│  Rust CLI       │ ────────▶ │  Go Backend     │ ────────▶ │  Svelte Frontend│
│  (设备模拟器)   │           │  (Echo + MQTT)  │           │  (实时监控)     │
└─────────────────┘           └─────────────────┘           └─────────────────┘
         │                              │
         ▼                              ▼
  ┌──────────────┐              ┌──────────────┐
  │  SQLite      │              │  InfluxDB    │
  │  (本地缓存)  │              │  (时序数据)   │
  └──────────────┘              └──────────────┘
```

## 核心功能

### 1. Rust CLI - 设备模拟器
- 模拟 100+ 个物联网设备
- 每个设备上报 3 种传感器数据（温度、湿度、气压）
- **网络抖动模拟**：随机断网 30 秒
- **本地缓存**：断网时使用 SQLite 缓存数据
- **断网续传**：网络恢复后按序列号顺序重发数据
- MQTT QoS 1 消息投递

### 2. Go 后端 (Echo)
- MQTT 消费者，订阅所有设备数据
- 数据写入 InfluxDB 时序数据库
- RESTful API 接口：
  - `GET /api/sensors` - 查询传感器数据
  - `GET /api/devices` - 获取设备列表
  - `GET /api/stats` - 获取统计信息

### 3. Svelte 前端
- 实时数据流图表展示（Chart.js）
- 设备选择器
- 实时统计卡片
- 最近数据表格
- 每 2 秒自动刷新

## 快速启动

### 1. 启动基础设施 (MQTT + InfluxDB)

```bash
cd docker
docker-compose up -d
```

这将启动：
- Eclipse Mosquitto (MQTT Broker) - localhost:1883
- InfluxDB 2.7 - localhost:8086

InfluxDB 默认配置：
- 用户名: admin
- 密码: password123
- 组织: iot-org
- 存储桶: iot-data
- Token: my-super-secret-auth-token

### 2. 启动 Go 后端

```bash
cd backend
go mod download
go run main.go
```

后端运行在 http://localhost:8080

### 3. 启动 Svelte 前端

```bash
cd frontend
npm install
npm run dev
```

前端运行在 http://localhost:5173

### 4. 启动 Rust CLI 模拟器

```bash
cd cli
cargo build --release
./target/release/iot-simulator --devices 100 --interval-ms 1000
```

参数说明：
- `--devices` / `-d`: 模拟设备数量 (默认: 100)
- `--interval-ms` / `-i`: 上报间隔毫秒 (默认: 1000)
- `--mqtt-host`: MQTT 服务器地址 (默认: localhost)
- `--mqtt-port`: MQTT 服务器端口 (默认: 1883)

## 核心特性详解

### 网络抖动模拟

CLI 会随机每 60-120 秒触发一次网络中断，持续 30 秒。在此期间：
- 所有设备继续生成数据
- 数据被持久化到 SQLite 数据库
- 日志显示 "网络断开，已缓存数据 #"

### 断网续传

网络恢复后：
- 系统自动检测连接状态
- 从 SQLite 按序列号升序读取缓存数据
- 按顺序批量重发到 MQTT Broker
- 发送成功后删除已发送的缓存
- 日志显示 "开始重传 X 条缓存数据"

### 数据完整性保证

每条消息包含唯一序列号，后端存储时保留：
- device_id: 设备标识
- sensor_type: 传感器类型
- value: 数值
- timestamp: 时间戳
- sequence: 全局序列号

## API 文档

### 查询传感器数据
```
GET /api/sensors?device_id=device_001&sensor_type=temperature&limit=50
```

参数：
- `device_id` (可选): 设备 ID 过滤
- `sensor_type` (可选): 传感器类型过滤
- `limit` (可选): 返回条数 (默认: 100)

### 获取设备列表
```
GET /api/devices
```

### 获取统计
```
GET /api/stats
```

## 项目结构

```
.
├── cli/                    # Rust CLI 模拟器
│   ├── src/main.rs         # 主程序
│   └── Cargo.toml          # Rust 依赖
├── backend/                # Go 后端
│   ├── main.go             # 主程序
│   └── go.mod              # Go 依赖
├── frontend/               # Svelte 前端
│   ├── src/App.svelte      # 主组件
│   └── package.json        # JS 依赖
└── docker/                 # Docker 配置
    ├── docker-compose.yml  # 服务编排
    └── mosquitto.conf      # MQTT 配置
```

## 技术栈

- **CLI**: Rust, rumqttc, rusqlite, tokio, serde
- **Backend**: Go, Echo, Paho MQTT, InfluxDB Client
- **Frontend**: Svelte, Vite, Chart.js
- **Infrastructure**: Eclipse Mosquitto (MQTT), InfluxDB 2.x

## 故障排查

### MQTT 连接失败
- 检查 docker-compose 是否正常运行
- 验证端口 1883 是否被占用
- 查看 Mosquitto 日志: `docker logs iot-mqtt`

### InfluxDB 写入失败
- 检查 InfluxDB 状态: `docker logs iot-influxdb`
- 验证 Token 配置是否正确
- 访问 http://localhost:8086 查看管理界面

### 前端无法获取数据
- 检查后端是否运行在 8080 端口
- 查看浏览器控制台 CORS 错误
- 确认 API_BASE 配置正确
