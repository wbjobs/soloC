# Video Editor - Qt + FFmpeg

一个基于Qt 6和FFmpeg的跨平台视频编辑应用。

## 功能特性

### 核心功能
- **媒体库管理**: 支持导入多种视频格式（MP4、AVI、MOV、MKV、WMV等）
- **时间线编辑**: 多轨道视频剪辑，支持剪切、拼接
- **实时预览**: 视频帧实时渲染预览
- **播放控制**: 播放/暂停、快进快退、倍速播放
- **导出功能**: 支持导出为MP4格式（H.264 + AAC）

### 技术架构
- **C++ 核心层**: FFmpeg音视频解码/编码、渲染管线、时间线模型
- **QML UI层**: 现代化用户界面，Material Design风格
- **多线程**: 支持后台解码，保证UI流畅

## 项目结构

```
video-editor/
├── CMakeLists.txt           # CMake构建配置
├── resources.qrc            # Qt资源文件
├── README.md                # 项目文档
├── src/
│   ├── main.cpp             # 程序入口
│   ├── core/
│   │   ├── MediaDecoder.h/cpp    # FFmpeg解码器封装
│   │   ├── MediaEncoder.h/cpp    # FFmpeg编码器封装
│   │   ├── MediaLibrary.h/cpp    # 媒体库模型
│   │   ├── TimelineModel.h/cpp   # 时间线模型
│   │   ├── RenderPipeline.h/cpp  # 渲染管线
│   │   └── PlayerController.h/cpp # 播放器控制器
│   └── qml/
│       └── VideoSurface.h/cpp    # QML视频显示组件
└── qml/
    ├── main.qml             # 主入口QML
    ├── MainWindow.qml       # 主窗口
    ├── TimelineView.qml     # 时间线视图
    ├── PreviewWindow.qml    # 预览窗口
    ├── MediaLibraryPanel.qml # 媒体库面板
    ├── PlayerControls.qml   # 播放器控制
    ├── TrackItem.qml        # 轨道项
    └── ClipItem.qml         # 剪辑项
```

## 依赖要求

### 必选依赖
- **Qt 6.5+**: 需包含以下模块
  - QtCore
  - QtGui
  - QtQml
  - QtQuick
  - QtQuickControls2
  - QtMultimedia
- **FFmpeg 5.0+**: 需包含以下库
  - libavcodec
  - libavformat
  - libavutil
  - libswscale
  - libswresample

### 编译器要求
- Windows: MSVC 2019+ 或 MinGW 11+
- Linux: GCC 11+ 或 Clang 14+
- macOS: Xcode 14+

## 构建说明

### Windows (Visual Studio)

```bash
# 创建构建目录
mkdir build && cd build

# 配置CMake（指定Qt和FFmpeg路径）
cmake .. ^
    -DCMAKE_PREFIX_PATH="C:/Qt/6.5.0/msvc2019_64;C:/FFmpeg" ^
    -DCMAKE_BUILD_TYPE=Release

# 构建
cmake --build . --config Release
```

### Linux

```bash
# 安装依赖（Ubuntu为例）
sudo apt-get install qt6-base-dev qt6-declarative-dev libavcodec-dev libavformat-dev libswscale-dev

# 创建构建目录
mkdir build && cd build

# 配置并构建
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

### macOS

```bash
# 安装依赖（Homebrew）
brew install qt ffmpeg

# 创建构建目录
mkdir build && cd build

# 配置并构建
cmake .. \
    -DCMAKE_PREFIX_PATH="/usr/local/opt/qt" \
    -DCMAKE_BUILD_TYPE=Release
make -j$(sysctl -n hw.ncpu)
```

## 使用说明

1. **导入媒体**: 点击工具栏的"Import"按钮或媒体库面板的"+"按钮
2. **添加到时间线**: 双击媒体库中的视频文件，自动添加到时间线
3. **播放控制**: 使用底部播放控制条进行播放/暂停、拖动进度
4. **导出视频**: 点击工具栏的"Export"按钮进行导出

## 开发计划

- [ ] 支持音频轨道独立编辑
- [ ] 添加视频特效和转场
- [ ] 支持字幕轨道
- [ ] 硬件加速解码/编码
- [ ] 撤销/重做功能
- [ ] 更多导出格式支持

## 许可证

本项目仅供学习和研究使用。
