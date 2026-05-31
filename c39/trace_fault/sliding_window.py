from datetime import datetime, timedelta
from collections import defaultdict, deque
from typing import Dict, Deque, Tuple


class SlidingWindowCounter:
    def __init__(self, window_minutes: int = 5):
        self.window_minutes = window_minutes
        self._buckets: Dict[Tuple[str, str], Deque[datetime]] = defaultdict(deque)

    def _clean_old_buckets(self, key: Tuple[str, str], current_time: datetime):
        cutoff = current_time - timedelta(minutes=self.window_minutes)
        bucket = self._buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

    def increment(self, service_name: str, error_code: str, event_time: datetime = None):
        if event_time is None:
            event_time = datetime.utcnow()
        key = (service_name, error_code)
        self._buckets[key].append(event_time)
        self._clean_old_buckets(key, event_time)

    def get_count(self, service_name: str, error_code: str, current_time: datetime = None) -> int:
        if current_time is None:
            current_time = datetime.utcnow()
        key = (service_name, error_code)
        self._clean_old_buckets(key, current_time)
        return len(self._buckets[key])

    def get_rate_per_minute(self, service_name: str, error_code: str, current_time: datetime = None) -> float:
        count = self.get_count(service_name, error_code, current_time)
        return count / self.window_minutes

    def get_all_counts(self, current_time: datetime = None) -> Dict[Tuple[str, str], int]:
        if current_time is None:
            current_time = datetime.utcnow()
        for key in list(self._buckets.keys()):
            self._clean_old_buckets(key, current_time)
            if not self._buckets[key]:
                del self._buckets[key]
        return {key: len(bucket) for key, bucket in self._buckets.items()}
