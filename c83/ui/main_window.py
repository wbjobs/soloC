import os
from PyQt5.QtWidgets import (QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QListWidget, QPushButton, QLabel, QSplitter,
                             QFileDialog, QProgressBar, QComboBox, QMessageBox,
                             QGroupBox, QSlider)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QPixmap, QImage
from .image_preview import ImagePreviewWidget
from ..core.image_processor import ImageProcessor
from ..core.model_manager import ModelManager
from ..core.task_queue import TaskQueueManager

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AI 图片增强工具 - 超分辨率与上色")
        self.setGeometry(100, 100, 1400, 900)
        
        self.image_processor = ImageProcessor()
        self.model_manager = ModelManager()
        self.task_manager = None
        self.current_task_id = None
        self.current_image_path = None
        self.processed_image = None
        self.results = {}
        
        self.init_ui()
        self.init_models()
        
    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QHBoxLayout(central_widget)
        
        splitter = QSplitter(Qt.Horizontal)
        
        left_panel = self.create_left_panel()
        right_panel = self.create_right_panel()
        
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 3)
        
        main_layout.addWidget(splitter)
        
    def create_left_panel(self):
        panel = QWidget()
        layout = QVBoxLayout(panel)
        
        device_label = QLabel("计算设备:")
        self.device_combo = QComboBox()
        self.device_combo.addItems(["自动检测", "CPU", "GPU"])
        
        layout.addWidget(device_label)
        layout.addWidget(self.device_combo)
        
        style_group = QGroupBox("艺术风格")
        style_layout = QVBoxLayout(style_group)
        
        style_label = QLabel("选择风格:")
        self.style_combo = QComboBox()
        self.style_combo.addItem("无风格", "none")
        self.style_combo.addItem("梵高星空", "van_gogh")
        self.style_combo.addItem("浮世绘", "ukiyoe")
        self.style_combo.addItem("立体主义", "cubism")
        self.style_combo.addItem("水彩画", "watercolor")
        self.style_combo.addItem("油画", "oil_painting")
        self.style_combo.setCurrentIndex(0)
        
        strength_label = QLabel("风格强度:")
        self.style_strength_slider = QSlider(Qt.Horizontal)
        self.style_strength_slider.setRange(0, 100)
        self.style_strength_slider.setValue(50)
        self.style_strength_label = QLabel("50%")
        
        self.style_strength_slider.valueChanged.connect(
            lambda v: self.style_strength_label.setText(f"{v}%")
        )
        
        strength_layout = QHBoxLayout()
        strength_layout.addWidget(strength_label)
        strength_layout.addWidget(self.style_strength_slider)
        strength_layout.addWidget(self.style_strength_label)
        
        style_layout.addWidget(style_label)
        style_layout.addWidget(self.style_combo)
        style_layout.addLayout(strength_layout)
        layout.addWidget(style_group)
        
        list_label = QLabel("图片列表 (拖拽或添加):")
        self.image_list = QListWidget()
        self.image_list.setAcceptDrops(True)
        self.image_list.dragEnterEvent = self.drag_enter_event
        self.image_list.dropEvent = self.drop_event
        self.image_list.itemClicked.connect(self.on_image_selected)
        self.image_list.setSelectionMode(QListWidget.ExtendedSelection)
        
        add_btn = QPushButton("添加图片")
        add_btn.clicked.connect(self.add_images)
        
        clear_btn = QPushButton("清空列表")
        clear_btn.clicked.connect(self.clear_list)
        
        btn_layout1 = QHBoxLayout()
        btn_layout1.addWidget(add_btn)
        btn_layout1.addWidget(clear_btn)
        layout.addLayout(btn_layout1)
        
        process_group = QGroupBox("处理")
        process_layout = QVBoxLayout(process_group)
        
        process_btn = QPushButton("处理选中图片")
        process_btn.clicked.connect(self.process_selected)
        
        batch_btn = QPushButton("批量处理所有")
        batch_btn.clicked.connect(self.batch_process_all)
        
        self.cancel_btn = QPushButton("取消处理")
        self.cancel_btn.clicked.connect(self.cancel_processing)
        self.cancel_btn.setEnabled(False)
        self.cancel_btn.setStyleSheet("background-color: #ff6b6b; color: white;")
        
        process_layout.addWidget(process_btn)
        process_layout.addWidget(batch_btn)
        process_layout.addWidget(self.cancel_btn)
        layout.addWidget(process_group)
        
        export_group = QGroupBox("导出")
        export_layout = QVBoxLayout(export_group)
        
        export_btn = QPushButton("导出当前结果")
        export_btn.clicked.connect(self.export_result)
        
        export_all_btn = QPushButton("批量导出所有结果")
        export_all_btn.clicked.connect(self.export_all_results)
        
        export_layout.addWidget(export_btn)
        export_layout.addWidget(export_all_btn)
        layout.addWidget(export_group)
        
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        
        self.status_label = QLabel("就绪")
        self.queue_status_label = QLabel("队列: 0 等待 | 0 完成")
        
        layout.addWidget(self.progress_bar)
        layout.addWidget(self.status_label)
        layout.addWidget(self.queue_status_label)
        
        layout.addWidget(list_label)
        layout.addWidget(self.image_list)
        
        return panel
        
    def create_right_panel(self):
        panel = QWidget()
        layout = QVBoxLayout(panel)
        
        self.preview_widget = ImagePreviewWidget()
        
        layout.addWidget(self.preview_widget)
        
        return panel
        
    def init_models(self):
        self.status_label.setText("正在加载模型...")
        success, msg = self.model_manager.load_models()
        if not success:
            QMessageBox.warning(self, "模型加载失败", msg)
        self.status_label.setText(msg)
        
        self.task_manager = TaskQueueManager(self.model_manager, self.image_processor)
        self.task_manager.task_started.connect(self.on_task_started)
        self.task_manager.task_progress.connect(self.on_task_progress)
        self.task_manager.task_completed.connect(self.on_task_completed)
        self.task_manager.task_failed.connect(self.on_task_failed)
        self.task_manager.task_cancelled.connect(self.on_task_cancelled)
        self.task_manager.queue_updated.connect(self.on_queue_updated)
        
    def drag_enter_event(self, event):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            
    def drop_event(self, event):
        files = []
        for url in event.mimeData().urls():
            if url.isLocalFile():
                path = url.toLocalFile()
                if path.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.webp')):
                    files.append(path)
                    
        for f in files:
            if self.image_list.findItems(f, Qt.MatchExactly):
                continue
            self.image_list.addItem(f)
            
    def add_images(self):
        files, _ = QFileDialog.getOpenFileNames(
            self, "选择图片", "", 
            "图片文件 (*.png *.jpg *.jpeg *.bmp *.webp)"
        )
        for f in files:
            if self.image_list.findItems(f, Qt.MatchExactly):
                continue
            self.image_list.addItem(f)
            
    def clear_list(self):
        self.image_list.clear()
        self.preview_widget.clear()
        self.current_image_path = None
        self.processed_image = None
        self.results.clear()
        self.queue_status_label.setText("队列: 0 等待 | 0 完成")
        
    def on_image_selected(self, item):
        self.current_image_path = item.text()
        self.preview_widget.load_original(self.current_image_path)
        
        if self.current_image_path in self.results:
            self.processed_image = self.results[self.current_image_path]
            self.preview_widget.set_processed(self.processed_image)
        else:
            self.processed_image = None
            self.preview_widget.processed_pixmap = None
            self.preview_widget.image_container.update()
            
    def get_current_style_settings(self):
        """获取当前风格设置"""
        style_key = self.style_combo.currentData()
        strength = self.style_strength_slider.value() / 100.0
        return style_key, strength
        
    def process_selected(self):
        selected_items = self.image_list.selectedItems()
        if not selected_items:
            QMessageBox.warning(self, "提示", "请先选择要处理的图片")
            return
            
        self.cancel_btn.setEnabled(True)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 100)
        
        style_key, style_strength = self.get_current_style_settings()
        
        for item in selected_items:
            image_path = item.text()
            task_id = self.task_manager.add_task(
                'process_image', 
                image_path,
                style_key=style_key,
                style_strength=style_strength
            )
            
    def batch_process_all(self):
        count = self.image_list.count()
        if count == 0:
            QMessageBox.warning(self, "提示", "请先添加图片")
            return
            
        self.cancel_btn.setEnabled(True)
        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 100)
        
        style_key, style_strength = self.get_current_style_settings()
        
        image_paths = [self.image_list.item(i).text() for i in range(count)]
        task_id = self.task_manager.add_task(
            'batch_process', 
            image_paths,
            style_key=style_key,
            style_strength=style_strength
        )
        
    def cancel_processing(self):
        self.task_manager.cancel_all()
        self.cancel_btn.setEnabled(False)
        self.status_label.setText("已取消")
        
    def on_task_started(self, task_id):
        self.current_task_id = task_id
        self.status_label.setText(f"正在处理...")
        
    def on_task_progress(self, task_id, progress):
        self.progress_bar.setValue(progress)
        
    def on_task_completed(self, task_id, result):
        if 'image_path' in result:
            image_path = result['image_path']
            processed = result['result']
            self.results[image_path] = processed
            
            if image_path == self.current_image_path:
                self.processed_image = processed
                self.preview_widget.set_processed(processed)
                
            filename = os.path.basename(image_path)
            self.status_label.setText(f"完成: {filename}")
            
        elif 'results' in result:
            for r in result['results']:
                image_path = r['image_path']
                processed = r['result']
                self.results[image_path] = processed
                
                if image_path == self.current_image_path:
                    self.processed_image = processed
                    self.preview_widget.set_processed(processed)
            
            self.status_label.setText(f"批量处理完成: {len(result['results'])} 张")
            
        if self.task_manager.get_queue_size() == 0:
            self.cancel_btn.setEnabled(False)
            
    def on_task_failed(self, task_id, error):
        QMessageBox.critical(self, "处理失败", error)
        self.status_label.setText("处理失败")
        
        if self.task_manager.get_queue_size() == 0:
            self.cancel_btn.setEnabled(False)
            
    def on_task_cancelled(self, task_id):
        if self.task_manager.get_queue_size() == 0:
            self.cancel_btn.setEnabled(False)
            self.progress_bar.setVisible(False)
            self.status_label.setText("已取消所有任务")
            
    def on_queue_updated(self, waiting, completed):
        self.queue_status_label.setText(f"队列: {waiting} 等待 | {completed} 完成")
        
    def export_result(self):
        if not self.processed_image:
            QMessageBox.warning(self, "提示", "请先处理一张图片")
            return
            
        path, _ = QFileDialog.getSaveFileName(
            self, "导出图片", "", 
            "PNG图片 (*.png);;WebP图片 (*.webp)"
        )
        if path:
            self.processed_image.save(path)
            self.status_label.setText(f"已导出到: {os.path.basename(path)}")
            
    def export_all_results(self):
        if not self.results:
            QMessageBox.warning(self, "提示", "没有可导出的处理结果")
            return
            
        export_dir = QFileDialog.getExistingDirectory(self, "选择导出目录")
        if not export_dir:
            return
            
        count = 0
        for image_path, image in self.results.items():
            base_name = os.path.splitext(os.path.basename(image_path))[0]
            output_path = os.path.join(export_dir, f"{base_name}_enhanced.png")
            image.save(output_path)
            count += 1
            
        self.status_label.setText(f"已导出 {count} 张图片到: {export_dir}")
        QMessageBox.information(self, "导出完成", f"成功导出 {count} 张图片")
