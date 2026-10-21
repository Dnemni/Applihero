# Application preparation · local development v0.2

Branch `extension_build`. Chrome MV3 extension + Next.js question workspace. The workspace runs without Supabase, using an explicitly enabled, loopback-only, single-user local store. It is not production Supabase authentication, multi-user storage or a release-ready ATS automation service.

## What works

- Capture a user-opened HTTPS form through the extension toolbar and side panel. No default all-sites host permission; `activeTab` grants access after the user's gesture. Executable code is packaged locally.
- Capture labels, help text, requiredness, constraints, options, repeated fieldsets, native radio groups and inputs in open shadow roots. Password/authentication/payment/SSN-like controls are excluded. Custom widgets, uploads and inaccessible embedded frames have manual fallbacks.
- Separate application workspaces by sanitized origin/path/requisition query. `gh_jid`, `jobId`, `job_id`, `requisitionId`, `reqId` and `jid` are retained; arbitrary queries, fragments, credentials and tokens are not stored. The user must verify the page is the intended employer/requisition. Unknown query-only identities and path-changing multi-step applications need additional identity support; do not use this build when two applications share the same sanitized URL.
- After initial Capture, a debounced observer detects question/option/visibility changes and syncs the current page. The workspace refreshes every four seconds while visible. Unchanged exact questions keep approvals; changed questions need fresh drafts and approval. Full sanitized inventories are currently sent, not minimal network deltas.
- A local contact profile supports exact-label suggestions. The user confirms the profile and approves each answer separately. No inference of citizenship, sponsorship, work authorization or demographic answers. Existing remote Supabase profile data is not silently copied or assumed available.
- Draft → approve → preview → fill. Edits create answer versions, schema/answer revisions invalidate stale plans, and fill plans expire after two minutes. The worker retrieves fresh approved answers; content scripts receive only the current plan's approved fields.
- Existing values remain unchanged. Native inputs use setters and events, radio/checkbox controls use their native click, and readback occurs after rerender. Duplicate locators, changed fields, invalid dates/numbers, missing options and employer validation stop that field.
- Styled question inbox, application selector, local profile editor, required/manual filters, plain-language preview and field results. Styling is shared with the panel.

The workflow automates capture, ongoing question synchronization, answer retrieval and supported fills. Users still write/approve answers and explicitly preview/fill. It never logs in, navigates Next, uploads a file or submits an application for them. Filling may trigger the employer's autosave.

## Install / update

1. From the project directory run `npm ci` if dependencies are not installed, then `npm run build:extension`.
2. In Chrome open `chrome://extensions`. Enable Developer mode and Load unpacked → `/Users/dhruv/Documents/GitHub/Applihero/extension/dist`. If already installed, click Reload on its card after rebuilding. Version is **0.2.0**.
3. Start the server: `PREPARATION_EXTENSION_ID=<your-extension-id> npm run dev:preparation`. For the installation observed in this task the ID was `pgacdollijjmlfeokdbgfgiccejdpgll`. Keep the terminal running. It prints a development key; never use a Supabase/service-role key here.
4. Open a form in Chrome, click the AppliHero toolbar icon and connect the panel with the development key. Choose **Capture this form**. Capture is a deliberate transfer of sanitized question metadata to your local workspace; existing field values are not sent.
5. Choose **Open answer workspace**. Connect using the same key. Check the application selector and page identity. Add confirmed contact details under **Your reusable details** if desired. A suggestion needs **Use suggestion**, **Save new draft**, then **Approve exact answer**.
6. For other questions, enter answers directly and approve. Selects/radios display the employer's exact labels and preserve the underlying values. **Coach outline** is deterministic writing guidance, not an AI-generated answer.
7. Return to the original form tab. Choose **Preview approved answers**, review the actual values, then **Fill previewed answers**. The panel explains skipped values and manual actions. No overwrite option is implemented.
8. When conditional questions appear on the same page, their metadata syncs automatically after approximately 700ms. Review them in the workspace. If the page navigates, reopen the panel and capture again. Do not assume unseen steps have been covered.
9. Disconnect clears extension tokens, previews and tab checkpoints. Browser restart requires reconnecting. Close/reopen panel retains the session. Local answers persist on disk.

## Demo

- `http://localhost:3000/preparation-fixtures/generic.html`: basic text, email preservation, native select, repeated employers, manual upload/custom picker, conditional sponsorship question.
- `http://localhost:3000/preparation-fixtures/advanced.html`: native radios, date/number constraints, checkbox, open shadow-root portfolio, conditional essay, excluded security controls and an embedded-frame warning.
- `http://localhost:3000/prepare`: local question inbox.

Use fictional data for compatibility testing. On the first fixture, approve a name, a short project response, and a different email. Filling must verify the name/response while keeping `existing@example.test`. On the advanced fixture, test the radio group and then reveal the next question; unchanged approvals should remain valid. A real employer form may still need manual correction.

## Evidence and limitations

- v0.2.1 live Chrome demonstration (2026-10-21): captured 17 controls on Patreon's Ashby Software Engineering Intern application; prepared and approved five fictional contact/link answers in the local workspace; the loaded extension filled and verified all five, with values independently visible in the employer form. No upload or submission occurred. This is **5/5 attempted text/contact fields**, not complete form coverage. Ashby radio-group labels appeared as IDs, location remained manual, and custom yes/no controls appeared as inactive underlying checkboxes. Required-question totals therefore undercount this form and must not be treated as a readiness measure.
- On real HTTPS forms, click the AppliHero toolbar icon on that tab before Capture. v0.2.1 opens the panel from the explicit toolbar action so current-tab access is granted; merely reopening a panel is insufficient. Permissions were not expanded.

- `npm run test:preparation`: 12 tests at the v0.2 checkpoint, covering revisions, immutable answers, exact-context reuse, sensitive-field non-inference, sanitized identity, separate applications and concurrent store operations.
- `npm run test:preparation-browser`: **16/16 attempted supported non-upload fills verified**, across three fixtures. Two share basic markup; the advanced fixture is independent. Tests cover preserved values, replaced DOM nodes, changed questions, ambiguous fields, radio options, dates, numbers, checkboxes, open shadow roots and exclusion of login/payment/SSN fields. This is fixture evidence, not an arbitrary-site success rate.
- `PREPARATION_DEMO_TOKEN=<running-server-key> npm run test:preparation-workspace`: actual Next.js UI/API draft → approval → plan → result persistence and unauthenticated rejection. Uses and resets its dedicated `workspace-test.html` application record.
- `PREPARATION_DEMO_TOKEN=<key> npm run test:preparation-extension`: loaded extension integration in an isolated Chromium profile. Requires a Playwright Chromium build that supports extension loading; optionally set `PREPARATION_TEST_CHROMIUM` to its executable path. Use the same extension directory/ID configured on the server.
- `npx tsc --noEmit --incremental false`: type checking.
- v0.1 was demonstrated as a loaded extension in the user's Chrome: capture, panel close/reopen, name/project fill verified and existing email preserved. v0.2 also passed an isolated loaded-MV3 integration test: actual worker/content messaging, mutation auto-sync, unchanged approval retention, verified fill, panel reopen, cross-tab rejection and sign-out rejection. This is not a real employer submission test.

| Controls / surface | Current handling |
| --- | --- |
| Native text, textarea, email, phone, URL | Fill and readback, preserving nonempty values |
| Native select, radio group, checkbox | Exact option/value only; never inferred |
| Date and number | Format/range checks plus native validity |
| Repeated fieldsets | Section context and repeated legend occurrence; reordering requires recapture |
| Open shadow roots | Capture and fill; ambiguous hosts remain unsupported |
| Custom combobox, multiselect, rich text | Inventory/manual fallback |
| Upload | Manual employer upload; no document-management integration |
| Iframes | Explicit warning; open frame separately or enter manually |
| Closed shadow roots / unseen steps | Not inspectable; coverage warning, never called complete |
| Greenhouse, Lever, Ashby, Workday | Generic HTML only where it fits; no certified platform-specific adapters |

## Privacy, storage and operational boundaries

The server binds to loopback and rejects production mode, wrong Host, wrong Origin and missing/incorrect development keys. The extension only contacts the local API. Session tokens are restricted to trusted extension contexts. Checkpoints contain page identity/revision, not answers. The panel renders employer text with `textContent`; the workspace uses React escaping. No remotely supplied code is evaluated.

Local data lives in ignored `.preparation-local/workspace.json` with restrictive file permissions. This is a single-process store, not encrypted storage or tenant isolation. Stop the server and remove that directory to delete local data (back it up first if needed). There is no automatic upload to Supabase and no account-scoped deletion UI yet. Do not expose the server through a public tunnel. Metadata itself can be sensitive; inspect the captured questions before relying on the tool on a real site.

The original user-requested ingestion JSON and contract were not found. No import, duplicate application submission, public job mutation or change to existing IBM/Roblox/Notion history occurs. Existing discovery queues and egress consumption are unchanged.

## Supabase migration

`supabase/migrations/20261021000000_preparation_foundation.sql` remains **unapplied and unused**. It adds private captures, answer versions, bindings, plans and field results, with ownership foreign keys and RLS. It does not implement a production API, pairing or all requested normalized entities. Before use, run real Postgres two-user tests and implement transactional compare-and-swap persistence and revocable device pairing.

Rollback before production writes, or after backing up private data: drop `preparation_field_results`, `preparation_fill_plans`, `preparation_bindings`, `preparation_answer_versions`, `preparation_captures`, then function `preparation_protect_approved_answer()` and index `jobs_id_user_id_preparation`. Existing jobs/statuses are unaffected.

## Remaining completion gates

1. Local general-form gate: visual check of updated extension in the user’s Chrome, full service-worker crash/restart testing, more independent fixtures, backend retries with durable result checkpoints, undo, question-level deletion, better identity confirmation and path-changing step association. Current sync errors can require recapture; result logging conflicts are surfaced, never reported as saved.
2. Production gate: Supabase transactional repository, normalized facts/definitions/documents/events, two-user isolation, rate limits, device pairing/revocation and import contract/double-import tests. Integrate existing server coaching using verified evidence and draft-only structured outputs.
3. Real-site gate: representative ATS-specific adapters and consented first-ten-application audit. Measure verified fills, correction time, unresolved questions and reuse before rollout. Never promise every form works. No store publication or merge to main until these gates are met.
