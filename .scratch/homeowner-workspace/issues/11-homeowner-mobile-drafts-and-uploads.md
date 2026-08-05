# 11 — Support mobile drafts and resilient uploads

**What to build:** Make the unchanged shared collaboration interface dependable for Homeowners on mobile devices. Homeowners can compose with locally durable drafts, capture or select files, and retry interrupted uploads without the product claiming that offline mutations have committed.

**Blocked by:** 04 — Secure Homeowner references, mentions, attachments, and Action Items.

**Status:** ready-for-agent

- [ ] The Homeowner Workspace and shared collaboration component remain usable at supported phone, tablet, and desktop widths without a Homeowner-specific feed variant.
- [ ] A Homeowner can capture or select permitted photos and files using mobile device capabilities.
- [ ] Unsaved post and comment drafts survive navigation, refresh, temporary connection loss, and recoverable write conflicts.
- [ ] Draft restoration remains scoped to the authenticated person, organization, Build, and intended post or comment.
- [ ] Interrupted uploads can retry without duplicating an attachment or publishing a partial collaboration bundle.
- [ ] A failed upload preserves the draft and gives an understandable recovery action without exposing storage or backend diagnostics.
- [ ] Publishing, commenting, Action Item mutation, and upload completion require a confirmed connection in v1.
- [ ] Cached previously viewed content and local composition never masquerade as current authoritative Build state.
- [ ] V1 does not introduce an offline mutation queue, background conflict reconciliation, or optimistic success after connection loss.
- [ ] Mobile browser tests cover composition, camera/file selection, draft recovery, upload retry, authorization change, and successful connected publication.

