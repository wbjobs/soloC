import json
from typing import List, Dict, Any
from datetime import datetime

import redis

from app.config import settings


class AnomalyHistoryStore:
    def __init__(self):
        self.client = redis.Redis.from_url(settings.REDIS_URL)
        self.key = "anomaly_history"
        self.max_items = settings.ANOMALY_HISTORY_MAX_ITEMS

    def add_anomaly(self, anomaly: Dict[str, Any]) -> None:
        record = {
            **anomaly,
            "stored_at": datetime.utcnow().isoformat() + "Z"
        }
        
        self.client.lpush(self.key, json.dumps(record))
        self.client.ltrim(self.key, 0, self.max_items - 1)

    def add_batch_anomalies(self, anomalies: List[Dict[str, Any]]) -> int:
        count = 0
        for anomaly in anomalies:
            self.add_anomaly(anomaly)
            count += 1
        return count

    def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        records = self.client.lrange(self.key, 0, limit - 1)
        
        result = []
        for record in records:
            try:
                result.append(json.loads(record.decode("utf-8")))
            except Exception:
                continue
        
        return result

    def clear_history(self) -> None:
        self.client.delete(self.key)


anomaly_history_store = AnomalyHistoryStore()