import json
import time
import uuid
import subprocess
import threading
import psutil
import logging
from typing import Dict, List
from datetime import datetime, timedelta
import etcd3

from config import Config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TaskExecutor:
    def __init__(self):
        self.etcd = etcd3.client(host=Config.ETCD_ENDPOINTS[0].split(':')[0],
                                  port=int(Config.ETCD_ENDPOINTS[0].split(':')[1]))
        self.node_id = Config.NODE_ID
        self.running_tasks: Dict[str, subprocess.Popen] = {}
        self.task_threads: Dict[str, threading.Thread] = {}
        self.task_status_lock = threading.Lock()
        self.running = True
        self.lease = None

    def register_node(self):
        logger.info(f"Registering node: {self.node_id}")
        while self.running:
            try:
                self.lease = self.etcd.lease(Config.NODE_TTL)
                node_info = self.get_node_info()
                key = f"{Config.NODE_PREFIX}{self.node_id}"
                self.etcd.put(key, json.dumps(node_info), lease=self.lease)
                logger.info(f"Node {self.node_id} registered successfully")
                break
            except Exception as e:
                logger.error(f"Failed to register node: {e}")
                time.sleep(5)

    def get_node_info(self) -> Dict:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        return {
            'id': self.node_id,
            'address': Config.NODE_ADDRESS,
            'cpu': cpu_percent,
            'memory': memory.percent,
            'tasks': len(self.running_tasks),
            'status': 'online',
            'last_heartbeat': datetime.now().isoformat()
        }

    def heartbeat(self):
        while self.running:
            try:
                if self.lease:
                    self.etcd.refresh_lease(self.lease)
                
                node_info = self.get_node_info()
                key = f"{Config.NODE_PREFIX}{self.node_id}"
                self.etcd.put(key, json.dumps(node_info), lease=self.lease)
                
                time.sleep(Config.HEARTBEAT_INTERVAL)
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}")
                self.register_node()

    def watch_tasks(self):
        logger.info("Watching for assigned tasks...")
        events_iterator, cancel = self.etcd.watch_prefix(Config.TASK_PREFIX)
        
        try:
            for event in events_iterator:
                if not self.running:
                    break
                
                task_key = event.key.decode()
                task_id = task_key[len(Config.TASK_PREFIX):]
                
                if event.events[0].type == 'PUT':
                    task_data = event.value
                    if task_data:
                        task = json.loads(task_data)
                        if task.get('assigned_node') == self.node_id and task.get('status') == 'running':
                            if task_id not in self.running_tasks:
                                logger.info(f"Received new task: {task_id}")
                                self.execute_task(task)
        finally:
            cancel()

    def execute_task(self, task: Dict):
        if len(self.running_tasks) >= Config.MAX_CONCURRENT_TASKS:
            logger.warning(f"Max concurrent tasks reached, rejecting task: {task['id']}")
            return

        def run_task():
            task_id = task['id']
            try:
                self.log_progress(task_id, "Starting task execution", 0)
                
                timeout = task.get('timeout', 3600)
                cmd = task['command']
                
                process = subprocess.Popen(
                    cmd,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                self.running_tasks[task_id] = process
                
                self.log_progress(task_id, "Task started", 10)
                
                stdout, stderr = process.communicate(timeout=timeout)
                
                if process.returncode == 0:
                    self.update_task_status(task_id, 'completed', result=stdout)
                    self.log_progress(task_id, "Task completed successfully", 100)
                else:
                    error_msg = f"Task failed with exit code {process.returncode}: {stderr}"
                    self.handle_task_failure(task, error_msg)
                
            except subprocess.TimeoutExpired:
                self.running_tasks[task_id].kill()
                error_msg = f"Task timeout after {timeout} seconds"
                self.handle_task_failure(task, error_msg)
            except Exception as e:
                error_msg = f"Task execution error: {str(e)}"
                self.handle_task_failure(task, error_msg)
            finally:
                if task_id in self.running_tasks:
                    del self.running_tasks[task_id]
                if task_id in self.task_threads:
                    del self.task_threads[task_id]

        thread = threading.Thread(target=run_task)
        thread.daemon = True
        thread.start()
        self.task_threads[task['id']] = thread

    def handle_task_failure(self, task: Dict, error_msg: str):
        task_id = task['id']
        logger.error(f"Task {task_id} failed: {error_msg}")
        
        retry_count = task.get('retry_count', 0) + 1
        max_retries = task.get('max_retries', 3)
        
        self.log_progress(task_id, f"Task failed: {error_msg}", -1)
        
        if retry_count <= max_retries:
            logger.info(f"Retrying task {task_id} ({retry_count}/{max_retries})...")
            delay = task.get('retry_delay', 5)
            time.sleep(delay)
            
            task['retry_count'] = retry_count
            task['status'] = 'pending'
            task['assigned_node'] = ''
            
            task_key = f"{Config.TASK_PREFIX}{task_id}"
            self.etcd.put(task_key, json.dumps(task))
        else:
            self.update_task_status(task_id, 'failed', error=error_msg)

    def update_task_status(self, task_id: str, status: str, result: str = '', error: str = ''):
        try:
            task_key = f"{Config.TASK_PREFIX}{task_id}"
            task_data, _ = self.etcd.get(task_key)
            
            if task_data:
                task = json.loads(task_data)
                task['status'] = status
                task['updated_at'] = datetime.now().isoformat()
                
                if result:
                    task['result'] = result
                if error:
                    task['error'] = error
                if status == 'completed':
                    task['completed_at'] = datetime.now().isoformat()
                    task['progress'] = 100
                
                self.etcd.put(task_key, json.dumps(task))
                logger.info(f"Task {task_id} status updated to {status}")
        except Exception as e:
            logger.error(f"Failed to update task status: {e}")

    def update_task_heartbeat(self, task_id: str, progress: int = None):
        try:
            self.task_status_lock.acquire()
            task_key = f"{Config.TASK_PREFIX}{task_id}"
            task_data, _ = self.etcd.get(task_key)
            
            if task_data:
                task = json.loads(task_data)
                if task.get('status') == 'running' and task.get('assigned_node') == self.node_id:
                    task['last_heartbeat'] = datetime.now().isoformat()
                    if progress is not None:
                        task['progress'] = progress
                    self.etcd.put(task_key, json.dumps(task))
        except Exception as e:
            logger.error(f"Failed to update task heartbeat {task_id}: {e}")
        finally:
            self.task_status_lock.release()

    def task_status_updater(self):
        while self.running:
            try:
                task_ids = list(self.running_tasks.keys())
                for task_id in task_ids:
                    self.update_task_heartbeat(task_id)
                time.sleep(30)
            except Exception as e:
                logger.error(f"Task status updater error: {e}")
                time.sleep(5)

    def log_progress(self, task_id: str, message: str, progress: int):
        try:
            log_entry = {
                'task_id': task_id,
                'message': message,
                'progress': progress,
                'timestamp': datetime.now().isoformat()
            }
            
            log_key = f"{Config.LOG_PREFIX}{task_id}/{uuid.uuid4()}"
            self.etcd.put(log_key, json.dumps(log_entry))
            
            if progress >= 0:
                self.update_task_heartbeat(task_id, progress)
                    
        except Exception as e:
            logger.error(f"Failed to log progress: {e}")

    def cleanup(self):
        logger.info("Cleaning up...")
        self.running = False
        
        for task_id, process in self.running_tasks.items():
            logger.info(f"Terminating task: {task_id}")
            process.terminate()
        
        try:
            node_key = f"{Config.NODE_PREFIX}{self.node_id}"
            self.etcd.delete(node_key)
        except:
            pass
        
        self.etcd.close()
        logger.info("Cleanup complete")

    def start(self):
        logger.info(f"Starting Task Executor: {self.node_id}")
        
        self.register_node()
        
        heartbeat_thread = threading.Thread(target=self.heartbeat)
        heartbeat_thread.daemon = True
        heartbeat_thread.start()
        
        watch_thread = threading.Thread(target=self.watch_tasks)
        watch_thread.daemon = True
        watch_thread.start()
        
        task_status_thread = threading.Thread(target=self.task_status_updater)
        task_status_thread.daemon = True
        task_status_thread.start()
        
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        finally:
            self.cleanup()


if __name__ == '__main__':
    executor = TaskExecutor()
    executor.start()
