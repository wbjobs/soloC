import json
import logging
from typing import Dict, List, Any, Optional
from collections import defaultdict
from datetime import datetime

import numpy as np

from app.config import settings


logger = logging.getLogger(__name__)


class AnomalyDetector:
    def __init__(self):
        self.sigma_threshold = settings.ANOMALY_SIGMA_THRESHOLD
        self.min_data_points = settings.ANOMALY_MIN_DATA_POINTS

    def _calculate_statistics(self, values: List[float]) -> Dict[str, float]:
        if not values or len(values) < self.min_data_points:
            return {
                "mean": 0.0,
                "std": 0.0,
                "count": len(values) if values else 0
            }
        
        arr = np.array(values)
        mean = float(np.mean(arr))
        std = float(np.std(arr))
        
        return {
            "mean": mean,
            "std": std,
            "count": len(values)
        }

    def _is_anomaly(self, value: float, mean: float, std: float) -> bool:
        if std == 0:
            return False
        z_score = abs((value - mean) / std)
        return z_score > self.sigma_threshold

    def detect_service_anomalies(
        self,
        service_name: str,
        current_latency: float,
        historical_latencies: List[float]
    ) -> Optional[Dict[str, Any]]:
        stats = self._calculate_statistics(historical_latencies)
        
        if stats["count"] < self.min_data_points:
            return None
        
        is_anomaly = self._is_anomaly(
            current_latency, stats["mean"], stats["std"])
        
        if not is_anomaly:
            return None
        
        z_score = abs((current_latency - stats["mean"]) / stats["std"]) if stats["std"] > 0 else 0
        
        return {
            "service_name": service_name,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "current_latency_ms": current_latency,
            "historical_mean_ms": stats["mean"],
            "historical_std_ms": stats["std"],
            "z_score": z_score,
            "sigma_threshold": self.sigma_threshold,
            "anomaly_type": "latency_spike" if current_latency > stats["mean"] else "latency_drop"
        }

    def batch_detect(
        self,
        service_latency_map: Dict[str, Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        anomalies = []
        
        for service_name, data in service_latency_map.items():
            current = data.get("current")
            historical = data.get("historical", [])
            
            anomaly = self.detect_service_anomalies(
                service_name, current, historical
            )
            
            if anomaly:
                anomalies.append(anomaly)
        
        return anomalies


anomaly_detector = AnomalyDetector()