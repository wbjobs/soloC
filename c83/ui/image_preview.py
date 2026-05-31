from PyQt5.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                             QSlider, QPainter, QColor, QPen)
from PyQt5.QtCore import Qt, QPoint, QRect
from PyQt5.QtGui import QPixmap, QImage, QPainterPath
from PIL import Image, ImageQt

class ImagePreviewWidget(QWidget):
    def __init__(self):
        super().__init__()
        self.original_pixmap = None
        self.processed_pixmap = None
        self.split_position = 0.5
        self.is_dragging = False
        
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout(self)
        
        self.image_container = ImageContainer(self)
        
        slider_layout = QHBoxLayout()
        slider_layout.addWidget(QLabel("原始"))
        
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(0, 100)
        self.slider.setValue(50)
        self.slider.valueChanged.connect(self.on_slider_changed)
        
        slider_layout.addWidget(self.slider)
        slider_layout.addWidget(QLabel("处理后"))
        
        layout.addWidget(self.image_container, 1)
        layout.addLayout(slider_layout)
        
    def load_original(self, image_path):
        self.original_pixmap = QPixmap(image_path)
        self.image_container.set_images(self.original_pixmap, self.processed_pixmap)
        
    def set_processed(self, pil_image):
        if pil_image:
            qimage = ImageQt.ImageQt(pil_image)
            self.processed_pixmap = QPixmap.fromImage(qimage)
            self.image_container.set_images(self.original_pixmap, self.processed_pixmap)
            
    def on_slider_changed(self, value):
        self.split_position = value / 100.0
        self.image_container.set_split_position(self.split_position)
        
    def clear(self):
        self.original_pixmap = None
        self.processed_pixmap = None
        self.image_container.clear()
        self.slider.setValue(50)

class ImageContainer(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(400, 400)
        self.setMouseTracking(True)
        
        self.original_pixmap = None
        self.processed_pixmap = None
        self.split_position = 0.5
        self.scaled_original = None
        self.scaled_processed = None
        self.draw_rect = QRect()
        
    def set_images(self, original, processed):
        self.original_pixmap = original
        self.processed_pixmap = processed
        self.update_scaled_images()
        self.update()
        
    def set_split_position(self, pos):
        self.split_position = pos
        self.update()
        
    def update_scaled_images(self):
        if self.original_pixmap and self.processed_pixmap:
            available_size = self.size()
            
            w = min(available_size.width(), self.processed_pixmap.width())
            h = min(available_size.height(), self.processed_pixmap.height())
            
            scale_w = w / self.processed_pixmap.width()
            scale_h = h / self.processed_pixmap.height()
            scale = min(scale_w, scale_h)
            
            scaled_w = int(self.processed_pixmap.width() * scale)
            scaled_h = int(self.processed_pixmap.height() * scale)
            
            self.draw_rect = QRect(
                (available_size.width() - scaled_w) // 2,
                (available_size.height() - scaled_h) // 2,
                scaled_w,
                scaled_h
            )
            
            self.scaled_processed = self.processed_pixmap.scaled(
                scaled_w, scaled_h, 
                Qt.KeepAspectRatio, 
                Qt.SmoothTransformation
            )
            
            if self.original_pixmap:
                self.scaled_original = self.original_pixmap.scaled(
                    scaled_w, scaled_h, 
                    Qt.KeepAspectRatio, 
                    Qt.SmoothTransformation
                )
                
    def resizeEvent(self, event):
        self.update_scaled_images()
        super().resizeEvent(event)
        
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor(50, 50, 50))
        
        if not self.scaled_processed:
            painter.setPen(QColor(150, 150, 150))
            painter.drawText(self.rect(), Qt.AlignCenter, 
                           "请选择图片并点击处理")
            return
            
        split_x = int(self.draw_rect.left() + 
                      self.draw_rect.width() * self.split_position)
        
        if self.scaled_original:
            original_rect = QRect(
                self.draw_rect.left(),
                self.draw_rect.top(),
                split_x - self.draw_rect.left(),
                self.draw_rect.height()
            )
            painter.drawPixmap(original_rect, self.scaled_original, 
                             QRect(0, 0, 
                                   int(self.scaled_original.width() * self.split_position),
                                   self.scaled_original.height()))
            
        processed_rect = QRect(
            split_x,
            self.draw_rect.top(),
            self.draw_rect.right() - split_x,
            self.draw_rect.height()
        )
        painter.drawPixmap(processed_rect, self.scaled_processed,
                          QRect(int(self.scaled_processed.width() * self.split_position),
                                0,
                                int(self.scaled_processed.width() * (1 - self.split_position)),
                                self.scaled_processed.height()))
        
        painter.setPen(QPen(QColor(255, 255, 255), 2))
        painter.drawLine(split_x, self.draw_rect.top(), 
                        split_x, self.draw_rect.bottom())
        
        handle_y = self.draw_rect.center().y()
        painter.setBrush(QColor(255, 255, 255))
        painter.drawEllipse(QPoint(split_x, handle_y), 8, 8)
        
        painter.setPen(QColor(0, 0, 0))
        painter.drawLine(split_x - 4, handle_y, split_x + 4, handle_y)
        
    def mousePressEvent(self, event):
        if self.draw_rect.contains(event.pos()):
            self.is_dragging = True
            self.update_split_from_mouse(event.pos())
            
    def mouseMoveEvent(self, event):
        if self.is_dragging and self.draw_rect.contains(event.pos()):
            self.update_split_from_mouse(event.pos())
            
    def mouseReleaseEvent(self, event):
        self.is_dragging = False
        
    def update_split_from_mouse(self, pos):
        relative_x = pos.x() - self.draw_rect.left()
        self.split_position = max(0.0, min(1.0, relative_x / self.draw_rect.width()))
        self.parent().slider.setValue(int(self.split_position * 100))
        self.update()
        
    def clear(self):
        self.original_pixmap = None
        self.processed_pixmap = None
        self.scaled_original = None
        self.scaled_processed = None
        self.update()
