import redis
import json
from datetime import datetime
from typing import List, Dict, Any
from config import settings

class EventStore:
    def __init__(self):
        self.redis_client = redis.from_url(settings.REDIS_URL)
        self.stream_name = settings.REDIS_STREAM_NAME
        
    def publish_event(self, event_type: str, data: Dict[str, Any], contract_symbol: str = None) -> str:
        event = {
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": json.dumps(data),
            "contract_symbol": contract_symbol or "global"
        }
        message_id = self.redis_client.xadd(self.stream_name, event)
        return message_id
    
    def publish_price_update(self, symbol: str, price: float, timestamp: float = None) -> str:
        data = {
            "symbol": symbol,
            "price": price,
            "timestamp": timestamp or datetime.utcnow().timestamp()
        }
        return self.publish_event("stock_price_update", data, symbol)
    
    def publish_option_pricing(self, result) -> str:
        data = {
            "contract_symbol": result.inputs.contract_symbol,
            "option_type": result.inputs.option_type.value,
            "S": result.inputs.S,
            "K": result.inputs.K,
            "T": result.inputs.T,
            "r": result.inputs.r,
            "sigma": result.inputs.sigma,
            "price": result.price,
            "greeks": {
                "delta": result.greeks.delta,
                "gamma": result.greeks.gamma,
                "theta": result.greeks.theta,
                "vega": result.greeks.vega,
                "rho": result.greeks.rho
            },
            "timestamp": result.timestamp
        }
        return self.publish_event("option_pricing", data, result.inputs.contract_symbol)
    
    def read_events(self, last_id: str = "0", count: int = 100) -> List[Dict[str, Any]]:
        events = self.redis_client.xread({self.stream_name: last_id}, count=count)
        parsed_events = []
        for stream, messages in events:
            for msg_id, msg_data in messages:
                parsed_events.append({
                    "id": msg_id,
                    "event_type": msg_data.get(b"event_type").decode(),
                    "timestamp": msg_data.get(b"timestamp").decode(),
                    "data": json.loads(msg_data.get(b"data").decode()),
                    "contract_symbol": msg_data.get(b"contract_symbol").decode()
                })
        return parsed_events
    
    def read_events_by_contract(self, contract_symbol: str, last_id: str = "0", count: int = 100) -> List[Dict[str, Any]]:
        all_events = self.read_events(last_id, count * 10)
        return [e for e in all_events if e["contract_symbol"] == contract_symbol][:count]
    
    def get_latest_price(self, symbol: str) -> Dict[str, Any]:
        events = self.read_events_by_contract(symbol, count=100)
        price_events = [e for e in events if e["event_type"] == "stock_price_update"]
        if price_events:
            return price_events[-1]["data"]
        return None
    
    def create_consumer_group(self, group_name: str):
        try:
            self.redis_client.xgroup_create(self.stream_name, group_name, id="0", mkstream=True)
        except redis.exceptions.ResponseError:
            pass
    
    def read_from_group(self, group_name: str, consumer_name: str, count: int = 10) -> List[Dict[str, Any]]:
        messages = self.redis_client.xreadgroup(
            group_name,
            consumer_name,
            {self.stream_name: ">"},
            count=count
        )
        parsed_events = []
        for stream, msgs in messages:
            for msg_id, msg_data in msgs:
                parsed_events.append({
                    "id": msg_id,
                    "event_type": msg_data.get(b"event_type").decode(),
                    "timestamp": msg_data.get(b"timestamp").decode(),
                    "data": json.loads(msg_data.get(b"data").decode()),
                    "contract_symbol": msg_data.get(b"contract_symbol").decode()
                })
        return parsed_events
    
    def ack_message(self, group_name: str, message_id: str):
        self.redis_client.xack(self.stream_name, group_name, message_id)
    
    def trim_stream(self, maxlen: int = 10000):
        self.redis_client.xtrim(self.stream_name, maxlen=maxlen)

event_store = EventStore()
