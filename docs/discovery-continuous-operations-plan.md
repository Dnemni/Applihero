# Discovery continuous-operations plan

## Product outcome

Discovery should behave like a quiet, durable personal job-search assistant:

- the complete company catalog is checked without a browser session or a user action;
- new and changed jobs become searchable once and remain available from the shared catalog;
- followed companies control personalized Matches and notifications, not catalog coverage;
- alerts are delivered once, according to the user's thresholds, with an auditable delivery state;
- opening a role leads to a user-owned workspace for deciding, preparing, and applying;
- provider, database, scheduler, and delivery failures remain visible and retryable without corrupting the catalog.

The application remains one Vercel deployment at `applihero.com`. Supabase owns
the durable state and clock. No second backend site or managed queue product is
needed for this phase.

## Review of the current failure modes

### The external clock is not dependable

GitHub Actions is a useful manual recovery runner, but its scheduled events can
be delayed or skipped. Running two schedules does not create an hourly
guarantee. Supabase already owns the queue, so its `pg_cron` clock should make
idempotent calls to the existing private application routes. GitHub Actions and
the daily Vercel Hobby cron remain fallback paths.

### A task lease does not reserve its source

Postgres prevents two workers from claiming the same task, but multiple hourly
tasks for one source can be claimed at once. The source-level lock catches the
collision only after an attempt was consumed. Workers need a durable source
lease before provider work; a collision should defer the task without using its
retry budget.

### Source failures do not identify the failing stage

The task currently records only the raw Supabase error. Database statement
timeouts therefore cannot be distinguished between catalog lookup, job upsert,
verification touch, recommendation write, alert write, and source completion.
Stage-labelled errors and failed scan telemetry are required before tuning
concurrency or indexes further.

### Enrichment has retry state but no terminal state

`failed` currently means both "retry later" and "permanently exhausted". The
claim RPC does not enforce an attempt ceiling, and known permanent responses
such as Workday 403 are retried. The queue also has thousands of rows but only a
12-row hourly consumer. Enrichment needs explicit `retry_wait` and `dead`
states, an attempt cap, user-value priority, time-bounded concurrent workers,
and its own frequent schedule.

### Rematching depends on the same sparse finalizer

User rotation is durable, but one 250-row batch per irregular workflow lets
stale scores accumulate. Rematching should remain write-behind and idempotent,
but run from frequent, bounded maintenance calls.

## Target control plane

1. Supabase `pg_cron` calls dispatch every five minutes. Dispatch remains
   idempotent per UTC hour and reconciles superseded tasks on every call.
2. Two staggered source-worker calls run every three minutes. Each call has a
   wall-clock budget below its schedule interval and acquires a source lease
   before invoking the existing adapter.
3. Two staggered enrichment-worker calls run every two minutes. They process
   only due rows below their attempt ceiling and stop on a time budget.
4. Maintenance runs every five minutes for digest delivery and rotating
   rematches. Each subsystem retains its own lease/idempotency boundary.
5. GitHub Actions remains manually runnable and provides a slower fallback. It
   is not treated as proof that an hourly trigger occurred.

Supabase Vault stores two values used by the database scheduler:
`discovery_cron_base_url` and `discovery_cron_secret`. Migrations never contain
the secret. If Vault is not configured, scheduled functions return a visible
configuration error without exposing credentials.

## Capacity and safety rules

- Source concurrency starts at two. Raising it requires a measured database
  timeout rate below one percent and no provider throttling regression.
- A source task keeps its queue lease and a matching source lease. A busy source
  is deferred for roughly one minute without increasing attempts.
- A successful source scan immediately reconciles all older task buckets for
  that source instead of waiting for the next dispatcher.
- Enrichment starts with four items per invocation and a 45-second budget. A
  permanent HTTP 4xx is terminal except 408 and 429. Network errors, 408, 429,
  and 5xx retry with exponential backoff.
- Enrichment jobs connected to followed sources are prioritized before the
  general catalog. Permanent failures never block newer due work.
- Rematching remains bounded and rotates through least-recently-processed users.
- Browser reads never invoke providers, score jobs, or write recommendations.

## Reviewable implementation commits

### Commit 1: Record the continuous-operations design

Add this decision document, deployment assumptions, capacity targets, and the
future product roadmap. No runtime behavior changes.

Verification: documentation review and clean diff.

### Commit 2: Give enrichment a finite lifecycle

Add an additive migration with `max_attempts`, `retry_wait`, `dead`,
`finished_at`, and `failure_kind`; migrate existing rows safely; make claiming
respect the attempt ceiling; reconcile rows whose jobs are already enriched or
closed; and expose exact enrichment counts.

Verification: migration-shape tests plus unit tests for retry/permanent error
classification.

### Commit 3: Drain enrichment by time and user value

Make enrichment processing concurrent but bounded, reject an empty hydration as
an unavailable detail rather than marking it complete, prioritize followed
sources, add a dedicated cron-protected enrichment route, and add wall-clock
budget tests.

Verification: deterministic worker tests, discovery suite, and TypeScript.

### Commit 4: Reserve a source before scanning it

Add source-lease acquisition/defer RPCs, pass a pre-acquired lease into
`syncSource`, avoid consuming an attempt on collisions, and reconcile sibling
hourly tasks immediately after success.

Verification: concurrent source-lease tests, lease-token guard tests, and queue
worker tests.

### Commit 5: Make source timeout failures actionable

Label every source-sync database stage, persist failed/skipped scan telemetry,
and include the stage in task results and operations summaries. Avoid redundant
source/job writes where the same scan has already made the row current.

Verification: stage-error unit tests and a mixed-source local run.

### Commit 6: Add the Supabase scheduler control plane

Install/configure `pg_cron`, `pg_net`, and Vault-backed invocation helpers in an
additive migration. Schedule dispatch, two source workers, two enrichment
workers, and maintenance at staggered intervals. Add a read-only scheduler
health RPC and an operator verification script. Missing Vault configuration
must fail closed.

Verification: SQL shape tests locally. Applying the migration and creating the
two Vault secrets is a production operator step.

### Commit 7: Make maintenance converge between hourly scans

Allow bounded finalizer/rematch parameters, run reconciliation in maintenance,
report remaining stale recommendations, and ensure overlapping calls preserve
digest idempotency.

Verification: rematch rotation, budget, and repeated-finalizer tests.

### Commit 8: Expand operational visibility and fallback behavior

Add enrichment lifecycle counts, scheduler heartbeat, superseded-task counts,
failure stages, and catalog/rematch freshness to the protected status response.
Adjust GitHub Actions to use two source lanes, invoke enrichment separately, and
act as an explicit fallback/manual drain.

Verification: status threshold tests and workflow inspection.

### Commit 9: Production runbook and end-to-end validation

Document Vault setup, scheduler activation/deactivation, secret rotation,
fallback recovery, backlog cleanup, and capacity tuning. Add a read-only health
check script. Run the discovery suite, TypeScript check, production build,
location equivalence check, authenticated browser regression, and a realistic
mixed-provider drain.

Production-only verification after applying migrations:

- scheduler heartbeat advances for at least two intervals;
- one source is never simultaneously scanned by two workers;
- obsolete IBM tasks reconcile after a newer success;
- enrichment pending depth decreases and permanent Workday 403 rows become
  `dead` rather than retrying;
- stale recommendation depth decreases on each maintenance interval;
- the Discover feed and detail workspace remain read-only and responsive.

## Product roadmap after operational closure

### Notification delivery

Promote notification candidates into a durable outbox with channel-specific
delivery attempts. Email is first; SMS can later consume the same event only
after explicit consent, quiet hours, verified phone ownership, and per-channel
frequency controls. Every provider delivery uses a stable idempotency key.

### Recommendation trust

Keep the deterministic stored score, evidence, blockers, unknowns, job version,
profile version, and matcher version together. Let the user dismiss, save,
correct, or mark a recommendation useful so ranking can improve without taking
away the user's decision.

### Application workspace

Each saved role should open a durable workspace containing the frozen job
snapshot, fit evidence, questions, resume variants, company research, interview
notes, deadlines, and a user-controlled application status. AppliHero prepares
and coaches; it does not submit without an explicit user action.

### Long-term operating objective

Measure scheduler lag, queue age, source success, catalog freshness,
enrichment coverage, match freshness, alert delivery latency, open/click/save
rates, and application outcomes. "Running forever" means failures become
bounded queue states with recovery instructions—not that failures never occur.
