# 01 — Provision Homeowner organization members and Build assignments

**What to build:** Allow authorized Builder and Backoffice participants to invite or reuse a person as a Homeowner member of the originating brokerage organization and assign that person to a specific Build. Homeowner Workspace access must require both the active Homeowner organization role and the explicit Build assignment. Revoking a Build assignment removes Build access without removing the person's organization membership.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] An authorized Builder or Backoffice participant can invite a Homeowner by person-bound email and assign the person to one Build.
- [ ] The flow reuses an existing person and organization membership when they already exist, adds the Homeowner role without stripping other roles, and avoids duplicate identities.
- [ ] A newly invited person has an understandable pending state until authoritative identity and role synchronization completes.
- [ ] Homeowner Workspace authorization succeeds only when the person has both the active Homeowner organization role and an active assignment to the requested Build.
- [ ] The Homeowner role without a Build assignment exposes no Build data, and a Build assignment without the Homeowner role exposes no Homeowner Workspace.
- [ ] Organization and Build boundaries are evaluated independently for people who participate in Builds across multiple brokerage organizations.
- [ ] Homeowners cannot self-register into a Build, use a transferable authenticated invitation, or invite another Homeowner.
- [ ] Revoking a Build assignment removes access immediately while preserving the WorkOS organization membership and every other active organization role.
- [ ] Assignment revocation, Build closure, inactivity, and retention expiry never remove an organization membership; membership removal is limited to explicit account deletion.
- [ ] User, membership, role, and role-assignment projections remain authoritative external-directory projections rather than product-flow write targets.
- [ ] Invite, assignment, role synchronization, access, revocation, and failure states are organization-scoped, audited, and covered through external-behavior tests.

