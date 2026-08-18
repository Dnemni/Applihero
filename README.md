# Applihero
A web app that uses a personalized RAG model on a user’s resume/background to coach them through job applications. The app lets users upload resumes and create job-specific “sessions”. For each application, Applihero provides unique advice, generates survey answers and cover letters, and includes a simple feedback module (ratings + comments).

Check it out here: https://www.applihero.com/

## Job discovery setup

Discover uses a shared source catalog: a company board is fetched once, hard
eligibility filters run before description parsing, and only a small ranked
shortlist is stored for each user who follows that company.

1. Apply `lib/supabase/migrations/20260717_add_job_discovery.sql`.
2. Apply `lib/supabase/migrations/20260812_add_company_monitoring.sql`.
3. Apply `lib/supabase/migrations/20260813_repair_company_sources_and_add_ibm.sql`.
4. Apply `lib/supabase/migrations/20260814_add_personalized_job_recommendations.sql`.
5. Apply `lib/supabase/migrations/20260818_add_discovery_answers_and_digest_preferences.sql`.
6. Apply `lib/supabase/migrations/20260818_seed_verified_company_catalog.sql`.
7. Set a random `CRON_SECRET` with at least 16 characters.
8. Optionally set `RESEND_API_KEY` and `DISCOVERY_EMAIL_FROM` for email alerts.

The source connectors support Greenhouse, Lever, Ashby, IBM Careers, Oracle Recruiting Cloud, and public career pages
that expose schema.org `JobPosting` JSON-LD. Each connector must return
normalized jobs or throw a visible source error; failed requests never masquerade
as an empty board. Jobs are deduplicated by source and provider job ID.

`vercel.json` invokes `GET /api/cron/discover` every 15 minutes. The endpoint
requires `Authorization: Bearer $CRON_SECRET`, scans only followed due sources,
uses exponential backoff for failures, and sends due email digests. Users can
choose a 15-minute, hourly, 6-hour, daily, or weekly digest. Unfollowed catalog
entries are metadata only and do not create network or storage work. In-app
alerts work without an email provider.

User application state remains in `jobs` and links back to the shared catalog
through `jobs.discovery_job_id`.
