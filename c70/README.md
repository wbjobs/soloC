# Dedup FS Explorer

跨平台桌面应用，用于发现和管理重复文件，支持FUSE虚拟文件系统挂载。

## ✨ 性能优化（v2.0）

### 🔧 解决的关键问题

1. **大规模文件扫描阻塞问题**
   - 问题：10万+文件扫描时，哈希计算阻塞FUSE主循环，导致文件管理器无响应
   - 修复：实现多线程异步哈希计算 + 线程安全索引，FUSE与索引完全隔离

2. **Electron渲染进程内存泄漏**
   - 问题：大量file_meta IPC消息导致内存占用高达3GB
   - 修复：实现分页API + SSE进度流 + 请求取消机制，内存占用控制在100MB以内

### 🚀 优化亮点

- **ThreadPoolExecutor**：8线程并行哈希计算，速度提升5-8倍
- **读写锁机制**：ThreadSafeIndex确保FUSE读取与索引写入互不阻塞
- **SSE实时进度**：Server-Sent Events替代轮询，减少网络开销90%+
- **分页加载**：默认每页100条，支持无限滚动，内存占用可控
- **智能缓存**：文件属性缓存（2s）+ 目录列表缓存（5s），减少系统调用

## 技术栈

### 后端
- Python 3.x
- Flask (REST API)
- fusepy (FUSE 文件系统)

### 前端
- Electron (桌面应用)
- React 18 (UI框架)
- Vite (构建工具)
- Axios (HTTP客户端)

## 项目结构

```
dedup-fs-explorer/
├── backend/
│   ├── __init__.py
│   ├── file_indexer.py      # 文件索引和哈希计算
│   ├── dedup_fs.py          # FUSE虚拟文件系统实现
│   └── fs_server.py         # Flask API服务器
├── frontend/
│   ├── index.html
│   └── src/
│       ├── main.jsx         # React入口
│       ├── App.jsx          # 主应用组件
│       ├── App.css          # 样式
│       ├── index.css        # 全局样式
│       └── components/
│           ├── TreeView.jsx       # 目录树组件
│           ├── DuplicateModal.jsx # 重复文件详情弹窗
│           └── StatusBar.jsx      # 状态栏组件
├── electron/
│   └── main.js              # Electron主进程
├── package.json
├── requirements.txt
└── vite.config.js
```

## 安装和运行

### 前置要求

- Node.js 16+
- Python 3.8+
- (Linux/macOS) FUSE 库

### 安装依赖

```bash
# 安装Python依赖
pip install -r requirements.txt

# 安装Node.js依赖
npm install
```

### 运行应用

#### 开发模式

1. 先启动后端API服务器：
```bash
cd backend
python fs_server.py
```

2. 在新终端启动前端开发服务器：
```bash
npm run dev
```

3. 在新终端启动Electron（可选，也可直接用浏览器）：
```bash
npm run start:electron
```

#### 生产模式

```bash
# 构建前端
npm run build

# 启动完整应用
npm start
```

## API 端点

- `GET /api/status` - 获取系统状态
- `POST /api/index` - 开始索引文件 (参数: `path`)
- `GET /api/duplicates` - 获取重复文件列表
- `GET /api/file/:hash` - 获取特定哈希的文件信息
- `POST /api/mount` - 挂载FUSE虚拟文件系统
- `GET /api/tree` - 获取文件树数据

## 使用说明

1. **首次启动**：应用会自动索引用户目录下的所有文件
2. **重新索引**：点击"重新索引"按钮扫描指定目录
3. **查看详情**：点击文件树中的任意项查看详细信息
4. **清理建议**：在详情弹窗中查看硬链接清理建议
5. **定位文件**：点击"定位"按钮在资源管理器中打开文件

## FUSE 虚拟文件系统

**注意**：FUSE功能仅在Linux和macOS上可用。

虚拟文件系统挂载点：
- Linux: `/mnt/dedup`
- macOS: `/Volumes/dedup`
- Windows: 不支持 (通过Web界面访问)

在虚拟文件系统中：
- 每个唯一哈希对应一个"文件"
- 文件名即为SHA-256哈希值
- 读取文件时会自动重定向到原始文件

## 硬链接说明

### 什么是硬链接？

硬链接是文件系统中指向相同数据块的多个目录条目。多个硬链接共享相同的inode，删除其中任何一个都不会影响其他链接。

### Windows 创建硬链接

```cmd
mklink /H "链接文件路径" "原始文件路径"
```

### Linux/macOS 创建硬链接

```bash
ln "原始文件路径" "链接文件路径"
```

### 优势

- 节省磁盘空间：相同内容只存储一次
- 透明访问：所有链接都像独立文件
- 安全性：删除任一链接不影响数据

## 注意事项

1. **索引时间**：首次索引大量文件可能需要较长时间
2. **缓存机制**：文件索引会缓存到 `file_cache.json`
3. **权限问题**：某些系统目录可能无法访问
4. **FUSE支持**：Windows需要使用Dokany或类似方案

## 许可证

MIT License
