from django.db import migrations


RlsPolicies = '''
CREATE OR REPLACE FUNCTION set_current_tenant(p_tenant_id BIGINT)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_current_tenant()
RETURNS BIGINT AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', TRUE)::BIGINT;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant_isolation ON documents;
CREATE POLICY documents_tenant_isolation ON documents
    FOR ALL
    USING (tenant_id = get_current_tenant() OR get_current_tenant() IS NULL);

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approvals_tenant_isolation ON approvals;
CREATE POLICY approvals_tenant_isolation ON approvals
    FOR ALL
    USING (tenant_id = get_current_tenant() OR get_current_tenant() IS NULL);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comments_tenant_isolation ON comments;
CREATE POLICY comments_tenant_isolation ON comments
    FOR ALL
    USING (tenant_id = get_current_tenant() OR get_current_tenant() IS NULL);
'''

UndoRlsPolicies = '''
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE comments DISABLE ROW LEVEL SECURITY;
'''


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(RlsPolicies, UndoRlsPolicies),
    ]
