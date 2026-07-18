# Job discovery ingestion and storage plan

## Recommendation

Keep Greenhouse, but treat it as the first provider adapter rather than the whole discovery strategy.

The best source order is:

1. Public ATS APIs and feeds: Greenhouse, Lever, and Ashby.
2. Structured `JobPosting` JSON-LD on an employer's canonical job-detail page.
3. Provider-specific adapters for ATS products without a simple public feed.
4. A respectful generic career-page parser only when structured sources are unavailable.

This order favors official, current employer data without making every company page a custom scraping project. Greenhouse GET endpoints are public, Lever exposes published postings as JSON, and Ashby has a public job-posting endpoint. Google also documents `JobPosting` structured data as the standard representation on canonical job-detail pages.

Primary references:

- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Google JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting)

## Storage decision

Do not replace Supabase/Postgres with a JSON file or a large environment variable. `job_sources` is operational state: it needs enablement, sync timestamps, error tracking, backoff, ownership, and provider configuration. A database is the correct home for it.

Use a tiered model:

- Postgres remains the source of truth for `job_sources`, the current normalized `discovery_jobs` catalog, deduplication keys, status, and user match/application state.
- Supabase Storage or another object store holds optional raw response snapshots and historical HTML once retaining them in Postgres becomes expensive.
- Postgres full-text search plus `pgvector` supports the first search and semantic-ranking stage. Supabase documents a hybrid approach using `tsvector`, vector columns, and reciprocal-rank fusion.
- Add OpenSearch only when the live catalog or query load proves Postgres is the bottleneck. It should be a rebuildable read index, not the source of truth.

Reference: [Supabase hybrid search](https://supabase.com/docs/guides/ai/hybrid-search).

Practical trigger for a separate search service: sustained slow search after indexing and query tuning, multi-million active documents with high query concurrency, or a product need for complex faceting and ranking experiments. Do not introduce it solely because the company registry grows to tens of thousands of rows.

## Canonical ingestion model

Every provider adapter should output the same normalized record:

- provider and provider job ID
- canonical employer and canonical job URL
- title, locations, workplace and employment type
- published, updated, first-seen, and last-verified timestamps
- clean description and structured requirements
- content hash, parser version, and raw snapshot reference

Deduplicate in two passes:

1. Exact provider identity: `(provider, source, provider_job_id)`.
2. Cross-source candidate identity: canonical company + normalized title + location + description fingerprint.

Never overwrite `first_seen_at`. Close a job only after repeated misses or an explicit closed response. Keep the employer page as the application destination.

## Ingestion execution

Move synchronization out of an authenticated user request before the catalog becomes large.

1. A scheduler selects due sources from `job_sources`.
2. Queue workers fetch sources with provider-specific rate limits, timeouts, and retry policies.
3. Adapters normalize and hash results.
4. Upserts update the current catalog and append an optional raw snapshot.
5. A reconciliation job marks missing postings unverified and later closed.
6. Metrics track freshness, failure rate, postings per source, and parser regressions.

`Refresh sources` can remain an admin/development action, but normal users should only read the already-refreshed catalog.

## Matching architecture

RAG is useful for finding the best résumé or transcript passages for a requirement. It is not the right mechanism for deciding explicit eligibility.

Use four stages:

1. Extract structured applicant facts with provenance: graduation date, degree, coursework, location preferences, and user-confirmed authorization/availability.
2. Apply deterministic hard gates for graduation windows, degree requirements, location constraints, and other explicit eligibility rules. A hard conflict caps the score regardless of skill overlap.
3. Retrieve relevant résumé/transcript chunks for each remaining experience or skill requirement using hybrid keyword and semantic retrieval.
4. Let the model judge supported, partially supported, or not evidenced using exact retrieved quotes. Recalculate the score in application code so the model cannot override hard gates.

The next data-model improvement should be a versioned `profile_facts` table with source quotes and confidence, plus profile-level document chunks created when a résumé or transcript changes. The current job-specific RAG chunks are too late for discovery ranking because they are created after an application workspace exists.

## Delivery sequence

### Now

- Keep the provider-neutral tables.
- Use eligibility-first scoring and retain exact evidence grounding.
- Keep Greenhouse sources as the initial working catalog.

### Next provider branch

- Add Lever and Ashby adapters behind the same normalized interface.
- Add provider contract tests with stored fixtures.
- Schedule syncs independently of user traffic.

### Direct career-site branch

- Add source discovery and canonical URL tracking.
- Parse `JobPosting` JSON-LD first.
- Add robots, terms, request-budget, and per-domain crawl controls.
- Add custom provider adapters only for high-value unsupported systems.

### Search and ranking branch

- Add `tsvector` and embeddings to normalized jobs.
- Implement hybrid retrieval and explicit user preference filters.
- Benchmark Postgres before introducing OpenSearch.

### Profile intelligence branch

- Extract versioned profile facts on upload with source provenance.
- Create reusable profile-level embeddings.
- Add user confirmation for sensitive or ambiguous facts.
- Build regression fixtures for graduation windows, internships, new-grad roles, degree constraints, and authorization unknowns.
