import os
import json
from datetime import datetime
from typing import Dict, Any

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


class Notifier:
    def __init__(self, alert_file: str = None, webhook_url: str = None):
        self.alert_file = alert_file or os.getenv('ALERT_FILE', 'fault_alerts.log')
        self.webhook_url = webhook_url or os.getenv('ALERT_WEBHOOK_URL', '')
        self._sent_alerts: Dict[str, datetime] = {}

    def _should_send_alert(self, alert_key: str, cooldown_minutes: int = 5) -> bool:
        last_sent = self._sent_alerts.get(alert_key)
        if last_sent is None:
            return True
        return (datetime.now() - last_sent).total_seconds() > cooldown_minutes * 60

    def send_alert(self, alert: Dict[str, Any], cooldown_minutes: int = 5) -> bool:
        alert_key = f"{alert['service_name']}:{alert['error_code']}"
        
        if not self._should_send_alert(alert_key, cooldown_minutes):
            return False

        self._write_to_file(alert)
        self._sent_alerts[alert_key] = datetime.now()

        if self.webhook_url and HAS_REQUESTS:
            self._send_webhook(alert)

        return True

    def _write_to_file(self, alert: Dict[str, Any]):
        timestamp = datetime.now().isoformat()
        log_entry = json.dumps({
            'timestamp': timestamp,
            'alert': alert
        }, ensure_ascii=False)
        
        with open(self.alert_file, 'a', encoding='utf-8') as f:
            f.write(log_entry + '\n')

    def _send_webhook(self, alert: Dict[str, Any]) -> bool:
        if not self.webhook_url or not HAS_REQUESTS:
            return False
        
        payload = {
            'title': f"Fault Alert: {alert['error_code']}",
            'service': alert['service_name'],
            'message': alert['message'],
            'current_count': alert['current_count'],
            'threshold': alert['threshold'],
            'timestamp': alert.get('timestamp', datetime.now().isoformat())
        }

        try:
            response = requests.post(
                self.webhook_url,
                json=payload,
                headers={'Content-Type': 'application/json'},
                timeout=5
            )
            return response.status_code in (200, 204)
        except Exception:
            return False
