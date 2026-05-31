import os
import numpy as np
from PIL import Image
import cv2
import gc
from pathlib import Path

try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False

class StyleTransferModel:
    """轻量级风格迁移模型"""
    
    STYLES = {
        'none': '无风格',
        'van_gogh': '梵高星空',
        'ukiyoe': '浮世绘',
        'cubism': '立体主义',
        'watercolor': '水彩画',
        'oil_painting': '油画'
    }
    
    def __init__(self, models_dir=None):
        self.sessions = {}
        self.models_dir = Path(models_dir) if models_dir else Path(__file__).parent.parent / 'models'
        self.current_style = None
        self._create_dummy_models()
        
    def _create_dummy_models(self):
        """创建占位模型用于演示"""
        try:
            import torch
            import torch.nn as nn
            
            for style_key in self.STYLES:
                if style_key == 'none':
                    continue
                    
                model_path = self.models_dir / f'style_{style_key}.onnx'
                if model_path.exists():
                    continue
                    
                class DummyStyleNet(nn.Module):
                    def __init__(self, style_key):
                        super().__init__()
                        self.style_key = style_key
                        
                    def forward(self, x):
                        if self.style_key == 'van_gogh':
                            x = torch.sin(x * 3) * 0.3 + x * 0.7
                        elif self.style_key == 'ukiyoe':
                            x = torch.clamp(torch.round(x * 8) / 8, 0, 1)
                        elif self.style_key == 'cubism':
                            b, c, h, w = x.shape
                            grid_h, grid_w = h // 16, w // 16
                            for i in range(0, h, grid_h):
                                for j in range(0, w, grid_w):
                                    if (i // grid_h + j // grid_w) % 3 == 0:
                                        x[:, :, i:i+grid_h, j:j+grid_w] *= 1.2
                        elif self.style_key == 'watercolor':
                            blur = nn.functional.avg_pool2d(x, 5, stride=1, padding=2)
                            x = blur * 0.4 + x * 0.6
                        elif self.style_key == 'oil_painting':
                            x = torch.clamp(torch.round(x * 16) / 16, 0, 1)
                        return x
                
                model = DummyStyleNet(style_key)
                dummy_input = torch.randn(1, 3, 256, 256)
                
                torch.onnx.export(
                    model, dummy_input, model_path,
                    opset_version=11,
                    input_names=['input'],
                    output_names=['output'],
                    dynamic_axes={'input': {2: 'height', 3: 'width'},
                                'output': {2: 'height', 3: 'width'}}
                )
        except ImportError:
            pass
            
    def load_model(self, style_key, providers=None):
        """加载指定风格的模型"""
        if style_key == 'none':
            return True
            
        if style_key in self.sessions:
            return True
            
        model_path = self.models_dir / f'style_{style_key}.onnx'
        if not model_path.exists():
            return False
            
        try:
            if providers is None:
                providers = ['CPUExecutionProvider']
                
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            
            session = ort.InferenceSession(
                str(model_path),
                sess_options=sess_options,
                providers=providers
            )
            self.sessions[style_key] = session
            return True
        except Exception as e:
            print(f"加载风格模型失败 {style_key}: {e}")
            return False
            
    def apply_style(self, img, style_key, strength=0.5):
        """
        应用风格迁移
        Args:
            img: PIL Image
            style_key: 风格键名
            strength: 风格强度 0.0-1.0
        Returns:
            风格化后的 PIL Image
        """
        if style_key == 'none' or strength <= 0:
            return img
            
        if not ONNX_AVAILABLE or style_key not in self.sessions:
            return self._simple_style_transfer(img, style_key, strength)
            
        original_np = np.array(img).astype(np.float32) / 255.0
        
        h, w = original_np.shape[:2]
        max_size = 512
        if max(h, w) > max_size:
            scale = max_size / max(h, w)
            new_h, new_w = int(h * scale), int(w * scale)
            input_img = cv2.resize(original_np, (new_w, new_h))
        else:
            input_img = original_np.copy()
            new_h, new_w = h, w
            
        input_tensor = np.transpose(input_img, (2, 0, 1))
        input_tensor = np.expand_dims(input_tensor, axis=0)
        
        session = self.sessions[style_key]
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        
        result = session.run([output_name], {input_name: input_tensor})[0]
        
        result = np.squeeze(result, axis=0)
        result = np.transpose(result, (1, 2, 0))
        result = np.clip(result, 0, 1)
        
        if result.shape[0] != h or result.shape[1] != w:
            result = cv2.resize(result, (w, h))
            
        blended = original_np * (1 - strength) + result * strength
        blended = np.clip(blended, 0, 1)
        blended = (blended * 255).astype(np.uint8)
        
        del original_np, input_tensor, result
        gc.collect()
        
        return Image.fromarray(blended)
        
    def _simple_style_transfer(self, img, style_key, strength):
        """简单的风格效果，用于无模型时的演示"""
        img_np = np.array(img).astype(np.float32) / 255.0
        
        if style_key == 'van_gogh':
            swirl = np.sin(img_np * 8) * 0.15 * strength
            result = img_np + swirl
            result[:, :, 0] = np.clip(result[:, :, 0] + 0.1 * strength, 0, 1)
            result[:, :, 2] = np.clip(result[:, :, 2] - 0.05 * strength, 0, 1)
            
        elif style_key == 'ukiyoe':
            result = np.round(img_np * 8) / 8
            result = img_np * (1 - strength) + result * strength
            result[:, :, 1] = np.clip(result[:, :, 1] + 0.1 * strength, 0, 1)
            
        elif style_key == 'cubism':
            h, w = img_np.shape[:2]
            grid = 32
            result = img_np.copy()
            for i in range(0, h, grid):
                for j in range(0, w, grid):
                    if (i // grid + j // grid) % 3 == 0:
                        result[i:i+grid, j:j+grid] = np.clip(
                            result[i:i+grid, j:j+grid] * (1 + 0.2 * strength), 0, 1
                        )
                        
        elif style_key == 'watercolor':
            blurred = cv2.GaussianBlur(img_np, (7, 7), 0)
            result = img_np * (1 - strength * 0.5) + blurred * (strength * 0.5)
            noise = np.random.randn(*img_np.shape) * 0.02 * strength
            result = np.clip(result + noise, 0, 1)
            
        elif style_key == 'oil_painting':
            result = np.round(img_np * 16) / 16
            result = img_np * (1 - strength * 0.7) + result * (strength * 0.7)
            result = cv2.bilateralFilter(result.astype(np.float32), 5, 50, 50)
            
        else:
            result = img_np
            
        result = np.clip(result, 0, 1)
        result = (result * 255).astype(np.uint8)
        
        return Image.fromarray(result)
        
    def get_available_styles(self):
        """获取可用风格列表"""
        available = ['none']
        for style_key in self.STYLES:
            if style_key == 'none':
                continue
            model_path = self.models_dir / f'style_{style_key}.onnx'
            if model_path.exists():
                available.append(style_key)
        return available
        
    def get_style_name(self, style_key):
        """获取风格显示名称"""
        return self.STYLES.get(style_key, style_key)
        
    def unload_all(self):
        """卸载所有模型"""
        self.sessions.clear()
        gc.collect()
