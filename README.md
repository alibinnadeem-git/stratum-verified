# STRATUM Verified

STRATUM Verified is the operational trust layer for intelligent physical infrastructure.

It tracks what exists, where it exists, what happened to it, who performed and approved the work, what evidence supports the event, and the cryptographic proof anchored to STRATUM Chain.

## Architecture

- STRATUM Twin — spatial/digital representation
- STRATUM Verified — lifecycle, evidence, provenance, approvals and verification
- STRATUM Chain — independently verifiable proof layer

## Deployment

Main application: `https://stratum-verified.vercel.app`

Validator services:
- Validator A — coordinator/anchor service
- Validator B — independent signer
- Validator C — independent signer

Never commit validator private keys, database passwords, or shared application secrets to GitHub.
