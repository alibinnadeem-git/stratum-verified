# STRATUM Verified · Procedure Execution v2

## Scope

This release extends L7 STRATUM Operational Intelligence with controlled, human-in-the-loop procedure execution.

### Added

- STRATUM Procedure Builder for machine-readable procedure steps.
- Machine-checkable prerequisite rules using current STRATUM Live Iterations.
- Expected-vs-Actual post-action verification.
- Explicit STOP/BLOCK behavior for failed blocking checks.
- Non-blocking mismatches create WARNING exceptions and continue unless an explicit failure branch is defined.
- Failure/recovery branch routing through `failure_branch_step_code`.
- STRATUM Procedure Simulation with PASS / WARNING / BLOCK readiness output.
- Procedure run and step-run execution ledger.
- Controlled procedure governance: DRAFT → REVIEW → APPROVED → RETIRED.
- Every new procedure is created as DRAFT.
- REVIEW → APPROVED requires a project-manager / organization-admin role and an approver different from the procedure author.
- Approved procedures become immutable; changes require a new version.
- Only approved procedures can enter live execution.
- Audit records for procedure creation, step creation, approval, execution, verification, resume and abort actions.

## Safety boundary

- STRATUM does not actuate breakers, valves, relays, HMIs, PLC outputs or other physical controls in this release.
- Operator action remains outside the software control boundary.
- STRATUM checks prerequisites before execution and verifies expected post-action state from Live Iterations when a machine-verifiable rule exists.
- When a blocking prerequisite or Expected-vs-Actual check fails, the run is BLOCKED and an operational exception is created.
- When a non-blocking check fails, a WARNING exception is retained and the run advances unless the step explicitly defines a failure/recovery branch.
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

Functional branch commits for the execution engine, APIs, UI, governance flow and the hardened semantics compiled successfully in Vercel preview where the platform accepted a build. The Vercel account subsequently reached its build-rate limit, so a rate-limit status is not treated as an application compiler failure. Production promotion still requires explicit database approval and merge approval.

## Next slices

- Telemetry connector abstraction for EPMS / BMS / DCIM / SCADA / PLC.
- Automatic point binding and semantic-state normalization.
- Drawing Intelligence and source provenance into procedure steps.
- Revision Intelligence and procedure impact analysis.
- Operational execution evidence package → DIR creation.
- STRATUM Time Machine historical reconstruction.
