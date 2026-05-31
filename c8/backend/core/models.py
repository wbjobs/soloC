from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.utils import timezone
import json


class Tenant(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    workflow_config = models.JSONField(
        default=list,
        help_text='审批流配置，例如: [{"step": 1, "role": "manager"}, {"step": 2, "role": "director"}]'
    )

    class Meta:
        db_table = 'tenants'
        indexes = [
            models.GinIndex(fields=['workflow_config'], name='tenant_workflow_config_gin'),
        ]

    def save(self, *args, **kwargs):
        if not self.workflow_config:
            self.workflow_config = [
                {"step": 1, "role": "manager"},
                {"step": 2, "role": "director"}
            ]
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    ROLE_CHOICES = [
        ('employee', '员工'),
        ('manager', '直线经理'),
        ('director', '部门主管'),
    ]

    username = None
    email = models.EmailField(unique=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, null=True, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='employee')
    manager = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='subordinates'
    )

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        db_table = 'users'
        constraints = [
            models.UniqueConstraint(fields=['email', 'tenant_id'], name='unique_email_per_tenant')
        ]

    def __str__(self):
        return self.email


_disable_tenant_scope = False


def disable_tenant_scope():
    global _disable_tenant_scope
    _disable_tenant_scope = True


def enable_tenant_scope():
    global _disable_tenant_scope
    _disable_tenant_scope = False


def is_tenant_scope_disabled():
    global _disable_tenant_scope
    return _disable_tenant_scope


class SoftDeleteQuerySet(models.QuerySet):
    def delete(self):
        count = 0
        for obj in self:
            obj.delete()
            count += 1
        return count, {self.model._meta.label: count}

    def hard_delete(self):
        return super().delete()

    def with_deleted(self):
        return self.model.all_objects.get_queryset()


class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return SoftDeleteQuerySet(self.model, using=self._db).filter(deleted_at__isnull=True)


class TenantScopedManager(SoftDeleteManager):
    def get_queryset(self):
        qs = super().get_queryset()
        if is_tenant_scope_disabled():
            return qs
        try:
            from core.middleware import get_current_tenant
            tenant = get_current_tenant()
            if tenant:
                return qs.filter(tenant=tenant)
        except Exception:
            pass
        return qs


class TenantScopedModel(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = TenantScopedManager()
    all_objects = SoftDeleteManager()
    unfiltered = models.Manager()

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):
        from django.db.models.signals import pre_delete, post_delete
        pre_delete.send(sender=self.__class__, instance=self)
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at', 'updated_at'])
        post_delete.send(sender=self.__class__, instance=self)
        return 1, {self.__class__._meta.label: 1}

    def hard_delete(self, using=None, keep_parents=False):
        return super().delete(using=using, keep_parents=keep_parents)

    def restore(self):
        self.deleted_at = None
        self.save(update_fields=['deleted_at', 'updated_at'])


class Document(TenantScopedModel):
    STATUS_CHOICES = [
        ('draft', '草稿'),
        ('pending', '待审批'),
        ('approved', '已通过'),
        ('rejected', '已拒绝'),
    ]

    title = models.CharField(max_length=255)
    content = models.TextField(null=True, blank=True)
    file_url = models.URLField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    uploaded_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploaded_documents')
    current_step = models.IntegerField(default=0)
    workflow_config = models.JSONField(default=list)

    class Meta:
        db_table = 'documents'
        indexes = [
            models.GinIndex(fields=['workflow_config'], name='document_workflow_config_gin'),
            models.Index(fields=['status'], name='document_status_idx'),
            models.Index(fields=['tenant_id', 'status'], name='document_tenant_status_idx'),
        ]

    def save(self, *args, **kwargs):
        if not self.workflow_config and self.tenant_id:
            self.workflow_config = self.tenant.workflow_config
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title

    def soft_delete_cascade(self):
        self.approvals.all().update(deleted_at=timezone.now())
        self.comments.all().update(deleted_at=timezone.now())
        self.deleted_at = timezone.now()
        self.save()


class Approval(TenantScopedModel):
    STATUS_CHOICES = [
        ('pending', '待审批'),
        ('approved', '已通过'),
        ('rejected', '已拒绝'),
    ]

    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='approvals')
    approver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='approvals')
    step = models.IntegerField()
    role = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    comment = models.TextField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'approvals'
        ordering = ['step', 'created_at']
        indexes = [
            models.Index(fields=['document_id', 'status'], name='approval_document_status_idx'),
            models.Index(fields=['approver_id', 'status'], name='approval_approver_status_idx'),
            models.Index(fields=['tenant_id', 'step'], name='approval_tenant_step_idx'),
        ]

    def __str__(self):
        return f"{self.document.title} - Step {self.step} - {self.status}"


class Comment(TenantScopedModel):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    content = models.TextField()

    class Meta:
        db_table = 'comments'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['document_id'], name='comment_document_idx'),
            models.Index(fields=['author_id'], name='comment_author_idx'),
        ]

    def __str__(self):
        return f"{self.author.email}: {self.content[:50]}"


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('create', '创建'),
        ('update', '更新'),
        ('submit', '提交审批'),
        ('approve', '审批通过'),
        ('reject', '审批拒绝'),
        ('comment', '添加评论'),
        ('delete', '删除'),
        ('restore', '恢复'),
        ('status_change', '状态变更'),
        ('step_change', '步骤变更'),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='audit_logs')
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        null=True,
        blank=True
    )
    approval = models.ForeignKey(
        Approval,
        on_delete=models.SET_NULL,
        related_name='audit_logs',
        null=True,
        blank=True
    )
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='audit_logs',
        null=True,
        blank=True
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    old_status = models.CharField(max_length=20, null=True, blank=True)
    new_status = models.CharField(max_length=20, null=True, blank=True)
    old_step = models.IntegerField(null=True, blank=True)
    new_step = models.IntegerField(null=True, blank=True)
    message = models.TextField(null=True, blank=True)
    meta_data = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['document_id'], name='audit_log_document_idx'),
            models.Index(fields=['user_id'], name='audit_log_user_idx'),
            models.Index(fields=['tenant_id', 'created_at'], name='audit_log_tenant_created_idx'),
            models.Index(fields=['document_id', 'created_at'], name='audit_log_doc_created_idx'),
            models.Index(fields=['action'], name='audit_log_action_idx'),
        ]

    def __str__(self):
        return f"[{self.created_at}] {self.get_action_display()} - Document #{self.document_id}"
