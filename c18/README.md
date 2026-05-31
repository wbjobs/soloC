# Gene Sequence Analysis Platform

一个功能完整的基因序列分析平台，支持 FASTA 文件上传和 BLAST 序列比对。

## 技术栈

### 后端
- **Python 3.8+**
- **Flask** - Web 框架
- **Graphene** - GraphQL 框架
- **graphene-file-upload** - 文件上传支持
- **Biopython** - 生物信息学处理
- **Flask-CORS** - 跨域支持

### 前端
- **React 18+**
- **Apollo Client** - GraphQL 客户端
- **apollo-upload-client** - 文件上传支持
- **react-router-dom** - 路由管理

## 功能特性

- ✅ FASTA 格式文件上传和解析
- ✅ 多序列支持
- ✅ BLAST 序列比对 (通过 NCBI API)
- ✅ 多种 BLAST 程序支持 (blastn, blastp, blastx, tblastn, tblastx)
- ✅ 多种数据库选择
- ✅ 详细的比对结果展示
- ✅ 响应式设计

## 项目结构

```
gene-sequence-platform/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── models.py
│   │   ├── routes.py
│   │   ├── schema.py
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── fasta_handler.py
│   │       └── blast_service.py
│   ├── uploads/
│   ├── blast_db/
│   ├── blast_results/
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── apollo/
│   │   │   └── client.js
│   │   ├── components/
│   │   │   ├── Header.js
│   │   │   ├── Welcome.js
│   │   │   ├── FastaUpload.js
│   │   │   └── BlastAnalysis.js
│   │   ├── graphql/
│   │   │   └── queries.js
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
├── sample_data/
│   └── example.fasta
└── README.md
```

## 快速开始

### 后端设置

1. **进入后端目录**
   ```bash
   cd backend
   ```

2. **创建虚拟环境 (推荐)**
   ```bash
   python -m venv venv
   
   # Windows (PowerShell)
   venv\Scripts\Activate.ps1
   
   # Windows (CMD)
   venv\Scripts\activate.bat
   
   # Linux/Mac
   source venv/bin/activate
   ```

3. **安装依赖**
   ```bash
   pip install -r requirements.txt
   ```

4. **运行后端服务器**
   ```bash
   python run.py
   ```

   后端将在 `http://localhost:5000` 启动

5. **访问 GraphQL Playground**
   打开浏览器访问 `http://localhost:5000/graphql` 来测试 GraphQL API

### 前端设置

1. **打开新的终端，进入前端目录**
   ```bash
   cd frontend
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **运行前端开发服务器**
   ```bash
   npm start
   ```

   前端将在 `http://localhost:3000` 启动

## 使用说明

### 1. 上传 FASTA 文件
- 在 "Upload FASTA" 标签页中选择 FASTA 格式文件
- 支持的扩展名: `.fa`, `.fasta`, `.fas`
- 文件大小限制: 16MB

### 2. 选择序列进行 BLAST
- 上传成功后，系统会自动解析文件中的所有序列
- 在序列列表中选择要分析的序列

### 3. 配置 BLAST 参数
- **Program**: 选择 BLAST 程序类型
  - `blastn`: 核苷酸比对
  - `blastp`: 蛋白质比对
  - `blastx`: 翻译核苷酸到蛋白质
  - `tblastn`: 蛋白质到翻译核苷酸
  - `tblastx`: 翻译核苷酸到翻译核苷酸

- **Database**: 选择搜索数据库
  - `nr`: 非冗余蛋白质
  - `nt`: 核苷酸集合
  - `refseq_rna`: RefSeq RNA
  - `refseq_genomic`: RefSeq 基因组
  - `swissprot`: Swiss-Prot
  - `pdb`: 蛋白质数据库

- **E-value**: E值阈值 (默认 10.0)
- **Max Hits**: 最大命中数 (默认 50)

### 4. 查看结果
- 点击 "Run BLAST" 开始比对
- 查看比对结果表格，包括:
  - 相似度百分比 (彩色显示: 绿色≥90%, 黄色≥70%, 红色<70%)
  - 比对长度
  - E值
  - Bit Score
- 点击 "Details" 查看详细对齐信息

## GraphQL API 文档

### Mutations

#### uploadFasta
上传并解析 FASTA 文件
```graphql
mutation UploadFasta($file: Upload!) {
  uploadFasta(file: $file) {
    success
    message
    count
    sequences {
      id
      name
      description
      sequence
      length
    }
  }
}
```

#### runBlast
运行 BLAST 分析
```graphql
mutation RunBlast(
  $sequenceId: String!,
  $sequence: String!,
  $program: String!,
  $database: String!,
  $evalue: Float!,
  $maxHits: Int!
) {
  runBlast(
    sequence_id: $sequenceId,
    sequence: $sequence,
    program: $program,
    database: $database,
    evalue: $evalue,
    max_hits: $maxHits
  ) {
    query_sequence {
      id
      name
      length
    }
    hits {
      query_id
      subject_id
      identity
      alignment_length
      evalue
      bit_score
      subject_title
    }
    total_hits
    execution_time
  }
}
```

### Queries

#### hello
测试接口
```graphql
query Hello($name: String) {
  hello(name: $name)
}
```

## 测试数据

项目包含示例 FASTA 文件: `sample_data/example.fasta`

## 注意事项

1. **BLAST 时间**: NCBI BLAST 搜索可能需要较长时间 (几秒到几分钟)，取决于序列长度和服务器负载

2. **网络连接**: BLAST 使用 NCBI 的远程 API，需要稳定的网络连接

3. **文件大小**: 默认最大上传文件大小为 16MB，可在 `backend/app/config.py` 中修改

4. **本地 BLAST**: 如果需要更快的本地 BLAST，可以安装 NCBI BLAST+ 工具包并配置本地数据库

## 故障排除

### 后端问题

**ImportError**: 确保所有依赖已正确安装
```bash
pip install -r requirements.txt --upgrade
```

**端口被占用**: 修改 `backend/run.py` 中的端口号

### 前端问题

**CORS 错误**: 确保后端已启动，并且 Flask-CORS 正常工作

**GraphQL 连接错误**: 检查 `frontend/src/apollo/client.js` 中的 API URL

### BLAST 问题

**无结果**: 
- 调整 E-value 阈值
- 尝试不同的数据库
- 确认序列格式正确

**超时**: 
- 缩短序列长度
- 减少 max_hits 数量
- 稍后重试 (NCBI 服务器可能繁忙)

## 开发计划

- [ ] 添加用户认证
- [ ] 支持更多文件格式
- [ ] 添加序列可视化
- [ ] 支持本地 BLAST 数据库
- [ ] 添加历史记录功能
- [ ] 导出比对结果 (CSV, JSON)
- [ ] 添加 API 限流
- [ ] 添加单元测试

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
