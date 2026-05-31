from django.db import models
from django.contrib.auth.models import User
import uuid
import os


def dicom_upload_path(instance, filename):
    return f'dicom/{instance.study.id}/{filename}'


def nifti_upload_path(instance, filename):
    return f'nifti/{instance.study.id}/{filename}'


class Study(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    patient_id = models.CharField(max_length=100, blank=True)
    patient_name = models.CharField(max_length=255, blank=True)
    study_date = models.DateTimeField(null=True, blank=True)
    modality = models.CharField(max_length=50, default='CT')
    series_description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    slices_count = models.IntegerField(default=0)
    rows = models.IntegerField(default=512)
    columns = models.IntegerField(default=512)

    def __str__(self):
        return f"{self.name} - {self.patient_name}"


class DicomSlice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name='slices')
    instance_number = models.IntegerField()
    file = models.FileField(upload_to=dicom_upload_path)
    slice_location = models.FloatField(null=True, blank=True)
    image_position_patient = models.JSONField(default=list, blank=True)
    image_orientation_patient = models.JSONField(default=list, blank=True)
    pixel_spacing = models.JSONField(default=list, blank=True)
    window_center = models.FloatField(null=True, blank=True)
    window_width = models.FloatField(null=True, blank=True)
    rescale_slope = models.FloatField(default=1.0)
    rescale_intercept = models.FloatField(default=0.0)

    class Meta:
        ordering = ['instance_number']

    def __str__(self):
        return f"{self.study.name} - Slice {self.instance_number}"


class Annotation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name='annotations')
    name = models.CharField(max_length=255)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    color = models.CharField(max_length=20, default='#FF0000')
    mask_file = models.FileField(upload_to=nifti_upload_path, null=True, blank=True)
    points = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} - {self.study.name}"


class Comment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    annotation = models.ForeignKey(Annotation, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    position = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Comment by {self.author} on {self.annotation.name}"


class CollaborationSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    study = models.ForeignKey(Study, on_delete=models.CASCADE)
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hosted_sessions')
    participants = models.ManyToManyField(User, related_name='joined_sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    last_sequence = models.BigIntegerField(default=0)

    def __str__(self):
        return f"Session {self.id} - {self.study.name}"


class ROISelection(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name='rois')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    points = models.JSONField(default=list, help_text="ROI 边界点坐标列表")
    center_slice = models.IntegerField(default=0, help_text="ROI 所在的中心切片")
    bounds = models.JSONField(default=dict, help_text="ROI 边界框")

    def __str__(self):
        return f"ROI {self.id} - {self.study.name}"


class AISegmentation(models.Model):
    STATUS_CHOICES = [
        ('pending', '待处理'),
        ('processing', '处理中'),
        ('completed', '已完成'),
        ('failed', '失败'),
        ('accepted', '已接受'),
        ('rejected', '已拒绝'),
        ('modified', '已修正'),
    ]

    ORGAN_CHOICES = [
        ('pancreas', '胰腺'),
        ('liver', '肝脏'),
        ('kidney', '肾脏'),
        ('spleen', '脾脏'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    study = models.ForeignKey(Study, on_delete=models.CASCADE, related_name='ai_segmentations')
    roi = models.ForeignKey(ROISelection, on_delete=models.SET_NULL, null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    organ_type = models.CharField(max_length=50, choices=ORGAN_CHOICES, default='pancreas')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    confidence = models.FloatField(null=True, blank=True, help_text="AI 置信度")
    mask_file = models.FileField(upload_to=nifti_upload_path, null=True, blank=True)
    contours = models.JSONField(default=list, blank=True, help_text="分割轮廓点")
    
    processing_time = models.FloatField(null=True, blank=True, help_text="处理时间(秒)")
    error_message = models.TextField(blank=True, help_text="错误信息")
    
    parent_segmentation = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True,
        related_name='versions',
        help_text="父版本，用于版本追踪"
    )
    version = models.IntegerField(default=1, help_text="版本号")

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_organ_type_display()} Segmentation - {self.status} ({self.id})"

    def create_new_version(self):
        new_version = AISegmentation.objects.create(
            study=self.study,
            roi=self.roi,
            created_by=self.created_by,
            organ_type=self.organ_type,
            status='modified',
            confidence=self.confidence,
            parent_segmentation=self,
            version=self.version + 1
        )
        return new_version


class UserCorrection(models.Model):
    CORRECTION_TYPE = [
        ('add', '添加区域'),
        ('remove', '移除区域'),
        ('draw', '手绘修正'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    segmentation = models.ForeignKey(AISegmentation, on_delete=models.CASCADE, related_name='corrections')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    correction_type = models.CharField(max_length=20, choices=CORRECTION_TYPE)
    points = models.JSONField(default=list, help_text="修正点坐标")
    brush_radius = models.IntegerField(default=5, help_text="笔刷大小")
    slice_index = models.IntegerField(default=0, help_text="修正所在的切片")

    def __str__(self):
        return f"Correction by {self.user} on {self.segmentation.id}"
