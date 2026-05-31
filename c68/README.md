# AI Gateway - 智能 AI 请求网关

基于 Rust + Actix-web 的智能 AI 请求网关，支持根据 prompt 特征动态路由和语义缓存功能。

## 功能特性

### 1. 智能路由 (Router)
根据 prompt 的前 50 个 token 特征自动选择最优模型：
- **代码相关** → DeepSeek
- **翻译相关** → Qwen
- **通用对话** → Claude

### 2. 语义缓存 (Semantic Cache)
使用 Qdrant 向量数据库：
- 对相似度 > 0.95 的请求直接返回缓存结果
- 使用 AllMiniLML6V2 嵌入模型计算向量相似度
- 支持本地内存缓存 + 向量数据库双层缓存

### 3. 管理面板 (Dashboard)
Vue + Tailwind CSS 构建的管理界面：
- 实时统计展示
- 模型路由分布图
- 缓存命中率统计
- 在线测试功能

## 项目结构

```
c68/
├── ai-gateway-backend/    # Rust 后端
│   ├── src/
│   │   ├── main.rs        # 主入口
│   │   ├── router.rs      # 路由模块
│   │   ├── cache.rs       # 缓存模块
│   │   ├── stats.rs       # 统计模块
│   │   └── handlers.rs    # HTTP 处理器
│   └── Cargo.toml
├── ai-gateway-frontend/   # Vue 前端
│   ├── src/
│   │   ├── App.vue        # 主组件
│   │   ├── main.js        # 入口文件
│   │   └── style.css      # 样式
│   └── package.json
└── docker-compose.yml     # Qdrant 服务
```

## 快速开始

### 前置要求
- Rust 1.70+
- Node.js 18+
- Docker & Docker Compose

### 1. 启动 Qdrant 向量数据库
```bash
docker-compose up -d
```

### 2. 启动后端服务
```bash
cd ai-gateway-backend
cargo run
```
后端将在 http://localhost:8080 启动

### 3. 启动前端管理面板
```bash
cd ai-gateway-frontend
npm install
npm run dev
```
前端将在 http://localhost:3000 启动

## API 接口

### POST /api/chat
发送聊天请求

**请求体：**
```json
{
  "prompt": "你好，请写一个 Rust 函数"
}
```

**响应：**
```json
{
  "response": "[DeepSeek Response] This is a simulated code response...",
  "model": "DeepSeek",
  "cached": false
}
```

### GET /api/stats
获取统计数据

**响应：**
```json
{
  "total_requests": 10,
  "total_cached": 3,
  "cache_hit_rate": 30.0,
  "models": {
    "Claude": { "total_requests": 5, "cached_requests": 1 },
    "DeepSeek": { "total_requests": 3, "cached_requests": 1 },
    "Qwen": { "total_requests": 2, "cached_requests": 1 }
  }
}
```

### POST /api/cache/clear
清除所有缓存

## 路由规则说明

### 代码检测关键词
`function`, `class`, `def`, `fn`, `import`, `if`, `else`, `for`, `while`, `return`, `pub fn`, `fn main`, `SELECT`, `FROM`, `WHERE`, `npm`, `cargo`, `pip`, `docker`, `git` 等

### 翻译检测关键词
`翻译`, `translate`, `译成`, `译为`, `英文`, `中文`, `英语`, `汉语`, `English`, `Chinese`, `in English`, `in Chinese`, `请翻译`, `please translate` 等

## 配置说明

### 缓存相似度阈值
在 `ai-gateway-backend/src/cache.rs` 中修改：
```rust
const SIMILARITY_THRESHOLD: f32 = 0.95;
```

### 嵌入模型
当前使用 `AllMiniLML6V2` (384 维向量)，可在 `cache.rs` 中修改

## 注意事项

1. 当前模型调用为模拟响应，实际使用时需要替换为真实的 LLM API 调用
2. Qdrant 服务需要在后端启动前运行
3. 首次启动会下载嵌入模型，可能需要一些时间

## 扩展建议

- 添加真实的 LLM API 调用支持 (OpenAI, Anthropic, DeepSeek, Qwen)
- 添加配置文件支持
- 添加请求限流和认证
- 添加更多路由策略
- 支持自定义模型配置
