# Query Gateway - 时序数据库查询网关

一个基于插件架构的时序数据库统一查询网关，支持多种时序数据库，并提供告警功能。

## 架构

- **后端**: Rust + Actix-web
- **前端**: SvelteKit
- **支持的数据库**: InfluxDB, Prometheus, TimescaleDB

## 功能特性

- 统一查询语言（类PromQL子集）
- 插件化数据库接口
- 告警规则引擎
- 可视化仪表盘
- 告警规则管理界面

## 快速开始

### 环境要求

- Rust 1.70+
- Node.js 18+
- npm 或 pnpm

### Windows 快速启动

直接运行 `start.bat` 脚本，它将自动启动后端和前端服务：

```bash
start.bat
```

### 手动启动

#### 后端启动

```bash
cd backend
cargo run
```

后端服务将在 `http://localhost:8080` 启动

#### 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:5173` 启动

## API 接口

### 查询接口

- `POST /api/query` - 执行查询
- `POST /api/parse` - 解析查询语句并查看翻译结果
- `POST /api/mock` - 生成模拟数据（用于演示）

### 告警规则接口

- `GET /api/alerts/rules` - 获取所有告警规则
- `POST /api/alerts/rules` - 创建新的告警规则
- `GET /api/alerts/rules/{id}` - 获取单个告警规则
- `PUT /api/alerts/rules/{id}` - 更新告警规则
- `DELETE /api/alerts/rules/{id}` - 删除告警规则

### 告警历史接口

- `GET /api/alerts` - 获取告警历史

## 查询语法

支持类 PromQL 的查询语法：

```
metric_name{label_key="label_value"}[duration]
```

示例：
- `cpu_usage{host="server1"}[30m]`
- `http_requests_total{status="200", method="GET"}[1h]`
- `avg(network_bytes{interface="eth0"})[5m]`

支持的聚合函数：
- `sum` - 求和
- `avg` - 平均值
- `min` - 最小值
- `max` - 最大值
- `count` - 计数

## 项目结构

```
.
├── backend/              # Rust 后端
│   ├── src/
│   │   ├── plugins/     # 数据库插件
│   │   │   ├── mod.rs          # 插件接口定义
│   │   │   ├── prometheus.rs   # Prometheus 插件
│   │   │   ├── influxdb.rs     # InfluxDB 插件
│   │   │   └── timescaledb.rs  # TimescaleDB 插件
│   │   ├── query/       # 查询解析和翻译
│   │   │   ├── mod.rs          # 查询解析器
│   │   │   └── query.pest      # PEG 语法定义
│   │   ├── alert/       # 告警引擎
│   │   ├── api/         # API 路由
│   │   └── main.rs
│   └── Cargo.toml
├── frontend/             # SvelteKit 前端
│   ├── src/
│   │   ├── routes/      # 页面路由
│   │   │   ├── +page.svelte      # 查询页面
│   │   │   ├── alerts/+page.svelte  # 告警规则管理
│   │   │   └── history/+page.svelte # 告警历史
│   │   ├── lib/         # 通用库
│   │   ├── app.css      # 全局样式
│   │   └── app.d.ts     # 类型声明
│   ├── package.json
│   ├── svelte.config.js
│   └── vite.config.ts
├── start.bat            # Windows 启动脚本
└── README.md
```

## 插件开发

要添加新的数据库插件，请实现 `DatabasePlugin` trait：

```rust
#[async_trait]
pub trait DatabasePlugin: Send + Sync {
    fn name(&self) -> &str;
    async fn connect(&mut self, config: &DatabaseConfig) -> Result<(), PluginError>;
    async fn query(&self, query: &str) -> Result<QueryResult, PluginError>;
    fn translate_query(&self, ast: &Query) -> Result<String, PluginError>;
}
```

## 告警规则配置

告警规则包含以下配置项：

- **名称**: 规则的显示名称
- **查询语句**: 用于获取数据的查询
- **数据库类型**: 查询的目标数据库
- **阈值**: 触发告警的值
- **条件**: 大于、小于、等于、不等于
- **级别**: Info、Warning、Critical
- **持续时间**: 持续多久触发告警

## License

MIT
