# 实时用户行为数据处理系统

基于 Python + Kafka + Redis + WebSocket + React + ECharts 的实时用户行为数据分析平台。

## 架构说明

```
[用户行为日志] → [Kafka] → [Python消费者] → [Pandas实时计算] → [Redis存储]
                                                          ↓
                                                    [WebSocket]
                                                          ↓
                                              [React + ECharts 可视化看板]
```

## 目录结构

```
c47/
├── backend/                 # 后端服务
│   ├── main.py             # 主程序（Kafka消费者 + WebSocket服务）
│   ├── producer.py         # Kafka测试数据生成器
│   ├── requirements.txt    # Python依赖
│   └── .env               # 环境变量配置
└── frontend/               # 前端可视化看板
    ├── public/
    ├── src/
    └── package.json
```

## 功能特性

### 后端
- ✅ Kafka消费者实时消费用户行为日志
- ✅ 使用 Pandas 进行实时聚合计算（每分钟窗口）
- ✅ 计算指标：PV、UV、点击/浏览/下单数量、转化率
- ✅ 计算页面访问分布、行为类型分布
- ✅ Redis 存储聚合结果（1小时过期）
- ✅ WebSocket 实时推送数据给前端

### 前端
- ✅ WebSocket 实时连接，自动重连
- ✅ 关键指标卡片展示（PV、UV、转化率、订单数）
- ✅ PV/UV 趋势折线图
- ✅ 用户行为分布柱状图
- ✅ 页面访问分布饼图
- ✅ 行为类型分布饼图

## 环境要求

- Python 3.8+
- Node.js 16+
- Apache Kafka
- Redis

## 安装与运行

### 1. 启动依赖服务

确保 Kafka 和 Redis 已启动：

```bash
# 启动 Zookeeper
zookeeper-server-start.sh config/zookeeper.properties

# 启动 Kafka
kafka-server-start.sh config/server.properties

# 创建 Kafka Topic
kafka-topics.sh --create --topic user_behavior --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1

# 启动 Redis
redis-server
```

### 2. 后端服务

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 启动消费者服务
python main.py
```

### 3. 生成测试数据（新终端）

```bash
cd backend
python producer.py
```

### 4. 前端服务

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start
```

访问 http://localhost:3000 查看看板。

## 数据格式

### Kafka 用户行为日志格式

```json
{
  "user_id": 1,
  "page": "product",
  "action_type": "click",
  "timestamp": 1234567890.123
}
```

### WebSocket 推送格式

```json
{
  "timestamp": "2024-01-01T12:00:00",
  "pv": 100,
  "uv": 50,
  "conversion_rate": 0.05,
  "click_count": 30,
  "view_count": 60,
  "order_count": 10,
  "page_distribution": {
    "home": 20,
    "product": 40,
    "cart": 15,
    "checkout": 15,
    "profile": 10
  },
  "action_distribution": {
    "view": 60,
    "click": 30,
    "order": 10
  }
}
```

## 配置说明

在 `backend/.env` 中配置：

```env
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_TOPIC=user_behavior
KAFKA_GROUP_ID=behavior_consumer_group

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

WEBSOCKET_HOST=localhost
WEBSOCKET_PORT=8765

AGGREGATION_WINDOW_SECONDS=60
```
