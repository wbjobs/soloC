import cv2
import numpy as np
from PIL import Image
import os

def generate_thumbnail(image_path, output_path, max_size=300, quality=80):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        height, width = img.shape[:2]
        
        if width > height:
            if width > max_size:
                ratio = max_size / width
                new_width = max_size
                new_height = int(height * ratio)
            else:
                new_width = width
                new_height = height
        else:
            if height > max_size:
                ratio = max_size / height
                new_height = max_size
                new_width = int(width * ratio)
            else:
                new_width = width
                new_height = height
        
        resized = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)
        cv2.imwrite(output_path, resized, [cv2.IMWRITE_JPEG_QUALITY, quality])
        
        return output_path
    except Exception as e:
        print(f"Error generating thumbnail: {e}")
        return None

def preprocess_image_for_ocr(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        denoised = cv2.fastNlMeansDenoising(enhanced, None, 10, 7, 21)
        
        _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        kernel = np.ones((1, 1), np.uint8)
        cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
        
        return cleaned
    except Exception as e:
        print(f"Error preprocessing image: {e}")
        return None

def enhance_low_contrast_image(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        l_enhanced = clahe.apply(l)
        
        enhanced_lab = cv2.merge((l_enhanced, a, b))
        enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        
        return enhanced
    except Exception as e:
        print(f"Error enhancing image: {e}")
        return None

def remove_stains(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return None
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        _, mask = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)
        
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
        
        inpainted = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)
        
        return inpainted
    except Exception as e:
        print(f"Error removing stains: {e}")
        return None
