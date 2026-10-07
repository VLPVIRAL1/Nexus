# Operations runbook

This runbook covers the implemented pilot controls. It does not establish production readiness. Never place taxpayer values, source-file contents, identifiers, or artifact bytes in logs, tickets, alerts, or chat.

## Artifact worker

Start one or more workers with `npm run worker:artifacts`. Each worker claims jobs with `FOR UPDATE SKIP LOCKED`, uses a five-minute lease, re-checks the requesting user’s current firm membership and client assignment, and retries unexpected failures at most three times with bounded exponential delay. Artifact generation remains idempotent by return revision, calculation run, output type, result hash, and template version.

Administrator-only job metrics are available from `GET /api/operations/artifact-jobs`. Monitor queued/running/failed counts, oldest queued age, p95 successful duration, and failure codes. This endpoint intentionally excludes tax values.

### Failed generation

1. Confirm the development/application health endpoint and database connectivity.
2. Read the job error code and attempt count in the Outputs screen or administrator metrics endpoint. Do not copy taxpayer values into an incident record.
3. For a transient infrastructure failure, restore the dependency and use the job’s Retry action. Manual retry is allowed only for a failed job on the current return revision.
4. For `conflict`, `forbidden`, or stale input, fix the underlying revision/access state and queue a new job. Do not force an old job to run.
5. Verify the resulting artifact hash, calculation-run link, required-form manifest, and download authorization.

### Broken output template

1. Stop the artifact worker so no additional affected artifacts are produced.
2. Identify affected jobs by template version and output type without querying taxpayer values.
3. Revert or repair the renderer, increment its template version, and run unit, integration, build, and visual checks.
4. Mark/reopen affected return review where required; never overwrite historical artifacts.
5. Restart the worker and queue new versioned outputs.

## Failed import

Keep the import staged until every change has an explicit decision. If commit fails, preserve the batch and attempt history, correct the reported validation or stale-revision issue, and re-preview against the current revision. Use compensating rollback only when the API confirms no later revision depends on the import. Never delete import history to make a retry pass.

## Calculation defect

Disable the affected rule package/capability before further use. Record the engine/rule version and affected calculation-run IDs without tax values, correct the versioned rule implementation, run independent tax review and regression evidence, and reopen affected returns. Historical calculation snapshots and artifacts remain immutable.

## Suspected data exposure

Stop affected access paths, preserve logs and immutable audit evidence, revoke relevant sessions/credentials, and notify the assigned security owner. Do not investigate by copying source files or taxpayer values into unmanaged tools. Follow the firm’s approved incident-response and legal notification plan; the application repository does not supply those approvals.

## Recovery

Database and encrypted source-object backups must be restored as one coherent version set. A recovery exercise must verify a synthetic return’s original source checksum, import history, mappings, calculation input/result hashes, artifact hashes, and audit chain before service is reopened. The target is RPO at most one hour and RTO at most four hours, but no production backup provider or completed restore exercise is currently claimed.
