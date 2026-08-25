-- STRATUM Verified identity hardening
-- Apply with the rest of the next-stage deployment.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_change_at timestamptz;

CREATE TABLE IF NOT EXISTS user_signing_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Primary browser key',
  algorithm text NOT NULL DEFAULT 'ECDSA_P256_SHA256',
  public_key_jwk jsonb NOT NULL,
  fingerprint_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id),
  UNIQUE(user_id,fingerprint_sha256)
);

CREATE INDEX IF NOT EXISTS idx_user_signing_keys_active ON user_signing_keys(organization_id,user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_signing_keys_fingerprint ON user_signing_keys(fingerprint_sha256);

ALTER TABLE approvals ADD COLUMN IF NOT EXISTS signing_key_id uuid REFERENCES user_signing_keys(id);
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS signature_algorithm text;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS signer_fingerprint_sha256 text;

CREATE TABLE IF NOT EXISTS security_events (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_org_created ON security_events(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON security_events(user_id,created_at DESC);
