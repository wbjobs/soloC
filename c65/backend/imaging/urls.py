from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StudyViewSet, AnnotationViewSet, CollaborationSessionViewSet
from .views import ROISelectionViewSet, AISegmentationViewSet

router = DefaultRouter()
router.register(r'studies', StudyViewSet)
router.register(r'annotations', AnnotationViewSet)
router.register(r'sessions', CollaborationSessionViewSet)
router.register(r'roi', ROISelectionViewSet)
router.register(r'ai-segmentation', AISegmentationViewSet, basename='ai-segmentation')

urlpatterns = [
    path('', include(router.urls)),
]
