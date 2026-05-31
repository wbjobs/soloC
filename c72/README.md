# 视频目标追踪与马赛克处理

基于 Tauri v2 + React + TypeScript + OpenCV 的桌面应用，实现视频目标追踪和动态马赛克处理。

## 功能特性

- 📹 **视频上传**: 支持 MP4, AVI, MOV, MKV 等格式
- 🖱️ **框选目标**: 在视频帧上用鼠标框选需要追踪的目标
- 🎯 **智能追踪**: 使用 OpenCV CSRT 算法实现高精度目标追踪
- 🎨 **动态马赛克**: 对追踪到的目标区域自动添加马赛克效果
- ⚡ **实时预览**: 播放视频和进度实时显示
- 💾 **导出视频**: 支持导出处理后的 MP4 视频

## 技术栈

### 后端 (Rust)
- **Tauri v2**: 桌面应用框架
- **OpenCV**: 计算机视觉库，提供视频编解码和目标追踪
- **tokio**: 异步运行时

### 前端 (React)
- **React 18**: UI 框架
- **TypeScript**: 类型安全
- **Vite**: 构建工具
- **Canvas API**: 视频帧渲染

## 前置依赖

### 1. Rust 环境
```bash
# 安装 Rustup
# Windows: 从 https://rustup.rs/ 下载并运行 rustup-init.exe
# 或使用 winget:
winget install Rustlang.Rustup

# 安装 Rust 工具链
rustup install stable
rustup default stable
```

### 2. OpenCV 环境 (Windows)
```bash
# 使用 vcpkg 安装 OpenCV
git clone https://github.com/microsoft/vcpkg
cd vcpkg
bootstrap-vcpkg.bat
vcpkg install opencv4:x64-windows
vcpkg integrate install

# 设置环境变量
# 或者在 Cargo.toml 中配置
```

### 3. Node.js
```bash
# 确保安装 Node.js 18+
node --version
npm --version
```

## 安装与运行

### 1. 安装依赖
```bash
# 安装 npm 依赖
npm install

# 安装 Tauri CLI
npm install -g @tauri-apps/cli
```

### 2. 开发模式运行
```bash
npm run tauri dev
```

### 3. 构建生产版本
```bash
npm run tauri build
```

## 使用说明

1. **上传视频**: 点击上传区域选择视频文件
2. **预览视频**: 使用播放控制和滑块浏览视频
3. **选择目标**: 在需要的帧上用鼠标拖选要追踪的目标
4. **设置追踪**: 点击"设为追踪目标"按钮初始化追踪器
5. **开始处理**: 点击"开始处理并导出"选择输出路径
6. **等待完成**: 查看进度条，处理完成后视频自动导出

## 项目结构

```
.
├── src/                      # React 前端代码
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx             # 入口文件
│   └── index.css            # 样式文件
├── src-tauri/               # Rust 后端代码
│   ├── src/
│   │   ├── main.rs          # Tauri 主程序
│   │   └── video_processor.rs # 视频处理核心模块
│   ├── Cargo.toml           # Rust 依赖配置
│   └── tauri.conf.json      # Tauri 配置
├── index.html               # HTML 入口
├── package.json             # npm 依赖
├── tsconfig.json            # TypeScript 配置
└── vite.config.ts           # Vite 配置
```

## 核心算法说明

### CSRT 目标追踪
CSRT (Channel and Spatial Reliability Tracker) 是一种高精度的目标追踪算法：
- 基于判别相关滤波器
- 支持多通道特征和空间可靠性图
- 适合追踪外观变化较小的目标（如人脸、车牌）

### 动态马赛克
- 将追踪到的目标区域分成固定大小的块
- 计算每个块内像素的平均值
- 用平均值填充整个块，实现马赛克效果
- 块大小可调整以控制马赛克程度

## 注意事项

1. **OpenCV 依赖**: 首次构建可能需要较长时间编译 OpenCV 绑定
2. **视频编码**: 输出视频使用 H.264 编码，确保系统支持
3. **性能**: 高分辨率视频处理可能较慢，建议先降低分辨率
4. **追踪效果**: 目标快速运动或遮挡时可能追踪失败，需要重新选择

## 故障排除

### OpenCV 编译错误
```bash
# 确保 vcpkg 路径正确
# 或使用预编译的 OpenCV 包
```

### Rust 工具链问题
```bash
rustup update
rustc --version
```

### 视频无法打开
- 检查视频文件格式是否支持
- 确保视频编解码器已安装

## License

MIT