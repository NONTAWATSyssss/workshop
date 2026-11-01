# Loading performance investigation and changes

UI must remain unchanged. Do not read credentials or modify live records.

Observed local public HTTP baseline, three requests each: `/api/session` 1097/1/1ms (first anonymous request still acquired a database connection); `/api/workshops` 1634/384/230ms and 3,226,653 bytes; static HTML/JS 1–2ms warm. Only status, size and timing were printed.

Reproducible isolated profile: `node scripts/profile-workspace.js`, PGlite with 10ms added per SQL round trip and one 750KB image. Baseline public catalog: 1,000,277 bytes, 29/28/32ms. Member store: 1,000,870 bytes, 8 SQL statements, 140/141/126ms. Anonymous session: zero SQL but the request wrapper still leased a connection. Frontend bootstrap waits for both public catalog and session before fetching private store, even for authenticated visitors. Navigation rebuilds HTML from this image-heavy store, embedding the image data repeatedly.

- [x] Add regression tests for small catalog/store responses, versioned public image delivery, preserved images during staff saves/removal, fast read query budget, anonymous no-connection session and bootstrap without redundant catalog loading.
- [x] Serve inline workshop images through a versioned public cover URL with image-only headers and immutable caching for matching versions; preserve stored originals and upload/edit behavior.
- [x] Add an optimistic read-only workspace path; only acquire the existing write lock for changed user profiles or due complaint cleanup. Keep auth fresh and retain transactional rechecks.
- [x] Avoid database leases for no-cookie session discovery and omit redundant public catalog fetches during authenticated reload.
- [x] Re-run the same isolated profile, compare statement count/payload/timing, and keep only demonstrated improvements.
- [x] Run full tests, syntax and formatting; report results and verification limits.

## Results and attempt ledger

Same isolated command and 10ms simulated SQL round trip; three samples per route. These figures isolate server work, not browser load time or cloud latency.

| Change | Baseline → measured result | Decision |
| --- | --- | --- |
| Move inline images out of metadata | Catalog 1,000,277 → 324 bytes; median 29 → 16ms. Store 1,000,870 → 917 bytes; query count remains 8; median 140 → 128ms. | Keep for payload reduction. Original image bytes remain in the database and are fetched separately when needed; unchanged versions can be cached. |
| Read-only workspace path | After image change: 8 → 3 SQL statements; median 128 → 47ms (46/48/47ms in final repeat). | Keep. No writer lock on unchanged reads. Changed profiles or due expiry still re-read under the lock and persist revisions. |
| Skip anonymous connection lease and redundant authenticated catalog | Anonymous session needs 0 leases; restored authenticated UI opens even when the public catalog never resolves and makes no catalog request. Page navigation makes no new API request in the regression test. | Keep. Session and permissions still checked fresh. |

Read-only local application check after changes: catalog 3,226,653 → 427 bytes; 1324/197/198ms versus original 1634/384/230ms. This tiny sample is not a latency guarantee; a first cloud database connection still adds latency. Anonymous session 1/1/1ms, HTML 3/2/1ms, app.js 2/2/1ms. Requests used no authenticated cookies and did not write live records. Images themselves are not compressed by this change; private snapshot reads still transfer the stored snapshot from the database.

Verification: full suite 61/61; syntax check 41 JavaScript files; formatting check passes. Existing tests cover fresh promotion/demotion, 15-day complaint expiry and independent staff deletion, revision conflicts and attendance locks; new tests cover cover URL edits/removal/cache headers and the read query/payload budgets. Browser tools were unavailable, so no real-browser visual, LCP or INP claim is made. No speculative index, pool-size or dependency changes were attempted.

No role/session/data caching, skipped validations, changed UI, added production dependencies or live database writes. Private responses remain no-store. Cover URLs are public because those same workshop images were already public in the catalog. Real browser visual/INP verification remains dependent on browser tool availability.
