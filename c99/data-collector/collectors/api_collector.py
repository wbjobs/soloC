import requests
from datetime import datetime
from typing import Dict, List
from .base_collector import BaseCollector, WeatherData


class OpenWeatherCollector(BaseCollector):
    def __init__(self, api_key: str, base_url: str = "https://api.openweathermap.org/data/2.5"):
        super().__init__("openweather_api")
        self.api_key = api_key
        self.base_url = base_url

    def collect(self, location: str, lat: float, lon: float) -> WeatherData:
        try:
            params = {
                "lat": lat,
                "lon": lon,
                "appid": self.api_key,
                "units": "metric"
            }
            response = requests.get(f"{self.base_url}/weather", params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            weather_data = WeatherData(
                timestamp=datetime.now(),
                location=location,
                latitude=lat,
                longitude=lon,
                temperature=data.get("main", {}).get("temp"),
                humidity=data.get("main", {}).get("humidity"),
                pressure=data.get("main", {}).get("pressure"),
                wind_speed=data.get("wind", {}).get("speed"),
                wind_direction=data.get("wind", {}).get("deg"),
                precipitation=data.get("rain", {}).get("1h", 0),
                data_source=self.source_name,
                quality_score=0.95
            )

            return self.clean_data(weather_data)
        except Exception as e:
            print(f"Error collecting from OpenWeather: {e}")
            return WeatherData(
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
            result = self.collect(
                location=loc["name"],
                lat=loc["lat"],
                lon=loc["lon"]
            )
            results.append(result)
        return results
