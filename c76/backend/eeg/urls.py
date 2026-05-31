from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'sessions', views.SessionViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('session-compare/', views.session_compare, name='session-compare'),
    path('sync-offline/', views.sync_offline_data, name='sync-offline'),
    path('resume-session/', views.resume_session, name='resume-session'),
]
