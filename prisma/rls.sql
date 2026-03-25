-- =============================================================================
-- Row Level Security (RLS) Policies for Lincoln
--
-- Apply after running prisma migrate: psql $DATABASE_URL -f prisma/rls.sql
--
-- These policies enforce tenant isolation at the database level as a defense-
-- in-depth measure. The application layer ALSO enforces tenant isolation,
-- but RLS provides a hard guarantee even if there's a bug in app logic.
-- =============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE matter_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

-- Create a function to get the current tenant ID from session variable
-- This is set by the application at the start of each request
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS TEXT AS $$
  SELECT current_setting('app.tenant_id', true);
$$ LANGUAGE SQL STABLE;

-- Policies: users can only see rows belonging to their tenant
-- Super admins bypass RLS (handled at app layer)

CREATE POLICY tenant_isolation_clients ON clients
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_isolation_matters ON matters
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_isolation_documents ON documents
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_isolation_intake_forms ON intake_forms
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_isolation_kanban_boards ON kanban_boards
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_isolation_messages ON messages
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_isolation_practice_areas ON practice_areas
  USING (tenant_id = current_tenant_id() OR current_setting('app.is_super_admin', true) = 'true');

-- NOTE: Set app.tenant_id at the start of each database session:
-- SET LOCAL app.tenant_id = '<tenant-id>';
-- This is done in the Prisma middleware / db client wrapper for production.
