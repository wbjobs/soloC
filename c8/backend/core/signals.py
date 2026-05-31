from django.db.models.signals import pre_delete, post_delete
from django.dispatch import receiver
from django.utils import timezone
from django.db import connection
from core.models import Document, Approval, Comment, Tenant


@receiver(pre_delete, sender=Document)
def soft_delete_related_on_document_delete(sender, instance, **kwargs):
    if instance.deleted_at is None:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE approvals SET deleted_at = %s WHERE document_id = %s AND deleted_at IS NULL",
                [timezone.now(), instance.id]
            )
            cursor.execute(
                "UPDATE comments SET deleted_at = %s WHERE document_id = %s AND deleted_at IS NULL",
                [timezone.now(), instance.id]
            )
