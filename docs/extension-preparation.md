# Application preparation: local milestone

Branch: `extension_build`. This is an isolated, single-user **fixture demo**, not the completed production MVP. Supabase downtime does not prevent this demo. Production authentication is never bypassed, production tables are never copied locally, and demo mode refuses production execution. Nothing is automatically submitted or marked submitted.

## Discoveries

- Next.js 14 / React 18 / TypeScript; Supabase bearer-token authentication in `lib/discovery/auth.ts`.
- Existing `jobs` are private applications, not the public discovery catalog. Existing IBM/Roblox/Notion history is untouched.
- Existing form snapshots import publicly exposed Greenhouse fields. Those are not equivalent to a captured authenticated questionnaire.
- OpenAI is configured in `lib/supabase/client.ts`; existing question feedback uses RAG. `lib/rag/chat.ts` itself is a placeholder. Existing feedback accepts client-supplied user IDs, so it is not reused as an authorization boundary.
- Existing background infrastructure is the discovery ingestion queue plus GitHub and Supabase schedules. This feature does not enqueue discovery or coaching work. Existing ingestion schedules are unchanged; this demo does not resolve their egress consumption.
- No repository AGENTS.md was found. Tests use Node test/tsx; Playwright is already available.
- `applihero_summer_2027_roles.json` and `ingestion_contract_20261009` are absent. No importer or speculative import is included. Stable IDs and historical observations remain untouched.

## Install and demonstrate

1. Install dependencies with the repository's normal `npm ci`, then run `npm run build:extension`.
2. Open Chrome's extensions page, enable Developer mode, Load unpacked, and select `extension/dist`. Copy its extension ID.
3. Run `PREPARATION_EXTENSION_ID=<id> npm run dev:preparation`. The server binds to loopback. Copy the generated development key. Never use a Supabase token here.
4. Open `http://localhost:3000/preparation-fixtures/generic.html`. Click the extension toolbar icon to open its panel. Connect using the development key, then Capture.
5. Open `http://localhost:3000/prepare`, connect with the same key and refresh. Select Coach outline for the project question. Write a truthful response, Save new draft, then Approve exact answer. Repeat for desired fields. Options require the displayed underlying value (for example `US`), not a guessed mapping.
6. Return to the fixture tab. Preview approved answers, review the values, then Fill previewed answers. Inspect structured results. Existing email is preserved; resume upload and custom dropdown remain manual. This may trigger employer autosave on future real-site versions.
7. Click Next yourself, recapture, and refresh the workspace. The newly actionable sponsorship field requires explicit review. Every schema change currently invalidates all approvals; partial delta reuse is a later gate.
8. Disconnect clears extension credentials and checkpoints. Local workspace data persists in ignored `.preparation-local/workspace.json` with restrictive file permissions. Stop the server and remove `.preparation-local` to delete demo captures and answers. Demo keys are stored in extension session storage, restricted to trusted extension contexts; browser restart requires reconnecting.

The key is an explicit development credential, **not production account pairing**. Do not use real candidate data. The extension refuses non-fixture URLs. It requests only activeTab, scripting, storage, sidePanel and the local backend origin. No remotely executable code, debugger permission, page messaging credential bridge, or final-submit action exists.

## Verified locally

- `npm run test:preparation`: six state-machine tests covering replay, revisions, answer versioning, limits, context changes and result scope/idempotency.
- `npm run build:extension`: unpacked extension artifact.
- `npm run test:preparation-browser`: isolated headless Chrome. **10 / 10 attempted supported non-upload fills verified** across two fixture URLs. They use equivalent generic markup; the second is Greenhouse-style, not an independent Greenhouse adapter test. Existing values, DOM replacement, conditional visibility, manual controls and ambiguous locators are checked separately.
- `PREPARATION_DEMO_TOKEN=<running-server-key> npm run test:preparation-workspace`: real Next.js API/UI capture → offline coach outline → draft → approval → plan → result persistence, plus unauthenticated rejection. **Resets local demo data.**
- `npx tsc --noEmit --incremental false`: type checking.

Browser tests use isolated Chrome profiles. Content-script tests mock only the extension message bridge. The unpacked side panel/service-worker lifecycle has not yet been exercised as a loaded Chrome extension. No claim of two-user isolation, real ATS reliability, AI coaching quality, correction-time performance, or release readiness follows from these tests.

## Capability matrix

| Surface | Capture | Fill | Limits |
| --- | --- | --- | --- |
| Local generic fixture | Native labels, help, requiredness, options, repeated fieldsets, visibility | text, textarea, email, tel, URL, number, date, native select, checkbox | Unique ID/name+section required; existing values preserved |
| Greenhouse-style fixture | Same generic engine | Same engine | Equivalent markup; not a dedicated ATS adapter |
| Radio and ARIA custom widgets | Explicit unsupported inventory | Manual | No semantic option guessing |
| Upload | Inventory | Manual | No file assignment or document download integration |
| Hidden/disabled controls | Not actionable | No | Recapture after visibility changes |
| Password/auth/payment/SSN-like controls | Excluded by local conservative filter | No | Real-site exclusion audit pending |
| Frames / shadow DOM | Not traversed | No | Inventory of unsupported frame/shadow boundaries pending |
| Real Greenhouse, Lever, Ashby, Workday | Disabled | Disabled | Separate adapter and permission/auth gates |

## Supabase migration and rollback

`supabase/migrations/20261021000000_preparation_foundation.sql` is an **unapplied, unused foundation**, not a production persistence implementation. It adds private capture, answer-version, binding, plan and field-result tables referencing the existing private jobs. Composite ownership foreign keys and per-user policies are included. Approved answer content is protected from mutation. Public job records are not modified.

Before use: run against local Supabase/Postgres; test authenticated users A/B, forged foreign keys, deletes and expired sessions; implement transactional compare-and-swap API persistence, immutable plan bindings and scoped pairing. The offline file store is single-process only and is never a production fallback. No automatic replay of offline data into production is implemented.

Rollback, only before production writes or after backing up private data: drop `preparation_field_results`, `preparation_fill_plans`, `preparation_bindings`, `preparation_answer_versions`, `preparation_captures` in that order; drop function `preparation_protect_approved_answer()`; drop index `jobs_id_user_id_preparation`. Existing jobs and application statuses remain intact. Applying the migration does not enable the feature.

## Completion gates

1. **Local slice:** core offline flow tested. Still needed: loaded-extension integration test, recovery and multi-tab test, readable per-field panel UI, deletion action, actual server coach drafts using verified evidence. Current coaching is deterministic guidance, not AI drafting.
2. **Production foundation:** complete normalized profile facts/definitions/events/documents, tenant isolation tests, transactional storage, short-lived device pairing/revocation, throttling, shared request validation at extension boundaries, actual job identity confirmation. Supply source JSON and ingestion contract before implementing validate → dry-run → audited transactional import and double-import tests.
3. **Reuse and dynamic steps:** exact contextual answer reuse, sensitive-question review, per-field schema delta sync, mutation observation, batch inbox, manual upload/download and STAR stories, undo, validation feedback and current-step coverage. Current implementation conservatively invalidates all answers on any schema change.
4. **Real-site release:** adapter interface and representative independent Greenhouse/Lever/Ashby fixtures; explicit unsupported frames/shadow roots; real MV3 restart and expiration tests; security/dependency audit; first ten consented application audits. Workday remains separate. Measure correction time, unresolved counts, coverage, reuse and coaching cost before expansion. No store publication.

Do not merge this milestone to main as a completed application-preparation feature. The production and real-site acceptance gates remain open.
