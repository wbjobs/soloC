# 大数据后端 - 订单流因子实时计算系统

## 系统架构

```
Kafka Producer → Apache Flink → Redis → gRPC/REST API → Next.js Frontend
```

## 组件说明

### 1. Kafka 数据生产者 (`backend/kafka-producer/`)
- 模拟 Level-2 逐笔委托数据
- 产生买卖订单数据，包含价格、数量、侧等信息

### 2. Apache Flink 流处理 (`backend/flink-job/`)
- 实时消费 Kafka 中的订单数据
- 计算订单流因子：
  - 累计买压/卖压
  - 净资金流 (因子A)
  - 大单净流入 (因子B)

### 3. gRPC & REST API 服务 (`backend/grpc-server/`)
- 提供因子数据查询接口
- 支持策略回测功能
- 同时提供 gRPC 和 REST API

### 4. 前端界面 (`frontend/`)
- Next.js + Highcharts 实时图表展示
- 行情回放功能
- 策略回测界面

## 环境依赖

- Apache Kafka
- Redis
- Apache Flink
- Node.js 18+
- Python 3.9+
- Java 11+

## 快速启动

### 方式1：使用 Docker Compose (推荐)
```bash
# 启动基础设施
docker-compose up -d

# 然后分别启动各组件
```

### 方式2：手动启动

#### 1. 启动 Kafka 和 Redis
```bash
# 启动 Zookeeper
zookeeper-server-start.sh config/zookeeper.properties

# 启动 Kafka
kafka-server-start.sh config/server.properties

# 启动 Redis
redis-server
```

#### 2. 启动 Kafka 数据生产者
```bash
cd backend/kafka-producer
pip install -r requirements.txt
python producer.py
```

#### 3. 启动 Flink 作业
```bash
cd backend/flink-job
mvn clean package
# 将 target/flink-orderflow-1.0-SNAPSHOT.jar 提交到 Flink 集群
# 或本地运行：
java -cp target/flink-orderflow-1.0-SNAPSHOT.jar com.bigdata.orderflow.OrderFlowJob
```

#### 4. 启动 API 服务
```bash
cd backend/grpc-server
pip install -r requirements.txt
python api_gateway.py
```

#### 5. 启动前端
```bash
cd frontend
npm install
npm run dev
```

## 访问地址

- 前端界面: http://localhost:3000
- REST API: http://localhost:8000
- gRPC: localhost:50051

## API 接口

### GET /api/factors/{symbol}
获取最近的因子数据
- 参数: minutes (默认5分钟)

### POST /api/backtest/{symbol}
运行策略回测
- 请求体: `{"condition": "因子A > 0.8 and 因子B < -0.5"}`

## 使用示例

1. 打开前端界面 http://localhost:3000
2. 查看实时订单流因子曲线
3. 点击"开始回放"查看历史行情
4. 在策略回测区域输入策略条件，如：
   ```
   因子A > 0.8 and 因子B < -0.5
   ```
5. 点击"运行回测"查看回测结果
