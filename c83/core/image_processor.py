import numpy as np
from PIL import Image
import cv2
import gc

class ImageProcessor:
    def __init__(self):
        pass
        
    def process_image(self, image_path, model_manager, style_key='none', style_strength=0.5):
        try:
            img = Image.open(image_path).convert('RGB')
            
            sr_result = self.super_resolution(img, model_manager)
            del img
            gc.collect()
            
            color_result = self.colorize(sr_result, model_manager)
            del sr_result
            gc.collect()
            
            if style_key != 'none' and style_strength > 0:
                style_result = self.apply_style_transfer(color_result, model_manager, style_key, style_strength)
                del color_result
                gc.collect()
                return style_result
            
            return color_result
        except Exception as e:
            gc.collect()
            raise e
            
    def apply_style_transfer(self, img, model_manager, style_key, strength):
        """应用风格迁移"""
        if model_manager.style_model is None:
            return img
            
        result = model_manager.style_model.apply_style(img, style_key, strength)
        return result
        
    def super_resolution(self, img, model_manager):
        if not model_manager.sr_session:
            result = img.resize((img.width * 4, img.height * 4), Image.BICUBIC)
            return result
            
        img_np = np.array(img).astype(np.float32) / 255.0
        
        img_np = np.transpose(img_np, (2, 0, 1))
        img_np = np.expand_dims(img_np, axis=0)
        
        input_name = model_manager.sr_session.get_inputs()[0].name
        output_name = model_manager.sr_session.get_outputs()[0].name
        
        result = model_manager.sr_session.run(
            [output_name], 
            {input_name: img_np}
        )[0]
        
        del img_np
        
        result = np.squeeze(result, axis=0)
        result = np.transpose(result, (1, 2, 0))
        result = np.clip(result, 0, 1)
        result = (result * 255).astype(np.uint8)
        
        output_img = Image.fromarray(result)
        del result
        gc.collect()
        
        return output_img
        
    def colorize(self, img, model_manager):
        if not model_manager.color_session:
            return self._simple_colorize(img)
            
        img_arr = np.array(img)
        lab = cv2.cvtColor(img_arr, cv2.COLOR_RGB2LAB)
        del img_arr
        
        L = lab[:, :, 0]
        ab_channels = lab[:, :, 1:]
        del lab
        
        L_norm = L.astype(np.float32) / 50.0 - 1.0
        L_norm = np.expand_dims(L_norm, axis=0)
        L_norm = np.expand_dims(L_norm, axis=0)
        
        input_name = model_manager.color_session.get_inputs()[0].name
        output_name = model_manager.color_session.get_outputs()[0].name
        
        ab = model_manager.color_session.run(
            [output_name],
            {input_name: L_norm}
        )[0]
        
        del L_norm
        
        ab = np.squeeze(ab, axis=0)
        ab = np.transpose(ab, (1, 2, 0))
        ab = (ab * 110).astype(np.int8)
        
        L = cv2.resize(L, (ab.shape[1], ab.shape[0]))
        L = np.expand_dims(L, axis=2)
        
        lab_result = np.concatenate([L, ab], axis=2)
        del L, ab
        
        rgb_result = cv2.cvtColor(lab_result.astype(np.uint8), cv2.COLOR_LAB2RGB)
        del lab_result
        
        output_img = Image.fromarray(rgb_result)
        del rgb_result
        gc.collect()
        
        return output_img
        
    def _simple_colorize(self, img):
        img_np = np.array(img).astype(np.float32)
        
        h, w = img_np.shape[:2]
        x = np.linspace(0, 1, w)
        y = np.linspace(0, 1, h)
        xx, yy = np.meshgrid(x, y)
        
        r_factor = 0.8 + 0.4 * xx
        g_factor = 0.7 + 0.3 * (1 - yy)
        b_factor = 0.9 + 0.2 * yy
        
        result = np.stack([
            img_np[:, :, 0] * r_factor,
            img_np[:, :, 1] * g_factor,
            img_np[:, :, 2] * b_factor
        ], axis=2)
        
        result = np.clip(result, 0, 255).astype(np.uint8)
        return Image.fromarray(result)
