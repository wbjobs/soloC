# 事件溯源交易订单簿系统

## 项目架构

本系统采用事件溯源（Event Sourcing）架构，分为以下核心组件：

### 1. 写模型 (Write Model)
- 接收订单创建请求
- 在内存中进行订单撮合
- 产生不可变事件（OrderCreatedEvent, OrderMatchedEvent）

### 2. 事件存储 (Event Store)
- 使用Apache Kafka作为事件总线
- 所有事件按顺序持久化存储
- 提供事件重播能力

### 3. 读模型 (Read Model)
- 消费Kafka事件
- 构建订单簿快照
- 提供REST API查询接口

## 读模型数据不一致Bug修复

### 问题分析

在高并发压力下，读模型可能出现以下数据不一致问题：

1. **事件乱序** - MATCH事件可能在对应的CREATE事件之前到达
2. **重复消费** - Kafka重新平衡导致重复消费事件
3. **并发安全** - 多线程同时修改同一订单簿状态

### 修复方案

#### 1. 幂等性处理 (Idempotency)
```java
// OrderBookSnapshot.java
private final Set<String> processedEventIds = Collections.newSetFromMap(...);

public boolean isEventProcessed(String eventId) {
    return processedEventIds.contains(eventId);
}

public void markEventProcessed(String eventId) {
    processedEventIds.add(eventId);
}
```
使用LRU缓存跟踪已处理的事件ID，避免重复处理。

#### 2. 待处理事件队列 (Pending Events Queue)
```java
private final Map<String, List<PendingEvent>> pendingEvents = new HashMap<>();

public void matchOrder(String buyOrderId, String sellOrderId, ...) {
    OrderEntry buyOrder = orderMap.get(buyOrderId);
    OrderEntry sellOrder = orderMap.get(sellOrderId);
    
    if (buyOrder == null) {
        queuePendingEvent(buyOrderId, new PendingEvent(...));
        return;
    }
    // ...
}
```
当依赖的订单不存在时，将事件暂存，待订单创建后重放。

#### 3. 读写锁机制 (ReadWriteLock)
```java
private final ReentrantReadWriteLock lock = new ReentrantReadWriteLock();

public void addOrder(OrderEntry order) {
    lock.writeLock().lock();
    try {
        // 修改操作
    } finally {
        lock.writeLock().unlock();
    }
}

public OrderBookView getView() {
    lock.readLock().lock();
    try {
        return new OrderBookView(this);
    } finally {
        lock.readLock().unlock();
    }
}
```
确保并发读写的线程安全。

#### 4. 按交易对分区锁
```java
private final Map<String, ReentrantLock> symbolLocks = new ConcurrentHashMap<>();

private ReentrantLock getSymbolLock(String symbol) {
    return symbolLocks.computeIfAbsent(symbol, k -> new ReentrantLock());
}
```
不同交易对的处理完全隔离，避免不必要的锁竞争。

#### 5. 数据完整性验证
```java
public SnapshotValidation validateIntegrity() {
    // 检查重复订单
    // 检查买卖方向是否正确
    // 检查订单映射与价格层级一致性
}
```
提供验证端点 `/api/orderbook/{symbol}/validate` 用于诊断数据一致性问题。

## 快速开始

### 核心服务 (Spring Boot)

```bash
cd orderbook-core
mvn spring-boot:run
```

### 客户端模拟器 (Node.js)

```bash
cd client-simulator
npm install
node simulator.js
```

### API 端点

- `POST /api/orderbook/orders` - 创建订单
- `GET /api/orderbook/{symbol}` - 获取订单簿
- `GET /api/orderbook/{symbol}/validate` - 验证数据完整性

## 监控与诊断

在高并发测试后，可以通过以下方式验证修复效果：

1. 检查应用日志中是否有 "Pending events for order XXX" 警告
2. 调用验证端点检查数据完整性
3. 对比写模型和读模型的订单数量

## 项目结构

```
c53/
├── orderbook-core/
│   ├── src/main/java/com/trading/orderbook/
│   │   ├── event/          # 事件定义
│   │   ├── producer/       # Kafka生产者
│   │   ├── consumer/       # Kafka消费者
│   │   ├── engine/         # 撮合引擎
│   │   ├── model/          # 订单模型
│   │   ├── readmodel/      # 读模型快照
│   │   └── controller/     # REST API
│   └── pom.xml
└── client-simulator/
    ├── simulator.js
    └── package.json
```
