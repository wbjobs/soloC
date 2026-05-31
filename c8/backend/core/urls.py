from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DocumentViewSet, ApprovalViewSet, CommentViewSet,
    TenantViewSet, UserViewSet
)

router = DefaultRouter()
router.register(r'documents', DocumentViewSet, basename='document')
router.register(r'approvals', ApprovalViewSet, basename='approval')
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'tenants', TenantViewSet, basename='tenant')
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
]
