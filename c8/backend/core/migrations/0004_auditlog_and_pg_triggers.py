from django.db import migrations, models
import django.db.models.deletion


PgTriggerFunctions = '''
CREATE OR REPLACE FUNCTION log_document_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            INSERT INTO audit_logs (
                tenant_id,
                document_id,
                action,
                old_status,
                new_status,
                old_step,
                new_step,
                message,
                meta_data,
                created_at
            ) VALUES (
                NEW.tenant_id,
                NEW.id,
                'status_change',
                OLD.status,
                NEW.status,
                OLD.current_step,
                NEW.current_step,
                '状态变更: ' || OLD.status || ' -> ' || NEW.status,
                '{}'::jsonb,
                NOW()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS document_status_trigger ON documents;
CREATE TRIGGER document_status_trigger
    AFTER UPDATE ON documents
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_document_status_change();
'''

UndoPgTriggerFunctions = '''
DROP TRIGGER IF EXISTS document_status_trigger ON documents;
DROP FUNCTION IF EXISTS log_document_status_change();
'''


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_add_gin_indexes_and_improve_rls'),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('create', '创建'), ('update', '更新'), ('submit', '提交审批'), ('approve', '审批通过'), ('reject', '审批拒绝'), ('comment', '添加评论'), ('delete', '删除'), ('restore', '恢复'), ('status_change', '状态变更'), ('step_change', '步骤变更')], max_length=30)),
                ('old_status', models.CharField(blank=True, max_length=20, null=True)),
                ('new_status', models.CharField(blank=True, max_length=20, null=True)),
                ('old_step', models.IntegerField(blank=True, null=True)),
                ('new_step', models.IntegerField(blank=True, null=True)),
                ('message', models.TextField(blank=True, null=True)),
                ('meta_data', models.JSONField(blank=True, default=dict)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('approval', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='core.approval')),
                ('document', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='audit_logs', to='core.document')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='audit_logs', to='core.tenant')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='core.user')),
            ],
            options={
                'db_table': 'audit_logs',
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['document_id'], name='audit_log_document_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['user_id'], name='audit_log_user_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['tenant_id', 'created_at'], name='audit_log_tenant_created_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['document_id', 'created_at'], name='audit_log_doc_created_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['action'], name='audit_log_action_idx'),
        ),
        migrations.RunSQL(PgTriggerFunctions, UndoPgTriggerFunctions),
    ]
