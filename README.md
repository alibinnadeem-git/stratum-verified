# STRATUM Verified

STRATUM Verified is the operational trust layer for intelligent physical infrastructure.

It tracks what exists, where it exists, what happened to it, who performed and approved the work, what evidence supports the event, and the cryptographic proof anchored to STRATUM Chain.

## Architecture

- STRATUM Twin — spatial/digital representation
- STRATUM Verified — lifecycle, evidence, provenance, approvals and verification
- STRATUM Chain — independently verifiable proof layer

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and provide a PostgreSQL connection string plus authentication/chain configuration.

## Deployment

The main application is intended for Vercel. Validator deployments use the serverless quorum endpoints and separate validator identities. Never commit validator private keys, database passwords, or application secrets to GitHub.
