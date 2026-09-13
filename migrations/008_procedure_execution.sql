-- STRATUM Verified · Procedure Execution v2
-- Adds human-in-the-loop procedure runs, step execution state, automatic
-- expected-vs-actual verification records, and simulation results.
-- This does not actuate equipment or modify the verified engineering baseline.

CREATE TABLE IF NOT EXISTS operational_procedure_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES operational_procedures(id) ON DELETE RESTRICT,
  execution_mode text NOT NULL DEFAULT 'LIVE' CHECK (execution_mode IN ('LIVE','SIMULATION')),
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','RUNNING','BLOCKED','COMPLETED','ABORTED')),
  current_step_id uuid REFERENCES operational_procedure_steps(id) ON DELETE SET NULL,
  initiated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  aborted_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_procedure_runs_project
  ON operational_procedure_runs(organization_id, project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_procedure_runs_procedure
  ON operational_procedure_runs(organization_id, procedure_id, created_at DESC);

CREATE TABLE IF NOT EXISTS operational_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  procedure_run_id uuid NOT NULL REFERENCES operational_procedure_runs(id) ON DELETE CASCADE,
  procedure_step_id uuid NOT NULL REFERENCES operational_procedure_steps(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','IN_PROGRESS','VERIFIED','FAILED','BLOCKED','SKIPPED')),
  expected_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  operator_note text,
  started_by uuid REFERENCES users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedure_run_id, procedure_step_id)
);

CREATE INDEX IF NOT EXISTS idx_operational_step_runs_run
  ON operational_step_runs(organization_id, procedure_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_operational_step_runs_status
  ON operational_step_runs(organization_id, project_id, status, updated_at DESC);

ALTER TABLE operational_exceptions
  ADD COLUMN IF NOT EXISTS procedure_run_id uuid REFERENCES operational_procedure_runs(id) ON DELETE SET NULL;
ALTER TABLE operational_exceptions
  ADD COLUMN IF NOT EXISTS step_run_id uuid REFERENCES operational_step_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_operational_exceptions_run
  ON operational_exceptions(organization_id, procedure_run_id, status, created_at DESC);
