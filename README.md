# Applihero
A web app that uses a personalized RAG model on a user’s resume/background to coach them through job applications. The app lets users upload resumes and create job-specific “sessions”. For each application, Applihero provides unique advice, generates survey answers and cover letters, and includes a simple feedback module (ratings + comments).

Check it out here: https://www.applihero.com/

## Job discovery setup

The discovery catalog is provider-neutral, with Greenhouse as the first adapter.

1. Apply `lib/supabase/migrations/20260717_add_job_discovery.sql` to Supabase.
2. Configure one or more Greenhouse boards with `GREENHOUSE_BOARDS_JSON`:

```json
[
  {
    "companyName": "Example Company",
    "boardToken": "example",
    "includeTitleTerms": ["intern", "new grad", "entry level"]
  }
]
```

The board token is the segment used by the company's public Greenhouse job board. `includeTitleTerms` is optional; when present, only postings whose titles contain one of those terms are imported. An authenticated user can then select **Refresh sources** on `/discover`. The sync records employer-provided publish time, AppliHero discovery time, and last verification time separately.

Additional providers should normalize their payloads into `discovery_jobs`; user application state remains in `jobs` and links back through `jobs.discovery_job_id`.
