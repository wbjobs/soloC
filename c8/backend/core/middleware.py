import threading
from django.utils.deprecation import MiddlewareMixin
from django.db import connection

_user = threading.local()
_tenant = threading.local()


def get_current_user():
    return getattr(_user, 'user', None)


def get_current_tenant():
    return getattr(_tenant, 'tenant', None)


def set_tenant_context(tenant_id):
    if tenant_id:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_current_tenant(%s)", [int(tenant_id)])


def clear_tenant_context():
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.current_tenant_id', '', FALSE)")


class TenantMiddleware(MiddlewareMixin):
    def process_view(self, request, view_func, view_args, view_kwargs):
        _user.user = None
        _tenant.tenant = None

        if hasattr(request, 'user') and request.user.is_authenticated and hasattr(request.user, 'tenant'):
            tenant = request.user.tenant
            if tenant:
                _user.user = request.user
                _tenant.tenant = tenant
                set_tenant_context(tenant.id)
        return None

    def process_response(self, request, response):
        try:
            clear_tenant_context()
        except Exception:
            pass
        return response

    def process_exception(self, request, exception):
        try:
            clear_tenant_context()
        except Exception:
            pass
        return None
