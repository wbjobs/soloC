import os
import time
from datetime import datetime
from typing import List, Dict
from dotenv import load_dotenv
from apscheduler.schedulers.blocking import BlockingScheduler
from collectors import (
    OpenWeatherCollector,
    LocalSensorCollector,
    HistoricalDBCollector,
    WeatherData
)
from database import DataStorage

load_dotenv()


class DataCollectorScheduler:
    def __init__(self):
        self.api_key = os.getenv('OPENWEATHER_API_KEY', '')
        self.collect_interval = int(os.getenv('COLLECT_INTERVAL', 30))

        self.locations = [
            {"name": "北京", "lat": 39.9042, "lon": 116.4074},
            {"name": "上海", "lat": 31.2304, "lon": 121.4737},
            {"name": "广州", "lat": 23.1291, "lon": 113.2644},
            {"name": "深圳", "lat": 22.5431, "lon": 114.0579},
            {"name": "成都", "lat": 30.5728, "lon": 104.0668},
        ]

        self.collectors = []
        if self.api_key:
            self.collectors.append(OpenWeatherCollector(self.api_key))
        self.collectors.append(LocalSensorCollector())

        self.storage = DataStorage()
        self.scheduler = BlockingScheduler()

    def collect_all_sources(self):
        print(f"[{datetime.now()}] Starting data collection...")

        all_data: List[WeatherData] = []

        for collector in self.collectors:
            try:
                print(f"Collecting from {collector.source_name}...")
                data = collector.batch_collect(self.locations)
                all_data.extend(data)
                print(f"Collected {len(data)} records from {collector.source_name}")
            except Exception as e:
                print(f"Error collecting from {collector.source_name}: {e}")

        if all_data:
            try:
                self.storage.batch_save(all_data)
                print(f"Saved {len(all_data)} records to database")
            except Exception as e:
                print(f"Error saving to database: {e}")

        print(f"[{datetime.now()}] Collection completed.\n")

    def collect_historical_data(self, days_back: int = 30):
        print(f"Collecting historical data for the past {days_back} days...")

        historical_collector = HistoricalDBCollector()
        locations_with_days = [
            {**loc, "days_back": days_back}
            for loc in self.locations
        ]

        historical_data = historical_collector.batch_collect(locations_with_days)

        if historical_data:
            try:
                self.storage.batch_save(historical_data)
                print(f"Saved {len(historical_data)} historical records to database")
            except Exception as e:
                print(f"Error saving historical data: {e}")

    def start(self):
        print("=" * 50)
        print("Weather Data Collector Scheduler")
        print("=" * 50)
        print(f"Collect interval: {self.collect_interval} minutes")
        print(f"Locations: {[loc['name'] for loc in self.locations]}")
        print(f"Active collectors: {[c.source_name for c in self.collectors]}")
        print("=" * 50)

        self.scheduler.add_job(
            self.collect_all_sources,
            'interval',
            minutes=self.collect_interval,
            next_run_time=datetime.now()
        )

        try:
            self.scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            print("Shutting down scheduler...")
            self.storage.close()


def main():
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == 'historical':
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        scheduler = DataCollectorScheduler()
        scheduler.collect_historical_data(days)
    else:
        scheduler = DataCollectorScheduler()
        scheduler.start()


if __name__ == "__main__":
    main()
