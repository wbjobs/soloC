import numpy as np
import torch
import torch.nn as nn
from monai.networks.nets import UNet
from monai.networks.layers import Norm, Act
from monai.transforms import (
    Compose,
    NormalizeIntensity,
    Resize,
    AddChannel,
    AsDiscrete,
    Activations,
)
from monai.inferers import sliding_window_inference
from scipy import ndimage
import logging
import os

logger = logging.getLogger(__name__)


class SegmentationModel:
    def __init__(self, device=None):
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = self._build_model()
        self.model.to(self.device)
        self.model.eval()
        
        self.preprocess = Compose([
            AddChannel(),
            NormalizeIntensity(nonzero=True),
            Resize((128, 128, 64), mode='trilinear'),
        ])
        
        self.postprocess = Compose([
            Activations(sigmoid=True),
            AsDiscrete(threshold=0.5),
        ])
        
        logger.info(f"Segmentation model initialized on {self.device}")
    
    def _build_model(self):
        model = UNet(
            spatial_dims=3,
            in_channels=1,
            out_channels=2,
            channels=(16, 32, 64, 128, 256),
            strides=(2, 2, 2, 2),
            num_res_units=2,
            norm=Norm.BATCH,
        )
        
        try:
            weights_path = os.path.join(
                os.path.dirname(__file__), 
                'model_weights', 
                'pretrained_unet.pth'
            )
            if os.path.exists(weights_path):
                model.load_state_dict(torch.load(weights_path, map_location=self.device))
                logger.info("Loaded pretrained weights")
        except Exception as e:
            logger.warning(f"Could not load pretrained weights: {e}")
        
        return model
    
    def _extract_roi_volume(self, volume, roi_points):
        if not roi_points or len(roi_points) < 3:
            return volume, (0, 0, 0)
        
        points = np.array(roi_points)
        x_min, y_min, z_min = np.floor(points.min(axis=0)).astype(int)
        x_max, y_max, z_max = np.ceil(points.max(axis=0)).astype(int)
        
        padding = 20
        x_min = max(0, x_min - padding)
        y_min = max(0, y_min - padding)
        z_min = max(0, z_min - padding)
        x_max = min(volume.shape[0], x_max + padding)
        y_max = min(volume.shape[1], y_max + padding)
        z_max = min(volume.shape[2], z_max + padding)
        
        roi_volume = volume[x_min:x_max, y_min:y_max, z_min:z_max]
        return roi_volume, (x_min, y_min, z_min)
    
    def _refine_mask(self, mask):
        mask = mask.astype(bool)
        
        struct = ndimage.generate_binary_structure(3, 1)
        mask = ndimage.binary_closing(mask, structure=struct, iterations=2)
        mask = ndimage.binary_opening(mask, structure=struct, iterations=1)
        
        mask = remove_small_objects(mask, min_size=500)
        
        return mask.astype(np.uint8)
    
    def segment_organ(self, volume, roi_points=None, organ_type='pancreas'):
        try:
            original_shape = volume.shape
            
            if roi_points:
                roi_volume, offset = self._extract_roi_volume(volume, roi_points)
            else:
                roi_volume = volume
                offset = (0, 0, 0)
            
            input_tensor = self.preprocess(roi_volume)
            input_tensor = input_tensor.to(self.device)
            
            with torch.no_grad():
                output = sliding_window_inference(
                    inputs=input_tensor.unsqueeze(0),
                    roi_size=(96, 96, 48),
                    sw_batch_size=1,
                    predictor=self.model,
                    overlap=0.25,
                )
            
            output = self.postprocess(output[0])
            mask = output.cpu().numpy()[0]
            
            original_roi_shape = roi_volume.shape
            mask = Resize(original_roi_shape, mode='nearest')(AddChannel()(mask))[0]
            
            full_mask = np.zeros(original_shape, dtype=np.uint8)
            x_min, y_min, z_min = offset
            x_max = min(x_min + mask.shape[0], original_shape[0])
            y_max = min(y_min + mask.shape[1], original_shape[1])
            z_max = min(z_min + mask.shape[2], original_shape[2])
            
            full_mask[x_min:x_max, y_min:y_max, z_min:z_max] = mask[
                :x_max-x_min, :y_max-y_min, :z_max-z_min
            ]
            
            full_mask = self._refine_mask(full_mask)
            
            confidence = self._calculate_confidence(full_mask, roi_volume if roi_points else volume)
            
            contours = self._extract_contours(full_mask)
            
            return {
                'success': True,
                'mask': full_mask.tolist(),
                'contours': contours,
                'confidence': confidence,
                'organ_type': organ_type,
                'offset': offset,
            }
            
        except Exception as e:
            logger.error(f"Segmentation failed: {e}")
            return {
                'success': False,
                'error': str(e),
            }
    
    def _calculate_confidence(self, mask, volume):
        if np.sum(mask) == 0:
            return 0.0
        
        mask_region = volume[mask > 0]
        
        mean_intensity = np.mean(mask_region)
        std_intensity = np.std(mask_region)
        
        edge_score = self._edge_detection_score(mask, volume)
        
        volume_voxels = np.sum(mask)
        volume_ml = volume_voxels * 0.001
        
        organ_volumes = {
            'pancreas': (40, 150),
            'liver': (1000, 1800),
        }
        
        volume_score = 0.5
        for organ, (min_vol, max_vol) in organ_volumes.items():
            if min_vol <= volume_ml <= max_vol:
                volume_score = 1.0
                break
        
        confidence = 0.4 * edge_score + 0.3 * (1 - min(1, std_intensity / 100)) + 0.3 * volume_score
        return float(min(1.0, confidence))
    
    def _edge_detection_score(self, mask, volume):
        try:
            edges = ndimage.sobel(volume.astype(float))
            edge_strength = np.abs(edges)
            
            boundary = ndimage.binary_dilation(mask) - mask
            boundary_edges = edge_strength[boundary > 0]
            
            if len(boundary_edges) == 0:
                return 0.5
            
            mean_edge = np.mean(boundary_edges)
            normalized_edge = min(1.0, mean_edge / 50.0)
            
            return normalized_edge
        except:
            return 0.5
    
    def _extract_contours(self, mask):
        contours = []
        
        for z in range(mask.shape[2]):
            slice_mask = mask[:, :, z]
            if np.sum(slice_mask) > 0:
                slice_contours = self._find_contours_2d(slice_mask)
                for contour in slice_contours:
                    contour_3d = [(int(p[0]), int(p[1]), z) for p in contour]
                    contours.append(contour_3d)
        
        return contours
    
    def _find_contours_2d(self, binary_mask):
        from skimage import measure
        
        contours = measure.find_contours(binary_mask, 0.5)
        simplified_contours = []
        
        for contour in contours:
            if len(contour) > 10:
                step = max(1, len(contour) // 100)
                simplified = contour[::step]
                simplified_contours.append(simplified.tolist())
        
        return simplified_contours
    
    def refine_segmentation(self, volume, initial_mask, user_corrections):
        try:
            for correction in user_corrections:
                x, y, z = correction['point']
                radius = correction.get('radius', 5)
                is_add = correction.get('is_add', True)
                
                for dx in range(-radius, radius + 1):
                    for dy in range(-radius, radius + 1):
                        for dz in range(-radius, radius + 1):
                            if dx*dx + dy*dy + dz*dz <= radius*radius:
                                nx, ny, nz = x + dx, y + dy, z + dz
                                if 0 <= nx < initial_mask.shape[0] and \
                                   0 <= ny < initial_mask.shape[1] and \
                                   0 <= nz < initial_mask.shape[2]:
                                    initial_mask[nx, ny, nz] = 1 if is_add else 0
            
            refined_mask = self._refine_mask(initial_mask)
            contours = self._extract_contours(refined_mask)
            
            return {
                'success': True,
                'mask': refined_mask.tolist(),
                'contours': contours,
            }
        except Exception as e:
            logger.error(f"Refinement failed: {e}")
            return {
                'success': False,
                'error': str(e),
            }


_segmentation_model = None


def get_segmentation_model():
    global _segmentation_model
    if _segmentation_model is None:
        _segmentation_model = SegmentationModel()
    return _segmentation_model


def remove_small_objects(mask, min_size):
    labeled, num_features = ndimage.label(mask)
    if num_features == 0:
        return mask
    
    sizes = ndimage.sum(mask, labeled, range(num_features + 1))
    mask_size = sizes > min_size
    return mask_size[labeled]
