# Notification Center Implementation Plan

> **For agentic workers:** Implement in this session, in the order below. Use the approved conversation as the specification; do not deploy or change real user records.

**Goal:** Replace the member notifications page with a bell-triggered modal, unread count, detail view, and clearable history.

**Architecture:** Reuse the existing modal and activity view factory. Derive history from the first read timestamp after exactly 72 hours; no new table or scheduled job is needed. Add authenticated server actions for first-read timestamps and deleting only the actor's eligible history, keeping relational rows and the app snapshot consistent in one transaction.

**Tech Stack:** Existing vanilla JavaScript, CSS, Node.js and PostgreSQL; PGlite and linkedom tests.

**Spec:** Approved conversation: bell badge counts unread messages; opening the list does not mark messages read; opening details does. Newest messages first. Details, current list and history share one modal with back navigation. Read messages enter history after 3 days from first reading; unread messages never enter history. Clear confirms deletion of only the current member's history. Remove the sidebar page link; preserve old notification links by opening the modal over the dashboard. Preserve category filtering and search.

## Global Constraints

- Preserve existing notifications and complaint/workshop links.
- Reuse current file organization and dependencies.
- Persist server timestamps and deletions; refreshing or another session must not resurrect cleared history.
- Escape message text, keep member data isolated, and preserve keyboard/modal focus handling.
- No live database edits, deployment or plaintext credential output.

## Review Focus

- Exactly 72 hours since first reading, including old unread messages.
- Reopening messages must not reset their first-read timestamp.
- Forged timestamps, another user's IDs and whole-store deletion attempts.
- Saving failures, cancelled Clear, closing during a request and stale clients.
- Polling while the notification modal is open, keyboard focus and narrow screens.

### Task 1: Persist read and history actions

Files: `src/features/workshops/management.js`, `src/features/workshops/store.js`, `tests/membership.test.js`.

- [x] Add integration tests for first-read, ownership, immutable server timestamps, 72-hour history deletion, stale clients and persistence; cancellation is exercised in Task 2.
- [x] Run the new tests and observe missing-action failures.
- [x] Implement `POST /api/notifications/read` with `{id}` and `POST /api/notifications/clear-history` with `{}`; return the actor-filtered `store` and `deletedCount` for Clear.
- [x] Forbid setting read timestamps through whole-store saves; retain existing no-deletion policy there.
- [x] Run targeted integration tests.

### Task 2: Move notifications into the modal

Files: `public/assets/js/views/activities.js`, `public/assets/js/app.js`, `public/assets/css/components.css`, `tests/public-ui.test.js`.

- [x] Add UI tests for bell count, untouched page/hash, list/detail/back/history, filtering/search, Clear confirmation/cancellation, errors and persisted read state.
- [x] Run new UI tests and observe missing modal failures.
- [x] Add notification center rendering/actions to the existing activity factory; reuse the existing modal shell and request queue.
- [x] Replace the bell dot with a numeric badge, remove the sidebar link, and handle legacy `#notifications` links.
- [x] Keep notification polling active in this modal without interrupting input or replacing details; restrict history deletion to server eligibility.
- [x] Style compact rows, accessible controls, contained scrolling and mobile layout; retain the existing modal reduced-motion rules without adding motion.
- [x] Run UI and view-factory tests.

### Task 3: Verify

- [x] Review ownership, history boundaries, async closure, focus restoration and persistence.
- [x] Format touched code and run `npm.cmd test` (48/48 passed), `npm.cmd run check` (37 JavaScript files passed), `npm.cmd run format:check` (passed).
- [x] Report the changed files and browser-verification limitation: an isolated headless Chrome session could not connect; real viewport screenshots were not verified. UI interaction tests use linkedom; integration tests use PGlite without live database writes.

No Git metadata is present in this workspace, so no branch or commits are created.
