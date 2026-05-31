import random
from datetime import datetime, timedelta
from typing import Dict, List
from .base_collector import BaseCollector, WeatherData


class HistoricalDBCollector(BaseCollector):
    def __init__(self, db_config: Dict = None):
        super().__init__("historical_db")
        self.db_config = db_config or {}

    def _generate_historical_data(self, location: str, lat: float, lon: float, days_back: int = 30) -> List[WeatherData]:
        historical_data = []
        base_temp = random.uniform(10.0, 25.0)

        for day in range(days_back):
            for hour in range(0, 24, 6):
                timestamp = datetime.now() - timedelta(days=day, hours=hour)
                temp_variation = random.uniform(-5.0, 5.0)
                daily_variation = -5.0 if hour < 6 or hour > 18 else 0.0

                weather_data = WeatherData(
                    timestamp=timestamp,
                    location=location,
                    latitude=lat,
                    longitude=lon,
                    temperature=round(base_temp + temp_variation + daily_variation, 2),
                    humidity=round(random.uniform(40.0, 80.0), 2),
                    pressure=round(random.uniform(1000.0, 1030.0), 2),
                    wind_speed=round(random.uniform(2.0, 15.0), 2),
                    wind_direction=round(random.uniform(0.0, 360.0), 2),
                    precipitation=round(random.uniform(0.0, 20.0), 2),
                    data_source=self.source_name,
                    quality_score=0.85
                )
                historical_data.append(weather_data)

        return historical_data

    def collect(self, location: str, lat: float, lon: float) -> WeatherData:
        historical_data = self._generate_historical_data(location, lat, lon, days_back=1)
        return historical_data[0] if historical_data else WeatherData(
            timestamp=datetime.now(),
            location=location,
            latitude=lat,
            longitude=lon,
            data_source=self.source_name,
            quality_score=0.0
        )

    def batch_collect(self, locations: List[Dict]) -> List[WeatherData]:
        results = []
        for loc in locations:
            historical_data = self._generate_historical_data(
                location=loc["name"],
                lat=loc["lat"],
                lon=loc["lon"],
                days_back=loc.get("days_back", 30)
            )
            results.extend(historical_data)
        return results
