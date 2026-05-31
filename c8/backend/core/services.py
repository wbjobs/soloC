from django.utils import timezone
from django.db import connection
from django.db import transaction
from .models import Document, Approval, User, Tenant
from .audit import (
    log_submit_for_approval,
    log_approve,
    log_reject,
    log_status_change
)


class WorkflowService:
    @staticmethod
    def set_db_tenant_context(tenant_id):
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_current_tenant(%s)", [tenant_id])

    @staticmethod
    @transaction.atomic
    def submit_for_approval(document: Document, submitter: User, message: str = '', request=None):
        if document.status == 'pending':
            raise ValueError('文档已经在审批流程中')
        if document.status in ['approved', 'rejected']:
            raise ValueError('已完成的文档无法重新提交审批')

        workflow_config = document.workflow_config or document.tenant.workflow_config
        if not workflow_config:
            raise ValueError('未配置审批流程')

        sorted_steps = sorted(workflow_config, key=lambda x: x.get('step', 0))
        if not sorted_steps:
            raise ValueError('审批流程配置为空')

        old_status = document.status

        document.status = 'pending'
        document.current_step = sorted_steps[0].get('step', 1)
        document.workflow_config = workflow_config
        document.save(update_fields=['status', 'current_step', 'workflow_config', 'updated_at'])

        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM approvals WHERE document_id = %s",
                [document.id]
            )

        for step_config in sorted_steps:
            step = step_config.get('step')
            role = step_config.get('role')

            if not step or not role:
                continue

            approver = WorkflowService._find_approver_for_role(submitter, role)
            if not approver:
                raise ValueError(f'无法找到角色为 "{role}" 的审批人。请确保审批流程配置正确，且组织架构完整。')

            Approval.unfiltered.create(
                tenant=document.tenant,
                document=document,
                approver=approver,
                step=step,
                role=role,
                status='pending'
            )

        log_submit_for_approval(document, submitter, request)

        return document

    @staticmethod
    def _find_approver_for_role(user: User, role: str):
        if role == 'manager':
            return user.manager
        elif role == 'director':
            manager = user.manager
            if manager and manager.manager:
                return manager.manager
            return User.objects.filter(tenant=user.tenant, role='director').first()
        else:
            return User.objects.filter(tenant=user.tenant, role=role).first()

    @staticmethod
    def approve(document: Document, approver: User, comment: str = '', request=None):
        current_approval = document.approvals.filter(
            approver=approver,
            status='pending'
        ).order_by('step').first()

        if not current_approval:
            raise ValueError('您没有待审批的该文档')

        old_status = document.status

        current_approval.status = 'approved'
        current_approval.comment = comment
        current_approval.approved_at = timezone.now()
        current_approval.save()

        all_steps = list(document.approvals.order_by('step'))
        current_step_index = all_steps.index(current_approval)

        if current_step_index == len(all_steps) - 1:
            document.status = 'approved'
            document.current_step = len(all_steps)
            document.save()
        else:
            next_step = current_step_index + 2
            document.current_step = next_step
            document.save()

        log_approve(document, current_approval, approver, comment, request)

        if old_status != document.status:
            log_status_change(document, old_status, document.status, approver, request=request)

        return document

    @staticmethod
    def reject(document: Document, approver: User, comment: str, request=None):
        current_approval = document.approvals.filter(
            approver=approver,
            status='pending'
        ).order_by('step').first()

        if not current_approval:
            raise ValueError('您没有待审批的该文档')

        old_status = document.status

        current_approval.status = 'rejected'
        current_approval.comment = comment
        current_approval.approved_at = timezone.now()
        current_approval.save()

        document.status = 'rejected'
        document.save()

        log_reject(document, current_approval, approver, comment, request)

        if old_status != document.status:
            log_status_change(document, old_status, document.status, approver, request=request)

        return document

    @staticmethod
    def get_pending_for_user(user: User):
        return Document.objects.filter(
            status='pending',
            approvals__approver=user,
            approvals__status='pending'
        ).distinct().select_related('uploaded_by')

    @staticmethod
    def soft_delete_document(document: Document):
        document.soft_delete_cascade()
