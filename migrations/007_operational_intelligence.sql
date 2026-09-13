-- STRATUM Verified · Operational Intelligence v1
-- Adds Human Touchpoints, machine-readable SOP/MOP/EOP procedures,
-- dependency topology, and near-real-time observed state without modifying
-- the existing verified lifecycle / DIR trust model.

CREATE TABLE IF NOT EXISTS operational_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  touchpoint_code text NOT NULL,
  name text NOT NULL,
  touchpoint_type text NOT NULL,
  current_state text,
  permitted_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  restricted_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_role text,
  authorization_level text,
  loto_required boolean NOT NULL DEFAULT false,
  hazards jsonb NOT NULL DEFAULT '[]'::jsonb,
  interlocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, touchpoint_code)
);

CREATE INDEX IF NOT EXISTS idx_operational_touchpoints_project ON operational_touchpoints(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_operational_touchpoints_asset ON operational_touchpoints(organization_id, asset_id);

CREATE TABLE IF NOT EXISTS operational_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  procedure_code text NOT NULL,
  procedure_type text NOT NULL CHECK (procedure_type IN ('SOP','MOP','EOP','MAINTENANCE','LOTO','COMMISSIONING')),
  title text NOT NULL,
  purpose text,
  version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','APPROVED','RETIRED')),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, procedure_code, version)
);

CREATE INDEX IF NOT EXISTS idx_operational_procedures_project ON operational_procedures(organization_id, project_id, procedure_type, status);

CREATE TABLE IF NOT EXISTS operational_procedure_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES operational_procedures(id) ON DELETE CASCADE,
  sequence_no integer NOT NULL CHECK (sequence_no > 0),
  step_code text NOT NULL,
  title text NOT NULL,
  instruction text NOT NULL,
  actor_role text,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  touchpoint_id uuid REFERENCES operational_touchpoints(id) ON DELETE SET NULL,
  prerequisites jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_branch_step_code text,
  is_blocking boolean NOT NULL DEFAULT true,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedure_id, sequence_no),
  UNIQUE (procedure_id, step_code)
);

CREATE INDEX IF NOT EXISTS idx_operational_steps_touchpoint ON operational_procedure_steps(organization_id, touchpoint_id);
CREATE INDEX IF NOT EXISTS idx_operational_steps_asset ON operational_procedure_steps(organization_id, asset_id);

CREATE TABLE IF NOT EXISTS operational_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  target_asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('FEEDS','COOLS','CONTROLS','DEPENDS_ON','PROTECTS','BYPASSES','REDUNDANT_TO','CONNECTED_TO')),
  criticality text NOT NULL DEFAULT 'NORMAL' CHECK (criticality IN ('LOW','NORMAL','HIGH','CRITICAL')),
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_asset_id, target_asset_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_operational_dependencies_source ON operational_dependencies(organization_id, project_id, source_asset_id);
CREATE INDEX IF NOT EXISTS idx_operational_dependencies_target ON operational_dependencies(organization_id, project_id, target_asset_id);

CREATE TABLE IF NOT EXISTS operational_observations (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  touchpoint_id uuid REFERENCES operational_touchpoints(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  point_key text NOT NULL,
  value_json jsonb NOT NULL,
  quality text NOT NULL DEFAULT 'GOOD' CHECK (quality IN ('GOOD','UNCERTAIN','BAD','STALE')),
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_operational_observations_latest ON operational_observations(organization_id, asset_id, point_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_observations_project_time ON operational_observations(organization_id, project_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS operational_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  procedure_id uuid REFERENCES operational_procedures(id) ON DELETE SET NULL,
  procedure_step_id uuid REFERENCES operational_procedure_steps(id) ON DELETE SET NULL,
  exception_type text NOT NULL,
  severity text NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO','WARNING','CRITICAL','BLOCK')),
  expected_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_operational_exceptions_open ON operational_exceptions(organization_id, project_id, status, severity, created_at DESC);
