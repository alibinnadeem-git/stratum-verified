# STRATUM Verified — Security Stage Deployment

This stage must be promoted together with migrations `004_identity_hardening.sql`, `005_project_access_approval_audit.sql`, and `006_passkeys_project_roles_audit_anchor.sql`.

## Required production environment

Existing application/DIRs network variables remain required. Internal environment-variable names may retain historical `STRATUM_CHAIN_*` names for compatibility. Add:

- `WEBAUTHN_RP_ID` — relying-party domain only, without scheme. For the current Vercel domain use `stratum-verified.vercel.app`. If production will use `verified.stratumelectric.com`, set the RP ID to that domain before users register passkeys.
- `WEBAUTHN_ORIGIN` — exact HTTPS origin matching the RP, e.g. `https://stratum-verified.vercel.app` or `https://verified.stratumelectric.com`.
- `WEBAUTHN_RP_NAME` — optional display name; recommended `STRATUM Verified`.
- `CRON_SECRET` — high-entropy secret used by Vercel Cron to authenticate `/api/cron/audit-anchor`.

Passkeys are scoped by relying-party ID. Changing the production RP ID later requires users to register a passkey for the new domain.

## Coordinated release order

1. Confirm application CI is green and permanent DIR #1 / DIR #2 regression proofs still pass.
2. Apply migrations 004 + 005 + 006 to `stratum_verified` as one reviewed migration.
3. Add the WebAuthn and cron environment variables to the main Vercel project.
4. Deploy the main `stratum-verified` application.
5. Confirm Validator A/B/C remain healthy and unchanged.
6. Sign in as an organization administrator and verify project assignments and approval policies.
7. Register one test passkey from **My Security Identity**.
8. Create a controlled lifecycle event and evidence package.
9. Approve using the passkey path and verify the policy threshold behavior.
10. Verify the resulting DIR in Asset Passport / public verification.
11. Verify the audit hash chain and manually anchor its head into Digital Immutable Records (DIRs) once.
12. Confirm the daily audit-root cron sees the already-recorded head and does not create a duplicate.

## Security behavior

- Passkey private material remains in the platform authenticator/security key.
- Approval WebAuthn challenges are short-lived and bound to the target lifecycle record and payload hash.
- A verified assertion creates a short-lived approval grant; it cannot be reused for a different user, organization, lifecycle event, or payload hash.
- Browser P-256 signing remains available as a compatibility path during UAT.
- `SUPER_ADMIN` and `ORG_ADMIN` have organization-wide project access. Other users require a `project_memberships` record and may receive a project-specific role override.
- Administrative audit events are hash-chained. The current verified audit head can be recorded into DIRs manually or through the daily cron.
