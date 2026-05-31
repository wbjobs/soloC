# Genome Alignment Browser

一个全栈的基因组序列比对可视化工具，支持FASTA/FASTQ文件上传、minimap2比对、以及类似IGV的交互式浏览器。

## 功能特性

### 后端 (Python/FastAPI)
- ✅ RESTful API接收用户上传的参考基因组(FASTA)和待测序列(FASTQ)
- ✅ 集成minimap2进行序列比对
- ✅ 使用pysam解析SAM/BAM格式文件
- ✅ 返回比对结果的JSON数据，包含CIGAR和MD标签解析

### 前端 (React + TypeScript)
- ✅ 文件上传界面
- ✅ 基于Canvas的交互式基因组浏览器
- ✅ 可缩放和平移的可视化画布
- ✅ 显示参考序列和比对结果
- ✅ 可视化插入、删除和错配变异
- ✅ 支持正反向链颜色区分

## 项目结构

```
c51/
├── backend/
│   ├── main.py          # FastAPI主应用
│   ├── requirements.txt # Python依赖
│   └── uploads/         # 上传文件目录（自动创建）
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── FileUpload.tsx      # 文件上传组件
    │   │   └── GenomeBrowser.tsx   # 基因组浏览器组件
    │   ├── types.ts     # TypeScript类型定义
    │   ├── App.tsx      # 主应用组件
    │   ├── main.tsx     # 入口文件
    │   └── index.css    # 样式文件
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── ...
```

## 环境要求

### 后端
- Python 3.8+
- minimap2 (需要安装并添加到PATH)
- htslib (pysam依赖)

### 前端
- Node.js 16+
- npm或yarn

## 安装和运行

### 1. 后端安装

```bash
cd backend

# 安装Python依赖
pip install -r requirements.txt

# 安装minimap2 (如果还没有安装)
# Ubuntu/Debian:
sudo apt install minimap2

# macOS (使用Homebrew):
brew install minimap2

# Windows: 从 https://github.com/lh3/minimap2/releases 下载并添加到PATH

# 启动后端服务
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

后端API将在 http://localhost:8000 运行

API文档: http://localhost:8000/docs

### 2. 前端安装

```bash
cd frontend

# 安装Node.js依赖
npm install

# 启动开发服务器
npm run dev
```

前端将在 http://localhost:5173 运行 (或其他可用端口)

## 使用说明

1. **上传文件**
   - 点击"Reference Genome (FASTA)"选择参考基因组文件 (.fasta, .fa, .fna)
   - 点击"Query Sequences (FASTQ)"选择待测序列文件 (.fastq, .fq)

2. **开始比对**
   - 点击"Start Alignment"按钮开始比对
   - 比对过程中按钮会显示"Aligning..."
   - 比对完成后会自动显示浏览器界面

3. **浏览器操作**
   - **缩放**: 使用鼠标滚轮或点击"Zoom In/Out"按钮
   - **平移**: 按住鼠标左键在画布上拖动
   - **重置视图**: 点击"Reset View"按钮恢复默认视图
   - **图例**: 底部显示各种颜色代表的含义

## 可视化说明

- **蓝色 (#00d4ff)**: 正链比对 (Forward Strand)
- **橙色 (#f97316)**: 反链比对 (Reverse Strand)
- **紫色 (#a855f7)**: 插入 (Insertion)
- **红色 (#ef4444)**: 删除 (Deletion)
- **黄色 (#fbbf24)**: 错配 (Mismatch)
- **碱基颜色**:
  - A: 绿色
  - T: 红色
  - G: 黄色
  - C: 蓝色
  - N: 灰色

## API端点

### POST /api/align
上传文件并执行比对

**请求参数:**
- `reference`: 参考基因组FASTA文件
- `query`: 待测序列FASTQ文件

**响应示例:**
```json
{
  "success": true,
  "data": {
    "reference_sequences": {
      "chr1": "ATCG..."
    },
    "alignments": [
      {
        "query_name": "read1",
        "reference_name": "chr1",
        "reference_start": 100,
        "reference_end": 250,
        "mapping_quality": 60,
        "cigar": [{"type": "M", "length": 150}],
        "query_sequence": "ATCG...",
        "query_qualities": [30, 35, ...],
        "is_reverse": false,
        "mismatches": [{"type": "mismatch", "pos": 10, "ref_base": "A"}]
      }
    ],
    "total_reads": 1
  }
}
```

### GET /api/health
健康检查

## 技术栈

### 后端
- **FastAPI**: 高性能Web框架
- **pysam**: SAM/BAM文件处理
- **minimap2**: 序列比对工具
- **uvicorn**: ASGI服务器

### 前端
- **React 18**: UI框架
- **TypeScript**: 类型安全
- **Vite**: 构建工具
- **Canvas API**: 高性能渲染

## 注意事项

1. minimap2必须正确安装并可通过命令行访问
2. 大文件比对可能需要较长时间
3. 建议使用现代浏览器以获得最佳Canvas渲染性能
4. 当前版本只支持单个参考序列

## 许可证

MIT
