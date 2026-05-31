# 差异表达基因分析平台

基于 Flask + DESeq2 的 Web 差异表达基因分析平台，支持火山图可视化和 KEGG 通路映射。

## 功能特性

- 上传基因表达矩阵和分组信息
- 使用 DESeq2 进行差异表达分析
- 生成交互式火山图（Plotly 渲染）
- 显著性筛选：|log2FC| > 1 且 padj < 0.05
- 点击火山图点查看基因详情
- KEGG 通路映射

## 环境要求

- Python 3.8+
- R 4.0+
- DESeq2 R 包

## 安装步骤

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 2. 安装 R 和 DESeq2

在 R 中执行：

```r
if (!require("BiocManager", quietly = TRUE))
    install.packages("BiocManager")

BiocManager::install("DESeq2")
BiocManager::install("argparse")
```

## 运行应用

```bash
python app.py
```

然后在浏览器中访问：http://localhost:5000

## 使用说明

### 数据格式

1. **表达矩阵 (CSV)**:
   - 行 = 基因
   - 列 = 样本
   - 数值 = 原始计数数据

   示例：
   ```
   ,Sample1,Sample2,Sample3,Sample4
   GeneA,100,120,200,220
   GeneB,50,55,80,85
   ```

2. **分组信息 (CSV)**:
   - 行 = 样本
   - 列 = 分组名称

   示例：
   ```
   ,group
   Sample1,control
   Sample2,control
   Sample3,treatment
   Sample4,treatment
   ```

### 分析流程

1. 上传两个 CSV 文件
2. 点击"开始差异表达分析"按钮
3. 等待 DESeq2 分析完成
4. 查看统计结果、火山图和显著基因列表
5. 点击基因名称或火山图上的点查看详情和 KEGG 通路

## 项目结构

```
.
├── app.py              # Flask 后端应用
├── requirements.txt    # Python 依赖
├── scripts/
│   └── deseq2_analysis.R  # DESeq2 分析脚本
├── templates/
│   └── index.html      # 前端页面
├── static/             # 静态文件
└── data/
    ├── kegg_pathways.json  # KEGG 通路数据库
    ├── example_expression.csv  # 示例表达数据
    └── example_groups.csv     # 示例分组数据
```

## 示例数据

`data/` 目录下提供了示例数据，可以直接用于测试：
- `example_expression.csv`: 示例表达矩阵
- `example_groups.csv`: 示例分组信息

## 扩展 KEGG 数据库

编辑 `data/kegg_pathways.json` 文件添加更多基因的通路信息。

## 技术栈

- **后端**: Flask, Python, R
- **前端**: HTML5, JavaScript, Plotly.js
- **统计分析**: DESeq2
- **可视化**: Plotly 交互式图表
