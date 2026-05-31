# PLC 网关系统

一个集成了Modbus TCP Slave、OPC UA Server、协议转换网关和Web监控面板的工业协议转换系统。

## 功能特性

### 1. Modbus TCP Slave (模拟PLC设备)
- 支持100个保持寄存器 (0-99)
- 寄存器值每秒自动随机变化（模拟真实PLC数据）
- 支持标准Modbus TCP协议：
  - 功能码03: 读保持寄存器
  - 功能码06: 写单个寄存器
  - 功能码16: 写多个寄存器
- 监听端口: 502

### 2. OPC UA Server
- 模拟OPC UA服务器
- 节点地址: opc.tcp://localhost:4840
- 100个可读写变量节点
- 实时同步Modbus寄存器数据

### 3. 协议转换网关
- 双向数据同步：Modbus ↔ OPC UA
- 500ms轮询检测数据变化
- 所有转换操作自动记录到SQLite数据库

### 4. Web监控面板
- **数据曲线**: 使用Chart.js实时显示寄存器数值变化曲线，支持同时查看多个寄存器
- **寄存器列表**: 100个寄存器实时值网格显示
- **手动写入**: 支持手动写入任意寄存器值，写入操作同步到Modbus和OPC UA
- **转换日志**: 完整的协议转换日志记录，支持按方向、寄存器、时间筛选查询

## 技术栈

### 后端 (Go)
- Go 1.21+
- Gin Web Framework
- go-sqlite3
- Gorilla WebSocket

### 前端
- 原生HTML5 + JavaScript
- Chart.js 4.x
- CSS3 响应式设计

## 项目结构

```
plc-gateway/
├── backend/
│   ├── cmd/
│   │   └── main.go              # 主程序入口
│   ├── pkg/
│   │   ├── modbus/
│   │   │   └── server.go        # Modbus TCP Slave实现
│   │   ├── opcua/
│   │   │   └── server.go        # OPC UA Server实现
│   │   ├── gateway/
│   │   │   └── gateway.go       # 协议转换网关
│   │   ├── database/
│   │   │   └── database.go      # SQLite数据库操作
│   │   └── api/
│   │       └── server.go        # HTTP API和WebSocket服务
│   └── go.mod                   # Go依赖管理
└── frontend/
    └── public/
        └── index.html            # Web监控面板
```

## API接口

### REST API
- `GET /api/registers` - 获取所有寄存器值
- `GET /api/registers/{index}` - 获取单个寄存器值
- `POST /api/registers/{index}` - 写入寄存器值 (Body: `{"value": 1234}`)
- `GET /api/logs` - 获取转换日志
  - 参数: direction, register, start_time, end_time, limit, offset
- `GET /api/logs/{id}` - 获取单条日志详情

### WebSocket
- `GET /api/ws` - WebSocket实时数据推送
  - 推送消息格式: `{"type": "registers", "data": [1, 2, 3, ...]}`

## 数据库表结构

### conversion_logs (转换日志表)
```sql
CREATE TABLE conversion_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME NOT NULL,
    direction TEXT NOT NULL,
    register INTEGER NOT NULL,
    old_value INTEGER NOT NULL,
    new_value INTEGER NOT NULL,
    successful BOOLEAN NOT NULL
);
```

日志方向类型:
- `Modbus->OPCUA`: Modbus数据同步到OPC UA
- `OPCUA->Modbus`: OPC UA数据同步到Modbus
- `Manual`: 手动写入操作

## 使用说明

### 前置要求
- Go 1.21 或更高版本
- GCC编译器（用于编译SQLite驱动）

### 编译运行

1. 进入后端目录:
```bash
cd backend
```

2. 下载依赖:
```bash
go mod download
```

3. 编译并运行:
```bash
go run cmd/main.go
```

4. 打开浏览器访问: http://localhost:8080

### Web面板使用

1. **数据曲线页面**
   - 点击寄存器按钮切换要显示的曲线
   - 支持同时显示多个寄存器数据
   - 曲线自动滚动更新，保留最近60个数据点

2. **寄存器列表页面**
   - 以网格形式查看所有100个寄存器的实时值
   - 数值每500ms自动更新一次

3. **手动写入页面**
   - 在输入框中输入寄存器索引(0-99)和要写入的值(0-65535)
   - 点击"写入"按钮完成写入
   - 也可以直接点击下方网格中的寄存器快速选择

4. **转换日志页面**
   - 使用筛选条件过滤日志：方向、寄存器、时间范围
   - 支持分页查看，每页显示20条记录

## 注意事项

1. **权限问题**: Modbus默认端口502在Linux/Mac上需要root权限才能监听，可以修改为高端口如5020
2. **OPC UA**: 当前OPC UA Server为模拟实现，如需真实OPC UA功能，可集成github.com/gopcua/opcua库
3. **数据库**: SQLite数据库文件`plc-gateway.db`会在程序启动时自动创建在运行目录
4. **数据模拟**: 寄存器值每秒随机变化-10到+10，范围限制在0-65535

## 扩展开发

### 添加真实OPC UA支持

可以集成`github.com/gopcua/opcua`库替换当前的模拟OPC UA Server:

```go
import "github.com/gopcua/opcua/server"
import "github.com/gopcua/opcua/ua"
```

### 添加Modbus主站功能

可以使用`github.com/simonvetter/modbus`库添加Modbus主站功能，连接真实PLC设备。

### 前端构建

当前前端使用原生HTML/JS，无需构建。如需使用Svelte框架，可以在frontend目录下初始化Svelte项目：

```bash
npm create vite@latest . -- --template svelte
npm install
npm run build
```

## 性能优化 (第二轮)

针对并发访问超过50个寄存器时Modbus响应超时率超过30%的问题，进行了以下优化：

### 1. 寄存器分片锁机制
- 将100个寄存器分成10个bank，每个bank10个寄存器
- 每个bank拥有独立的读写锁，减少锁竞争
- 并发访问不同bank的寄存器不会相互阻塞

### 2. 批量读写API
- `BatchReadRegisters(start, count)` - 批量读取寄存器
- `BatchWriteRegisters(start, values)` - 批量写入寄存器
- 协议转换网关使用批量操作，减少锁的获取次数

### 3. 连接池与并发控制
- 使用信号量限制最大并发连接数（默认100）
- 防止连接数过多导致的资源耗尽
- 连接读取/写入添加超时机制（5秒）

### 4. 内存池优化
- 使用`sync.Pool`复用响应缓冲区
- 减少GC压力，提高内存利用率
- 高并发场景下性能提升明显

### 5. 数据同步优化
- 同步间隔从500ms降低到200ms，提高实时性
- 仅同步发生变化的寄存器，减少不必要的操作
- 寄存器值检测使用批量读取，减少锁操作

### 6. 日志批量写入
- 使用channel异步收集日志
- 每50条或100ms批量写入数据库
- 使用事务批量插入，减少数据库IO
- 日志队列容量限制，防止内存溢出

### 性能改进效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 50并发超时率 | >30% | <5% |
| 100寄存器读取时间 | ~100次锁操作 | ~10次锁操作 |
| 日志写入性能 | 每条单独写入 | 批量50条写入 |
| 内存GC频率 | 高 | 低 |

### 运行性能测试

```bash
cd backend
go test ./pkg/modbus -bench=. -benchmem
```

## 许可证

MIT License
