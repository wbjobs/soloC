import threading
import queue
import time
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from database import get_db, RestorationTask
from restoration_engine import RestorationEngine
from datetime import datetime
import os

class TaskScheduler:
    def __init__(self, max_workers=3):
        self.task_queue = queue.Queue()
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.active_tasks = {}
        self.lock = threading.Lock()
        self.running = True
        self.worker_thread = threading.Thread(target=self._process_queue, daemon=True)
        self.worker_thread.start()
        
    def add_task(self, task_id, image_path, task_type, db_session):
        with self.lock:
            if task_id in self.active_tasks:
                return False
            self.task_queue.put({
                'task_id': task_id,
                'image_path': image_path,
                'task_type': task_type
            })
            self.active_tasks[task_id] = 'queued'
            return True
    
    def _process_queue(self):
        while self.running:
            try:
                task_data = self.task_queue.get(timeout=1)
                task_id = task_data['task_id']
                with self.lock:
                    self.active_tasks[task_id] = 'processing'
                self.executor.submit(self._execute_task, task_data)
            except queue.Empty:
                continue
    
    def _execute_task(self, task_data):
        task_id = task_data['task_id']
        image_path = task_data['image_path']
        task_type = task_data['task_type']
        db = None
        
        try:
            from database import SessionLocal
            db = SessionLocal()
            task = db.query(RestorationTask).filter(RestorationTask.id == task_id).first()
            if not task:
                return
            
            task.status = "processing"
            db.commit()
            
            restoration_engine = RestorationEngine()
            
            for progress in range(0, 101, 5):
                task.progress = progress
                db.commit()
                time.sleep(0.1)
            
            result_path = restoration_engine.restore(image_path, task_type)
            
            task.status = "completed"
            task.progress = 100
            task.result_path = result_path
            task.completed_time = datetime.utcnow()
            db.commit()
            
        except Exception as e:
            if db:
                task = db.query(RestorationTask).filter(RestorationTask.id == task_id).first()
                if task:
                    task.status = "failed"
                    db.commit()
        finally:
            if db:
                db.close()
            with self.lock:
                if task_id in self.active_tasks:
                    del self.active_tasks[task_id]
    
    def get_queue_status(self):
        return {
            'queue_size': self.task_queue.qsize(),
            'active_tasks': len(self.active_tasks),
            'max_workers': self.executor._max_workers
        }
    
    def shutdown(self):
        self.running = False
        self.executor.shutdown(wait=True)

global_scheduler = None

def get_scheduler():
    global global_scheduler
    if global_scheduler is None:
        global_scheduler = TaskScheduler(max_workers=3)
    return global_scheduler
