import os
import shutil
import json
import threading
import uuid
from datetime import datetime
from collections import deque
from pathlib import Path


class Operation:
    def __init__(self, op_type, description):
        self.id = str(uuid.uuid4())
        self.type = op_type
        self.description = description
        self.timestamp = datetime.now().isoformat()
        self.data = {}
        self._completed = False

    def set_data(self, key, value):
        self.data[key] = value

    def get_data(self, key, default=None):
        return self.data.get(key, default)


class OperationHistory:
    def __init__(self, max_size=50):
        self._lock = threading.Lock()
        self._undo_stack = deque(maxlen=max_size)
        self._redo_stack = deque(maxlen=max_size)
        self._current_operation = None

    def start_operation(self, op_type, description):
        with self._lock:
            self._current_operation = Operation(op_type, description)
            return self._current_operation

    def complete_operation(self, operation=None):
        with self._lock:
            op = operation or self._current_operation
            if op:
                op._completed = True
                self._undo_stack.append(op)
                self._redo_stack.clear()
                self._current_operation = None

    def can_undo(self):
        with self._lock:
            return len(self._undo_stack) > 0

    def can_redo(self):
        with self._lock:
            return len(self._redo_stack) > 0

    def pop_undo(self):
        with self._lock:
            if self._undo_stack:
                op = self._undo_stack.pop()
                self._redo_stack.append(op)
                return op
        return None

    def pop_redo(self):
        with self._lock:
            if self._redo_stack:
                op = self._redo_stack.pop()
                self._undo_stack.append(op)
                return op
        return None

    def get_history(self, limit=20):
        with self._lock:
            return list(self._undo_stack)[-limit:]


class TrashBin:
    def __init__(self, trash_dir='.dedup_trash'):
        self.trash_dir = os.path.abspath(trash_dir)
        self._lock = threading.Lock()
        self._ensure_trash_dir()

    def _ensure_trash_dir(self):
        os.makedirs(self.trash_dir, exist_ok=True)
        os.makedirs(os.path.join(self.trash_dir, 'files'), exist_ok=True)

    def _get_trash_path(self, original_path):
        filename = os.path.basename(original_path)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        return os.path.join(self.trash_dir, 'files', f"{timestamp}_{filename}")

    def move_to_trash(self, original_path):
        with self._lock:
            if not os.path.exists(original_path):
                return None

            trash_path = self._get_trash_path(original_path)
            
            try:
                if os.path.isdir(original_path):
                    shutil.move(original_path, trash_path)
                else:
                    shutil.move(original_path, trash_path)
                return trash_path
            except Exception as e:
                print(f"Failed to move to trash: {e}")
                return None

    def restore_from_trash(self, trash_path, original_path):
        with self._lock:
            if not os.path.exists(trash_path):
                return False

            try:
                original_dir = os.path.dirname(original_path)
                os.makedirs(original_dir, exist_ok=True)
                shutil.move(trash_path, original_path)
                return True
            except Exception as e:
                print(f"Failed to restore from trash: {e}")
                return False

    def empty_trash(self, older_than_days=30):
        with self._lock:
            files_dir = os.path.join(self.trash_dir, 'files')
            if not os.path.exists(files_dir):
                return

            now = datetime.now()
            for filename in os.listdir(files_dir):
                filepath = os.path.join(files_dir, filename)
                try:
                    mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
                    if (now - mtime).days >= older_than_days:
                        if os.path.isdir(filepath):
                            shutil.rmtree(filepath)
                        else:
                            os.remove(filepath)
                except Exception as e:
                    print(f"Failed to delete old trash file: {e}")


class CleanupManager:
    def __init__(self, indexer):
        self.indexer = indexer
        self.history = OperationHistory()
        self.trash = TrashBin()
        self._lock = threading.Lock()

    def create_symlink(self, target_path, link_path):
        try:
            if os.path.exists(link_path):
                os.remove(link_path)
            
            dir_path = os.path.dirname(link_path)
            os.makedirs(dir_path, exist_ok=True)

            if os.name == 'nt':
                os.symlink(target_path, link_path)
            else:
                os.symlink(os.path.relpath(target_path, dir_path), link_path)
            return True
        except Exception as e:
            print(f"Failed to create symlink: {e}")
            return False

    def replace_with_symlink(self, file_hash, keep_path, replace_paths):
        operation = self.history.start_operation(
            'symlink_replace',
            f"Replace {len(replace_paths)} copies of {os.path.basename(keep_path)} with symlinks"
        )

        operation.set_data('file_hash', file_hash)
        operation.set_data('keep_path', keep_path)
        operation.set_data('replacements', [])
        operation.set_data('trash_paths', {})

        success_count = 0

        try:
            for path in replace_paths:
                if path == keep_path:
                    continue

                if not os.path.exists(path):
                    continue

                trash_path = self.trash.move_to_trash(path)
                if not trash_path:
                    continue

                if self.create_symlink(keep_path, path):
                    operation.get_data('replacements').append({
                        'original_path': path,
                        'trash_path': trash_path,
                        'target_path': keep_path
                    })
                    operation.get_data('trash_paths')[path] = trash_path
                    success_count += 1

            self.history.complete_operation(operation)
            return {
                'success': True,
                'operation_id': operation.id,
                'replaced_count': success_count,
                'saved_space': os.path.getsize(keep_path) * success_count
            }

        except Exception as e:
            print(f"Replace operation failed: {e}")
            self._undo_replace(operation)
            return {
                'success': False,
                'error': str(e)
            }

    def _undo_replace(self, operation):
        replacements = operation.get_data('replacements', [])
        trash_paths = operation.get_data('trash_paths', {})

        for item in replacements:
            original_path = item['original_path']
            trash_path = item['trash_path']

            try:
                if os.path.exists(original_path):
                    if os.path.islink(original_path):
                        os.remove(original_path)
                
                if os.path.exists(trash_path):
                    self.trash.restore_from_trash(trash_path, original_path)
            except Exception as e:
                print(f"Failed to undo {original_path}: {e}")

    def undo(self):
        if not self.history.can_undo():
            return {'success': False, 'error': 'Nothing to undo'}

        operation = self.history.pop_undo()
        if not operation:
            return {'success': False, 'error': 'No operation found'}

        if operation.type == 'symlink_replace':
            self._undo_replace(operation)
            return {
                'success': True,
                'operation_id': operation.id,
                'description': operation.description
            }

        return {'success': False, 'error': 'Unknown operation type'}

    def redo(self):
        if not self.history.can_redo():
            return {'success': False, 'error': 'Nothing to redo'}

        operation = self.history.pop_redo()
        if not operation:
            return {'success': False, 'error': 'No operation found'}

        if operation.type == 'symlink_replace':
            keep_path = operation.get_data('keep_path')
            replacements = operation.get_data('replacements', [])
            
            success_count = 0
            for item in replacements:
                original_path = item['original_path']
                if self.create_symlink(keep_path, original_path):
                    success_count += 1

            return {
                'success': True,
                'operation_id': operation.id,
                'description': operation.description,
                'reapplied_count': success_count
            }

        return {'success': False, 'error': 'Unknown operation type'}

    def get_operation_status(self):
        return {
            'can_undo': self.history.can_undo(),
            'can_redo': self.history.can_redo(),
            'last_operation': self.history.get_history(1)[0].__dict__ if self.history.can_undo() else None,
            'history': [op.__dict__ for op in self.history.get_history(10)]
        }

    def auto_cleanup(self, min_copies=2, min_size=1024*1024):
        duplicates = self.indexer.get_duplicates()
        results = []
        total_saved = 0

        for file_hash, paths in duplicates.items():
            if len(paths) < min_copies:
                continue

            info = self.indexer.get_file_info(file_hash)
            if info.get('size', 0) < min_size:
                continue

            keep_path = min(paths, key=lambda p: len(os.path.dirname(p).split(os.sep)))
            replace_paths = [p for p in paths if p != keep_path]

            result = self.replace_with_symlink(file_hash, keep_path, replace_paths)
            if result['success']:
                results.append(result)
                total_saved += result['saved_space']

        return {
            'success': True,
            'operations': results,
            'total_saved_space': total_saved,
            'operations_count': len(results)
        }
