from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, List, Optional
import uuid
import json
import os
import time

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def get():
    return FileResponse("static/index.html")

class BuildingBlock(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    rotation: Dict[str, float]
    scale: Dict[str, float]
    color: str
    timestamp: float = 0
    locked_by: Optional[str] = None

class User(BaseModel):
    id: str
    name: str
    cursor: Optional[Dict[str, float]] = None

class TerrainVertex(BaseModel):
    x: float
    y: float
    z: float

class Room(BaseModel):
    id: str
    name: str
    blocks: List[BuildingBlock] = []
    users: Dict[str, User] = {}
    block_locks: Dict[str, str] = {}
    terrain_size: int = 50
    terrain_segments: int = 50
    terrain_heights: List[float] = []

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.rooms: Dict[str, Room] = {}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str, user_name: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
        
        if room_id not in self.rooms:
            self.rooms[room_id] = Room(id=room_id, name=f"Room {room_id}")
        
        self.rooms[room_id].users[user_id] = User(id=user_id, name=user_name)
        await self.broadcast_to_room(room_id, {
            "type": "user_joined",
            "user_id": user_id,
            "user_name": user_name,
            "users": [u.dict() for u in self.rooms[room_id].users.values()]
        })

    def disconnect(self, websocket: WebSocket, room_id: str, user_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)
        if room_id in self.rooms and user_id in self.rooms[room_id].users:
            del self.rooms[room_id].users[user_id]

    async def broadcast_to_room(self, room_id: str, message: dict):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_json(message)

    def acquire_lock(self, room_id: str, block_id: str, user_id: str) -> bool:
        if room_id not in self.rooms:
            return False
        room = self.rooms[room_id]
        current_lock = room.block_locks.get(block_id)
        if current_lock is None or current_lock == user_id:
            room.block_locks[block_id] = user_id
            for block in room.blocks:
                if block.id == block_id:
                    block.locked_by = user_id
                    break
            return True
        return False

    def release_lock(self, room_id: str, block_id: str, user_id: str) -> bool:
        if room_id not in self.rooms:
            return False
        room = self.rooms[room_id]
        if room.block_locks.get(block_id) == user_id:
            del room.block_locks[block_id]
            for block in room.blocks:
                if block.id == block_id:
                    block.locked_by = None
                    break
            return True
        return False

    def release_all_locks(self, room_id: str, user_id: str):
        if room_id not in self.rooms:
            return
        room = self.rooms[room_id]
        blocks_to_unlock = []
        for block_id, lock_holder in room.block_locks.items():
            if lock_holder == user_id:
                blocks_to_unlock.append(block_id)
        for block_id in blocks_to_unlock:
            self.release_lock(room_id, block_id, user_id)

manager = ConnectionManager()

with open('city_templates.json', 'r', encoding='utf-8') as f:
    city_templates = json.load(f)

for template in city_templates.values():
    for block in template:
        block['timestamp'] = time.time()
        block['locked_by'] = None

@app.get("/templates")
async def get_templates():
    return {"templates": list(city_templates.keys())}

@app.get("/templates/{name}")
async def get_template(name: str):
    if name in city_templates:
        return {"blocks": city_templates[name]}
    return {"error": "Template not found"}

@app.post("/rooms")
async def create_room(name: str = "New Room"):
    room_id = str(uuid.uuid4())[:8]
    manager.rooms[room_id] = Room(id=room_id, name=name)
    return {"room_id": room_id, "name": name}

@app.get("/rooms")
async def list_rooms():
    return {"rooms": [{"id": rid, "name": r.name, "user_count": len(r.users)} for rid, r in manager.rooms.items()]}

@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    user_name = None
    try:
        data = await websocket.receive_json()
        user_name = data.get("user_name", "Anonymous")
        
        await manager.connect(websocket, room_id, user_id, user_name)
        
        if room_id in manager.rooms:
            room = manager.rooms[room_id]
            
            if len(room.terrain_heights) == 0:
                total_vertices = (room.terrain_segments + 1) * (room.terrain_segments + 1)
                room.terrain_heights = [0.0] * total_vertices
            
            await websocket.send_json({
                "type": "init",
                "blocks": [b.dict() for b in room.blocks],
                "users": [u.dict() for u in room.users.values()],
                "block_locks": room.block_locks,
                "terrain": {
                    "size": room.terrain_size,
                    "segments": room.terrain_segments,
                    "heights": room.terrain_heights
                }
            })
        
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "add_block":
                block_data = data["block"]
                block_data["timestamp"] = time.time()
                block_data["locked_by"] = None
                block = BuildingBlock(**block_data)
                if room_id in manager.rooms:
                    manager.rooms[room_id].blocks.append(block)
                await manager.broadcast_to_room(room_id, {
                    "type": "add_block",
                    "block": block.dict()
                })
            
            elif message_type == "lock_block":
                block_id = data["block_id"]
                success = manager.acquire_lock(room_id, block_id, user_id)
                if success:
                    await manager.broadcast_to_room(room_id, {
                        "type": "block_locked",
                        "block_id": block_id,
                        "locked_by": user_id
                    })
                else:
                    room = manager.rooms.get(room_id)
                    current_lock = room.block_locks.get(block_id) if room else None
                    await websocket.send_json({
                        "type": "lock_denied",
                        "block_id": block_id,
                        "locked_by": current_lock
                    })
            
            elif message_type == "unlock_block":
                block_id = data["block_id"]
                success = manager.release_lock(room_id, block_id, user_id)
                if success:
                    await manager.broadcast_to_room(room_id, {
                        "type": "block_unlocked",
                        "block_id": block_id
                    })
            
            elif message_type == "update_block":
                block_id = data["block_id"]
                new_block_data = data["block"]
                new_timestamp = new_block_data.get("timestamp", time.time())
                
                if room_id in manager.rooms:
                    room = manager.rooms[room_id]
                    for i, b in enumerate(room.blocks):
                        if b.id == block_id:
                            if b.locked_by and b.locked_by != user_id:
                                await websocket.send_json({
                                    "type": "update_denied",
                                    "block_id": block_id,
                                    "locked_by": b.locked_by,
                                    "current_block": b.dict()
                                })
                                break
                            
                            if new_timestamp >= b.timestamp:
                                new_block_data["timestamp"] = new_timestamp
                                new_block_data["locked_by"] = b.locked_by
                                room.blocks[i] = BuildingBlock(**new_block_data)
                                await manager.broadcast_to_room(room_id, {
                                    "type": "update_block",
                                    "block_id": block_id,
                                    "block": room.blocks[i].dict(),
                                    "updated_by": user_id
                                })
                            break
            
            elif message_type == "delete_block":
                block_id = data["block_id"]
                if room_id in manager.rooms:
                    room = manager.rooms[room_id]
                    for b in room.blocks:
                        if b.id == block_id:
                            if b.locked_by and b.locked_by != user_id:
                                await websocket.send_json({
                                    "type": "delete_denied",
                                    "block_id": block_id,
                                    "locked_by": b.locked_by
                                })
                                break
                            else:
                                room.blocks = [b for b in room.blocks if b.id != block_id]
                                if block_id in room.block_locks:
                                    del room.block_locks[block_id]
                                await manager.broadcast_to_room(room_id, {
                                    "type": "delete_block",
                                    "block_id": block_id
                                })
                                break
            
            elif message_type == "cursor_update":
                if room_id in manager.rooms and user_id in manager.rooms[room_id].users:
                    manager.rooms[room_id].users[user_id].cursor = data.get("cursor")
                await manager.broadcast_to_room(room_id, {
                    "type": "cursor_update",
                    "user_id": user_id,
                    "cursor": data.get("cursor")
                })
            
            elif message_type == "terrain_update":
                if room_id in manager.rooms:
                    room = manager.rooms[room_id]
                    vertex_indices = data.get("indices", [])
                    new_heights = data.get("heights", [])
                    
                    if len(room.terrain_heights) == 0:
                        total_vertices = (room.terrain_segments + 1) * (room.terrain_segments + 1)
                        room.terrain_heights = [0.0] * total_vertices
                    
                    for i, idx in enumerate(vertex_indices):
                        if 0 <= idx < len(room.terrain_heights):
                            room.terrain_heights[idx] = new_heights[i]
                    
                    await manager.broadcast_to_room(room_id, {
                        "type": "terrain_update",
                        "indices": vertex_indices,
                        "heights": new_heights,
                        "updated_by": user_id
                    })
            
            elif message_type == "terrain_smooth":
                if room_id in manager.rooms:
                    room = manager.rooms[room_id]
                    
                    if len(room.terrain_heights) == 0:
                        total_vertices = (room.terrain_segments + 1) * (room.terrain_segments + 1)
                        room.terrain_heights = [0.0] * total_vertices
                    
                    center_idx = data.get("center_idx")
                    radius = data.get("radius", 3)
                    strength = data.get("strength", 0.5)
                    
                    affected_indices = []
                    new_heights = []
                    n = room.terrain_segments + 1
                    
                    center_row = center_idx // n
                    center_col = center_idx % n
                    
                    for i in range(-radius, radius + 1):
                        for j in range(-radius, radius + 1):
                            row = center_row + i
                            col = center_col + j
                            if 0 <= row < n and 0 <= col < n:
                                idx = row * n + col
                                
                                avg = 0
                                count = 0
                                for di in [-1, 0, 1]:
                                    for dj in [-1, 0, 1]:
                                        ni, nj = row + di, col + dj
                                        if 0 <= ni < n and 0 <= nj < n:
                                            nidx = ni * n + nj
                                            if 0 <= nidx < len(room.terrain_heights):
                                                avg += room.terrain_heights[nidx]
                                                count += 1
                                
                                if count > 0:
                                    avg = avg / count
                                    old_h = room.terrain_heights[idx]
                                    new_h = old_h * (1 - strength) + avg * strength
                                    room.terrain_heights[idx] = new_h
                                    affected_indices.append(idx)
                                    new_heights.append(new_h)
                    
                    await manager.broadcast_to_room(room_id, {
                        "type": "terrain_update",
                        "indices": affected_indices,
                        "heights": new_heights,
                        "updated_by": user_id
                    })
            
            elif message_type == "clear_scene":
                if room_id in manager.rooms:
                    room = manager.rooms[room_id]
                    can_clear = True
                    for lock_holder in room.block_locks.values():
                        if lock_holder != user_id:
                            can_clear = False
                            break
                    
                    if can_clear:
                        room.blocks = []
                        room.block_locks = {}
                        total_vertices = (room.terrain_segments + 1) * (room.terrain_segments + 1)
                        room.terrain_heights = [0.0] * total_vertices
                        await manager.broadcast_to_room(room_id, {
                            "type": "clear_scene",
                            "reset_terrain": True
                        })
                    else:
                        await websocket.send_json({
                            "type": "clear_denied",
                            "message": "有物体被其他用户锁定，无法清空场景"
                        })
            
            elif message_type == "load_template":
                template_name = data.get("template_name")
                if template_name in city_templates and room_id in manager.rooms:
                    room = manager.rooms[room_id]
                    can_load = True
                    for lock_holder in room.block_locks.values():
                        if lock_holder != user_id:
                            can_load = False
                            break
                    
                    if can_load:
                        template_blocks = []
                        for block_data in city_templates[template_name]:
                            block_data["timestamp"] = time.time()
                            block_data["locked_by"] = None
                            template_blocks.append(BuildingBlock(**block_data))
                        room.blocks = template_blocks
                        room.block_locks = {}
                        await manager.broadcast_to_room(room_id, {
                            "type": "load_template",
                            "blocks": [b.dict() for b in room.blocks]
                        })
                    else:
                        await websocket.send_json({
                            "type": "load_denied",
                            "message": "有物体被其他用户锁定，无法加载模板"
                        })
            
            elif message_type == "save_scene":
                if room_id in manager.rooms:
                    scene_data = {
                        "room_id": room_id,
                        "blocks": [b.dict() for b in manager.rooms[room_id].blocks]
                    }
                    await websocket.send_json({
                        "type": "scene_saved",
                        "data": scene_data
                    })

    except WebSocketDisconnect:
        manager.release_all_locks(room_id, user_id)
        await manager.broadcast_to_room(room_id, {
            "type": "all_unlocked_by",
            "user_id": user_id
        })
        manager.disconnect(websocket, room_id, user_id)
        await manager.broadcast_to_room(room_id, {
            "type": "user_left",
            "user_id": user_id,
            "users": [u.dict() for u in manager.rooms.get(room_id, Room(id="", name="")).users.values()]
        })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
