# 多租户文档审批工作流系统 - 后端

## 技术栈
- Django 5.2
- Django REST Framework
- PostgreSQL (JSONB + RLS)
- JWT Authentication (SimpleJWT)

## 功能特性

### 1. 多租户架构
- 所有业务表 (documents, approvals, comments) 都有 tenant_id 字段
- 应用层租户过滤 (通过 TenantMiddleware 和 TenantScopedManager)
- 数据库层行级安全策略 (PostgreSQL RLS)

### 2. 审批工作流
- 可配置的审批流程（存储在 JSONB 字段）
  ```json
  [
    {"step": 1, "role": "manager"},
    {"step": 2, "role": "director"}
  ]
  ```
- 默认流程：直线经理 -> 部门主管
- 支持审批通过 / 拒绝 / 评论

### 3. 软删除
- 文档支持软删除 (deleted_at)
- 删除文档时，关联的审批记录和评论也会级联软删除

## 快速开始

### 1. 创建数据库
```sql
CREATE DATABASE workflow_db;
```

### 2. 安装依赖
```bash
cd backend
pip install -r requirements.txt
```

### 3. 运行迁移
```bash
python manage.py migrate
```

### 4. 填充测试数据
```bash
python manage.py seed_data
```

### 5. 创建超级用户
```bash
python manage.py createsuperuser
```

### 6. 启动服务
```bash
python manage.py runserver 0.0.0.0:8000
```

## API 接口

### 认证
- `POST /api/token/` - 获取 JWT Token
- `POST /api/token/refresh/` - 刷新 Token
- `POST /api/users/register/` - 用户注册（自动创建租户）
- `GET /api/users/me/` - 获取当前用户信息

### 文档
- `GET /api/documents/` - 获取文档列表
  - 支持查询参数: `?status=pending`
- `GET /api/documents/pending/` - 获取当前用户待审批的文档
- `POST /api/documents/` - 创建文档
- `GET /api/documents/<id>/` - 获取文档详情
- `PATCH /api/documents/<id>/` - 更新文档
- `DELETE /api/documents/<id>/` - 软删除文档（级联删除审批和评论）
- `POST /api/documents/<id>/submit/` - 提交审批
- `POST /api/documents/<id>/approve/` - 审批通过
- `POST /api/documents/<id>/reject/` - 审批拒绝
- `POST /api/documents/<id>/comment/` - 添加评论

### 审批
- `GET /api/approvals/` - 获取我的审批记录

### 评论
- `GET /api/comments/` - 获取评论列表
- `POST /api/comments/` - 新建评论

### 租户
- `GET /api/tenants/` - 获取租户信息（包含 workflow_config）
- `PATCH /api/tenants/<id>/` - 更新租户（可修改审批流程配置）

## 测试账号 (seed_data)
| Email | Role | Tenant | Password |
|-------|------|--------|----------|
| employee@acme.com | 员工 | Acme Corporation | password123 |
| manager@acme.com | 直线经理 | Acme Corporation | password123 |
| director@acme.com | 部门主管 | Acme Corporation | password123 |
| admin@globex.com | 经理 | Globex Industries | password123 |

## 行级安全策略 (RLS)

数据库迁移会自动创建以下 RLS 策略：

```sql
-- 设置/获取当前租户上下文
CREATE FUNCTION set_current_tenant(p_tenant_id BIGINT)
CREATE FUNCTION get_current_tenant()

-- 为三个业务表启用 RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 创建隔离策略
CREATE POLICY documents_tenant_isolation ON documents
    FOR ALL USING (tenant_id = get_current_tenant());
```

应用层在每次请求时通过中间件设置租户上下文，确保：
1. Django ORM 查询自动过滤当前租户
2. PostgreSQL RLS 提供额外的安全保障
