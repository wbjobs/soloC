import asyncio
import json
import websockets
import random
import time
from typing import Set, Dict
from config import settings
from event_store import event_store

class StockTickerSimulator:
    def __init__(self):
        self.stocks: Dict[str, float] = {
            "AAPL": 185.0,
            "GOOGL": 140.0,
            "MSFT": 378.0,
            "AMZN": 178.0,
            "TSLA": 248.0
        }
        self.connected_clients: Set[websockets.WebSocketServerProtocol] = set()
        self.running = False
    
    def generate_price_update(self) -> Dict[str, float]:
        updates = {}
        for symbol, price in self.stocks.items():
            change = random.gauss(0, 0.002) * price
            new_price = max(price + change, 1.0)
            self.stocks[symbol] = new_price
            updates[symbol] = round(new_price, 4)
        return updates
    
    async def broadcast_prices(self):
        while self.running:
            try:
                updates = self.generate_price_update()
                timestamp = time.time()
                
                for symbol, price in updates.items():
                    event_store.publish_price_update(symbol, price, timestamp)
                
                message = json.dumps({
                    "type": "stock_prices",
                    "timestamp": timestamp,
                    "data": updates
                })
                
                if self.connected_clients:
                    await asyncio.gather(
                        *[client.send(message) for client in self.connected_clients],
                        return_exceptions=True
                    )
                
                await asyncio.sleep(settings.PRICE_UPDATE_INTERVAL)
            except Exception as e:
                print(f"Error broadcasting prices: {e}")
                await asyncio.sleep(1)
    
    async def handle_client(self, websocket: websockets.WebSocketServerProtocol):
        self.connected_clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.connected_clients)}")
        
        try:
            initial_message = json.dumps({
                "type": "initial_prices",
                "timestamp": time.time(),
                "data": self.stocks
            })
            await websocket.send(initial_message)
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    if data.get("type") == "subscribe":
                        symbols = data.get("symbols", [])
                        response = json.dumps({
                            "type": "subscribed",
                            "symbols": symbols
                        })
                        await websocket.send(response)
                except json.JSONDecodeError:
                    pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.remove(websocket)
            print(f"Client disconnected. Total clients: {len(self.connected_clients)}")
    
    async def start(self):
        self.running = True
        server = await websockets.serve(self.handle_client, "0.0.0.0", settings.WEBSOCKET_PORT)
        print(f"WebSocket server started on ws://0.0.0.0:{settings.WEBSOCKET_PORT}")
        
        broadcast_task = asyncio.create_task(self.broadcast_prices())
        
        await server.wait_closed()
        self.running = False
        broadcast_task.cancel()
        try:
            await broadcast_task
        except asyncio.CancelledError:
            pass

ticker_simulator = StockTickerSimulator()

async def run_websocket_server():
    await ticker_simulator.start()
