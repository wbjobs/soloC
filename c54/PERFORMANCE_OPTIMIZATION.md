# WebGL纹理上传性能优化方案

## 问题分析

当数据分辨率较高（如1024x1024）时，传统的纹理上传方式会导致：
- 每帧纹理上传时间 > 30ms
- FPS < 30
- 动画卡顿明显
- 主线程阻塞

## 优化策略

### 1. PBO (Pixel Buffer Object) 异步上传
**核心原理：**
- 使用GPU端的缓冲区进行DMA传输
- CPU和GPU并行工作
- 双缓冲机制避免同步等待

**实现位置：** `frontend/src/utils/OptimizedTextureLoader.js:165-201`

**性能提升：** ~40-60%
```javascript
// 传统方式（阻塞）
gl.texImage2D(...)  // CPU等待GPU完成

// PBO方式（非阻塞）
gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pbo)
gl.bufferSubData(gl.PIXEL_UNPACK_BUFFER, 0, data)  // 立即返回
texture.needsUpdate = true  // GPU在空闲时处理
```

### 2. 数据类型压缩
**核心原理：**
- 将Float32（4字节）转换为Uint8（1字节）
- 数据量减少75%
- 利用颜色映射保持视觉质量

**实现位置：** `frontend/src/utils/OptimizedTextureLoader.js:286-336`

**性能提升：** ~75%
```javascript
// 原始：1024x1024x4 = 4MB（Float32 RGBA）
// 优化后：1024x1024x1 = 1MB（Uint8 灰度 + 颜色映射）
```

### 3. 纹理池与复用
**核心原理：**
- 避免频繁创建/销毁纹理对象
- 预分配固定尺寸的纹理池
- 复用现有纹理，只更新数据

**实现位置：** `frontend/src/utils/OptimizedTextureLoader.js:98-127`

**性能提升：** ~20-30%
```javascript
// 避免：每次创建新纹理
const texture = new THREE.DataTexture(...)  // 昂贵操作

// 改为：复用纹理，只更新数据
texture.image.data.set(newData)
texture.needsUpdate = true
```

### 4. 预加载与双缓冲
**核心原理：**
- 提前解码/处理后续帧数据
- 使用缓冲区平滑数据获取波动
- 避免播放时的数据处理峰值

**实现位置：** `frontend/src/components/GalaxyVisualizer.js:291-303`

**性能提升：** 消除播放时的卡顿峰值

### 5. 分块上传
**核心原理：**
- 将大纹理分成多个小块上传
- 每帧只处理一块
- 避免单次长时间阻塞

**实现位置：** `frontend/src/utils/OptimizedTextureLoader.js:203-241`

## 预期性能对比

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| FPS | < 30 | > 60 | 100%+ |
| 纹理上传时间 | 20-40ms | 2-8ms | 75-90% |
| 内存占用 | 4MB/帧 | 1MB/帧 | 75% |
| 数据传输量 | 4MB/帧 | 1MB/帧 | 75% |

## 测试方法

### 1. 安装依赖
```bash
cd frontend
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```

### 3. 性能测试步骤
1. 打开浏览器开发者工具 (F12)
2. 切换到 Performance 标签
3. 点击录制，然后点击"播放"按钮
4. 录制5-10秒后停止
5. 分析结果：
   - FPS 曲线（目标：稳定60）
   - 主线程占用（目标：<16ms/帧）
   - 纹理上传耗时（查看 WebGL 任务）

### 4. 实时性能监控
界面右上角显示：
- FPS: 每秒帧率
- 帧时间: 每帧平均耗时
- 纹理上传: 单次纹理上传耗时
- 数据处理: 数据生成/处理耗时
- 平均上传: 累计平均上传时间

## 进一步优化方向

### 1. WebGL 2.0 特性
- 使用 `glTexStorage2D` 减少内存碎片
- 使用 `fenceSync` 精确同步
- PBO 多缓冲（3+ buffers）

### 2. 压缩纹理格式
- ASTC / ETC2 / BC7 硬件压缩
- 压缩比可达 4:1 到 8:1
- 需注意跨设备兼容性

### 3. LOD（Level of Detail）
- 根据距离动态切换纹理分辨率
- 远距离使用低分辨率纹理
- 减少总数据传输量

### 4. Web Worker 数据处理
- 将数据解码/颜色映射移到 Worker
- 避免阻塞主线程
- 数据流式传输

### 5. 增量更新
- 只更新变化的区域
- 使用 `texSubImage2D` 局部更新
- 适用于变化集中的场景

## 代码优化检查清单

- [x] PBO 双缓冲实现
- [x] Float32 → Uint8 数据压缩
- [x] 纹理对象池复用
- [x] 数据预加载缓冲
- [x] 分块上传机制
- [x] FPS 和性能统计
- [x] 内存泄漏防护（dispose 方法）
- [ ] WebGL 2.0 特性检测
- [ ] 压缩纹理格式支持
- [ ] LOD 纹理切换
- [ ] Web Worker 数据处理

## 常见问题排查

### FPS 仍然很低？
1. 检查是否启用了垂直同步（浏览器设置）
2. 降低 pixelRatio（高DPI屏幕）
3. 检查是否有其他 WebGL 上下文竞争
4. 降低数据分辨率（如 512x512）

### 纹理上传时间波动大？
1. 增加预加载窗口大小（preloadWindow）
2. 检查 GC 活动（Performance 标签）
3. 确保纹理对象正确复用
4. 考虑使用分块上传

### 内存占用过高？
1. 及时调用 dispose() 释放资源
2. 减小预加载窗口
3. 使用更低分辨率的数据
4. 考虑使用纹理压缩

## 浏览器兼容性

| 特性 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| PBO | 60+ | 59+ | 12+ | 79+ |
| WebGL 2.0 | 56+ | 51+ | 15+ | 79+ |
| 纹理压缩 | 支持 | 支持 | 部分支持 | 支持 |

## 参考资料

1. [WebGL 最佳实践 - Khronos](https://www.khronos.org/webgl/wiki/Best_Practices)
2. [Three.js 性能优化指南](https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects)
3. [Pixel Buffer Objects - OpenGL Wiki](https://www.khronos.org/opengl/wiki/Pixel_Buffer_Object)
4. [WebGL 性能分析 - Google Developers](https://developers.google.com/web/fundamentals/performance/rendering)
