import click
import grpc
import os
import time
from datetime import datetime
from dotenv import load_dotenv

from . import tracefault_pb2
from . import tracefault_pb2_grpc
from .notifier import Notifier

load_dotenv()

class GRPCConnectionPool:
    _channels = {}
    _stubs = {}

    @classmethod
    def get_stub(cls, server_addr: str):
        if server_addr not in cls._channels:
            channel_options = [
                ('grpc.keepalive_time_ms', 30000),
                ('grpc.keepalive_timeout_ms', 10000),
                ('grpc.keepalive_permit_without_calls', True),
                ('grpc.max_connection_idle_ms', 300000),
                ('grpc.max_receive_message_length', 100 * 1024 * 1024),
            ]
            cls._channels[server_addr] = grpc.insecure_channel(
                server_addr,
                options=channel_options
            )
            cls._stubs[server_addr] = tracefault_pb2_grpc.TraceFaultServiceStub(
                cls._channels[server_addr]
            )
        return cls._stubs[server_addr]

    @classmethod
    def close_all(cls):
        for channel in cls._channels.values():
            channel.close()
        cls._channels.clear()
        cls._stubs.clear()

@click.group()
def cli():
    pass

@cli.command()
@click.option('--time', required=True, help='Time of the trace in ISO format, e.g. "2025-05-11T10:00:00Z"')
@click.option('--service', required=True, help='Service name to query')
@click.option('--output', type=click.Choice(['dot', 'json', 'both']), default='both', help='Output format')
@click.option('--server', default=None, help='gRPC server address (host:port)')
def query(time, service, output, server):
    if not server:
        server = os.getenv('GRPC_SERVER_ADDR', 'localhost:50051')

    stub = GRPCConnectionPool.get_stub(server)
    response = stub.QueryTrace(tracefault_pb2.TraceRequest(time=time, service=service))

    click.echo(click.style('=' * 60, fg='cyan'))
    click.echo(click.style(f'Trace Fault Analysis for {service} at {time}', fg='cyan', bold=True))
    click.echo(click.style('=' * 60, fg='cyan'))
    click.echo()

    click.echo(click.style('Root Cause Analysis:', fg='yellow', bold=True))
    click.echo(f'  Span ID: {response.root_cause.span_id}')
    click.echo(f'  Service: {response.root_cause.service_name}')
    click.echo(f'  Reason: {response.root_cause.reason}')
    if response.root_cause.error_code:
        click.echo(click.style(f'  Error Code: {response.root_cause.error_code}', fg='red'))
    click.echo(f'  Duration: {response.root_cause.duration}ms')
    click.echo()

    if output in ['dot', 'both']:
        click.echo(click.style('DOT Graph:', fg='green', bold=True))
        click.echo(response.dot_graph)
        click.echo()

    if output in ['json', 'both']:
        click.echo(click.style('JSON Summary:', fg='green', bold=True))
        click.echo(response.json_summary)
        click.echo()

@cli.command()
@click.option('--service', required=True, help='Service name to monitor')
@click.option('--interval', default=30, help='Polling interval in seconds (default: 30)')
@click.option('--window', default=5, help='Sliding window in minutes (default: 5)')
@click.option('--threshold', default=3, help='Alert threshold in errors per minute (default: 3)')
@click.option('--alert-file', default=None, help='File to write alerts to')
@click.option('--webhook', default=None, help='Webhook URL for alerts')
@click.option('--server', default=None, help='gRPC server address (host:port)')
def watch(service, interval, window, threshold, alert_file, webhook, server):
    if not server:
        server = os.getenv('GRPC_SERVER_ADDR', 'localhost:50051')

    notifier = Notifier(alert_file=alert_file, webhook_url=webhook)
    stub = GRPCConnectionPool.get_stub(server)

    click.echo(click.style('=' * 60, fg='cyan'))
    click.echo(click.style(f'Starting Active Fault Monitoring for: {service}', fg='cyan', bold=True))
    click.echo(click.style('=' * 60, fg='cyan'))
    click.echo(f'  Polling interval: {interval}s')
    click.echo(f'  Sliding window: {window} min')
    click.echo(f'  Alert threshold: {threshold} errors/min')
    click.echo(f'  Alert file: {notifier.alert_file}')
    if notifier.webhook_url:
        click.echo(f'  Webhook URL: {notifier.webhook_url}')
    click.echo(click.style('=' * 60, fg='cyan'))
    click.echo()

    poll_count = 0
    try:
        while True:
            poll_count += 1
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            click.echo(click.style(f'[{current_time}] Poll #{poll_count} - Checking faults...', fg='blue'))
            
            response = stub.WatchFaults(tracefault_pb2.WatchRequest(
                service=service,
                window_minutes=window,
                threshold=threshold
            ))

            click.echo(f'  Window: {response.window_start} -> {response.window_end}')
            click.echo(f'  Summary: {response.summary}')
            
            if response.error_counts:
                click.echo(click.style('  Error Statistics:', fg='yellow'))
                for ec in response.error_counts:
                    status = '[!]' if ec.threshold_exceeded else '[OK]'
                    click.echo(f'    {status} {ec.service_name}: {ec.error_code} - {ec.count} total ({ec.rate_per_minute:.2f}/min)')
            
            if response.alerts:
                click.echo(click.style(f'  [!] {len(response.alerts)} ALERT(S) TRIGGERED!', fg='red', bold=True))
                for alert in response.alerts:
                    alert_dict = {
                        'error_code': alert.error_code,
                        'service_name': alert.service_name,
                        'message': alert.message,
                        'current_count': alert.current_count,
                        'threshold': alert.threshold,
                        'timestamp': alert.timestamp
                    }
                    sent = notifier.send_alert(alert_dict)
                    if sent:
                        click.echo(click.style(f'    [ALERT] Sent: {alert.error_code} - {alert.message}', fg='red'))
                    else:
                        click.echo(f'    [INFO] Cooldown: {alert.error_code}')
            
            click.echo()
            time.sleep(interval)

    except KeyboardInterrupt:
        click.echo(click.style('\nMonitoring stopped by user.', fg='yellow'))
    finally:
        GRPCConnectionPool.close_all()

def main():
    cli()

if __name__ == '__main__':
    main()
