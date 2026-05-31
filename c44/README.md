# SPH 流体力学模拟器

基于 Rust + WebAssembly + Three.js 的 3D 光滑粒子流体动力学模拟器。

## 功能特性

- **Rust 实现核心 SPH 算法**：计算粒子的密度、压力、速度和位置
- **WebAssembly 高性能计算**：通过 wasm-bindgen 与 JavaScript 交互
- **Three.js 3D 实时渲染**：炫酷的粒子流体效果
- **交互式粒子添加**：鼠标点击添加新粒子
- **边界碰撞检测**：粒子与容器边界的碰撞响应

## 项目结构

```
c44/
├── Cargo.toml          # Rust 项目配置
├── src/
│   └── lib.rs          # SPH 算法实现
├── index.html          # 前端 HTML
├── app.js              # Three.js 渲染和交互逻辑
└── README.md
```

## 前置要求

1. **Rust 工具链**：安装 [Rust](https://www.rust-lang.org/tools/install)
2. **wasm-pack**：用于编译 Rust 到 WebAssembly
   ```bash
   cargo install wasm-pack
   ```
3. **本地 HTTP 服务器**：如 Python 的 http.server 或 Node.js 的 http-server

## 构建步骤

### 1. 编译 Rust 为 WebAssembly

在项目根目录运行：

```bash
wasm-pack build --target web
```

这会在 `pkg/` 目录生成 WASM 模块和 JavaScript 绑定文件。

### 2. 启动本地服务器

使用 Python 3：
```bash
python -m http.server 8080
```

或使用 Node.js 的 http-server：
```bash
npx http-server -p 8080
```

### 3. 在浏览器中访问

打开浏览器访问 `http://localhost:8080`

## SPH 算法实现

### 核心物理量

- **粒子质量 (PARTICLE_MASS)**: 1.0
- **光滑半径 (SMOOTHING_RADIUS)**: 30.0
- **静止密度 (REST_DENSITY)**: 1000.0
- **气体常数 (GAS_CONSTANT)**: 2000.0
- **粘度 (VISCOSITY)**: 250.0
- **重力加速度 (GRAVITY)**: -980.0

### 计算步骤

1. **密度和压力计算**：使用 Poly6 核函数计算每个粒子的密度，再通过状态方程计算压力
2. **力计算**：使用 Spiky 核函数计算压力，使用粘性核函数计算粘滞力
3. **积分更新**：使用欧拉积分更新粒子速度和位置
4. **边界处理**：粒子碰到边界时反弹并损失能量

## 使用说明

1. **观看演示**：程序启动时会自动生成 100 个粒子
2. **添加粒子**：在 3D 视图中点击鼠标，会在点击位置添加 10 个新粒子
3. **观察效果**：粒子会在重力作用下下落，相互作用形成流体效果
4. **相机自动旋转**：相机会自动围绕流体容器旋转，提供不同视角

## 技术栈

- **Rust**：高性能数值计算
- **WebAssembly**：浏览器端原生速度执行
- **wasm-bindgen**：Rust 与 JavaScript 互操作
- **Three.js**：WebGL 3D 渲染
- **wee_alloc**：轻量级 WASM 内存分配器

## 性能优化建议

- **空间分区**：对于大量粒子（>500），实现网格空间分区减少粒子对检测数量
- **SIMD 优化**：使用 Rust 的 SIMD 指令加速向量运算
- **Web Workers**：将物理计算移至 Worker 线程，避免阻塞主线程
- **减少 JS/WASM 通信**：使用共享内存批量传输粒子数据

## 许可证

MIT
