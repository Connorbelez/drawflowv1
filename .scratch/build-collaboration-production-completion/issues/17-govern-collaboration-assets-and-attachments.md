# 17 — Govern collaboration assets and attachments

**What to build:** Allow participants to stage and publish Build collaboration files and images through the same governed storage, scanning, versioning, ACL, audit, and preview rules as the rest of DrawFlow.

**Blocked by:** 03 — Bind HITL approval to a trusted human actor and atomic publication bundle; 04 — Enforce canonical typed-reference ACLs and a role-safe @ index.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §8; Build Collaboration Production Implementation Plan — Assets, drafts, and publication approval and Task 8; Build Collaboration Cutover Runbook — Verification; Build Collaboration Implementation Gap Analysis — Operational integration and asset gaps.

- [ ] Posts, comments, Action Items, and private drafts can stage governed images, files, and links without creating premature shared records.
- [ ] Upload finalization records version, hash, size, MIME type, storage identity, scan state, uploader, Build, tenant, and owning publication.
- [ ] Unscanned, quarantined, orphaned, inaccessible, cross-Build, and cross-tenant attachments cannot be published or downloaded.
- [ ] New versions preserve historical references and do not silently replace immutable revision evidence.
- [ ] Location-unverified Evidence remains preserved and routed for review rather than discarded.
- [ ] Preview/download authorization is revalidated and all material actions are audited.
- [ ] Tests cover upload/finalization, rejected files, version history, ACL changes, removed participants, and transactional publication failure.
