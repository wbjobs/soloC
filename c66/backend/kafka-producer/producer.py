import json
import time
import random
import numpy as np
from kafka import KafkaProducer
from kafka.errors import KafkaError
from datetime import datetime

class Level2DataProducer:
    def __init__(self, bootstrap_servers='localhost:9092', topic='level2_data'):
        self.topic = topic
        self.producer = KafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            retries=3,
            acks='all'
        )
        self.symbol = 'BTC-USDT'
        self.base_price = 50000.0
        self.price_std = 10.0
        
    def generate_order(self, side):
        price = self.base_price + np.random.normal(0, self.price_std)
        quantity = abs(np.random.normal(0, 1)) * random.choice([0.1, 1, 5, 10, 50, 100])
        order_type = random.choice(['limit', 'market'])
        return {
            'symbol': self.symbol,
            'side': side,
            'price': round(price, 2),
            'quantity': round(quantity, 4),
            'order_type': order_type,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
    
    def produce(self, interval=0.1):
        print(f"Starting Level-2 data producer on topic: {self.topic}")
        try:
            while True:
                side = random.choice(['buy', 'sell'])
                order = self.generate_order(side)
                future = self.producer.send(self.topic, order)
                try:
                    future.get(timeout=10)
                except KafkaError as e:
                    print(f"Failed to send message: {e}")
                
                if random.random() < 0.3:
                    self.base_price += np.random.normal(0, 0.5)
                
                time.sleep(interval)
        except KeyboardInterrupt:
            print("\nStopping producer...")
        finally:
            self.producer.close()

if __name__ == '__main__':
    producer = Level2DataProducer()
    producer.produce()
