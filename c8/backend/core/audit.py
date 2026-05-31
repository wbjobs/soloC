from django.utils import timezone
from django.db import connection
from .models import AuditLog, Document, Approval, User, Tenant
from .middleware import get_current_user


def get_client_ip(request):
    if not request:
        return None
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def get_user_agent(request):
    if not request:
        return None
    return request.META.get('HTTP_USER_AGENT')


def log_action(
    action,
    document=None,
    approval=None,
    user=None,
    tenant=None,
    old_status=None,
    new_status=None,
    old_step=None,
    new_step=None,
    message=None,
    meta_data=None,
    request=None
):
    if user is None:
        user = get_current_user()

    if document and tenant is None:
        tenant = document.tenant

    if approval and document is None:
        document = approval.document

    if user and tenant is None:
        tenant = user.tenant

    if tenant is None and document is None:
        return None

    log_entry = AuditLog.objects.create(
        tenant=tenant,
        document=document,
        approval=approval,
        user=user,
        action=action,
        old_status=old_status,
        new_status=new_status,
        old_step=old_step,
        new_step=new_step,
        message=message,
        meta_data=meta_data or {},
        ip_address=get_client_ip(request),
        user_agent=get_user_agent(request)
    )
    return log_entry


def log_document_create(document, user=None, request=None):
    return log_action(
        action='create',
        document=document,
        user=user,
        new_status=document.status,
        new_step=document.current_step,
        message=f'文档「{document.title}」已创建',
        meta_data={
            'title': document.title,
            'file_url': document.file_url
        },
        request=request
    )


def log_document_update(document, old_title=None, user=None, request=None):
    changes = []
    if old_title and old_title != document.title:
        changes.append(f'标题: {old_title} → {document.title}')

    return log_action(
        action='update',
        document=document,
        user=user,
        message='文档信息已更新' + (f' ({", ".join(changes)})' if changes else ''),
        request=request
    )


def log_status_change(document, old_status, new_status, user=None, message=None, request=None):
    status_labels = {
        'draft': '草稿',
        'pending': '待审批',
        'approved': '已通过',
        'rejected': '已拒绝'
    }
    old_label = status_labels.get(old_status, old_status)
    new_label = status_labels.get(new_status, new_status)

    return log_action(
        action='status_change',
        document=document,
        user=user,
        old_status=old_status,
        new_status=new_status,
        message=message or f'状态变更: {old_label} → {new_label}',
        request=request
    )


def log_submit_for_approval(document, user=None, request=None):
    return log_action(
        action='submit',
        document=document,
        user=user,
        old_status='draft',
        new_status='pending',
        new_step=document.current_step,
        message=f'文档已提交审批，进入审批流程',
        meta_data={
            'workflow_steps': document.workflow_config
        },
        request=request
    )


def log_approve(document, approval, user=None, comment=None, request=None):
    return log_action(
        action='approve',
        document=document,
        approval=approval,
        user=user,
        old_status='pending',
        new_status=document.status,
        old_step=approval.step,
        new_step=document.current_step,
        message=f'Step {approval.step} ({approval.role}) 审批通过' + (f': {comment}' if comment else ''),
        meta_data={
            'step': approval.step,
            'role': approval.role,
            'comment': comment
        },
        request=request
    )


def log_reject(document, approval, user=None, comment=None, request=None):
    return log_action(
        action='reject',
        document=document,
        approval=approval,
        user=user,
        old_status='pending',
        new_status='rejected',
        old_step=approval.step,
        message=f'Step {approval.step} ({approval.role}) 审批拒绝: {comment}',
        meta_data={
            'step': approval.step,
            'role': approval.role,
            'comment': comment
        },
        request=request
    )


def log_comment(document, comment_obj, user=None, request=None):
    return log_action(
        action='comment',
        document=document,
        user=user,
        message=f'添加评论: {comment_obj.content[:100]}{"..." if len(comment_obj.content) > 100 else ""}',
        meta_data={
            'comment_id': comment_obj.id,
            'content_preview': comment_obj.content[:200]
        },
        request=request
    )


def log_document_delete(document, user=None, request=None):
    return log_action(
        action='delete',
        document=document,
        user=user,
        old_status=document.status,
        message=f'文档「{document.title}」已删除（软删除）',
        request=request
    )


def log_document_restore(document, user=None, request=None):
    return log_action(
        action='restore',
        document=document,
        user=user,
        message=f'文档「{document.title}」已恢复',
        request=request
    )
