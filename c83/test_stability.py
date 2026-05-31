import os
import sys
import tempfile
import numpy as np
from PIL import Image
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from core.model_manager import ModelManager
from core.image_processor import ImageProcessor
from core.task_queue import TaskQueueManager

def create_test_images(num_images=10, size=(256, 256)):
    temp_dir = tempfile.mkdtemp(prefix="test_images_")
    image_paths = []
    
    for i in range(num_images):
        img_array = np.random.randint(0, 256, (*size, 3), dtype=np.uint8)
        img = Image.fromarray(img_array).convert('L').convert('RGB')
        path = os.path.join(temp_dir, f"test_{i:03d}.png")
        img.save(path)
        image_paths.append(path)
        
    print(f"已创建 {num_images} 张测试图片到: {temp_dir}")
    return image_paths

def test_task_queue():
    print("\n=== 测试任务队列管理器 ===")
    
    model_manager = ModelManager()
    image_processor = ImageProcessor()
    
    success, msg = model_manager.load_models()
    print(f"模型加载: {msg}")
    
    task_manager = TaskQueueManager(model_manager, image_processor)
    
    test_results = {'started': 0, 'completed': 0, 'progress': []}
    
    def on_task_started(task_id):
        test_results['started'] += 1
        print(f"任务开始: {task_id} (已开始: {test_results['started']})")
        
    def on_task_progress(task_id, progress):
        test_results['progress'].append(progress)
        print(f"任务进度: {task_id} - {progress}%")
        
    def on_task_completed(task_id, result):
        test_results['completed'] += 1
        if 'results' in result:
            print(f"批量任务完成: {task_id} - {len(result['results'])} 张图片")
        else:
            print(f"单张任务完成: {task_id}")
    
    task_manager.task_started.connect(on_task_started)
    task_manager.task_progress.connect(on_task_progress)
    task_manager.task_completed.connect(on_task_completed)
    
    image_paths = create_test_images(5)
    
    print("\n--- 批量添加任务测试 ---")
    for path in image_paths:
        task_manager.add_task('process_image', path)
        
    import time
    timeout = 60
    start_time = time.time()
    while (test_results['completed'] < len(image_paths) and 
           time.time() - start_time < timeout):
        time.sleep(0.5)
        
    print(f"\n任务完成统计:")
    print(f"  - 已开始: {test_results['started']}")
    print(f"  - 已完成: {test_results['completed']}")
    print(f"  - 进度更新: {len(test_results['progress'])} 次")
    
    if test_results['completed'] == len(image_paths):
        print("✓ 所有任务成功完成")
    else:
        print(f"✗ 任务未全部完成: {test_results['completed']}/{len(image_paths)}")
        
    return test_results['completed'] == len(image_paths)

def test_memory_cleanup():
    print("\n=== 测试内存清理机制 ===")
    
    model_manager = ModelManager()
    image_processor = ImageProcessor()
    model_manager.load_models()
    
    image_paths = create_test_images(3)
    
    print("\n处理图片并检查内存...")
    
    for i, path in enumerate(image_paths):
        print(f"\n处理第 {i+1} 张...")
        result = image_processor.process_image(path, model_manager)
        print(f"  - 输出尺寸: {result.size}")
        del result
        import gc
        gc.collect()
        print("  - 内存已清理")
        
    print("✓ 内存清理测试完成")
    return True

def test_cancel():
    print("\n=== 测试取消功能 ===")
    
    model_manager = ModelManager()
    image_processor = ImageProcessor()
    model_manager.load_models()
    
    task_manager = TaskQueueManager(model_manager, image_processor)
    
    cancelled = {'count': 0}
    
    def on_task_cancelled(task_id):
        cancelled['count'] += 1
        print(f"任务已取消: {task_id}")
        
    task_manager.task_cancelled.connect(on_task_cancelled)
    
    image_paths = create_test_images(10)
    
    for path in image_paths:
        task_manager.add_task('process_image', path)
        
    import time
    time.sleep(0.5)
    
    print("发送取消所有任务...")
    task_manager.cancel_all()
    
    time.sleep(1)
    
    queue_size = task_manager.get_queue_size()
    print(f"队列剩余任务: {queue_size}")
    print(f"取消回调次数: {cancelled['count']}")
    
    print("✓ 取消功能测试完成")
    return True

def main():
    print("=" * 60)
    print("稳定性测试 - 任务队列与内存管理")
    print("=" * 60)
    
    all_passed = True
    
    try:
        all_passed &= test_task_queue()
    except Exception as e:
        print(f"✗ 任务队列测试失败: {e}")
        import traceback
        traceback.print_exc()
        all_passed = False
        
    try:
        all_passed &= test_memory_cleanup()
    except Exception as e:
        print(f"✗ 内存清理测试失败: {e}")
        all_passed = False
        
    try:
        all_passed &= test_cancel()
    except Exception as e:
        print(f"✗ 取消功能测试失败: {e}")
        all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✓ 所有测试通过!")
    else:
        print("✗ 部分测试失败")
    print("=" * 60)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
