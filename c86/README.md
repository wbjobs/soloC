# 射电信号处理后端服务

基于FFT去噪和Presto算法的射电信号脉冲星检测后端服务，支持分布式处理。

## 功能特性

- **FFT去噪** - 频域滤波去除噪声
- **RFI检测与去除** - 基于中值滤波的射频干扰检测与切除
- **Presto周期搜索** - 折叠周期算法检测脉冲信号
- **色散量(DM)搜索** - 多DM值搜索优化
- **脉冲轮廓标准化** - 相位折叠后生成标准化脉冲轮廓
- **ASCII可视化** - 文本形式显示脉冲轮廓图
- **脉冲星数据库匹配** - 与已知脉冲星数据库进行轮廓相似度匹配
- **REST API** - 任务提交、状态查询、结果下载
- **Kafka消息队列** - 解耦计算任务，支持分布式worker
- **InfluxDB指标存储** - 记录处理耗时、信噪比变化等监控指标
- **Protobuf格式** - 高效的数据序列化

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript
- **Web框架**: Express
- **消息队列**: Kafka
- **时序数据库**: InfluxDB 2.x
- **数据格式**: Protocol Buffers
- **可视化**: Grafana

## 快速开始

### 1. 启动基础设施

```bash
docker-compose up -d
```

这将启动：
- Zookeeper (Kafka依赖)
- Kafka (消息队列)
- Kafka UI (端口8080)
- InfluxDB (端口8086)
- Grafana (端口3001)

### 2. 安装依赖

```bash
npm install
```

### 3. 构建项目

```bash
npm run build
```

### 4. 启动API服务器

```bash
npm start
```

或开发模式：

```bash
npm run dev
```

### 5. (可选)启动独立Worker

```bash
npm run worker
```

## API端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/stats` | 处理统计 |
| POST | `/api/tasks` | 提交新处理任务 |
| GET | `/api/tasks` | 列出所有任务 |
| GET | `/api/tasks/:taskId` | 获取任务状态 |
| GET | `/api/tasks/:taskId/result` | 获取处理结果 |
| GET | `/api/tasks/:taskId/candidates` | 获取候选体列表 |
| GET | `/api/tasks/:taskId/download/csv` | 下载CSV格式结果 |
| GET | `/api/tasks/:taskId/download/json` | 下载JSON格式结果 |
| POST | `/api/tasks/:taskId/reprocess` | 重新处理任务 |
| GET | `/api/metrics` | 获取处理指标 |

## RFI（射频干扰）检测与去除

### 功能说明

本系统新增了基于中值滤波的RFI检测与去除功能，有效解决了强正弦波干扰导致的假阳性问题。

### 算法原理
1. **频谱分析**：对输入信号进行FFT变换到频域
2. **中值滤波**：对频谱进行中值滤波，得到平滑的背景估计
3. **残差分析**：计算原始频谱与平滑背景的残差
4. **阈值检测**：使用统计学方法（均值 + 5倍标准差）检测RFI峰值
5. **RFI切除**：将检测到的RFI频段置零，并去除相邻频点
6. **IFFT重建**：将处理后的频谱变换回时域

### RFI信息输出
处理结果中包含：
- `rfiRemoved`：是否检测并移除了RFI
- `rfiCount`：检测到的RFI频段数量
- `rfiInfo`：RFI详细信息数组，包含频率、幅度、阈值等

## 使用示例

### 提交处理任务（含RFI测试数据）

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "data": [/* 时间序列数据 */],
    "samplingRate": 1000,
    "startFrequency": 1000,
    "endFrequency": 1500,
    "dmMin": 0,
    "dmMax": 200,
    "sourceName": "Test_Pulsar_001"
  }'
```

### 使用脚本提交测试数据

```bash
node examples/submit-task.js
```

### 查询任务状态

```bash
curl http://localhost:3000/api/tasks/<task-id>
```

### 查看候选体脉冲轮廓

```bash
curl http://localhost:3000/api/tasks/<task-id>/candidates/0/profile
```

### 查看脉冲星数据库匹配结果

```bash
curl http://localhost:3000/api/tasks/<task-id>/candidates/0/matches
```

### 查看已知脉冲星数据库

```bash
curl http://localhost:3000/api/pulsars
```

### 下载候选体CSV

```bash
curl -o candidates.csv http://localhost:3000/api/tasks/<task-id>/download/csv
```

## 脉冲轮廓标准化与数据库匹配

### 轮廓标准化

每个候选脉冲星经过相位折叠后生成标准化的脉冲轮廓：
1. 对去色散后的信号按候选周期进行相位折叠
2. 将相位分为64个bin，计算每个bin的平均强度
3. 对轮廓进行min-max标准化，范围[0,1]
4. 生成ASCII可视化的脉冲轮廓图

### 数据库交叉匹配

系统内置包含10颗已知脉冲星的模拟数据库，支持：
- 基于余弦相似度和互相关的轮廓匹配算法
- 周期和DM参数容差过滤
- 相似度阈值判断（默认85%）
- 输出最佳匹配结果和所有潜在匹配

匹配结果包含：
- 匹配的脉冲星名称、坐标、类型
- 轮廓相似度分数
- 是否匹配成功标记

## 配置说明

通过环境变量或`.env`文件配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | API服务器端口 |
| `KAFKA_BROKERS` | localhost:9092 | Kafka broker地址 |
| `INFLUXDB_URL` | http://localhost:8086 | InfluxDB地址 |
| `INFLUXDB_TOKEN` | my-super-secret-token | InfluxDB访问令牌 |
| `MIN_SNR_THRESHOLD` | 5.0 | 最小信噪比阈值 |

## 监控

### Kafka UI
访问 http://localhost:8080 查看Kafka消息队列状态

### Grafana
访问 http://localhost:3001
- 用户名: admin
- 密码: admin123

配置InfluxDB数据源查看处理指标

## 项目结构

```
.
├── src/
│   ├── index.ts           # API服务器入口
│   ├── worker.ts          # Worker入口
│   ├── api.ts             # Express API路由
│   ├── signal-processor.ts # FFT和Presto算法实现
│   ├── kafka.ts           # Kafka服务
│   ├── influxdb.ts        # InfluxDB指标服务
│   ├── storage.ts         # 任务状态和结果存储
│   ├── protobuf.ts        # Protobuf编解码
│   └── config.ts          # 配置文件
├── proto/
│   └── signal.proto       # Protobuf定义
├── examples/
│   ├── test-data-generator.js
│   └── submit-task.js
├── docker-compose.yml
├── package.json
└── README.md
```

## 核心算法说明

### FFT去噪
1. 对时间序列进行FFT变换到频域
2. 计算频谱的均值和标准差
3. 滤除低于阈值的噪声分量
4. 执行IFFT变换回时域

### Presto周期搜索
1. 在指定周期范围内进行对数采样
2. 对每个候选周期进行信号折叠
3. 计算折叠轮廓的信噪比
4. 返回超过阈值的候选体

### DM搜索
在指定色散量范围内，对每个DM值执行周期搜索，找到最佳匹配参数。
