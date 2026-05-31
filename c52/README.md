# 边缘计算管理系统

这是一个基于gRPC的边缘计算节点管理系统，包括中心服务端（Go）和边缘客户端（Python）。

## 系统架构

- **中心服务端**: 负责向边缘节点下发配置，接收心跳和状态报告，数据持久化到PostgreSQL
- **边缘客户端**: 运行在边缘设备上，管理Docker容器，上报资源使用情况和容器状态

## 目录结构

```
.
├── proto/              # gRPC协议定义
├── server/             # Go服务端
│   ├── cmd/            # 主程序入口
│   ├── internal/       # 内部代码
│   │   ├── api/        # HTTP API
│   │   ├── database/   # 数据库层
│   │   ├── grpc/       # gRPC服务
│   │   └── models/     # 数据模型
│   └── configs/        # 配置文件
└── client/             # Python客户端
    ├── src/            # 源代码
    └── configs/        # 配置文件
```

## 快速开始

### 1. 生成gRPC代码

```bash
# 生成Go代码
cd proto
./generate_go.sh

# 生成Python代码
./generate_python.sh
```

### 2. 启动PostgreSQL数据库

```bash
docker run -d \
  --name postgres-edge \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=edge_server \
  -p 5432:5432 \
  postgres:15-alpine
```

### 3. 运行中心服务端

```bash
cd server
go mod download
go run cmd/main.go
```

### 4. 运行边缘客户端

```bash
cd client
pip install -r requirements.txt
cd src
python edge_client.py --server localhost:50051
```

## API接口

### HTTP API (端口8080)

- `GET /api/v1/nodes` - 获取所有节点列表
- `GET /api/v1/nodes/:node_id` - 获取指定节点信息
- `GET /api/v1/nodes/:node_id/config` - 获取节点配置
- `PUT /api/v1/nodes/:node_id/config` - 更新节点配置
- `GET /api/v1/nodes/:node_id/heartbeats` - 获取节点心跳历史

### 更新节点配置示例

```bash
curl -X PUT http://localhost:8080/api/v1/nodes/{node_id}/config \
  -H "Content-Type: application/json" \
  -d '{
    "config_yaml": "node_id: \"node-001\"\nversion: 2\ncontainers:\n  - name: edge_nginx\n    image: nginx:alpine\n    ports:\n      - \"8080:80\"\n    cpu_limit: 0.5\n    memory_limit: 536870912\n    restart_policy: always"
  }'
```

### 配置历史与回滚示例

**获取配置历史**:
```bash
curl http://localhost:8080/api/v1/nodes/{node_id}/config/history
```

响应示例:
```json
{
  "configs": [
    {
      "id": 3,
      "node_id": "node-001",
      "version": 3,
      "is_active": true,
      "created_at": "2024-05-12T10:00:00Z",
      "container_count": 2,
      "description": "edge_nginx, edge_app 等"
    },
    {
      "id": 2,
      "node_id": "node-001",
      "version": 2,
      "is_active": false,
      "created_at": "2024-05-11T09:00:00Z",
      "container_count": 1,
      "description": "edge_nginx"
    }
  ]
}
```

**获取指定版本详情**:
```bash
curl http://localhost:8080/api/v1/nodes/{node_id}/config/versions/2
```

**回滚到历史版本**:
```bash
curl -X POST http://localhost:8080/api/v1/nodes/{node_id}/config/rollback \
  -H "Content-Type: application/json" \
  -d '{
    "target_version": 2
  }'
```

响应示例:
```json
{
  "message": "Config rolled back successfully",
  "source_version": 2,
  "new_version": 4
}
```

> **注意**: 回滚操作会创建一个新版本号（如V4），其配置内容与目标版本（V2）相同。这样保留完整的变更历史，同时客户端能正常检测到更新。

**对比两个配置版本**:
```bash
curl -X POST http://localhost:8080/api/v1/nodes/{node_id}/config/diff \
  -H "Content-Type: application/json" \
  -d '{
    "version_a": 2,
    "version_b": 3
  }'
```

响应示例:
```json
{
  "version_a": 2,
  "version_b": 3,
  "diff": {
    "added": ["edge_app"],
    "removed": [],
    "modified": [
      {
        "name": "edge_nginx",
        "changes": [
          {
            "field": "cpu_limit",
            "from": 0.5,
            "to": 1.0
          }
        ]
      }
    ],
    "version_change": {
      "from": 2,
      "to": 3
    }
  }
}
```

## gRPC服务

- `GetConfig(ConfigRequest) returns (ConfigResponse)` - 获取节点配置
- `ReportHeartbeat(HeartbeatRequest) returns (HeartbeatResponse)` - 上报心跳和状态

## 配置说明

### 容器配置字段

- `image`: Docker镜像名称
- `name`: 容器名称
- `ports`: 端口映射列表 ["host:container"]
- `volumes`: 卷挂载列表 ["host_path:container_path"]
- `env`: 环境变量字典
- `cpu_limit`: CPU限制（核数）
- `memory_limit`: 内存限制（字节）
- `restart_policy`: 重启策略 (always/on-failure/unless-stopped/no)

## 节点状态

- `online` - 节点在线
- `offline` - 节点离线
- `running` - 运行中
- `error` - 错误状态

## 注意事项

1. 确保Docker服务在边缘节点上正常运行
2. 边缘客户端需要有访问Docker API的权限
3. 确保网络连接正常，边缘节点能够访问中心服务端
4. 生产环境中建议启用TLS加密gRPC连接
