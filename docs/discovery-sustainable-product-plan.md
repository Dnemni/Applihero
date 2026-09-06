# Sustainable discovery and application continuity

## Evidence and limits (September 6, 2026)

The supplied usage snapshot shows 10.282 GB uncached egress against 5 GB and
510.32 MB database size against 500 MB. The stated grace period ends October 5.
It is not a free capacity increase. Avoid bulk production reads while diagnosing.

The first live operations audit found 4,831 pending enrichment rows, 78 dead,
15 processing, 25 source retries, three failed tasks, and six superseded tasks.
All six database schedules exist, but Vault configuration is incomplete and the
latest invocation reports a configuration error. No healthy clock is proven yet.

The source scanner reads up to 2,000 complete job rows before a provider scan,
although its current scan window is 100. Large descriptions, HTML, and raw
provider payloads therefore cross the database boundary unnecessarily. This is
a code-supported contributor, not a measured attribution of all billed egress.

Digest delivery currently marks every notification emailed after sending only
ten jobs, and does not recheck saved geography or current follows. Application
workspace creation uses a read-then-insert race and checks closure before looking
for an already saved workspace.

## Reviewable implementation sequence

1. **Plan and baseline.** Record evidence, rollout gates, and this sequence.
2. **Bound scanner egress.** Fetch IDs for the provider frontier; after fetching
   the provider, load only the bounded observed job IDs and fields needed for
   cache reuse. Exclude raw provider payloads from cache reads. Preserve parsing,
   content comparison, bootstrap flags, and all current provider behavior.
3. **Make digests honest.** Recheck current follows, score, eligibility, open
   status and saved geography. Send every eligible job in the selected bounded
   notification batch, retain stable idempotency keys, isolate failures per
   user, and check acknowledgement errors. Unit tests must prove more than ten
   eligible jobs are not silently consumed and foreign/unfollowed jobs excluded.
4. **Preserve application continuity.** Serialize creation per user/posting in
   Postgres, return the existing workspace even after closure, preserve the
   saved role snapshot, and keep submission under user control. Use additive
   migration without deleting duplicate historical workspaces.
5. **Measure capacity and define retention.** Add a service-role-only aggregate
   database footprint RPC and a read-only command. Report physical table/index
   sizes without downloading catalog bodies. Document retention/backup options
   and deployment acceptance; do not delete jobs, answers, applications or raw
   evidence without a reviewed retention policy and recoverable backup.

## Acceptance and rollout

Run discovery tests and TypeScript after functional commits, then a production
build. Exercise production health without manually sending emails. Browser test
the authenticated feed and workspace when an existing session is available;
report authentication/deployment blockers precisely. New code stays local until
reviewed. Apply new migrations only with the associated deployed routes ready.

Observe two hourly buckets with successful authenticated scheduler calls,
declining due-work age, no unacknowledged worker failures, and measured bytes
per representative scan before declaring the system operationally complete.

## Product and capacity direction

Keep Supabase for authentication, user preferences, durable tasks and relational
catalog queries. Fix repeat reads before adding infrastructure. Browser caching
already bounds feed pages and deduplicates loads; it does not cache worker DB
reads or turn database traffic into Supabase Storage cached egress.

Retain job text required by matches and saved applications. Measure whether raw
payloads/HTML, indexes, or operational history dominate disk before choosing
compression, external object storage, or terminal-task retention. Deleting rows
does not guarantee immediate physical file shrinkage. A paid capacity tier is a
possible operational choice, not something this implementation purchases.

Next product stages after these fixes: a durable per-delivery outbox with
provider receipts and explicit ambiguous-delivery recovery; role-type controls
shared by feed/email; saved/reviewed/dismissed inbox actions; workspace coaching
based on the saved role and user-approved facts. Add SMS only with consent and
unsubscribe controls. Neither coaching nor notifications submit applications.
