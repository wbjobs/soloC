# 🎬 视频字幕编辑器

一个基于 React + Node.js 的桌面级 Web 应用，用于在视频上绘制区域并生成硬字幕。

## ✨ 功能特性

- 📁 **视频上传**: 支持本地视频文件上传
- 🎨 **Canvas 播放**: 在 Canvas 上逐帧渲染视频
- ✏️ **区域绘制**: 在视频画面上绘制矩形区域
- ⏱️ **时间轴控制**: 点击时间轴跳转到任意时间点
- 📝 **Aegisub 字幕**: 生成 ASS 格式字幕文件
- 🎥 **硬字幕烧录**: 使用 FFmpeg 将字幕烧录到视频中
- 📺 **1080p 支持**: 完整支持 1080p 及更高分辨率视频

## 🛠️ 技术栈

### 前端
- React 18
- TypeScript
- Vite
- HTML5 Canvas API

### 后端
- Node.js
- Express
- Multer (文件上传)
- Fluent-FFmpeg (视频处理)

## 📦 安装

### 前置要求
- Node.js 16+
- FFmpeg (必须安装并添加到系统 PATH)

### 安装依赖

```bash
# 安装前端依赖
cd client
npm install

# 安装后端依赖
cd ../server
npm install
```

## 🚀 运行

### 启动后端服务器
```bash
cd server
npm start
# 或开发模式
npm run dev
```

后端将在 http://localhost:4000 运行

### 启动前端开发服务器
```bash
cd client
npm run dev
```

前端将在 http://localhost:3000 运行

## 📖 使用说明

1. **上传视频**: 点击"上传视频文件"按钮选择本地视频
2. **播放控制**: 使用播放/暂停按钮控制视频
3. **开始绘制**: 点击"开始绘制"按钮启用绘制模式
4. **绘制区域**: 在 Canvas 上拖拽鼠标绘制矩形
5. **查看区域**: 在时间轴下方查看所有已绘制区域
6. **导出视频**: 点击"开始导出"生成带字幕的视频

## 📂 项目结构

```
c62/
├── client/                 # 前端 React 应用
│   ├── src/
│   │   ├── App.tsx        # 主应用组件
│   │   ├── main.tsx       # 入口文件
│   │   ├── types.ts       # TypeScript 类型定义
│   │   └── index.css      # 样式文件
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── server/                 # 后端 Node.js 服务
    ├── server.js          # Express 服务器
    ├── subtitleGenerator.js  # ASS 字幕生成器
    └── package.json
```

## 🔧 工作流程

1. 用户在前端上传视频并绘制区域
2. 区域数据（坐标 + 时间戳）发送到后端
3. 后端生成 Aegisub (ASS) 格式字幕文件
4. FFmpeg 读取视频和字幕，烧录硬字幕
5. 处理完成的视频返回给前端下载

## ⚠️ 注意事项

- 确保 FFmpeg 已正确安装并在系统 PATH 中
- 大视频文件处理可能需要较长时间
- 建议使用 Chrome 或 Edge 浏览器以获得最佳体验
- 导出时请不要关闭浏览器窗口
