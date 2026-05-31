import json
import random
import time
from kafka import KafkaProducer
from dotenv import load_dotenv
import os

load_dotenv()

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC")

def create_producer():
    return KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda x: json.dumps(x).encode("utf-8")
    )

def generate_user_behavior():
    user_ids = list(range(1, 101))
    pages = ["home", "product", "cart", "checkout", "profile"]
    action_types = ["view", "click", "order"]
    
    return {
        "user_id": random.choice(user_ids),
        "page": random.choice(pages),
        "action_type": random.choices(action_types, weights=[0.6, 0.3, 0.1])[0],
        "timestamp": time.time()
    }

def main():
    producer = create_producer()
    print(f"开始向Kafka Topic {KAFKA_TOPIC} 发送测试数据...")
    print("按 Ctrl+C 停止")
    
    try:
        count = 0
        while True:
            data = generate_user_behavior()
            producer.send(KAFKA_TOPIC, value=data)
            count += 1
            
            if count % 10 == 0:
                print(f"已发送 {count} 条消息，最新: user={data['user_id']}, action={data['action_type']}, page={data['page']}")
            
            time.sleep(random.uniform(0.1, 0.5))
    except KeyboardInterrupt:
        print(f"\n停止，共发送 {count} 条消息")
    finally:
        producer.close()

if __name__ == "__main__":
    main()
