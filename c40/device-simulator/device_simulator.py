import paho.mqtt.client as mqtt
import json
import time
import random
import threading
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
MQTT_TOPIC = os.getenv('MQTT_TOPIC', 'devices/data')
NUM_DEVICES = int(os.getenv('NUM_DEVICES', 100))
PUBLISH_INTERVAL = int(os.getenv('PUBLISH_INTERVAL', 5))

class DeviceSimulator:
    def __init__(self, device_id):
        self.device_id = device_id
        self.base_temp = random.uniform(40, 60)
        self.base_vibration = random.uniform(0.5, 2.0)
        self.base_current = random.uniform(5, 15)
        self.temp_trend = 0
        
    def generate_data(self):
        hour = datetime.now().hour
        day_factor = 1 + 0.1 * abs(hour - 12) / 12
        
        self.temp_trend += random.uniform(-0.05, 0.1)
        self.temp_trend = max(-5, min(5, self.temp_trend))
        
        temperature = self.base_temp + self.temp_trend + random.gauss(0, 2) * day_factor
        vibration = self.base_vibration + random.gauss(0, 0.3)
        current = self.base_current + random.gauss(0, 1)
        
        if random.random() < 0.02:
            temperature += random.uniform(10, 25)
        
        return {
            'deviceId': f'device_{self.device_id:03d}',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'temperature': round(temperature, 2),
            'vibration': round(vibration, 3),
            'current': round(current, 2)
        }

def publish_device_data(client, device):
    while True:
        data = device.generate_data()
        payload = json.dumps(data)
        client.publish(MQTT_TOPIC, payload, qos=1)
        print(f"Published: {data['deviceId']} - Temp: {data['temperature']}°C")
        time.sleep(PUBLISH_INTERVAL)

def on_connect(client, userdata, flags, rc):
    print(f"Connected with result code {rc}")

def main():
    client = mqtt.Client()
    client.on_connect = on_connect
    
    print(f"Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}...")
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return
    
    client.loop_start()
    
    devices = [DeviceSimulator(i) for i in range(NUM_DEVICES)]
    
    print(f"Starting {NUM_DEVICES} device simulators...")
    threads = []
    for device in devices:
        t = threading.Thread(target=publish_device_data, args=(client, device))
        t.daemon = True
        t.start()
        threads.append(t)
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping simulators...")
        client.loop_stop()
        client.disconnect()

if __name__ == '__main__':
    main()
