import asyncio
import random
from typing import Dict, List
from datetime import datetime
from pydantic import BaseModel

class RegisterData(BaseModel):
    device_id: int
    address: int
    value: float
    name: str

class ModbusSimulator:
    def __init__(self):
        self.devices: Dict[int, List[float]] = {}
        self.register_names = [
            "温度", "压力", "转速", "温度阈值", "压力阈值", 
            "转速阈值", "状态", "报警", "预留1", "预留2"
        ]
        for device_id in range(1, 4):
            self.devices[device_id] = [
                25.0, 100.0, 1500.0, 50.0, 150.0,
                2000.0, 1.0, 0.0, 0.0, 0.0
            ]
        
    def read_registers(self, device_id: int, start_address: int, count: int) -> List[float]:
        if device_id not in self.devices:
            raise ValueError(f"Device {device_id} not found")
        if start_address + count > len(self.devices[device_id]):
            raise ValueError("Register address out of range")
        return self.devices[device_id][start_address:start_address + count]
    
    def write_register(self, device_id: int, address: int, value: float) -> None:
        if device_id not in self.devices:
            raise ValueError(f"Device {device_id} not found")
        if address >= len(self.devices[device_id]):
            raise ValueError("Register address out of range")
        self.devices[device_id][address] = value
    
    def get_all_registers(self, device_id: int) -> List[RegisterData]:
        if device_id not in self.devices:
            raise ValueError(f"Device {device_id} not found")
        return [
            RegisterData(
                device_id=device_id,
                address=i,
                value=self.devices[device_id][i],
                name=self.register_names[i]
            )
            for i in range(len(self.devices[device_id]))
        ]
    
    async def simulate_data_changes(self):
        while True:
            for device_id in self.devices:
                self.devices[device_id][0] += random.uniform(-0.5, 0.5)
                self.devices[device_id][0] = max(0, min(100, self.devices[device_id][0]))
                
                self.devices[device_id][1] += random.uniform(-2, 2)
                self.devices[device_id][1] = max(50, min(200, self.devices[device_id][1]))
                
                self.devices[device_id][2] += random.uniform(-50, 50)
                self.devices[device_id][2] = max(1000, min(3000, self.devices[device_id][2]))
                
                temp = self.devices[device_id][0]
                pressure = self.devices[device_id][1]
                speed = self.devices[device_id][2]
                temp_threshold = self.devices[device_id][3]
                pressure_threshold = self.devices[device_id][4]
                speed_threshold = self.devices[device_id][5]
                
                alarm = 0
                if temp > temp_threshold:
                    alarm |= 1
                if pressure > pressure_threshold:
                    alarm |= 2
                if speed > speed_threshold:
                    alarm |= 4
                self.devices[device_id][7] = alarm
            
            await asyncio.sleep(1)

modbus_simulator = ModbusSimulator()
