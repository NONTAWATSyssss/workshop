# Site-wide blue glass theme

Approved scope: both reference images, with the pale blue/white palette of image one. Apply to public, member and staff screens, including shared overlays and controls. Keep the existing Prompt font, content, roles, authentication, database and compact layouts.

- [x] Define one semantic palette for accent, ink, surfaces, borders, focus and semantic statuses. Retain existing variable aliases for compatibility.
- [x] Replace scattered purple/neutral color literals in base/components/management/records with shared semantic roles; leave success/warning/error meaning intact.
- [x] Add one final theme stylesheet for the glass background, chrome, cards, tables, forms, membership, records, menus, calendars, notifications and footer. Use blur only for chrome and floating layers, not every table row or card.
- [x] Review fallback surfaces and small-screen rules in source, add reduced-motion/forced-color/print fallbacks. Preserve modal height, floating picker position and selected-row overlay behavior. Actual browser viewport and zoom checks remain unverified.
- [x] Measure declared contrast pairs and run full UI/backend, syntax and formatting checks. Inspect public stylesheet delivery. Browser visual checks depend on the unavailable computer-use runtime.

Design choices: icy blue page atmosphere, translucent white surfaces, restrained blue primary actions, dark navy text, white edge highlights and soft blue shadows. No new font, dependencies, external imagery, data writes, navigation changes or infinite background animation.

Coverage: guest home/news/workshops; login/register/recovery/account; member dashboard/workshops/my activities/reports/complaints; staff dashboard/workshop management/approvals/participants/archive/complaints; notification center, confirmations, date/month/year/time and action menus.

## Verification

- `npm.cmd test`: 65/65 passing, including the existing role, authentication, attendance, calendar, record/complaint, deletion and modal tests, plus two new theme checks.
- `npm.cmd run check`: 44 JavaScript files pass syntax checking.
- `npm.cmd run format:check`: all matched files pass. The CSS parser also successfully parsed all five stylesheets.
- Theme tests check global stylesheet order, unchanged Prompt font link, shared variable references/cycles, text/status/control contrast and the composited glass gradient stops.
- Declared contrast ratios: primary text/page 10.27:1; secondary text/page 5.69:1; muted text/page 5.32:1; white/primary action 5.17:1; white/hover action 6.70:1; input boundary/solid surface 3.46:1. Success/warning/danger text pairs exceed 4.5:1. These are token/composition calculations, not measurements of rendered browser pixels.
- Read-only HTTP checks: all five CSS assets return 200 and match the local source; `theme.css` is loaded last. No database writes or application logic changes in this task.
- The computer-use and Node REPL runtimes both failed to start (`os error 3`). No real-browser screenshot comparison, responsive/zoom playthrough, LCP or INP measurement is claimed.
