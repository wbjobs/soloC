# Log Cleaner Service

高性能日志清洗后端服务，支持实时接收、清洗和转发结构化日志。

## 功能特性

1. **TCP 日志接收**：监听 TCP 端口，接收多个客户端的 JSON 格式日志流
2. **规则引擎**：内置轻量级规则引擎，支持多种清洗规则：
   - 字段映射 (field_mapping)
   - 正则匹配提取 (regex_match)
   - 黑名单过滤 (blacklist)
   - 字段重命名 (field_rename)
   - 字段删除 (field_remove)
3. **数据存储**：
   - Redis 作为数据缓冲
   - Elasticsearch 进行持久化存储和检索
4. **HTTP 管理接口**：
   - 查看规则列表
   - 在线修改规则
   - 热加载规则配置（无需重启服务）

## 项目结构

```
log-cleaner/
├── config/
│   └── config.go          # 配置加载和管理
├── engine/
│   └── engine.go          # 规则引擎核心逻辑
├── tcp/
│   └── server.go          # TCP 服务器
├── storage/
│   ├── redis.go           # Redis 客户端
│   └── elasticsearch.go   # Elasticsearch 客户端
├── http/
│   └── handler.go         # HTTP 管理接口
├── client/
│   └── client.go          # 测试客户端
├── config.yaml            # 配置文件
├── main.go                # 主程序入口
├── go.mod                 # Go 模块依赖
└── README.md              # 项目文档
```

## 快速开始

### 环境要求

- Go 1.21+
- Redis 6+
- Elasticsearch 7.x 或 8.x

### 安装依赖

```bash
go mod download
```

### 配置

编辑 `config.yaml` 文件：

```yaml
tcp_port: 9000              # TCP 服务端口
http_port: 8080             # HTTP 管理端口
redis_addr: "localhost:6379"
redis_key: "cleaned_logs"
elasticsearch:
  addresses:
    - "http://localhost:9200"
  index: "logs"
rules:
  # 规则配置...
```

### 启动服务

```bash
go run main.go
```

### 运行测试客户端

```bash
go run client/client.go
```

## API 接口

### 健康检查

```bash
GET /api/health
```

### 获取所有规则

```bash
GET /api/rules
```

### 更新所有规则

```bash
PUT /api/rules
Content-Type: application/json

[
  {
    "id": "rule_001",
    "name": "Level Mapping",
    "type": "field_mapping",
    "source_field": "level",
    "target_field": "log_level",
    "mapping": {
      "1": "DEBUG",
      "2": "INFO"
    },
    "enabled": true
  }
]
```

### 热加载规则

```bash
POST /api/rules/reload
```

### 获取单个规则

```bash
GET /api/rules/{id}
```

### 更新单个规则

```bash
PUT /api/rules/{id}
Content-Type: application/json

{
  "id": "rule_001",
  "name": "Updated Rule",
  "type": "field_mapping",
  ...
}
```

### 删除规则

```bash
DELETE /api/rules/{id}
```

### 获取配置

```bash
GET /api/config
```

### 获取统计信息

```bash
GET /api/stats
```

## 规则类型说明

### 1. 字段映射 (field_mapping)

将源字段的值按照映射表转换后写入目标字段。

```yaml
type: "field_mapping"
source_field: "level"
target_field: "log_level"
mapping:
  "1": "DEBUG"
  "2": "INFO"
  "3": "WARN"
  "4": "ERROR"
```

### 2. 正则匹配提取 (regex_match)

使用正则表达式从源字段中提取数据并写入目标字段。

```yaml
type: "regex_match"
source_field: "message"
target_field: "user_id"
pattern: "user_id=([a-zA-Z0-9]+)"
```

### 3. 黑名单过滤 (blacklist)

如果源字段包含黑名单中的任意关键词，则丢弃该日志。

```yaml
type: "blacklist"
source_field: "message"
blacklist:
  - "debug"
  - "trace"
```

### 4. 字段重命名 (field_rename)

将字段重命名为新名称。

```yaml
type: "field_rename"
source_field: "service"
target_field: "service_name"
```

### 5. 字段删除 (field_remove)

删除指定字段。

```yaml
type: "field_remove"
source_field: "temp_data"
```

## 灰度发布使用指南

### 灰度发布流程

1. **创建新版本规则**
```bash
POST /api/rules
```

2. **启动灰度发布**
```bash
PUT /api/canary
Content-Type: application/json

{
  "enabled": true,
  "new_version_id": "v_xxxxxx",
  "percentage": 10,
  "hash_field": "message"
}
```

3. **监控灰度效果**
```bash
GET /api/canary
```

4. **调整灰度比例**
```bash
PUT /api/canary
Content-Type: application/json

{
  "enabled": true,
  "new_version_id": "v_xxxxxx",
  "percentage": 50,
  "hash_field": "message"
}
```

5. **全量发布**
```bash
POST /api/canary/promote
```

6. **如需回滚**
```bash
POST /api/canary/stop
POST /api/versions/v_old/activate
```

### 灰度发布特性

- **流量分配**：基于指定字段的哈希值进行流量分配，确保相同日志始终使用同一版本规则
- **平滑过渡**：支持 0-100% 任意比例调整
- **实时统计**：可查看各版本处理的日志数量
- **版本标记**：清洗后的日志会添加 `_rule_version` 字段标识使用的规则版本

## 架构设计

### 数据流

```
TCP 客户端 → TCP Server → 规则引擎(版本/灰度路由) → Redis
                                                         ↓
                                                    Elasticsearch
```

### 并发模型

- TCP Server 使用 goroutine 处理每个客户端连接
- 规则处理是无状态的，支持高并发
- Redis 异步写入队列，削峰填谷
- Redis 和 Elasticsearch 客户端都是线程安全的

### 版本控制机制

- 每个版本规则独立存储，互不影响
- 当前版本和灰度版本并行运行
- 配置使用读写锁保护，确保并发安全
- 规则引擎支持运行时重新加载规则

### 热加载机制

- 配置使用读写锁保护，确保并发安全
- 规则引擎支持运行时重新加载规则
- HTTP 接口触发配置文件重新读取和规则重加载

## 性能优化

1. **连接池**：Redis 和 Elasticsearch 使用内置连接池，可配置池大小
2. **异步写入**：Redis 使用 channel 异步写入，缓冲高并发流量
3. **正则缓存**：正则表达式编译结果缓存，避免重复编译
4. **并发处理**：每个客户端连接独立 goroutine 处理
5. **嵌套字段优化**：支持点号分隔的嵌套字段路径，无需预先解析

## 许可证

MIT License
