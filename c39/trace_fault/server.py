import grpc
from concurrent import futures
import os
from datetime import datetime, timedelta
from collections import defaultdict
from dotenv import load_dotenv

from . import tracefault_pb2
from . import tracefault_pb2_grpc
from .clickhouse_client import ClickHouseClient
from .trace_analyzer import TraceAnalyzer
from .sliding_window import SlidingWindowCounter

load_dotenv()

class TraceFaultService(tracefault_pb2_grpc.TraceFaultServiceServicer):
    def __init__(self):
        self.clickhouse_client = ClickHouseClient()
        self.sliding_window = SlidingWindowCounter(window_minutes=5)

    def QueryTrace(self, request, context):
        time_str = request.time
        service = request.service

        try:
            logs = self.clickhouse_client.query_mock_traces(time_str, service)
        except Exception as e:
            logs = self.clickhouse_client.query_mock_traces(time_str, service)

        analyzer = TraceAnalyzer(logs)
        root_cause = analyzer.find_root_cause()
        dot_graph = analyzer.generate_dot_graph(root_cause)
        json_summary = analyzer.generate_json_summary(root_cause)

        log_entries = []
        for log in logs:
            log_entries.append(tracefault_pb2.LogEntry(
                trace_id=log['trace_id'],
                span_id=log['span_id'],
                parent_span_id=log['parent_span_id'],
                error_code=log['error_code'],
                service_name=log['service_name'],
                duration=log['duration'],
                timestamp=log['timestamp'],
                operation=log['operation']
            ))

        root_cause_msg = tracefault_pb2.RootCause(
            span_id=root_cause.get('span_id', ''),
            reason=root_cause.get('reason', ''),
            service_name=root_cause.get('service_name', ''),
            error_code=root_cause.get('error_code', ''),
            duration=root_cause.get('duration', 0)
        )

        return tracefault_pb2.TraceResponse(
            logs=log_entries,
            dot_graph=dot_graph,
            root_cause=root_cause_msg,
            json_summary=json_summary
        )

    def WatchFaults(self, request, context):
        service = request.service
        window_minutes = request.window_minutes or 5
        threshold = request.threshold or 3

        window_end = datetime.utcnow()
        window_start = window_end - timedelta(minutes=window_minutes)

        error_counts = defaultdict(int)
        for _ in range(10):
            mock_time = window_start + timedelta(seconds=(_ * 30))
            logs = self.clickhouse_client.query_mock_traces(
                mock_time.isoformat() + 'Z', service
            )
            for log in logs:
                if log['error_code']:
                    error_counts[(log['service_name'], log['error_code'])] += 1

        error_count_msgs = []
        alerts = []
        for (svc, err_code), count in error_counts.items():
            rate = count / window_minutes
            threshold_exceeded = rate >= threshold
            
            error_count_msgs.append(tracefault_pb2.ErrorCount(
                error_code=err_code,
                service_name=svc,
                count=count,
                rate_per_minute=rate,
                threshold_exceeded=threshold_exceeded
            ))

            if threshold_exceeded:
                alerts.append(tracefault_pb2.Alert(
                    error_code=err_code,
                    service_name=svc,
                    message=f"Error rate exceeded threshold: {rate:.2f}/min (threshold: {threshold}/min)",
                    current_count=count,
                    threshold=threshold,
                    timestamp=window_end.isoformat() + 'Z'
                ))

        summary = f"Checked {len(error_counts)} error types in last {window_minutes} minutes. "
        summary += f"{len(alerts)} alert(s) triggered."

        return tracefault_pb2.WatchResponse(
            error_counts=error_count_msgs,
            alerts=alerts,
            summary=summary,
            window_start=window_start.isoformat() + 'Z',
            window_end=window_end.isoformat() + 'Z'
        )

def main():
    port = os.getenv('GRPC_SERVER_PORT', '50051')
    max_workers = int(os.getenv('GRPC_MAX_WORKERS', '50'))
    
    server_options = [
        ('grpc.keepalive_time_ms', 30000),
        ('grpc.keepalive_timeout_ms', 10000),
        ('grpc.keepalive_permit_without_calls', True),
        ('grpc.max_connection_idle_ms', 300000),
        ('grpc.max_receive_message_length', 100 * 1024 * 1024),
        ('grpc.max_send_message_length', 100 * 1024 * 1024),
    ]
    
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=max_workers),
        options=server_options
    )
    tracefault_pb2_grpc.add_TraceFaultServiceServicer_to_server(
        TraceFaultService(), server
    )
    server.add_insecure_port(f'[::]:{port}')
    server.start()
    print(f'TraceFault gRPC server started on port {port} with {max_workers} workers')
    server.wait_for_termination()

if __name__ == '__main__':
    main()
