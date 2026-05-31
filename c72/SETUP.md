# 项目设置指南

## 快速开始

### 1. 安装系统依赖

#### Windows

```powershell
# 1. 安装 Rust
winget install Rustlang.Rustup
# 重启终端后执行
rustup install stable
rustup default stable

# 2. 安装 vcpkg 和 OpenCV
git clone https://github.com/microsoft/vcpkg C:\vcpkg
cd C:\vcpkg
.\bootstrap-vcpkg.bat
.\vcpkg install opencv4:x64-windows
.\vcpkg integrate install

# 3. 设置环境变量
$env:VCPKG_ROOT = "C:\vcpkg"
$env:OPENCV_LINK_LIBS = "opencv_world480"
$env:OPENCV_LINK_PATHS = "C:\vcpkg\installed\x64-windows\lib"
$env:OPENCV_INCLUDE_PATHS = "C:\vcpkg\installed\x64-windows\include"

# 永久设置环境变量（管理员权限）
[Environment]::SetEnvironmentVariable("VCPKG_ROOT", "C:\vcpkg", "Machine")
```

### 2. 初始化 Tauri 项目

```bash
# 由于我们手动创建了文件，建议使用官方方式初始化
# 删除 src-tauri 目录后重新初始化
rm -rf src-tauri

# 使用 Tauri CLI 初始化
npm install
npm run tauri init
```

按照提示回答：
- 项目名称: 视频目标追踪与马赛克处理
- 窗口标题: 视频目标追踪与马赛克处理
- 前端框架: React
- 前端模板: react-ts

### 3. 安装 Tauri 插件

```bash
# 安装 dialog 插件
npm run tauri plugin add dialog
```

### 4. 添加 OpenCV 依赖到 Cargo.toml

在 `src-tauri/Cargo.toml` 中添加：

```toml
[dependencies]
opencv = { version = "0.80", features = ["opencv-480"] }
```

### 5. 复制我们的核心代码

将以下文件复制到对应的位置：
- `src-tauri/src/video_processor.rs` - 视频处理核心模块
- `src-tauri/src/main.rs` - Tauri 主程序
- `src/App.tsx` - React 前端组件
- `src/index.css` - 样式文件

### 6. 运行开发模式

```bash
npm run tauri dev
```

## 替代方案：使用预编译的 OpenCV

如果 vcpkg 编译太慢，可以尝试：

### 方案 A: 使用预编译 OpenCV

```powershell
# 下载预编译的 OpenCV
# 从 https://github.com/opencv/opencv/releases 下载 opencv-4.8.0-windows.exe

# 安装后设置环境变量
$env:OPENCV_DIR = "C:\opencv\build"
$env:PATH += ";C:\opencv\build\x64\vc16\bin"
```

### 方案 B: 使用 cargo 特征自动编译

```toml
# Cargo.toml
opencv = { version = "0.80", features = ["buildtime-bindgen"] }
```

## 常见问题

### 1. OpenCV 找不到

确保环境变量设置正确：
```bash
echo $env:VCPKG_ROOT
echo $env:OPENCV_LINK_PATHS
```

### 2. 链接错误

检查是否使用了正确的架构（x64）：
```bash
rustc -vV
# 确保 host: x86_64-pc-windows-msvc
```

### 3. 编译太慢

可以使用 sccache 加速：
```bash
cargo install sccache
$env:RUSTC_WRAPPER = "sccache"
```

## 验证安装

```bash
# 检查 Rust
rustc --version
cargo --version

# 检查 Node
node --version
npm --version

# 检查 Tauri CLI
npm run tauri -- --version
```

## 开发提示

1. **首次编译**：OpenCV 绑定编译可能需要 10-30 分钟，请耐心等待
2. **增量编译**：后续编译会快很多
3. **日志调试**：Rust 代码中使用 `println!` 或 `dbg!` 输出调试信息
4. **热重载**：前端代码修改后自动热重载，Rust 代码修改需要重新编译

## 下一步

成功运行后，可以：
1. 测试视频上传功能
2. 测试目标框选和追踪
3. 测试视频导出功能
4. 根据需要调整马赛克块大小
5. 尝试不同的追踪算法（KCF, MOSSE 等）