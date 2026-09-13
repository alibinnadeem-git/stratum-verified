# STRATUM Verified · Procedure Execution v2

## Scope

This release extends L7 STRATUM Operational Intelligence with controlled, human-in-the-loop procedure execution.

### Added

- STRATUM Procedure Builder for machine-readable procedure steps.
- Machine-checkable prerequisite rules using current STRATUM Live Iterations.
- Expected-vs-Actual post-action verification.
- Explicit STOP/BLOCK behavior for failed blocking checks.
- Failure/recovery branch routing through `failure_branch_step_code`.
- STRATUM Procedure Simulation with PASS / WARNING / BLOCK readiness output.
- Procedure run and step-run execution ledger.
- Controlled procedure governance: DRAFT → REVIEW → APPROVED → RETIRED.
- Approved procedures become immutable; changes require a new version.
- Only approved procedures can enter live execution.
- Project-manager / organization-admin approval gate for executable procedures.
- Audit records for procedure creation, step creation, approval, execution, verification, resume and abort actions.

## Safety boundary

- STRATUM does not actuate breakers, valves, relays, HMIs, PLC outputs or other physical controls in this release.
- Operator action remains outside the software control boundary.
- STRATUM checks prerequisites before execution and verifies expected post-action state from Live Iterations when a machine-verifiable rule exists.
- When a blocking prerequisite or Expected-vs-Actual check fails, the run is BLOCKED and an operational exception is created.
- Failure/recovery branches require explicit human resume.
- Live State Iterations never rewrite the Verified engineering baseline.
- Existing lifecycle records and DIRs remain authoritative proof layers.

## Rule shape

A machine-verifiable rule uses the step asset plus a Live Iteration point, for example:

```json
{
  "pointKey": "breaker_state",
  "equals": "OPEN",
  "qualityIn": ["GOOD"],
  "maxAgeSeconds": 30
}
```

Supported checks in v2: `equals` / `value`, `oneOf`, `min`, `max`, `qualityIn`, and `maxAgeSeconds`.

## Database

Adds `migrations/008_procedure_execution.sql`:

- `operational_procedure_runs`
- `operational_step_runs`
- `operational_exceptions.procedure_run_id`
- `operational_exceptions.step_run_id`

Migration 008 has been successfully prepared and executed on a temporary Neon branch cloned from the actual `stratum_verified` production database. Production has not been modified.

## Deployment status

Feature branch: `feature/procedure-execution-v2`.

The branch compiled successfully through the execution UI and governance API commits. The final Vercel status for the documentation/page-assembly head may be blocked by the account build-rate limit rather than an application compiler failure; GitHub CI should remain the merge gate before production promotion.

## Next slices

- Telemetry connector abstraction for EPMS / BMS / DCIM / SCADA / PLC.
- Automatic point binding and semantic-state normalization.
- Drawing Intelligence and source provenance into procedure steps.
- Revision Intelligence and procedure impact analysis.
- Operational execution evidence package → DIR creation.
- STRATUM Time Machine historical reconstruction.
