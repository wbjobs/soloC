# 多模态古籍文字识别与修复系统

## 项目简介

这是一个基于 Vue3 + FastAPI 的古籍文字识别与修复系统，提供 OCR 文字识别、图像修复和批量导出等功能。

## 功能特性

### 1. OCR 文字识别
- 支持全文识别和局部放大识别
- 可框选图片区域进行局部识别
- 显示识别置信度和边界框信息

### 2. 图像修复
- 去噪处理
- 污渍修复（图像补全）
- 图像增强
- 实时进度显示

### 3. 批量导出
- 支持导出为 TXT 格式
- 支持导出为 Markdown 格式
- 可选择多张图片批量导出

## 项目结构

```
├── backend/              # 后端服务
│   ├── main.py          # FastAPI 主应用
│   ├── database.py      # 数据库模型
│   └── requirements.txt # 依赖包
├── frontend/             # 前端应用
│   ├── src/
│   │   ├── App.vue      # 主组件
│   │   └── main.js      # 入口文件
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── ai_models/            # AI 模型模块
│   ├── ocr_engine.py    # OCR 识别引擎
│   └── restoration_engine.py # 修复引擎
├── uploads/              # 上传文件目录
└── outputs/              # 输出文件目录
```

## 快速开始

### 后端启动

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端服务将在 http://localhost:8000 启动

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 http://localhost:3000 启动

## API 接口文档

启动后端后，访问 http://localhost:8000/docs 查看完整的 API 文档

## 使用说明

1. **上传图片**：在左侧上传区域拖拽或点击上传古籍图片
2. **选择图片**：在图片列表中点击选择要处理的图片
3. **OCR 识别**：
   - 点击"全文识别"对整张图片进行识别
   - 在图片上框选区域，点击"局部识别"进行局部放大识别
4. **图像修复**：选择修复类型，点击"开始修复"，实时查看进度
5. **批量导出**：在"批量导出"标签页选择图片和导出格式，点击导出
