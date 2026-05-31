import json
import logging
from typing import Dict, List, Any
from datetime import datetime

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

from app.config import settings


logger = logging.getLogger(__name__)


class AlertNotifier:
    def __init__(self):
        self.webhook_url = settings.ALERT_WEBHOOK_URL
        self.timeout = settings.ALERT_WEBHOOK_TIMEOUT

    def send_webhook(self, anomaly: Dict[str, Any]) -> bool:
        if not self.webhook_url:
            logger.info(f"Webhook未配置，跳过告警发送: {anomaly}")
            return True
        
        if not HAS_REQUESTS:
            logger.error("requests库未安装，无法发送Webhook")
            return False
        
        payload = {
            "alert_type": "anomaly_detected",
            "service_name": anomaly["service_name"],
            "timestamp": anomaly["timestamp"],
            "severity": "critical" if anomaly["z_score"] > 4 else "warning",
            "message": f"服务 {anomaly['service_name']} 检测到延迟异常",
            "details": {
                "current_latency_ms": anomaly["current_latency_ms"],
                "historical_mean_ms": anomaly["historical_mean_ms"],
                "historical_std_ms": anomaly["historical_std_ms"],
                "z_score": anomaly["z_score"],
                "sigma_threshold": anomaly["sigma_threshold"],
                "anomaly_type": anomaly["anomaly_type"]
            }
        }
        
        try:
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=self.timeout
            )
            response.raise_for_status()
            logger.info(f"告警发送成功: {anomaly['service_name']}")
            return True
        except Exception as e:
            logger.error(f"告警发送失败: {str(e)}")
            return False

    def send_batch_alerts(self, anomalies: List[Dict[str, Any]]) -> Dict[str, int]:
        success = 0
        failed = 0
        
        for anomaly in anomalies:
            if self.send_webhook(anomaly):
                success += 1
            else:
                failed += 1
        
        return {"success": success, "failed": failed}


alert_notifier = AlertNotifier()