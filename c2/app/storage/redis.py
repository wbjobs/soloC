import json
import redis

from app.config import settings


class RedisStorage:
    def __init__(self):
        self.client = redis.Redis.from_url(settings.REDIS_URL)

    def save_topology(self, topology: dict) -> None:
        self.client.set(
            "service_topology",
            json.dumps(topology),
            ex=3600
        )

    def get_topology(self) -> dict:
        data = self.client.get("service_topology")
        if data:
            return json.loads(data)
        return {"nodes": [], "edges": []}

    def close(self):
        self.client.close()


redis_storage = RedisStorage()
