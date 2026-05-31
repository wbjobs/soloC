# 星系演化三维可视化系统

高性能科学数据可视化系统，包含C++后端数据服务和Vue 3 + WebGL前端可视化。支持切片可视化和体绘制（Volume Rendering）两种渲染模式。

## 功能特性

### 渲染模式

1. **切片模式 (Slice Rendering)**
   - X/Y/Z 三个轴的二维切片
   - 可调整切片位置
   - 高性能纹理上传优化

2. **体渲染模式 (Volume Rendering)**
   - 基于 Ray Marching 算法的直接体渲染
   - 半透明三维结构可视化

3. **最大密度投影 (MIP - Maximum Intensity Projection)**
   - 沿视线方向的最大密度投影
   - 高亮显示高密度区域

4. **等值面渲染 (ISO - Isosurface Rendering)**
   - 基于等值阈值的表面提取
   - Phong 光照模型

### 后端
- 🚀 高性能 C++ Drogon 框架
- 📊 HDF5 科学数据读取
- 🔪 三维数据切片服务
- 📈 MIP 最大密度投影算法
- ⚡ 零拷贝数据传输

### 前端
- 🎨 WebGL + Three.js 渲染
- 📈 高分辨率纹理优化
- 🎮 3D 视角交互（旋转/平移/缩放）
- ⏱️ 时间轴动画播放
- 📊 实时性能监控

## 项目结构

```
.
├── backend/                      # C++ Drogon 后端
│   ├── CMakeLists.txt
│   ├── package.json
│   └── src/
│       ├── main.cpp
│       ├── DataReader.h/cpp    # HDF5 数据读取
│       ├── DataSliceController.h/cpp  # API 控制器
│       └── MIPGenerator.h/cpp   # 最大密度投影算法
├── frontend/                     # Vue 3 + Three.js 前端
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── App.vue
│       ├── main.js
│       ├── style.css
│       ├── components/
│       │   ├── GalaxyVisualizer.js    # 主可视化组件
│       │   └── VolumeRenderer.js      # 体渲染器
│       ├── utils/
│       │   ├── OptimizedTextureLoader.js  # 优化纹理上传
│       │   └── VolumeDataGenerator.js    # 体数据生成
│       └── shaders/
│           ├── volumeVertex.glsl     # 体渲染顶点着色器
│           └── volumeFragment.glsl     # 体渲染片元着色器（Ray Marching算法
├── data/                         # HDF5 数据文件
├── README.md
└── PERFORMANCE_OPTIMIZATION.md   # 性能优化文档
```

## 快速开始

### 前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

### 后端（可选）

**依赖：**
- C++17 编译器
- Drogon 框架
- HDF5 C++ 库

```bash
cd backend
npm run build
npm run dev
```

服务启动在 http://localhost:8080

## 体渲染算法说明

### Ray Marching 光线步进算法

前端使用 WebGL 实现的光线步进算法：

1. **光线-立方体相交测试
2. **沿光线步进采样体数据
3. **颜色累积和不透明度合成
4. **梯度计算用于光照

### 着色器 Uniform 参数

- `uIsoValue` - 等值阈值（0.01 - 1.0）
- `uStepSize` - 步长大小（0.001 - 0.05）
- `uMaxSteps` - 最大步数（32 - 256）
- `uOpacity` - 不透明度（0.1 - 1.0）
- `uColorLow/uColorHigh` - 颜色映射

## API 接口

### 获取数据信息
```
GET /api/info
返回:
{
  "timesteps": 100,
  "dimX": 512,
  "dimY": 512,
  "dimZ": 512
}
```

### 获取数据切片
```
GET /api/slice?axis=Z&position=256&timestep=0
返回:
{
  "width": 512,
  "height": 512,
  "data": [...]  // 归一化密度数据
}
```

### 获取 MIP 最大密度投影
```
GET /api/mip?axis=Z&timestep=0
返回:
{
  "width": 512,
  "height": 512,
  "axis": "Z",
  "data": [...]  // MIP 投影数据
}
```

## 性能优化

详细优化方案请参考 [PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md)

### 核心优化
1. **PBO 异步纹理上传** - 40-60% 性能提升
2. **数据类型压缩** - 75% 数据量减少 (Float32 → Uint8)
3. **纹理池复用** - 避免频繁创建/销毁
4. **数据预加载** - 消除播放卡顿峰值
5. **分块上传** - 避免主线程长时间阻塞

### 预期性能
| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| FPS | < 30 | > 60 |
| 纹理上传 | 20-40ms | 2-8ms |
| 内存占用 | 4MB/帧 | 1MB/帧 |

## 使用说明

### 切换渲染模式
点击底部控制面板中的按钮切换：
- **切片**: 二维切片渲染
- **体渲染**: 直接体渲染
- **MIP**: 最大密度投影
- **等值面**: 等值面渲染

### 体渲染参数调整
- **等值线阈值: 控制等值面提取的密度阈值
- **步进大小**: 光线步进采样间隔（较小=更精确，更慢）
- **最大步数**: 光线最大采样步数
- **不透明度**: 整体不透明度

### 坐标轴切换（切片模式）
点击 X/Y/Z 按钮切换切片方向

### 切片位置（切片模式）
拖动滑块调整切片在当前轴上的位置

### 时间轴控制
- 点击"播放"按钮开始动画
- 拖动时间滑块跳转到指定时间步
- 调整播放速度 (0.1x - 5x)

### 性能监控
右上角实时显示：
- FPS: 每秒帧率
- 帧时间: 每帧平均耗时
- 纹理上传: GPU 上传耗时
- 数据处理: 数据生成/处理耗时

## 数据格式

系统支持标准 HDF5 格式，数据集结构：
```
/density  shape=(timesteps, dimX, dimY, dimZ), type=float32
```

### 生成测试数据
可以使用 Python 生成测试数据：
```python
import h5py
import numpy as np

with h5py.File('data/galaxy.h5', 'w') as f:
    f.create_dataset('density', shape=(100, 512, 512, 512), dtype=np.float32)
```

## 浏览器兼容性

- Chrome 60+
- Firefox 59+
- Safari 12+
- Edge 79+

## 许可证

MIT
