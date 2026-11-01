# Reports and complaint inbox implementation plan

**Goal:** Deliver the approved compact report table and complaint inbox with independent member trash and staff Clear.

**Spec:** The approved conversation. Reports have three compact totals, search/year/status filters, ten rows per page, newest activity first, and immediate fixed-height detail modals. Member complaints use an inbox with search/status, ten rows per page, thread details, and recoverable trash for exactly 15 days from first trashing. Staff may Clear selected rows, select the current page, or Clear all visible-to-staff complaints after confirmation with a count. Clearing staff records does not hide the learner's copy; member expiration does not hide the staff copy. Purge original and replies only when both sides have deleted.

**Architecture:** Keep activity discovery and notifications in `activities.js`; extract record/report/inbox views into `views/records.js` with explicit context, and style them in `records.css`. Add a small server complaint lifecycle module, additive nullable PostgreSQL columns, server-owned transitions, and role-filtered snapshots. Keep whole-store saves compatible by retaining hidden rows server-side and rejecting forged lifecycle fields. Use an authenticated daily Vercel maintenance job plus cleanup during store access; exact expiration is also enforced when filtering responses. No new dependencies or live database operations.

**Visual direction:** Existing Prompt type, white surfaces, purple `#854c9e`, text `#262137`, muted text `#686276`, border `#eae5ef`, background `#f7f4fa`. Quiet divided summaries and aligned compact rows, clear status colors, restrained shadows, readable empty states, responsive down to 320px. Detail modals use 720px height bounded by viewport padding, stable headers and internal scrolling.

## Review focus

- Ownership, CSRF and stale revisions on trash/restore/Clear; immutable lifecycle fields on old save paths.
- Restore just before 15 days, rejection at/after expiry, both deletion orders and old snapshots attempting resurrection.
- Existing replies, notifications and metadata survive until eligible purge; cron denied without its secret.
- Search/filter pagination resets, global hours unaffected by filters, mobile labels and long titles.
- Immediate detail opening, failed saves retaining rows/selections, cancellation and existing reply/deep-link workflows.

## Task 1: Server lifecycle

Files: `database/schema.sql`, `src/features/workshops/complaints.js`, `store.js`, `management.js`, `src/app.js`, `vercel.json`, `.env.example`, integration tests.

- [x] Write failing integration coverage for own trash/restore, expiry, independent staff Clear, selected/all, physical purge, forgery and stale save rejection.
- [x] Add nullable `learner_trashed_at`, `learner_deleted_at`, `staff_cleared_at` with idempotent ALTERs.
- [x] Implement `POST /api/complaints/trash`, `/restore`, `/clear` (IDs or all, expected revision), plus protected `GET /api/maintenance/complaints`.
- [x] Maintain/role-filter snapshots and preserve hidden rows in whole-store saves; persist and test both deletion orders.
- [x] Configure/document daily maintenance; test the protected endpoint with isolated data.

## Task 2: Record views

Files: `public/assets/js/views/records.js`, `activities.js`, `app.js`, `public/assets/css/records.css`, `public/index.html`, UI/view tests.

- [x] Add failing UI coverage for report filtering/pagination/details, member inbox/trash/restore, staff selection and Clear confirmation/cancellation/errors.
- [x] Extract record views with context injection; keep existing actions and staff detail links working.
- [x] Build compact report summaries/table and inbox lists; implement filters and ten-row pagination.
- [x] Add fixed-height instant detail modals and retain report actions and staff replies.
- [x] Add trash expiry dates/remaining days, staff Clear controls and queued server actions.
- [x] Apply scoped responsive styles and verify existing UI flows.

## Task 3: Verification

- [x] Review permissions, migration repeatability, expiry boundaries, async behavior and CSS containment.
- [x] Run full `npm.cmd test`, syntax checks and formatting checks.
- [x] Report changed files, cron setup requirement and browser verification limits.

No Git metadata is present. Implement natively in this session; do not deploy or mutate real user data through tools.

## Verification result

Full test suite: 53/53 passed. Syntax: 39 JavaScript files passed. Prettier: passed. Existing workshop deletion/finalization tests now compose the real lifecycle module. Real browser screenshots and 320px viewport rendering were not verified because the native browser connection is unavailable; interaction coverage uses linkedom and server coverage uses isolated PGlite databases. Production deployment and CRON_SECRET setup were not performed.

## Complete file list

- New: public/assets/js/views/records.js, public/assets/css/records.css, src/features/workshops/complaints.js, this plan.
- Updated frontend: public/assets/js/app.js, public/assets/js/views/activities.js, public/index.html.
- Updated server/schema: src/app.js, src/features/workshops/store.js, src/features/workshops/management.js, database/schema.sql.
- Updated configuration/docs: vercel.json, .env.example, docs/DEPLOYMENT_TH.md, docs/STRUCTURE_TH.md.
- Updated tests: tests/public-ui.test.js, tests/membership.test.js, tests/workspace-views.test.js, tests/helpers/management-app.js.
