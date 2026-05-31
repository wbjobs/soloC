import numpy as np
import io
from typing import Tuple, Optional
from pathlib import Path

try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False

try:
    from pydub import AudioSegment
    HAS_PYDUB = True
except ImportError:
    HAS_PYDUB = False


class AudioLoader:
    @staticmethod
    def load_audio(file_path: Path) -> Tuple[np.ndarray, int]:
        suffix = file_path.suffix.lower()
        
        if suffix == '.wav' and HAS_SOUNDFILE:
            return AudioLoader._load_with_soundfile(file_path)
        elif suffix in ['.mp3', '.wav'] and HAS_PYDUB:
            return AudioLoader._load_with_pydub(file_path)
        else:
            raise ValueError(f"无法加载音频格式: {suffix}")
    
    @staticmethod
    def load_audio_from_bytes(audio_bytes: bytes, file_type: str) -> Tuple[np.ndarray, int]:
        file_type = file_type.lower()
        
        if file_type == 'wav' and HAS_SOUNDFILE:
            return AudioLoader._load_bytes_with_soundfile(audio_bytes)
        elif file_type in ['mp3', 'wav'] and HAS_PYDUB:
            return AudioLoader._load_bytes_with_pydub(audio_bytes, file_type)
        else:
            raise ValueError(f"无法处理音频格式: {file_type}")
    
    @staticmethod
    def _load_with_soundfile(file_path: Path) -> Tuple[np.ndarray, int]:
        data, sr = sf.read(str(file_path))
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        return data.astype(np.float64), sr
    
    @staticmethod
    def _load_with_pydub(file_path: Path) -> Tuple[np.ndarray, int]:
        audio = AudioSegment.from_file(str(file_path))
        samples = np.array(audio.get_array_of_samples())
        
        if audio.channels > 1:
            samples = samples.reshape((-1, audio.channels)).mean(axis=1)
        
        max_val = float(2 ** (audio.sample_width * 8 - 1))
        normalized = samples.astype(np.float64) / max_val
        
        return normalized, audio.frame_rate
    
    @staticmethod
    def _load_bytes_with_soundfile(audio_bytes: bytes) -> Tuple[np.ndarray, int]:
        buffer = io.BytesIO(audio_bytes)
        data, sr = sf.read(buffer)
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        return data.astype(np.float64), sr
    
    @staticmethod
    def _load_bytes_with_pydub(audio_bytes: bytes, file_type: str) -> Tuple[np.ndarray, int]:
        buffer = io.BytesIO(audio_bytes)
        audio = AudioSegment.from_file(buffer, format=file_type)
        samples = np.array(audio.get_array_of_samples())
        
        if audio.channels > 1:
            samples = samples.reshape((-1, audio.channels)).mean(axis=1)
        
        max_val = float(2 ** (audio.sample_width * 8 - 1))
        normalized = samples.astype(np.float64) / max_val
        
        return normalized, audio.frame_rate
