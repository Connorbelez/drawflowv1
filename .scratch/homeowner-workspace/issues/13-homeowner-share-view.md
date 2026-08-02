# 13 — Retain the private Homeowner Share View fallback

**What to build:** Preserve a limited private-link Share View for unprovisioned guests without confusing it with the authenticated Homeowner Workspace. The Share View exposes only explicitly published safe progress, schedule, Documents, and Media, and it never permits collaboration or canonical Build mutations.

**Blocked by:** 05 — Publish safe Build events into Homeowner collaboration; 06 — Project homeowner-safe Progress and Schedule views; 07 — Project Documents & Media with governed provenance.

**Status:** ready-for-agent

- [ ] An authorized Builder can create a Build-scoped private Share View from explicitly published Homeowner-safe content.
- [ ] Share View tokens are hashed at rest, scoped, revocable, expirable where configured, rate-limited, and audited.
- [ ] The Share View presents only explicitly published progress, safe schedule context, next activity, selected Documents and Media, and approved Builder contact information.
- [ ] Evidence, geofence details, risk, lender comments, financing, working-capital analysis, policy limits, internal approval state, and unrelated participant data never serialize.
- [ ] The Share View cannot create posts, comments, reactions, mentions, Action Items, uploads, approvals, or canonical Build mutations.
- [ ] Revocation takes effect immediately for new requests and invalidates cached or deep-linked access according to the token contract.
- [ ] File access uses safe derivatives and request-time source authorization rather than exposing raw storage locations or unnecessary metadata.
- [ ] The product labels this surface as a Share View and directs provisioned Homeowners to the authenticated Homeowner Workspace.
- [ ] Authenticated Homeowner Workspace access never depends on possession of a Share View token.
- [ ] Token lifecycle, redaction, rate limiting, safe projection, file delivery, and mutation denial are covered by contract and browser tests.

