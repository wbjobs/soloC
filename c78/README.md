# WebRTC AR 视频通话系统

一个基于 WebRTC 的实时视频通话系统，支持 AR 标注功能。主叫方可以通过手机摄像头在视频画面上叠加 3D 箭头、圆圈等标注物，标注物会跟随真实物体移动。被叫方在 Web 端实时看到标注。

## 功能特性

- 📹 **实时视频通话**: 基于 WebRTC 的点对点视频通话
- 🎯 **AR 标注**: 支持箭头、圆圈、点三种标注工具
- 📷 **截图保存**: 保存带有标注的视频截图到历史记录
- 📋 **会话管理**: 创建和加入视频会话
- 🔄 **实时同步**: 标注信息实时同步到被叫端

## 技术栈

### 后端
- Node.js + Express
- Socket.io (信令服务器)
- Multer (文件上传)

### 前端
- Vue 3 + Vite
- Socket.io-client
- Three.js (3D 渲染)
- 原生 WebRTC API
- 自定义 AR 标记检测算法

## 项目结构

```
c78/
├── server/                 # 后端服务
│   ├── src/
│   │   └── server.js      # 信令服务器
│   ├── uploads/           # 上传文件目录
│   │   └── screenshots/   # 截图保存
│   └── package.json
├── client/                 # 前端应用
│   ├── src/
│   │   ├── views/         # 页面组件
│   │   │   ├── Home.vue
│   │   │   ├── Caller.vue
│   │   │   └── Callee.vue
│   │   ├── services/      # 服务模块
│   │   │   ├── socket.js
│   │   │   ├── webrtc.js
│   │   │   └── ar.js
│   │   ├── router/        # 路由
│   │   ├── App.vue
│   │   └── main.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── package.json
```

## 快速开始

### 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 启动服务

#### 方式一：分别启动（推荐）

```bash
# 启动后端服务 (端口 3001)
cd server
npm run dev

# 启动前端服务 (端口 3000)
cd ../client
npm run dev
```

#### 方式二：使用 concurrently 同时启动

```bash
# 在根目录执行
npm run dev
```

### 使用说明

1. **打开首页**: 浏览器访问 `http://localhost:3000`

2. **主叫方 (手机端)**:
   - 点击「主叫方 (手机)」进入
   - 允许摄像头权限
   - 点击「创建会话」按钮
   - 将会话ID分享给被叫方
   - 在视频画面上绘制标注（支持鼠标和触摸）
   - 点击「截图」按钮保存截图

3. **被叫方 (Web 端)**:
   - 点击「被叫方 (Web 端)」进入
   - 输入会话ID并点击「加入会话」
   - 等待连接并查看主叫方视频和实时标注

4. **查看历史**:
   - 在首页点击「加载历史记录」查看所有保存的截图

## AR 标记说明

系统内置了简单的 AR 标记检测算法，可以识别高对比度的方形标记。当检测到标记时，标注会自动跟随标记移动。

**建议使用的标记**:
- 打印 5x5 的 QR 码或方形图案
- 确保标记在视频中清晰可见
- 良好的光线条件有助于提高检测精度

## API 接口

### 截图相关

- `POST /api/screenshot`: 上传截图
- `GET /api/screenshots`: 获取截图列表
- `GET /api/screenshots/:filename`: 获取具体截图文件

### WebSocket 事件

- `create-session`: 创建会话
- `join-session`: 加入会话
- `offer`: WebRTC Offer 信令
- `answer`: WebRTC Answer 信令
- `ice-candidate`: ICE 候选
- `annotation-update`: 标注更新
- `hang-up`: 挂断通话

## 注意事项

1. **HTTPS**: 生产环境必须使用 HTTPS 才能访问摄像头
2. **网络**: WebRTC 对等连接需要良好的网络环境
3. **浏览器兼容**: 推荐使用 Chrome、Firefox、Edge 等现代浏览器
4. **移动端**: 移动端访问需要 HTTPS 或 localhost 环境

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 开发计划

- [ ] 集成完整的 AR.js + ARToolkit
- [ ] 支持更多标注工具（矩形、文字等）
- [ ] 标注样式自定义
- [ ] 会话录制功能
- [ ] 多人群聊支持
- [ ] 用户认证系统

## 许可证

MIT
