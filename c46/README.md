# 剪贴板历史管理器

一个基于 Electron + React 开发的跨平台剪贴板历史管理器桌面应用。

## 功能特性

1. **后台运行**：应用在后台运行，实时监听系统剪贴板变化
2. **记录内容**：记录所有复制的文本、图片和文件路径
3. **快捷键唤起**：使用 `Ctrl+Shift+V` (Windows/Linux) 或 `Cmd+Shift+V` (Mac) 唤起悬浮窗口
4. **一键复制**：点击历史记录即可一键复制回系统剪贴板
5. **本地持久化**：历史记录支持本地持久化存储
6. **搜索功能**：支持搜索剪贴板历史记录
7. **黑名单应用**：支持设置黑名单应用，不记录来自指定应用的剪贴板内容

## 技术栈

- **Electron**：跨平台桌面应用框架
- **React 18**：前端框架
- **Vite**：构建工具
- **electron-store**：本地数据存储

## 安装和运行

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run electron:dev
```

### 构建生产版本

```bash
npm run electron:build
```

## 使用说明

1. 启动应用后，应用会在后台运行，系统托盘会显示应用图标
2. 使用快捷键 `Ctrl+Shift+V` 唤起剪贴板历史窗口
3. 点击任意历史记录即可复制到剪贴板
4. 在搜索框中输入关键词可以搜索历史记录
5. 在黑名单标签页可以添加/移除黑名单应用

## 项目结构

```
.
├── electron/
│   └── main.js          # Electron 主进程
├── src/
│   ├── components/
│   │   ├── ClipboardList.jsx  # 剪贴板历史列表
│   │   └── Blacklist.jsx      # 黑名单管理
│   ├── App.jsx          # 主应用组件
│   ├── main.jsx         # 入口文件
│   └── index.css        # 样式文件
├── assets/              # 资源文件
├── index.html           # HTML 模板
├── vite.config.js       # Vite 配置
└── package.json         # 项目配置
```

## 注意事项

- 应用最多保存 500 条剪贴板历史记录
- 黑名单功能目前仅支持手动输入应用名称