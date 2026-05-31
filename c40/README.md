# 工业设备监控系统

一个完整的工业设备监控系统，包含设备模拟、数据采集、时序存储、温度预测、告警推送和可视化仪表板。

## 系统架构

```
设备模拟器 (Python) 
    ↓ MQTT
EMQX Broker
    ↓ MQTT
Spring Boot 后端
    ↓ 存储 / 查询
InfluxDB (时序数据库) + Redis (告警状态)
    ↓ REST API / WebSocket
Vue3 前端仪表板
```

## 功能特性

### 1. 设备模拟器 (device-simulator)
- 模拟 100 个工业设备
- 每 5 秒发布 MQTT 消息
- 包含温度、振动、电流三项指标
- 温度带有趋势和随机异常

### 2. Spring Boot 后端
- MQTT 消费者订阅设备数据
- InfluxDB 时序数据存储
- 线性回归温度预测（基于最近 24 小时数据，预测未来 1 小时）
- 告警检测和生成
- WebSocket 实时推送告警
- Redis 存储告警状态

### 3. Vue3 前端仪表板
- 设备列表展示（带告警状态）
- 实时温度曲线图表
- 预测温度曲线图表
- 告警闪烁提醒
- WebSocket 实时接收告警

## 快速开始

### 前置要求
- Docker & Docker Compose
- Java 11+
- Node.js 16+
- Python 3.8+

### 步骤 1: 启动基础设施
```bash
docker-compose up -d
```
这将启动：
- EMQX MQTT Broker (端口: 1883)
- InfluxDB 2.7 (端口: 8086)
- Redis (端口: 6379)

### 步骤 2: 启动 Spring Boot 后端
```bash
cd backend
mvn clean package
java -jar target/device-monitor-1.0.0.jar
```
后端运行在: http://localhost:8080

### 步骤 3: 启动设备模拟器
```bash
cd device-simulator
pip install -r requirements.txt
python device_simulator.py
```

### 步骤 4: 启动 Vue3 前端
```bash
cd frontend
npm install
npm run dev
```
前端运行在: http://localhost:3000

## 项目结构

```
.
├── device-simulator/      # Python MQTT 设备模拟器
│   ├── requirements.txt
│   └── device_simulator.py
├── backend/               # Spring Boot 后端
│   ├── pom.xml
│   └── src/
│       └── main/
│           ├── java/com/iot/monitor/
│           │   ├── config/          # 配置类
│           │   ├── controller/      # REST API
│           │   ├── model/           # 数据模型
│           │   └── service/         # 业务逻辑
│           └── resources/
│               └── application.yml
├── frontend/              # Vue3 前端
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.vue
│       └── main.js
└── docker-compose.yml     # 基础设施编排
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/devices | 获取所有设备状态 |
| GET | /api/devices/{deviceId}/history | 获取设备历史温度 |
| GET | /api/devices/{deviceId}/predictions | 获取设备温度预测 |
| GET | /api/alerts | 获取活动告警 |
| DELETE | /api/alerts/{deviceId} | 清除设备告警 |

## WebSocket 订阅

- 主题: `/topic/alerts`
- 消息格式: Alert 对象

## 配置说明

### 后端配置 (application.yml)
```yaml
prediction:
  threshold: 80.0           # 告警阈值
  history-hours: 24         # 预测历史数据时长
  forecast-minutes: 60      # 预测未来时长
  prediction-interval-minutes: 5  # 预测间隔
```

### 设备模拟器配置
可通过环境变量配置：
- MQTT_BROKER: MQTT Broker 地址
- NUM_DEVICES: 设备数量
- PUBLISH_INTERVAL: 发布间隔（秒）

## 技术栈

### 后端
- Spring Boot 2.7
- Spring Integration MQTT
- InfluxDB Client
- Apache Commons Math (线性回归)
- Spring Data Redis
- Spring WebSocket STOMP

### 前端
- Vue 3 (Composition API)
- Vite
- Chart.js + vue-chartjs
- STOMP.js + SockJS
- Axios

### 基础设施
- EMQX MQTT Broker
- InfluxDB 2.7
- Redis 7

## 注意事项

1. 首次运行需要等待 InfluxDB 初始化完成
2. 预测功能需要积累一定的历史数据才能工作
3. 告警状态在 Redis 中保存 30 分钟自动过期
4. 生产环境请修改默认密码和 token
