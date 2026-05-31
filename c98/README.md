# 跨平台终端会话录制与回放工具

一个完整的跨平台终端会话录制与回放解决方案，包含三个核心模块：命令行录制工具、桌面回放客户端和服务端存储服务。

## 功能特性

### 🔴 录制工具 (Rust)
- ✅ 跨平台支持 (Windows/macOS/Linux)
- ✅ 录制终端输入输出和命令执行过程
- ✅ 保存终端样式和尺寸信息
- ✅ 录制文件加密存储 (AES-256-GCM)
- ✅ Gzip 压缩存储
- ✅ 标准化 JSON 文件格式

### 🎬 回放客户端 (Tauri + Vue3)
- ✅ 跨平台桌面应用
- ✅ 终端样式完美还原 (xterm.js)
- ✅ 倍速播放 (0.25x ~ 8x)
- ✅ 进度跳转和单步控制
- ✅ 命令高亮显示
- ✅ 关键词搜索功能
- ✅ 从服务器加载录制文件

### ☁️ 服务端存储 (Go + Gin)
- ✅ RESTful API 设计
- ✅ MinIO 对象存储集成
- ✅ 录制文件上传/下载
- ✅ 分享链接生成（支持过期时间和访问次数限制）
- ✅ SQLite 元数据存储
- ✅ 关键词搜索接口

## 项目结构

```
.
├── recorder/          # Rust 命令行录制工具
│   ├── src/
│   │   ├── main.rs
│   │   ├── recorder.rs
│   │   ├── crypto.rs
│   │   └── types.rs
│   └── Cargo.toml
│
├── player/            # Tauri 桌面回放客户端
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.js
│   │   └── style.css
│   ├── src-tauri/     # Rust 后端
│   ├── package.json
│   └── vite.config.js
│
└── server/            # Go 服务端存储服务
    ├── main.go
    ├── models.go
    ├── minio.go
    ├── handlers.go
    ├── go.mod
    └── .env.example
```

## 快速开始

### 1. 录制工具

```bash
cd recorder
cargo build --release

# 开始录制
./target/release/termrec

# 带加密的录制
./target/release/termrec --encrypt --password <密码>

# 指定输出文件
./target/release/termrec --output my_recording.tr

# 查看录制信息
./target/release/termrec --info my_recording.tr
```

### 2. 服务端

**前置要求：**
- Go 1.21+
- MinIO 服务器

```bash
cd server

# 复制配置
cp .env.example .env
# 编辑 .env 文件配置 MinIO 连接

# 安装依赖
go mod download

# 运行服务器
go run .
```

服务将在 `http://localhost:8080` 启动

**API 端点：**
- `POST /api/upload` - 上传录制文件
- `GET /api/download/:id` - 下载录制文件
- `GET /api/recordings` - 列出所有录制
- `GET /api/recordings/:id` - 获取录制详情
- `DELETE /api/recordings/:id` - 删除录制
- `POST /api/share/:id` - 创建分享链接
- `GET /api/share/:token` - 访问分享链接
- `GET /api/search?q=关键词` - 搜索录制

### 3. 回放客户端

**前置要求：**
- Node.js 16+
- Rust 1.70+

```bash
cd player

# 安装前端依赖
npm install

# 开发模式运行
npm run tauri dev

# 构建生产版本
npm run tauri build
```

## 文件格式

录制文件 (.tr) 采用以下结构：

```
[Gzip 压缩 [加密数据 [JSON]]]
```

JSON 结构：
```json
{
  "header": {
    "version": "1.0",
    "created_at": "2024-01-01T00:00:00Z",
    "shell": "/bin/bash",
    "term": "xterm-256color",
    "cols": 80,
    "rows": 24,
    "duration": 123.45,
    "event_count": 100,
    "encrypted": true,
    "checksum": "..."
  },
  "events": [
    {
      "timestamp": 0.0,
      "event_type": { "type": "Output" },
      "data": "..."
    }
  ]
}
```

## 技术栈

### 录制工具
- **语言**: Rust
- **终端**: termion, pty-process
- **加密**: aes-gcm, sha2
- **序列化**: serde, serde_json
- **CLI**: clap

### 回放客户端
- **前端**: Vue 3, Vite
- **终端渲染**: xterm.js
- **桌面框架**: Tauri
- **样式**: 原生 CSS

### 服务端
- **语言**: Go
- **Web 框架**: Gin
- **对象存储**: MinIO
- **数据库**: SQLite + GORM
- **配置**: godotenv

## 开发计划

- [ ] 真实 PTY 录制（当前为模拟模式）
- [ ] 录制文件实时流式传输
- [ ] 用户认证系统
- [ ] 录制编辑功能
- [ ] 多端同步
- [ ] Web 回放页面

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT
