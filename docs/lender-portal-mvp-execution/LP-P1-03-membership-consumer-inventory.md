# LP-P1-03 membership transition-consumer inventory

Inventory date: 2026-08-14  
Inventory branch: `codex/lp-phase-1-completion`  
Inventory base: `83fe51d0e5d5a66add92bb5e70c08080fe3adf58`

## Canonical boundary

WorkOS and its webhook/sync projections remain the only owners of user,
organization, membership, role, and permission state. The bounded
`workosProjection.getLenderOrganizationManagement` query is the single
post-reconciliation membership-effect read boundary for the lender
organization-management surface. It derives every row and count from the
current projection and writes nothing.

The boundary therefore has these properties:

- event replay remains idempotent at `workosWebhookReceipts`;
- query replay creates no audit, notification, assignment, queue, recipient,
  quorum, or policy record;
- inactive or deleted memberships lose current access while their membership
  row and canonical audit history remain visible to authorized administrators;
- organization scope comes from the authenticated active organization, never a
  client-supplied organization id; and
- membership changes change current eligibility only. They cannot edit a
  locked policy snapshot or reopen terminal domain work.

## Implemented consumers

| Consumer class | Current owners | Reconciliation result |
|---|---|---|
| Active organization and route authorization | `convex/authz.ts`, `convex/activeBuildAccess.ts`, `src/components/nav-user.tsx`, `src/routes/-tenant-activation-recovery.tsx` | Every request rereads the canonical active membership and supported lender roles. Deactivation removes access on the next request; reactivation or role change restores only currently authorized actions. |
| Lender organization management | `convex/workosProjection.ts`, `convex/workosManagement.ts`, `convex/brokerageProvisioning.ts` | The new bounded read model returns only the active organization. WorkOS operations preserve pending/accepted/failed states and auditable Principal Broker protection. |
| Collaboration access and search authority | `convex/build_collaboration_access.ts`, `convex/build_collaboration_recipient_access.ts`, `convex/build_collaboration_search_authority_projection.ts`, `convex/build_collaboration_search_maintenance.ts` | Request authorization rereads canonical membership. Projection ingestion synchronizes the existing search-authority projection from the canonical membership event; event replay is receipt-idempotent. |
| Collaboration writes, drafts, moderation, inbox, and system events | `convex/build_collaboration_drafts.ts`, `convex/build_collaboration_inbox.ts`, `convex/build_collaboration_moderation.ts`, `convex/build_collaboration_system_events.ts`, `convex/proposal_collaboration.ts`, `convex/proposal_collaboration_model.ts` | Existing commands and reads enforce current organization membership and resource access. No separate lender membership record exists. |
| Build and cost-document operations | `convex/build_draw_coordination.ts`, `convex/build_submilestone_operate_authority.ts`, `convex/milestone_start.ts`, `convex/cost_documents.ts`, `convex/contractorEvidence.ts` | Commands re-evaluate the current viewer, organization, and role. A stale authenticated identity cannot retain an action after projection deactivation. Persisted domain history remains unchanged. |
| Builder, contractor, and broker administration | `convex/brokerAssignments.ts`, `convex/builderRoster.ts`, `convex/contractorOnboarding.ts`, `convex/contractorMerge.ts`, `src/features/contractors/WorkosUserAutocomplete.tsx`, Back Office user-management routes | Current canonical projection rows supply directory identity and role eligibility. These domains retain their own canonical business records and do not become a second identity system. |
| Existing queue and revocation notification utilities | `convex/build_action_item_queues.ts`, `convex/build_participant_revocation_notifications.ts` | These are Build-domain consumers, not the future lender-portal request/review queues. Their request-time access gates already use current membership; no Phase 1 lender request or review-cycle row is fabricated. |
| Audit and management-operation history | `convex/workosManagement.ts`, `convex/brokerageProvisioning.ts`, `convex/schema.ts` | Canonical commands write reconciliation-keyed audit or operation records. The membership-effect read model reads organization history without writing or duplicating it. |

## Explicitly unaffected or non-runtime matches

- Tests, generated types, schema declarations, migration definitions, and the
  prototype README are inventory matches but are not runtime consumers.
- Back Office user management remains an internal cross-organization support
  surface. The lender surface uses the active-organization read model and never
  receives the Back Office unscoped directory.
- `production_proposals.ts` legacy development seed helpers can materialize
  disposable fixtures for the existing test suite. They are not called by the
  lender portal, are not organization-management commands, and are excluded
  from production route wiring. WorkOS webhook/sync projection remains the only
  accepted production owner.

## Future and unknown consumers

These inputs are also returned verbatim by the read boundary so later phases
cannot silently invent a different membership contract.

| Consumer | State | Owner | Deterministic input contract |
|---|---|---|---|
| Proposal assignment | Absent | Phase 2 | Active organization id + current canonical membership eligibility + persisted proposal assignment. |
| Review quorum and policy eligibility | Absent | Phase 4 | Immutable review-policy snapshot + current canonical membership eligibility + persisted review assignment. The policy snapshot is never rewritten. |
| Participant queues and counts | Absent | Phase 7 | Canonical request or review-cycle state + current canonical membership eligibility. |
| Transactional recipients and notification intent | Absent | Phase 8 | Durable domain event + resource/cycle scope + current canonical membership eligibility and access. |
| External API, analytics, reporting, and support contracts | Unknown until contract cutover | Phase 9 | Versioned external contract + canonical organization and membership identifiers. |

## Inventory command and result

The implementation-checkout preflight searched `convex/` and `src/` for role,
membership, access, assignment, queue, recipient, quorum, notification, and
audit vocabulary. It recorded 1,974 raw matches in
`/tmp/lp-p1-03-consumer-inventory.txt`. Each production match is represented by
an implemented, unaffected, absent, or unknown class above. No current
lender-portal proposal assignment, review quorum, participant queue, or
transactional-recipient state was found, so Phase 1 creates none.
