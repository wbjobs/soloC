# 知识阅读器

一个功能强大的桌面电子书阅读器，支持知识图谱构建和智能实体识别。

## 功能特点

- 📚 **多格式支持**: 导入 EPUB、PDF、MOBI 格式电子书
- 🔍 **全文搜索**: 快速搜索所有已导入书籍的内容
- ✍️ **高亮批注**: 支持多种颜色高亮和文本批注
- 🧠 **智能实体识别**: 基于 rust-bert 的命名实体识别（人物、地点、组织等）
- 🕸️ **知识图谱可视化**: 使用 D3.js 可视化展示书籍、批注和实体之间的关系
- 📤 **JSON-LD 导出**: 将知识图谱导出为标准的 JSON-LD 格式

## 技术栈

- **前端**: Tauri + HTML5 + CSS3 + JavaScript + D3.js
- **后端**: Rust
- **数据库**: SQLite (rusqlite)
- **NLP**: rust-bert

## 项目结构

```
knowledge-reader/
├── src/
│   ├── main.js          # 前端主逻辑
│   └── style.css        # 样式文件
├── src-tauri/
│   ├── src/
│   │   ├── main.rs      # Rust 主入口
│   │   ├── lib.rs       # 库文件
│   │   ├── db.rs        # 数据库操作
│   │   ├── extractors.rs # 文件提取器
│   │   ├── nlp.rs       # NLP 处理
│   │   ├── graph.rs     # 知识图谱
│   │   └── commands.rs  # Tauri 命令
│   ├── Cargo.toml       # Rust 依赖配置
│   └── tauri.conf.json  # Tauri 配置
├── package.json         # npm 依赖配置
├── vite.config.js       # Vite 配置
└── index.html           # 入口 HTML
```

## 安装和运行

### 前置要求

1. **Node.js** (v16+) - 已经安装
2. **Rust** - 需要安装，请访问 https://rustup.rs/ 安装
3. **Windows 构建工具** - 通过 Visual Studio 安装

### 安装步骤

1. 安装 npm 依赖（已完成）:
   ```bash
   npm install
   ```

2. 安装 Rust:
   - 访问 https://rustup.rs/
   - 下载并运行 rustup-init.exe
   - 按提示完成安装

3. 启动开发模式:
   ```bash
   npm run tauri dev
   ```

4. 构建生产版本:
   ```bash
   npm run tauri build
   ```

## 使用说明

### 导入书籍

1. 点击工具栏的"导入电子书"按钮
2. 选择 EPUB、PDF 或 MOBI 格式的文件
3. 等待文件解析和导入完成

### 阅读和高亮

1. 从左侧书架选择一本书
2. 在内容区域选中文本
3. 使用弹出的工具栏选择高亮颜色或添加批注

### 添加批注

1. 选中文本后点击"添加批注"按钮
2. 在弹出的对话框中输入批注内容
3. 点击"保存"按钮
4. 系统会自动提取批注和原文中的命名实体

### 知识图谱

1. 在右侧面板的"知识图谱"区域查看
2. 点击"刷新"按钮更新图谱
3. 点击节点查看详细信息
4. 可以拖拽节点调整位置
5. 支持缩放和拖动画布

### 导出图谱

1. 点击工具栏的"导出 JSON-LD"按钮
2. 选择保存位置
3. 图谱数据将以 JSON-LD 格式导出

## 数据库结构

应用数据存储在 SQLite 数据库中，包含以下表：

- **books**: 书籍信息
- **highlights**: 高亮记录
- **annotations**: 批注记录
- **entities**: 命名实体记录

## 实体类型

目前支持的实体类型：
- **PERSON**: 人物
- **LOCATION**: 地点
- **ORGANIZATION**: 组织
- **WORK_OF_ART**: 艺术作品
- **DATE**: 日期

## 注意事项

1. rust-bert 依赖 PyTorch，首次运行时会下载模型
2. 大型 PDF 文件可能需要较长的解析时间
3. 建议首次使用时先导入几本小书测试功能

## 开发说明

- 所有数据存储在用户的应用数据目录下
- 可以通过修改 `src-tauri/src/nlp.rs` 来扩展 NLP 功能
- 前端样式可以在 `src/style.css` 中自定义
- 知识图谱的可视化逻辑在 `src/main.js` 的 `renderGraph` 函数中
