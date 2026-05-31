from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from django_filters import rest_framework as filters
from .models import Document, Approval, Comment, Tenant, User, AuditLog
from .serializers import (
    DocumentSerializer, DocumentDetailSerializer,
    ApprovalSerializer, CommentSerializer,
    TenantSerializer, UserSerializer, UserRegisterSerializer,
    SubmitForApprovalSerializer, ApproveSerializer, RejectSerializer,
    AuditLogSerializer
)
from .services import WorkflowService
from .audit import (
    log_document_create,
    log_document_update,
    log_document_delete,
    log_comment,
    log_status_change
)


class IsAuthenticatedOrRegister(permissions.BasePermission):
    def has_permission(self, request, view):
        if view.action == 'register':
            return True
        return request.user and request.user.is_authenticated


class TenantFilter(filters.FilterSet):
    class Meta:
        model = Document
        fields = {
            'status': ['exact'],
        }


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    filter_backends = [filters.DjangoFilterBackend]
    filterset_class = TenantFilter

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Document.all_objects.all().select_related('uploaded_by')
        return Document.objects.all().select_related('uploaded_by').order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DocumentDetailSerializer
        return DocumentSerializer

    def perform_create(self, serializer):
        user = self.request.user
        document = serializer.save(
            uploaded_by=user,
            tenant=user.tenant
        )
        log_document_create(document, user, self.request)

    def perform_update(self, serializer):
        instance = self.get_object()
        old_title = instance.title
        old_status = instance.status

        document = serializer.save()

        if old_status != document.status:
            log_status_change(document, old_status, document.status, self.request.user, request=self.request)
        elif old_title != document.title:
            log_document_update(document, old_title, self.request.user, self.request)

    def perform_destroy(self, instance):
        log_document_delete(instance, self.request.user, self.request)
        instance.delete()

    @action(detail=False, methods=['get'])
    def pending(self, request):
        pending_docs = WorkflowService.get_pending_for_user(request.user)
        serializer = self.get_serializer(pending_docs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def audit_log(self, request, pk=None):
        document = self.get_object()
        logs = AuditLog.objects.filter(
            document=document,
            tenant=request.user.tenant
        ).select_related('user').order_by('-created_at', '-id')
        serializer = AuditLogSerializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        document = self.get_object()
        serializer = SubmitForApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            doc = WorkflowService.submit_for_approval(
                document,
                request.user,
                serializer.validated_data.get('message', ''),
                request
            )
            return Response(DocumentDetailSerializer(doc).data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        document = self.get_object()
        serializer = ApproveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            doc = WorkflowService.approve(
                document,
                request.user,
                serializer.validated_data.get('comment', ''),
                request
            )
            return Response(DocumentDetailSerializer(doc).data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        document = self.get_object()
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            doc = WorkflowService.reject(
                document,
                request.user,
                serializer.validated_data.get('comment'),
                request
            )
            return Response(DocumentDetailSerializer(doc).data)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def comment(self, request, pk=None):
        document = self.get_object()
        content = request.data.get('content')
        if not content:
            return Response({'error': '评论内容不能为空'}, status=status.HTTP_400_BAD_REQUEST)

        comment = Comment.objects.create(
            tenant=request.user.tenant,
            document=document,
            author=request.user,
            content=content
        )
        log_comment(document, comment, request.user, request)
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class ApprovalViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ApprovalSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Approval.all_objects.all()
        return Approval.objects.filter(approver=user)


class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer

    def get_queryset(self):
        user = self.request.user
        document_id = self.request.query_params.get('document')
        if user.is_superuser:
            qs = Comment.all_objects.all()
        else:
            qs = Comment.objects.all()
        if document_id:
            qs = qs.filter(document_id=document_id)
        return qs


class TenantViewSet(viewsets.ModelViewSet):
    serializer_class = TenantSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Tenant.objects.all()
        if user.tenant:
            return Tenant.objects.filter(id=user.tenant.id)
        return Tenant.objects.none()


class UserViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticatedOrRegister]

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def register(self, request):
        serializer = UserRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({
                'id': user.id,
                'email': user.email,
                'role': user.role,
                'tenant_id': user.tenant.id if user.tenant else None
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'])
    def me(self, request):
        serializer = UserSerializer(request.user)
        data = serializer.data
        if request.user.tenant:
            data['tenant'] = TenantSerializer(request.user.tenant).data
        return Response(data)
