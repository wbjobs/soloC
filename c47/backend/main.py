import asyncio
import json
import os
import time
import signal
import threading
from datetime import datetime
from collections import deque
from hashlib import md5

import pandas as pd
import redis
import websockets
from kafka import KafkaConsumer, TopicPartition
from kafka.errors import KafkaError
from dotenv import load_dotenv

load_dotenv()

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID")
REDIS_HOST = os.getenv("REDIS_HOST")
REDIS_PORT = int(os.getenv("REDIS_PORT"))
REDIS_DB = int(os.getenv("REDIS_DB"))
WEBSOCKET_HOST = os.getenv("WEBSOCKET_HOST")
WEBSOCKET_PORT = int(os.getenv("WEBSOCKET_PORT"))
AGGREGATION_WINDOW_SECONDS = int(os.getenv("AGGREGATION_WINDOW_SECONDS"))
MAX_RETRY_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1
DEDUPLICATION_WINDOW_SECONDS = 300

class UserBehaviorProcessor:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            decode_responses=True
        )
        self.data_buffer = deque()
        self.last_aggregation_time = time.time()
        self.connected_clients = set()
        self.running = True
        self.consumer = None
        self.shutdown_event = threading.Event()
        self.processed_messages = set()
        self.last_deduplication_cleanup = time.time()

    def create_kafka_consumer(self):
        return KafkaConsumer(
            bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
            group_id=KAFKA_GROUP_ID,
            value_deserializer=lambda x: json.loads(x.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=False,
            max_poll_records=500,
            session_timeout_ms=30000,
            heartbeat_interval_ms=10000
        )

    def is_duplicate_message(self, data):
        message_key = md5(json.dumps(data, sort_keys=True).encode()).hexdigest()
        if message_key in self.processed_messages:
            return True
        self.processed_messages.add(message_key)
        return False

    def cleanup_deduplication_cache(self):
        current_time = time.time()
        if current_time - self.last_deduplication_cleanup >= DEDUPLICATION_WINDOW_SECONDS:
            self.processed_messages.clear()
            self.last_deduplication_cleanup = current_time

    async def consume_kafka_messages(self):
        while self.running:
            try:
                self.consumer = self.create_kafka_consumer()
                self.consumer.subscribe([KAFKA_TOPIC])
                print(f"Kafka消费者已启动，监听Topic: {KAFKA_TOPIC}")
                
                while self.running and not self.shutdown_event.is_set():
                    try:
                        messages = self.consumer.poll(timeout_ms=1000)
                        
                        if not messages:
                            await asyncio.sleep(0.1)
                            continue
                        
                        for tp, records in messages.items():
                            for record in records:
                                try:
                                    data = record.value
                                    
                                    if not isinstance(data, dict):
                                        continue
                                    
                                    if self.is_duplicate_message(data):
                                        print(f"检测到重复消息，跳过: {data.get('user_id', 'unknown')}")
                                        continue
                                    
                                    data["timestamp"] = datetime.fromtimestamp(data.get("timestamp", time.time()))
                                    self.data_buffer.append(data)
                                    
                                except Exception as e:
                                    print(f"处理消息错误: {e}, 消息内容: {record.value}")
                                    continue
                            
                            try:
                                self.consumer.commit({tp: records[-1].offset + 1})
                            except KafkaError as e:
                                print(f"Offset提交失败: {e}")
                        
                        await self.check_and_aggregate()
                        self.cleanup_deduplication_cache()
                        
                    except KafkaError as e:
                        print(f"Kafka错误: {e}，5秒后重试...")
                        await asyncio.sleep(5)
                        break
                    
            except Exception as e:
                print(f"消费者错误: {e}，5秒后重连...")
                await asyncio.sleep(5)
            finally:
                if self.consumer:
                    try:
                        self.consumer.close()
                    except:
                        pass
                    self.consumer = None

    async def check_and_aggregate(self):
        current_time = time.time()
        if current_time - self.last_aggregation_time >= AGGREGATION_WINDOW_SECONDS:
            await self.aggregate_and_push()
            self.last_aggregation_time = current_time

    async def aggregate_and_push(self):
        if not self.data_buffer:
            return

        buffer_backup = list(self.data_buffer)
        self.data_buffer.clear()

        try:
            df = pd.DataFrame(buffer_backup)

            df["minute"] = df["timestamp"].dt.floor("T")
            latest_minute = df["minute"].max()

            pv = len(df)
            uv = df["user_id"].nunique()

            click_count = len(df[df["action_type"] == "click"])
            view_count = len(df[df["action_type"] == "view"])
            order_count = len(df[df["action_type"] == "order"])

            conversion_rate = order_count / pv if pv > 0 else 0

            page_distribution = df["page"].value_counts().to_dict()
            action_distribution = df["action_type"].value_counts().to_dict()

            result = {
                "timestamp": latest_minute.isoformat(),
                "pv": int(pv),
                "uv": int(uv),
                "conversion_rate": round(conversion_rate, 4),
                "click_count": int(click_count),
                "view_count": int(view_count),
                "order_count": int(order_count),
                "page_distribution": page_distribution,
                "action_distribution": action_distribution
            }

            self.save_to_redis(result)
            self.save_user_paths(df)
            await self.broadcast_to_clients(result)
            print(f"聚合完成: {latest_minute}, PV: {pv}, UV: {uv}, 转化率: {conversion_rate:.4f}")

        except Exception as e:
            print(f"聚合计算错误: {e}")
            self.data_buffer.extend(buffer_backup)
            print(f"已恢复 {len(buffer_backup)} 条数据到缓冲区")

    def save_to_redis(self, result):
        key = f"behavior_stats:{result['timestamp']}"
        self.redis_client.setex(key, 3600, json.dumps(result))
        
        recent_keys = self.redis_client.keys("behavior_stats:*")
        if len(recent_keys) > 60:
            sorted_keys = sorted(recent_keys)
            for old_key in sorted_keys[:-60]:
                self.redis_client.delete(old_key)

    def save_user_paths(self, df):
        """保存用户路径数据用于漏斗分析"""
        df_sorted = df.sort_values(['user_id', 'timestamp'])
        
        user_paths = {}
        for user_id, group in df_sorted.groupby('user_id'):
            path = group[['page', 'action_type', 'timestamp']].to_dict('records')
            user_paths[str(user_id)] = path
        
        pipeline = self.redis_client.pipeline()
        for user_id, path in user_paths.items():
            key = f"user_path:{user_id}"
            pipeline.setex(key, 1800, json.dumps(path))
        pipeline.execute()
        
        print(f"保存了 {len(user_paths)} 个用户的路径数据")

    def calculate_funnel(self, start_event, end_event):
        """计算转化漏斗"""
        all_user_paths = []
        user_path_keys = self.redis_client.keys("user_path:*")
        
        for key in user_path_keys:
            path_data = self.redis_client.get(key)
            if path_data:
                all_user_paths.append(json.loads(path_data))
        
        if not all_user_paths:
            return None

        default_funnel_stages = [
            {'name': '浏览首页', 'page': 'home', 'action': 'view'},
            {'name': '浏览商品', 'page': 'product', 'action': 'view'},
            {'name': '点击商品', 'page': 'product', 'action': 'click'},
            {'name': '加入购物车', 'page': 'cart', 'action': 'click'},
            {'name': '结算', 'page': 'checkout', 'action': 'click'},
            {'name': '下单', 'page': 'checkout', 'action': 'order'}
        ]

        funnel_stages = default_funnel_stages
        
        if start_event and end_event:
            start_idx = None
            end_idx = None
            for i, stage in enumerate(funnel_stages):
                if stage['name'] == start_event:
                    start_idx = i
                if stage['name'] == end_event:
                    end_idx = i
            
            if start_idx is not None and end_idx is not None and start_idx < end_idx:
                funnel_stages = funnel_stages[start_idx:end_idx + 1]

        funnel_result = []
        for i, stage in enumerate(funnel_stages):
            count = 0
            for path in all_user_paths:
                for step in path:
                    if step['page'] == stage['page'] and step['action_type'] == stage['action']:
                        count += 1
                        break
            
            prev_count = funnel_result[i - 1]['value'] if i > 0 else count
            conversion_rate = count / prev_count if prev_count > 0 else 0
            
            funnel_result.append({
                'name': stage['name'],
                'value': count,
                'conversion_rate': round(conversion_rate, 4)
            })

        return funnel_result

    async def broadcast_to_clients(self, result):
        if not self.connected_clients:
            return
        
        message = json.dumps(result)
        disconnected = set()
        
        for websocket in self.connected_clients:
            try:
                await websocket.send(message)
            except Exception:
                disconnected.add(websocket)
        
        for websocket in disconnected:
            self.connected_clients.remove(websocket)

    async def handle_websocket(self, websocket):
        self.connected_clients.add(websocket)
        print(f"新的WebSocket连接，当前连接数: {len(self.connected_clients)}")
        
        try:
            recent_data = self.get_recent_data()
            if recent_data:
                await websocket.send(json.dumps(recent_data))
            
            async for message in websocket:
                try:
                    request = json.loads(message)
                    if request.get('type') == 'funnel_request':
                        funnel_data = self.calculate_funnel(
                            request.get('start_event'),
                            request.get('end_event')
                        )
                        response = {
                            'type': 'funnel_data',
                            'data': funnel_data
                        }
                        await websocket.send(json.dumps(response))
                except Exception as e:
                    print(f"处理WebSocket请求错误: {e}")
                    
        finally:
            self.connected_clients.remove(websocket)
            print(f"WebSocket连接关闭，当前连接数: {len(self.connected_clients)}")

    def get_recent_data(self, limit=60):
        keys = sorted(self.redis_client.keys("behavior_stats:*"))
        if not keys:
            return None

        recent_data = []
        for key in keys[-limit:]:
            data = self.redis_client.get(key)
            if data:
                recent_data.append(json.loads(data))

        return {"type": "historical", "data": recent_data}

    async def start_websocket_server(self):
        async with websockets.serve(self.handle_websocket, WEBSOCKET_HOST, WEBSOCKET_PORT):
            print(f"WebSocket服务器已启动: ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
            while self.running:
                await asyncio.sleep(1)

    async def shutdown(self):
        print("\n正在关闭服务...")
        self.running = False
        self.shutdown_event.set()

        if self.data_buffer:
            print(f"缓冲区还有 {len(self.data_buffer)} 条数据，正在进行最后一次聚合...")
            await self.aggregate_and_push()

        print("服务已关闭")

    async def run(self):
        loop = asyncio.get_running_loop()

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, lambda: asyncio.create_task(self.shutdown()))
            except NotImplementedError:
                pass

        await asyncio.gather(
            self.consume_kafka_messages(),
            self.start_websocket_server(),
            return_exceptions=True
        )


if __name__ == "__main__":
    try:
        processor = UserBehaviorProcessor()
        asyncio.run(processor.run())
    except KeyboardInterrupt:
        print("\n服务被用户中断")
    except Exception as e:
        print(f"\n服务异常退出: {e}")
