# Discovery ingestion

AppliHero's discovery page reads only from Supabase. Career sites are scanned in
the background; no provider request is made while a user loads or filters the
page.

## Pipeline

1. The existing scheduler calls `GET /api/cron/discover` with `CRON_SECRET`.
2. Due, followed `job_sources` are claimed with a per-source database lease.
3. A provider adapter performs a `bootstrap`, `incremental`, or `reconcile` scan.
4. The newest bounded listing window is normalized and upserted by
   `(source_id, source_job_id)`.
5. Existing descriptions are reused. New Workday/Oracle detail pages are
   hydrated in a small inline batch; the remainder enter
   `discovery_enrichment_queue`.
6. The enrichment worker claims queue rows with `FOR UPDATE SKIP LOCKED`, retries
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

The migration is
`supabase/migrations/20260825000000_add_discovery_ingestion_pipeline.sql`. It adds
observation timestamps, publication provenance, verification and scan state,
source leases, scan telemetry, and the enrichment queue/RPC. Existing jobs are
marked as bootstrap observations so deployment does not send false alerts.

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

## Rollout and operating checks

- Start with the existing followed sources and watch `discovery_scan_runs` for
  duration, board totals, page counts, warnings, and failures.
- Alert when a healthy source has no successful scan for six hours or reaches
  five consecutive failures.
- Keep full-feed closing conservative until two authoritative reconciliations
  agree a job disappeared. Bounded Workday/Eightfold scans must never close jobs
  solely because they fell outside the newest window.
- Increase provider concurrency only from observed rate-limit and latency data.
- Rediscover/verify a cached board after seven days or repeated failures; do not
  rediscover every scheduled scan.
