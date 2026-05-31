# 多人协同参观系统

## 功能概述

实现了完整的多人协同参观虚拟博物馆系统，包括：

### ✅ 核心功能
- **WebSocket实时同步** - 用户位置/旋转状态实时同步
- **虚拟化身(Avatar)** - 可看到其他用户的3D形象和名字
- **房间系统** - 多房间支持，用户可创建/加入不同房间
- **语音通话** - WebRTC点对点实时语音通信
- **用户列表** - 显示当前在线用户和说话状态

### ✅ 性能优化
- **位置更新节流** - 50ms间隔，减少网络开销
- **LOD系统** - 根据距离自动切换细节级别
- **质量自适应** - 根据设备性能自动调整画质

## 技术架构

### 后端 (NestJS + Socket.IO)

```
backend/src/
├── websocket/
│   ├── websocket.gateway.ts    # Socket.IO网关
│   ├── user.service.ts          # 用户状态管理
│   └── websocket.module.ts      # WebSocket模块
```

**WebSocket事件：**
| 事件名 | 方向 | 说明 |
|--------|------|------|
| `joinRoom` | 客户端→服务器 | 用户加入房间 |
| `userJoined` | 服务器→客户端 | 通知有新用户加入 |
| `updatePosition` | 客户端→服务器 | 同步用户位置 |
| `userMoved` | 服务器→客户端 | 广播用户移动 |
| `voiceSignal` | 双向 | WebRTC信令 |
| `userLeft` | 服务器→客户端 | 用户离开通知 |

### 前端 (React + Three.js + Socket.IO)

```
frontend/src/
├── contexts/
│   ├── NetworkContext.tsx       # 网络同步上下文
│   ├── VoiceContext.tsx         # WebRTC语音上下文
│   └── PerformanceContext.tsx   # 性能监控上下文
├── components/
│   ├── Avatar.tsx               # 虚拟化身组件
│   ├── RoomJoinPanel.tsx        # 房间加入界面
│   ├── AdaptiveLOD.tsx          # 自适应LOD组件
│   └── OptimizedMesh.tsx        # 优化网格组件
```

## 快速开始

### 1. 安装后端依赖
```bash
cd backend
npm install
```

### 2. 启动后端服务器
```bash
npm run start:dev
```
服务器运行在: `http://localhost:3001`

### 3. 安装前端依赖
```bash
cd frontend
npm install
```

### 4. 启动前端开发服务器
```bash
npm run dev
```
前端运行在: `http://localhost:3000`

## 使用指南

### 加入房间
1. 打开浏览器访问 `http://localhost:3000`
2. 输入房间号（默认: `museum-hall-01`）
3. 输入你的用户名
4. 点击「进入房间」

### 多人测试
1. 打开另一个浏览器窗口/标签页
2. 使用相同的房间号，不同的用户名
3. 你应该能看到对方的虚拟化身
4. 靠近对方可以听到语音（需要麦克风权限）

### 控制方式
- **WASD / 方向键** - 移动
- **鼠标拖拽** - 旋转视角
- **点击「语音」按钮** - 切换静音/取消静音

## 系统特性

### 房间系统
- 多个独立房间同时存在
- 每个房间有独立的用户列表
- 房间内的消息/位置只在房间内广播

### 虚拟化身 (Avatar)
- 胶囊体身体 + 球体头部
- 头顶显示用户名标签
- 不同用户有不同的颜色
- 位置和旋转实时同步
- 说话时显示麦克风图标

### 语音通话
- 使用 WebRTC 点对点连接
- Socket.IO 作为信令服务器
- 回声消除 + 噪声抑制
- 音量指示器（麦克风激活状态）

### 性能监控
- 实时 FPS 显示
- 三角形/绘制调用计数
- 可切换低/中/高画质
- VR模式自动优化

## 部署说明

### 生产环境部署

**后端：**
```bash
cd backend
npm run build
npm run start:prod
```

**前端：**
```bash
cd frontend
npm run build
# 将 dist 目录部署到静态服务器
```

### WebSocket 生产配置
```typescript
// websocket.gateway.ts
@WebSocketGateway({
  cors: {
    origin: 'https://your-domain.com',  // 生产域名
    credentials: true,
  },
  transports: ['websocket'],
})
```

## 浏览器兼容性

| 浏览器 | 支持状态 | 说明 |
|--------|----------|------|
| Chrome 90+ | ✅ 完全支持 | 推荐 |
| Firefox 88+ | ✅ 完全支持 | |
| Safari 15+ | ⚠️ 部分支持 | WebRTC可能有问题 |
| Edge 90+ | ✅ 完全支持 | |

## 扩展功能建议

### 1. 文本聊天
```typescript
// 已实现基础框架，可在 RoomJoinPanel 中添加聊天窗口
- 消息历史记录
- 表情支持
- 系统消息（用户加入/离开）
```

### 2. 协作标注
```typescript
// 指向功能已实现，可扩展：
- 3D 画笔标注
- 文物标记
- 导游视角跟随
```

### 3. 会话录制
```typescript
- 记录用户移动路径
- 录制语音导览
- 导出参观回放
```

### 4. 权限系统
```typescript
- 主持人/观众角色
- 麦克风管理
- 踢人功能
```

### 5. 服务器优化
```typescript
- Redis 多实例共享状态
- 负载均衡
- 用户上限管理
- 断线重连
```

## 故障排除

### 连接失败
1. 确认后端服务器运行在 3001 端口
2. 检查防火墙设置
3. 查看浏览器控制台错误信息

### 看不到其他用户
1. 确认使用相同的房间号
2. 检查 WebSocket 连接状态
3. 刷新页面重试

### 语音不工作
1. 确认授予了麦克风权限
2. 检查是否静音
3. 确认双方都在同一个房间
4. 尝试刷新页面重新建立连接

### 性能问题
1. 切换到低画质模式
2. 关闭其他占用资源的标签页
3. 检查网络连接稳定性

## 技术栈详解

### Socket.IO
- 自动重连机制
- 心跳检测
- 房间/命名空间支持
- 二进制数据传输

### WebRTC
- RTCPeerConnection 点对点连接
- getUserMedia 音频捕获
- STUN 服务器 NAT 穿透
- 自适应码率

### Three.js
- 实例化渲染优化
- 视锥体剔除
- LOD 细节层次
- 阴影优化
