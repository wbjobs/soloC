# Option Pricing Backend Service

A high-performance backend API service for option pricing using the Black-Scholes model, with real-time stock data simulation and comprehensive monitoring.

## Features

### Core Pricing Engine
- **Black-Scholes Model** implementation for option pricing
- **Greek Values Calculation**: Delta, Gamma, Theta, Vega, Rho
- Support for both Call and Put options

### Real-Time Data
- **WebSocket Server** for real-time stock price simulation
- 5 sample stocks: AAPL, GOOGL, MSFT, AMZN, TSLA
- Random walk price generation with configurable update interval

### Data Storage
- **TimescaleDB** for time-series data storage
- **Redis Streams** for event sourcing and real-time event processing

### API Endpoints
- `POST /api/price` - Calculate option price and Greeks
- `GET /api/history/{contract_symbol}` - Query historical pricing data
- `POST /api/volatility-surface` - Generate 3D volatility surface
- `GET /api/events` - Query recent events from Redis Streams
- `GET /api/stocks/latest` - Get latest stock prices
- `GET /health` - Health check endpoint
- `GET /docs` - Swagger documentation

### Monitoring
- **Prometheus** metrics for monitoring
- Pricing calculation counts and durations
- Stock and option price gauges
- Greek value metrics
- WebSocket connection count
- Event and database write counters

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  WebSocket      │────▶│  Redis Streams  │────▶│  Pricing Engine │
│  Server         │     │  (Event Store)  │     │  (Async)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                  ┌───────────┐
                                                  │  API      │
                                                  │  Server   │
                                                  └───────────┘
                                                         │
                                                         ▼
                                                  ┌────────────┐
                                                  │ Timescale  │
                                                  │   DB       │
                                                  └────────────┘
                                                         │
                                                         ▼
                                                  ┌────────────┐
                                                  │ Prometheus │
                                                  │  Metrics   │
                                                  └────────────┘
```

## Installation

### Prerequisites
- Python 3.10+
- Redis 6.0+
- PostgreSQL (with TimescaleDB extension)

### Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment variables in `.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/option_pricing
REDIS_URL=redis://localhost:6379/0
WEBSOCKET_PORT=8765
API_PORT=8000
PROMETHEUS_PORT=9090
```

3. Start the services:
```bash
python main.py
```

## API Usage Examples

### Calculate Option Price
```bash
curl -X POST http://localhost:8000/api/price \
  -H "Content-Type: application/json" \
  -d '{
    "S": 185.0,
    "K": 190.0,
    "T": 0.25,
    "r": 0.05,
    "sigma": 0.25,
    "option_type": "call",
    "contract_symbol": "AAPL-C-190"
  }'
```

### Get Historical Pricing Data
```bash
curl http://localhost:8000/api/history/AAPL-C-190?hours=1
```

### Generate Volatility Surface
```bash
curl -X POST http://localhost:8000/api/volatility-surface \
  -H "Content-Type: application/json" \
  -d '{
    "S": 185.0,
    "r": 0.05,
    "min_strike": 150.0,
    "max_strike": 220.0,
    "num_strikes": 20,
    "min_maturity": 0.01,
    "max_maturity": 2.0,
    "num_maturities": 10,
    "base_volatility": 0.25
  }'
```

### WebSocket Connection
```javascript
const ws = new WebSocket('ws://localhost:8765');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Stock prices:', data.data);
};
```

## Prometheus Metrics

Access metrics at: `http://localhost:9090/metrics`

Key metrics:
- `option_pricing_calculations_total` - Total pricing calculations
- `option_pricing_duration_seconds` - Pricing duration histogram
- `stock_price` - Current stock prices by symbol
- `option_price` - Current option prices
- `option_delta`, `option_gamma`, `option_theta`, `option_vega`, `option_rho` - Greek values
- `websocket_connections` - Active WebSocket connections
- `option_active_contracts` - Number of active contracts

## Project Structure

```
├── black_scholes.py      # Black-Scholes model and Greek calculations
├── database.py           # TimescaleDB models and operations
├── event_store.py        # Redis Streams event sourcing
├── websocket_server.py   # WebSocket server and price simulation
├── metrics.py            # Prometheus metrics definitions
├── api.py                # FastAPI REST endpoints
├── option_engine.py      # Multi-contract concurrent pricing engine
├── config.py             # Configuration management
├── main.py               # Main entry point
└── requirements.txt      # Python dependencies
```

## Performance Features

- Async/await architecture for high concurrency
- Multi-contract parallel calculation using asyncio.gather
- Efficient price update processing with debouncing
- Connection pooling for database and Redis
- Non-blocking I/O operations

## Sample Contracts

The service initializes with 5 sample option contracts:
- AAPL-C-190: Apple Call option, strike $190, 3 months maturity
- AAPL-P-180: Apple Put option, strike $180, 3 months maturity
- MSFT-C-380: Microsoft Call option, strike $380, 3 months maturity
- GOOGL-C-145: Google Call option, strike $145, 3 months maturity
- TSLA-C-260: Tesla Call option, strike $260, 3 months maturity
