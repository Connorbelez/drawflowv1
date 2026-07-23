# Phase 2 execution plan

Worktree: `/Users/connor/Dev/drawFlow/v1/drawflowv1-core-workflow-remediation-20260717`

Phase 2 remediates 17 findings in seven dependency-ordered waves. No more than two disjoint mutating agents may run concurrently. Shared seams (`convex/schema.ts`, `convex/production_proposals.ts`, and `convex/production_proposals.test.ts`) are serialized through the coordinator.

## Wave order

1. **Foundation builder relationship and planning semantics**
   - `UX-WF-TEN-002-002`
   - `UX-WF-PRP-001-002`
   - `UX-WF-MAT-001-001`
   - `UX-WF-CAL-001-001`
   - `UX-WF-CAL-001-002`
   - `UX-WF-CAL-001-004`
   - Lanes: auth-error and planning, with disjoint file allowlists.
2. **Backend activation, budget governance, and site-visit public reds**
   - `UX-WF-BLD-001-004`
   - `UX-WF-BUD-001-002`
   - `UX-WF-MIL-001-002`
   - `UX-WF-MIL-001-003`
   - Lanes: backend-state implements activation/budget; comms-contractor authors site-visit public red tests only.
3. **Site-visit provenance and token recovery**
   - `UX-WF-MIL-001-002`
   - `UX-WF-MIL-001-003`
   - Lane: backend-state implements against the wave 2 public reds.
4. **Selected-plan persistence**
   - `UX-WF-PRP-001-003`
   - Lane: planning; schema changes only if the public red proves persistence is absent.
5. **Contractor lifecycle and sanitized errors**
   - `UX-WF-CTR-001-001`
   - `UX-WF-CTR-002-002`
   - Lane: comms-contractor; reuse existing invite, claim, acknowledgement, review, and scope-issue state first.
6. **Operations queue, inbox, and event rail**
   - `UX-WF-OPS-001-001`
   - `UX-WF-COM-001-001`
   - `UX-WF-COM-001-002`
   - Lane: comms-contractor; add persistence only after public reds prove it necessary.
7. **Integration operations console**
   - `UX-WF-INT-001-001`
   - Lane: comms-contractor; technical-admin-only server and route gating with tenant-scoped redacted delivery operations.

## Coordinator schema gates

- Wave 1: add only a minimal `builderBrokerAssignments` model/index if auth public reds cannot pass with the existing model.
- Waves 2–3: prefer projections first; add budget governance or site-visit provenance/recovery persistence only when public reds prove the representation gap.
- Wave 4: add only the smallest durable chosen-scenario fields proved necessary by the selected-plan public red.
- Waves 6–7: exhaust contractor, audit, and event tables before adding recipient-scoped delivery/action/integration-log persistence.

## Safety invariants

- Never hand-edit `convex/_generated/**`.
- Route and mutation layers must enforce permissions; UI-only hiding is insufficient.
- Illegal controls must be absent from the DOM and accessibility tree, not merely visually masked.
- Suppress raw Convex internals, schemas, payloads, request IDs, file paths, and stack traces in rendered states.
- Never claim unproduced fixes, tests, or browser observations.
- All mutation prompts must name the absolute remediation worktree and reject the checkpoint source root.
