# 06 — Complete participant lifecycle and role-complete Build access

**What to build:** Give every approved Build participant a production collaboration journey while preserving organization-wide lender authority, Build-scoped external participation, immediate revocation, and immutable historical attribution.

**Blocked by:** 02 — Enforce tenant collaboration rollout state; 03 — Bind HITL approval to a trusted human actor and atomic publication bundle; 04 — Enforce canonical typed-reference ACLs and a role-safe @ index; 05 — Enforce operation-specific Action Item RBAC.

**Status:** ready-for-agent

**Source contracts:** Build Collaboration Product Contract §§2–4; Build Collaboration Production Implementation Plan — Participation and tenant rollout, Contractor and Homeowner access, and Tasks 4 and 12; Build Collaboration Cutover Runbook — Parity Checks and Activation; Build Collaboration Implementation Gap Analysis — Role-complete surfaces.

- [ ] Admin and Principal Broker roles apply across every Build in the originating organization without per-Build grants.
- [ ] Broker, Builder, Broker Staff, Builder Staff, Homeowner, and Contractor access requires the correct organization role and/or active Build participation.
- [ ] Invite, acceptance, removal, reinvitation, and participation-period history are explicit and audited.
- [ ] Removal immediately revokes reads, writes, follows, and future notifications without rewriting authored history.
- [ ] Open assignments become `Unassigned — participant removed` and coordinators are notified instead of assignments being silently transferred.
- [ ] The same production collaboration module is available through the authorized lender, Builder, Builder Staff, Homeowner, and Contractor Build surfaces.
- [ ] Persona E2E tests prove each role's visible posts, placeholders, actions, receipts, references, and revocation behaviour.
