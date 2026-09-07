# Discovery capacity and rollout

## Verified findings

The supplied August 29–September 29 billing snapshot shows 10.282 GB of
uncached egress (5 GB quota) and 510.32 MB database size (500 MB quota). Its
grace period ends October 5, 2026. The grace period does not expand capacity.

The September 7 03:18 UTC operations audit found 4,727 pending enrichment
items, 78 dead, 55 legacy failed, 15 processing, 19 source retries, 13 failed
source tasks, and six superseded tasks. All six schedules were active, but
every sampled scheduled invocation failed before HTTP dispatch with missing
Vault configuration. Configure the exact Vault names in the ingestion runbook.

Production HTTP checks also found `/api/cron/discover/enrichment` returns 404
and `/api/cron/discover/status` returns the older response without scheduler or
enrichment fields. Applying the schema has not deployed the prior application
commits. Both the code deployment and Vault configuration are rollout blockers.

A read-only sample of five jobs per provider produced these JSON byte sizes:

| Provider | Whole rows | ID frontier | Previous proposed observed cache |
| --- | ---: | ---: | ---: |
| Greenhouse (Neuralink) | 122,872 | 156 | 52,451 |
| Workday (Unity) | 81,566 | 176 | 73,551 |
| Jibe (AMD) | 289,116 | 131 | 101,735 |

These are sample payload sizes, not a projection of the Supabase bill. The
final implementation additionally omits cached bodies for postings whose
provider response already includes a description. Workday still needs cached
bodies for list-only postings. A browser feed cache cannot reduce these worker
reads; the optimization belongs in the scanner itself.

## Deployment sequence

1. Apply `20260906040000_add_atomic_discovery_workspace.sql` before deploying
   the new workspace route. It adds a service-role-only function and changes no
   existing application data. A missing function returns a retryable 503.
2. Deploy the local application commits, including the enrichment client that
   understands `claimed_attempt` (it also supports the prior claim function).
3. Apply `20260906050000_count_interrupted_enrichment_attempts.sql`. It charges
   attempts on claim and terminalizes exhausted interrupted work. Do not edit
   the already applied September 6 migrations to install this behavior.
4. Apply `20260906060000_add_discovery_capacity_snapshot.sql` and run
   `npm run audit:discovery-capacity`. This returns physical relation sizes and
   estimated rows without reading every job description.
5. Verify Vault and run `npm run check:discovery-scheduler`, then compare
   `npm run audit:discovery-operations` across at least two hourly buckets.
6. Browser-test Matches paging, All roles and saved-location opt-in, followed
   companies, a catalog detail, and reopening an existing application. In a
   test account, start the same job twice; it must return one workspace. An
   employer closing the job must not remove the saved description or draft.

Production email delivery was not triggered manually during validation. Digest
policy tests verify that 25 eligible roles are all retained, that foreign,
closed, unfollowed and conflicting roles are excluded, and that notification
batch boundaries are never partially acknowledged. A complete durable delivery
outbox with frozen payloads/receipts remains a future change: HTTP delivery and
database acknowledgement cannot be made one atomic transaction by a lease.

## Operating within a budget

- Track daily **uncached** egress after deploying; 5 GB/month is roughly
  167 MB/day over 30 days. Target below that to leave room for auth, application
  work and operational checks. Do not confuse Supabase Storage cached egress
  with the application's in-memory cache.
- Inspect table, TOAST and index sizes before deleting anything. The capacity
  report's `tableBytes` includes table-associated storage; estimated row counts
  depend on Postgres statistics and are not exact counts.
- If operational history dominates, design bounded terminal-task retention
  after export/backup, while preserving unresolved failures. If catalog raw
  payload/HTML dominates, archive evidence outside the hot relational database
  and retain normalized text plus references. Neither policy runs automatically
  in this release, and no user records are deleted.
- A delete can free reusable space without shrinking the physical files.
  Do not run blocking `VACUUM FULL` as routine application maintenance.
- If the live catalog and user data still cannot fit after measured savings,
  use a capacity tier that fits or evaluate a Postgres-compatible host and
  object storage. Moving hosts preserves the same read amplification unless
  these query fixes ship first. No paid service is enabled by these commits.

## Local database verification

`scripts/test-discovery-postgres.ts` takes an isolated Unix socket directory
named `/private/tmp/applihero-db-test.*` on port 55439. It creates a fresh test
database, installs the real queue/workspace/capacity functions against a minimal
fixture schema, runs concurrent clients, then removes only that test database.
It refuses a production URL. Supabase-specific pg_net/Vault/cron extensions
still require live validation; they are not simulated as a passing HTTP test.

References: [Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
and [database size](https://supabase.com/docs/guides/platform/database-size).
