# 3D户型图光照模拟工具

基于 Three.js + React + Node.js 的 3D 户型图光照模拟系统，支持 PBR 物理渲染、太阳光模拟、室内灯光配置、阴影效果渲染。

## 功能特性

### 核心功能
- ✅ **3D 模型导入** - 支持 GLB、GLTF、OBJ 格式户型图模型
- ✅ **PBR 物理光照** - 基于物理的渲染，真实光影效果
- ✅ **太阳光模拟** - 可配置太阳高度角、方位角、时间、强度、颜色
- ✅ **室内灯光** - 支持点光源、聚光灯、平行光多种类型
- ✅ **阴影渲染** - 可调节阴影质量，支持接触阴影
- ✅ **环境光配置** - 可调节环境光强度和颜色

### 数据管理
- ✅ **户型图管理** - 上传、删除、切换户型图
- ✅ **光照配置保存** - 保存多个光照方案，随时加载
- ✅ **渲染结果导出** - 导出当前渲染结果为 PNG 图片

## 技术栈

### 前端
- **React 18** - UI 框架
- **Three.js** - 3D 渲染引擎
- **@react-three/fiber** - Three.js React 封装
- **@react-three/drei** - Three.js 常用组件库
- **Ant Design** - UI 组件库
- **Axios** - HTTP 客户端

### 后端
- **Node.js** - 运行环境
- **Express.js** - Web 框架
- **MongoDB** - 数据库
- **Mongoose** - ODM 工具
- **Multer** - 文件上传处理

## 项目结构

```
c96/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── models/         # 数据模型
│   │   │   ├── FloorPlan.js
│   │   │   ├── LightingConfig.js
│   │   │   └── RenderTask.js
│   │   ├── controllers/    # 控制器
│   │   ├── routes/         # 路由
│   │   └── server.js       # 服务器入口
│   ├── uploads/            # 上传文件存储
│   ├── package.json
│   └── .env
├── frontend/               # 前端应用
│   ├── public/
│   ├── src/
│   │   ├── components/     # React 组件
│   │   │   ├── Scene3D.jsx
│   │   │   ├── LightingPanel.jsx
│   │   │   └── Sidebar.jsx
│   │   ├── services/       # API 服务
│   │   ├── utils/          # 工具函数
│   │   ├── App.jsx
│   │   └── index.js
│   └── package.json
└── shared/                 # 共享资源
```

## 安装与运行

### 环境要求
- Node.js >= 16.0.0
- MongoDB >= 4.0

### 后端启动

```bash
cd backend
npm install
npm run dev
```

后端服务将在 http://localhost:5000 启动

### 前端启动

```bash
cd frontend
npm install
npm start
```

前端应用将在 http://localhost:3000 启动

## API 接口文档

### 户型图接口
- `GET /api/floorplans` - 获取所有户型图
- `GET /api/floorplans/:id` - 获取单个户型图
- `POST /api/floorplans` - 上传户型图（multipart/form-data）
- `DELETE /api/floorplans/:id` - 删除户型图

### 光照配置接口
- `GET /api/lighting-configs?floorPlanId=xxx` - 获取指定户型图的配置
- `GET /api/lighting-configs/:id` - 获取单个配置
- `POST /api/lighting-configs` - 创建配置
- `PUT /api/lighting-configs/:id` - 更新配置
- `DELETE /api/lighting-configs/:id` - 删除配置

### 渲染任务接口
- `GET /api/render-tasks` - 获取所有渲染任务
- `POST /api/render-tasks` - 创建渲染任务
- `PUT /api/render-tasks/:id` - 更新任务状态

## 使用说明

### 1. 上传户型图
- 点击左侧"上传户型图"按钮
- 选择 GLB/GLTF/OBJ 格式的 3D 模型文件
- 上传完成后在下拉列表中选择该户型图

### 2. 配置光照参数
- **太阳光**：启用/禁用，调节强度、高度角、方位角、时间、颜色
- **环境光**：启用/禁用，调节强度、颜色
- **室内灯光**：添加多个灯光，选择类型（点/聚光/平行光），调节位置、强度、颜色
- **阴影**：启用/禁用，调节阴影质量（低/中/高）

### 3. 保存与加载配置
- 配置完成后点击"保存光照配置"按钮
- 在左侧"保存的配置"列表中点击"加载"恢复配置

### 4. 导出渲染结果
- 调整好视角后，点击"导出渲染图片"按钮
- 将自动下载当前 3D 场景的 PNG 图片

## 光照参数说明

### 太阳光参数
- **高度角 (0-90°)**：太阳相对于地平线的高度，90°为正午
- **方位角 (0-360°)**：太阳在水平面上的方向，0°为正北，180°为正南
- **时间预设**：快速选择日出、上午、正午、下午、日落、夜晚

### 室内灯光类型
- **点光源**：从一个点向所有方向发射光线，类似灯泡
- **聚光灯**：从一个点向特定方向发射锥形光线，类似手电筒
- **平行光**：沿特定方向发射平行光线，类似太阳光

## 数据模型

### FloorPlan（户型图）
```javascript
{
  name: String,
  description: String,
  fileUrl: String,
  fileType: 'glb' | 'gltf' | 'obj',
  createdAt: Date
}
```

### LightingConfig（光照配置）
```javascript
{
  name: String,
  floorPlanId: ObjectId,
  sunLight: {
    enabled: Boolean,
    intensity: Number,
    color: String,
    elevation: Number,
    azimuth: Number,
    timeOfDay: String
  },
  ambientLight: {
    enabled: Boolean,
    intensity: Number,
    color: String
  },
  indoorLights: [{
    id: String,
    name: String,
    type: 'point' | 'spot' | 'directional',
    position: { x, y, z },
    target: { x, y, z },
    intensity: Number,
    color: String,
    enabled: Boolean
  }],
  shadow: {
    enabled: Boolean,
    quality: 'low' | 'medium' | 'high'
  }
}
```

## 性能优化建议

1. **阴影质量**：在性能较低的设备上，建议使用"低"质量阴影
2. **灯光数量**：室内灯光数量建议控制在 10 个以内
3. **模型面数**：上传的户型图模型面数建议控制在 10 万面以内

## 后续扩展计划

- [ ] 视频渲染导出
- [ ] 光照动画时间轴
- [ ] 材质编辑功能
- [ ] 多人协作编辑
- [ ] 云端渲染队列
- [ ] VR/AR 支持

## 许可证

MIT License
