# 跨国电商库存与价格博弈服务

本项目实现了一个基于微服务架构的跨国电商库存与价格管理系统，使用Go + gRPC + GraphQL网关。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    GraphQL Gateway (端口: 4000)              │
│                    聚合价格和库存服务                          │
└──────────────────────┬──────────────────────┬──────────────┘
                       │                      │
        ┌──────────────▼──────────┐ ┌────────▼──────────────┐
        │   Price Service         │ │  Inventory Service    │
        │   (gRPC: 50051)         │ │  (gRPC: 50052)        │
        │   - 商品价格管理          │ │  (HTTP: 8080)         │
        │   - 动态货币转换          │ │  - 分仓库存管理        │
        │   - 外部汇率API          │ │  - 一致性哈希缓存      │
        └──────────────────────────┘ │  - Redlock分布式锁    │
                                    └────────────────────────┘
```

## 服务组件

### 1. Price Service (价格服务)
- **gRPC端口**: 50051
- **功能**:
  - 管理商品基础价格
  - 支持多种货币（USD, EUR, CNY, JPY, GBP等）
  - 动态汇率转换（调用外部汇率API）
  - 默认汇率缓存（1分钟刷新）

### 2. Inventory Service (库存服务)
- **gRPC端口**: 50052
- **HTTP端口**: 8080
- **功能**:
  - 分仓库存管理（上海仓、深圳仓、成都仓）
  - 基于一致性哈希的Redis分片缓存
  - Redis Redlock分布式锁防止超卖
  - POST /reserve API处理并发预订

### 3. GraphQL Gateway (GraphQL网关)
- **端口**: 4000
- **功能**:
  - 路由级联查询，聚合两个微服务
  - GraphiQL界面支持
  - 并行查询优化

## 路由级联查询示例

GraphQL查询：
```graphql
{
  product(id: "123") {
    price {
      usd
      eur
      cny
    }
    inventory {
      total
      warehouse {
        name
        stock
      }
    }
  }
}
```

此查询会：
1. 网关并行调用Price Service和Inventory Service
2. Price Service返回价格数据（USD, EUR, CNY等）
3. Inventory Service返回库存数据（总库存、各仓库库存）
4. 网关聚合结果返回给客户端

## 预订API (POST /reserve)

请求示例：
```bash
curl -X POST http://localhost:8080/reserve \
  -H "Content-Type: application/json" \
  -d '{"product_id": "123", "quantity": 5, "order_id": "order-001"}'
```

响应示例：
```json
{
  "success": true,
  "message": "reservation successful",
  "allocated_warehouses": {
    "深圳仓": 5
  }
}
```

## 核心特性

### 1. 一致性哈希分片缓存
- 使用CRC32哈希算法
- 150个虚拟节点确保均匀分布
- 热点商品自动路由到对应Redis分片
- 缓存TTL: 5分钟

### 2. Redlock分布式锁
- 多数派决策（N/2 + 1）
- 自动重试机制（最多3次）
- 锁过期时间：5秒
- 时钟漂移补偿

### 3. 分仓库存策略
- 按库存量从高到低分配
- 优先从库存充足的仓库发货
- 支持跨仓分单

## 运行步骤

### 前置条件
- Go 1.21+
- Redis（用于缓存和分布式锁）
- Protocol Buffers编译器（可选，用于修改proto）

### 1. 安装依赖
```bash
go mod tidy
```

### 2. 编译Proto文件（如已修改）
```bash
# Windows
scripts\generate_proto.cmd
```

### 3. 启动Redis
确保Redis运行在 localhost:6379

### 4. 启动服务

在三个不同的终端中运行：

**终端1 - Price Service:**
```bash
cd services/price-service
go run cmd/main.go
```

**终端2 - Inventory Service:**
```bash
cd services/inventory-service
go run cmd/main.go
```

**终端3 - GraphQL Gateway:**
```bash
cd services/graphql-gateway
go run cmd/main.go
```

### 5. 测试GraphQL查询
打开浏览器访问 http://localhost:4000/graphql

在GraphiQL中运行：
```graphql
{
  product(id: "123") {
    price {
      usd
      eur
    }
    inventory {
      total
      warehouse {
        name
        stock
      }
    }
  }
}
```

## 示例数据

| Product ID | 基础价格 | 总库存 | 仓库分布 |
|-----------|---------|--------|---------|
| 123 | $99.99 USD | 350 | 上海100, 深圳200, 成都50 |
| 456 | €59.99 EUR | 150 | 上海50, 深圳75, 成都25 |
| 789 | $199.00 USD | 60 | 上海30, 深圳20, 成都10 |

## 技术栈

- **语言**: Go 1.21
- **RPC**: gRPC
- **GraphQL**: graphql-go/graphql
- **缓存**: Redis + 一致性哈希
- **分布式锁**: Redlock算法
- **汇率API**: exchangerate-api.com

## 目录结构

```
e-commerce-inventory-price/
├── config/
│   └── config.yaml          # 配置文件
├── proto/                   # Protocol Buffers定义
│   ├── common/
│   ├── price/
│   └── inventory/
├── scripts/
│   └── generate_proto.cmd   # Proto编译脚本
├── services/
│   ├── price-service/       # 价格服务
│   │   ├── cmd/main.go
│   │   └── internal/
│   │       ├── model/       # 数据模型
│   │       └── service/     # 业务逻辑
│   ├── inventory-service/   # 库存服务
│   │   ├── cmd/main.go
│   │   └── internal/
│   │       ├── cache/       # 缓存和分布式锁
│   │       ├── handler/     # HTTP处理器
│   │       ├── model/       # 数据模型
│   │       └── service/     # 业务逻辑
│   └── graphql-gateway/     # GraphQL网关
│       ├── cmd/main.go
│       └── internal/
│           └── schema/      # GraphQL Schema
└── go.mod
```
