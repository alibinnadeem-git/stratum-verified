-- STRATUM Verified passkeys, project-role granularity and audit-root anchoring
-- Bundled for coordinated deployment.

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[] NOT NULL DEFAULT ARRAY[]::text[],
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  label text NOT NULL DEFAULT 'Passkey',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_active ON webauthn_credentials(organization_id,user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  challenge text NOT NULL,
  payload_hash text,
  lifecycle_event_id uuid REFERENCES lifecycle_events(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_active ON webauthn_challenges(user_id,purpose,expires_at) WHERE consumed_at IS NULL;

ALTER TABLE approvals ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'P256_BROWSER_KEY';
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS webauthn_credential_id uuid REFERENCES webauthn_credentials(id);

CREATE TABLE IF NOT EXISTS audit_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_event_id bigint NOT NULL REFERENCES audit_log(id),
  audit_head_hash text NOT NULL,
  ledger_network text NOT NULL,
  ledger_record_id text NOT NULL,
  ledger_tx_hash text NOT NULL,
  ledger_block_height bigint,
  anchored_at timestamptz NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,audit_event_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_anchors_org_height ON audit_anchors(organization_id,ledger_block_height DESC NULLS LAST);

-- Normalize existing project role overrides. Null means inherit organization role.
UPDATE project_memberships SET project_role=NULL WHERE project_role='';
