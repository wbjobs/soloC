# 跨端剪贴板同步工具

基于 Electron + React + TypeScript 开发的跨端剪贴板同步工具，支持 Windows、macOS、Linux。

## 项目结构

```
c21/
├── server/          # 服务端 (Node.js + WebSocket)
├── client/          # 客户端 (Electron + React + TypeScript)
└── web-admin/       # Web 管理后台
```

## 功能特性

- ✅ 实时同步文本和图片类型的剪贴板内容
- ✅ WebSocket 实时通信
- ✅ 用户会话管理和设备绑定
- ✅ AES 加密数据传输
- ✅ 本地 SQLite 历史记录持久化
- ✅ Web 管理后台监控在线设备和同步日志

## 快速开始

### 1. 启动服务端

```bash
cd server
npm install
npm run dev
```

服务端启动后，会显示测试用户的 userId 和 token。

管理后台地址: http://localhost:3001

### 2. 启动客户端

```bash
cd client
npm install
npm run build
npm start
```

### 3. 配置客户端

1. 打开客户端应用
2. 进入"设置"页面
3. 填入服务端启动时显示的 userId 和 token
4. 点击"保存设置"
5. 回到仪表板，点击"连接服务器"
6. 确保"剪贴板监听"已开启

### 4. 测试同步

1. 在设备 A 上复制文本或图片
2. 查看设备 B 的剪贴板，内容应已同步
3. 在管理后台 (http://localhost:3001) 可查看设备列表和同步日志

## API 接口

服务端提供以下 API：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/devices` | GET | 获取设备列表 |
| `/api/logs` | GET | 获取同步日志 |
| `/api/users` | GET | 获取用户列表 |
| `/api/register` | POST | 注册新用户 |

注册用户示例:
```bash
curl -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","password":"pass123"}'
```

## 默认测试用户

服务端启动时会自动创建一个测试用户：
- 用户名: demo
- 密码: demo123

启动时控制台会显示 userId 和 token。

## 安全说明

- 所有剪贴板数据在传输前使用 AES 加密
- 只有同一用户的设备才能互相同步
- 服务端不会保存加密密钥
- 本地历史记录存储在 SQLite 数据库中

## 开发模式

### 服务端开发
```bash
cd server
npm run dev  # 带热重载
```

### 客户端开发
```bash
cd client
npm run dev  # 同时启动主进程和渲染进程热重载
```

## 技术栈

- **服务端**: Node.js, TypeScript, Express, WebSocket (ws)
- **客户端**: Electron, React, TypeScript, Webpack
- **加密**: AES (crypto-js)
- **存储**: SQLite (sql.js), electron-store
- **管理后台**: 原生 HTML/JS/CSS
