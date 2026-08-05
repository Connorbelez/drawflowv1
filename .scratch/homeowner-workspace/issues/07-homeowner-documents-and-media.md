# 07 — Project Documents & Media with governed provenance

**What to build:** Give Homeowners one read-only view of Documents and Media explicitly shared with them while preserving object-level authorization and provenance. Collaboration uploads remain informal collaboration assets until an authorized actor deliberately promotes or links them into a governed Build record.

**Blocked by:** 04 — Secure Homeowner references, mentions, attachments, and Action Items.

**Status:** ready-for-agent

- [ ] The view lists only Documents and Media explicitly authorized for the current Homeowner and Build.
- [ ] Preview, download, and deep-link access reauthorize the current user and source object on every request.
- [ ] Restricted files are absent from counts, search, filters, notifications, exports, autocomplete, and retrieval.
- [ ] Homeowner-visible metadata excludes internal review, storage, evidence, geofence, supplier, pricing, and lender-only details unless separately authorized by the source object.
- [ ] A Homeowner can open or create an entity-linked collaboration conversation about an authorized Document or Media item.
- [ ] A collaboration upload does not automatically appear as canonical Evidence, a Cost Document, or a canonical Document.
- [ ] Explicit promotion or linking retains the source post, author, attachment, timestamps, and audit provenance.
- [ ] Assignment changes, revocation, Build closure, source visibility changes, and file quarantine take effect immediately for listing, preview, and download.
- [ ] The view supports safe loading, empty, restricted, processing, quarantined, and unavailable states on desktop and mobile.
- [ ] Request-time authorization and provenance behavior are covered at the API, projection, component, and browser seams.

