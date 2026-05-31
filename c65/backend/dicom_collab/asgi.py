"""
ASGI config for dicom_collab project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.urls import re_path
from imaging.consumers import CollaborationConsumer, AnnotationConsumer

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'dicom_collab.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter([
            re_path(r'ws/collab/(?P<session_id>[\w-]+)/$', CollaborationConsumer.as_asgi()),
            re_path(r'ws/study/(?P<study_id>[\w-]+)/$', AnnotationConsumer.as_asgi()),
        ])
    ),
})
