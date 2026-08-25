# STRATUM Verified

STRATUM Verified is the operational trust layer for intelligent physical infrastructure.

It tracks what exists, where it exists, what happened to it, who performed and approved the work, what evidence supports the event, and the cryptographic proof recorded in Digital Immutable Records (DIRs).

## Architecture

- STRATUM Twin — spatial/digital representation
- STRATUM Verified — lifecycle, evidence, provenance, approvals and verification
- Digital Immutable Records (DIRs) — independently verifiable immutable proof layer

## Deployment

Main application: `https://stratum-verified.vercel.app`

Validator services:
- Validator A — coordinator/record finalization service
- Validator B — independent signer
- Validator C — independent signer

Internal API, database, and environment-variable names may retain historical `chain` terminology for compatibility. User-facing product language is Digital Immutable Records (DIRs).

Never commit validator private keys, database passwords, or shared application secrets to GitHub.
