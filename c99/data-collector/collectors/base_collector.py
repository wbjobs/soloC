from abc import ABC, abstractmethod
from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, validator
import pytz


class WeatherData(BaseModel):
    timestamp: datetime
    location: str
    latitude: float
    longitude: float
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    wind_speed: Optional[float] = None
    wind_direction: Optional[float] = None
    precipitation: Optional[float] = None
    data_source: str
    quality_score: float = Field(default=1.0, ge=0.0, le=1.0)

    @validator('timestamp', pre=True, always=True)
    def parse_timestamp(cls, v):
        if isinstance(v, datetime):
            if v.tzinfo is None:
                return pytz.timezone('Asia/Shanghai').localize(v)
            return v
        if isinstance(v, (int, float)):
            dt = datetime.fromtimestamp(v)
            return pytz.timezone('Asia/Shanghai').localize(dt)
        if isinstance(v, str):
            formats = [
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y/%m/%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%d/%m/%Y %H:%M:%S",
                "%Y%m%d%H%M%S"
            ]
            for fmt in formats:
                try:
                    dt = datetime.strptime(v, fmt)
                    return pytz.timezone('Asia/Shanghai').localize(dt)
                except ValueError:
                    continue
            raise ValueError(f"无法解析时间格式: {v}")
        return v


class BaseCollector(ABC):
    def __init__(self, source_name: str):
        self.source_name = source_name
        self.timezone = pytz.timezone('Asia/Shanghai')

    @abstractmethod
    def collect(self, location: str, lat: float, lon: float) -> WeatherData:
        pass

    @abstractmethod
    def batch_collect(self, locations: List[Dict]) -> List[WeatherData]:
        pass

    def normalize_timestamp(self, timestamp: Any) -> datetime:
        if isinstance(timestamp, datetime):
            if timestamp.tzinfo is None:
                return self.timezone.localize(timestamp)
            return timestamp.astimezone(self.timezone)
        if isinstance(timestamp, (int, float)):
            dt = datetime.fromtimestamp(timestamp)
            return self.timezone.localize(dt)
        return self.timezone.localize(datetime.now())

    def clean_data(self, data: WeatherData) -> WeatherData:
        if data.temperature is not None:
            if data.temperature < -100 or data.temperature > 60:
                data.temperature = None
                data.quality_score *= 0.8

        if data.humidity is not None:
            if data.humidity < 0 or data.humidity > 100:
                data.humidity = None
                data.quality_score *= 0.8

        if data.pressure is not None:
            if data.pressure < 800 or data.pressure > 1100:
                data.pressure = None
                data.quality_score *= 0.8

        if data.wind_speed is not None:
            if data.wind_speed < 0 or data.wind_speed > 150:
                data.wind_speed = None
                data.quality_score *= 0.8

        return data
