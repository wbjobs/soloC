import random
from datetime import datetime
from typing import Dict, List
from .base_collector import BaseCollector, WeatherData


class LocalSensorCollector(BaseCollector):
    def __init__(self, sensor_id: str = "local_sensor_001"):
        super().__init__("local_sensor")
        self.sensor_id = sensor_id

    def _read_sensor_data(self) -> Dict:
        return {
            "temperature": random.uniform(15.0, 35.0),
            "humidity": random.uniform(30.0, 90.0),
            "pressure": random.uniform(980.0, 1050.0),
            "wind_speed": random.uniform(0.0, 20.0),
            "wind_direction": random.uniform(0.0, 360.0),
            "precipitation": random.uniform(0.0, 10.0)
        }

    def collect(self, location: str, lat: float, lon: float) -> WeatherData:
        sensor_data = self._read_sensor_data()

        weather_data = WeatherData(
            timestamp=datetime.now(),
            location=location,
            latitude=lat,
            longitude=lon,
            temperature=round(sensor_data["temperature"], 2),
            humidity=round(sensor_data["humidity"], 2),
            pressure=round(sensor_data["pressure"], 2),
            wind_speed=round(sensor_data["wind_speed"], 2),
            wind_direction=round(sensor_data["wind_direction"], 2),
            precipitation=round(sensor_data["precipitation"], 2),
            data_source=self.source_name,
            quality_score=0.90
        )

        return self.clean_data(weather_data)

    def batch_collect(self, locations: List[Dict]) -> List[WeatherData]:
        results = []
        for loc in locations:
            result = self.collect(
                location=loc["name"],
                lat=loc["lat"],
                lon=loc["lon"]
            )
            results.append(result)
        return results
