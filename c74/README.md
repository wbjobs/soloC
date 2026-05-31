# 智能会议室预订系统

基于声纹识别的会议室预订全栈应用

## 项目架构

- `backend/` - NestJS 后端服务
- `voice-service/` - Python 声纹验证微服务
- `mobile/` - React Native 移动端应用
- `web/` - Web 管理端
- `raspberry/` - 树莓派扫码验证端

## 技术栈

- **后端**: NestJS + MongoDB + JWT
- **声纹服务**: Python + TensorFlow + speaker-verification
- **移动端**: React Native + Expo
- **Web端**: React + TypeScript + Heatmap.js
- **硬件**: Raspberry Pi + QR Scanner