# Discovery feed read path

This document records the September 2026 diagnostic of the Discover page, the
architecture that came out of it, and the measurements taken before and after.
It complements `discovery-ingestion.md`, which covers the hourly catalog queue.

## 1. Architecture overview (as found)

### Ingestion

- `GET /api/cron/discover/dispatch` inserts one idempotent task per enabled
  `job_sources` row for the current UTC hour. Workers claim tasks with
  `FOR UPDATE SKIP LOCKED`, call `syncSource(source, { catalogOnly: true })`,
  and upsert the newest bounded window of postings by `(source_id, source_job_id)`.
- Every enabled source is scanned whether or not anyone follows it. The catalog
  held 29,763 open rows across 96 of 133 enabled sources at diagnosis time.
- Detail hydration for list-only providers runs through
  `discovery_enrichment_queue`; the finalizer also sends digests.

### Matching

- `syncSource` evaluates the scanned window for every *subscriber* of that
  source: it builds the applicant background (profile text plus reuse-approved
  answers), runs `buildQuickFit` and the eligibility gate, and upserts
  `user_job_recommendations` rows with `fit_score`, `fit_band`,
  `eligibility_status`, and the full `quick_fit` JSON (which embeds
  `matcherVersion`, `evaluatedProfileHash`, `evaluatedJobHash`).
- Incremental catalog scans only evaluate new or changed postings; bootstrap and
  daily reconcile scans evaluate the whole window.
- The detail page (`/api/discover/[id]`) and the answers endpoint also rewrite a
  single row's fit on demand.

### Feed reads (before this work)

- `GET /api/discover` fanned out to eleven Supabase queries per request, then
  rebuilt fit for any row whose stored hashes did not match, and wrote every
  "changed" row back inside the GET.
- Matches loaded every qualifying recommendation id, fetched job metadata in
  100-id chunks, sorted in memory, fetched full job rows (including
  `parsed_requirements`) for `limit * 3` ids, sliced to `limit`, and reported the
  visible count as `totalResults`.
- All roles selected `*` (descriptions, raw payloads, parsed requirements) with
  an exact count, then applied the saved location filter *after* the limit.

### Filters

- `lib/discovery/location.ts` implements the strict country / region / remote
  rules. It ran in application memory after the database limit, so it changed
  how many rows came back rather than which rows were selected.
- Keyword search used `description ILIKE '%term%'` over 30k rows.

### Client caching

- `discoveryFetch` used `cache: "default"` and the route returned
  `Cache-Control: private, max-age=20, stale-while-revalidate=60`. Chrome does
  cache such responses keyed by URL only, so a different signed-in user on the
  same browser profile could briefly see a cached feed. There was no in-memory
  cache or request deduplication.

### Notifications and manual rescans

- Following a source controls alerts (`discovery_alert_candidates`,
  `discovery_notifications`, digests) and permits a bounded manual rescan via
  `POST /api/discover/sync` (max six sources per call). "Save and refresh
  matches" in the preferences panel triggered a rescan of *every* followed
  company (56 sources in batches of six) purely to refresh scores.

## 2. Measured diagnosis

Measurements were taken against the production Supabase project from a
developer machine (roughly 120–350 ms per round trip), and against a local
`next dev` server. Scripts: `scripts/diagnose-discovery-read-path.ts` and
`scripts/measure-discovery-requests.ts`.

### Baseline request timings (dev server, second round)

| Request | ms | bytes | jobs returned | totalResults |
| --- | --- | --- | --- | --- |
| Matches, limit 50 | 2,749 | 93,641 | 50 | 50 |
| Matches, limit 100 | 2,522 | 188,080 | 100 | 100 |
| All roles, limit 50 | 2,014 | 126,997 | 7 | 29,763 |
| All roles, limit 100 | 2,442 | 522,490 | 32 | 29,763 |
| All roles, query=engineer | 9,259 | 31 | HTTP 500 | statement timeout |
| Sources | 2,441 | 78,403 | 133 sources | |

### Root causes

1. **Profile hash was order dependent.** `answersToMatchingContext` serialized
   answers in the order the query returned them. The sync worker read answers
   without `ORDER BY`; the GET route ordered by `provided_at DESC`. The same
   profile therefore produced two different hashes, so the route considered
   every synced row stale, recomputed fit for `limit * 3` rows (about 18 ms per
   row, 2.7 s for 150), and wrote all of them back. The next scan rewrote them
   with the worker's hash. Six distinct `evaluatedProfileHash` values existed
   across this user's 343 qualifying rows.
2. **JSONB comparison was always unequal.** Postgres reorders JSONB keys, so
   `JSON.stringify(stored) !== JSON.stringify(fresh)` was true for every row
   even when nothing changed. Both the sync worker's "changed rows" filter and
   the route's write-back filter were therefore ineffective: 150 UPDATEs per GET.
3. **Matches pagination reported the visible slice as the total.** 204 rows
   qualified for this user but the UI could never see past the first 50.
4. **All roles applied location after the limit.** Only 7 of the newest 50
   catalog rows are US roles, so a 50-row request produced 7 cards while the
   header reported 29,763 results. The observed 42 came from a larger limit.
5. **Keyword search scanned descriptions.** `description ILIKE` over 30k rows
   exceeds the statement timeout (8–9 s) and returned HTTP 500.
6. **`select *` for list cards.** 50 catalog rows weighed 859 KB with
   descriptions and raw payloads versus 39 KB with a card projection.
7. **Companion request cost.** `/api/discover/sources` fetched 120 jobs with
   `parsed_requirements` (492 KB) and ran `buildQuickFit` on each (about 2 s
   CPU) on every page load to rank unfollowed companies.
8. **Vercel plan.** The project is on the Hobby plan. Hobby permits daily cron
   schedules only; `0 * * * *` fails deployment with "Hobby accounts are limited
   to daily cron jobs". The six hourly entries added in `vercel.json` would have
   blocked every production deploy. Fluid compute is enabled with a 300 s default
   timeout, so the worker routes' `maxDuration = 300` is acceptable.

### Recommendation health for the diagnosed user

| Measure | Count |
| --- | --- |
| Recommendation rows | 12,015 |
| Active rows | 7,791 |
| Active rows with `likely_conflict` band | 7,423 |
| Active rows from followed sources with score > 50 and no conflict | 343 |
| …whose job is open and published within 30 days | 257 |
| …that also pass the saved US country preference | 204 |
| Active rows with a stale profile hash | 7,641 |

No row had a stale matcher version and no row had a job-hash mismatch. All
staleness came from the ordering bug above.

## 3. Target architecture

**Scores are database artifacts.** The GET route reads `fit_score`,
`fit_band`, `eligibility_status`, and `quick_fit` and never calls the matcher.
It reports how many visible rows are stale (`staleMatches`) so the client can
request a bounded refresh.

**Deterministic inputs.** Answers are sorted by `question_key` before hashing,
and JSON comparisons use a canonical, key-sorted serializer
(`lib/discovery/fit-cache.ts`). The worker and the route now agree on what
"current" means, and unchanged rows are not rewritten.

**Rematch outside the request.** `lib/discovery/rematch.ts` recomputes stale
rows in bounded batches. It runs from the hourly finalizer for every
subscriber, and a user can trigger it for their own rows via
`POST /api/discover/rematch` after changing preferences or answers. Saving
preferences no longer rescans 56 companies.

**One indexed query for Matches.** `getUserMatchCandidates` inner-joins
`user_job_recommendations` to `discovery_jobs` with the score, band,
eligibility, source, status, freshness, company, and workplace predicates pushed
to Postgres, ordered by `discovery_jobs.source_published_at DESC NULLS LAST`.
It returns narrow rows (id, published, location, workplace) for the whole
qualifying set (a few hundred rows, capped at 3,000), applies the strict
location rule in memory, and hydrates only the requested page of cards. Totals
are exact and every match is reachable through `offset` paging.

**Lightweight catalog pages.** `getCatalogDiscoveryJobPage` selects the card
projection only, orders by `source_published_at DESC NULLS LAST, id`, uses an
exact count (about 70 ms extra at 30k rows), and searches title and company
only. Location is filtered in the database using the normalized
`location_countries` / `location_remote` columns written at ingestion. Until
that migration is applied the route falls back to filtering a bounded window in
memory and marks the total as an estimate.

**Explicit location policy.** Multi-location strings pass if any listed place
satisfies the scope. Blank or unrecognized locations fail country and region
scope and pass worldwide scope. Remote roles follow the include-remote flag
regardless of scope. Roles with no `source_published_at` sort last and are
excluded by any freshness filter.

**Bounded client cache.** `lib/discovery/feed-cache.ts` keeps up to 40 feed
pages for 60 seconds keyed by user, scope, filters, freshness, and offset, and
deduplicates in-flight requests. It is invalidated on follow, unfollow,
preference save, rescan, and rematch. HTTP responses are `no-store`.

**Deferred companion data.** The sources request no longer scores 120 jobs on
page load. Company recommendations load only when the Companies panel opens.

## 4. Implementation plan

1. Diagnostics and Server-Timing instrumentation.
2. Deterministic fit hashes and canonical comparisons.
3. Card-ready Matches query with full pagination; remove request-time scoring
   and writes from the GET route.
4. Asynchronous rematch (finalizer step and bounded user endpoint).
5. Normalized location columns, catalog-wide filters, and paged All roles.
6. Bounded client cache and request deduplication.
7. Deferred company recommendations.
8. Progressive Matches loading and stale indicators in the UI.
9. Browser and API regression coverage.
10. Hobby-safe scheduling and documentation.

## 5. After measurements

See the "Validation" section at the end of this file once the changes land.
