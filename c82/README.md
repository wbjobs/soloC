# 网页监控系统

一个全栈网页监控系统，周期性抓取网页内容，计算DOM结构哈希，存储到ClickHouse，并提供时间轴对比视图。

## 功能特性

- **URL管理**: 添加、删除、查看监控的URL列表
- **定时抓取**: 每6小时自动抓取网页内容（可配置）
- **DOM哈希**: 计算DOM结构哈希用于快速检测变更
- **差异计算**: 文本差异和属性差异检测
- **ClickHouse存储**: 高性能列式数据库存储快照和差异数据
- **时间轴视图**: 查看历史变更记录
- **统计面板**: 变更次数、变更节点数、新增/删除文本量
- **趋势图表**: 可视化变更趋势
- **筛选排序**: 按时间筛选，按变更程度排序

## 技术栈

### 后端
- Node.js + Express
- ClickHouse (数据存储)
- node-cron (定时任务)
- cheerio (HTML解析)
- diff (差异计算)
- axios (HTTP请求)

### 前端
- React 18
- React Router
- Tailwind CSS
- Recharts (图表)
- date-fns (日期处理)
- lucide-react (图标)

## 快速开始

### 1. 启动ClickHouse

```bash
docker-compose up -d
```

### 2. 初始化数据库

```bash
cd backend
npm install
node src/scripts/initDb.js
```

### 3. 启动后端服务

```bash
cd backend
npm run dev
```

后端服务将在 http://localhost:3001 启动

### 4. 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 http://localhost:3000 启动

## 配置

### 后端环境变量 (backend/.env)

```
PORT=3001
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=webmonitor
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CRAWL_INTERVAL=6
```

### 调整抓取间隔

修改 `CRAWL_INTERVAL` 环境变量来调整抓取频率（单位：小时）。

## API接口

### URL管理
- `GET /api/urls` - 获取所有URL
- `GET /api/urls/:id` - 获取单个URL
- `POST /api/urls` - 添加URL
- `PUT /api/urls/:id` - 更新URL
- `DELETE /api/urls/:id` - 删除URL
- `POST /api/urls/:id/crawl` - 手动触发抓取

### 快照
- `GET /api/urls/:id/snapshots` - 获取URL的快照列表
- `GET /api/snapshots/:id` - 获取单个快照
- `GET /api/snapshots/:id/content` - 获取快照内容

### 差异
- `GET /api/urls/:id/diffs` - 获取URL的差异列表
- `GET /api/urls/:id/stats` - 获取URL的统计数据
- `GET /api/diffs/:id` - 获取单个差异
- `GET /api/diffs/:id/data` - 获取差异详情数据
- `POST /api/diffs/compare` - 比较两个快照

## 项目结构

```
.
├── backend/
│   ├── src/
│   │   ├── config/          # 配置文件
│   │   ├── models/          # 数据模型
│   │   ├── services/        # 业务逻辑
│   │   │   ├── crawler.js   # 爬虫服务
│   │   │   ├── diffCalculator.js  # 差异计算
│   │   │   └── scheduler.js # 定时任务
│   │   ├── routes/          # API路由
│   │   ├── scripts/         # 脚本
│   │   └── index.js         # 入口文件
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # React组件
│   │   ├── services/        # API服务
│   │   └── main.jsx         # 入口
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── package.json
```

## 使用说明

1. 添加需要监控的URL
2. 系统会自动每6小时抓取一次
3. 手动抓取：点击URL列表中的"抓取"按钮
4. 查看详情：点击"查看"进入URL详情页
5. 查看变更：在详情页点击变更历史记录查看差异

## 数据库表结构

### urls
- id: UUID
- url: String
- name: String
- created_at: DateTime
- is_active: UInt8
- use_puppeteer: UInt8 (是否使用Puppeteer渲染)
- enable_scroll: UInt8 (是否启用自动滚动)
- wait_for_selector: String (等待的CSS选择器)
- custom_timeout: UInt32 (自定义超时时间)

### snapshots
- id: UUID
- url_id: UUID
- url: String
- dom_hash: String
- content: String
- content_length: UInt32 (内容长度)
- text_length: UInt32 (纯文本长度)
- link_count: UInt32 (链接数量)
- image_count: UInt32 (图片数量)
- crawled_at: DateTime
- status: UInt8
- render_engine: String (渲染引擎: puppeteer/simple)

### diffs
- id: UUID
- url_id: UUID
- snapshot_from_id: UUID
- snapshot_to_id: UUID
- diff_data: String (JSON)
- changed_nodes: UInt32
- added_text: UInt32
- removed_text: UInt32
- created_at: DateTime

## 测试

运行爬虫测试：

```bash
cd backend
node src/scripts/testCrawler.js
```

测试包含：
- 懒加载页面抓取测试
- 无限滚动页面抓取测试
- DOM哈希一致性测试
- 简单模式抓取测试
