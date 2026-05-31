import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    ETCD_ENDPOINTS = os.getenv('ETCD_ENDPOINTS', 'localhost:2379').split(',')
    NODE_ID = os.getenv('NODE_ID', 'node-1')
    NODE_ADDRESS = os.getenv('NODE_ADDRESS', 'localhost:8000')
    HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', 5))
    NODE_TTL = int(os.getenv('NODE_TTL', 10))
    TASK_PREFIX = os.getenv('TASK_PREFIX', '/tasks/')
    NODE_PREFIX = os.getenv('NODE_PREFIX', '/nodes/')
    LOG_PREFIX = os.getenv('LOG_PREFIX', '/logs/')
    MAX_CONCURRENT_TASKS = int(os.getenv('MAX_CONCURRENT_TASKS', 5))
