import numpy as np
from scipy import signal
import mne
from typing import Dict, List, Tuple


class EEGProcessor:
    def __init__(self, sampling_rate: int = 256, n_channels: int = 4):
        self.sampling_rate = sampling_rate
        self.n_channels = n_channels
        self.band_ranges = {
            'delta': (0.5, 4),
            'theta': (4, 8),
            'alpha': (8, 13),
            'beta': (13, 30),
            'gamma': (30, 50)
        }
        self.info = mne.create_info(
            ch_names=[f'EEG{i+1}' for i in range(n_channels)],
            sfreq=sampling_rate,
            ch_types=['eeg'] * n_channels
        )

    def remove_artifacts(self, data: np.ndarray) -> np.ndarray:
        cleaned_data = data.copy()
        
        cleaned_data = self._remove_bad_channels(cleaned_data)
        cleaned_data = self._bandpass_filter(cleaned_data)
        cleaned_data = self._remove_eye_blinks(cleaned_data)
        
        return cleaned_data

    def _remove_bad_channels(self, data: np.ndarray) -> np.ndarray:
        for i in range(data.shape[0]):
            channel_std = np.std(data[i])
            if channel_std > 1000:
                data[i] = np.nanmean(data, axis=0)
        return data

    def _bandpass_filter(self, data: np.ndarray) -> np.ndarray:
        nyquist = self.sampling_rate / 2
        low = 0.5 / nyquist
        high = 50 / nyquist
        b, a = signal.butter(4, [low, high], btype='band')
        return signal.filtfilt(b, a, data, axis=1)

    def _remove_eye_blinks(self, data: np.ndarray) -> np.ndarray:
        if data.shape[1] < 100:
            return data
        
        try:
            raw = mne.io.RawArray(data, self.info, verbose=False)
            ica = mne.preprocessing.ICA(n_components=min(3, data.shape[0]), 
                                       random_state=97, 
                                       max_iter=800,
                                       verbose=False)
            ica.fit(raw)
            
            eog_idx, scores = ica.find_bads_eog(raw, ch_name='EEG1', verbose=False)
            
            if eog_idx:
                ica.exclude = eog_idx
                cleaned_data = ica.apply(raw, verbose=False).get_data()
                return cleaned_data
        except Exception:
            pass
        
        return data

    def compute_band_powers(self, data: np.ndarray) -> Dict[str, float]:
        n_samples = data.shape[1]
        
        freqs, psd = signal.welch(
            data,
            fs=self.sampling_rate,
            nperseg=min(n_samples, 256),
            axis=1
        )
        
        band_powers = {}
        for band, (low, high) in self.band_ranges.items():
            mask = (freqs >= low) & (freqs <= high)
            band_power = np.sum(psd[:, mask], axis=1)
            total_power = np.sum(psd, axis=1)
            relative_power = np.mean(band_power / (total_power + 1e-10))
            band_powers[band] = float(relative_power)
        
        return band_powers

    def compute_attention_score(self, band_powers: Dict[str, float]) -> float:
        alpha = band_powers.get('alpha', 0)
        beta = band_powers.get('beta', 0)
        theta = band_powers.get('theta', 0)
        delta = band_powers.get('delta', 0)
        
        attention_ratio = (beta + alpha) / (theta + delta + 1e-10)
        
        attention_score = min(100, max(0, attention_ratio * 30))
        
        return float(attention_score)

    def process_epoch(self, epoch_data: np.ndarray) -> Tuple[Dict[str, float], float]:
        cleaned_data = self.remove_artifacts(epoch_data)
        band_powers = self.compute_band_powers(cleaned_data)
        attention_score = self.compute_attention_score(band_powers)
        return band_powers, attention_score


class RealTimeBuffer:
    def __init__(self, buffer_size: int = 256, processor: EEGProcessor = None):
        self.buffer_size = buffer_size
        self.processor = processor or EEGProcessor()
        self.buffer = np.zeros((4, buffer_size))
        self.buffer_index = 0
        self.timestamp = 0

    def add_sample(self, channel_data: List[float]) -> Tuple[bool, Dict, float]:
        self.buffer[:, self.buffer_index] = channel_data[:4]
        self.buffer_index += 1
        self.timestamp += 1 / self.processor.sampling_rate

        if self.buffer_index >= self.buffer_size:
            self.buffer_index = 0
            band_powers, attention = self.processor.process_epoch(self.buffer)
            return True, band_powers, attention
        
        return False, {}, 0

    def get_current_data(self) -> np.ndarray:
        return self.buffer.copy()
