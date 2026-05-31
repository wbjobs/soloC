from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import Tenant, User, Document, Approval, Comment, AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'action', 'action_display',
            'old_status', 'new_status',
            'old_step', 'new_step',
            'message', 'meta_data',
            'ip_address', 'user_agent',
            'user', 'created_at'
        ]
        read_only_fields = fields


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        if user.tenant:
            token['tenant_id'] = user.tenant.id
            token['tenant_name'] = user.tenant.name
        token['role'] = user.role
        token['email'] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = {
            'id': self.user.id,
            'email': self.user.email,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'role': self.user.role,
        }
        if self.user.tenant:
            data['tenant'] = {
                'id': self.user.tenant.id,
                'name': self.user.tenant.name,
                'slug': self.user.tenant.slug,
            }
        return data


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'role', 'tenant_id']
        read_only_fields = ['id', 'tenant_id']


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'slug', 'workflow_config', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ApprovalSerializer(serializers.ModelSerializer):
    approver = UserSerializer(read_only=True)

    class Meta:
        model = Approval
        fields = ['id', 'document_id', 'approver', 'step', 'role', 'status', 'comment', 'approved_at', 'created_at']
        read_only_fields = ['id', 'document_id', 'approver', 'step', 'role', 'created_at']


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'document_id', 'author', 'content', 'created_at']
        read_only_fields = ['id', 'document_id', 'author', 'created_at']


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by = UserSerializer(read_only=True)
    approvals = ApprovalSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'title', 'content', 'file_url', 'status', 
            'uploaded_by', 'current_step', 'workflow_config',
            'approvals', 'comments', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'uploaded_by', 'current_step', 'workflow_config', 'created_at', 'updated_at']


class DocumentDetailSerializer(DocumentSerializer):
    class Meta(DocumentSerializer.Meta):
        depth = 1


class SubmitForApprovalSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True)


class ApproveSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)


class RejectSerializer(serializers.Serializer):
    comment = serializers.CharField(required=True)


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    tenant_name = serializers.CharField(write_only=True)
    tenant_slug = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'first_name', 'last_name', 'role', 'tenant_name', 'tenant_slug']

    def create(self, validated_data):
        tenant_name = validated_data.pop('tenant_name')
        tenant_slug = validated_data.pop('tenant_slug')
        password = validated_data.pop('password')

        tenant, _ = Tenant.objects.get_or_create(
            slug=tenant_slug,
            defaults={'name': tenant_name}
        )

        user = User.objects.create(
            tenant=tenant,
            **validated_data
        )
        user.set_password(password)
        user.save()
        return user
