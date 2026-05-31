from typing import Dict, List, Any
from collections import defaultdict

from app.tasks.celery_config import celery_app
from app.storage.influxdb import influx_storage
from app.storage.redis import redis_storage
from app.anomaly.detector import anomaly_detector
from app.anomaly.notifier import alert_notifier
from app.anomaly.history import anomaly_history_store


def calculate_p99(durations: List[float]) -> float:
    if not durations:
        return 0.0
    sorted_durations = sorted(durations)
    index = int(len(sorted_durations) * 0.99)
    if index >= len(sorted_durations):
        index = len(sorted_durations) - 1
    return sorted_durations[index]


def calculate_avg(durations: List[float]) -> float:
    if not durations:
        return 0.0
    return sum(durations) / len(durations)


def build_topology(spans: List[Dict[str, Any]]) -> Dict[str, Any]:
    nodes = set()
    edges = defaultdict(lambda: {"call_count": 0, "durations": []})
    
    span_id_to_service: Dict[str, str] = {}
    span_id_to_span: Dict[str, Dict[str, Any]] = {}
    
    for span in spans:
        span_id = span.get("span_id", "")
        service_name = span.get("service_name")
        
        if service_name:
            nodes.add(service_name)
        
        if span_id and service_name:
            span_id_to_service[span_id] = service_name
            span_id_to_span[span_id] = span
    
    for span in spans:
        target_service = span.get("service_name")
        parent_span_id = span.get("parent_span_id", "")
        duration = span.get("duration", 0)
        
        if not target_service:
            continue
        
        if parent_span_id and parent_span_id in span_id_to_service:
            source_service = span_id_to_service[parent_span_id]
            
            if source_service and target_service and source_service != target_service:
                key = f"{source_service}->{target_service}"
                edges[key]["call_count"] += 1
                edges[key]["durations"].append(duration)
    
    topology_nodes = [{"service_name": node} for node in nodes]
    topology_edges = []
    
    for key, data in edges.items():
        source, target = key.split("->", 1)
        topology_edges.append({
            "source": source,
            "target": target,
            "call_count": data["call_count"],
            "avg_latency_ms": calculate_avg(data["durations"]),
            "p99_latency_ms": calculate_p99(data["durations"])
        })
    
    return {
        "nodes": topology_nodes,
        "edges": topology_edges
    }


def collect_service_latencies(spans: List[Dict[str, Any]]) -> Dict[str, List[float]]:
    service_latencies = defaultdict(list)
    
    for span in spans:
        service_name = span.get("service_name")
        duration = span.get("duration", 0)
        
        if service_name:
            service_latencies[service_name].append(duration)
    
    return service_latencies


def prepare_anomaly_data(
    current_latencies: Dict[str, List[float]],
    historical_latencies: Dict[str, List[float]]
) -> Dict[str, Dict[str, Any]]:
    anomaly_data = {}
    
    for service_name, current_durations in current_latencies.items():
        if not current_durations:
            continue
        
        current_avg = calculate_avg(current_durations)
        historical = historical_latencies.get(service_name, [])
        
        if len(historical) > 0:
            anomaly_data[service_name] = {
                "current": current_avg,
                "historical": historical
            }
    
    return anomaly_data


@celery_app.task(name="app.tasks.topology.update_service_topology")
def update_service_topology(time_range: str = "-5m"):
    spans = influx_storage.query_topology_data(time_range)
    topology = build_topology(spans)
    redis_storage.save_topology(topology)
    return topology


@celery_app.task(name="app.tasks.topology.detect_anomalies")
def detect_anomalies(
    current_time_range: str = "-5m",
    historical_time_range: str = "-24h"
):
    current_spans = influx_storage.query_service_calls(current_time_range)
    historical_spans = influx_storage.query_service_calls(historical_time_range)
    
    current_latencies = collect_service_latencies(current_spans)
    historical_latencies = collect_service_latencies(historical_spans)
    
    anomaly_data = prepare_anomaly_data(current_latencies, historical_latencies)
    
    anomalies = anomaly_detector.batch_detect(anomaly_data)
    
    if anomalies:
        anomaly_history_store.add_batch_anomalies(anomalies)
        alert_notifier.send_batch_alerts(anomalies)
    
    return {
        "anomalies_detected": len(anomalies),
        "anomalies": anomalies
    }
