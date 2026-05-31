import asyncio
import uvicorn
from api import app as fastapi_app
from websocket_server import run_websocket_server
from option_engine import pricing_engine, initialize_sample_contracts
import metrics
from database import init_db

async def run_servers():
    try:
        init_db()
        print("Database initialized")
    except Exception as e:
        print(f"Warning: Could not initialize database: {e}")
        print("Continuing without database...")
    
    metrics.start_metrics_server()
    
    initialize_sample_contracts()
    
    config = uvicorn.Config(
        fastapi_app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        loop="asyncio"
    )
    api_server = uvicorn.Server(config)
    
    websocket_task = asyncio.create_task(run_websocket_server())
    engine_task = asyncio.create_task(pricing_engine.run())
    api_task = asyncio.create_task(api_server.serve())
    
    print("All services started successfully!")
    print(f"API Server: http://0.0.0.0:8000")
    print(f"WebSocket Server: ws://0.0.0.0:8765")
    print(f"Prometheus Metrics: http://0.0.0.0:9090")
    print("-" * 60)
    
    try:
        await asyncio.gather(api_task, websocket_task, engine_task)
    except asyncio.CancelledError:
        print("Shutting down services...")
        pricing_engine.stop()

if __name__ == "__main__":
    try:
        asyncio.run(run_servers())
    except KeyboardInterrupt:
        print("\nServer shutdown requested by user")
    except Exception as e:
        print(f"Server error: {e}")
