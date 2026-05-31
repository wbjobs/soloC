# 智能会议纪要功能说明

## 功能概述

智能会议室系统新增智能会议纪要功能，实现会议全流程自动化处理：

- **会议录音**: 移动端实时录制会议音频
- **语音转写**: 使用 OpenAI Whisper API 将语音转为文字
- **智能分析**: 使用 GPT-3.5 自动提取会议决策、待办事项和关键要点
- **邮件推送**: 将精美的会议纪要自动发送到所有参会人邮箱

---

## 核心功能

### 1. 会议管理

- **创建会议**: 支持快速创建新会议，添加参会人
- **开始/结束会议**: 一键控制会议状态
- **会议列表**: 查看历史和待开始的会议
- **状态追踪**: 待开始/进行中/处理中/已完成/已取消

### 2. 智能录音转写

- **Whisper API 集成**: 使用 OpenAI 最先进的语音识别模型
- **支持多种语言**: 自动识别中文、英文等多种语言
- **时间戳**: 保留说话时间点信息
- **高准确率**: 专业级语音识别质量

### 3. AI 内容分析

系统自动分析会议内容，提取以下信息：

- **会议概述**: 100-200字的会议内容摘要
- **会议决策**: 会议中达成的所有决定
- **待办事项**: 需要执行的任务，包含负责人和截止日期
- **关键要点**: 会议讨论的核心观点

### 4. 精美邮件推送

- **响应式设计**: 支持桌面和移动端查看
- **清晰排版**: 分模块展示会议信息
- **附件支持**: 附带完整会议记录原文
- **批量发送**: 自动发送给所有参会人

---

## API 接口

### 会议管理

```bash
# 创建会议
POST /api/meetings
{
  "bookingId": "xxx",
  "title": "会议标题",
  "description": "会议描述",
  "roomId": "xxx",
  "organizerId": "xxx",
  "attendees": [
    { "userId": "xxx", "name": "张三", "email": "zhangsan@example.com" }
  ],
  "startTime": "2024-01-01T09:00:00Z",
  "endTime": "2024-01-01T10:00:00Z"
}

# 开始会议
POST /api/meetings/:id/start

# 结束会议（并处理录音）
POST /api/meetings/:id/end
{
  "audio": "base64_encoded_audio"
}

# 获取会议详情
GET /api/meetings/:id

# 获取用户的会议列表
GET /api/meetings?userId=xxx&status=completed
```

### 会议纪要

```bash
# 获取会议转写
GET /api/meetings/:id/transcription

# 获取会议摘要
GET /api/meetings/:id/summary

# 重新发送会议纪要邮件
POST /api/meetings/:id/resend-email
{
  "email": "optional@example.com"
}

# 更新待办事项状态
PUT /api/meetings/:id/todos/:index
{
  "completed": true
}
```

---

## 配置说明

### 环境变量

在 `backend/.env` 中配置：

```env
# OpenAI API (必需)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# SMTP 邮件配置 (必需)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

### 获取 OpenAI API Key

1. 访问 https://platform.openai.com/api-keys
2. 创建新的 API Key
3. 确保账户有足够的余额

### 配置 Gmail SMTP

1. 开启 Gmail 两步验证
2. 创建应用专用密码
3. 使用应用专用密码作为 `EMAIL_PASS`

---

## 移动端使用流程

### 1. 创建会议

1. 在预订页面点击「智能会议纪要」
2. 点击「+ 创建会议」按钮
3. 输入会议标题，确认创建

### 2. 开始会议录音

1. 在会议列表中找到待开始的会议
2. 点击「开始会议」按钮
3. 系统开始录音，顶部显示录音时间

### 3. 结束会议

1. 点击「结束会议」按钮
2. 系统自动上传录音并处理
3. 等待 AI 分析完成（约10-30秒）

### 4. 查看会议纪要

1. 会议完成后点击「查看纪要」
2. 查看会议概述、决策、待办事项
3. 点击待办事项可标记完成
4. 可重新发送邮件给参会人

---

## 邮件模板示例

会议纪要邮件包含以下部分：

1. **邮件头部**: 渐变背景，会议标题
2. **会议信息**: 时间、时长、会议室、组织者
3. **会议概述**: 内容摘要
4. **会议决策**: 编号列表展示所有决定
5. **待办事项**: 包含负责人和截止日期
6. **关键要点**: 会议核心观点
7. **邮件底部**: 系统信息和说明

---

## 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 语音识别 | OpenAI Whisper API | whisper-1 模型 |
| 内容分析 | OpenAI GPT-3.5 Turbo | gpt-3.5-turbo-16k |
| 后端 | NestJS | 服务端框架 |
| 数据库 | MongoDB | 数据存储 |
| 邮件服务 | Nodemailer | SMTP 发送 |
| 移动端 | React Native + Expo | 跨平台应用 |

---

## 费用说明

使用 OpenAI API 会产生费用：

- **Whisper**: $0.006 / 分钟
- **GPT-3.5-turbo-16k**: $0.003 / 1K tokens (输入), $0.004 / 1K tokens (输出)

**估算**:
- 1小时会议: Whisper 约 $0.36
- 内容分析: 约 $0.01-$0.05
- 总计: 约 $0.40 / 小时

---

## 注意事项

1. **隐私合规**: 确保会议录音符合公司隐私政策
2. **网络要求**: 上传录音需要稳定的网络连接
3. **费用控制**: 监控 OpenAI API 使用量，设置预算警报
4. **备份策略**: 重要会议建议本地备份录音文件
5. **准确率**: 语音识别准确率受环境噪音、口音等影响

---

## 故障排查

### 语音转写失败

1. 检查 OpenAI API Key 是否正确
2. 检查网络连接
3. 确认账户余额充足

### 邮件发送失败

1. 检查 SMTP 配置
2. 确认邮箱账户状态正常
3. 查看垃圾邮件文件夹

### AI 分析结果不理想

1. 确保录音质量清晰
2. 会议中尽量使用标准普通话
3. 重要内容可重复强调

---

## 更新日志

### v1.0.0 (2024-01-01)
- ✅ 新增智能会议纪要功能
- ✅ 集成 Whisper API 语音转写
- ✅ 集成 GPT-3.5 内容分析
- ✅ 支持录音和回放
- ✅ 自动发送邮件给参会人
- ✅ 待办事项管理功能
- ✅ 移动端完整支持