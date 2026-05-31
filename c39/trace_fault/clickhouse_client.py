import os
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import clickhouse_connect
from dotenv import load_dotenv

load_dotenv()

class ClickHouseClient:
    _instance: Optional['ClickHouseClient'] = None
    _client: Optional[clickhouse_connect.driver.Client] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized') and self._initialized:
            return
        self.host = os.getenv('CLICKHOUSE_HOST', 'localhost')
        self.port = int(os.getenv('CLICKHOUSE_PORT', '8123'))
        self.user = os.getenv('CLICKHOUSE_USER', 'default')
        self.password = os.getenv('CLICKHOUSE_PASSWORD', '')
        self.database = os.getenv('CLICKHOUSE_DATABASE', 'default')
        self._initialized = True

    def _get_client(self):
        if ClickHouseClient._client is None:
            ClickHouseClient._client = clickhouse_connect.get_client(
                host=self.host,
                port=self.port,
                username=self.user,
                password=self.password,
                database=self.database,
                query_limit=0,
                send_receive_timeout=300
            )
        return ClickHouseClient._client

    def query_traces(self, time_str: str, service: str, time_window_hours: int = 12) -> List[Dict[str, Any]]:
        client = self._get_client()

        target_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
        start_time = target_time - timedelta(hours=time_window_hours)
        end_time = target_time + timedelta(hours=time_window_hours)

        partition_start_date = start_time.date()
        partition_end_date = end_time.date()

        query = """
            SELECT 
                trace_id,
                span_id,
                parent_span_id,
                error_code,
                service_name,
                duration,
                timestamp,
                operation
            FROM traces
            WHERE 
                service_name = %s
                AND timestamp BETWEEN %s AND %s
                AND toDate(timestamp) BETWEEN %s AND %s
            ORDER BY timestamp ASC
        """

        result = client.query(
            query, 
            parameters=[service, start_time, end_time, partition_start_date, partition_end_date]
        )
        
        logs = []
        for row in result.result_rows:
            logs.append({
                'trace_id': str(row[0]),
                'span_id': str(row[1]),
                'parent_span_id': str(row[2]) if row[2] else '',
                'error_code': str(row[3]) if row[3] else '',
                'service_name': str(row[4]),
                'duration': int(row[5]),
                'timestamp': row[6].isoformat() if hasattr(row[6], 'isoformat') else str(row[6]),
                'operation': str(row[7]) if row[7] else ''
            })

        return logs

    def query_mock_traces(self, time_str: str, service: str) -> List[Dict[str, Any]]:
        import uuid
        from datetime import datetime, timedelta
        
        trace_id = str(uuid.uuid4())
        base_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
        
        mock_data = [
            {
                'trace_id': trace_id,
                'span_id': 'span-001',
                'parent_span_id': '',
                'error_code': '',
                'service_name': service,
                'duration': 5000,
                'timestamp': base_time.isoformat().replace('+00:00', 'Z'),
                'operation': 'handle_payment_request'
            },
            {
                'trace_id': trace_id,
                'span_id': 'span-002',
                'parent_span_id': 'span-001',
                'error_code': '',
                'service_name': 'auth',
                'duration': 200,
                'timestamp': (base_time + timedelta(milliseconds=10)).isoformat().replace('+00:00', 'Z'),
                'operation': 'validate_token'
            },
            {
                'trace_id': trace_id,
                'span_id': 'span-003',
                'parent_span_id': 'span-001',
                'error_code': 'ERR_NETWORK_FAILURE',
                'service_name': 'gateway',
                'duration': 1000,
                'timestamp': (base_time + timedelta(milliseconds=100)).isoformat().replace('+00:00', 'Z'),
                'operation': 'forward_request'
            },
            {
                'trace_id': trace_id,
                'span_id': 'span-004',
                'parent_span_id': 'span-003',
                'error_code': 'ERR_DB_TIMEOUT',
                'service_name': 'database',
                'duration': 4500,
                'timestamp': (base_time + timedelta(milliseconds=200)).isoformat().replace('+00:00', 'Z'),
                'operation': 'update_balance'
            },
            {
                'trace_id': trace_id,
                'span_id': 'span-005',
                'parent_span_id': 'span-004',
                'error_code': '',
                'service_name': 'cache',
                'duration': 100,
                'timestamp': (base_time + timedelta(milliseconds=500)).isoformat().replace('+00:00', 'Z'),
                'operation': 'invalidate_cache'
            },
            {
                'trace_id': trace_id,
                'span_id': 'span-006',
                'parent_span_id': 'span-001',
                'error_code': 'ERR_NOTIF_FAILED',
                'service_name': 'notification',
                'duration': 300,
                'timestamp': (base_time + timedelta(milliseconds=600)).isoformat().replace('+00:00', 'Z'),
                'operation': 'send_receipt'
            }
        ]
        
        for i in range(20):
            mock_data.append({
                'trace_id': str(uuid.uuid4()),
                'span_id': f'span-err-{i}',
                'parent_span_id': '',
                'error_code': 'ERR_PAYMENT_FAILED',
                'service_name': service,
                'duration': 100 + i,
                'timestamp': (base_time + timedelta(seconds=i)).isoformat().replace('+00:00', 'Z'),
                'operation': 'process_payment'
            })
        
        return mock_data
