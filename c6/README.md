# 多通道USB音频接口控制面板

基于 Tauri v2 (Rust + React) 的多通道USB音频路由和效果器应用。

## 功能特性

- **设备识别**: 自动识别系统中的所有USB音频设备
  - 显示设备类型（输入/输出/双向）
  - 显示通道数、采样率、缓冲区大小
- **虚拟路由**: 创建灵活的音频路由配置
  - 将任意输入通道路由到任意输出通道
  - 支持多路由并行路由
- **实时效果器**: 每个路由独立效果器
  - 增益调节（-∞ ~ +6dB）
  - 低通滤波器（20Hz - 20kHz）
- **实时电平表**: 使用D3.js可视化
  - 左右声道独立显示
  - 峰值保持和衰减
- **配置持久化**: SQLite本地存储
  - 自动保存和恢复配置

## 技术栈

### 后端 (Rust)
- **Tauri v2**: 跨平台桌面框架
- **cpal**: 跨平台音频I/O
- **dasp**: 数字音频信号处理
- **rusqlite**: SQLite数据库
- **parking_lot**: 高效同步原语
- **crossbeam-channel**: 无锁通道

### 前端 (React)
- **React 18**: 用户界面框架
- **TypeScript**: 类型安全
- **D3.js**: 数据可视化（电平表）
- **Vite**: 构建工具

## 项目结构

```
.
├── src/                    # React前端
│   ├── components/         # React组件
│   │   ├── DeviceList.tsx    # 设备列表
│   │   ├── RoutingManager.tsx # 路由管理
│   │   ├── LevelMeter.tsx  # 电平表
│   │   └── EffectsPanel.tsx # 效果器
│   ├── App.tsx            # 主应用
│   ├── api.ts            # Tauri API封装
│   ├── types.ts          # TypeScript类型
│   └── styles.css       # 样式
└── src-tauri/         # Rust后端
│   ├── src/
│   │   ├── lib.rs      # Tauri命令
│   │   ├── main.rs   # 入口
│   │   ├── audio.rs    # 音频引擎
│   │   ├── database.rs # 数据库
│   │   └── models.rs # 数据模型
│   ├── Cargo.toml    # Rust依赖
│   └── tauri.conf.json # Tauri配置
```

## 安装和运行

### 前置条件

1. **Rust工具链
```bash
# Windows
winget install Rustlang.Rustup

# 或从官网下载安装
# https://rustup.rs/
```

2. **Node.js (v18+**
```bash
# Windows
winget install OpenJS.NodeJS.LTS
```

3. **Windows构建工具（Visual Studio Build Tools 2022 with "Desktop development with C++" 工作负载

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 构建生产版本

```bash
npm run tauri build
```

## 使用说明

1. **查看设备: 启动应用会自动检测系统中的音频设备
2. **创建路由**: 点击"创建新路由"按钮
   - 输入路由名称
   - 选择输入设备和通道
   - 选择输出设备和通道
3. **启动音频**: 点击"启动音频"按钮
4. **调节效果器**: 选择路由并调节增益和低通滤波
5. **实时监控**: 查看电平表显示

## 数据库位置

- **Windows**: `%APPDATA%\USB音频控制面板\routings.db`

## 架构说明

### 音频处理流程

```
输入设备 → 音频线程 → 路由处理 → 效果器 → 输出设备
                    ↓
               电平计算 → 事件发送 → 前端显示
```

### 关键文件说明

- **音频线程**: 独立于UI的实时处理
- **Biquad滤波器**: 二阶IIR滤波器实现低通
- **峰值计**: 带衰减的峰值保持
- **无锁同步**: 使用crossbeam-channel确保低延迟
```

