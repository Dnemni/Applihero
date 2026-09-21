# Discovery R2 content migration

## Scope

R2 stores private, large discovery-job content (`description`, HTML and raw
provider data). Supabase remains the searchable catalog, user-data store, and
durable queue. Job cards never read R2 and browser clients never receive an R2
credential or object URL.

This is deliberately a staged migration:

1. Apply `20260921000000_add_discovery_r2_content_refs.sql`.
2. Configure R2 credentials and deploy. New scans and enrichments dual-write
   content to R2 while preserving the present Supabase columns.
3. Run the verified backfill after a successful canary scan.
4. Make R2 canonical only after every retained body has a matching object hash.
5. Prune Supabase HTML/raw bodies under a separately reviewed retention policy.

Do not prune content in the same release that enables R2 writes.

## Cloudflare setup

1. Activate the R2 subscription. The account receives 10 GB-month, 1 million
   writes and 10 million reads of Standard storage per month before usage fees.
2. Create a **private** bucket named `applihero-discovery-content`. Do not add
   a public custom domain.
3. Create an **Account API token** restricted to that bucket only:
   - R2 permission: **Object Read & Write**.
   - Scope: the `applihero-discovery-content` bucket only (not every bucket).
   - Keep the generated access-key ID and secret together; the secret is shown
     once and must never be committed.
4. Add these Production, Preview, and Development variables in Vercel:

   ```text
   CLOUDFLARE_R2_ACCOUNT_ID=<Cloudflare account ID>
   CLOUDFLARE_R2_ACCESS_KEY_ID=<R2 access key ID>
   CLOUDFLARE_R2_SECRET_ACCESS_KEY=<R2 secret access key>
   CLOUDFLARE_R2_DISCOVERY_BUCKET=applihero-discovery-content
   ```

5. Copy the same variables to `.env.local`. Keep `.env.local` untracked.
6. Run `npm run check:discovery-r2` locally. It writes, reads, and removes one
   isolated health-check object; it never reads or changes a job.
7. Deploy application code only after step 1's Supabase migration is applied.

## Validation before a content backfill

- Trigger one bounded source scan.
- Confirm a changed job has `content_storage = 'r2'`, an object key in
  `content_ref`, a byte count, and unchanged feed cards.
- Open that job's detail route. It must render content server-side from R2.
- Temporarily remove R2 credentials locally and confirm the detail still uses
  the Supabase dual-write fallback.
- Compare the R2 object's SHA/content hash with `discovery_jobs.content_hash`.

## Copying existing content

The copy is intentionally an independent, resumable operation; it does not
delete or null any Supabase content. It reads the older large rows exactly once
and therefore should be run during the current grace period, not as part of an
hourly job.

1. Run `npm run backfill:discovery-r2-content -- --dry-run`. This is a
   metadata-only count and does not download descriptions or raw payloads.
2. After reviewing the count, run
   `npm run backfill:discovery-r2-content -- --batch 25 --concurrency 4`.
   It stops on the first failure and is safe to re-run: completed rows have
   `content_storage = 'r2'` and are skipped.
3. Query the remaining `content_storage = 'supabase'` count. It must reach
   zero before a future retention change is even considered.
4. Keep the dual-write deployment in place for at least one normal scan cycle
   and check several detail pages before planning column pruning.

## Capacity safety rules

- R2 is for object bodies, never catalog filtering or queue state.
- Keep raw provider data private and do not return it from public APIs.
- Use versioned object keys (`job id/content hash`) so a provider edit is
  immutable and retries are idempotent.
- A later lifecycle rule may remove unreferenced raw artifacts; application
  workspaces retain their own immutable job snapshot first.
