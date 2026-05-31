import os
import time
import logging
from datetime import datetime
from typing import List, Dict
from dotenv import load_dotenv
from apscheduler.schedulers.blocking import BlockingScheduler
from collectors import (
    OpenWeatherCollector,
    LocalSensorCollector,
    HistoricalDBCollector
)
from collectors.retry_handler import RetryHandler, AlertManager, CircuitBreaker
from database import DataStorage

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('collector.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class EnhancedDataCollectorScheduler:
    def __init__(self):
        self.api_key = os.getenv('OPENWEATHER_API_KEY', '')
        self.collect_interval = int(os.getenv('COLLECT_INTERVAL', 30))
        self.alert_threshold = int(os.getenv('ALERT_THRESHOLD', 5))

        self.locations = [
            {"name": "北京", "lat": 39.9042, "lon": 116.4074},
            {"name": "上海", "lat": 31.2304, "lon": 121.4737},
            {"name": "广州", "lat": 23.1291, "lon": 113.2644},
            {"name": "深圳", "lat": 22.5431, "lon": 114.0579},
            {"name": "成都", "lat": 30.5728, "lon": 104.0668},
        ]

        self.collectors = {}
        self.retry_handlers = {}
        self.circuit_breakers = {}
        self.alert_manager = AlertManager(alert_threshold=self.alert_threshold)
        self.alert_manager.add_notification_callback(self._send_alert_notification)

        self._init_collectors()

        self.storage = DataStorage()
        self.scheduler = BlockingScheduler()
        self.stats = {
            'total_collections': 0,
            'successful_collections': 0,
            'failed_collections': 0,
            'records_saved': 0
        }

    def _init_collectors(self):
        if self.api_key:
            collector = OpenWeatherCollector(self.api_key)
            self.collectors['openweather_api'] = collector
            self.retry_handlers['openweather_api'] = RetryHandler(max_retries=3)
            self.circuit_breakers['openweather_api'] = CircuitBreaker(failure_threshold=10)

        local_collector = LocalSensorCollector()
        self.collectors['local_sensor'] = local_collector
        self.retry_handlers['local_sensor'] = RetryHandler(max_retries=2)
        self.circuit_breakers['local_sensor'] = CircuitBreaker(failure_threshold=5)

        historical_collector = HistoricalDBCollector()
        self.collectors['historical_db'] = historical_collector
        self.retry_handlers['historical_db'] = RetryHandler(max_retries=5)
        self.circuit_breakers['historical_db'] = CircuitBreaker(failure_threshold=15)

    def _send_alert_notification(self, alert: Dict):
        logger.warning(f"ALERT [{alert['severity'].upper()}]: {alert['message']}")
        if alert['severity'] == 'critical':
            logger.error(f"CRITICAL ALERT for {alert['collector']}: {alert['error']}")

    def _collect_from_single_source(self, collector_name: str, location: Dict) -> List:
        if not self.circuit_breakers[collector_name].can_execute():
            logger.warning(f"Circuit breaker OPEN for {collector_name}, skipping collection")
            return []

        retry_handler = self.retry_handlers[collector_name]
        collector = self.collectors[collector_name]

        try:
            result = retry_handler.execute_with_retry(
                collector.collect,
                location['name'],
                location['lat'],
                location['lon']
            )
            self.circuit_breakers[collector_name].record_success()
            return [result]
        except Exception as e:
            self.circuit_breakers[collector_name].record_failure()
            self.alert_manager.check_for_alerts(
                collector_name,
                self.circuit_breakers[collector_name].failure_count,
                str(e)
            )
            logger.error(f"Failed to collect from {collector_name}: {e}")
            return []

    def collect_all_sources(self):
        logger.info("Starting data collection cycle...")
        self.stats['total_collections'] += 1

        all_data = []

        for collector_name in self.collectors:
            collector_data = []
            for location in self.locations:
                try:
                    results = self._collect_from_single_source(collector_name, location)
                    collector_data.extend(results)
                except Exception as e:
                    logger.error(f"Error in {collector_name} for {location['name']}: {e}")

            if collector_data:
                all_data.extend(collector_data)
                logger.info(f"Collected {len(collector_data)} records from {collector_name}")

        if all_data:
            try:
                self.storage.batch_save(all_data)
                self.stats['records_saved'] += len(all_data)
                self.stats['successful_collections'] += 1
                logger.info(f"Saved {len(all_data)} records to database")
            except Exception as e:
                self.stats['failed_collections'] += 1
                logger.error(f"Error saving to database: {e}")
        else:
            self.stats['failed_collections'] += 1
            logger.warning("No data collected in this cycle")

        self._print_stats()
        logger.info("Collection cycle completed.\n")

    def collect_historical_data(self, days_back: int = 30):
        logger.info(f"Collecting historical data for the past {days_back} days...")

        if 'historical_db' not in self.collectors:
            logger.error("Historical DB collector not initialized")
            return

        collector = self.collectors['historical_db']
        retry_handler = self.retry_handlers['historical_db']

        historical_data = []
        for loc in self.locations:
            try:
                result = retry_handler.execute_with_retry(
                    collector._generate_historical_data,
                    loc['name'],
                    loc['lat'],
                    loc['lon'],
                    days_back
                )
                historical_data.extend(result)
                logger.info(f"Collected {len(result)} historical records for {loc['name']}")
            except Exception as e:
                logger.error(f"Error collecting historical data for {loc['name']}: {e}")

        if historical_data:
            try:
                self.storage.batch_save(historical_data)
                logger.info(f"Saved {len(historical_data)} historical records to database")
            except Exception as e:
                logger.error(f"Error saving historical data: {e}")

    def _print_stats(self):
        logger.info(f"Collection Stats - Total: {self.stats['total_collections']}, "
                   f"Success: {self.stats['successful_collections']}, "
                   f"Failed: {self.stats['failed_collections']}, "
                   f"Records: {self.stats['records_saved']}")

        circuit_status = {name: cb.get_status()['state'] for name, cb in self.circuit_breakers.items()}
        logger.info(f"Circuit Breaker Status: {circuit_status}")

    def get_collector_status(self) -> Dict:
        return {
            'stats': self.stats,
            'circuit_breakers': {
                name: cb.get_status() for name, cb in self.circuit_breakers.items()
            },
            'alerts': self.alert_manager.get_alerts(),
            'active_collectors': list(self.collectors.keys())
        }

    def start(self):
        logger.info("=" * 60)
        logger.info("Enhanced Weather Data Collector Scheduler")
        logger.info("=" * 60)
        logger.info(f"Collect interval: {self.collect_interval} minutes")
        logger.info(f"Locations: {[loc['name'] for loc in self.locations]}")
        logger.info(f"Active collectors: {list(self.collectors.keys())}")
        logger.info(f"Alert threshold: {self.alert_threshold} consecutive failures")
        logger.info("=" * 60)

        self.scheduler.add_job(
            self.collect_all_sources,
            'interval',
            minutes=self.collect_interval,
            next_run_time=datetime.now()
        )

        try:
            self.scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            logger.info("Shutting down scheduler...")
            self.storage.close()
            self._print_stats()


def main():
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == 'historical':
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
        scheduler = EnhancedDataCollectorScheduler()
        scheduler.collect_historical_data(days)
    else:
        scheduler = EnhancedDataCollectorScheduler()
        scheduler.start()


if __name__ == "__main__":
    main()
