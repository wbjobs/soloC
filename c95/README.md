# 多语言代码片段管理工具

一个功能完整的命令行代码片段管理系统，支持本地存储、服务器同步、团队共享等功能。

## 架构

- **客户端**: Go 语言开发的命令行工具
- **服务端**: Flask 框架搭建的 API 服务 + SQLite 数据库
- **同步模块**: 增量同步机制，支持多设备同步

## 功能特性

### 核心功能
- ✅ 创建、编辑、删除、查看代码片段
- ✅ 按编程语言过滤
- ✅ 按标签分类管理
- ✅ 全文搜索（标题、代码、描述）
- ✅ 语法高亮显示
- ✅ Markdown 格式描述支持
- ✅ 本地 SQLite 存储

### 同步与共享
- ✅ 增量同步到服务器
- ✅ 多设备间数据同步
- ✅ 用户认证（注册/登录）
- ✅ 团队创建与管理
- ✅ 团队内代码片段共享

### 导入导出
- ✅ 本地批量导入导出 JSON 格式
- ✅ 服务器端导入导出

## 快速开始

### 1. 启动服务端

```bash
cd server
pip install -r requirements.txt
python app.py
```

服务端将在 `http://localhost:5000` 启动。

### 2. 编译和使用客户端

```bash
cd client
go mod download
go build -o snippet.exe
./snippet.exe --help
```

## 使用指南

### 用户认证

```bash
# 注册新用户
./snippet.exe register -u yourname -e your@email.com -p password

# 登录
./snippet.exe login -u yourname -p password

# 登出
./snippet.exe logout
```

### 代码片段管理

```bash
# 创建代码片段（从文件）
./snippet.exe create -t "Python Hello World" -l python -d "简单的示例" -f hello.py

# 创建代码片段（直接输入）
./snippet.exe create -t "Go Function" -l go -d "示例函数"
# 然后输入代码，按 Ctrl+D (Unix) 或 Ctrl+Z (Windows) 结束

# 列出所有代码片段
./snippet.exe list

# 按语言过滤
./snippet.exe list -l python

# 按标签过滤
./snippet.exe list -t utility

# 搜索
./snippet.exe list -s "hello"

# 查看代码片段（带语法高亮）
./snippet.exe view 1

# 查看代码片段（无高亮）
./snippet.exe view 1 -n

# 更新代码片段
./snippet.exe update 1 -t "New Title" -f new_code.py

# 删除代码片段
./snippet.exe delete 1
```

### 同步与团队共享

```bash
# 同步到服务器
./snippet.exe sync

# 创建团队
./snippet.exe team create "My Team"

# 分享代码片段给团队
./snippet.exe team share 1 5
```

### 导入导出

```bash
# 本地导出
./snippet.exe export -o snippets.json

# 从服务器导出
./snippet.exe export -s -o snippets.json

# 本地导入
./snippet.exe import snippets.json

# 导入到服务器
./snippet.exe import snippets.json -s
```

## API 接口

### 认证接口
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 代码片段接口
- `GET /api/snippets` - 获取代码片段列表
- `POST /api/snippets` - 创建代码片段
- `PUT /api/snippets/:id` - 更新代码片段
- `DELETE /api/snippets/:id` - 删除代码片段
- `GET /api/snippets/:id/preview` - 获取带语法高亮的预览

### 同步接口
- `POST /api/sync` - 增量同步

### 导入导出接口
- `GET /api/export` - 导出所有代码片段
- `POST /api/import` - 批量导入代码片段

### 团队接口
- `POST /api/teams` - 创建团队
- `POST /api/teams/:id/share` - 分享代码片段

## 项目结构

```
.
├── server/
│   ├── app.py              # Flask 应用主文件
│   ├── requirements.txt    # Python 依赖
│   └── .env               # 环境变量配置
├── client/
│   ├── main.go            # 程序入口
│   ├── go.mod             # Go 模块文件
│   └── internal/
│       ├── cmd/           # 命令行命令
│       ├── storage/       # 本地存储
│       ├── models/        # 数据模型
│       ├── api/           # API 客户端
│       └── ui/            # UI 工具函数
└── shared/                # 共享模块
```

## 技术栈

### 服务端
- **框架**: Flask
- **数据库**: SQLAlchemy + SQLite
- **认证**: Flask-JWT-Extended
- **语法高亮**: Pygments
- **Markdown**: markdown

### 客户端
- **命令行**: Cobra
- **配置**: Viper
- **语法高亮**: Chroma
- **Markdown**: gomarkdown
- **数据库**: mattn/go-sqlite3

## 配置说明

### 服务端配置 (.env)
```
JWT_SECRET_KEY=your-secret-key
FLASK_APP=app.py
FLASK_ENV=development
```

### 客户端配置
客户端配置存储在用户目录的 `.snippet-cli` 文件夹中，包括：
- 本地 SQLite 数据库
- 访问令牌
- 服务器地址

## 开发说明

### 安装依赖

**服务端**:
```bash
cd server
pip install -r requirements.txt
```

**客户端**:
```bash
cd client
go mod download
```

### 运行

**服务端**:
```bash
cd server
python app.py
```

**客户端**:
```bash
cd client
go run .
```

## 注意事项

1. 首次运行服务端会自动创建数据库表
2. 客户端数据存储在用户主目录下的 `.snippet-cli` 文件夹
3. 建议在生产环境修改默认的 `JWT_SECRET_KEY`
4. 同步操作需要先登录账号

## 许可证

MIT License
