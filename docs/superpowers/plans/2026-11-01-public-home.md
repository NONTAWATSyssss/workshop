# Public homepage refresh

Approved scope: align public content with the Navbar frame; remove the separate guest workshop page/navigation; show newest real workshops still accepting registration in a scrollable rail; replace announcement instructions with illustrated sample news. Authenticated workshop pages and membership remain available.

Design: retain Prompt and the purple/white campus identity. Use the existing local photographs, one featured announcement and two secondary stories, with clear sample-content labeling. Share the same public frame width/gutters between header and main. Constrain hero height as the frame widens. Use four workshop cards on wide screens, fewer on narrow screens, and a partial next card on phones to indicate horizontal scrolling. Details open immediately from loaded data.

- [x] Test missing guest activity page, scroll-to-section navigation and legacy links.
- [x] Test latest-first ordering and exclusion of closed, full, started or expired workshops; retain more than three open cards.
- [x] Add the safe public workshop creation timestamp and test its API response.
- [x] Implement illustrated sample news, accessible detail views and keyboard/button/swipe carousel controls.
- [x] Replace obsolete homepage CSS and align public header/main at all responsive breakpoints.
- [x] Verify full tests, syntax and formatting; record browser verification limits.

Files: public/assets/js/views/activities.js, public/assets/js/app.js, public/assets/css/components.css, src/features/workshops/catalog.js, tests/public-ui.test.js, tests/public-catalog.test.js, docs/STRUCTURE_TH.md, this plan. No new dependencies, image downloads or live database writes.

Verification: full suite 57/57 passed; 39 JavaScript files passed syntax checks; formatting passed. Follow-up focused tests also passed after adding a fixed-clock started-workshop fixture. CSS photo sizing was bounded independently of intrinsic image height. Real browser screenshots, touch/swipe behavior and rendered viewport widths remain unverified because the native browser connection is unavailable. Existing local photographs are reused; sample news is stored in activities.js and actual workshop records are not modified.
