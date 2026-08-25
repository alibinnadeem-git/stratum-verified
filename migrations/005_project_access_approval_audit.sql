-- STRATUM Verified project-scoped access, approval policy, and tamper-evident audit
-- Bundled for the next coordinated deployment.

CREATE TABLE IF NOT EXISTS project_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  PRIMARY KEY(project_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_memberships_user ON project_memberships(organization_id,user_id,project_id);

-- Preserve current effective access for existing non-admin organization members.
INSERT INTO project_memberships(organization_id,project_id,user_id,project_role)
SELECT p.organization_id,p.id,m.user_id,m.role::text
FROM projects p
JOIN memberships m ON m.organization_id=p.organization_id
WHERE m.role::text NOT IN ('SUPER_ADMIN','ORG_ADMIN')
ON CONFLICT(project_id,user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS approval_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Project verification policy',
  approvals_required integer NOT NULL DEFAULT 1 CHECK(approvals_required BETWEEN 1 AND 5),
  allowed_roles text[] NOT NULL DEFAULT ARRAY['INSPECTOR','PROJECT_MANAGER','ORG_ADMIN','SUPER_ADMIN']::text[],
  require_evidence boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);
INSERT INTO approval_policies(organization_id,project_id)
SELECT organization_id,id FROM projects
ON CONFLICT(project_id) DO NOTHING;

ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approval_policy_id uuid REFERENCES approval_policies(id);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS sequence_number integer;
CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_one_decision_per_user ON approvals(lifecycle_event_id,approver_user_id) WHERE decision='APPROVED';

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS event_hash text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id text;
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created_desc ON audit_log(organization_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_hash ON audit_log(event_hash) WHERE event_hash IS NOT NULL;
