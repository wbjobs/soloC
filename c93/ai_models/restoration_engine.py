import cv2
import numpy as np
from PIL import Image
import os
from datetime import datetime
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from image_utils import enhance_low_contrast_image, remove_stains


class RestorationEngine:
    def __init__(self):
        pass
    
    def _denoise_image(self, img):
        denoised = cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
        return denoised
    
    def _inpaint_image(self, img):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)
        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
        inpainted = cv2.inpaint(img, mask, 5, cv2.INPAINT_TELEA)
        return inpainted
    
    def _enhance_image(self, img):
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        enhanced = cv2.merge((l, a, b))
        enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
        return enhanced
    
    def _sharpen_image(self, img):
        kernel = np.array([[-1, -1, -1],
                          [-1,  9, -1],
                          [-1, -1, -1]])
        sharpened = cv2.filter2D(img, -1, kernel)
        return sharpened
    
    def _deskew_image(self, img):
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img
        
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        coords = np.column_stack(np.where(binary > 0))
        
        try:
            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle
            
            if abs(angle) < 0.3:
                return img
            
            (h, w) = img.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            return rotated
        except:
            return img
    
    def restore(self, image_path, task_type="denoise"):
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        
        deskewed = self._deskew_image(img)
        
        if task_type == "denoise":
            result = self._denoise_image(deskewed)
        elif task_type == "inpainting":
            denoised = self._denoise_image(deskewed)
            result = self._inpaint_image(denoised)
        elif task_type == "enhance":
            enhanced = self._enhance_image(deskewed)
            result = self._denoise_image(enhanced)
        elif task_type == "complete":
            denoised = self._denoise_image(deskewed)
            inpainted = self._inpaint_image(denoised)
            enhanced = self._enhance_image(inpainted)
            result = enhanced
        else:
            result = deskewed
        
        timestamp = datetime.now().timestamp()
        output_filename = f"restored_{timestamp}_{os.path.basename(image_path)}"
        output_path = f"../outputs/{output_filename}"
        cv2.imwrite(output_path, result)
        
        return output_path
    
    def batch_restore(self, image_paths, task_type="denoise"):
        results = []
        for path in image_paths:
            results.append(self.restore(path, task_type))
        return results
