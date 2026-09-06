# Discovery ingestion

AppliHero's discovery page reads only from Supabase. Career sites are scanned in
the background; no provider request is made while a user loads or filters the
page.

## Pipeline

1. Supabase Cron calls `GET /api/cron/discover/dispatch` every five minutes with
   the Vault-held `CRON_SECRET`. Hourly bucket idempotency makes the repeated
   check cheap while preventing a skipped external scheduler event.
2. The dispatcher inserts one idempotent task per enabled `job_sources` row in
   `discovery_ingestion_tasks` for the current UTC hour.
3. Several short `GET /api/cron/discover/worker` invocations atomically claim
   one to three tasks using `FOR UPDATE SKIP LOCKED` and a four-minute lease.
4. A provider adapter performs a `bootstrap`, `incremental`, or `reconcile` scan.
4. The newest bounded listing window is normalized and upserted by
   `(source_id, source_job_id)`.
5. Existing descriptions are reused. New Workday/Oracle detail pages are
   hydrated in a small inline batch; the remainder enter
   `discovery_enrichment_queue`.
6. Dedicated enrichment workers claim queue rows with `FOR UPDATE SKIP LOCKED`,
   recover expired processing leases, retry transient failures with exponential
   backoff, terminalize permanent failures, parse requirements deterministically,
   and update the canonical `discovery_jobs` row.
7. Enriched jobs enter the existing per-user eligibility/matching flow. A source
   bootstrap seeds the catalog without generating a burst of new-job alerts.
8. The finalizer also runs the bounded rematch step
   (`lib/discovery/rematch.ts`): stored fit rows whose profile hash, matcher
   version, or posting hash is stale are recomputed, highest stored score
   first, within a time budget. The Discover page never recomputes scores; it
   reads stored rows and can request `POST /api/discover/rematch` for the
   signed-in user. See `discovery-feed-read-path.md`.

Every persisted posting also carries normalized geography
(`location_countries`, `location_remote`) computed by
`lib/discovery/location.ts` so the shared catalog can be filtered and paged by
the saved location preference inside Postgres.

`source_published_at` is the provider's date. `first_seen_at` is the exact time
AppliHero first observed a stable provider job ID and is the notification clock.

The shared catalog is independent of individual follows: every enabled company
is scanned, and Discover searches that catalog. Following a company controls
email/in-app alerts, Matches membership, and permission to request a direct,
bounded rescan. Following seeds up to 100 current catalog roles for that user;
it never calls a provider or limits All roles catalog search results.

## Provider behavior

| Provider | Discovery behavior | Detail behavior |
| --- | --- | --- |
| Greenhouse | Complete public board feed | Included in feed |
| Ashby | Complete public posting feed | Included in feed |
| Lever | Complete public posting feed | Included in feed |
| Workable | Complete public account feed | Included with `details=true` |
| Workday | Newest 100; 20-row pages; warm frontier; daily reconcile | Retryable detail queue |
| Eightfold/PCS | Newest 100; timestamp frontier for warm scans | Listing payload when available |
| iCIMS/Jibe | First-party `/api/jobs`, newest 100 | Included in feed |
| IBM, Amazon, Oracle | Existing provider-specific public endpoints | Oracle uses detail queue |
| Generic career page | Strict same-site schema.org fallback | Fail closed if no postings exist |

Workday CXS and Eightfold PCS are public candidate-site endpoints, not stable
vendor-supported integration APIs. Their adapters are isolated, bounded, tested,
and observable so a vendor change fails one source rather than the whole scan.

For a company that is not already cataloged, AppliHero first checks inexpensive
ATS-name candidates. It then uses Parallel Search to locate first-party careers
pages, fetches those pages itself, detects the provider, and accepts the result
only when the host matches the company and the provider returns a non-empty
board. Search results are discovery hints, never trusted ingestion data.

## Database migration

Apply:

```bash
npx supabase db push
```

The migrations are
`supabase/migrations/20260825000000_add_discovery_ingestion_pipeline.sql`,
`supabase/migrations/20260827000000_add_discovery_ingestion_task_queue.sql`,
`supabase/migrations/20260902000000_harden_discovery_queue_operations.sql`, and
`supabase/migrations/20260904000000_add_discovery_location_columns.sql`, and
`supabase/migrations/20260905000000_add_discovery_rematch_cursor.sql`,
`supabase/migrations/20260906000000_harden_discovery_enrichment_queue.sql`,
`supabase/migrations/20260906010000_add_discovery_source_task_leases.sql`,
`supabase/migrations/20260906020000_add_discovery_scheduler.sql`, and
`supabase/migrations/20260906030000_add_discovery_operations_snapshot.sql`.
Together they add observation timestamps, source telemetry, detail enrichment,
the durable hourly task queue, stale-task reconciliation, and normalized
geography with the indexes the feed queries use. The rematch cursor makes a
bounded finalizer visit the least-recently refreshed users first. Existing jobs
are marked as bootstrap observations so deployment does not send false alerts.

After applying the 20260904 migration, populate geography for existing rows:

```bash
npm run backfill:discovery-locations -- --dry-run
npm run backfill:discovery-locations
npm run verify:discovery-location-filter
```

The verifier compares the database predicate with the application classifier
on the same 1,000 real open jobs for five location policies. Do not rely on the
database path until every fixture reports zero disagreements.

Until the migration is applied the feed keeps working: it filters a bounded
window in memory and marks catalog totals as estimates.

## Verification

```bash
npm run test:discovery
npx tsc --noEmit
npm run build
npm run diagnose:discovery-read-path -- --email you@example.com
npm run measure:discovery-requests -- --email you@example.com --base http://localhost:3000
npx tsx scripts/browser-discovery-check.ts --email you@example.com --base http://localhost:3000
```

The last three profile the feed against real data: per-query database timings,
end-to-end request timings with `Server-Timing` breakdowns, and a headless
Chrome pass over the Discover page. They mint a short-lived session for the
given account with the service role key and never print it.

The deterministic connector tests cover Workday's accepted 20-row request size,
Eightfold camelCase normalization and warm frontier, Workable details, and known
branded URL routing. Live smoke tests should run separately on a schedule because
provider throttling would make them unsuitable as required pull-request tests.

## Vercel and Supabase setup

No separate backend deployment is needed. The queue lives in Supabase and the
private worker HTTP handlers are regular Vercel routes under the same
`applihero.com` deployment:

1. In Vercel, set `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
   one high-entropy `CRON_SECRET` for Production and Preview as appropriate.
   Do not expose `CRON_SECRET` in `NEXT_PUBLIC_*` variables.
2. Deploy the application routes. Code tolerates the new RPCs being unavailable
   during this rolling-deployment window.
3. In Supabase Vault, create `discovery_cron_base_url` with the value
   `https://www.applihero.com`, and create `discovery_cron_secret` with the exact
   Vercel `CRON_SECRET`. Never paste the service-role key into Vault for this.
4. Apply all migrations through `20260906030000`. Supabase enables `pg_cron`,
   `pg_net`, and Vault, and installs six staggered jobs. A missing Vault value
   records a configuration error instead of making an unauthenticated call.
5. In GitHub, set `DISCOVERY_CRON_SECRET` to the same value. GitHub is a
   three-hour fallback and manual recovery runner, not the primary clock.
6. The project is on Vercel's Hobby plan, which only permits cron schedules
   that run once per day; hourly expressions fail deployment with "Hobby
   accounts are limited to daily cron jobs". `vercel.json` therefore retains a
   single daily dispatch as a final safety net. All private handlers remain in
   the same `applihero.com` deployment.
7. Run `npm run check:discovery-scheduler`, wait five minutes, then run
   `npm run audit:discovery-operations`. Confirm recent scheduler calls are 2xx,
   queue age is falling, and no source has two live scans.

The endpoints are intentionally hidden service routes, not a second backend
site: `/api/cron/discover/{dispatch,worker,enrichment,finalize,status}`. They reject all
requests without `Authorization: Bearer <CRON_SECRET>`.

### Scheduler cadence

- minute `0` of each five-minute cycle: idempotent dispatch/maintenance;
- minutes `1` and `2`: two source lanes, each bounded to 100 seconds;
- minutes `4` and `0`: two 45-second enrichment calls, outside source writes;
- every five minutes: digest/rematch maintenance and queue reconciliation.

The request ledger and `net._http_response` are summarized by
`get_discovery_scheduler_health`. Invocation audit rows are retained for seven
days. Supabase documents `pg_cron` + `pg_net` + Vault as its supported pattern
for authenticated scheduled HTTP calls.

### Rotate the cron secret without losing work

1. Generate a new random secret of at least 32 bytes.
2. In Vercel, set `CRON_SECRET_PREVIOUS` to the current secret and replace
   `CRON_SECRET` with the new secret; redeploy production.
3. Update `discovery_cron_secret` in Supabase Vault with `vault.update_secret`,
   then replace GitHub's `DISCOVERY_CRON_SECRET` with the new value.
4. Run the scheduler check and confirm new requests are 2xx.
5. Remove `CRON_SECRET_PREVIOUS` from Vercel and redeploy.

Only the dedicated cron secret is rotated here. Supabase service-role and user
session tokens are not scheduler credentials and should never be copied into a
cron header.

### Pause and recover

Pause the six `applihero-discovery-*` jobs from Supabase Cron when provider or
database pressure requires it; durable queue rows remain intact. Resume the
jobs, run dispatch once, and use the GitHub workflow manually to add bounded
drain capacity. Do not delete task or enrichment rows to clear an alert.

## Rollout and operating checks

- Use `GET /api/cron/discover/status` with `CRON_SECRET` to view task states,
  oldest queued age, scheduler heartbeat, enrichment lifecycle/dead-letter
  counts, rematch freshness, recent provider failure stages, and least-fresh
  enabled sources.
- `POST /api/cron/discover/status` with `{ "taskId": "..." }` safely retries a
  failed task. The next worker claims it normally.
- Start with the existing catalog and watch `discovery_scan_runs` for duration,
  board totals, page counts, warnings, and failures.
- Alert when queue work is older than 90 minutes, a healthy source has no
  successful scan for six hours, a task reaches final failure, or a source
  reaches five consecutive failures. `GET /api/cron/discover/status` returns
  these conditions in its `alerts` field along with the configured thresholds.
- A later successful scan automatically reconciles obsolete queued/retry/failed
  task rows for that source. The audit row remains, marked `reconciled`, so a
  transient timeout cannot leave operations permanently red after recovery.
- Keep full-feed closing conservative until two authoritative reconciliations
  agree a job disappeared. Bounded Workday/Eightfold scans must never close jobs
  solely because they fell outside the newest window.
- Increase provider concurrency only from observed rate-limit and latency data.

## Catalog bootstrap and reconciliation

When a company source is first added, its first scan is a bootstrap: provider
job IDs are persisted with `first_seen_at`. Later hourly scans upsert against
that same `(source_id, source_job_id)` identity, so new postings add to the
cache instead of replacing it. Daily provider-appropriate reconciliation repairs
frontier/pagination drift.

Public career boards normally expose only open postings. A backfill can ingest
every currently visible role with a source publication date in the last year;
it cannot reconstruct roles an employer has already removed from its public
board. Run the catalog backfill only after the migration and deployment are
live, at bounded concurrency, and verify queue age/failures between batches.
- Rediscover/verify a cached board after seven days or repeated failures; do not
  rediscover every scheduled scan.
