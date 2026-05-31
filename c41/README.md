# 性能监控 Chrome 扩展

基于 TypeScript + React + Vite 开发的 Chrome 浏览器扩展，配套 Node.js + Express 后端服务，用于采集和分析网页性能指标。

## 功能特性

- **核心性能指标采集**：LCP（最大内容绘制）、FID（首次输入延迟）、CLS（累积布局偏移）
- **资源加载瀑布流**：采集所有资源的详细加载时间和大小
- **关键请求耗时**：DNS 查询、TCP 连接、SSL 握手、TTFB 等
- **实时性能评分**：Popup 页面展示实时性能评分和指标详情
- **定时上报数据**：扩展每 10 秒自动将采集的数据发送到后端
- **数据持久化存储**：使用 SQLite 数据库存储性能数据
- **统计分析 API**：提供 RESTful API 用于查询和统计性能数据

## 项目结构

```
performance-monitor/
├── extension/           # Chrome 扩展
│   ├── src/
│   │   ├── content/     # 内容脚本（采集性能数据）
│   │   ├── background/  # 后台脚本
│   │   └── popup/       # Popup 页面
│   ├── manifest.json    # 扩展配置
│   └── vite.config.ts   # Vite 构建配置
├── server/              # 后端服务
│   ├── src/
│   │   ├── index.ts     # Express 服务器入口
│   │   ├── database.ts  # 数据库操作
│   │   └── types.ts     # 类型定义
│   └── tsconfig.json    # TypeScript 配置
└── package.json         # 根项目配置
```

## 安装和运行

### 1. 安装依赖

```bash
# 安装根项目依赖
npm install

# 安装扩展依赖
cd extension
npm install

# 安装后端依赖
cd ../server
npm install
```

### 2. 构建扩展

```bash
cd extension
npm run build
```

### 3. 安装扩展到 Chrome

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/dist` 目录

### 4. 运行后端服务

```bash
cd server
npm run dev
```

后端服务将在 `http://localhost:3000` 启动

## API 接口

### POST `/api/metrics`
提交性能指标数据

**请求体**：
```json
{
  "url": "https://example.com",
  "timestamp": 1700000000000,
  "lcp": 2500,
  "fid": 80,
  "cls": 0.05,
  "resources": [...],
  "navigation": {...}
}
```

### GET `/api/metrics`
获取所有性能指标（默认 100 条）

**查询参数**：`limit` - 返回数量限制

### GET `/api/metrics/url`
按 URL 获取性能指标

**查询参数**：
- `url` - 网页 URL（必需）
- `limit` - 返回数量限制

### GET `/api/metrics/:id/resources`
获取指定指标记录的资源列表

### GET `/api/statistics`
获取总体统计数据

### GET `/api/statistics/urls`
获取按 URL 分组的统计数据

### GET `/health`
健康检查接口

## 性能指标说明

| 指标 | 说明 | 优秀 | 良好 | 较差 |
|------|------|------|------|------|
| LCP | 最大内容绘制 | ≤ 2.5s | ≤ 4.0s | > 4.0s |
| FID | 首次输入延迟 | ≤ 100ms | ≤ 300ms | > 300ms |
| CLS | 累积布局偏移 | ≤ 0.1 | ≤ 0.25 | > 0.25 |

## 技术栈

### 扩展端
- **TypeScript** - 类型安全
- **React 18** - UI 框架
- **Vite** - 构建工具
- **web-vitals** - 性能指标采集库
- **Chrome Extensions API** - 浏览器扩展 API

### 后端
- **Node.js** - 运行时
- **Express** - Web 框架
- **TypeScript** - 类型安全
- **better-sqlite3** - SQLite 数据库驱动
- **CORS** - 跨域资源共享

## 开发说明

### 扩展开发
```bash
cd extension
npm run dev
```

### 后端开发
```bash
cd server
npm run dev
```

### 生产构建
```bash
# 构建扩展
cd extension
npm run build

# 构建后端
cd ../server
npm run build
npm start
```

## 注意事项

1. 扩展需要访问所有网页的权限以采集性能数据
2. 后端服务默认运行在 3000 端口，如需修改请编辑 `server/src/index.ts`
3. 数据库文件 `performance.db` 会自动创建在 `server` 目录下
4. 扩展每 10 秒自动上报一次数据，页面关闭前也会上报

## 许可证

MIT
