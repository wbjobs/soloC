# 日志分析器 - 桌面应用

一个功能强大的服务器日志分析桌面应用，基于Electron + React + TypeScript开发。

## 功能特性

### 📁 多格式日志解析
- **JSON Lines格式**: 支持结构化JSON日志
- **Apache通用格式**: 自动解析Web服务器访问日志
- **Systemd Journal格式**: 支持Linux系统日志
- **自动检测**: 自动识别日志格式

### 🔍 全文搜索引擎
- 基于 **SQLite FTS5** 的高性能全文搜索
- 支持复杂的搜索语法
- 正则表达式过滤
- 按日志级别、时间范围筛选

### 📊 可视化分析
- **时间轴热力图**: 按小时展示日志分布
- 支持日期范围筛选
- 直观的颜色编码

### 🎯 异常聚类
- 基于 **DBSCAN算法** 的无监督聚类
- 自动发现相似的错误模式
- 按日志消息相似度聚类
- 可展开查看详细样本

### 📄 PDF报告导出
- 生成完整的分析报告
- 包含统计概览
- 错误日志列表
- 日志来源分布

### 🖥️ 系统托盘快速搜索
- 全局快速搜索窗口
- 实时搜索结果
- ESC键快速关闭

## 技术栈

- **Electron**: 跨平台桌面应用框架
- **React 18**: UI框架
- **TypeScript**: 类型安全
- **SQLite + FTS5**: 本地数据库和全文搜索
- **DBSCAN**: 密度聚类算法
- **pdf-lib**: PDF生成
- **dayjs**: 日期处理
- **Vite**: 构建工具

## 安装和运行

### 开发环境

```bash
# 安装依赖
npm install

# 编译Electron主进程
npm run build:electron

# 开发模式运行
npm run dev
```

### 构建生产版本

```bash
# 构建React和Electron
npm run build

# 打包成安装程序
npm run package
```

## 使用说明

### 1. 导入日志
- 点击"导入日志文件"按钮
- 选择一个或多个日志文件
- 应用会自动检测格式并解析

### 2. 搜索和过滤
- 在搜索框输入关键词（支持FTS语法）
- 使用侧边过滤器筛选：
  - 日志级别: ERROR/WARN/INFO
  - 日期范围
  - 正则表达式

### 3. 查看热力图
- 切换到"时间热力图"视图
- 查看日志在不同时间段的分布
- 鼠标悬停查看具体数量

### 4. 异常聚类分析
- 切换到"异常聚类"视图
- 查看自动发现的异常模式
- 点击聚类卡片展开查看样本日志

### 5. 导出报告
- 点击"导出PDF报告"按钮
- 选择保存位置
- 生成完整的分析报告

### 6. 快速搜索
- 点击系统托盘图标
- 选择"快速搜索"
- 输入关键词即时搜索

## 项目结构

```
log-analyzer/
├── src/                      # React前端代码
│   ├── components/           # 组件
│   │   ├── LogsTable.tsx    # 日志表格
│   │   ├── Heatmap.tsx      # 热力图
│   │   ├── Clusters.tsx     # 聚类展示
│   │   └── SearchWindow.tsx # 快速搜索窗口
│   ├── types.ts              # 类型定义
│   ├── App.tsx               # 主应用组件
│   ├── index.tsx             # 入口文件
│   └── index.css             # 样式
├── electron/                 # Electron主进程代码
│   ├── main.ts               # 主进程入口
│   ├── preload.ts            # 预加载脚本
│   ├── database.ts           # 数据库操作
│   ├── log-parsers.ts        # 日志解析器
│   ├── search.ts             # 搜索功能
│   ├── clustering.ts         # 聚类算法
│   ├── pdf-export.ts         # PDF导出
│   └── tsconfig.json         # TypeScript配置
├── index.html                # HTML模板
├── vite.config.ts            # Vite配置
├── package.json              # 依赖配置
└── README.md                 # 说明文档
```

## 数据存储

所有数据本地存储在用户数据目录：
- Windows: `%APPDATA%/LogAnalyzer/`
- macOS: `~/Library/Application Support/LogAnalyzer/`
- Linux: `~/.config/LogAnalyzer/`

数据库文件: `logs.db`

## 许可证

MIT License
