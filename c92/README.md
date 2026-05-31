# Clipboard Sync - 跨平台剪贴板历史同步工具

一个功能完整的跨平台剪贴板同步工具，支持Windows、macOS和Linux。

## 功能特性

### 🔄 核心功能
- **实时剪贴板监听**：自动捕获复制的文本和图片内容
- **多设备同步**：通过云端服务实现多设备剪贴板同步
- **增量同步**：只同步变更的数据，提高效率
- **冲突处理**：以最新修改时间为准解决同步冲突

### 🔐 安全特性
- **本地加密存储**：使用AES加密本地保存的剪贴板数据
- **敏感数据脱敏**：自动识别并脱敏身份证号、手机号、银行卡号
- **JWT用户认证**：安全的用户身份验证

### 📋 历史管理
- **按设备筛选**：查看特定设备的剪贴板历史
- **按时间筛选**：根据时间范围查找历史记录
- **分页显示**：支持大量数据的分页浏览
- **本地备份恢复**：导出和导入剪贴板历史

## 项目结构

```
clipboard-sync/
├── backend/                 # Go后端服务
│   ├── main.go             # 程序入口
│   ├── models/             # 数据模型
│   │   ├── user.go
│   │   ├── device.go
│   │   └── clipboard.go
│   ├── controllers/        # API控制器
│   │   ├── auth_controller.go
│   │   ├── device_controller.go
│   │   └── clipboard_controller.go
│   ├── middleware/         # 中间件
│   │   └── auth.go
│   ├── config/             # 配置和数据库
│   │   ├── config.go
│   │   └── database.go
│   ├── routes/             # 路由定义
│   │   └── routes.go
│   └── utils/              # 工具函数
│       └── jwt.go
└── desktop/                # Electron桌面客户端
    ├── main.js             # Electron主进程
    ├── index.html          # 前端UI界面
    └── package.json        # 依赖配置
```

## 快速开始

### 环境要求
- Go 1.21+
- Node.js 16+
- MySQL 8.0+
- Redis 6.0+

### 1. 后端服务启动

```bash
cd backend
go mod download
```

配置数据库连接（在 `config/config.go` 中修改）：
```go
// 默认配置
MySQLDSN: "root:password@tcp(127.0.0.1:3306)/clipboard_sync?charset=utf8mb4&parseTime=True&loc=Local"
```

创建数据库：
```sql
CREATE DATABASE clipboard_sync;
```

启动服务：
```bash
go run main.go
```

服务将在 `http://localhost:8080` 启动。

### 2. 桌面客户端启动

```bash
cd desktop
npm install
npm start
```

## API 接口

### 认证接口
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/profile` - 获取用户信息

### 设备接口
- `POST /api/devices` - 注册设备
- `GET /api/devices` - 获取设备列表
- `PUT /api/devices/:uuid` - 更新设备信息
- `DELETE /api/devices/:uuid` - 删除设备

### 剪贴板接口
- `POST /api/clipboard` - 创建剪贴板数据
- `GET /api/clipboard` - 获取剪贴板历史（支持筛选）
- `POST /api/clipboard/sync` - 同步剪贴板数据
- `DELETE /api/clipboard/:id` - 删除剪贴板数据

## 同步机制

### 增量同步
客户端只发送上次同步之后变更的数据，服务器返回所有更新的数据，实现高效同步。

### 冲突处理
当多设备同时修改同一条剪贴板数据时，以修改时间较新的版本为准，避免数据冲突。

### 加密传输
所有同步数据在传输前都经过AES加密，确保数据传输安全。

## 敏感数据脱敏

自动识别并脱敏以下类型的敏感数据：
- 身份证号：110101********1234 → 110101********1234
- 手机号：138****1234 → 138****1234
- 银行卡号：6222****1234 → 6222********1234

## 数据存储

### 服务端
- MySQL：用户信息、设备信息、剪贴板元数据
- Redis：缓存、会话管理

### 客户端
- 本地JSON文件存储：设置、认证信息、剪贴板历史
- 本地图片存储：图片文件保存到用户数据目录

## 构建发布

### 后端构建
```bash
cd backend
go build -o clipboard-sync-server
```

### 客户端构建
```bash
cd desktop
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## 使用说明

1. 首次使用需要注册账号并登录
2. 登录后系统会自动注册当前设备
3. 复制任意文本或图片，系统会自动记录
4. 在其他设备使用相同账号登录，即可实现同步
5. 可在设置中配置同步开关、开机自启等选项
6. 可在备份页面导出或导入剪贴板历史数据

## 技术栈

**后端**：
- Go + Gin Web Framework
- GORM ORM
- MySQL
- Redis
- JWT Authentication

**客户端**：
- Electron
- CryptoJS
- Native Node.js modules

## 许可证

MIT License
