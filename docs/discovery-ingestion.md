# Discovery ingestion

AppliHero's discovery page reads only from Supabase. Career sites are scanned in
the background; no provider request is made while a user loads or filters the
page.

## Pipeline

1. GitHub Actions calls `GET /api/cron/discover/dispatch` with `CRON_SECRET`.
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
6. The independent finalizer calls the enrichment worker, which claims queue rows with `FOR UPDATE SKIP LOCKED`, retries
   failures with exponential backoff, parses requirements deterministically, and
   updates the canonical `discovery_jobs` row.
7. Enriched jobs enter the existing per-user eligibility/matching flow. A source
   bootstrap seeds the catalog without generating a burst of new-job alerts.

`source_published_at` is the provider's date. `first_seen_at` is the exact time
AppliHero first observed a stable provider job ID and is the notification clock.

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
`supabase/migrations/20260825000000_add_discovery_ingestion_pipeline.sql` and
`supabase/migrations/20260827000000_add_discovery_ingestion_task_queue.sql`.
Together they add observation timestamps, source telemetry, detail enrichment,
and the durable hourly task queue. Existing jobs are marked as bootstrap
observations so deployment does not send false alerts.

## Verification

```bash
npm run test:discovery
npx tsc --noEmit
npm run build
```

The deterministic connector tests cover Workday's accepted 20-row request size,
Eightfold camelCase normalization and warm frontier, Workable details, and known
branded URL routing. Live smoke tests should run separately on a schedule because
provider throttling would make them unsuitable as required pull-request tests.

## Vercel and Supabase setup

No separate backend deployment is needed. The queue lives in Supabase and the
private worker HTTP handlers are regular Vercel routes under the same
`applihero.com` deployment:

1. Apply `20260827000000_add_discovery_ingestion_task_queue.sql` to the same
   Supabase project used by the production site.
2. In Vercel, set `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
   one high-entropy `CRON_SECRET` for Production and Preview as appropriate.
   Do not expose `CRON_SECRET` in `NEXT_PUBLIC_*` variables.
3. In GitHub, set `DISCOVERY_CRON_SECRET` to the exact same value. The workflow
   calls `https://www.applihero.com/api/cron/discover/dispatch`, then its worker
   pool and finalizer. GitHub Actions is the hourly scheduler; Vercel does not
   need a public cron configuration for this flow.
4. Push and deploy `.github/workflows/discovery-sync.yml` together with the
   application changes, then run the workflow manually once. Confirm
   `/api/cron/discover/status` reports queued work decreasing and successful
   tasks increasing.

The endpoints are intentionally hidden service routes, not a second backend
site: `/api/cron/discover/{dispatch,worker,finalize,status}`. They reject all
requests without `Authorization: Bearer <CRON_SECRET>`.

## Rollout and operating checks

- Use `GET /api/cron/discover/status` with `CRON_SECRET` to view task states,
  oldest queued age, recent provider failures, and least-fresh enabled sources.
- `POST /api/cron/discover/status` with `{ "taskId": "..." }` safely retries a
  failed task. The next worker claims it normally.
- Start with the existing catalog and watch `discovery_scan_runs` for duration,
  board totals, page counts, warnings, and failures.
- Alert when a healthy source has no successful scan for six hours or reaches
  five consecutive failures.
- Keep full-feed closing conservative until two authoritative reconciliations
  agree a job disappeared. Bounded Workday/Eightfold scans must never close jobs
  solely because they fell outside the newest window.
- Increase provider concurrency only from observed rate-limit and latency data.
- Rediscover/verify a cached board after seven days or repeated failures; do not
  rediscover every scheduled scan.
