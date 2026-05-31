from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Tenant, User, Document, Approval, Comment


class TenantAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'slug', 'created_at']
    search_fields = ['name', 'slug']


class UserAdmin(BaseUserAdmin):
    list_display = ['id', 'email', 'tenant', 'role', 'is_staff']
    list_filter = ['tenant', 'role', 'is_staff']
    search_fields = ['email']
    ordering = ['email']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name')}),
        ('Tenant & Role', {'fields': ('tenant', 'role', 'manager')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2', 'tenant', 'role'),
        }),
    )


class DocumentAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'tenant', 'status', 'uploaded_by', 'current_step', 'created_at']
    list_filter = ['status', 'tenant']
    search_fields = ['title']
    readonly_fields = ['deleted_at']


class ApprovalAdmin(admin.ModelAdmin):
    list_display = ['id', 'document', 'approver', 'step', 'role', 'status', 'approved_at']
    list_filter = ['status', 'role']
    readonly_fields = ['deleted_at']


class CommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'document', 'author', 'created_at']
    readonly_fields = ['deleted_at']


admin.site.register(Tenant, TenantAdmin)
admin.site.register(User, UserAdmin)
admin.site.register(Document, DocumentAdmin)
admin.site.register(Approval, ApprovalAdmin)
admin.site.register(Comment, CommentAdmin)
