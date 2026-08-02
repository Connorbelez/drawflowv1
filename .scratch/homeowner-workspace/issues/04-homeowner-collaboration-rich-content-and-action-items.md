# 04 — Secure Homeowner references, mentions, attachments, and Action Items

**What to build:** Let Homeowners use the shared collaboration system's rich capabilities while preserving authorization at every edge. Mentions must not grant access, attachments must remain request-authorized collaboration assets, typed references must expose only Homeowner-visible Build entities, and Action Items must coordinate permitted work without creating lender-governed obligations.

**Blocked by:** 03 — Enable full Homeowner collaboration authorship and audiences.

**Status:** ready-for-agent

- [ ] A Homeowner can mention assigned co-homeowners, eligible Builder participants, and authorized Backoffice participants.
- [ ] A Homeowner can mention a Contractor only while that Contractor has an active assignment covering the referenced scope.
- [ ] A mention notifies a person only when they can already view the post, every referenced entity, and every attachment; a mention never expands authorization.
- [ ] Typed-reference search and selection return only same-Build entities authorized for Homeowner visibility.
- [ ] Restricted entities and participants are absent from autocomplete, search, counts, exports, notifications, and retrieval rather than leaked as disabled options.
- [ ] A Homeowner can attach permitted photos and files through the shared composer, and every preview or download reauthorizes the requester.
- [ ] Storage locations and delivery links never function as authorization credentials.
- [ ] A Homeowner-posted file remains a collaboration asset until an authorized actor explicitly promotes or links it into Evidence, a Cost Document, or a canonical Document.
- [ ] Promotion preserves the original post, attachment, author, and provenance rather than rewriting history.
- [ ] A Homeowner can assign an Action Item to themselves, an eligible Builder participant, Builder Staff, or an included active Contractor with authorized scope.
- [ ] A Homeowner can request Backoffice/Lender attention, but cannot assign an authoritative lender approval, compliance, Draw-release, or funding obligation.
- [ ] Rich-content publication is atomic across content, references, audience, attachments, Action Items, notifications, and audit effects.
- [ ] Recipient, reference, attachment, and Action Item authorization is rechecked after assignment changes, role changes, revocation, and Build closure.

