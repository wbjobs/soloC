import os
import numpy as np
from pathlib import Path

try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False

from .style_transfer import StyleTransferModel

class ModelManager:
    def __init__(self):
        self.sr_session = None
        self.color_session = None
        self.style_model = None
        self.device = "cpu"
        self.providers = []
        
    def detect_gpu(self):
        if not ONNX_AVAILABLE:
            return False, ["CPUExecutionProvider"]
            
        available_providers = ort.get_available_providers()
        providers = []
        
        if "DmlExecutionProvider" in available_providers:
            providers.append("DmlExecutionProvider")
            self.device = "gpu"
            return True, providers
            
        if "CUDAExecutionProvider" in available_providers:
            providers.append("CUDAExecutionProvider")
            self.device = "gpu"
            return True, providers
            
        if "TensorrtExecutionProvider" in available_providers:
            providers.append("TensorrtExecutionProvider")
            self.device = "gpu"
            return True, providers
            
        providers.append("CPUExecutionProvider")
        self.device = "cpu"
        return False, providers
        
    def load_models(self):
        if not ONNX_AVAILABLE:
            return False, "ONNX Runtime 未安装，请安装 onnxruntime 或 onnxruntime-gpu"
            
        has_gpu, self.providers = self.detect_gpu()
        
        models_dir = Path(__file__).parent.parent / "models"
        models_dir.mkdir(exist_ok=True)
        
        sr_model_path = models_dir / "RealESRGAN_x4plus.onnx"
        color_model_path = models_dir / "UNet_colorization.onnx"
        
        if not sr_model_path.exists():
            self._create_dummy_sr_model(sr_model_path)
            
        if not color_model_path.exists():
            self._create_dummy_color_model(color_model_path)
            
        try:
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            
            self.sr_session = ort.InferenceSession(
                str(sr_model_path),
                sess_options=sess_options,
                providers=self.providers
            )
            
            self.color_session = ort.InferenceSession(
                str(color_model_path),
                sess_options=sess_options,
                providers=self.providers
            )
            
            self.style_model = StyleTransferModel(models_dir)
            for style_key in self.style_model.STYLES:
                if style_key != 'none':
                    self.style_model.load_model(style_key, self.providers)
            
            device_msg = "GPU加速" if has_gpu else "CPU模式"
            return True, f"模型加载成功 ({device_msg})"
            
        except Exception as e:
            return False, f"模型加载失败: {str(e)}"
            
    def _create_dummy_sr_model(self, path):
        try:
            import torch
            import torch.nn as nn
            
            class DummySR(nn.Module):
                def __init__(self):
                    super().__init__()
                    self.conv = nn.Conv2d(3, 3, kernel_size=3, padding=1)
                    self.upsample = nn.Upsample(scale_factor=4, mode='bilinear')
                    
                def forward(self, x):
                    return self.upsample(self.conv(x))
                    
            model = DummySR()
            dummy_input = torch.randn(1, 3, 64, 64)
            
            torch.onnx.export(
                model, dummy_input, path,
                opset_version=11,
                input_names=['input'],
                output_names=['output'],
                dynamic_axes={'input': {2: 'height', 3: 'width'},
                            'output': {2: 'height', 3: 'width'}}
            )
        except ImportError:
            pass
            
    def _create_dummy_color_model(self, path):
        try:
            import torch
            import torch.nn as nn
            import torch.nn.functional as F
            
            class DummyUNet(nn.Module):
                def __init__(self):
                    super().__init__()
                    self.encoder = nn.Conv2d(1, 64, kernel_size=3, padding=1)
                    self.decoder = nn.Conv2d(64, 2, kernel_size=3, padding=1)
                    
                def forward(self, x):
                    _, _, h, w = x.shape
                    x = F.interpolate(x, size=(256, 256), mode='bilinear')
                    x = self.encoder(x)
                    x = self.decoder(x)
                    x = torch.sigmoid(x)
                    x = F.interpolate(x, size=(h, w), mode='bilinear')
                    return x
                    
            model = DummyUNet()
            dummy_input = torch.randn(1, 1, 256, 256)
            
            torch.onnx.export(
                model, dummy_input, path,
                opset_version=11,
                input_names=['input'],
                output_names=['output'],
                dynamic_axes={'input': {2: 'height', 3: 'width'},
                            'output': {2: 'height', 3: 'width'}}
            )
        except ImportError:
            pass
