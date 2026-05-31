# 智能会议室预订系统 - 启动指南

## 项目结构

```
meeting-room-system/
├── backend/          # NestJS 后端服务
├── voice-service/    # Python 声纹验证微服务
├── mobile/           # React Native 移动端应用
├── web/              # Web 管理端
├── raspberry/        # 树莓派扫码验证端
└── scripts/          # 工具脚本
```

## 快速启动

### 方式一：使用 Docker Compose（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 初始化数据库
node scripts/init-db.js
```

### 方式二：手动启动各服务

#### 1. 启动 MongoDB
```bash
docker run -d -p 27017:27017 --name meeting-room-mongo mongo:5.0
```

#### 2. 初始化数据库
```bash
cd scripts
npm install mongoose
node init-db.js
```

#### 3. 启动 Python 声纹服务
```bash
cd voice-service
pip install -r requirements.txt
python app.py
```
服务运行在 http://localhost:5000

#### 4. 启动 NestJS 后端
```bash
cd backend
npm install
cp .env.example .env
# 编辑 .env 文件配置邮箱
npm run start:dev
```
API 运行在 http://localhost:3000

#### 5. 启动 Web 管理端
```bash
cd web
npm install
npm start
```
Web 端运行在 http://localhost:3001

#### 6. 启动移动端应用
```bash
cd mobile
npm install
npm start
```
使用 Expo Go 扫描二维码运行

## 功能说明

### 1. 声纹注册与登录
- 用户通过念出口令"预定明天下午三点会议室"完成声纹注册
- 登录时同样念出口令进行声纹验证
- 后端使用余弦相似度比对声纹特征向量

### 2. 会议室预订
- 支持快速预订（解析自然语言命令）
- 自动检测时间冲突
- 预订成功后发送带加密二维码的邮件

### 3. 二维码验证
- 树莓派端使用摄像头扫描二维码
- AES-256 加密保护预订信息
- 验证成功后更新预订状态

### 4. 热力图展示
- Web 管理端展示会议室预订热力图
- 支持按日期范围查询
- 直观展示各时段使用频率

## API 接口

### 用户相关
- `POST /api/users/register` - 声纹注册
- `POST /api/users/login` - 声纹登录

### 会议室相关
- `GET /api/rooms` - 获取会议室列表
- `POST /api/rooms` - 创建会议室

### 预订相关
- `POST /api/bookings` - 创建预订
- `GET /api/bookings` - 获取预订列表
- `POST /api/bookings/verify` - 验证二维码
- `GET /api/bookings/heatmap` - 获取热力图数据

## 技术栈

- **后端**: NestJS + MongoDB + Mongoose
- **声纹服务**: Python + Flask + Librosa + MFCC特征提取
- **移动端**: React Native + Expo + expo-av
- **Web端**: React + Tailwind CSS + heatmap.js
- **硬件端**: Raspberry Pi + OpenCV + pyzbar

## 注意事项

1. 邮箱配置：在 `backend/.env` 中配置真实的邮箱信息
2. 声纹模型：当前使用MFCC特征，生产环境建议使用预训练的声纹模型
3. 加密密钥：生产环境请更换 `booking.service.ts` 中的加密密钥
4. 树莓派：需要连接摄像头并安装相关依赖

## 开发建议

1. 先启动 MongoDB 和 Python 声纹服务
2. 再启动 NestJS 后端进行 API 测试
3. 最后启动 Web 和移动端进行联调
4. 使用 Postman 或类似工具测试 API 接口