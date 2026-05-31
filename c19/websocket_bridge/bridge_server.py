#!/usr/bin/env python3
import asyncio
import json
import threading
import time
from typing import Dict, Set, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import rclpy
from rclpy.node import Node
from std_msgs.msg import String, Float32
from geometry_msgs.msg import Twist

app = FastAPI(title="ROS2 WebSocket Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JoystickData(BaseModel):
    x: float = 0.0
    y: float = 0.0


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.lock = threading.Lock()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        with self.lock:
            self.active_connections.add(websocket)
        print(f"New connection. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        with self.lock:
            self.active_connections.discard(websocket)
        print(f"Connection closed. Total: {len(self.active_connections)}")

    async def broadcast(self, message: str):
        disconnected = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.add(connection)
        
        with self.lock:
            for conn in disconnected:
                self.active_connections.discard(conn)


manager = ConnectionManager()


class ROS2BridgeNode(Node):
    def __init__(self):
        super().__init__('ros2_bridge_node')
        
        self.joystick_pub = self.create_publisher(String, '/web_joystick', 10)
        self.path_plan_pub = self.create_publisher(String, '/web_path_plan', 10)
        self.path_control_pub = self.create_publisher(String, '/web_path_control', 10)
        
        self.laser_sub = self.create_subscription(
            String,
            '/web_laser_data',
            self.laser_callback,
            10
        )
        
        self.status_sub = self.create_subscription(
            String,
            '/web_robot_status',
            self.status_callback,
            10
        )
        
        self.battery_sub = self.create_subscription(
            Float32,
            '/battery_level',
            self.battery_callback,
            10
        )
        
        self.path_status_sub = self.create_subscription(
            String,
            '/web_path_status',
            self.path_status_callback,
            10
        )
        
        self.latest_laser: Optional[str] = None
        self.latest_status: Optional[str] = None
        self.latest_battery: Optional[float] = None
        self.latest_path_status: Optional[str] = None
        
        self.create_timer(1.0, self.heartbeat_timer)
        
        self.get_logger().info('ROS2 Bridge Node started')

    def laser_callback(self, msg):
        self.latest_laser = msg.data
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(json.dumps({
                'type': 'laser',
                'data': json.loads(msg.data)
            })),
            asyncio.get_event_loop()
        )

    def status_callback(self, msg):
        self.latest_status = msg.data
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(json.dumps({
                'type': 'status',
                'data': json.loads(msg.data)
            })),
            asyncio.get_event_loop()
        )

    def battery_callback(self, msg):
        self.latest_battery = msg.data
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(json.dumps({
                'type': 'battery',
                'data': {'level': msg.data}
            })),
            asyncio.get_event_loop()
        )

    def path_status_callback(self, msg):
        self.latest_path_status = msg.data
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(json.dumps({
                'type': 'path_status',
                'data': json.loads(msg.data)
            })),
            asyncio.get_event_loop()
        )

    def publish_joystick(self, x: float, y: float):
        msg = String()
        msg.data = json.dumps({'x': x, 'y': y})
        self.joystick_pub.publish(msg)

    def publish_path_plan(self, waypoints):
        msg = String()
        msg.data = json.dumps({'waypoints': waypoints})
        self.path_plan_pub.publish(msg)

    def publish_path_control(self, action):
        msg = String()
        msg.data = json.dumps({'action': action})
        self.path_control_pub.publish(msg)

    def heartbeat_timer(self):
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(json.dumps({
                'type': 'heartbeat',
                'timestamp': time.time()
            })),
            asyncio.get_event_loop()
        )


ros2_node: Optional[ROS2BridgeNode] = None


def run_ros2():
    global ros2_node
    rclpy.init()
    ros2_node = ROS2BridgeNode()
    rclpy.spin(ros2_node)
    ros2_node.destroy_node()
    rclpy.shutdown()


@app.on_event("startup")
async def startup_event():
    ros_thread = threading.Thread(target=run_ros2, daemon=True)
    ros_thread.start()
    await asyncio.sleep(1.0)


@app.get("/")
async def root():
    return {"message": "ROS2 WebSocket Bridge Server", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": time.time()}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    if ros2_node:
        if ros2_node.latest_laser:
            await websocket.send_text(json.dumps({
                'type': 'laser',
                'data': json.loads(ros2_node.latest_laser)
            }))
        if ros2_node.latest_status:
            await websocket.send_text(json.dumps({
                'type': 'status',
                'data': json.loads(ros2_node.latest_status)
            }))
        if ros2_node.latest_path_status:
            await websocket.send_text(json.dumps({
                'type': 'path_status',
                'data': json.loads(ros2_node.latest_path_status)
            }))
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                message_type = message.get('type')
                
                if message_type == 'joystick' and ros2_node:
                    x = message.get('x', 0.0)
                    y = message.get('y', 0.0)
                    ros2_node.publish_joystick(x, y)
                elif message_type == 'path_plan' and ros2_node:
                    waypoints = message.get('waypoints', [])
                    ros2_node.publish_path_plan(waypoints)
                elif message_type == 'path_control' and ros2_node:
                    action = message.get('action', '')
                    ros2_node.publish_path_control(action)
                elif message_type == 'ping':
                    await websocket.send_text(json.dumps({'type': 'pong', 'timestamp': time.time()}))
                    
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        if ros2_node:
            ros2_node.publish_joystick(0.0, 0.0)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, ws_ping_interval=30, ws_ping_timeout=60)
