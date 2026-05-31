from prometheus_client import Counter, Gauge, Histogram, start_http_server
from config import settings

pricing_calculations_total = Counter(
    'option_pricing_calculations_total',
    'Total number of option pricing calculations',
    ['contract_symbol', 'option_type']
)

pricing_duration_seconds = Histogram(
    'option_pricing_duration_seconds',
    'Time spent calculating option prices',
    ['contract_symbol']
)

active_contracts = Gauge(
    'option_active_contracts',
    'Number of active option contracts being monitored'
)

stock_price_gauge = Gauge(
    'stock_price',
    'Current stock price',
    ['symbol']
)

option_price_gauge = Gauge(
    'option_price',
    'Current option price',
    ['contract_symbol', 'option_type']
)

delta_gauge = Gauge(
    'option_delta',
    'Option delta value',
    ['contract_symbol']
)

gamma_gauge = Gauge(
    'option_gamma',
    'Option gamma value',
    ['contract_symbol']
)

theta_gauge = Gauge(
    'option_theta',
    'Option theta value',
    ['contract_symbol']
)

vega_gauge = Gauge(
    'option_vega',
    'Option vega value',
    ['contract_symbol']
)

rho_gauge = Gauge(
    'option_rho',
    'Option rho value',
    ['contract_symbol']
)

websocket_connections = Gauge(
    'websocket_connections',
    'Number of active WebSocket connections'
)

events_published_total = Counter(
    'events_published_total',
    'Total number of events published to Redis Streams',
    ['event_type']
)

database_writes_total = Counter(
    'database_writes_total',
    'Total number of database writes',
    ['table_name']
)

def start_metrics_server():
    start_http_server(settings.PROMETHEUS_PORT)
    print(f"Prometheus metrics server started on port {settings.PROMETHEUS_PORT}")

def update_stock_price_metric(symbol: str, price: float):
    stock_price_gauge.labels(symbol=symbol).set(price)

def update_option_metrics(result):
    contract = result.inputs.contract_symbol
    option_type = result.inputs.option_type.value
    
    option_price_gauge.labels(contract_symbol=contract, option_type=option_type).set(result.price)
    delta_gauge.labels(contract_symbol=contract).set(result.greeks.delta)
    gamma_gauge.labels(contract_symbol=contract).set(result.greeks.gamma)
    theta_gauge.labels(contract_symbol=contract).set(result.greeks.theta)
    vega_gauge.labels(contract_symbol=contract).set(result.greeks.vega)
    rho_gauge.labels(contract_symbol=contract).set(result.greeks.rho)
    
    pricing_calculations_total.labels(contract_symbol=contract, option_type=option_type).inc()

def update_websocket_connections(count: int):
    websocket_connections.set(count)

def increment_events_published(event_type: str):
    events_published_total.labels(event_type=event_type).inc()

def increment_database_writes(table_name: str):
    database_writes_total.labels(table_name=table_name).inc()
