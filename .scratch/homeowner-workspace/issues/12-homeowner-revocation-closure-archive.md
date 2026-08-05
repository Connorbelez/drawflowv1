# 12 — Enforce revocation, Build closure, and archived access

**What to build:** Give Homeowner access a durable, auditable lifecycle. Assignment revocation immediately removes Build access and future delivery without deleting organization membership or historical authorship. Build closure turns the workspace into a governed read-only archive, and authorized reopening records why collaboration resumed.

**Blocked by:** 02 — Enter the Homeowner portfolio and shared Collaboration Home; 03 — Enable full Homeowner collaboration authorship and audiences; 10 — Deliver Homeowner inbox, email, digests, and preferences.

**Status:** ready-for-agent

- [ ] Revoking a Build assignment immediately removes the Build from the Homeowner portfolio and prevents every workspace read and mutation.
- [ ] Revocation cancels queued notification delivery and invalidates old collaboration, file, export, and deep-link access.
- [ ] Revocation never removes the person's WorkOS organization membership or unrelated organization roles.
- [ ] Authored posts, comments, revisions, tombstones, attachments, receipts, Action Items, and audit events remain intact after revocation.
- [ ] Open Action Items owned by a removed Homeowner enter the shared participant-removal handling path rather than being silently reassigned.
- [ ] Closing a Build makes every Homeowner Workspace surface read-only while preserving authorized search, download, and archive access under retention policy.
- [ ] A closed Build rejects posts, comments, edits, reactions, reports, Action Item mutations, and uploads with an understandable state.
- [ ] Build closure does not revoke the Build assignment or organization membership by itself.
- [ ] Only an authorized Builder or Backoffice role can reopen collaboration, and reopening requires a reason and audit event.
- [ ] Account deletion remains the only workflow allowed to remove organization membership and follows its separate retention obligations.
- [ ] Revocation, closure, archive, retention, reopen, reassignment, and membership-persistence behavior are covered through integration and browser tests.

