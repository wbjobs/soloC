from django.db import migrations, models


RlsPoliciesV2 = '''
CREATE OR REPLACE FUNCTION set_current_tenant(p_tenant_id BIGINT)
RETURNS VOID AS $$
BEGIN
    IF p_tenant_id IS NOT NULL THEN
        PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, FALSE);
    ELSE
        PERFORM set_config('app.current_tenant_id', '', FALSE);
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS BIGINT AS $$
DECLARE
    val TEXT;
BEGIN
    val := current_setting('app.current_tenant_id', TRUE);
    IF val IS NULL OR val = '' THEN
        RETURN NULL;
    END IF;
    RETURN val::BIGINT;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rls_enabled_for_session()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', TRUE) IS NOT NULL
       AND current_setting('app.current_tenant_id', TRUE) != '';
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant_isolation ON documents;
CREATE POLICY documents_tenant_isolation ON documents
    FOR ALL
    USING (
        NOT rls_enabled_for_session()
        OR tenant_id = get_current_tenant()
    )
    WITH CHECK (
        NOT rls_enabled_for_session()
        OR tenant_id = get_current_tenant()
    );

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approvals_tenant_isolation ON approvals;
CREATE POLICY approvals_tenant_isolation ON approvals
    FOR ALL
    USING (
        NOT rls_enabled_for_session()
        OR tenant_id = get_current_tenant()
    )
    WITH CHECK (
        NOT rls_enabled_for_session()
        OR tenant_id = get_current_tenant()
    );

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comments_tenant_isolation ON comments;
CREATE POLICY comments_tenant_isolation ON comments
    FOR ALL
    USING (
        NOT rls_enabled_for_session()
        OR tenant_id = get_current_tenant()
    )
    WITH CHECK (
        NOT rls_enabled_for_session()
        OR tenant_id = get_current_tenant()
    );
'''

UndoRlsPoliciesV2 = '''
DROP FUNCTION IF EXISTS rls_enabled_for_session();
'''


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_rls_policies'),
    ]

    operations = [
        migrations.RunSQL(RlsPoliciesV2, UndoRlsPoliciesV2),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS tenant_workflow_config_gin ON tenants USING gin (workflow_config jsonb_ops);',
            'DROP INDEX IF EXISTS tenant_workflow_config_gin;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS document_workflow_config_gin ON documents USING gin (workflow_config jsonb_ops);',
            'DROP INDEX IF EXISTS document_workflow_config_gin;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS document_status_idx ON documents(status);',
            'DROP INDEX IF EXISTS document_status_idx;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS document_tenant_status_idx ON documents(tenant_id, status);',
            'DROP INDEX IF EXISTS document_tenant_status_idx;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS approval_document_status_idx ON approvals(document_id, status);',
            'DROP INDEX IF EXISTS approval_document_status_idx;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS approval_approver_status_idx ON approvals(approver_id, status);',
            'DROP INDEX IF EXISTS approval_approver_status_idx;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS approval_tenant_step_idx ON approvals(tenant_id, step);',
            'DROP INDEX IF EXISTS approval_tenant_step_idx;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS comment_document_idx ON comments(document_id);',
            'DROP INDEX IF EXISTS comment_document_idx;'
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS comment_author_idx ON comments(author_id);',
            'DROP INDEX IF EXISTS comment_author_idx;'
        ),
    ]
