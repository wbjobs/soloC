# Trace Fault CLI Tool

A distributed tracing fault analysis tool with gRPC client/server architecture and ClickHouse integration.

## Features

- **Query Traces**: Query traces by time and service name
- **Call Chain Graphs**: Generate call chain graphs in DOT format
- **Root Cause Analysis**: Identify root cause (earliest timestamp error or longest duration)
- **JSON Summary**: Output detailed JSON summary
- **Active Monitoring**: Watch mode with sliding window analysis and alerting
- **Sliding Window Count**: Track error rates in configurable time windows
- **Alerting**: File-based and webhook alerts with cooldown protection
- **gRPC Architecture**: High-performance gRPC client/server with connection pooling
- **ClickHouse Integration**: Optimized queries with partition pruning

## Installation

```bash
pip install poetry
poetry install
```

## Usage

### Start the gRPC Server

```bash
poetry run trace-fault-server
```

### Query Mode (Single Trace Analysis)

```bash
poetry run trace-fault query --time "2025-05-11T10:00:00Z" --service payment
```

Query Options:
- `--time`: Time of the trace in ISO format (required)
- `--service`: Service name to query (required)
- `--output`: Output format - dot/json/both (default: both)
- `--server`: gRPC server address (default: localhost:50051)

### Watch Mode (Active Monitoring)

```bash
poetry run trace-fault watch --service payment --interval 30 --window 5 --threshold 3
```

Watch Options:
- `--service`: Service name to monitor (required)
- `--interval`: Polling interval in seconds (default: 30)
- `--window`: Sliding window in minutes for error rate calculation (default: 5)
- `--threshold`: Alert threshold in errors per minute (default: 3)
- `--alert-file`: File to write alerts to (default: fault_alerts.log)
- `--webhook`: Webhook URL for HTTP alerts
- `--server`: gRPC server address (default: localhost:50051)

## Configuration

Copy `.env.example` to `.env` and configure:

```env
GRPC_SERVER_PORT=50051
GRPC_SERVER_ADDR=localhost:50051
GRPC_MAX_WORKERS=50

CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default

ALERT_FILE=fault_alerts.log
ALERT_WEBHOOK_URL=https://your-webhook-url.com/alert
```

## Project Structure

```
trace-fault/
├── trace_fault/
│   ├── __init__.py
│   ├── cli.py              # CLI client (query + watch modes)
│   ├── server.py           # gRPC server with WatchFaults endpoint
│   ├── clickhouse_client.py # ClickHouse client with singleton pattern
│   ├── trace_analyzer.py   # Trace analysis and DOT generation
│   ├── sliding_window.py   # Sliding window counter for error rate analysis
│   ├── notifier.py         # Alert notifier (file + webhook)
│   ├── tracefault_pb2.py   # Generated protobuf
│   └── tracefault_pb2_grpc.py # Generated gRPC stubs
├── protos/
│   └── tracefault.proto    # gRPC protocol definition
├── pyproject.toml
├── .env.example
└── README.md
```
