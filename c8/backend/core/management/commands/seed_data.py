from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from core.models import Tenant, Document


class Command(BaseCommand):
    help = 'Seed test data for development'

    def handle(self, *args, **options):
        User = get_user_model()

        tenant1, _ = Tenant.objects.get_or_create(
            slug='acme',
            defaults={'name': 'Acme Corporation'}
        )
        tenant1.workflow_config = [
            {'step': 1, 'role': 'manager'},
            {'step': 2, 'role': 'director'}
        ]
        tenant1.save()

        director1, _ = User.objects.get_or_create(
            email='director@acme.com',
            defaults={
                'tenant': tenant1,
                'role': 'director',
                'first_name': '张',
                'last_name': '总监'
            }
        )
        if not director1.has_usable_password():
            director1.set_password('password123')
            director1.save()

        manager1, _ = User.objects.get_or_create(
            email='manager@acme.com',
            defaults={
                'tenant': tenant1,
                'role': 'manager',
                'manager': director1,
                'first_name': '李',
                'last_name': '经理'
            }
        )
        if not manager1.has_usable_password():
            manager1.set_password('password123')
            manager1.save()

        employee1, _ = User.objects.get_or_create(
            email='employee@acme.com',
            defaults={
                'tenant': tenant1,
                'role': 'employee',
                'manager': manager1,
                'first_name': '王',
                'last_name': '员工'
            }
        )
        if not employee1.has_usable_password():
            employee1.set_password('password123')
            employee1.save()

        Document.objects.get_or_create(
            title='2024年度财务报告',
            defaults={
                'tenant': tenant1,
                'uploaded_by': employee1,
                'content': '这是2024年度财务报告的详细内容...',
                'status': 'draft'
            }
        )

        Document.objects.get_or_create(
            title='新项目审批申请',
            defaults={
                'tenant': tenant1,
                'uploaded_by': employee1,
                'content': '关于启动新研发项目的申请...',
                'status': 'draft'
            }
        )

        tenant2, _ = Tenant.objects.get_or_create(
            slug='globex',
            defaults={'name': 'Globex Industries'}
        )

        user2, _ = User.objects.get_or_create(
            email='admin@globex.com',
            defaults={
                'tenant': tenant2,
                'role': 'manager',
                'first_name': '赵',
                'last_name': '管理'
            }
        )
        if not user2.has_usable_password():
            user2.set_password('password123')
            user2.save()

        Document.objects.get_or_create(
            title='Globex 市场策略文档',
            defaults={
                'tenant': tenant2,
                'uploaded_by': user2,
                'content': 'Globex公司2024市场拓展策略...',
                'status': 'draft'
            }
        )

        self.stdout.write(self.style.SUCCESS('Successfully seeded test data'))
        self.stdout.write(f'Tenant 1 (Acme): {tenant1.name} (id={tenant1.id})')
        self.stdout.write(f'Tenant 2 (Globex): {tenant2.name} (id={tenant2.id})')
        self.stdout.write('Test users (password: password123):')
        self.stdout.write('  - employee@acme.com (员工)')
        self.stdout.write('  - manager@acme.com (直线经理)')
        self.stdout.write('  - director@acme.com (部门主管)')
        self.stdout.write('  - admin@globex.com (另一租户)')
