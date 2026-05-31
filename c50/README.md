# git-auto-pr

一个 Rust 编写的命令行工具，用于自动化代码提交和 Pull Request 生成。

## 功能特性

1. **自动提交**：检测 Git 仓库变更，自动暂存并提交，根据变更文件和 diff 内容自动生成提交信息
2. **自动创建 PR**：与 GitHub API 交互，根据当前分支创建 Pull Request，自动填充标题和描述
3. **配置文件支持**：支持预设提交信息模板和 PR 模板
4. **交互式模式**：用户可以在提交前编辑自动生成的信息

## 安装

```bash
cargo build --release
```

将 `target/release/git-auto-pr` 添加到 PATH 中。

## 使用方法

### 1. 初始化配置

```bash
git-auto-pr init
```

这会在主目录创建 `.git-auto-pr.toml` 配置文件，需要填写 GitHub Token 等信息。

### 2. 自动提交

```bash
# 直接提交
git-auto-pr commit

# 交互式模式（编辑提交信息）
git-auto-pr commit --interactive
```

### 3. 创建 PR

```bash
# 创建到 main 分支的 PR
git-auto-pr pr

# 指定目标分支
git-auto-pr pr --base develop

# 交互式模式（编辑 PR 信息）
git-auto-pr pr --interactive
```

### 4. 自动提交 + 创建 PR

```bash
# 一键完成提交和 PR 创建
git-auto-pr auto

# 交互式模式
git-auto-pr auto --interactive
```

## 配置文件说明

配置文件位于 `~/.git-auto-pr.toml`：

```toml
[github]
token = "your_github_token_here"
owner = "your_username"
repo = "your_repo"

[templates]
commit_message = "{{type}}: {{subject}}\n\n{{body}}"
pr_title = "{{branch}}: {{summary}}"
pr_body = "## Changes\n\n{{changes}}\n\n## Checklist\n\n- [ ] Tests pass\n- [ ] Documentation updated"
```

## 获取 GitHub Token

1. 访问 GitHub Settings → Developer settings → Personal access tokens
2. 生成具有 `repo` 权限的 token
3. 将 token 填入配置文件

## 开发

```bash
# 运行
cargo run -- --help

# 测试
cargo test
```

## 许可证

MIT
