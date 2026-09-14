-- STRATUM Spatial Verified · Telemetry Semantic Binding v1
-- Extends Operational Intelligence without changing the Verified engineering baseline.
-- Telemetry is observational evidence only. It cannot grant control authority or
-- silently mutate Verified state.

CREATE TABLE IF NOT EXISTS telemetry_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_code text NOT NULL,
  display_name text NOT NULL,
  adapter_type text NOT NULL CHECK (adapter_type IN ('EPMS','BMS','DCIM','SCADA','PLC','OPC_UA','GENERIC')),
  endpoint_ref text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','RETIRED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  activated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_code)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_sources_project
  ON telemetry_sources(organization_id, project_id, status, adapter_type);

CREATE TABLE IF NOT EXISTS telemetry_point_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES telemetry_sources(id) ON DELETE CASCADE,
  external_point_key text NOT NULL,
  semantic_key text NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  touchpoint_id uuid REFERENCES operational_touchpoints(id) ON DELETE SET NULL,
  value_type text NOT NULL DEFAULT 'NUMBER' CHECK (value_type IN ('NUMBER','BOOLEAN','STRING','JSON')),
  engineering_unit text,
  multiplier numeric NOT NULL DEFAULT 1,
  offset_value numeric NOT NULL DEFAULT 0,
  expected_interval_seconds integer CHECK (expected_interval_seconds IS NULL OR expected_interval_seconds > 0),
  stale_after_seconds integer CHECK (stale_after_seconds IS NULL OR stale_after_seconds > 0),
  mapping_confidence numeric NOT NULL DEFAULT 1 CHECK (mapping_confidence >= 0 AND mapping_confidence <= 1),
  mapping_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','APPROVED','RETIRED')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_point_key)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_bindings_semantic
  ON telemetry_point_bindings(organization_id, project_id, asset_id, semantic_key, status);
CREATE INDEX IF NOT EXISTS idx_telemetry_bindings_source
  ON telemetry_point_bindings(organization_id, source_id, status);

CREATE TABLE IF NOT EXISTS telemetry_binding_dependencies (
  binding_id uuid NOT NULL REFERENCES telemetry_point_bindings(id) ON DELETE CASCADE,
  dependency_id uuid NOT NULL REFERENCES operational_dependencies(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (binding_id, dependency_id)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_binding_dependencies_project
  ON telemetry_binding_dependencies(organization_id, project_id, dependency_id);

ALTER TABLE operational_observations
  ADD COLUMN IF NOT EXISTS telemetry_source_id uuid REFERENCES telemetry_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telemetry_binding_id uuid REFERENCES telemetry_point_bindings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS semantic_key text,
  ADD COLUMN IF NOT EXISTS engineering_unit text,
  ADD COLUMN IF NOT EXISTS confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_observations_idempotency
  ON operational_observations(organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operational_observations_semantic_latest
  ON operational_observations(organization_id, project_id, asset_id, semantic_key, observed_at DESC)
  WHERE semantic_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS operational_live_iterations (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  touchpoint_id uuid REFERENCES operational_touchpoints(id) ON DELETE SET NULL,
  observation_id bigint NOT NULL UNIQUE REFERENCES operational_observations(id) ON DELETE CASCADE,
  telemetry_binding_id uuid NOT NULL REFERENCES telemetry_point_bindings(id) ON DELETE RESTRICT,
  semantic_key text NOT NULL,
  normalized_value_json jsonb NOT NULL,
  engineering_unit text,
  quality text NOT NULL CHECK (quality IN ('GOOD','UNCERTAIN','BAD','STALE')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  authority text NOT NULL DEFAULT 'OBSERVATIONAL_ONLY' CHECK (authority = 'OBSERVATIONAL_ONLY'),
  control_authority boolean NOT NULL DEFAULT false CHECK (control_authority = false),
  verified_baseline_mutation boolean NOT NULL DEFAULT false CHECK (verified_baseline_mutation = false),
  mapping_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_live_iterations_latest
  ON operational_live_iterations(organization_id, project_id, asset_id, semantic_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_live_iterations_quality
  ON operational_live_iterations(organization_id, project_id, quality, observed_at DESC);

COMMENT ON TABLE telemetry_binding_dependencies IS
  'Optional links from an approved telemetry point mapping into the existing Operational Intelligence dependency topology; does not create a second graph.';
COMMENT ON TABLE operational_live_iterations IS
  'Append-only STRATUM Live Iterations derived from governed telemetry bindings. Observational only; never rewrites the Verified engineering baseline.';
COMMENT ON COLUMN operational_live_iterations.control_authority IS
  'Must remain false. Telemetry and STRATUM Live Iterations do not grant physical control authority.';
COMMENT ON COLUMN operational_live_iterations.verified_baseline_mutation IS
  'Must remain false. Observed operational state never silently overwrites Verified state.';
