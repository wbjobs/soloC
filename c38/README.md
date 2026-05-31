# 三维地质模型剖切系统

基于 Three.js 和 Flask 的 Web 3D 地质模型可视化系统，支持动态剖切平面、岩石属性展示和模型交互。

## 功能特性

- **3D 模型加载**: 支持 OBJ 格式三维地质模型加载
- **动态剖切平面**: X/Y/Z 三个方向可拖动剖切平面
- **岩石属性展示**: 实时显示当前切片的岩石物理属性
- **透明度调节**: 剖切平面透明度 0-100% 可调
- **模型交互**: 支持旋转、缩放、平移操作
- **后端预处理**: 自动生成 Y 方向 20 张等距切面纹理

## 技术栈

### 后端
- Python 3.8+
- Flask: Web 框架
- trimesh: 3D 模型处理
- NumPy: 数值计算
- Pillow: 图像处理

### 前端
- Three.js: 3D 渲染引擎
- Vite: 构建工具
- 原生 JavaScript

## 项目结构

```
c38/
├── backend/
│   ├── app.py              # 后端主程序
│   ├── requirements.txt    # Python 依赖
│   └── models/             # 模型文件目录（自动创建）
│
├── frontend/
│   ├── index.html          # 主页面
│   ├── package.json        # npm 依赖
│   ├── vite.config.js      # Vite 配置
│   └── src/
│       └── main.js         # 前端主程序
│
└── README.md
```

## 安装和运行

### 方法一：分别启动（推荐）

#### 1. 启动后端服务

```bash
cd backend
pip install -r requirements.txt
python app.py
```

后端将在 http://localhost:5000 启动

#### 2. 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

前端将在 http://localhost:3000 启动

### 方法二：使用启动脚本（Windows）

创建 `start.bat` 文件：

```batch
@echo off
echo 正在启动三维地质模型剖切系统...
echo.

echo [1/2] 启动后端服务...
start cmd /k "cd backend && pip install -r requirements.txt && python app.py"

timeout /t 5 /nobreak > nul

echo [2/2] 启动前端服务...
start cmd /k "cd frontend && npm install && npm run dev"

echo.
echo 系统启动中，请等待...
echo 后端: http://localhost:5000
echo 前端: http://localhost:3000
pause
```

## API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/model/info` | GET | 获取模型基本信息 |
| `/api/model/obj` | GET | 获取 OBJ 模型文件 |
| `/api/sections/y` | GET | 获取 Y 方向切面数据（含纹理） |
| `/api/rock-properties` | GET | 获取岩石属性（支持 y 参数查询） |

## 使用说明

1. **打开浏览器访问 http://localhost:3000**

2. **模型操作**:
   - 左键拖动: 旋转模型
   - 右键拖动: 平移模型
   - 滚轮: 缩放模型

3. **剖切控制**:
   - X/Y/Z 滑块: 调整对应方向剖切平面位置
   - 透明度滑块: 调整剖切平面的透明度
   - 复选框: 启用/禁用对应方向的剖切

4. **岩石属性**:
   - 左下角面板实时显示当前剖切位置的岩石属性

## 示例数据

系统默认生成多层地质模型示例数据，包括：
- 表土层（0-20m）
- 泥岩层（20-40m）
- 砂岩层（40-60m）
- 灰岩层（60-80m）
- 变质岩层（80-100m）

## 自定义模型

如需使用自己的地质模型：

1. 将 OBJ 格式模型文件放入 `backend/models/` 目录
2. 命名为 `geological_model.obj`
3. 重新启动后端服务

## 浏览器兼容性

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
