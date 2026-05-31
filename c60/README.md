# 虚拟博物馆 WebXR 应用

## 项目简介

这是一个基于 React + Three.js + WebXR 的虚拟博物馆应用，后端使用 NestJS 管理文物数据。用户可以在浏览器或VR设备中自由浏览博物馆展品。

## 项目结构

```
c60/
├── backend/          # NestJS 后端
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── artifacts/    # 文物模块
│   └── package.json
└── frontend/         # React + Three.js 前端
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   └── types.ts
    └── package.json
```

## 功能特性

### 后端功能
- RESTful API 提供文物列表和详情
- 管理文物元数据（名称、年代、描述、3D模型URL）
- 静态资源服务（3D模型、音频）
- CORS 跨域支持

### 前端功能
- WebXR 支持，可在VR头显中运行
- 第一人称视角控制（WASD/方向键移动，鼠标拖拽旋转）
- 博物馆3D场景（地板、墙壁、灯光）
- 文物展品展示
- 靠近文物时显示信息面板和文物名称
- 自动语音解说（使用 Web Speech API）
- 响应式设计

## 快速开始

### 安装依赖

#### 后端
```bash
cd backend
npm install
```

#### 前端
```bash
cd frontend
npm install
```

### 启动开发服务器

#### 启动后端 (端口 3001)
```bash
cd backend
npm run start:dev
```

#### 启动前端 (端口 3000)
```bash
cd frontend
npm run dev
```

### 访问应用

在浏览器中打开: `http://localhost:3000`

## API 接口

### 获取所有文物
```
GET /artifacts
```

响应示例:
```json
[
  {
    "id": "uuid",
    "name": "青铜鼎",
    "era": "商代",
    "description": "文物描述...",
    "modelUrl": "/assets/models/bronze_ding.glb",
    "position": { "x": -3, "y": 0, "z": -5 },
    "scale": 1.5,
    "audioUrl": "/assets/audio/bronze_ding.mp3"
  }
]
```

### 获取单个文物
```
GET /artifacts/:id
```

## 使用说明

### 桌面浏览器操作
- **W/↑**: 向前移动
- **S/↓**: 向后移动
- **A/←**: 向左移动
- **D/→**: 向右移动
- **鼠标拖拽**: 旋转视角

### VR 设备
- 点击页面上的 "Enter VR" 按钮进入VR模式
- 使用VR控制器进行移动和交互

### 语音解说
- 靠近文物（距离小于3米）自动播放语音解说
- 使用浏览器内置的 Web Speech API

## 技术栈

### 后端
- Node.js
- NestJS
- TypeScript
- UUID

### 前端
- React 18
- TypeScript
- Three.js
- @react-three/fiber (React Three Fiber)
- @react-three/drei (辅助组件库)
- @react-three/xr (WebXR 支持)
- Vite (构建工具)

## 扩展建议

1. **添加真实的 3D 模型**:
   - 将 glTF/GLB 格式的3D模型放入 `backend/public/models/` 目录
   - 更新 `artifact.service.ts` 中的 `modelUrl` 字段
   - 使用 `@react-three/drei` 的 `useGLTF` 加载器加载模型

2. **添加真实音频文件**:
   - 将音频文件放入 `backend/public/audio/` 目录
   - 更新 `artifact.service.ts` 中的 `audioUrl` 字段

3. **添加更多文物**:
   - 在 `artifacts.service.ts` 中添加更多文物数据
   - 可以连接真实数据库（如 PostgreSQL、MongoDB）

4. **增强交互功能**:
   - 添加点击文物放大查看
   - 添加文物旋转动画
   - 添加手部追踪交互

5. **优化博物馆场景**:
   - 添加柱子、装饰画等细节
   - 添加天花板
   - 使用更真实的材质和纹理

## 注意事项

- WebXR 需要 HTTPS 环境或 localhost
- 语音解说需要浏览器支持 Web Speech API
- 3D 模型加载可能需要额外的性能优化
