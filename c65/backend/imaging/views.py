from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from .models import Study, DicomSlice, Annotation, Comment, CollaborationSession
from .models import ROISelection, AISegmentation, UserCorrection
from .serializers import (
    StudySerializer, DicomSliceSerializer, AnnotationSerializer, 
    CommentSerializer, CollaborationSessionSerializer,
    ROISelectionSerializer, AISegmentationSerializer,
    SegmentationRequestSerializer, SegmentationUpdateSerializer
)
import pydicom
import nibabel as nib
import numpy as np
import os
import time
import threading
from django.conf import settings
from django.contrib.auth.models import User
from .ai_segmentation import get_segmentation_model


class StudyViewSet(viewsets.ModelViewSet):
    queryset = Study.objects.all()
    serializer_class = StudySerializer
    parser_classes = (MultiPartParser, FormParser)

    @action(detail=True, methods=['post'])
    def upload_dicom(self, request, pk=None):
        study = self.get_object()
        files = request.FILES.getlist('files')

        slices = []
        for f in files:
            try:
                temp_path = os.path.join(settings.MEDIA_ROOT, 'temp', f.name)
                os.makedirs(os.path.dirname(temp_path), exist_ok=True)

                with open(temp_path, 'wb+') as destination:
                    for chunk in f.chunks():
                        destination.write(chunk)

                ds = pydicom.dcmread(temp_path)

                dicom_slice = DicomSlice.objects.create(
                    study=study,
                    instance_number=ds.get('InstanceNumber', 0),
                    file=f,
                    slice_location=float(ds.get('SliceLocation', 0)) if ds.get('SliceLocation') else None,
                    image_position_patient=list(ds.get('ImagePositionPatient', [])),
                    image_orientation_patient=list(ds.get('ImageOrientationPatient', [])),
                    pixel_spacing=list(ds.get('PixelSpacing', [])),
                    window_center=float(ds.get('WindowCenter', 0)) if ds.get('WindowCenter') else None,
                    window_width=float(ds.get('WindowWidth', 0)) if ds.get('WindowWidth') else None,
                    rescale_slope=float(ds.get('RescaleSlope', 1.0)),
                    rescale_intercept=float(ds.get('RescaleIntercept', 0.0))
                )
                slices.append(dicom_slice)

                os.remove(temp_path)
            except Exception as e:
                return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        study.slices_count = len(slices)
        study.save()

        return Response({'uploaded': len(slices)}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def slices(self, request, pk=None):
        study = self.get_object()
        start = int(request.query_params.get('start', 0))
        end = int(request.query_params.get('end', 50))
        priority = request.query_params.get('priority', 'center')

        all_slices = list(study.slices.all())

        if priority == 'center':
            center_idx = len(all_slices) // 2
            window_size = (end - start) // 2
            center_start = max(0, center_idx - window_size)
            center_end = min(len(all_slices), center_idx + window_size)
            center_slices = all_slices[center_start:center_end]
            remaining = [s for s in all_slices if s not in center_slices]
            ordered_slices = center_slices + remaining
        else:
            ordered_slices = all_slices

        paginated = ordered_slices[start:end]
        serializer = DicomSliceSerializer(paginated, many=True)

        return Response({
            'results': serializer.data,
            'total': len(all_slices),
            'has_more': end < len(all_slices)
        })

    @action(detail=True, methods=['get'])
    def slice_data(self, request, pk=None):
        study = self.get_object()
        instance_number = int(request.query_params.get('instance_number', 0))

        try:
            dicom_slice = study.slices.get(instance_number=instance_number)
            ds = pydicom.dcmread(dicom_slice.file.path)

            pixel_data = ds.pixel_array
            pixel_data = pixel_data * dicom_slice.rescale_slope + dicom_slice.rescale_intercept

            return Response({
                'instance_number': instance_number,
                'pixel_data': pixel_data.tolist(),
                'rows': dicom_slice.rows,
                'columns': dicom_slice.columns,
                'window_center': dicom_slice.window_center,
                'window_width': dicom_slice.window_width,
                'slice_location': dicom_slice.slice_location
            })
        except DicomSlice.DoesNotExist:
            return Response({'error': 'Slice not found'}, status=404)


class AnnotationViewSet(viewsets.ModelViewSet):
    queryset = Annotation.objects.all()
    serializer_class = AnnotationSerializer

    @action(detail=True, methods=['post'])
    def save_mask(self, request, pk=None):
        annotation = self.get_object()
        points = request.data.get('points', [])
        dimensions = request.data.get('dimensions', [512, 512, 1])

        mask_data = np.zeros(dimensions, dtype=np.uint8)

        for point in points:
            x, y, z = int(point.get('x', 0)), int(point.get('y', 0)), int(point.get('z', 0))
            if 0 <= x < dimensions[0] and 0 <= y < dimensions[1] and 0 <= z < dimensions[2]:
                mask_data[y, x, z] = 1

        nifti_img = nib.Nifti1Image(mask_data, np.eye(4))
        mask_path = os.path.join(settings.MEDIA_ROOT, 'nifti', str(annotation.study.id))
        os.makedirs(mask_path, exist_ok=True)
        mask_file = os.path.join(mask_path, f'{annotation.id}_mask.nii.gz')

        nib.save(nifti_img, mask_file)

        annotation.mask_file = f'nifti/{annotation.study.id}/{annotation.id}_mask.nii.gz'
        annotation.points = points
        annotation.save()

        return Response({'status': 'mask saved'})

    @action(detail=True, methods=['post'])
    def add_comment(self, request, pk=None):
        annotation = self.get_object()
        comment = Comment.objects.create(
            annotation=annotation,
            text=request.data.get('text', ''),
            position=request.data.get('position', {})
        )
        serializer = CommentSerializer(comment)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class CollaborationSessionViewSet(viewsets.ModelViewSet):
    queryset = CollaborationSession.objects.all()
    serializer_class = CollaborationSessionSerializer

    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        session = self.get_object()
        user_id = request.data.get('user_id')
        user = get_object_or_404(User, id=user_id)
        session.participants.add(user)
        return Response({'status': 'joined'})

    @action(detail=True, methods=['post'])
    def increment_sequence(self, request, pk=None):
        session = self.get_object()
        session.last_sequence += 1
        session.save()
        return Response({'sequence': session.last_sequence})


class ROISelectionViewSet(viewsets.ModelViewSet):
    queryset = ROISelection.objects.all()
    serializer_class = ROISelectionSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


def _load_study_volume(study):
    slices = list(study.slices.all().order_by('instance_number'))
    volume = []
    
    for slice_obj in slices:
        ds = pydicom.dcmread(slice_obj.file.path)
        pixel_data = ds.pixel_array * slice_obj.rescale_slope + slice_obj.rescale_intercept
        volume.append(pixel_data)
    
    return np.array(volume).transpose(1, 2, 0)


def _run_segmentation_task(segmentation_id, roi_points, organ_type):
    try:
        segmentation = AISegmentation.objects.get(id=segmentation_id)
        segmentation.status = 'processing'
        segmentation.save()
        
        start_time = time.time()
        
        volume = _load_study_volume(segmentation.study)
        
        model = get_segmentation_model()
        result = model.segment_organ(volume, roi_points, organ_type)
        
        if result['success']:
            segmentation.confidence = result['confidence']
            segmentation.contours = result['contours']
            
            mask = np.array(result['mask'], dtype=np.uint8)
            nifti_img = nib.Nifti1Image(mask, np.eye(4))
            mask_path = os.path.join(settings.MEDIA_ROOT, 'nifti', str(segmentation.study.id))
            os.makedirs(mask_path, exist_ok=True)
            mask_file = os.path.join(mask_path, f'{segmentation.id}_mask.nii.gz')
            nib.save(nifti_img, mask_file)
            
            segmentation.mask_file = f'nifti/{segmentation.study.id}/{segmentation.id}_mask.nii.gz'
            segmentation.status = 'completed'
        else:
            segmentation.status = 'failed'
            segmentation.error_message = result.get('error', 'Unknown error')
        
        segmentation.processing_time = time.time() - start_time
        segmentation.save()
        
    except Exception as e:
        try:
            segmentation = AISegmentation.objects.get(id=segmentation_id)
            segmentation.status = 'failed'
            segmentation.error_message = str(e)
            segmentation.save()
        except:
            pass


class AISegmentationViewSet(viewsets.ModelViewSet):
    queryset = AISegmentation.objects.all()
    serializer_class = AISegmentationSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        study_id = self.request.query_params.get('study_id')
        if study_id:
            queryset = queryset.filter(study_id=study_id)
        return queryset

    @action(detail=False, methods=['post'])
    def segment(self, request):
        serializer = SegmentationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        study = get_object_or_404(Study, id=serializer.validated_data['study_id'])
        organ_type = serializer.validated_data['organ_type']
        
        roi = None
        roi_points = None
        
        if serializer.validated_data.get('roi_id'):
            roi = get_object_or_404(ROISelection, id=serializer.validated_data['roi_id'])
            roi_points = roi.points
        elif serializer.validated_data.get('roi_points'):
            roi_points = serializer.validated_data['roi_points']
        
        segmentation = AISegmentation.objects.create(
            study=study,
            roi=roi,
            created_by=request.user,
            organ_type=organ_type,
            status='pending'
        )
        
        thread = threading.Thread(
            target=_run_segmentation_task,
            args=(str(segmentation.id), roi_points, organ_type)
        )
        thread.start()
        
        return Response(
            AISegmentationSerializer(segmentation).data,
            status=status.HTTP_202_ACCEPTED
        )

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        segmentation = self.get_object()
        serializer = SegmentationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        action = serializer.validated_data['action']
        
        if action == 'accept':
            segmentation.status = 'accepted'
            segmentation.save()
            return Response({'status': 'accepted', 'segmentation': AISegmentationSerializer(segmentation).data})
        
        elif action == 'reject':
            segmentation.status = 'rejected'
            segmentation.save()
            return Response({'status': 'rejected'})
        
        elif action == 'refine':
            corrections = serializer.validated_data.get('corrections', [])
            
            volume = _load_study_volume(segmentation.study)
            mask = nib.load(segmentation.mask_file.path).get_fdata()
            
            model = get_segmentation_model()
            result = model.refine_segmentation(volume, mask, corrections)
            
            if result['success']:
                new_segmentation = segmentation.create_new_version()
                new_segmentation.contours = result['contours']
                
                new_mask = np.array(result['mask'], dtype=np.uint8)
                nifti_img = nib.Nifti1Image(new_mask, np.eye(4))
                mask_path = os.path.join(settings.MEDIA_ROOT, 'nifti', str(segmentation.study.id))
                mask_file = os.path.join(mask_path, f'{new_segmentation.id}_mask.nii.gz')
                nib.save(nifti_img, mask_file)
                new_segmentation.mask_file = f'nifti/{segmentation.study.id}/{new_segmentation.id}_mask.nii.gz'
                new_segmentation.save()
                
                for correction in corrections:
                    UserCorrection.objects.create(
                        segmentation=new_segmentation,
                        user=request.user,
                        correction_type=correction.get('type', 'draw'),
                        points=correction.get('points', []),
                        brush_radius=correction.get('radius', 5),
                        slice_index=correction.get('slice_index', 0)
                    )
                
                return Response({
                    'status': 'refined',
                    'segmentation': AISegmentationSerializer(new_segmentation).data
                })
            else:
                return Response(
                    {'error': result.get('error', 'Refinement failed')},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        elif action == 'regenerate':
            segmentation.status = 'pending'
            segmentation.save()
            
            thread = threading.Thread(
                target=_run_segmentation_task,
                args=(str(segmentation.id), segmentation.roi.points if segmentation.roi else None, segmentation.organ_type)
            )
            thread.start()
            
            return Response({
                'status': 'regenerating',
                'segmentation': AISegmentationSerializer(segmentation).data
            })

    @action(detail=True, methods=['get'])
    def download_mask(self, request, pk=None):
        segmentation = self.get_object()
        if not segmentation.mask_file:
            return Response({'error': 'No mask file'}, status=404)
        
        from django.http import FileResponse
        return FileResponse(open(segmentation.mask_file.path, 'rb'))

