# 分布式任务调度与执行监控系统

## 系统架构

本系统分为三个核心模块：

1. **调度中心 (Scheduler)** - 基于 Go + etcd 实现，负责任务调度、节点注册、负载均衡
2. **执行节点 (Executor)** - Python 实现的命令行客户端，负责任务接收与执行、日志上报、心跳检测
3. **管理后台 API (API Server)** - 提供 RESTful 接口，支持任务管理、状态查询、日志查看，对接 MySQL 数据库

## 功能特性

- ✅ **任务类型**：支持单次任务、定时任务（Cron）、依赖任务调度
- ✅ **失败重试**：任务失败自动重试，可配置重试次数和间隔
- ✅ **故障转移**：执行节点故障时，任务自动重新分配
- ✅ **负载均衡**：基于 CPU、内存、任务数综合负载进行节点选择
- ✅ **实时进度**：任务执行进度实时上报
- ✅ **依赖管理**：支持任务间依赖关系，前置任务完成后才执行
- ✅ **心跳检测**：节点状态实时监控

## 技术栈

- **调度中心**：Go 1.21+, etcd 3.5+, robfig/cron
- **执行节点**：Python 3.8+, etcd3, psutil
- **管理 API**：Go, Gin, GORM, MySQL 8.0+

## 快速开始

### 前置依赖

1. 启动 etcd 服务
   ```bash
   etcd --listen-client-urls http://0.0.0.0:2379 --advertise-client-urls http://localhost:2379
   ```

2. 启动 MySQL 并创建数据库
   ```sql
   CREATE DATABASE task_scheduler CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

### 1. 启动调度中心

```bash
cd scheduler
go mod download
go run .
```

### 2. 启动执行节点

```bash
cd executor
pip install -r requirements.txt
python executor.py
```

### 3. 启动管理 API

```bash
cd api
go mod download
go run .
```

## API 接口文档

### 任务管理

#### 创建任务
```bash
POST /api/v1/tasks
Content-Type: application/json

{
  "name": "备份数据库",
  "type": "once",           // once, cron, dependent
  "command": "mysqldump -u root db > backup.sql",
  "cron_expr": "0 0 * * *", // 仅 cron 类型需要
  "priority": 5,
  "max_retries": 3,
  "retry_delay": 5,
  "timeout": 3600,
  "dependencies": ["task-id-1", "task-id-2"]  // 仅 dependent 类型需要
}
```

#### 查询任务列表
```bash
GET /api/v1/tasks?page=1&page_size=20
```

#### 查询单个任务
```bash
GET /api/v1/tasks/:id
```

#### 更新任务
```bash
PUT /api/v1/tasks/:id
Content-Type: application/json

{
  "name": "更新后的任务名",
  "command": "new command",
  ...
}
```

#### 删除任务
```bash
DELETE /api/v1/tasks/:id
```

#### 查询任务日志
```bash
GET /api/v1/tasks/:id/logs?page=1&page_size=50
```

### 节点管理

#### 查询节点列表
```bash
GET /api/v1/nodes
```

#### 查询单个节点
```bash
GET /api/v1/nodes/:id
```

### 同步接口

#### 从 etcd 同步任务到数据库
```bash
POST /api/v1/sync
```

## 配置说明

### 调度中心配置 (scheduler/config.go)
- `EtcdEndpoints`: etcd 服务地址
- `NodeTTL`: 节点心跳超时时间（秒）
- `TaskPrefix`: 任务在 etcd 中的前缀

### 执行节点配置 (executor/.env)
- `NODE_ID`: 节点唯一标识
- `MAX_CONCURRENT_TASKS`: 最大并发任务数
- `HEARTBEAT_INTERVAL`: 心跳间隔（秒）

### API 服务配置 (api/.env)
- `MYSQL_DSN`: MySQL 连接字符串
- `API_ADDRESS`: API 服务监听地址

## 核心设计

### 任务状态流转
```
pending (待调度) → running (执行中) → completed (完成)
                          ↓
                      failed (失败) → 重试 → pending
                          ↓
                    exceeded max retries → failed
```

### 节点选择算法
节点负载计算公式：
```
负载值 = CPU使用率 * 0.5 + 内存使用率 * 0.3 + 运行任务数 * 0.2
```
系统会选择负载值最小的节点来分配新任务。

### 故障处理机制
1. 执行节点定期发送心跳到 etcd
2. 超过 TTL 未收到心跳则标记节点为离线
3. 调度中心检测到节点离线后，将该节点上的运行中任务重新分配

## 目录结构

```
task-scheduler/
├── scheduler/          # 调度中心 (Go)
│   ├── main.go
│   ├── config.go
│   ├── etcd.go
│   ├── node_manager.go
│   ├── task.go
│   ├── scheduler.go
│   └── go.mod
├── executor/           # 执行节点 (Python)
│   ├── executor.py
│   ├── config.py
│   └── requirements.txt
├── api/               # 管理 API (Go)
│   ├── main.go
│   ├── config.go
│   ├── models.go
│   ├── database.go
│   ├── handlers.go
│   ├── synchronizer.go
│   └── go.mod
├── configs/           # 配置文件
│   ├── scheduler.env
│   ├── executor.env
│   └── api.env
└── scripts/           # 启动脚本
    ├── start_scheduler.bat
    ├── start_executor.bat
    └── start_api.bat
```

## 使用示例

### 示例 1: 创建单次任务
```bash
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "清理临时文件",
    "type": "once",
    "command": "rm -rf /tmp/*",
    "max_retries": 2
  }'
```

### 示例 2: 创建定时任务
```bash
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "每日备份",
    "type": "cron",
    "command": "/scripts/backup.sh",
    "cron_expr": "0 2 * * *"
  }'
```

### 示例 3: 创建依赖任务
```bash
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "发送报告",
    "type": "dependent",
    "command": "/scripts/send_report.sh",
    "dependencies": ["task-id-of-backup"]
  }'
```

## 注意事项

1. 确保 etcd 和 MySQL 服务正常运行
2. 生产环境请配置合理的 TTL 和重试参数
3. 执行节点需要有足够的权限执行任务命令
4. 建议为重要任务配置超时时间，避免资源泄漏

## License

MIT License
