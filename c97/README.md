# 物联网设备远程固件升级管理系统

## 项目概述

本系统是一个完整的物联网设备远程固件升级（OTA）管理平台，采用微服务架构设计，支持ESP32等物联网设备的批量固件升级、断点续传、自动重试和版本回滚功能。

## 系统架构

```
┌─────────────────┐
│   ESP32 设备     │───┐
└─────────────────┘    │
                        ▼
┌─────────────────────────────────────────┐
│              API 网关                    │
└─────────────────────────────────────────┘
                        │
     ┌──────────────────┼──────────────────┐
     ▼                  ▼                  ▼
┌───────────┐    ┌───────────┐    ┌───────────┐
│ 固件服务   │    │ 设备服务   │    │ 升级服务   │
└───────────┘    └───────────┘    └───────────┘
     │                  │                  │
     └──────────────────┼──────────────────┘
                        ▼
┌─────────────────────────────────────────┐
│    MySQL (数据存储)  │  Redis (缓存)     │
└─────────────────────────────────────────┘
```

## 核心功能

### 设备端功能（ESP32）
- ✅ **断点续传**：固件下载中断后可从断点处继续下载
- ✅ **固件校验**：MD5完整性校验，确保固件完整
- ✅ **升级回滚**：升级失败自动恢复到原有版本
- ✅ **状态上报**：实时上报升级进度和状态
- ✅ **自动重试**：最多3次自动重试机制

### 后端服务功能
- ✅ **固件管理**：固件上传、版本管理、下载服务
- ✅ **设备管理**：设备注册、分组、状态管理
- ✅ **任务调度**：升级任务创建、批量下发、执行管理
- ✅ **日志服务**：升级日志上报、查询、统计
- ✅ **自动重试**：升级失败自动重试，最多3次
- ✅ **版本回滚**：支持设备固件版本回滚

### 管理后台API
- ✅ 固件上传接口
- ✅ 设备分组管理
- ✅ 升级任务创建与执行
- ✅ 升级进度实时查询
- ✅ 批量设备升级
- ✅ 固件版本回滚

## 技术栈

| 组件 | 技术选型 | 版本 |
|------|----------|------|
| 设备端 | ESP32 + Arduino | - |
| 后端框架 | Spring Boot | 2.7.18 |
| 微服务 | Spring Cloud | 2021.0.8 |
| 服务注册 | Nacos | 2.2.3 |
| 服务网关 | Spring Cloud Gateway | - |
| ORM框架 | MyBatis-Plus | 3.5.3.1 |
| 数据库 | MySQL | 8.0 |
| 缓存 | Redis | 7.x |
| JSON处理 | FastJSON2 | 2.0.39 |
| 工具类 | Hutool | 5.8.20 |

## 模块说明

| 模块名 | 端口 | 说明 |
|--------|------|------|
| ota-gateway | 8080 | API网关，统一入口 |
| firmware-service | 8081 | 固件管理服务 |
| device-service | 8082 | 设备管理服务 |
| upgrade-service | 8083 | 升级任务调度服务 |
| log-service | 8084 | 日志上报服务 |
| admin-api | 8085 | 管理后台聚合API |

## 快速开始

### 环境要求
- JDK 11+
- Maven 3.6+
- Docker & Docker Compose (推荐)
- Arduino IDE (用于设备端)

### 方式一：Docker Compose 一键部署

```bash
# 1. 克隆项目
cd iot-ota-management

# 2. 构建所有服务
mvn clean package -DskipTests

# 3. 启动所有服务
docker-compose up -d

# 4. 查看服务状态
docker-compose ps
```

### 方式二：本地开发启动

1. **启动基础服务**
```bash
# 启动MySQL
docker run -d --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root mysql:8.0

# 启动Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# 启动Nacos
docker run -d --name nacos -p 8848:8848 -e MODE=standalone nacos/nacos-server:v2.2.3
```

2. **初始化数据库**
```bash
mysql -h localhost -u root -proot < sql/ota_init.sql
```

3. **启动微服务**
```bash
# 按顺序启动各服务
cd ota-gateway && mvn spring-boot:run
cd firmware-service && mvn spring-boot:run
cd device-service && mvn spring-boot:run
cd upgrade-service && mvn spring-boot:run
cd log-service && mvn spring-boot:run
cd admin-api && mvn spring-boot:run
```

### 设备端部署

1. 打开 `esp32-ota/src/ota_client.ino`
2. 修改WiFi配置和服务器地址
3. 使用Arduino IDE或PlatformIO烧录到ESP32
4. 设备启动后自动连接服务器检查升级

## API接口说明

### 管理后台API (端口: 8085)

#### 1. 固件上传
```http
POST /api/admin/firmware/upload
Content-Type: multipart/form-data

参数:
- file: 固件bin文件
- firmwareName: 固件名称
- firmwareVersion: 固件版本
- productKey: 产品标识
- description: 描述(可选)
```

#### 2. 查询固件列表
```http
GET /api/admin/firmware/list?productKey=xxx
```

#### 3. 创建升级任务
```http
POST /api/admin/task/create
Content-Type: application/json

{
  "taskName": "批量升级v1.1",
  "firmwareId": 1,
  "productKey": "ESP32_PRODUCT_001",
  "targetType": 3,
  "deviceKeys": ["device001", "device002", "device003"],
  "maxRetryTimes": 3
}
```

#### 4. 执行升级任务
```http
POST /api/admin/task/execute/{taskId}
```

#### 5. 查询任务进度
```http
GET /api/admin/task/progress/{taskId}
```

#### 6. 设备版本回滚
```http
POST /api/admin/device/rollback?deviceKey=xxx&targetVersion=v1.0.0
```

### 设备端API (通过网关)

#### 1. 检查固件更新
```http
GET /api/upgrade/check?deviceKey=xxx&productKey=xxx&version=xxx
```

#### 2. 断点下载固件
```http
GET /api/firmware/download?deviceKey=xxx&taskId=xxx
Header: Range: bytes=102400-
```

#### 3. 上报升级状态
```http
POST /api/log/report
Content-Type: application/json

{
  "deviceKey": "xxx",
  "taskId": "xxx",
  "status": 2,
  "progress": 100,
  "message": "升级完成"
}
```

## 升级状态码说明

| 状态码 | 说明 |
|--------|------|
| 0 | 待升级 |
| 1 | 升级中 |
| 2 | 升级成功 |
| 3 | 升级失败 |

## 核心实现原理

### 断点续传实现
1. 设备端使用Preferences存储已下载字节数
2. 下载中断后，下次从断点处使用HTTP Range请求继续
3. 服务器支持Range头，返回指定范围的固件数据

### 批量下发实现
1. 创建任务时指定目标设备列表
2. 服务端异步批量生成升级任务详情
3. 通过Redis标记待升级设备，设备轮询获取任务

### 自动重试实现
1. 升级失败时检查重试次数
2. 未超过最大重试次数（默认3次）则重新下发
3. 每次重试间隔指数递增（10s, 20s, 40s）

### 版本回滚实现
1. 设备存储历史固件版本信息
2. 管理员触发回滚任务
3. 设备下载指定历史版本固件并执行升级

## 目录结构

```
iot-ota-management/
├── esp32-ota/              # ESP32设备端代码
│   ├── src/
│   │   └── ota_client.ino  # 主程序
│   ├── platformio.ini      # PlatformIO配置
│   └── partitions.csv      # ESP32分区表
├── ota-common/             # 公共模块
│   ├── entity/             # 实体类
│   ├── result/             # 统一返回结果
│   └── feign/              # Feign客户端
├── ota-gateway/            # API网关
├── firmware-service/       # 固件管理服务
├── device-service/         # 设备管理服务
├── upgrade-service/        # 升级调度服务
├── log-service/            # 日志服务
├── admin-api/              # 管理后台API
├── sql/                    # 数据库脚本
│   └── ota_init.sql        # 初始化脚本
├── docker/                 # Docker配置
├── docker-compose.yml      # 一键部署配置
└── pom.xml                 # 父POM
```

## 数据库设计

核心表结构：
- `t_firmware`: 固件信息表
- `t_device`: 设备信息表
- `t_device_group`: 设备分组表
- `t_upgrade_task`: 升级任务表
- `t_upgrade_task_detail`: 升级任务明细表
- `t_upgrade_log`: 升级日志表

## 注意事项

1. **固件大小限制**: 默认最大支持50MB固件，可通过配置调整
2. **并发控制**: 建议同一产品下同时升级设备不超过100台
3. **网络要求**: 设备需能稳定连接服务器，建议超时时间设置为30s
4. **存储空间**: ESP32建议使用至少4MB Flash，OTA分区建议1.5MB以上

## 许可证

MIT License
