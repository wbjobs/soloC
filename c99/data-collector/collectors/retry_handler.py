import time
import logging
from datetime import datetime
from typing import Callable, Any, Dict, List
from functools import wraps


class RetryHandler:
    def __init__(self, max_retries=3, base_delay=1.0, max_delay=60.0, backoff_factor=2.0):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_factor = backoff_factor
        self.failure_count = 0
        self.consecutive_failures = 0
        self.retry_history = []

    def calculate_delay(self, attempt):
        delay = self.base_delay * (self.backoff_factor ** attempt)
        return min(delay, self.max_delay)

    def execute_with_retry(self, func: Callable, *args, **kwargs) -> Any:
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                result = func(*args, **kwargs)
                self.consecutive_failures = 0
                return result
            except Exception as e:
                last_exception = e
                self.failure_count += 1
                self.consecutive_failures += 1
                
                self.retry_history.append({
                    'timestamp': datetime.now().isoformat(),
                    'attempt': attempt + 1,
                    'error': str(e),
                    'function': func.__name__
                })
                
                if attempt < self.max_retries - 1:
                    delay = self.calculate_delay(attempt)
                    time.sleep(delay)
        
        raise last_exception


class AlertManager:
    def __init__(self, alert_threshold=5):
        self.alert_threshold = alert_threshold
        self.alerts = []
        self.notification_callbacks = []

    def add_notification_callback(self, callback: Callable):
        self.notification_callbacks.append(callback)

    def check_for_alerts(self, collector_name: str, failure_count: int, error: str = None):
        if failure_count >= self.alert_threshold:
            alert = {
                'type': 'COLLECTOR_FAILURE',
                'collector': collector_name,
                'message': f'{collector_name} has failed {failure_count} times consecutively',
                'severity': 'critical' if failure_count >= 10 else 'warning',
                'timestamp': datetime.now().isoformat(),
                'error': error
            }
            self.alerts.append(alert)
            
            for callback in self.notification_callbacks:
                try:
                    callback(alert)
                except Exception as e:
                    logging.error(f"Notification callback failed: {e}")

    def get_alerts(self, severity: str = None) -> List[Dict]:
        if severity:
            return [a for a in self.alerts if a['severity'] == severity]
        return self.alerts

    def clear_alerts(self):
        self.alerts = []


def with_retry(retry_handler: RetryHandler, alert_manager: AlertManager = None, collector_name: str = None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return retry_handler.execute_with_retry(func, *args, **kwargs)
            except Exception as e:
                if alert_manager and collector_name:
                    alert_manager.check_for_alerts(
                        collector_name,
                        retry_handler.consecutive_failures,
                        str(e)
                    )
                raise
        return wrapper
    return decorator


class CircuitBreaker:
    def __init__(self, failure_threshold=10, recovery_timeout=300):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.state = 'CLOSED'
        self.last_failure_time = None

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = 'OPEN'

    def record_success(self):
        self.failure_count = 0
        self.state = 'CLOSED'

    def can_execute(self) -> bool:
        if self.state == 'CLOSED':
            return True
        elif self.state == 'OPEN':
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = 'HALF_OPEN'
                return True
            return False
        elif self.state == 'HALF_OPEN':
            return True
        return False

    def get_status(self) -> Dict:
        return {
            'state': self.state,
            'failure_count': self.failure_count,
            'last_failure': datetime.fromtimestamp(self.last_failure_time).isoformat() if self.last_failure_time else None
        }
