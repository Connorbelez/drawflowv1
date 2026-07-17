# Site visit order preflight

Every production active-build site visit must be configured before its token is created. Milestone review, Calendar, Timeline, and Gantt order actions all open the shared `SiteVisitOrderDialog` and must not call a site-visit mutation directly.

The preflight shows the parent milestone and its ordered submilestone scope. Lender staff can edit two rich-text fields:

- **What to verify**: observable completion and exception checks for the field reviewer.
- **Required photo angles**: the wide, detail, and contextual views required for evidence review.

`Write with DrawFlow AI` sends only the build name/location, milestone, scoped submilestones, and current guidance to the authenticated assistant action. The action returns concise HTML bullet lists. Provider output is editable and a deterministic context-aware fallback is used when no model provider is configured.

Confirmation atomically creates the `buildSiteVisits` record and snapshots `siteVisitGuidance` and `submilestoneKeys` onto it. The milestone keeps the latest guidance for the next preflight. The token route renders the visit snapshot and filters its target submilestones to the saved scope, so later milestone edits cannot silently change an already-issued field assignment.

Tests cover the no-write-before-confirmation contract, AI context and editability, Timeline/Gantt routing, persistence, and exact token-route rendering.
