# SQL Impact Analysis Service

一个用于分析 SQL 变更语句影响的后端服务，支持多租户架构。

## 功能特性

- 解析 SQL 变更语句（CREATE TABLE, ALTER TABLE ADD COLUMN, ALTER TABLE DROP COLUMN, DROP TABLE）
- 分析 PostgreSQL 系统表（pg_depend, pg_rewrite 等）
- 识别受影响的对象：视图、存储过程、物化视图、触发器等
- 计算风险等级（高/中/低）
- 支持多租户隔离
- 异步处理（RabbitMQ）
- 结果存储（MongoDB）
- REST API 支持

## 技术栈

- Node.js + Express
- PostgreSQL
- MongoDB
- RabbitMQ
- Mongoose

## 项目结构

```
src/
├── controllers/        # 控制器层
├── models/            # 数据模型
├── repositories/      # 数据访问层
├── routes/            # 路由
├── services/          # 业务逻辑层
├── config.js          # 配置
├── index.js           # 主入口
└── worker.js          # 工作进程
```

## 安装依赖

```bash
npm install
```

## 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

## 启动服务

### 启动 API 服务

```bash
npm start
```

或开发模式：

```bash
npm run dev
```

### 启动 Worker 进程

```bash
npm run worker
```

## API 文档

### 创建分析任务

**POST** `/api/impact-analysis`

请求体：
```json
{
  "sql": "ALTER TABLE users DROP COLUMN old_column",
  "tenantId": "tenant_123",
  "targetTenants": ["tenant_456", "tenant_789"]
}
```

响应（202 Accepted）：
```json
{
  "taskId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending",
  "message": "Analysis task created successfully"
}
```

### 获取分析结果

**GET** `/api/impact-analysis/:taskId`

响应（200 OK）：
```json
{
  "taskId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "tenantId": "tenant_123",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "completedAt": "2024-01-01T00:00:05.000Z",
  "result": {
    "affectedObjects": [
      {
        "objectName": "user_view",
        "objectType": "VIEW",
        "schemaName": "public",
        "changeType": "ALTER_TABLE_DROP_COLUMN",
        "tableName": "users",
        "riskLevel": "high"
      }
    ],
    "overallRisk": "high",
    "totalAffected": 1,
    "changes": [...]
  }
}
```

## 风险等级说明

| 等级 | 描述 |
|------|------|
| high | 可能导致运行时错误或数据不一致 |
| medium | 建议进行兼容性测试 |
| low | 影响有限，通常无需修改 |

## 支持的 SQL 变更类型

- CREATE TABLE
- ALTER TABLE ADD COLUMN
- ALTER TABLE DROP COLUMN
- ALTER TABLE RENAME COLUMN
- DROP TABLE
