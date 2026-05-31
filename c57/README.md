# Academic Knowledge Graph

一个完整的学术知识图谱系统，包括数据抓取、图数据库存储、GraphQL API 和前端可视化。

## 功能特性

### 后端 (Python/FastAPI/Neo4j)
- 从 arXiv 抓取学术论文数据
- 使用 Neo4j 图数据库存储论文、作者、机构和引用关系
- 提供 GraphQL API 接口
  - 搜索论文
  - 查询论文的引用和参考文献
  - 查询作者的合著者网络

### 前端 (Next.js + D3.js)
- 搜索论文
- 论文列表展示
- D3.js 力导向图可视化论文关联网络
- 交互式节点拖拽和缩放

## 项目结构

```
.
├── backend/
│   ├── src/
│   │   ├── database.py          # Neo4j 数据库连接
│   │   ├── data_fetcher.py      # arXiv 数据抓取
│   │   ├── graphql_schema.py    # GraphQL Schema
│   │   └── main.py              # FastAPI 应用
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── ForceGraph.tsx       # D3.js 力导向图组件
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
└── README.md
```

## 快速开始

### 1. 启动 Neo4j 数据库

```bash
docker-compose up -d
```

Neo4j 浏览器: http://localhost:7474
默认用户名: neo4j, 密码: password

### 2. 启动后端服务

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
python src/main.py
```

API 文档: http://localhost:8000/docs
GraphQL Playground: http://localhost:8000/graphql

### 3. 抓取初始数据

访问: http://localhost:8000/fetch-papers?query=machine learning&max_results=20

这将抓取 20 篇关于机器学习的论文并存入 Neo4j。

### 4. 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

前端地址: http://localhost:3000

## GraphQL 查询示例

### 搜索论文
```graphql
query {
  searchPapers(query: "machine learning", limit: 10) {
    id
    title
    abstract
    published
  }
}
```

### 获取论文详情（包括作者、引用关系）
```graphql
query {
  getPaper(paperId: "2301.00001") {
    paper {
      id
      title
    }
    authors {
      id
      name
    }
    citations {
      id
      title
    }
    references {
      id
      title
    }
  }
}
```

### 获取作者合著者网络
```graphql
query {
  getAuthorNetwork(authorId: "author-uuid") {
    author {
      id
      name
    }
    coAuthors {
      id
      name
    }
  }
}
```

## 技术栈

### 后端
- **FastAPI**: 现代、高性能的 Python Web 框架
- **Neo4j**: 图数据库，适合存储和查询关系数据
- **Strawberry GraphQL**: 类型安全的 GraphQL 库
- **arXiv API**: 学术论文数据源

### 前端
- **Next.js 14**: React 全栈框架
- **D3.js**: 数据可视化库（力导向图）
- **Apollo Client**: GraphQL 客户端
- **TypeScript**: 类型安全

## 使用说明

1. 启动 Neo4j 数据库
2. 启动后端服务
3. 通过 `/fetch-papers` 端点抓取一些论文数据
4. 启动前端服务
5. 在前端搜索论文，点击查看知识图谱

## 注意事项

- arXiv API 有速率限制，请合理使用
- 当前实现中引用关系数据需要额外处理（arXiv 不直接提供引用数据）
- 可以扩展支持更多数据源，如 Semantic Scholar、Crossref 等
