import os
import sys
import threading
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
import json
from file_indexer import FileIndexer
from dedup_fs import mount_fs_in_thread
from cleanup_manager import CleanupManager

app = Flask(__name__)
CORS(app)

indexer = FileIndexer(max_workers=8)
cleanup_manager = CleanupManager(indexer)
fs_mounted = False
mount_thread = None

class ProgressStreamer:
    def __init__(self):
        self.clients = []
        self._lock = threading.Lock()
    
    def add_client(self):
        q = queue.Queue(maxsize=100)
        with self._lock:
            self.clients.append(q)
        return q
    
    def remove_client(self, q):
        with self._lock:
            if q in self.clients:
                self.clients.remove(q)
    
    def broadcast(self, message):
        with self._lock:
            for q in self.clients:
                try:
                    q.put_nowait(message)
                except queue.Full:
                    pass

progress_streamer = ProgressStreamer()

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        'mounted': fs_mounted,
        'total_files': indexer.get_total_files(),
        'total_hashes': len(indexer.get_all_hashes()),
        'is_indexing': indexer.is_indexing(),
        'progress': indexer.get_progress()
    })

@app.route('/api/index', methods=['POST'])
def start_indexing():
    data = request.json or {}
    path = data.get('path', os.path.expanduser('~'))
    
    def progress_callback(current, total):
        progress_streamer.broadcast(json.dumps({
            'type': 'progress',
            'current': current,
            'total': total,
            'percent': round((current / total * 100), 2) if total > 0 else 0
        }))
    
    def index_thread():
        indexer.index_directory(path, progress_callback)
        progress_streamer.broadcast(json.dumps({
            'type': 'complete',
            'total_files': indexer.get_total_files()
        }))
    
    thread = threading.Thread(target=index_thread)
    thread.daemon = True
    thread.start()
    
    return jsonify({'status': 'started', 'path': path})

@app.route('/api/index/cancel', methods=['POST'])
def cancel_indexing():
    indexer.cancel_indexing()
    return jsonify({'status': 'cancelled'})

@app.route('/api/index/progress', methods=['GET'])
def stream_progress():
    def generate():
        q = progress_streamer.add_client()
        try:
            while True:
                try:
                    msg = q.get(timeout=30)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        finally:
            progress_streamer.remove_client(q)
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/duplicates', methods=['GET'])
def get_duplicates():
    page = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 50)), 200)
    min_size = int(request.args.get('min_size', 0))
    
    duplicates = indexer.get_duplicates()
    result = []
    
    for h, paths in duplicates.items():
        info = indexer.get_file_info(h)
        size = info.get('size', 0)
        if size >= min_size:
            result.append({
                'hash': h,
                'paths': paths,
                'count': len(paths),
                'size': size,
                'saved_size': size * (len(paths) - 1)
            })
    
    result.sort(key=lambda x: x['saved_size'], reverse=True)
    
    total = len(result)
    start = (page - 1) * per_page
    end = start + per_page
    paginated = result[start:end]
    
    return jsonify({
        'data': paginated,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'pages': (total + per_page - 1) // per_page
        }
    })

@app.route('/api/file/<file_hash>', methods=['GET'])
def get_file_info(file_hash):
    info = indexer.get_file_info(file_hash)
    paths = indexer.index.get_files_by_hash(file_hash)
    return jsonify({
        'hash': file_hash,
        'info': info,
        'paths': paths
    })

@app.route('/api/mount', methods=['POST'])
def mount_fs_endpoint():
    global fs_mounted, mount_thread
    if sys.platform == 'win32':
        return jsonify({'error': 'FUSE not supported on Windows, use Dokany instead'}), 400
    
    if fs_mounted:
        return jsonify({'status': 'already_mounted'})
    
    mount_point = '/mnt/dedup'
    if not os.path.exists(mount_point):
        os.makedirs(mount_point)
    
    mount_thread = threading.Thread(target=mount_fs_in_thread, args=(indexer, mount_point))
    mount_thread.daemon = True
    mount_thread.start()
    fs_mounted = True
    
    return jsonify({'status': 'mounted', 'mount_point': mount_point})

@app.route('/api/tree', methods=['GET'])
def get_file_tree():
    page = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 100)), 500)
    
    duplicates = indexer.get_duplicates()
    tree = []
    
    for h, paths in duplicates.items():
        info = indexer.get_file_info(h)
        first_path = paths[0]
        filename = os.path.basename(first_path)
        tree.append({
            'id': h,
            'name': f"{filename} ({len(paths)} copies)",
            'hash': h,
            'size': info.get('size', 0),
            'count': len(paths),
            'paths_count': len(paths)
        })
    
    tree.sort(key=lambda x: x['size'] * (x['count'] - 1), reverse=True)
    
    total = len(tree)
    start = (page - 1) * per_page
    end = start + per_page
    paginated = tree[start:end]
    
    return jsonify({
        'data': paginated,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'pages': (total + per_page - 1) // per_page
        }
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    duplicates = indexer.get_duplicates()
    total_wasted = 0
    for h, paths in duplicates.items():
        info = indexer.get_file_info(h)
        size = info.get('size', 0)
        total_wasted += size * (len(paths) - 1)
    
    return jsonify({
        'total_files': indexer.get_total_files(),
        'unique_files': len(indexer.get_all_hashes()),
        'duplicate_groups': len(duplicates),
        'wasted_space': total_wasted
    })


@app.route('/api/cleanup/replace', methods=['POST'])
def replace_with_symlink():
    data = request.json
    file_hash = data.get('file_hash')
    keep_path = data.get('keep_path')
    replace_paths = data.get('replace_paths', [])

    if not file_hash or not keep_path:
        return jsonify({'success': False, 'error': 'Missing required parameters'}), 400

    result = cleanup_manager.replace_with_symlink(file_hash, keep_path, replace_paths)
    return jsonify(result)


@app.route('/api/cleanup/undo', methods=['POST'])
def undo_operation():
    result = cleanup_manager.undo()
    return jsonify(result)


@app.route('/api/cleanup/redo', methods=['POST'])
def redo_operation():
    result = cleanup_manager.redo()
    return jsonify(result)


@app.route('/api/cleanup/status', methods=['GET'])
def get_cleanup_status():
    return jsonify(cleanup_manager.get_operation_status())


@app.route('/api/cleanup/auto', methods=['POST'])
def auto_cleanup():
    data = request.json or {}
    min_copies = data.get('min_copies', 2)
    min_size = data.get('min_size', 1024 * 1024)
    
    result = cleanup_manager.auto_cleanup(min_copies, min_size)
    return jsonify(result)


if __name__ == '__main__':
    import queue
    print("Starting Dedup FS Server")
    print(f"Indexed {indexer.get_total_files()} files from cache")
    app.run(host='127.0.0.1', port=5000, debug=True, threaded=True)
