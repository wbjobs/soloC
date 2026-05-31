import sys
sys.path.insert(0, '.')
from trace_fault.clickhouse_client import ClickHouseClient
from trace_fault.trace_analyzer import TraceAnalyzer

print("=" * 60)
print("Test 1: Root Cause Algorithm (Multiple Errors)")
print("=" * 60)
client = ClickHouseClient()
logs = client.query_mock_traces('2025-05-11T10:00:00Z', 'payment')
analyzer = TraceAnalyzer(logs)
root_cause = analyzer.find_root_cause()
print('Root Cause:', root_cause)
print()
print('All errors:')
for log in logs:
    if log['error_code']:
        print(f'  {log["span_id"]} - {log["error_code"]} at {log["timestamp"]}')

print()
print("=" * 60)
print("Test 2: ClickHouse Singleton Connection")
print("=" * 60)
client1 = ClickHouseClient()
client2 = ClickHouseClient()
print(f'Client 1 == Client 2: {client1 is client2}')
print(f'Connection pooling works: {client1._get_client() is client2._get_client()}')

print()
print("=" * 60)
print("Test 3: DOT Graph Generation")
print("=" * 60)
dot_graph = analyzer.generate_dot_graph(root_cause)
print(dot_graph)
