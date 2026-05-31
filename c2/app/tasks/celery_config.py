from celery import Celery
from celery.schedules import crontab
from app.config import settings


celery_app = Celery(
    "topology_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

celery_app.conf.beat_schedule = {
    "update-topology-every-5-minutes": {
        "task": "app.tasks.topology.update_service_topology",
        "schedule": settings.TOPOLOGY_UPDATE_INTERVAL_MINUTES * 60,
        "args": (f"-{settings.TOPOLOGY_UPDATE_INTERVAL_MINUTES}m",),
        "options": {"expires": 300},
    },
    "detect-anomalies-every-5-minutes": {
        "task": "app.tasks.topology.detect_anomalies",
        "schedule": settings.TOPOLOGY_UPDATE_INTERVAL_MINUTES * 60,
        "args": (
            f"-{settings.TOPOLOGY_UPDATE_INTERVAL_MINUTES}m",
            f"-{settings.ANOMALY_LOOKBACK_HOURS}h"
        ),
        "options": {"expires": 300},
    },
}

celery_app.autodiscover_tasks(["app.tasks"])
