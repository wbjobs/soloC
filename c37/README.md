# 代码异味检测系统

基于 Embedding 和向量数据库的代码异味检测工具。

## 功能特性

- 克隆 GitHub 仓库并扫描所有 Python 文件
- 使用 AST 解析提取每个函数为代码片段
- 生成代码 Embedding（支持本地 SentenceTransformer 或 OpenAI API）
- 在 ChromaDB 中建立向量索引
- 根据异味描述搜索最相似的函数
- Streamlit Web UI 展示结果

## 安装依赖

```bash
pip install -r requirements.txt
```

## 运行应用

```bash
streamlit run app.py
```

## 使用方法

1. 在左侧输入 GitHub 仓库 URL，点击"扫描仓库"
2. 系统会自动克隆仓库、提取 Python 函数、生成 Embedding 并建立索引
3. 在搜索框输入代码异味描述，或选择预设选项
4. 点击"搜索"查看最相似的 5 个函数位置

## 预设异味描述

- 长函数、代码行数过多
- 重复代码、相似逻辑
- 过多参数、函数参数太多
- 复杂条件判断、嵌套过深
- 命名不清晰、变量名没有意义
- 魔法数字、硬编码的数字
- 过长的类、职责太多

## 配置 OpenAI API（可选）

复制 `.env.example` 为 `.env` 并填入你的 OpenAI API Key：

```
OPENAI_API_KEY=your_api_key_here
```

然后修改 `code_smell_service.py` 中的 `use_local_embeddings=False`

## 项目结构

```
.
├── app.py                 # Streamlit Web UI
├── code_smell_service.py  # 主服务模块
├── repo_scanner.py        # GitHub 仓库克隆和扫描
├── function_extractor.py  # Python 函数提取
├── embedding_generator.py # Embedding 生成
├── chroma_index.py        # ChromaDB 索引和搜索
├── requirements.txt       # 依赖包
└── .env.example          # 环境变量示例
```
