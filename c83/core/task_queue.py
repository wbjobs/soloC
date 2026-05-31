import gc
import time
from queue import Queue, Empty
from threading import Lock
from PyQt5.QtCore import QThread, pyqtSignal, QObject

class Task:
    def __init__(self, task_id, task_type, data, callback=None, style_key='none', style_strength=0.5):
        self.id = task_id
        self.type = task_type
        self.data = data
        self.callback = callback
        self.style_key = style_key
        self.style_strength = style_strength
        self.is_cancelled = False
        self.progress = 0
        self.result = None
        self.error = None

class TaskQueueManager(QObject):
    task_started = pyqtSignal(str)
    task_progress = pyqtSignal(str, int)
    task_completed = pyqtSignal(str, object)
    task_failed = pyqtSignal(str, str)
    task_cancelled = pyqtSignal(str)
    queue_updated = pyqtSignal(int, int)

    def __init__(self, model_manager, image_processor):
        super().__init__()
        self.model_manager = model_manager
        self.image_processor = image_processor
        self.task_queue = Queue()
        self.current_task = None
        self.worker_thread = None
        self.is_running = False
        self._lock = Lock()
        self.task_counter = 0
        self.completed_count = 0

    def add_task(self, task_type, data, callback=None, style_key='none', style_strength=0.5):
        with self._lock:
            self.task_counter += 1
            task = Task(f"task_{self.task_counter}", task_type, data, callback, 
                       style_key=style_key, style_strength=style_strength)
            self.task_queue.put(task)
            self.queue_updated.emit(self.task_queue.qsize(), self.completed_count)

            if not self.is_running:
                self._start_worker()

            return task.id

    def _start_worker(self):
        self.is_running = True
        self.worker_thread = WorkerThread(self)
        self.worker_thread.start()

    def cancel_task(self, task_id):
        with self._lock:
            if self.current_task and self.current_task.id == task_id:
                self.current_task.is_cancelled = True
                self.task_cancelled.emit(task_id)
                return True
        return False

    def cancel_all(self):
        with self._lock:
            if self.current_task:
                self.current_task.is_cancelled = True

            while not self.task_queue.empty():
                try:
                    task = self.task_queue.get_nowait()
                    self.task_cancelled.emit(task.id)
                except Empty:
                    break

            self.queue_updated.emit(0, self.completed_count)

    def get_queue_size(self):
        return self.task_queue.qsize()

    def clear_memory(self):
        gc.collect()
        try:
            import onnxruntime as ort
            if hasattr(ort, 'clear_cuda_cache'):
                ort.clear_cuda_cache()
        except:
            pass


class WorkerThread(QThread):
    def __init__(self, manager):
        super().__init__()
        self.manager = manager

    def run(self):
        while True:
            try:
                task = self.manager.task_queue.get(timeout=1)
            except Empty:
                with self.manager._lock:
                    if self.manager.task_queue.empty():
                        self.manager.is_running = False
                        break
                    continue

            with self.manager._lock:
                self.manager.current_task = task

            try:
                self.manager.task_started.emit(task.id)

                if task.is_cancelled:
                    self.manager.task_cancelled.emit(task.id)
                    continue

                result = self._process_task(task)

                if task.is_cancelled:
                    self.manager.task_cancelled.emit(task.id)
                    continue

                self.manager.task_completed.emit(task.id, result)
                with self.manager._lock:
                    self.manager.completed_count += 1
                    self.manager.queue_updated.emit(
                        self.manager.task_queue.qsize(),
                        self.manager.completed_count
                    )

            except Exception as e:
                self.manager.task_failed.emit(task.id, str(e))
            finally:
                self.manager.clear_memory()
                with self.manager._lock:
                    self.manager.current_task = None

        self.manager.clear_memory()

    def _process_task(self, task):
        if task.type == 'process_image':
            image_path = task.data
            self.manager.task_progress.emit(task.id, 10)
            time.sleep(0.1)

            if task.is_cancelled:
                return None

            result = self.manager.image_processor.process_image(
                image_path,
                self.manager.model_manager,
                style_key=task.style_key,
                style_strength=task.style_strength
            )
            self.manager.task_progress.emit(task.id, 100)

            return {'image_path': image_path, 'result': result}

        elif task.type == 'batch_process':
            image_paths = task.data
            results = []
            total = len(image_paths)

            for i, path in enumerate(image_paths):
                if task.is_cancelled:
                    break

                progress = int((i / total) * 100)
                self.manager.task_progress.emit(task.id, progress)

                result = self.manager.image_processor.process_image(
                    path,
                    self.manager.model_manager,
                    style_key=task.style_key,
                    style_strength=task.style_strength
                )
                results.append({'image_path': path, 'result': result})

                self.manager.clear_memory()

            self.manager.task_progress.emit(task.id, 100)
            return {'results': results}

        return None
