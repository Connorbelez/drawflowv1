# Lender Portal MVP work-package evidence

## Identity

- Work package: `LP-P2-04`
- Phase handoff: `LP-HO-P2`
- Requirement selectors: `LP-PERM-05..LP-PERM-06`, `LP-PERM-10`, `LP-PERM-15`, `LP-AC-PROP-05..LP-AC-PROP-07`, `LP-US-033..LP-US-042`, `LP-E2E-01`, `LP-E2E-04`, `LP-PROT-ASSIGN`, `LP-QG-05..LP-QG-09`, `LP-VSG-01..LP-VSG-10`
- Upstream certification SHAs: `6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`, `1b9f4f421968fa194750cf0f50e4739419c7cab1`, `c9d67318ea436c7117388086c908b1ec749b4730`, `77145bfb0a6d51a5e8030f17e90b24b7104485fd`
- Provisional Phase 1 candidate: `7837a1cd5409be895020adf406947938333a66fa`
- Accepted Phase 1 SHA: `6ba68e82a7c445074b11ae7f08f3c901a3c3b2b9`
- Provisional-to-accepted baseline reconciliation: documentation and evidence only; accepted Phase 1 product code is unchanged
- Base SHA: `77145bfb0a6d51a5e8030f17e90b24b7104485fd`
- Accepted SHA: `f6c2cda897048f597f6b4e827597ed8d474bbe89`
- Branch: `codex/lp-phase-2-proposal-lifecycle`
- Implementer: Codex
- Independent verifier: reserved for fresh read-only LP-P2-05
- Verified at: implementation evidence recorded 2026-08-14; independent phase acceptance remains pending

## Canonical ownership

- Existing owners extended: `convex/production_proposals.ts`, the canonical proposal detail loaders, `src/features/production-proposals/ProductionProposalSurfaces.tsx`, and `src/routes/backoffice/proposals.$planId.tsx`.
- New owners introduced and why: `ProposalLenderAssignmentSection.tsx` extracts the selected `LP-PROT-ASSIGN` route/component into a reusable production surface while keeping all persistence in canonical Convex commands. The lender lifecycle projection is a server-filtered query, not a client authorization layer.
- Parallel models checked: no proposal, organization, membership, approval, closing, activation, or audit state is duplicated in the UI; the surface reads production detail, assignment, approval, and lifecycle projections.

## Change proof

- Changed files: `convex/production_proposals.ts`, `convex/production_proposals.test.ts`, `src/features/production-proposals/ProductionProposalSurfaces.tsx`, `src/features/production-proposals/ProposalLenderAssignmentSection.tsx`, its focused test, and `src/routes/backoffice/proposals.$planId.tsx`.
- State transitions affected: Back Office assignment and withdrawal are wired to canonical commands; the surface exposes policy editing, lender confirmation, closing, and activation as separate transitions.
- Participant surfaces affected: Back Office proposal header assignment row and focused modal; Back Office detail lifecycle summary; Builder-facing string detail remains free of lender identity/history; lender-only lifecycle projection is organization-scoped and sanitizes former assignment fields.
- Projection and consumer effects: Back Office receives bounded assignment history and approval summary; Builder receives lifecycle axes without lender identity; assigned lenders receive only their current or former organization assignment and lifecycle state.
- Audit effects: the UI submits auditable assignment/withdrawal reasons to the existing command/event writers; no client-side audit event is created.
- Notification effects: existing toast and live-region feedback only; no new notification delivery owner.
- Attachment or document-access effects: none.
- Prototype contract, if applicable: direct promotion of `LP-PROT-ASSIGN` Variant A from `src/components/prototypes/BackOfficeLenderAssignmentPrototype.tsx`; compact row, focused modal, policy snapshot, impact summary, current/history states, focus return, acknowledgement reset, long-name wrapping, and narrow scrolling are retained.
- Rollback and escalation effects: remove the production surface seam or revert the accepted range without deleting assignment history or canonical lifecycle records.

## Automated verification

| Command | Result | Requirement IDs |
|---|---|---|
| `bun run test -- convex/production_proposals.test.ts` | Passed: 179 tests | `LP-AC-PROP-05..LP-AC-PROP-07`, `LP-E2E-01`, `LP-E2E-04` |
| `bun run test -- src/features/production-proposals/ProposalLenderAssignmentSection.test.tsx` | Passed: 2 tests | `LP-PROT-ASSIGN`, `LP-VSG-01..LP-VSG-10` |
| `bun x tsc -p convex/tsconfig.json --noEmit` | Passed | `LP-QG-01..LP-QG-04` |
| `bun run build` | Passed; Vite/Nitro production build completed | `LP-QG-05..LP-QG-09` |
| `git diff --check` | Passed for the accepted range | package hygiene |
| `coderabbit review --committed --base-commit 77145bfb0a6d51a5e8030f17e90b24b7104485fd --agent` | No result returned after five minutes; the review process was interrupted with exit 130. No clean CodeRabbit result is claimed. | package review record |

## Multi-actor and browser verification

| Journey or scenario | Actors | Result | Evidence location |
|---|---|---|---|
| Back Office opens the promoted assignment surface | Back Office Admin | Passed in the focused UI suite; compact row opens the focused assignment dialog with policy and impact sections | `src/features/production-proposals/ProposalLenderAssignmentSection.test.tsx` |
| Assignment acknowledgement, reason, and command binding | Back Office Admin | Passed; selected organization clears acknowledgement on change and submit calls the canonical assignment callback with reason | focused assignment-surface test |
| Current assignment details, policy link, history, and withdrawal | Back Office Admin | Passed; policy editing remains separate, history is visible, withdrawal requires a reason and acknowledgement, and the canonical withdrawal callback receives the assignment ID | focused assignment-surface test |
| Builder/private projection boundary | Builder, Back Office | Passed in Convex tests; Builder receives lifecycle state but no lender assignment identity/history, while Back Office receives bounded projections | `convex/production_proposals.test.ts` |
| Lender current/withdrawn projection boundary | Active/former lender organization | Passed in Convex tests; current organization can see current state, former organization receives sanitized read-only history, unrelated organization is forbidden | `convex/production_proposals.test.ts` |
| Authenticated browser journey | n/a | Full in-app browser acceptance remains reserved for LP-P2-05; no browser result is self-certified here | LP-P2-05 |

## Negative proof

- Forbidden tenant and organization cases: server queries and mutations enforce Back Office or active lender organization authorization; the UI does not decide authorization.
- Stale, duplicate, terminal, and out-of-order cases: pending controls, empty eligible-lender state, current-assignment state, withdrawn history, and the canonical command guards are covered by the production tests and component state paths.
- Privacy checks: the Builder string detail loader returns lifecycle axes but null/empty lender assignment projections; lender-only projection omits withdrawal reason and actor identity.
- Idempotency checks: UI callbacks delegate to the idempotent/guarded assignment, withdrawal, closing, and activation commands; no local state is treated as durable success.

## Independent acceptance

- Source requirements inspected: `docs/lender-portal-prototype-promotion.md`, the selected prototype README entry for `LP-PROT-ASSIGN`, LP-P2-04 packet, LP-P2 handoff, feature brief/spec/implementation-plan pointers, and canonical proposal/authorization owners.
- Diff inspected at accepted SHA: yes, committed range `77145bfb0a6d51a5e8030f17e90b24b7104485fd..f6c2cda897048f597f6b4e827597ed8d474bbe89`.
- Automated evidence rerun or independently checked: implementer reran Convex tests, the focused UI tests, Convex TypeScript, build, and diff hygiene.
- Prototype parity accepted: implementation follows the selected Variant A directly; independent visual/browser parity is reserved for LP-P2-05.
- Unplanned dependencies: CodeRabbit review did not return within five minutes; Convex codegen requires an absent deployment context in this isolated checkout.
- Decision: implementation-complete with exact-SHA evidence; independent acceptance remains pending LP-P2-05.
- Rejection reasons, if any: none recorded for the implementation packet.
