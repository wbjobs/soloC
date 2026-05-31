import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from contextlib import contextmanager

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

from app.config import settings


class InfluxDBStorage:
    _instances = {}
    
    def __init__(self):
        self.client = InfluxDBClient(
            url=settings.INFLUXDB_URL,
            token=settings.INFLUXDB_TOKEN,
            org=settings.INFLUXDB_ORG
        )
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()

    def write_span(self, span: Dict[str, Any]) -> None:
        point = Point("span") \
            .tag("span_id", span.get("span_id", "")) \
            .tag("service_name", span["service_name"]) \
            .tag("operation", span["operation"]) \
            .tag("parent_span_id", span.get("parent_span_id", "")) \
            .field("duration", span["duration"]) \
            .field("metadata", json.dumps(span.get("metadata", {}))) \
            .time(span["timestamp"], WritePrecision.NS)
        
        self.write_api.write(
            bucket=settings.INFLUXDB_BUCKET,
            org=settings.INFLUXDB_ORG,
            record=point
        )

    def write_spans_batch(self, spans: List[Dict[str, Any]]) -> None:
        for span in spans:
            self.write_span(span)

    def query_service_calls(self, time_range: str = "-1h") -> List[Dict[str, Any]]:
        query = f'''
        from(bucket: "{settings.INFLUXDB_BUCKET}")
            |> range(start: {time_range})
            |> filter(fn: (r) => r._measurement == "span")
            |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> keep(columns: ["_time", "span_id", "service_name", "operation", "parent_span_id", "duration", "metadata"])
        '''
        tables = self.query_api.query(query)
        
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "span_id": record.values.get("span_id", ""),
                    "timestamp": record.get_time().isoformat(),
                    "service_name": record.values.get("service_name"),
                    "operation": record.values.get("operation"),
                    "parent_span_id": record.values.get("parent_span_id"),
                    "duration": record.values.get("duration", 0),
                    "metadata": json.loads(record.values.get("metadata", "{}"))
                })
        
        return results

    def query_topology_data(self, time_range: str = "-5m") -> List[Dict[str, Any]]:
        return self.query_service_calls(time_range)

    def query_slow_calls(
        self, 
        service_name: str, 
        threshold_ms: int, 
        limit: int = 100,
        time_range: str = "-24h"
    ) -> List[Dict[str, Any]]:
        query = f'''
        from(bucket: "{settings.INFLUXDB_BUCKET}")
            |> range(start: {time_range})
            |> filter(fn: (r) => r._measurement == "span")
            |> filter(fn: (r) => r.service_name == "{service_name}")
            |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> filter(fn: (r) => r.duration > {threshold_ms})
            |> sort(columns: ["duration"], desc: true)
            |> limit(n: {limit})
            |> keep(columns: ["_time", "span_id", "service_name", "operation", "parent_span_id", "duration", "metadata"])
        '''
        tables = self.query_api.query(query)
        
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "span_id": record.values.get("span_id", ""),
                    "timestamp": record.get_time().isoformat(),
                    "service_name": record.values.get("service_name"),
                    "operation": record.values.get("operation"),
                    "parent_span_id": record.values.get("parent_span_id"),
                    "duration": record.values.get("duration", 0),
                    "metadata": json.loads(record.values.get("metadata", "{}"))
                })
        
        return results

    def close(self):
        self.client.close()


def get_influx_storage() -> InfluxDBStorage:
    if "default" not in InfluxDBStorage._instances:
        InfluxDBStorage._instances["default"] = InfluxDBStorage()
    return InfluxDBStorage._instances["default"]


influx_storage = get_influx_storage()
