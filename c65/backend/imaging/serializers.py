from rest_framework import serializers
from .models import Study, DicomSlice, Annotation, Comment, CollaborationSession
from .models import ROISelection, AISegmentation, UserCorrection
from django.contrib.auth.models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name']


class StudySerializer(serializers.ModelSerializer):
    class Meta:
        model = Study
        fields = '__all__'


class DicomSliceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DicomSlice
        fields = '__all__'


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = '__all__'


class AnnotationSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta:
        model = Annotation
        fields = '__all__'


class CollaborationSessionSerializer(serializers.ModelSerializer):
    host = UserSerializer(read_only=True)
    participants = UserSerializer(many=True, read_only=True)

    class Meta:
        model = CollaborationSession
        fields = '__all__'


class ROISelectionSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model = ROISelection
        fields = '__all__'


class UserCorrectionSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = UserCorrection
        fields = '__all__'


class AISegmentationSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)
    corrections = UserCorrectionSerializer(many=True, read_only=True)
    roi = ROISelectionSerializer(read_only=True)

    class Meta:
        model = AISegmentation
        fields = '__all__'


class SegmentationRequestSerializer(serializers.Serializer):
    study_id = serializers.UUIDField()
    roi_id = serializers.UUIDField(required=False, allow_null=True)
    organ_type = serializers.ChoiceField(choices=['pancreas', 'liver', 'kidney', 'spleen'])
    roi_points = serializers.ListField(child=serializers.ListField(child=serializers.FloatField()), required=False)


class SegmentationUpdateSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['accept', 'reject', 'refine', 'regenerate'])
    corrections = serializers.ListField(child=serializers.DictField(), required=False)
