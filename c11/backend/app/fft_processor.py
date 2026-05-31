import numpy as np
from typing import List, Dict
import json
import time


class FftProcessor:
    def __init__(self, fft_size: int = 1024):
        self.fft_size = fft_size
        self.window = self._generate_hann_window(fft_size)
    
    def _generate_hann_window(self, size: int) -> np.ndarray:
        n = np.arange(size)
        return 0.5 * (1 - np.cos(2 * np.pi * n / (size - 1)))
    
    def analyze(self, samples: np.ndarray, sample_rate: int, timestamp: float) -> Dict:
        if len(samples.shape) > 1:
            samples = samples.mean(axis=1)
        
        if len(samples) > self.fft_size:
            samples = samples[:self.fft_size]
        elif len(samples) < self.fft_size:
            samples = np.pad(samples, (0, self.fft_size - len(samples)), 'constant')
        
        windowed = samples * self.window
        fft_result = np.fft.rfft(windowed)
        magnitudes = np.abs(fft_result)
        magnitudes_db = 20 * np.log10(magnitudes + 1e-10)
        
        half_size = self.fft_size // 2
        frequencies = np.fft.rfftfreq(self.fft_size, d=1.0 / sample_rate)
        
        return {
            "frequencies": frequencies[:half_size].tolist(),
            "magnitudes": magnitudes_db[:half_size].tolist(),
            "sample_rate": sample_rate,
            "fft_size": self.fft_size,
            "timestamp": timestamp
        }
    
    def process_audio_stream(
        self, 
        audio_data: np.ndarray, 
        sample_rate: int, 
        hop_size: int = 512
    ):
        num_samples = len(audio_data)
        if len(audio_data.shape) > 1:
            audio_data = audio_data.mean(axis=1)
        
        start = 0
        frame_idx = 0
        
        while start + self.fft_size <= num_samples:
            samples = audio_data[start:start + self.fft_size]
            timestamp = frame_idx * (hop_size / sample_rate)
            spectrum = self.analyze(samples, sample_rate, timestamp)
            yield spectrum, frame_idx
            start += hop_size
            frame_idx += 1
