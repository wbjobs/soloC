# P2P 代码协同编辑器

基于 Vue 3 + TypeScript + WebRTC + CRDT 的局域网 P2P 代码协同编辑工具。

## ✨ 功能特性

### 核心功能
- 🚀 **P2P 直连**: 使用 WebRTC 技术实现点对点连接
- 💻 **实时协同**: 双方可以同时编辑代码，实现近乎实时同步
- 🎨 **Monaco Editor**: 使用 VS Code 同款编辑器，支持语法高亮和校验
- 🔐 **房间机制**: 创建/加入房间，支持 6 位房间 ID

### CRDT 高级功能
- 🧩 **CRDT 冲突解决**: 基于文本的无冲突复制数据类型，自动解决编辑冲突
- 📴 **离线编辑支持**: 断网时自动缓存本地操作
- 🔄 **离线合并**: 网络恢复后自动合并离线期间的所有修改
- 📦 **持久化存储**: 使用 localStorage 持久化文档状态和操作历史
- 🕒 **向量时钟**: 跟踪操作因果关系，保证最终一致性

### 可靠性增强
- 🔄 **自动重连**: P2P 连接断开后自动尝试重连（最多 5 次）
- 📊 **状态显示**: 实时显示连接状态、离线模式、待同步操作数
- 🎯 **操作级同步**: 细粒度同步每个字符的插入和删除
- 📨 **全量同步**: 新成员加入或重连后自动同步完整文档历史

## 🏗️ 项目结构

```
c43/
├── server/                           # 信令服务器
│   ├── server.js                     # WebSocket 服务器主文件
│   └── package.json
└── client/                           # Vue 3 前端
    ├── src/
    │   ├── components/
    │   │   ├── CodeEditor.vue        # Monaco Editor 组件
    │   │   ├── RoomLobby.vue         # 房间大厅页面
    │   │   └── EditorRoom.vue        # 协同编辑页面
    │   ├── services/
    │   │   ├── CRDTService.ts        # CRDT 算法实现
    │   │   ├── SignalingService.ts   # WebSocket 信令服务
    │   │   └── WebRTCService.ts      # WebRTC P2P 连接服务
    │   ├── types/
    │   ├── App.vue
    │   └── main.ts
    └── package.json
```

## 🚀 启动步骤

### 1. 启动信令服务器

```bash
cd server
npm install
npm start
```

服务器将在 `http://localhost:3001` 启动。

### 2. 启动前端开发服务器

打开新的终端窗口：

```bash
cd client
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动。

## 💡 使用方法

### 基本使用

1. **用户 A**: 打开浏览器访问前端页面，点击「创建新房间」，获取房间 ID
2. **用户 B**: 在另一台设备（同一局域网内）打开前端页面，输入房间 ID 加入
3. **双方建立 WebRTC P2P 连接后即可开始协同编辑**
4. 任意一方输入代码，另一方将实时看到同步的代码

### 离线编辑测试

1. **双方建立连接**后，断开其中一方的网络（或关闭服务器）
2. **离线编辑**: 断网用户可以继续编辑代码，所有操作将被缓存
3. **恢复网络**: 重新连接网络后，系统会：
   - 自动检测网络恢复
   - 同步所有离线期间的操作
   - 自动合并双方的修改
   - 显示「离线修改已同步完成」提示

### 重连测试

1. 网络波动导致 P2P 连接断开
2. 系统自动尝试重连（显示「正在重连...」）
3. 重连成功后自动同步双方的操作历史
4. 恢复正常协同编辑

## 🧠 技术架构

### CRDT 算法实现

**核心组件**:
- **`CRDTDocument` 类**: 管理文档内容、操作历史、向量时钟
- **操作类型**: `insert` (字符插入)、`delete` (字符删除)
- **位置调整**: 根据操作时间戳自动调整远程操作的位置
- **向量时钟**: 跟踪每个站点的操作顺序，保证因果一致性

**消息类型**:
```typescript
// 单个操作同步
interface OperationMessage {
  type: 'OPERATION';
  operation: Operation;
  vectorClock: VectorClock;
}

// 全量同步（新成员加入或重连）
interface FullSyncMessage {
  type: 'FULL_SYNC';
  operations: Operation[];
  vectorClock: VectorClock;
}

// 同步请求
interface SyncRequestMessage {
  type: 'SYNC_REQUEST';
}
```

### WebRTC 数据流

1. **信令阶段**: 通过 WebSocket 服务器交换 SDP 和 ICE 候选
2. **P2P 连接**: 建立 RTCPeerConnection 和 RTCDataChannel
3. **操作同步**: 每个字符的插入/删除通过 P2P 通道直接传输
4. **全量同步**: 重连或新成员加入时发送完整操作历史

### 状态管理

- **在线模式**: 实时同步每个操作
- **离线模式**: 缓存所有本地操作到待同步队列
- **重连同步**: 网络恢复后批量同步待操作并合并远程变更

## 📋 技术栈

### 后端
- Node.js
- Express
- ws (WebSocket 库)
- CORS

### 前端
- Vue 3 (Composition API)
- TypeScript
- Vite
- Monaco Editor
- simple-peer (WebRTC 封装)
- localStorage (持久化)

## 🔧 工作原理

### CRDT 协同流程

```
用户 A 编辑                     用户 B 编辑
    │                              │
    ▼                              ▼
记录操作 + 向量时钟            记录操作 + 向量时钟
    │                              │
    └───────────► P2P ◄───────────┘
           │               │
           ▼               ▼
    调整操作位置       调整操作位置
    应用到本地文档     应用到本地文档
    更新向量时钟       更新向量时钟
           │               │
           └─────► 最终一致 ◄─────┘
```

### 离线合并流程

1. **离线检测**: 监听浏览器 `offline` 事件，进入离线模式
2. **操作缓存**: 本地编辑操作存入待同步队列和 localStorage
3. **在线检测**: 监听浏览器 `online` 事件，触发同步流程
4. **同步操作**: 发送所有待同步操作给对等端
5. **合并历史**: 接收远程操作，按时间戳排序并合并到本地文档
6. **状态恢复**: 清除待同步队列，更新 UI 状态

## ⚠️ 注意事项

- 确保两台设备在同一局域网内
- 首次 WebRTC 连接可能需要几秒钟
- 关闭页面将自动离开房间并断开连接
- 目前支持 JavaScript 语言
- localStorage 容量有限，超大文档可能需要优化存储策略

## 🔮 扩展方向

- 支持更多编程语言的语法高亮
- 添加光标位置同步和用户标识
- 实现 Yjs/Automerge 等成熟 CRDT 库集成
- 添加操作历史回放功能
- 支持富文本协同编辑
- 实现多人协同（>2 人）
- 添加冲突解决可视化界面
```
