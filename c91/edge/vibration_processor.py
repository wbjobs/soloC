import numpy as np
from scipy.fft import fft, next_fast_len
import asyncio
import websockets
import json
import requests
import time
import random
from datetime import datetime

class VibrationProcessor:
    def __init__(self, device_id, sample_rate=1000):
        self.device_id = device_id
        self.sample_rate = sample_rate
        
    def generate_mock_data(self, duration=1.0):
        n_samples = int(duration * self.sample_rate)
        t = np.linspace(0, duration, n_samples)
        
        base_freq = 50
        signal = np.sin(2 * np.pi * base_freq * t) * 10
        signal += np.sin(2 * np.pi * base_freq * 2 * t) * 5
        signal += np.random.normal(0, 1, n_samples)
        
        if random.random() < 0.1:
            anomaly_amp = random.uniform(30, 80)
            anomaly_start = random.randint(0, n_samples - 100)
            signal[anomaly_start:anomaly_start+100] += anomaly_amp
        
        return signal.tolist()
    
    def apply_window(self, signal, window_type='hann'):
        signal_np = np.array(signal)
        n = len(signal_np)
        
        if window_type == 'hann':
            window = np.hanning(n)
        elif window_type == 'hamming':
            window = np.hamming(n)
        elif window_type == 'blackman':
            window = np.blackman(n)
        else:
            window = np.ones(n)
        
        return signal_np * window
    
    def compute_fft(self, signal):
        signal_np = np.array(signal)
        n = len(signal_np)
        
        n_fft = next_fast_len(n)
        
        padded_signal = np.zeros(n_fft)
        padded_signal[:n] = signal_np
        
        windowed_signal = self.apply_window(padded_signal, 'hann')
        
        yf = fft(windowed_signal)
        xf = np.linspace(0.0, self.sample_rate/2.0, n_fft//2)
        
        magnitude = 2.0 / n * np.abs(yf[0:n_fft//2])
        
        magnitude_db = 20 * np.log10(magnitude + 1e-10)
        
        return {
            "frequencies": xf.tolist(),
            "magnitudes": magnitude.tolist(),
            "magnitudes_db": magnitude_db.tolist(),
            "n_fft": n_fft,
            "original_length": n
        }
    
    def extract_features(self, signal):
        signal_np = np.array(signal)
        peak_value = np.max(np.abs(signal_np))
        rms_value = np.sqrt(np.mean(signal_np**2))
        return float(peak_value), float(rms_value)
    
    def send_to_backend(self, raw_data, fft_data, peak_value, rms_value):
        url = f"http://localhost:3001/api/data/{self.device_id}"
        payload = {
            "raw_data": raw_data,
            "fft_data": fft_data,
            "peak_value": peak_value,
            "rms_value": rms_value,
            "timestamp": datetime.utcnow().isoformat()
        }
        try:
            response = requests.post(url, json=payload, timeout=10)
            return response.json()
        except Exception as e:
            print(f"Error sending data: {e}")
            return None
    
    async def process_and_send(self, websocket):
        while True:
            raw_data = self.generate_mock_data()
            fft_data = self.compute_fft(raw_data)
            peak_value, rms_value = self.extract_features(raw_data)
            
            result = self.send_to_backend(raw_data, fft_data, peak_value, rms_value)
            
            ws_message = {
                "type": "vibration_data",
                "device_id": self.device_id,
                "timestamp": datetime.utcnow().isoformat(),
                "peak_value": peak_value,
                "rms_value": rms_value,
                "is_anomaly": result.get("is_anomaly", False) if result else False
            }
            
            try:
                await websocket.send(json.dumps(ws_message))
            except:
                pass
            
            await asyncio.sleep(1)

async def main():
    device_ids = ["device_001", "device_002", "device_003"]
    processors = [VibrationProcessor(dev_id) for dev_id in device_ids]
    
    backend_url = "http://localhost:3001/api/devices"
    device_names = ["电机 A-1", "泵 B-2", "风机 C-3"]
    locations = ["车间 A", "车间 B", "车间 C"]
    
    for i, dev_id in enumerate(device_ids):
        try:
            requests.post(backend_url, json={
                "id": dev_id,
                "name": device_names[i],
                "location": locations[i],
                "threshold_peak": 50,
                "threshold_rms": 20
            }, timeout=10)
            print(f"Registered device: {dev_id}")
        except Exception as e:
            print(f"Error registering device {dev_id}: {e}")
    
    uri = "ws://localhost:8080"
    try:
        async with websockets.connect(uri, ping_interval=30, ping_timeout=60) as websocket:
            print(f"Connected to WebSocket server at {uri}")
            tasks = [processor.process_and_send(websocket) for processor in processors]
            await asyncio.gather(*tasks)
    except Exception as e:
        print(f"WebSocket connection error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
