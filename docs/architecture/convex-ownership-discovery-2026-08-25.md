# Convex ownership and domain-logic discovery

Date: 2026-08-25  
Repository: DrawFlow  
Branch: `codex/fix-build-collaboration-search-drain`  
HEAD observed: `cfa64863c66340554554d33776e36bc526e136ab`  
Mode: discovery only; no production code was changed.

## Executive finding

The Convex codebase has several useful deep modules already, but the remaining spaghetti is concentrated at lifecycle seams. The same domain rule is often reconstructed by multiple query, mutation, or action handlers, while a few large handlers still own authorization, projection, persistence, audit, and scheduling decisions at once.

The highest-value first seam is Lender member deactivation. `setLenderOrganizationStatus` directly makes application assignments inactive, while the WorkOS-first deactivation path waits for the WorkOS projection before finalizing the same assignment. This is both split ownership and a correctness risk.

Other strong candidates are Build Collaboration draft/publication scheduling, Action Item construction and deadlines, active Build read projections, review-policy provenance, cost-document authorization, and Quote Package Revision lifecycle.

## Review scope and coverage

The review covered authored Convex source in the current dirty checkout. Generated code and test fixtures were excluded from the handler inventory:

- 534 non-test authored `convex/**/*.ts` source files, excluding `convex/_generated/**`, `*.test.ts`, and `*Test.ts`.
- 937 exported fluent handler chains: 268 queries, 625 mutations, and 44 actions.
- 35 migration definitions and 17 migration runners.
- 12 `httpAction` route closures in `convex/http.ts`, reviewed separately because they are registered inside `http.route` rather than as exported handler variables.
- 16 cron registrations in `convex/crons.ts`; their target Convex functions are included in the 937-handler inventory.

The machine inventory used the TypeScript AST to find exported variable declarations containing `.handler(...)`, `migrations.define(...)`, or `migrations.runner(...)`. Each discovered handler is listed in the coverage manifest at the end of this document with its kind and source line. A listed function has a discovery disposition of `reviewed; no standalone candidate unless named in a finding below`.

The review combined that inventory with handler-span triage, direct database/cross-function call scans, recent Convex history, the DrawFlow glossary, five ADRs, and four read-only domain explorers. The explorers reported evidence only; they made no edits and ran no tests.

## Architecture vocabulary

This report uses the `codebase-design` vocabulary:

- A **module** owns an **interface** and an **implementation**.
- **Depth** is leverage at the interface; a deep module hides substantial behavior behind a small interface.
- A **seam** is where behavior can change without editing the caller.
- An **adapter** satisfies an interface at a seam.
- **Locality** means that a change, bug, and verification path concentrate in one place.
- The **deletion test** asks whether deleting a suspected module removes complexity or merely moves it.

These are discovery candidates, not final interfaces. The next phase should grill one candidate before any refactor is designed.

## Ranked deepening candidates

### C1 — Restore one owner for Lender member deactivation

Strength: **Strong**  
Classification: production correctness risk; split ownership across application and WorkOS projection flows.

Files and evidence:

- `convex/lenderOrganizations.ts:722-771` — `setLenderOrganizationStatus` patches the Lender Organization and, when it becomes inactive, directly patches every active `lenderOrganizationAssignments` row to `status: "inactive"`.
- `convex/workosManagement/membership.ts:502-549` — `deactivateSharedLenderMembership` begins an idempotent deactivation, calls the WorkOS adapter, records accepted state, and waits for webhook reconciliation.
- `convex/lender_organizations/helpers.ts:235-307` — `finalizeLenderMemberDeactivationFromProjection` only finalizes an assignment after the projected WorkOS membership is inactive or deleted and the accepted deactivation matches.

Problem: two implementations own the terminal assignment transition. The organization-status mutation bypasses the WorkOS-first seam and records `unassignedByWorkosUserId` before the external membership projection confirms the change. The code has a shared record shape but no single deep lifecycle module.

Deletion test: removing the direct assignment loop from `setLenderOrganizationStatus` should leave the WorkOS-first deactivation and projection finalization as the only terminal path. If a required organization-inactivation behavior disappears, that behavior must be named explicitly rather than silently remaining in two owners.

Candidate direction: make the application-owned Lender Organization lifecycle own status changes and assignment consequences, with WorkOS management and WorkOS projection as adapters. Preserve ADR-0001: a Lender Organization remains application-owned and must not become a WorkOS Organization.

### C2 — Collapse Build Collaboration Draft/Publication/Scheduling lifecycle ownership

Strength: **Strong**  
Classification: production; duplicated transition and scheduler state logic.

Files and evidence:

- `convex/build_collaboration_drafts.ts:314` — `approveAndPublishBuildCollaborationDraft` performs approval, draft mutation, publication, audit, and outbox effects.
- `convex/build_collaboration_scheduling.ts:173` — `approveAndScheduleBuildCollaborationDraft` repeats approval and scheduled-publication behavior.
- `convex/build_collaboration_scheduling.ts:748` — `publishScheduledBuildCollaborationDraft` repeats validation, publication, approval updates, draft updates, and operational effects.
- `convex/build_collaboration_drafts.ts:368` — `invalidateDraftApprovals`.
- `convex/build_collaboration_scheduling/helpers.ts:734` — `invalidateCurrentApprovals`, an equivalent approval invalidation implementation.
- `convex/build_collaboration_scheduling.ts:58` and `convex/build_collaboration_scheduling/helpers.ts:55` — parallel cursor and scheduler-state primitives, including cancellation/activation clearing.

Problem: the Build Collaboration Draft and Publication Approval lifecycle is spread across public handlers, scheduled handlers, and helpers. A policy change crosses multiple seams, so leverage and locality are low. The top-level scheduling file retains implementations that overlap with helper implementations; the deletion test identifies unused top-level clear helpers and a required shared owner for the used duplicates.

Candidate direction: deepen one Draft/Publication Approval lifecycle module. Public mutations and scheduled jobs should be adapters that supply authorization and clock context, while the implementation owns transition planning, scheduler state, audit, and outbox effects.

Intentional constraint: Draw System Posts remain the canonical source for collaboration publication, and Action Items must not become milestone, approval, or draw-release state.

### C3 — Give the Build Action Item aggregate one construction and deadline owner

Strength: **Strong**  
Classification: production; multiple aggregate constructors and repeated deadline persistence.

Files and evidence:

- `convex/build_action_items.ts:96` — `createBuildActionItem` persists the canonical Action Item and related event, revision, labels, attachments, references, activity, audit, and outbox records.
- `convex/build_collaboration/helpers.ts:427` — `createActionItems` directly inserts `buildActionItems` and event rows for collaboration publication.
- `convex/build_collaboration.ts:340` — `publishBuildCollaborationBundle` selects the collaboration-owned constructor.
- `convex/build_action_item_queues.ts:287` and `:351` — policy due-date application and override reconstruct overlapping revision, due-date, schedule, and queue-order persistence.
- `convex/build_action_items/helpers.ts:77` and `convex/build_action_items.ts:661` — manual due-date patching is another path into the same deadline state.

Problem: Action Item creation and deadline state have more than one implementation of the same aggregate invariants. The authority adapters are legitimately different, but persistence and side-effect ordering are not localized behind a deep module.

Deletion test: neither current constructor can be deleted because each has callers. That proves a real seam rather than dead code. The correct deletion target is the duplicated implementation after canonical construction and deadline persistence are centralized.

Candidate direction: deepen canonical Action Item construction and deadline transition persistence. Keep collaboration publication, policy application, coordinator override, and ordinary manual edit as separate authorization adapters.

### C4 — Deepen active Build read projections instead of growing handler-local view models

Strength: **Strong**  
Classification: production; large query implementations and parallel persona projections.

Files and evidence:

- `convex/production_proposals/active_build_detail.ts:84-875` — `getActiveBuildDetailByString` is a 792-line query that authorizes access, loads Build data, hydrates contractors and audit events, computes draw and milestone projections, maps evidence/storage, and builds role-aware quick actions.
- `convex/production_proposals/backoffice_proposal_views.ts:278-852` — `getBackofficeDashboard` is a 575-line query that derives active Build, milestone, draw, proposal, handoff, and quick-action projections.
- `convex/lender_portal/dashboard.ts:55-326` — `getLenderDashboard` computes lender funding, progress, schedule, and action projections.
- `convex/lender_portal/build_detail.ts:56-324` and `:408-590` — `getLenderBuildDetail` and `projectLenderBuildMilestone` independently derive related lender Build state.
- `convex/lender_portal_phase5/projections.ts:150-201` — another lender-scoped review-request projection over active Build records.

Problem: the Build Workspace is the canonical shared control plane, but several persona queries re-derive active Build truth. Privacy and role differences are valid adapters; repeated funding, milestone, review, and schedule semantics are a split implementation risk. The largest query interfaces are small to callers but shallow in locality because their implementations absorb authorization, reads, derivation, and presentation mapping in one handler.

Candidate direction: deepen canonical active Build projection modules and keep Builder, Back Office, and Lender views as narrow role-aware adapters. Do not collapse privacy contracts or expose reviewer-only state to Builder routes.

### C5 — Localize Review Policy source lineage and immutable snapshots

Strength: **Worth exploring**  
Classification: production; high-leverage immutable policy lifecycle with distributed source selection.

Files and evidence:

- `convex/lender_portal_phase3.ts:321-328` — `DEFAULT_PROPOSAL_REVIEW_POLICY` defines the system baseline.
- `convex/lenderOrganizationReviewPolicies.ts:65-90` — `getEffectiveLenderOrganizationReviewPolicy` selects an organization default or the system baseline.
- `convex/lenderOrganizationReviewPolicies.ts:176-283` — organization-default versions and audit are written here.
- `convex/production_proposals/review_lifecycle_helpers.ts:102-148` — `ensureDefaultProposalReviewPolicyVersion` independently creates a Proposal policy version from the baseline.
- `convex/production_proposals/review_lifecycle_helpers.ts:150-235` — `snapshotLenderOrganizationReviewPolicy` copies an organization default into the Proposal policy lineage.
- `convex/production_proposals/proposal_review_restore.ts:23-149` and `proposal_review_commands.ts:465-631` — restore/configure paths own additional policy transitions.
- `convex/proposal_revision_lender_snapshot.ts:35-464` and `migrations/phase3.ts`, `migrations/phase9.ts` — snapshot and lock validation is repeated across runtime and migration paths.

Problem: the maintained contract requires organization defaults to extend the canonical Proposal policy owner, not create a parallel policy system. The code mostly honors this, but baseline selection, organization snapshotting, Proposal versioning, and lock validation are distributed. That makes immutable provenance harder to verify through one interface.

Candidate direction: deepen the Proposal review-policy lineage module and make the source-selection seam explicit. Preserve immutable versions, first-approval freezing, and the separate Lender Organization versus WorkOS ownership recorded in ADR-0001 and ADR-0004.

### C6 — Unify Cost Document authorization and Contractor identity scope primitives

Strength: **Strong**  
Classification: production; duplicated authorization implementations with high policy leverage.

Files and evidence:

- `convex/cost_documents/submission_support.ts:87-112` — `authorizeCostDocumentBuilder` and `authorizeCostDocumentVendorAccess`.
- `convex/cost_documents/vendor.ts:399-424` — equivalent local authorization functions.
- `convex/cost_documents/submission.ts:718` — `recordCostDocumentDraftAudit`; draft queries and mutations import audit behavior from the submission module.
- `convex/contractorEvidence/access.ts:162`, `contractorEvidence/notifications.ts:87`, `contractorOnboarding/access.ts:40`, and `contractorMerge.ts:34` — repeated `resolveBrokerageScopeOrThrow` implementations.
- `convex/contractorAuth.ts:37-63` — canonical linked-profile lookup and middleware seam already exists.
- `convex/contractorOnboarding/workflow.ts:71`, `contractorWorkspace/profile.ts:119` and `:208`, and `contractorMerge.ts:202` — multiple direct Contractor Profile lifecycle writers.

Problem: role/lifecycle adapters duplicate the same WorkOS membership, Brokerage, contractor identity, and Cost Document authorization policy. The vendor-local Cost Document wrappers are removable without behavior loss under the deletion test; Contractor scope resolution has a real shared seam. Profile lifecycle writes remain authority-specific but need one persistence owner for invariants.

Candidate direction: deepen shared Cost Document authorization/audit and Contractor identity-scope modules. Retain vendor, evidence, onboarding, self-edit, review, and backoffice merge adapters where their authority differs.

### C7 — Give Quote Package Revision one lifecycle owner and Quote Round views one projection owner

Strength: **Worth exploring**  
Classification: production; publication and reopening write the same immutable lineage from separate paths.

Files and evidence:

- `convex/quote_rounds/mutations.ts:199`, `:254`, and `:546` — draft creation/update/publication and the first direct `quotePackageRevisions` insertion.
- `convex/quote_round_lifecycle/round_handlers.ts:206` — reopening independently inserts a successor package revision.
- `convex/quote_round_lifecycle/core.ts:302` — invitation revision acknowledgement migrates prior response drafts.
- `convex/quote_rounds/list.ts:305-893` — `listQuoteRounds` is a 589-line projection query deriving draft, invitation, delivery, response, preferred-quote, and revision statuses from many tables.
- `convex/quote_rounds/composer.ts:160-400` — composer projection derives overlapping Build scope and template state for authoring.

Problem: Quote Round ownership is intentionally split among Round lifecycle, Invitation access, and Response aggregate modules, but Package Revision creation and status projection still cross those seams. The query must know many operational rules to produce derived labels, which weakens locality.

Candidate direction: deepen immutable Quote Package Revision transitions and a read-side Quote Round projection. Keep recipient-private Draft content, hard deadlines, and Quote Lifecycle Ownership unchanged.

### C8 — Remove parallel Recipient Inbox and asset-upload orchestration

Strength: **Strong for inbox; Worth exploring for assets**  
Classification: production; duplicate exported handler names and duplicated action workflow.

Files and evidence:

- `convex/production_proposals/operations_handoffs.ts:210` — `listRecipientInbox` returns a bounded non-paginated inbox with counts.
- `convex/build_collaboration_inbox.ts:49` — another exported `listRecipientInbox` reads the same `recipientDeliveries` table, paginates, filters collaboration visibility, and re-authorizes Build access.
- `convex/build_collaboration_asset_actions.ts:74` — `finalizeAndScanBuildCollaborationAssetUpload`.
- `convex/lender_portal/collaboration_asset_actions.ts:47` — `finalizeAndScanLenderBuildCollaborationAssetUpload`; both repeat finalize, abandon-on-failure, scan, and status orchestration.

Problem: the same public function name masks two inbox implementations with different pagination and visibility rules. Route-specific authorization is a valid adapter, but shared delivery projection and asset action orchestration are not localized.

Candidate direction: deepen recipient-delivery projection and asset finalize/scan implementations, with Operations, Build Collaboration, and Lender routes supplying role and resource adapters. Do not merge their privacy or pagination contracts blindly.

## Convex and clean-architecture research

This section records the design guidance used for the next refactoring phase. The
research covered the official [Convex Best Practices](https://docs.convex.dev/understanding/best-practices),
[Convex Functions overview](https://docs.convex.dev/functions/overview),
[realtime model](https://docs.convex.dev/realtime),
[The Zen of Convex](https://docs.convex.dev/understanding/zen),
[Actions](https://docs.convex.dev/functions/actions),
[scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions),
the official [Convex Chef architecture lessons](https://stack.convex.dev/lessons-from-building-an-ai-app-builder),
the [Chef source repository](https://github.com/get-convex/chef),
Convex's [custom-functions guidance](https://stack.convex.dev/custom-functions),
and the installed `fluent-convex` 0.13.0 implementation and README.

The clean-architecture model is a Convex-native form of
[Ports and Adapters](https://alistair.cockburn.us/hexagonal-architecture) with a
[Functional Core and Imperative Shell](https://functional-architecture.org/functional_core_imperative_shell):
business decisions are pure and testable; Convex, WorkOS, storage, clocks,
schedulers, and external services remain at the boundary. This is a boundary
rule, not a requirement to introduce a large framework or a generic repository
for every table.

### Target architecture

Use bounded-context modules with four explicit responsibilities:

1. **Domain core** — pure state-transition functions, policies, value objects,
   invariants, and domain errors. It must not import Convex generated types,
   `ctx`, WorkOS, UI code, storage, a clock, randomness, or an external client.
   Time and identifiers are inputs.
2. **Application module** — one use case or lifecycle transition. It loads the
   minimum state, calls the domain decision function, persists the resulting
   plan, and expresses required audit/outbox/scheduling intent. It does not
   register a Convex function or decide whether a caller is public/internal.
3. **Infrastructure adapters** — narrow Convex database readers/writers,
   WorkOS management/projection adapters, storage adapters, and scheduler or
   component adapters. A repository is justified when it protects a real
   aggregate or read model; do not hide every index and tenant predicate behind
   a generic CRUD abstraction.
4. **Inbound adapters** — fluent public/internal queries, mutations, actions,
   HTTP handlers, webhooks, and cron targets. They validate arguments, resolve
   actor and tenant context, call one application operation, and return a
   contract-shaped result.

The dependency direction is therefore:

```text
registered Convex function / HTTP / webhook / cron
                    |
          auth + validation + adapter
                    |
             application use case
                    |
       pure domain decision + invariants
                    |
       explicit ports / Convex infrastructure
```

The application module may receive a small, per-invocation capability object
backed by `QueryCtx` or `MutationCtx`. That keeps all reads and writes on the
original Convex execution context while preventing the domain core from knowing
about Convex. Prefer a plain object factory over a dependency-injection
container.

### Mapping Convex primitives to the architecture

| Convex primitive | Architectural role | Rule |
| --- | --- | --- |
| Public query | Inbound read adapter | Authenticate, authorize, call a read-model helper, and return a stable projection. Keep it deterministic and bounded. |
| Public mutation | Inbound command adapter and transaction boundary | Validate, authorize, invoke one application command, write canonical state plus required audit/outbox records in one transaction, and schedule only after the intent is durable. |
| Internal mutation | Transactional application step | Use for trusted workflow steps, projection updates, and component boundaries. It is still a real transaction, not a helper call. |
| Public action | Inbound external-I/O adapter | Use only when a client genuinely needs an external/runtime boundary. Prefer a mutation that records intent and schedules an internal action. |
| Internal action | Workflow/external-I/O adapter | Treat retries and delivery as at-least-once unless the specific Convex primitive says otherwise. Make every external effect idempotent and finish with one focused internal mutation. |
| Fluent middleware | Cross-cutting adapter policy | Auth identity, capability context, tenant context, validation, timing, and error normalization are appropriate. Domain transitions, audit ownership, and hidden writes are not. |
| Fluent reusable chain | In-process application/helper composition | Use it for direct composition inside a handler. It is preferable to `ctx.runQuery`/`ctx.runMutation` when no new transaction or component boundary is required. |
| Fluent `.extend()` / plugin | Explicit boundary behavior | Use for stable, mechanically verifiable concerns such as Zod validation or standard metadata. Keep custom behavior few, named, and easy to discover. |
| React custom hook | Client composition only | Compose `useQuery`/`useMutation` and presentation state. Do not make a hook the owner of business rules, a second cache, or canonical lifecycle state. |

### Realtime and transaction invariants

The location of a function in the repository does not determine reactivity.
Convex tracks database reads made while a registered query executes. Therefore a
plain helper or application read service remains reactive when it uses the same
`QueryCtx`/underlying `ctx.db`; extracting code from a query handler does not by
itself break subscriptions. This is an inference from Convex's dependency
tracking model and should be protected by a focused `convex-test` subscription
test for any custom database wrapper.

The safe rules are:

- Do not replace a query read with a Redis/cache/local aggregate or an action.
  A wrapper must delegate to the current Convex context, not return a stale
  snapshot.
- A database read in query middleware or a custom `input` transform becomes a
  dependency of that query. This is correct for authorization state, but an
  overly broad context loader can cause unrelated changes to invalidate many
  subscriptions.
- A `returns` transform changes the result contract; it does not create new
  reactive dependencies. Do not use it to conceal a second read model or
  lifecycle rule.
- A mutation command should update one canonical source of truth and its
  required audit/outbox state in one transaction. Do not split required writes
  into sequential `ctx.runMutation` calls.
- `ctx.runQuery` and `ctx.runMutation` are execution boundaries, not ordinary
  function calls. Use them for a real transaction/component/workflow boundary;
  use a plain helper or fluent callable chain for in-transaction reuse.
- Use a mutation to record workflow intent, then schedule work. Scheduling from
  a mutation is atomic with the mutation; action scheduling and external effects
  need idempotency and reconciliation.
- A query must not use `Date.now()` as an implicit reactive input. Use a
  materialized coarse-grained field updated by a scheduled function, or pass a
  stable time bucket as an explicit argument.
- Index before loading, paginate potentially unbounded data, and avoid broad
  `.collect()`. Any changed document in the loaded result can cause a query
  rerun or a mutation conflict.
- Mutation return values are acknowledgements, not the client's source of truth.
  The client should observe the canonical query after the transaction commits.

### How to use `fluent-convex` here

The current [`convex/fluent.ts`](../../convex/fluent.ts) has the right basic
shape for a framework boundary: it creates builders, provides identity and
timing middleware, and composes Zod validation. Keep that part small and
boring. The same file also contains Build-specific lineage resolution and
attachment logic near its top; that code performs domain reads and writes and
should move into the owning Build/Sub-milestone module. `fluent.ts` should not
become a second domain service registry.

The current [`convex/authz.ts`](../../convex/authz.ts) capability middleware is
also a useful adapter pattern. Keep the capability vocabulary and actor
resolution there, but make any database-backed organization context loader
explicit. It should establish authorization context, not perform the command's
business transition.

Recommended wrapper tiers:

- `withIdentity`: read auth identity and fail closed.
- `withActorContext`: normalize actor kind, subject, and request metadata.
- `withTenantContext`: resolve organization/brokerage scope where the route
  requires it; document that its database reads are part of the query's
  dependency set.
- `withCapability("...")`: enforce a named permission boundary.
- `withTiming` / `withTracing`: observe execution without changing state.
- `WithZod` or equivalent edge validation: validate untrusted input and output
  contracts.

Do not add an implicit `withBusinessTransaction`, `withAudit`, or
`withNotification` wrapper that silently writes after a handler. Required state
and audit ordering must be visible in the application command. In particular,
`onSuccess`-style callbacks are not a substitute for an invariant that must be
atomic with the primary mutation. Avoid long onion chains whose order changes
authorization or write semantics. A custom plugin should either be mechanical
and globally safe, or be a clearly named builder used only by a bounded context.

### Footguns to block in review and lint

- Business rules, state transitions, audit construction, or projection policy
  implemented directly in multiple handlers.
- Public functions called from server code when a plain helper or internal
  function would preserve locality and consistency.
- Multiple sequential mutations used as if they were one transaction.
- Actions used for ordinary database work, or actions called directly when a
  mutation should capture intent and schedule them.
- `Date.now()` in queries, unbounded `.collect()`, database `.filter()` where an
  index is required, and unawaited writes/schedules.
- Authorization based on caller-supplied email, organization, role, or tenant
  identifiers instead of the authenticated identity and server-side scope.
- Hidden database reads in universal middleware that create broad invalidation
  sets, or hidden database writes in middleware/transforms.
- Non-idempotent action, webhook, scheduler, or component work. Retries and
  duplicate delivery must converge on one result.
- Generic repositories that erase table-specific indexes, tenant constraints,
  aggregate boundaries, or ownership. Abstraction is justified by a real seam,
  not by repeated `get/insert/patch` syntax.
- A giant shared `fluent.ts`, `authz.ts`, or `helpers.ts` module that becomes a
  new ownership sink. Shared code must be framework policy or a genuinely
  cross-domain invariant; domain-specific code belongs to its owner.
- Direct writes to WorkOS projection tables. WorkOS management and webhook
  projection remain separate adapters; product lifecycle state must not create
  a second identity or membership owner.

### Refactoring order

Use the existing ranked candidates as the first migration queue:

1. C1: move Lender member deactivation to one application lifecycle owner;
   retain WorkOS management and projection as adapters.
2. C2: make Draft/Publication Approval one transition module; public and
   scheduled handlers become adapters.
3. C3: centralize Action Item construction and deadline persistence while
   preserving authority-specific command adapters.
4. C4: deepen canonical active-Build read projections, then keep Builder,
   Back Office, and Lender privacy differences in narrow adapters.
5. C5-C8: apply the same pattern to policy lineage, Cost Document/Contractor
   authorization, Quote Package Revision, recipient delivery, and asset scans.

For each candidate, extract the pure decision first, then introduce the
smallest application capability object, move persistence and required side
effects behind that owner, and leave the existing fluent function as the
registered adapter. Verify three seams separately: pure domain tests,
application tests with fake ports, and Convex adapter tests for authorization,
transactionality, and observable realtime readback. Delete the old duplicate
only after its callers are migrated and the deletion test passes.

### Linting assessment

The architecture is partially enforceable by linting, but not reducible to
linting. Mechanical dependency direction and unsafe mechanics are suitable for
rules; canonical ownership, domain meaning, aggregate boundaries, realtime
invalidation, transaction intent, and idempotency still require review and
focused Convex tests.

Biome 2.4.14 provides useful primitives:

- `style/noRestrictedImports` can protect future `convex/domain/**` modules from
  Convex, WorkOS, UI, storage, and other infrastructure imports.
- `style/noRestrictedGlobals` can protect pure modules from clock and randomness
  globals without banning server timestamps from mutations and migrations.
- `nursery/noFloatingPromises` can require awaited database and scheduler calls.
- `suspicious/noImportCycles` can protect new domain/application directories.
- `nursery/noExcessiveLinesPerFile` and cognitive-complexity rules are useful
  warning signals for shallow handlers, but are not ownership proofs.

The current repository-wide `suspicious/noImportCycles` scan reported 187
warnings on 2026-08-25. It should therefore remain advisory or be scoped to
new architecture directories until the existing baseline is reduced. A future
dedicated Bun/TypeScript AST check should report handler-level semantic
mechanics: `Date.now()` in reachable query code, sequential or looped
`ctx.run*` calls, unbounded reads, unvalidated public handlers, cross-context
writes, duplicate lifecycle writers, and effects without idempotency or
reconciliation. That checker needs a reviewed baseline and fixture tests before
becoming blocking.

## Cross-cutting secondary finding: audit/event writes have many adapters without one invariant owner

The `auditEvents` table is intentionally append-only and cross-domain, but its construction invariants are spread across many implementations:

- `convex/lender_organizations/helpers.ts:198` — `writeLenderAudit`.
- `convex/quote_invitation_access/recipient.ts:95` — `writeQuoteRecipientAuditEvent`.
- `convex/proposal_collaboration/audit.ts:4` — `writeCollaborationAuditEvent`.
- `convex/lender_portal_phase5/shared.ts:646` — `writeReviewAudit`.
- `convex/assistant/access.ts:431` — `writeProposalAudit`.
- `convex/production_proposals/proposal_copy_audit.ts:302` and `:365` — event writers that also write proposal history and outbox records.
- Direct `auditEvents` writes occur in at least 12 production modules, including Build Collaboration, Cost Documents, Site Visits, WorkOS Management, Data Retention, and Lender Portal release.

The right candidate is a deep audit/event construction module with domain-specific adapters, not a single flattened event model. The deletion test must preserve event-specific side effects such as Proposal history, outbox delivery, privacy-minimized retention records, and collaboration audit semantics.

## Cross-cutting secondary finding: Assistant action routing has a cyclic seam

`convex/assistant.ts:757-906` owns commit validation, chained draw-key resolution, domain execution, outcome persistence, and status transitions. It imports `assistant/action_mutations.ts` and `assistant/mutations.ts`, while those modules import back from `../assistant` (`assistant/action_mutations.ts:25`, `assistant/mutations.ts:76`). This makes the Assistant facade a shallow module with a cyclic implementation seam. A deepened Assistant action-catalog adapter should not become a second owner of Proposal, Build, Draw, Cost, or Site Visit lifecycle rules.

## Intentional separations and positive controls

These cases were inspected and are not reported as defects:

- `convex/production_proposals.ts` is an explicit stable facade that re-exports handlers from bounded implementation modules. Its deletion test says removing it would break generated function references, so it is a useful adapter rather than a parallel implementation.
- `convex/build_collaboration_search_maintenance.ts` delegates most search-drain state-machine behavior to `build_collaboration_search_maintenance/helpers.ts`. Despite its size, the exported handlers are comparatively thin; preserve this as a positive deep-module pattern while checking the scheduling duplicate noted in C2.
- Browser-session and claimed-account Quote Response handlers in `quote_response_drafts.ts` and `quote_response_submissions.ts` deliberately share `*ForAccess` implementations. This follows the Canonical Quote Response Draft contract and is not parallel ownership.
- Proposal versus active Build planning and financing remain separate lifecycle aggregates under ADR-0002, ADR-0004, and ADR-0005. Deepen shared invariants or make the adapter seam explicit; do not merge the aggregates.
- WorkOS Management does not directly write WorkOS projection tables. `workosProjection/events.ts` remains the projection writer. The concern is downstream orchestration in `upsertMembership`, not ownership of WorkOS state.
- `demo_*` handlers and `demo_*` tables are demo infrastructure. Duplicate `demo_getBackofficeDashboard` exports are not production parallel implementations.
- Migration definitions and runners are tracked for coverage but are not runtime ownership candidates. Legacy note, search, audit, and sub-milestone migrations are bounded or fail-closed by design.
- Lender Organization and WorkOS Organization remain separate under ADR-0001. A proposed Lender Organization module must not become a WorkOS membership system.

## Discovery-only verification

No production tests, builds, code generation, deployment, or external state changes were run for this discovery pass. The verification was structural and source-based:

- AST inventory: 937 handler chains + 35 migration definitions + 17 migration runners.
- `rg` cross-check: 937 fluent `.handler(...)` chains and 12 HTTP route closures.
- Duplicate exported handler-name scan: two names, `listRecipientInbox` in two production modules and `demo_getBackofficeDashboard` in two demo modules.
- Recent history inspected: `cfa64863` large Convex refactor, `4091b25d` Build Collaboration search-drain serialization, and `1469f133` Lender Organization review defaults.
- Existing dirty changes were preserved. The only intended repository addition from this review is this Markdown artifact.

## Coverage manifest

Every entry below is an exported authored Convex handler or migration registration discovered by the AST inventory. `@N` is the declaration line. Unless a function is named in C1–C8 or a secondary finding, its disposition is: `reviewed; no standalone candidate in this discovery pass`.

| File | Function | Kind | Declaration | Disposition |
| --- | --- | --- | ---: | --- |
| `convex/assistant.ts` | `getProviderStatus` | action | 244 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `generateSiteVisitGuidance` | action | 267 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `runAssistantTurn` | action | 295 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `planAssistantTurn` | action | 312 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `ensureThread` | mutation | 325 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `createActionPlan` | mutation | 360 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `getActionPlan` | query | 424 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `listReminderTargets` | query | 444 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `getAssistantContext` | query | 609 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `createWorkflowRun` | mutation | 649 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `getActiveWorkflowRun` | query | 662 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `updateWorkflowStep` | mutation | 671 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `appendWorkflowSteps` | mutation | 725 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `commitActionPlan` | mutation | 757 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `recordTraceEvent` | mutation | 910 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `listTraceEvents` | query | 939 | secondary; Assistant action-routing seam |
| `convex/assistant.ts` | `createNavigationTrace` | mutation | 955 | secondary; Assistant action-routing seam |
| `convex/brokerageProvisioning.ts` | `listBrokerageProvisioning` | query | 39 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/provisioning.ts` | `provisionBrokerageProfile` | mutation | 25 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/provisioning.ts` | `provisionFairLendBrokerage` | mutation | 151 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/provisioning.ts` | `provisionBuilderProfile` | mutation | 584 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/provisioning.ts` | `linkBuilderAccount` | mutation | 620 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/provisioning.ts` | `unlinkBuilderAccount` | mutation | 690 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/provisioning.ts` | `provisionNewBuilder` | action | 757 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/provisioning.ts` | `completeBuilderOnboardingCommand` | mutation | 829 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/relationship.ts` | `getTenantActivationState` | query | 125 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/relationship.ts` | `getBuilderBrokerRelationshipSummary` | query | 304 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/relationship.ts` | `repairOwnBuilderBrokerAssignment` | mutation | 417 | reviewed; no standalone candidate in this discovery pass |
| `convex/brokerageProvisioning/relationship.ts` | `reconcileBrokerageBuilderAssignments` | mutation | 486 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_details.ts` | `getBuildActionItemDetail` | query | 180 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_details.ts` | `addBuildActionItemComment` | mutation | 473 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_details.ts` | `toggleBuildActionItemCommentReaction` | mutation | 632 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_queues.ts` | `listBuildActionItemQueue` | query | 167 | see C3; Action Item construction/deadlines |
| `convex/build_action_item_queues.ts` | `listMyBuildActionItemQueue` | query | 208 | see C3; Action Item construction/deadlines |
| `convex/build_action_item_queues.ts` | `applyBuildActionItemPolicyDueDate` | mutation | 287 | see C3; Action Item construction/deadlines |
| `convex/build_action_item_queues.ts` | `overrideBuildActionItemPolicyDueDate` | mutation | 351 | see C3; Action Item construction/deadlines |
| `convex/build_action_item_queues.ts` | `replaceBuildActionItemReferences` | mutation | 437 | see C3; Action Item construction/deadlines |
| `convex/build_action_item_queues.ts` | `processBuildActionItemDeadlines` | mutation | 565 | see C3; Action Item construction/deadlines |
| `convex/build_action_item_queues.ts` | `processOneBuildActionItemDeadline` | mutation | 628 | see C3; Action Item construction/deadlines |
| `convex/build_action_item_structure.ts` | `getBuildActionItemStructureContext` | query | 105 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_structure.ts` | `addBuildActionItemChecklistItem` | mutation | 275 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_structure.ts` | `toggleBuildActionItemChecklistItem` | mutation | 356 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_structure.ts` | `linkBuildActionItems` | mutation | 419 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_structure.ts` | `unlinkBuildActionItemRelation` | mutation | 564 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_structure.ts` | `repairBuildActionItemRelation` | mutation | 668 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_workflow.ts` | `getBuildActionItemWorkflowContext` | query | 72 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_workflow.ts` | `assignBuildActionItem` | mutation | 160 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_workflow.ts` | `acceptBuildActionItemAssignment` | mutation | 220 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_item_workflow.ts` | `transitionBuildActionItem` | mutation | 352 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_action_items.ts` | `createBuildActionItem` | mutation | 96 | see C3; Action Item construction/deadlines |
| `convex/build_action_items.ts` | `listBuildActionItems` | query | 412 | see C3; Action Item construction/deadlines |
| `convex/build_action_items.ts` | `updateBuildActionItem` | mutation | 661 | see C3; Action Item construction/deadlines |
| `convex/build_collaboration_acknowledgements.ts` | `acknowledgeBuildCollaborationPost` | mutation | 12 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_asset_actions.ts` | `finalizeAndScanBuildCollaborationAssetUpload` | action | 74 | see C8; delivery/asset orchestration |
| `convex/build_collaboration_asset_maintenance.ts` | `getBuildCollaborationAssetScanInput` | query | 17 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_asset_maintenance.ts` | `recordBuildCollaborationAssetScanResult` | mutation | 63 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_asset_maintenance.ts` | `processBuildCollaborationAssetScan` | action | 178 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_asset_maintenance.ts` | `abandonBuildCollaborationAssetUploadAfterFailure` | mutation | 260 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_asset_maintenance.ts` | `expireBuildCollaborationAssetStagingSession` | mutation | 326 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_asset_maintenance.ts` | `expireBuildCollaborationAssetStagingSessions` | mutation | 353 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_assets.ts` | `beginBuildCollaborationAssetUpload` | mutation | 100 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_assets.ts` | `finalizeBuildCollaborationAssetUpload` | mutation | 213 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_assets.ts` | `registerBuildCollaborationAssetUploadedStorage` | mutation | 222 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_assets.ts` | `finalizeBuildCollaborationAssetUploadForAction` | mutation | 297 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_assets.ts` | `listBuildCollaborationAssetStatuses` | query | 455 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_assets.ts` | `authorizeBuildCollaborationAssetDownload` | mutation | 495 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_assets.ts` | `abandonMyBuildCollaborationAssets` | mutation | 542 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_certification.ts` | `getBuildCollaborationCutoverCertificationState` | query | 16 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_rehearsals.ts` | `beginBuildCollaborationRollbackRehearsal` | mutation | 61 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_rehearsals.ts` | `advanceBuildCollaborationRollbackSnapshot` | mutation | 143 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_rehearsals.ts` | `beginBuildCollaborationRollbackAfterSnapshot` | mutation | 234 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_rehearsals.ts` | `getBuildCollaborationRollbackCanaryContext` | query | 280 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_rehearsals.ts` | `executeBuildCollaborationLegacyWriteDenialCanary` | action | 317 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_rehearsals.ts` | `recordBuildCollaborationLegacyWriteDenialCanary` | mutation | 362 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_cutover_rehearsals.ts` | `attestBuildCollaborationCutoverArtifact` | mutation | 411 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_api.ts` | `getMyBuildCollaborationPushSubscription` | query | 23 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_api.ts` | `registerMyBuildCollaborationPushSubscription` | mutation | 82 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_api.ts` | `revokeMyBuildCollaborationPushSubscription` | mutation | 229 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_api.ts` | `listMyBuildCollaborationExternalDeliveryActivity` | query | 297 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_maintenance.ts` | `prepareDueBuildCollaborationExternalDeliveries` | mutation | 62 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_maintenance.ts` | `cancelLegacyDeliveriesMissingSourceRevision` | mutation | 105 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_maintenance.ts` | `prepareBuildCollaborationExternalOutbox` | mutation | 153 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_maintenance.ts` | `completeBuildCollaborationExternalDeliveryAttempt` | mutation | 266 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_reconciliation.ts` | `continueBuildCollaborationExternalDeliveryReconciliation` | mutation | 231 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_reconciliation.ts` | `continueBuildCollaborationExternalDeliveryCancellation` | mutation | 274 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_transport.ts` | `processBuildCollaborationExternalDeliveries` | action | 11 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_delivery_transport.ts` | `dispatchBuildCollaborationExternalOutbox` | action | 31 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_drafts.ts` | `saveMyBuildCollaborationDraft` | mutation | 28 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_drafts.ts` | `listMyBuildCollaborationDrafts` | query | 149 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_drafts.ts` | `getMyBuildCollaborationDraftIdentity` | query | 207 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_drafts.ts` | `discardMyBuildCollaborationDraft` | mutation | 222 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_drafts.ts` | `approveAndPublishBuildCollaborationDraft` | mutation | 259 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_editing.ts` | `editBuildCollaborationPost` | mutation | 73 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_editing.ts` | `editBuildCollaborationComment` | mutation | 173 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_editing.ts` | `tombstoneBuildCollaborationPost` | mutation | 340 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_editing.ts` | `tombstoneBuildCollaborationComment` | mutation | 392 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_editing.ts` | `listBuildCollaborationPostRevisionHistory` | query | 449 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_editing.ts` | `listBuildCollaborationCommentRevisionHistory` | query | 481 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `readBuildCollaborationArchivePlan` | query | 25 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `readBuildCollaborationArchiveRecord` | query | 59 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `reserveBuildCollaborationArchiveChunk` | mutation | 147 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `completeBuildCollaborationArchiveChunk` | mutation | 213 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `completeBuildCollaborationArchive` | mutation | 247 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `failBuildCollaborationArchive` | mutation | 352 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `cleanupBuildCollaborationExportArchive` | mutation | 374 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `cleanupExpiredBuildCollaborationExportArchives` | mutation | 465 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_archive.ts` | `generateBuildCollaborationFullArchive` | action | 508 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_export_plan.ts` | `planBuildCollaborationFullArchive` | mutation | 41 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_exports.ts` | `requestBuildCollaborationExport` | mutation | 84 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_exports.ts` | `downloadBuildCollaborationExport` | mutation | 222 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_exports.ts` | `authorizeBuildCollaborationExportAssetDownload` | mutation | 309 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_exports.ts` | `authorizeBuildCollaborationExportArchiveChunkDownload` | mutation | 349 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_focus.ts` | `resolveBuildDetailTarget` | query | 147 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_focus.ts` | `getFocusedBuildActionItemContext` | query | 352 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_focus.ts` | `getFocusedBuildCollaborationReference` | query | 403 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_focus.ts` | `getFocusedBuildCollaborationAssetContext` | query | 473 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_focus.ts` | `getFocusedBuildCollaborationPostContext` | query | 533 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_inbox.ts` | `listRecipientInbox` | query | 49 | see C8; delivery/asset orchestration |
| `convex/build_collaboration_inbox.ts` | `markBuildActionItemActivityRead` | mutation | 95 | see C8; delivery/asset orchestration |
| `convex/build_collaboration_legacy_note_import.ts` | `applyBuildCollaborationLegacyNoteMigrationBatch` | mutation | 28 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_legacy_note_parity.ts` | `startBuildCollaborationLegacyNoteParity` | mutation | 49 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_legacy_note_parity.ts` | `advanceBuildCollaborationLegacyNoteParity` | mutation | 140 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_legacy_note_parity.ts` | `getBuildCollaborationLegacyNoteMigrationParityReport` | query | 181 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_legacy_note_plan.ts` | `previewBuildCollaborationLegacyNoteMigrationPage` | query | 86 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_legacy_note_plan.ts` | `startBuildCollaborationLegacyNoteMigration` | mutation | 219 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_legacy_note_plan.ts` | `advanceBuildCollaborationLegacyNotePlan` | mutation | 287 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_lifecycle.ts` | `getBuildCollaborationLifecycleState` | query | 36 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_lifecycle.ts` | `closeBuildCollaboration` | mutation | 52 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_lifecycle.ts` | `reopenBuildCollaboration` | mutation | 168 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_moderation.ts` | `getBuildCollaborationModerationContext` | query | 194 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_moderation.ts` | `moderateBuildCollaborationContent` | mutation | 283 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_moderation.ts` | `appealBuildCollaborationModeration` | mutation | 399 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_moderation.ts` | `resolveBuildCollaborationModerationAppeal` | mutation | 464 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_notifications.ts` | `getMyBuildCollaborationNotificationPreferences` | query | 463 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_notifications.ts` | `updateMyBuildCollaborationNotificationPreferences` | mutation | 492 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_pin_migration.ts` | `normalizeBuildCollaborationPins` | mutation | 20 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_planning_reconciliation.ts` | `getActiveBuildPlanningReconciliation` | query | 45 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_planning_reconciliation.ts` | `getActiveBuildPlanningReconciliationSnapshot` | query | 86 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_planning_reconciliation.ts` | `getActiveBuildPlanningActivationSnapshot` | query | 126 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_planning_reconciliation.ts` | `listActiveBuildPlanningReconciliationDiffs` | query | 191 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_planning_reconciliation.ts` | `reconcileActiveBuildMilestonePlanning` | mutation | 278 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_planning_reconciliation/revision.ts` | `materializeActiveBuildPlanningRevisionChunk` | mutation | 187 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_planning_reconciliation/revision.ts` | `recoverActiveBuildPlanningRevisionMaterialization` | mutation | 432 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_push_maintenance.ts` | `cleanupTransferredBuildCollaborationPushEndpoint` | mutation | 7 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_references.ts` | `listBuildCollaborationTagOptions` | query | 156 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_resolution_migration.ts` | `migrateBuildCollaborationThreadOutcomeState` | mutation | 23 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_resolution.ts` | `getBuildCollaborationThreadContext` | query | 109 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_resolution.ts` | `resolveBuildCollaborationThread` | mutation | 205 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_resolution.ts` | `reopenBuildCollaborationThread` | mutation | 280 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_resolution.ts` | `setBuildCollaborationAnnouncementExpiration` | mutation | 325 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_resolution.ts` | `expireBuildCollaborationAnnouncementProminence` | mutation | 396 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_retention.ts` | `getBuildCollaborationRetentionState` | query | 52 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_retention.ts` | `setBuildCollaborationRetentionPolicy` | mutation | 173 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_retention.ts` | `placeBuildCollaborationLegalHold` | mutation | 263 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_retention.ts` | `releaseBuildCollaborationLegalHold` | mutation | 309 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_retention.ts` | `purgeExpiredBuildCollaborationContent` | mutation | 353 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_rollout.ts` | `getBuildCollaborationRolloutState` | query | 30 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_rollout.ts` | `recordBuildCollaborationMigrationParityEvidence` | mutation | 48 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_rollout.ts` | `transitionBuildCollaborationTenantStatus` | mutation | 110 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_scheduling.ts` | `getBuildCollaborationSchedulingCapabilities` | query | 148 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `approveAndScheduleBuildCollaborationDraft` | mutation | 173 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `executeScheduledBuildCollaborationPublication` | action | 295 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `recordRetryableScheduledBuildCollaborationFailure` | mutation | 333 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `processDueBuildCollaborationScheduledPublications` | mutation | 390 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `scheduleCurrentDrawSystemPostActivationsInternal` | mutation | 435 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `scheduleCurrentMilestoneSystemPostActivationsInternal` | mutation | 456 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `executeScheduledMilestoneSystemPostActivation` | mutation | 482 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `executeScheduledDrawSystemPostActivation` | mutation | 552 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `reconcileDueMilestoneSystemPosts` | mutation | 628 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `reconcileDueMilestoneSystemPostsForBuild` | mutation | 676 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `reconcileDueDrawSystemPosts` | mutation | 688 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `reconcileDueDrawSystemPostsForBuild` | mutation | 736 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `publishScheduledBuildCollaborationDraft` | mutation | 748 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_scheduling.ts` | `pauseScheduledBuildCollaborationDraft` | mutation | 837 | see C2; draft/publication/scheduling seam |
| `convex/build_collaboration_search_maintenance.ts` | `ensureBuildCollaborationSearchMaintenance` | mutation | 137 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `inspectBuildCollaborationSearchMaintenance` | query | 164 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `inspectBuildCollaborationSearchProjection` | query | 207 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `startBuildCollaborationSearchCutoverVerification` | mutation | 284 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `inspectBuildCollaborationSearchCutoverVerification` | query | 338 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `processBuildCollaborationSearchCutoverVerification` | mutation | 377 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `processBuildCollaborationSearchDrain` | mutation | 533 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `completeBuildCollaborationSearchDrain` | mutation | 569 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `executeBuildCollaborationSearchJob` | action | 616 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `resumeBuildCollaborationSearchJob` | mutation | 633 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `processBuildCollaborationSearchJob` | mutation | 658 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `recordBuildCollaborationSearchJobFailure` | mutation | 676 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search_maintenance.ts` | `recoverBuildCollaborationSearchJob` | mutation | 705 | positive control; deep search-drain implementation |
| `convex/build_collaboration_search.ts` | `getBuildCollaborationSearchReadiness` | query | 215 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_search.ts` | `getAuthorizedBuildCollaborationSearchReadiness` | query | 224 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_search.ts` | `searchAuthorizedBuildCollaborationIndexPage` | query | 234 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_search.ts` | `searchBuildCollaboration` | action | 303 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_system_events.ts` | `publishBuildCollaborationSystemEvent` | mutation | 158 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_system_post_backfill.ts` | `previewBuildCollaborationSystemPostBackfill` | query | 70 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_system_post_backfill.ts` | `startBuildCollaborationSystemPostBackfill` | mutation | 96 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_system_post_backfill.ts` | `advanceBuildCollaborationSystemPostBackfill` | mutation | 181 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `addBuildCollaborationComment` | mutation | 71 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `listBuildCollaborationComments` | query | 281 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `getFocusedBuildCollaborationCommentContext` | query | 315 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `reactToBuildCollaborationPost` | mutation | 356 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `reactToBuildCollaborationComment` | mutation | 412 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `toggleBuildCollaborationPin` | mutation | 479 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `toggleBuildCollaborationFollow` | mutation | 585 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_threads.ts` | `markBuildCollaborationPostViewed` | mutation | 635 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_viewer.ts` | `getBuildCollaborationViewerBinding` | query | 12 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhook_transport.ts` | `sendBuildCollaborationWebhookRequest` | action | 26 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `createBuildCollaborationWebhookEndpoint` | mutation | 106 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `listBuildCollaborationWebhookEndpoints` | query | 195 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `updateBuildCollaborationWebhookEndpoint` | mutation | 216 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `rotateBuildCollaborationWebhookSecret` | mutation | 276 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `revokeBuildCollaborationWebhookEndpoint` | mutation | 322 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `listBuildCollaborationWebhookDeliveries` | query | 365 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `getBuildCollaborationWebhookDelivery` | query | 386 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `replayBuildCollaborationWebhookDelivery` | mutation | 444 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `dispatchBuildCollaborationWebhookDelivery` | action | 684 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `reserveBuildCollaborationWebhookDelivery` | mutation | 782 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `completeBuildCollaborationWebhookDelivery` | mutation | 855 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `recoverBuildCollaborationWebhookDeliveryLease` | mutation | 956 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration_webhooks.ts` | `recoverExpiredBuildCollaborationWebhookDeliveryLeases` | mutation | 976 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration.ts` | `approveAndPublishBuildCollaborationBundle` | mutation | 65 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_collaboration.ts` | `listBuildCollaborationFeed` | query | 448 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_draw_coordination.ts` | `joinDrawCoordination` | mutation | 546 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_draw_coordination.ts` | `leaveDrawCoordination` | mutation | 632 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_draw_coordination.ts` | `getDrawCoordinationState` | query | 693 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participant_activation.ts` | `continueBuildParticipantActivation` | mutation | 27 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participant_revocation_notifications.ts` | `continueParticipantRevocationNotifications` | mutation | 64 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participant_revocation.ts` | `continueBuildParticipantRevocationCleanup` | mutation | 153 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participants.ts` | `listMyActiveBuildParticipations` | query | 40 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participants.ts` | `getMyBuildParticipationScope` | query | 72 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participants.ts` | `listBuildParticipantHistory` | query | 152 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participants.ts` | `inviteBuildParticipant` | mutation | 199 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participants.ts` | `reinviteBuildParticipant` | mutation | 224 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participants.ts` | `acceptBuildParticipantInvitation` | mutation | 249 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_participants.ts` | `removeBuildParticipant` | mutation | 277 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_companion_cutover.ts` | `previewBuildSubmilestoneCompanionCutover` | query | 136 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_companion_cutover.ts` | `startBuildSubmilestoneCompanionCutover` | mutation | 148 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_companion_cutover.ts` | `advanceBuildSubmilestoneCompanionCutover` | mutation | 263 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_companion_cutover.ts` | `getBuildSubmilestoneCompanionCutoverReports` | query | 309 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_companion_cutover.ts` | `getBuildActionItemMetricDimensions` | query | 349 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `getActiveBuildSubmilestoneReview` | query | 58 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `recommendActiveBuildSubmilestoneReview` | mutation | 115 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `requestActiveBuildSubmilestoneChanges` | mutation | 218 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `waiveActiveBuildSubmilestoneSiteVisit` | mutation | 327 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `approveActiveBuildSubmilestone` | mutation | 417 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `retractActiveBuildSubmilestoneApproval` | mutation | 544 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `approveActiveBuildMilestoneReview` | mutation | 653 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_review.ts` | `retractActiveBuildMilestoneApproval` | mutation | 751 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_workspace.ts` | `getBuildSubmilestoneWorkspaceBootstrap` | query | 310 | reviewed; no standalone candidate in this discovery pass |
| `convex/build_submilestone_workspace.ts` | `getBuildSubmilestoneWorkspaceCollection` | query | 322 | reviewed; no standalone candidate in this discovery pass |
| `convex/builderRoster.ts` | `listBuilderRoster` | query | 105 | reviewed; no standalone candidate in this discovery pass |
| `convex/builderRoster.ts` | `listAssignableBrokers` | query | 467 | reviewed; no standalone candidate in this discovery pass |
| `convex/builderRoster.ts` | `assignBuildersToBroker` | mutation | 542 | reviewed; no standalone candidate in this discovery pass |
| `convex/builderRoster.ts` | `setBuilderProfileStatus` | mutation | 653 | reviewed; no standalone candidate in this discovery pass |
| `convex/builderRoster.ts` | `renameBuilderProfile` | mutation | 722 | reviewed; no standalone candidate in this discovery pass |
| `convex/builderRoster/unprovisioned.ts` | `listUnprovisionedBuilders` | query | 70 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorEvidence/evidence.ts` | `generateContractorEvidenceUploadUrl` | mutation | 25 | see C6; Contractor identity scope |
| `convex/contractorEvidence/evidence.ts` | `uploadContractorSupportingEvidence` | mutation | 36 | see C6; Contractor identity scope |
| `convex/contractorEvidence/evidence.ts` | `listContractorEvidence` | query | 200 | see C6; Contractor identity scope |
| `convex/contractorEvidence/evidence.ts` | `listContractorEvidenceForReview` | query | 243 | see C6; Contractor identity scope |
| `convex/contractorEvidence/evidence.ts` | `reviewContractorEvidence` | mutation | 297 | see C6; Contractor identity scope |
| `convex/contractorEvidence/evidence.ts` | `addressContractorEvidenceFeedback` | mutation | 363 | see C6; Contractor identity scope |
| `convex/contractorEvidence/handoffs.ts` | `acknowledgeContractorAssignment` | mutation | 22 | see C6; Contractor identity scope |
| `convex/contractorEvidence/handoffs.ts` | `acknowledgeContractorScheduleChange` | mutation | 102 | see C6; Contractor identity scope |
| `convex/contractorEvidence/notifications.ts` | `listContractorNotifications` | query | 23 | see C6; Contractor identity scope |
| `convex/contractorEvidence/notifications.ts` | `markContractorNotificationRead` | mutation | 53 | see C6; Contractor identity scope |
| `convex/contractorEvidence/scope_issues.ts` | `requestContractorScopeClarification` | mutation | 36 | see C6; Contractor identity scope |
| `convex/contractorEvidence/scope_issues.ts` | `flagContractorScopeMismatch` | mutation | 74 | see C6; Contractor identity scope |
| `convex/contractorEvidence/scope_issues.ts` | `resolveContractorScopeIssue` | mutation | 208 | see C6; Contractor identity scope |
| `convex/contractorEvidence/scope_issues.ts` | `listContractorScopeIssues` | query | 321 | see C6; Contractor identity scope |
| `convex/contractorMerge.ts` | `listContractorDuplicateHints` | query | 112 | see C6; Contractor identity scope |
| `convex/contractorMerge.ts` | `mergeContractorProfiles` | mutation | 202 | see C6; Contractor identity scope |
| `convex/contractorMerge.ts` | `deactivateContractorProfile` | mutation | 392 | see C6; Contractor identity scope |
| `convex/contractorMerge.ts` | `unlinkContractorAccount` | mutation | 435 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/claims.ts` | `getContractorClaimForConfirmation` | query | 22 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorOnboarding/claims.ts` | `confirmContractorProfileClaim` | mutation | 86 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorOnboarding/claims.ts` | `rejectContractorProfileMatch` | mutation | 142 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorOnboarding/invites.ts` | `updateContractorInvitationDelivery` | mutation | 32 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorOnboarding/invites.ts` | `sendContractorProfileInvite` | mutation | 161 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorOnboarding/invites.ts` | `resendContractorProfileInvite` | mutation | 322 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorOnboarding/invites.ts` | `revokeContractorProfileInvite` | mutation | 386 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorOnboarding/workflow.ts` | `getContractorOnboardingBridge` | query | 26 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `saveContractorOnboardingDraft` | mutation | 71 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `submitContractorOnboarding` | mutation | 188 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `listContractorOnboardingReviews` | query | 252 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `getContractorOnboardingReview` | query | 304 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `approveContractorOnboarding` | mutation | 418 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `rejectContractorOnboarding` | mutation | 485 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `requestContractorOnboardingChanges` | mutation | 527 | see C6; Contractor identity scope |
| `convex/contractorOnboarding/workflow.ts` | `finalizeContractorOnboardingRoleSync` | mutation | 574 | see C6; Contractor identity scope |
| `convex/contractorWorkspace/access.ts` | `getContractorWorkspaceAccess` | query | 30 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorWorkspace/profile.ts` | `getContractorProfile` | query | 22 | see C6; Contractor identity scope |
| `convex/contractorWorkspace/profile.ts` | `updateContractorOperationalProfile` | mutation | 119 | see C6; Contractor identity scope |
| `convex/contractorWorkspace/profile.ts` | `requestContractorProfileReview` | mutation | 208 | see C6; Contractor identity scope |
| `convex/contractorWorkspace/schedule.ts` | `listContractorScheduleEvents` | query | 42 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorWorkspace/work_items.ts` | `getContractorWorkspaceSummary` | query | 40 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorWorkspace/work_items.ts` | `listContractorWorkItems` | query | 111 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorWorkspace/work_items.ts` | `getContractorProposalDetail` | query | 304 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorWorkspace/work_items.ts` | `getContractorBuildDetail` | query | 382 | reviewed; no standalone candidate in this discovery pass |
| `convex/contractorWorkspace/work_items.ts` | `startAssignedSubmilestone` | mutation | 569 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_mutations.ts` | `createCostDocumentBatch` | mutation | 89 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_mutations.ts` | `addCostDocumentDraft` | mutation | 188 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_mutations.ts` | `abandonCostDocumentBatch` | mutation | 262 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_mutations.ts` | `saveCostDocumentDraft` | mutation | 308 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_mutations.ts` | `bindCostDocumentDraftPageAsset` | mutation | 481 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_mutations.ts` | `setCostDocumentDraftStep` | mutation | 711 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_queries.ts` | `getActiveCostDocumentBatch` | query | 47 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_queries.ts` | `getCostDocumentBatch` | query | 97 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_queries.ts` | `getCostDocumentDraft` | query | 134 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_queries.ts` | `grantCostDocumentDraftCollaborator` | mutation | 201 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/draft_queries.ts` | `revokeCostDocumentDraftCollaborator` | mutation | 290 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/review.ts` | `setCostDocumentReviewAnnotation` | mutation | 81 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/review.ts` | `voidCostDocument` | mutation | 142 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/review.ts` | `startCostDocumentCorrection` | mutation | 217 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/review.ts` | `reconcileCostDocumentIntegrity` | mutation | 267 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/review.ts` | `backfillCostDocumentSourceHashDigests` | mutation | 295 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/submission.ts` | `submitCostDocument` | mutation | 66 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/submission.ts` | `submitCostDocumentBatch` | mutation | 99 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/submission.ts` | `authorizeCostDocumentPageDownload` | mutation | 274 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/submission.ts` | `recordCostDocumentPageDeliveryFailure` | mutation | 393 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/submitted.ts` | `getCostDocument` | query | 48 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/submitted.ts` | `getCostDocumentDuplicateAssessment` | query | 82 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/submitted.ts` | `listCostDocuments` | query | 108 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/submitted.ts` | `listCostDocumentRoadmapReconciliation` | query | 143 | reviewed; no standalone candidate in this discovery pass |
| `convex/cost_documents/vendor.ts` | `listCostDocumentSubmilestoneOptions` | query | 36 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/vendor.ts` | `listCostDocumentVendorOptions` | query | 175 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/vendor.ts` | `getCostDocumentVendorCreateAccess` | query | 200 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/vendor.ts` | `createCostDocumentVendorProfile` | mutation | 214 | see C6; Cost Document authorization/audit |
| `convex/cost_documents/vendor.ts` | `listCostDocumentsByVendor` | query | 316 | see C6; Cost Document authorization/audit |
| `convex/data_retention/backup.ts` | `getLatestDataRetentionBackupManifest` | query | 24 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/backup.ts` | `recordDataRetentionBackupManifest` | mutation | 58 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/backup.ts` | `runQuarterlyDataRetentionDrill` | mutation | 185 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/fanout.ts` | `listDataRetentionBuildPage` | query | 16 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/fanout.ts` | `markDataRetentionBuildArchived` | mutation | 44 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/fanout.ts` | `claimDataRetentionFanoutPage` | mutation | 64 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/fanout.ts` | `recordDataRetentionFanoutPageResult` | mutation | 126 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/fanout.ts` | `recordDataRetentionFanoutBuildResult` | mutation | 163 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/fanout.ts` | `retryDataRetentionFanoutBuild` | action | 222 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/fanout.ts` | `fanOutDataRetentionWork` | action | 258 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/maintenance.ts` | `runDataRetentionMaintenance` | mutation | 8 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/maintenance.ts` | `cleanupExpiredDataRetentionTombstones` | mutation | 49 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/policy.ts` | `getDataRetentionSchedule` | query | 28 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/policy.ts` | `configureDataRetentionPolicy` | mutation | 49 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/policy.ts` | `transitionOrganizationToRestrictedArchive` | mutation | 136 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/reconciliation.ts` | `reconcileDataRetention` | mutation | 14 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/restore.ts` | `startDataRetentionRestore` | mutation | 38 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/restore.ts` | `completeDataRetentionRestore` | mutation | 165 | reviewed; no standalone candidate in this discovery pass |
| `convex/data_retention/restore.ts` | `approveAndDeleteDataRetentionFile` | mutation | 187 | reviewed; no standalone candidate in this discovery pass |
| `convex/demo_builder_proposals/boundary.ts` | `demo_addBuilderProposalBankItem` | mutation | 6 | intentional demo infrastructure |
| `convex/demo_builder_proposals/boundary.ts` | `demo_createBuilderProposalCustomMilestone` | mutation | 81 | intentional demo infrastructure |
| `convex/demo_builder_proposals/boundary.ts` | `demo_updateBuilderProposalCashAvailability` | mutation | 139 | intentional demo infrastructure |
| `convex/demo_builder_proposals/boundary.ts` | `demo_finalizeBuilderProposalBoundary` | mutation | 196 | intentional demo infrastructure |
| `convex/demo_builder_proposals/dashboard.ts` | `demo_getBuilderDashboard` | query | 6 | intentional demo infrastructure |
| `convex/demo_builder_proposals/dashboard.ts` | `demo_startBuilderProposal` | mutation | 37 | intentional demo infrastructure |
| `convex/demo_builder_proposals/milestones.ts` | `demo_generateBuilderProposalMilestones` | mutation | 7 | intentional demo infrastructure |
| `convex/demo_builder_proposals/milestones.ts` | `demo_toggleBuilderProposalMilestone` | mutation | 105 | intentional demo infrastructure |
| `convex/demo_builder_proposals/milestones.ts` | `demo_updateBuilderProposalMilestone` | mutation | 147 | intentional demo infrastructure |
| `convex/demo_builder_proposals/milestones.ts` | `demo_updateBuilderProposalDrawGroups` | mutation | 210 | intentional demo infrastructure |
| `convex/demo_builder_proposals/milestones.ts` | `demo_reorderBuilderProposalMilestone` | mutation | 276 | intentional demo infrastructure |
| `convex/demo_builder_proposals/seed.ts` | `demo_seedBuilderProposalDemo` | mutation | 5 | intentional demo infrastructure |
| `convex/demo_builder_proposals/seed.ts` | `demo_resetBuilderProposalDemo` | mutation | 12 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/build_mutations.ts` | `demo_updateBuildDetails` | mutation | 12 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/contractors.ts` | `demo_attachContractorToBuild` | mutation | 8 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/contractors.ts` | `demo_addBuildDocument` | mutation | 72 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/contractors.ts` | `demo_createAndAttachContractor` | mutation | 126 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/draw.ts` | `demo_approveDraw` | mutation | 61 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/notes.ts` | `demo_addBuildNote` | mutation | 13 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/notes.ts` | `demo_getBorrowerVisibleNotes` | query | 60 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/notes.ts` | `demo_approveMilestoneFromSheet` | mutation | 80 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/resolver.ts` | `demo_resolveBuildIdByKey` | query | 10 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/seed.ts` | `demo_seedBuildDetailExtras` | mutation | 398 | intentional demo infrastructure |
| `convex/demo_drawflow_backoffice/view.ts` | `demo_getBuildDetailViewModel` | query | 256 | intentional demo infrastructure |
| `convex/demo_drawflow/bootstrap.ts` | `demo_seedDrawFlowDemo` | mutation | 6 | intentional demo infrastructure |
| `convex/demo_drawflow/bootstrap.ts` | `demo_cleanupDrawFlowDemo` | mutation | 21 | intentional demo infrastructure |
| `convex/demo_drawflow/bootstrap.ts` | `demo_resetDrawFlowDemo` | mutation | 30 | intentional demo infrastructure |
| `convex/demo_drawflow/completion.ts` | `demo_approveMilestoneCompletion` | mutation | 11 | intentional demo infrastructure |
| `convex/demo_drawflow/completion.ts` | `demo_rejectMilestoneCompletion` | mutation | 70 | intentional demo infrastructure |
| `convex/demo_drawflow/evidence.ts` | `demo_addSampleEvidence` | mutation | 14 | intentional demo infrastructure |
| `convex/demo_drawflow/evidence.ts` | `demo_registerUploadedEvidenceMetadata` | mutation | 54 | intentional demo infrastructure |
| `convex/demo_drawflow/evidence.ts` | `demo_removeEvidenceFile` | mutation | 97 | intentional demo infrastructure |
| `convex/demo_drawflow/evidence.ts` | `demo_submitCompletionClaim` | mutation | 127 | intentional demo infrastructure |
| `convex/demo_drawflow/evidence.ts` | `demo_reviewEvidence` | mutation | 217 | intentional demo infrastructure |
| `convex/demo_drawflow/issues.ts` | `demo_dismissWorkspaceIssue` | mutation | 22 | intentional demo infrastructure |
| `convex/demo_drawflow/issues.ts` | `demo_applyWorkspaceIssueQuickFix` | mutation | 73 | intentional demo infrastructure |
| `convex/demo_drawflow/milestones.ts` | `demo_updateMilestoneProgress` | mutation | 19 | intentional demo infrastructure |
| `convex/demo_drawflow/milestones.ts` | `demo_updateForecastDatesWithReason` | mutation | 83 | intentional demo infrastructure |
| `convex/demo_drawflow/milestones.ts` | `demo_setMilestoneDragLocked` | mutation | 147 | intentional demo infrastructure |
| `convex/demo_drawflow/milestones.ts` | `demo_batchMoveMilestoneDates` | mutation | 198 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_updateProposalMilestoneValue` | mutation | 24 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_updateProposalMilestoneDuration` | mutation | 54 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_updateProposalMilestonePlannedDates` | mutation | 90 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_moveProposalMilestoneToDrawGroup` | mutation | 129 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_reorderProposalMilestones` | mutation | 167 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_addProposalMilestone` | mutation | 210 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_addProposalDependency` | mutation | 263 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_removeProposalDependency` | mutation | 319 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_recomputeProposalPlan` | mutation | 361 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_applyProposalPlanRecommendation` | mutation | 400 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_splitProposalDrawGroup` | mutation | 453 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_mergeProposalDrawGroups` | mutation | 522 | intentional demo infrastructure |
| `convex/demo_drawflow/proposal.ts` | `demo_reorderProposalMilestoneAbsolute` | mutation | 577 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_requestSiteVisit` | mutation | 42 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_getSiteVisitByToken` | query | 175 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_requestSiteVisitReplacementLink` | mutation | 246 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_generateSiteVisitUploadUrl` | mutation | 302 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_markSiteVisitTokenOpened` | mutation | 313 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_registerSiteVisitFile` | mutation | 356 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_submitTokenizedSiteVisitReport` | mutation | 403 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_claimSiteVisit` | mutation | 509 | intentional demo infrastructure |
| `convex/demo_drawflow/site_visits.ts` | `demo_submitSiteVisitReport` | mutation | 539 | intentional demo infrastructure |
| `convex/demo_drawflow/submission.ts` | `demo_submitProposal` | mutation | 13 | intentional demo infrastructure |
| `convex/demo_drawflow/submission.ts` | `demo_approveProposal` | mutation | 64 | intentional demo infrastructure |
| `convex/demo_drawflow/workspace.ts` | `demo_getBackofficeDashboard` | query | 6 | intentional demo infrastructure |
| `convex/demo_drawflow/workspace.ts` | `demo_getActiveWorkspace` | query | 12 | intentional demo infrastructure |
| `convex/demo_drawflow/workspace.ts` | `demo_getProposalWorkspace` | query | 18 | intentional demo infrastructure |
| `convex/demo_drawflow/workspace.ts` | `demo_getWorkspace` | query | 24 | intentional demo infrastructure |
| `convex/demo_drawflow/workspace.ts` | `demo_getAuditEvents` | query | 31 | intentional demo infrastructure |
| `convex/demo_drawflow/workspace.ts` | `demo_getEventOutbox` | query | 54 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `getTimelineDemoSettings` | query | 40 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `seedTimelineDemoDefaults` | mutation | 47 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `listDemoPersonas` | query | 68 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `saveTimelineTemplateConfiguration` | mutation | 78 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `saveTimelineTemplateWorksheet` | mutation | 118 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `createTimelineDrawScenario` | mutation | 137 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `saveTimelineDrawScenario` | mutation | 208 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `setActiveTimelineDrawScenario` | mutation | 243 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `deleteTimelineDrawScenario` | mutation | 268 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `resetTimelineTemplateToDefaults` | mutation | 300 | intentional demo infrastructure |
| `convex/demo_settings/handlers.ts` | `resetTimelineDrawScenarioToDefaults` | mutation | 323 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_rollForwardApprovedTimelines` | mutation | 36 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_syncApprovedTimelinesNow` | mutation | 46 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_adminUpdateTimelineMilestone` | mutation | 53 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_adminUpdateTimelinePlan` | mutation | 135 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_adminUpdateTimelineDraw` | mutation | 175 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_adminAddTimelineDraw` | mutation | 221 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_adminRemoveTimelineDraw` | mutation | 254 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_approveTimelinePlan` | mutation | 449 | intentional demo infrastructure |
| `convex/demo_timeline_plans/admin.ts` | `demo_rejectTimelinePlan` | mutation | 530 | intentional demo infrastructure |
| `convex/demo_timeline_plans/backoffice.ts` | `demo_getBackofficeDashboard` | query | 4 | intentional demo infrastructure |
| `convex/demo_timeline_plans/capital.ts` | `demo_createTimelineCapitalEvent` | mutation | 12 | intentional demo infrastructure |
| `convex/demo_timeline_plans/capital.ts` | `demo_updateTimelineCapitalEvent` | mutation | 63 | intentional demo infrastructure |
| `convex/demo_timeline_plans/capital.ts` | `demo_createTimelineCashInfusion` | mutation | 116 | intentional demo infrastructure |
| `convex/demo_timeline_plans/capital.ts` | `demo_deleteTimelineCapitalEvent` | mutation | 165 | intentional demo infrastructure |
| `convex/demo_timeline_plans/draws.ts` | `demo_createTimelineDraw` | mutation | 16 | intentional demo infrastructure |
| `convex/demo_timeline_plans/draws.ts` | `demo_updateTimelineDraw` | mutation | 75 | intentional demo infrastructure |
| `convex/demo_timeline_plans/draws.ts` | `demo_deleteTimelineDraw` | mutation | 126 | intentional demo infrastructure |
| `convex/demo_timeline_plans/draws.ts` | `demo_submitTimelineDrawRequest` | mutation | 155 | intentional demo infrastructure |
| `convex/demo_timeline_plans/draws.ts` | `demo_reviewTimelineDrawRequest` | mutation | 276 | intentional demo infrastructure |
| `convex/demo_timeline_plans/evidence.ts` | `demo_submitTimelineMilestoneCompletion` | mutation | 26 | intentional demo infrastructure |
| `convex/demo_timeline_plans/evidence.ts` | `demo_reviewTimelineMilestoneCompletion` | mutation | 76 | intentional demo infrastructure |
| `convex/demo_timeline_plans/evidence.ts` | `demo_generateTimelineEvidenceUploadUrl` | mutation | 122 | intentional demo infrastructure |
| `convex/demo_timeline_plans/evidence.ts` | `demo_createTimelineEvidenceAsset` | mutation | 133 | intentional demo infrastructure |
| `convex/demo_timeline_plans/evidence.ts` | `demo_updateTimelineEvidenceAsset` | mutation | 191 | intentional demo infrastructure |
| `convex/demo_timeline_plans/evidence.ts` | `demo_deleteTimelineEvidenceAsset` | mutation | 230 | intentional demo infrastructure |
| `convex/demo_timeline_plans/evidence.ts` | `demo_requestTimelineSiteVisit` | mutation | 262 | intentional demo infrastructure |
| `convex/demo_timeline_plans/milestones.ts` | `demo_updateTimelineMilestone` | mutation | 30 | intentional demo infrastructure |
| `convex/demo_timeline_plans/milestones.ts` | `demo_createTimelineMilestone` | mutation | 294 | intentional demo infrastructure |
| `convex/demo_timeline_plans/milestones.ts` | `demo_deleteTimelineMilestone` | mutation | 321 | intentional demo infrastructure |
| `convex/demo_timeline_plans/milestones.ts` | `demo_requestTimelineModification` | mutation | 365 | intentional demo infrastructure |
| `convex/demo_timeline_plans/milestones.ts` | `demo_reviewTimelineModificationRequest` | mutation | 430 | intentional demo infrastructure |
| `convex/demo_timeline_plans/milestones.ts` | `demo_updateTimelineRouteState` | mutation | 541 | intentional demo infrastructure |
| `convex/demo_timeline_plans/milestones.ts` | `demo_updateTimelinePlanState` | mutation | 580 | intentional demo infrastructure |
| `convex/demo_timeline_plans/plan.ts` | `demo_createTimelinePlanFromSetup` | mutation | 55 | intentional demo infrastructure |
| `convex/demo_timeline_plans/plan.ts` | `demo_submitTimelinePlan` | mutation | 266 | intentional demo infrastructure |
| `convex/demo_timeline_plans/plan.ts` | `demo_listBuilderTimelinePlans` | query | 324 | intentional demo infrastructure |
| `convex/demo_timeline_plans/plan.ts` | `demo_getSubmittedProposalsForBackoffice` | query | 377 | intentional demo infrastructure |
| `convex/demo_timeline_plans/plan.ts` | `demo_getProposalReviewViewModel` | query | 525 | intentional demo infrastructure |
| `convex/demo_timeline_plans/workspace.ts` | `demo_getTimelinePlanWorkspace` | query | 10 | intentional demo infrastructure |
| `convex/demo_timeline_plans/workspace.ts` | `demo_getBuilderLiveTimelineWorkspaceByBuildKey` | query | 110 | intentional demo infrastructure |
| `convex/demo_timeline_plans/workspace.ts` | `demo_resolveProposalShortLink` | query | 140 | intentional demo infrastructure |
| `convex/demo_timeline_snapshots.ts` | `demo_createTimelineSnapshot` | mutation | 201 | intentional demo infrastructure |
| `convex/demo_timeline_snapshots.ts` | `demo_getTimelineSnapshot` | query | 215 | intentional demo infrastructure |
| `convex/email_transport.ts` | `handleResendEmailEvent` | mutation | 152 | reviewed; no standalone candidate in this discovery pass |
| `convex/evidence_preview.ts` | `convertEvidenceImagePreview` | action | 12 | reviewed; no standalone candidate in this discovery pass |
| `convex/fluent.ts` | `listTodoTexts` | query | 419 | reviewed; no standalone candidate in this discovery pass |
| `convex/fluent.ts` | `addTodoForViewer` | mutation | 434 | reviewed; no standalone candidate in this discovery pass |
| `convex/fluent.ts` | `ping` | action | 454 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_notifications/contracts.ts` | `authorizeLenderPortalNotificationLink` | query | 14 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase5/lifecycle.ts` | `submitBuilderReviewRequest` | mutation | 67 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase5/lifecycle.ts` | `decideBackofficeReviewRequest` | mutation | 83 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase5/lifecycle.ts` | `decideLenderReviewRequest` | mutation | 103 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase5/projections.ts` | `getBuilderReviewRequest` | query | 63 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `listBackofficeReviewRequests` | query | 83 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `getBackofficeReviewRequest` | query | 105 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `listLenderReviewRequests` | query | 127 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `listAllAssignedLenderMilestoneReviewRequests` | query | 150 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `getLenderReviewRequest` | query | 203 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `getLenderNotificationReviewRequest` | query | 224 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `getBackofficeNotificationReviewRequest` | query | 254 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `getBuilderNotificationReviewRequest` | query | 285 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `getBackofficeReviewEvidence` | query | 318 | see C4; active Build projection |
| `convex/lender_portal_phase5/projections.ts` | `getLenderReviewEvidence` | query | 328 | see C4; active Build projection |
| `convex/lender_portal_phase5/site_visits.ts` | `listLenderMilestoneSiteVisitCompletions` | query | 38 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase5/site_visits.ts` | `completeBackofficeMilestoneSiteVisit` | mutation | 126 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase5/site_visits.ts` | `completeLenderMilestoneSiteVisit` | mutation | 151 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase9/inventory.ts` | `inventoryLenderPortalPhase9MigrationCandidates` | query | 22 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase9/runs.ts` | `readLenderPortalPhase9MigrationAudit` | query | 41 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase9/runs.ts` | `prepareLenderPortalPhase9MigrationRun` | mutation | 111 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase9/runs.ts` | `authorizeLenderPortalPhase9MigrationRun` | mutation | 247 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase9/runs.ts` | `verifyLenderPortalPhase9MigrationRun` | mutation | 372 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase9/runs.ts` | `getLenderPortalPhase9MigrationRun` | query | 481 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_phase9/runs.ts` | `listLenderPortalPhase9MigrationIssues` | query | 516 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_release.ts` | `getLenderPortalReleaseState` | query | 87 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_release.ts` | `listLenderPortalReleaseAudit` | query | 101 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_release.ts` | `transitionLenderPortalRelease` | mutation | 161 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal_release.ts` | `getLenderPortalOperationalHealth` | query | 428 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/build_detail.ts` | `listLenderActiveBuilds` | query | 41 | see C4; active Build projection |
| `convex/lender_portal/build_detail.ts` | `getLenderBuildDetail` | query | 56 | see C4; active Build projection |
| `convex/lender_portal/collaboration_asset_actions.ts` | `finalizeAndScanLenderBuildCollaborationAssetUpload` | action | 47 | see C8; delivery/asset orchestration |
| `convex/lender_portal/collaboration_assets.ts` | `beginLenderBuildCollaborationAssetUpload` | mutation | 30 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration_assets.ts` | `registerLenderBuildCollaborationAssetUploadedStorage` | mutation | 61 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration_assets.ts` | `finalizeLenderBuildCollaborationAssetUploadForAction` | mutation | 82 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration_assets.ts` | `listLenderBuildCollaborationAssetStatuses` | query | 100 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration_assets.ts` | `authorizeLenderBuildCollaborationAssetDownload` | mutation | 119 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration_assets.ts` | `abandonLenderBuildCollaborationAssets` | mutation | 139 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration.ts` | `getLenderBuildCollaborationLifecycleState` | query | 35 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration.ts` | `listLenderBuildCollaborationPosts` | query | 59 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration.ts` | `publishLenderBuildCollaborationPost` | mutation | 105 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration.ts` | `listLenderBuildCollaborationResponses` | query | 144 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/collaboration.ts` | `addLenderBuildCollaborationResponse` | mutation | 178 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/dashboard.ts` | `getLenderDashboard` | query | 55 | see C4; active Build projection |
| `convex/lender_portal/draw_queue.ts` | `getLenderDrawQueue` | query | 62 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/proposals.ts` | `listLenderAssignedProposals` | query | 593 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/proposals.ts` | `listLenderAssignedProposalPage` | query | 608 | reviewed; no standalone candidate in this discovery pass |
| `convex/lender_portal/proposals.ts` | `getBackofficeLenderOrganizationPortfolio` | query | 643 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizationReviewPolicies.ts` | `getLenderOrganizationDefaultReviewPolicy` | query | 168 | see C5; review-policy lineage |
| `convex/lenderOrganizationReviewPolicies.ts` | `saveLenderOrganizationDefaultReviewPolicy` | mutation | 176 | see C5; review-policy lineage |
| `convex/lenderOrganizations.ts` | `getLenderOrganizationDirectoryMetadata` | query | 57 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `listLenderOrganizations` | query | 83 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `listUnassignedLenderUsers` | query | 160 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `listLenderOrganizationMembersForAdmin` | query | 233 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `getLenderMembershipReconciliation` | query | 301 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `getCurrentLenderOrganization` | query | 355 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `listCurrentLenderOrganizationMembers` | query | 442 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `updateLenderMemberDecisionPermissions` | mutation | 525 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `getLenderMemberDecisionPermissionMigrationCoverage` | query | 603 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `provisionLenderOrganization` | mutation | 637 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `updateLenderOrganizationPermissions` | mutation | 693 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `setLenderOrganizationStatus` | mutation | 722 | see C1; competing terminal transition |
| `convex/lenderOrganizations.ts` | `assignLenderUser` | mutation | 773 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `unassignLenderUser` | mutation | 941 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `inviteLenderUser` | action | 982 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `reconcilePendingLenderAssignments` | mutation | 1044 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `resolveInvitationTarget` | query | 1059 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `stageInvitedLenderAssignment` | mutation | 1079 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `beginLenderMemberDeactivation` | mutation | 1181 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `markLenderMemberDeactivationAccepted` | mutation | 1350 | reviewed; no standalone candidate in this discovery pass |
| `convex/lenderOrganizations.ts` | `markLenderMemberDeactivationFailed` | mutation | 1421 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_completion.ts` | `submitActiveBuildMilestoneCompletion` | mutation | 21 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_contractors.ts` | `attachActiveBuildContractor` | mutation | 21 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_contractors.ts` | `attachAndInviteActiveBuildContractor` | mutation | 54 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_contractors.ts` | `createAndAttachActiveBuildContractor` | mutation | 122 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_contractors.ts` | `assignActiveBuildContractorToMilestone` | mutation | 250 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_contractors.ts` | `removeActiveBuildContractorFromMilestone` | mutation | 643 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_contractors.ts` | `recordContractorQualityRating` | mutation | 872 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_detail.ts` | `getActiveBuildRouteAvailabilityByString` | query | 25 | see C4; active Build projection |
| `convex/production_proposals/active_build_detail.ts` | `getActiveBuildDetailByString` | query | 84 | see C4; active Build projection |
| `convex/production_proposals/active_build_documents.ts` | `reviewActiveBuildEvidence` | mutation | 16 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_documents.ts` | `addActiveBuildNote` | mutation | 100 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_documents.ts` | `addActiveBuildDocument` | mutation | 120 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draw_migration.ts` | `migrateActiveBuildDrawRequests` | mutation | 633 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `requestActiveBuildDraw` | mutation | 96 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `withdrawActiveBuildDraw` | mutation | 339 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `cancelActiveBuildDraw` | mutation | 412 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `startActiveBuildDrawReview` | mutation | 491 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `submitActiveBuildDrawForAdmin` | mutation | 546 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `approveActiveBuildDraw` | mutation | 605 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `rejectActiveBuildDraw` | mutation | 700 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_draws.ts` | `releaseActiveBuildDraw` | mutation | 788 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_evidence_storage.ts` | `promoteActiveBuildDiscussionAttachmentToEvidence` | mutation | 836 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_evidence_storage.ts` | `updateActiveBuildTimelineEvidenceAsset` | mutation | 877 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_evidence_storage.ts` | `deleteActiveBuildTimelineEvidenceAsset` | mutation | 930 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_planning.ts` | `updateActiveBuildTimelinePlanState` | mutation | 25 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_planning.ts` | `requestActiveBuildFacilityChange` | mutation | 142 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_planning.ts` | `reviewActiveBuildFacilityChangeRequest` | mutation | 239 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_planning.ts` | `requestActiveBuildBudgetRevision` | mutation | 341 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_planning.ts` | `reviewActiveBuildBudgetRevision` | mutation | 445 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_planning.ts` | `synchronizeActiveBuildMilestonePlanningInternal` | mutation | 558 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_planning.ts` | `scheduleActiveBuildMilestonePlanningReconciliation` | mutation | 593 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_profile.ts` | `updateActiveBuildNonFinancialDetails` | mutation | 21 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_profile.ts` | `getActiveBuildTimelineWorkspace` | query | 136 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_reviews.ts` | `requestActiveBuildMilestoneInfo` | mutation | 19 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_reviews.ts` | `assignActiveBuildSiteVisit` | mutation | 84 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_reviews.ts` | `repairActiveBuildMilestoneReviewStates` | mutation | 270 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_reviews.ts` | `approveActiveBuildMilestone` | mutation | 332 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_reviews.ts` | `rejectActiveBuildMilestone` | mutation | 429 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_site_visits.ts` | `recordActiveBuildSiteVisit` | mutation | 24 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_site_visits.ts` | `getActiveBuildSiteVisitByToken` | query | 143 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_site_visits.ts` | `requestActiveBuildSiteVisitReplacementLink` | mutation | 152 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_site_visits.ts` | `generateActiveBuildSiteVisitUploadUrl` | mutation | 241 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_site_visits.ts` | `registerActiveBuildSiteVisitFile` | mutation | 257 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_site_visits.ts` | `markActiveBuildSiteVisitTokenOpened` | mutation | 489 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_site_visits.ts` | `submitActiveBuildTokenizedSiteVisitReport` | mutation | 512 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_staff.ts` | `listActiveBuildBuilderStaffPermissions` | query | 227 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_staff.ts` | `saveActiveBuildBuilderStaffPermissions` | mutation | 255 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_staff.ts` | `provisionActiveBuildBuilderStaffPermissions` | action | 290 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_staff.ts` | `finalizeActiveBuildBuilderStaffProvisioning` | mutation | 342 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_staff.ts` | `removeActiveBuildBuilderStaffMember` | mutation | 385 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_evidence.ts` | `addActiveBuildSubmilestoneEvidence` | mutation | 16 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_evidence.ts` | `freezeActiveBuildSubmilestoneEvidencePackage` | mutation | 270 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_evidence.ts` | `submitActiveBuildSubmilestoneCompletionForReview` | mutation | 416 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_execution.ts` | `startActiveBuildMilestone` | mutation | 21 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_execution.ts` | `correctActiveBuildMilestoneStart` | mutation | 151 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_execution.ts` | `retractActiveBuildMilestoneStart` | mutation | 195 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_execution.ts` | `updateActiveBuildSubmilestoneExecution` | mutation | 237 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_execution.ts` | `updateActiveBuildSubmilestoneProgress` | mutation | 602 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_submilestone_execution.ts` | `configureActiveBuildSubmilestoneEvidenceRequirements` | mutation | 739 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `createActiveBuildTimelineMilestone` | mutation | 23 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `updateActiveBuildTimelineMilestone` | mutation | 87 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `deleteActiveBuildTimelineMilestone` | mutation | 325 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `createActiveBuildTimelineDraw` | mutation | 406 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `updateActiveBuildTimelineDraw` | mutation | 507 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `deleteActiveBuildTimelineDraw` | mutation | 585 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `createActiveBuildTimelineCapitalEvent` | mutation | 632 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `createActiveBuildTimelineCashInfusion` | mutation | 669 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `updateActiveBuildTimelineCapitalEvent` | mutation | 706 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `deleteActiveBuildTimelineCapitalEvent` | mutation | 762 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `generateActiveBuildEvidenceUploadUrl` | mutation | 794 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/active_build_timeline.ts` | `createActiveBuildTimelineEvidenceAsset` | mutation | 811 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/assignment_manifest.ts` | `finalizeLenderAssignmentManifest` | mutation | 21 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/assignment_manifest.ts` | `sealLenderAssignmentManifestBatch` | mutation | 90 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/backoffice_proposal_views.ts` | `listProposalKanban` | query | 24 | see C4; active Build projection |
| `convex/production_proposals/backoffice_proposal_views.ts` | `listBackofficeProposalDirectory` | query | 86 | see C4; active Build projection |
| `convex/production_proposals/backoffice_proposal_views.ts` | `listBackofficeProposalFilterOptions` | query | 156 | see C4; active Build projection |
| `convex/production_proposals/backoffice_proposal_views.ts` | `listBuilderStaffWorkspace` | query | 260 | see C4; active Build projection |
| `convex/production_proposals/backoffice_proposal_views.ts` | `getBackofficeDashboard` | query | 278 | see C4; active Build projection |
| `convex/production_proposals/brokerage_draws.ts` | `listBrokerageDraws` | query | 19 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/brokerage_site_visits.ts` | `listBrokerageSiteVisits` | query | 44 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `getBuilderProposalCreateContext` | query | 22 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `getBrokerProposalCreateContext` | query | 63 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `getBuilderOnboardingState` | query | 128 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `dismissBuilderOnboarding` | mutation | 310 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `createDraftProposalClaimLink` | mutation | 347 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `getProposalClaimPreview` | query | 417 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `claimDraftProposalLink` | action | 477 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/builder_onboarding.ts` | `finalizeDraftProposalClaimLink` | mutation | 530 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_contracts.ts` | `getProposalContractorPlanning` | query | 14 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `reviseProposalMilestoneSchedule` | mutation | 166 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `reviseProposalDrawTiming` | mutation | 242 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `reviseActiveBuildMilestoneSchedule` | mutation | 295 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `setEvidenceDueDate` | mutation | 494 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `setReviewTargetDate` | mutation | 515 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `setAdminDecisionTargetDate` | mutation | 536 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `setDrawReleaseTargetDate` | mutation | 557 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `listProposalCalendarAssignableParticipants` | query | 725 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `createProposalReminderCalendarEvent` | mutation | 803 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `updateProposalReminderCalendarEvent` | mutation | 855 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_scheduling.ts` | `deleteProposalReminderCalendarEvent` | mutation | 914 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_workspaces.ts` | `getProposalCalendarWorkspace` | query | 14 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/calendar_workspaces.ts` | `getActiveBuildCalendarWorkspace` | query | 264 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_assignments.ts` | `attachProposalContractor` | mutation | 18 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_assignments.ts` | `attachAndInviteProposalContractor` | mutation | 78 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_assignments.ts` | `createAndAttachProposalContractor` | mutation | 159 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_assignments.ts` | `assignProposalContractorToMilestone` | mutation | 268 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `createContractorProfile` | mutation | 18 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `updateContractorProfile` | mutation | 176 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `setContractorProfileStatus` | mutation | 257 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `linkContractorIdentity` | mutation | 294 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `linkContractorProfileToWorkosUser` | mutation | 370 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `listContractors` | query | 411 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `getBuilderContractorRelationshipByString` | query | 484 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/contractor_profiles.ts` | `getContractorDetail` | query | 666 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `createIntegrationEndpoint` | mutation | 15 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `updateIntegrationEndpointConfiguration` | mutation | 78 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `validateIntegrationEndpoint` | mutation | 129 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `activateIntegrationEndpoint` | mutation | 165 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `disableIntegrationEndpoint` | mutation | 209 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `rotateIntegrationEndpointSecret` | mutation | 249 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `revokeIntegrationEndpoint` | mutation | 296 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `retryIntegrationDeliveryAttempt` | mutation | 334 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `getIntegrationDeliveryDispatchContext` | query | 440 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `completeIntegrationDeliveryDispatch` | mutation | 473 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/integrations.ts` | `dispatchIntegrationDeliveryAttempt` | action | 541 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `getProposalDetailByString` | query | 174 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `getCurrentLenderProposalDetail` | query | 194 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `getLenderProposalLifecycleProjection` | query | 352 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `getHistoricalLenderProposalDetail` | query | 502 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `getHistoricalLenderProposalConfirmation` | query | 572 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `listLenderProposalAssignmentDocuments` | query | 617 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `listLenderProposalAssignmentRevisions` | query | 643 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `listLenderProposalAssignmentDecisions` | query | 662 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/lender_detail.ts` | `listLenderProposalRevisionMilestones` | query | 681 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/operations_handoffs.ts` | `escalateOperationsQueueItem` | mutation | 14 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/operations_handoffs.ts` | `returnOperationsEscalationDecision` | mutation | 107 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/operations_handoffs.ts` | `acknowledgeOperationsEscalationReturn` | mutation | 162 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/operations_handoffs.ts` | `listRecipientInbox` | query | 210 | see C8; delivery/asset orchestration |
| `convex/production_proposals/operations_handoffs.ts` | `markRecipientDeliveryRead` | mutation | 269 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/operations_handoffs.ts` | `dismissRecipientDelivery` | mutation | 291 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/operations_handoffs.ts` | `resolveRecipientDelivery` | mutation | 313 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/operations_handoffs.ts` | `getIntegrationOperations` | query | 338 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_activation.ts` | `recordProposalClosing` | mutation | 29 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_activation.ts` | `resolveLegacyClosedProposalActivation` | mutation | 152 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_activation.ts` | `activateClosedProposal` | mutation | 261 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_activation.ts` | `repairLegacyClosedProposalActiveBuild` | mutation | 801 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_activation.ts` | `repairLegacyClosedProposalActiveBuildInternal` | mutation | 826 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `listUnassignedDraftProposals` | query | 21 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `listBrokerageBuilders` | query | 66 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `listActiveBrokerageBuilderOptions` | query | 101 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `assignProposalBroker` | mutation | 139 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `assignDraftBuilder` | mutation | 328 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `assignProposalBuilder` | mutation | 345 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `unassignDraftBuilder` | mutation | 362 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `deleteDraftProposal` | mutation | 404 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignment_admin.ts` | `deleteActiveBuild` | mutation | 476 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignments.ts` | `listEligibleExternalLenderOrganizations` | query | 43 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignments.ts` | `assignExternalLenderOrganization` | mutation | 98 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignments.ts` | `withdrawExternalLenderAssignment` | mutation | 243 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignments.ts` | `getProposalLenderArchiveStatus` | query | 376 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_assignments.ts` | `retryProposalLenderArchive` | mutation | 412 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_build_cost.ts` | `createActiveBuildCostItem` | mutation | 14 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_build_cost.ts` | `updateActiveBuildCostItem` | mutation | 196 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_build_cost.ts` | `deleteActiveBuildCostItem` | mutation | 500 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `updateProductionProposalCoPayAmount` | mutation | 17 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `updateProductionProposalApprovedAmount` | mutation | 96 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `updateProductionProposalInterestRate` | mutation | 174 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `updateProductionProposalProposedStartDate` | mutation | 215 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `createProductionTimelineCapitalEvent` | mutation | 256 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `createProductionTimelineCashInfusion` | mutation | 304 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `updateProductionTimelineCapitalEvent` | mutation | 344 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_capital.ts` | `deleteProductionTimelineCapitalEvent` | mutation | 416 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_confirmation.ts` | `acknowledgeProposalConfirmationCheckpoint` | mutation | 23 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_confirmation.ts` | `declineExternalProposalForClosing` | mutation | 173 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_confirmation.ts` | `approveExternalProposalForClosing` | mutation | 321 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_confirmation.ts` | `getLenderProposalConfirmation` | query | 496 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_confirmation.ts` | `getBackofficeProposalRemediation` | query | 587 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_confirmation.ts` | `getBuilderProposalConfirmationState` | query | 663 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_confirmation.ts` | `listProposalLenderAssignmentHistory` | query | 721 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_detail_projection.ts` | `getProposalDetail` | query | 381 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_detail_projection.ts` | `listProposalBuilderStaffPermissions` | query | 572 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_detail_projection.ts` | `saveProposalBuilderStaffPermissions` | mutation | 596 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_detail_projection.ts` | `provisionProposalBuilderStaffPermissions` | action | 627 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_detail_projection.ts` | `finalizeProposalBuilderStaffProvisioning` | mutation | 679 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_detail_projection.ts` | `removeProposalBuilderStaffMember` | mutation | 715 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_draw_plan.ts` | `createProductionTimelineDraw` | mutation | 19 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_draw_plan.ts` | `updateProductionTimelineDraw` | mutation | 101 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_draw_plan.ts` | `deleteProductionTimelineDraw` | mutation | 182 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_draw_plan.ts` | `replaceProductionTimelineDrawSchedule` | mutation | 223 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_draw_plan.ts` | `requestProductionTimelineModification` | mutation | 371 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_draw_plan.ts` | `reviewProductionTimelineModificationRequest` | mutation | 448 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_draw_plan.ts` | `updateProductionTimelinePlanState` | mutation | 500 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `generateProductionEvidenceUploadUrl` | mutation | 17 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `createProductionTimelineEvidenceAsset` | mutation | 35 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `updateProductionTimelineEvidenceAsset` | mutation | 99 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `deleteProductionTimelineEvidenceAsset` | mutation | 141 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `submitProductionMilestoneCompletion` | mutation | 176 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `reviewProductionMilestoneCompletion` | mutation | 228 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `requestProductionMilestoneSiteVisit` | mutation | 279 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `recordProductionMilestoneSiteVisit` | mutation | 357 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `submitProductionDrawRequest` | mutation | 422 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_evidence_completion.ts` | `reviewProductionDrawRequest` | mutation | 468 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_review_commands.ts` | `selectProposalPlan` | mutation | 73 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_review_commands.ts` | `submitProposal` | mutation | 167 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_review_commands.ts` | `requestChanges` | mutation | 261 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_review_commands.ts` | `rejectProposal` | mutation | 302 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_review_commands.ts` | `approveProposal` | mutation | 341 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_review_commands.ts` | `configureProposalReviewPolicy` | mutation | 465 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_review_commands.ts` | `repairMissingLenderProposalConfirmation` | mutation | 633 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_review_reads.ts` | `getProposalPhase3ReviewControl` | query | 35 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_review_reads.ts` | `listProposalReviewPolicyVersions` | query | 239 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_review_reads.ts` | `listProposalRevisions` | query | 307 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_review_restore.ts` | `restoreProposalReviewPolicyFromOrganizationDefault` | mutation | 23 | see C5; review-policy lineage |
| `convex/production_proposals/proposal_revision_commands.ts` | `publishProposalRevision` | mutation | 40 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_revision_commands.ts` | `lockProposalReviewPolicy` | mutation | 180 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `dev_seedProductionFoundation` | mutation | 27 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `seedProductionDefaultsToProd` | mutation | 98 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `dev_seedProductionProposalScenarios` | mutation | 139 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `generateProposalDocumentUploadUrl` | mutation | 272 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `addProposalDocument` | mutation | 293 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `createDraftProposal` | mutation | 351 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `createBrokerDraftProposal` | mutation | 459 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_seed.ts` | `saveDraftProposalPackage` | mutation | 544 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_settings.ts` | `getProductionProposalSettings` | query | 17 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_settings.ts` | `saveProductionProposalTemplateConfiguration` | mutation | 38 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_settings.ts` | `createProductionProposalTemplate` | mutation | 104 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_settings.ts` | `deleteProductionDrawScenario` | mutation | 194 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_settings.ts` | `backfillProductionDefaultTemplates` | mutation | 242 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_settings.ts` | `resetProductionTemplateToDefaults` | mutation | 277 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_settings.ts` | `resetProductionDrawScenarioToDefaults` | mutation | 315 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline_workspace.ts` | `getProductionTimelineWorkspace` | query | 18 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline.ts` | `updateSubmittedProposalDrawScheduleRow` | mutation | 20 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline.ts` | `createProductionTimelineMilestone` | mutation | 102 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline.ts` | `updateProductionTimelineMilestone` | mutation | 151 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline.ts` | `deleteProductionTimelineMilestone` | mutation | 356 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline.ts` | `createProposalCostItem` | mutation | 391 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline.ts` | `updateProposalCostItem` | mutation | 485 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/proposal_timeline.ts` | `deleteProposalCostItem` | mutation | 630 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterPage` | query | 25 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryBuildsPage` | query | 178 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryBuilds` | query | 215 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryLoansPage` | query | 247 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryLoans` | query | 282 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryMilestonesPage` | query | 325 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryMilestones` | query | 393 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummarySubmilestonesPage` | query | 473 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummarySubmilestones` | query | 534 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryDrawRequestsPage` | query | 569 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_queries.ts` | `listBackofficeBuildRosterSummaryDrawRequests` | query | 610 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_views.ts` | `listBackofficeBuildRosterSummarySiteVisitsPage` | query | 20 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_views.ts` | `listBackofficeBuildRosterSummarySiteVisits` | query | 62 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_views.ts` | `getBackofficeBuildRosterSummary` | query | 108 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/roster_views.ts` | `listBackofficeBuildRoster` | query | 267 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `scheduleActiveBuildSiteVisit` | mutation | 23 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `rescheduleActiveBuildSiteVisit` | mutation | 203 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `cancelActiveBuildSiteVisit` | mutation | 267 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `requestLoanFacilityDateChange` | mutation | 314 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `saveCalendarView` | mutation | 372 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `createCalendarSyncSubscription` | mutation | 418 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `recordExternalCalendarSyncChange` | mutation | 496 | reviewed; no standalone candidate in this discovery pass |
| `convex/production_proposals/site_visit_calendar.ts` | `getCalendarSubscriptionIcs` | query | 806 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `startSession` | mutation | 49 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `joinSession` | mutation | 127 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `inviteParticipant` | mutation | 201 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `setParticipantPermission` | mutation | 291 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `stopSession` | mutation | 357 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `getSession` | query | 393 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `assignSessionToBuilder` | mutation | 465 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `getTimelineHistoryStatus` | query | 532 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `undoProposalTimeline` | mutation | 563 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `redoProposalTimeline` | mutation | 605 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `presenceHeartbeat` | mutation | 647 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `listPresence` | query | 672 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `updatePresenceData` | mutation | 678 | reviewed; no standalone candidate in this discovery pass |
| `convex/proposal_collaboration.ts` | `presenceDisconnect` | mutation | 704 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_comparisons.ts` | `getQuoteRoundComparison` | query | 38 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_comparisons.ts` | `setPreferredQuoteSubmissionRevision` | mutation | 219 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_comparisons.ts` | `clearPreferredQuoteSubmissionRevision` | mutation | 365 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_invitation_access.ts` | `exchangeQuoteInvitationAccess` | mutation | 156 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_invitation_access.ts` | `ensureQuoteRoundRecipient` | mutation | 165 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_invitation_access.ts` | `claimQuoteInvitationProfile` | mutation | 177 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_invitation_access.ts` | `getClaimedQuoteInvitationAccess` | query | 183 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/delivery.ts` | `retryCommunicationDelivery` | mutation | 58 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/delivery.ts` | `listDueCommunicationIntentIds` | query | 232 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/delivery.ts` | `claimCommunicationIntent` | mutation | 286 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/delivery.ts` | `authorizeCommunicationProviderSubmission` | mutation | 467 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/delivery.ts` | `releaseCommunicationProviderReservation` | mutation | 628 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/delivery.ts` | `recordCommunicationDispatchSuccess` | mutation | 671 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/delivery.ts` | `recordCommunicationDispatchFailure` | mutation | 772 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/scheduling.ts` | `processDueCommunicationIntents` | action | 55 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/scheduling.ts` | `claimQuoteInvitationReminderSweepPage` | mutation | 158 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/scheduling.ts` | `scheduleQuoteInvitationReminders` | action | 198 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_notifications/scheduling.ts` | `scheduleQuoteInvitationRemindersForRound` | mutation | 222 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_drafts.ts` | `getQuoteInvitationResponseDraft` | query | 44 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `getClaimedQuoteInvitationResponseDraft` | query | 57 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `saveQuoteInvitationResponseDraft` | mutation | 72 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `saveClaimedQuoteInvitationResponseDraft` | mutation | 86 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `confirmCopiedQuoteInvitationResponseDraftValues` | mutation | 102 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `confirmCopiedClaimedQuoteInvitationResponseDraftValues` | mutation | 115 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `beginQuoteInvitationResponseDraftAttachmentUpload` | mutation | 133 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `beginClaimedQuoteInvitationResponseDraftAttachmentUpload` | mutation | 146 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `registerQuoteInvitationResponseDraftAttachmentUpload` | mutation | 181 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `registerClaimedQuoteInvitationResponseDraftAttachmentUpload` | mutation | 194 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `attachQuoteInvitationResponseDraftFile` | mutation | 209 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `attachClaimedQuoteInvitationResponseDraftFile` | mutation | 218 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `expireQuoteInvitationResponseDraftAttachmentStagingSession` | mutation | 233 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `getQuoteRoundInvitationResponseProgress` | query | 256 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `authorizeQuoteInvitationResponseDraftAttachmentHttpUpload` | query | 266 | positive control; shared access implementation |
| `convex/quote_response_drafts.ts` | `completeQuoteInvitationResponseDraftAttachmentHttpUpload` | mutation | 287 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `getQuoteInvitationResponseLifecycle` | query | 34 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `getClaimedQuoteInvitationResponseLifecycle` | query | 48 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `getQuoteInvitationResponseSubmissionRevision` | query | 64 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `getClaimedQuoteInvitationResponseSubmissionRevision` | query | 78 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `submitQuoteInvitationResponse` | mutation | 97 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `submitClaimedQuoteInvitationResponse` | mutation | 118 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `startQuoteInvitationResponseRevision` | mutation | 142 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `startClaimedQuoteInvitationResponseRevision` | mutation | 156 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `withdrawQuoteInvitationResponse` | mutation | 173 | positive control; shared access implementation |
| `convex/quote_response_submissions.ts` | `withdrawClaimedQuoteInvitationResponse` | mutation | 195 | positive control; shared access implementation |
| `convex/quote_response_templates.ts` | `listQuoteResponseTemplates` | query | 163 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `listQuoteResponseTemplateVersions` | query | 172 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `getQuoteResponseTemplate` | query | 182 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `getQuoteResponseTemplateVersion` | query | 188 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `createQuoteResponseTemplateDraft` | mutation | 198 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `updateQuoteResponseTemplateDraft` | mutation | 212 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `validateQuoteResponseTemplateDraft` | query | 226 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `publishQuoteResponseTemplate` | mutation | 236 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_response_templates.ts` | `selectQuoteResponseTemplateVersion` | mutation | 247 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `closeQuoteRound` | mutation | 74 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `cancelQuoteRound` | mutation | 87 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `reopenQuoteRoundWithRevision` | mutation | 100 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `revokeQuoteRoundInvitation` | mutation | 116 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `remindQuoteInvitationAccess` | mutation | 129 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `rotateQuoteInvitationAccess` | mutation | 143 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `replaceQuoteRoundInvitationEmail` | mutation | 156 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `acknowledgeQuoteInvitationPackageRevision` | mutation | 170 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_round_lifecycle.ts` | `acknowledgeClaimedQuoteInvitationPackageRevision` | mutation | 180 | reviewed; no standalone candidate in this discovery pass |
| `convex/quote_rounds/composer.ts` | `getQuoteRoundComposer` | query | 160 | see C7; Quote Round/Package Revision seam |
| `convex/quote_rounds/list.ts` | `listQuoteRounds` | query | 305 | see C7; Quote Round/Package Revision seam |
| `convex/quote_rounds/mutations.ts` | `getQuoteRound` | query | 174 | see C7; Quote Round/Package Revision seam |
| `convex/quote_rounds/mutations.ts` | `createQuoteRoundDraft` | mutation | 199 | see C7; Quote Round/Package Revision seam |
| `convex/quote_rounds/mutations.ts` | `updateQuoteRoundDraft` | mutation | 254 | see C7; Quote Round/Package Revision seam |
| `convex/quote_rounds/mutations.ts` | `refreshQuoteRoundDraftScope` | mutation | 405 | see C7; Quote Round/Package Revision seam |
| `convex/quote_rounds/mutations.ts` | `deleteQuoteRoundDraft` | mutation | 481 | see C7; Quote Round/Package Revision seam |
| `convex/quote_rounds/mutations.ts` | `publishQuoteRoundDraft` | mutation | 546 | see C7; Quote Round/Package Revision seam |
| `convex/submilestone_field_guidance.ts` | `getSubmilestoneFieldGuidance` | query | 511 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_field_guidance.ts` | `saveSubmilestoneFieldGuidance` | mutation | 552 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `getBuilderSubmilestoneScopeHistory` | query | 158 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `getBuilderSubmilestoneScopeRevisionContent` | query | 167 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `getSubmilestoneScopeHistory` | query | 176 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `getSubmilestoneScopeRevisionContent` | query | 185 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `createSubmilestoneScopeDraft` | mutation | 194 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `saveSubmilestoneScopeDraft` | mutation | 204 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `publishSubmilestoneScopeRevision` | mutation | 214 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `acknowledgeSubmilestoneScopeRevision` | mutation | 224 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `rejectSubmilestoneScopeRevision` | mutation | 234 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `approveSubmilestoneScopeRevision` | mutation | 245 | reviewed; no standalone candidate in this discovery pass |
| `convex/submilestone_scope_contracts.ts` | `overrideSubmilestoneScopeRevision` | mutation | 255 | reviewed; no standalone candidate in this discovery pass |
| `convex/todos.ts` | `list` | query | 13 | reviewed; no standalone candidate in this discovery pass |
| `convex/todos.ts` | `add` | mutation | 19 | reviewed; no standalone candidate in this discovery pass |
| `convex/todos.ts` | `toggle` | mutation | 36 | reviewed; no standalone candidate in this discovery pass |
| `convex/todos.ts` | `remove` | mutation | 52 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/context.ts` | `resolveWorkosManagementCommandContext` | query | 85 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/context.ts` | `recordWorkosManagementAudit` | mutation | 275 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/context.ts` | `resolveSharedLenderMembershipTarget` | query | 339 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/context.ts` | `recordSharedLenderMembershipAudit` | mutation | 411 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/directory.ts` | `syncWorkosDirectory` | action | 78 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/invitationEmails.ts` | `enqueueIdentityInvitationEmail` | mutation | 59 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `inviteUser` | action | 87 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `inviteBuilderStaffUser` | action | 164 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `inviteBuilderUser` | action | 203 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `inviteContractorUser` | action | 243 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `provisionBuilderStaffUser` | action | 314 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `updateMembershipRole` | action | 350 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `updateMembershipRoles` | action | 394 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `updateSharedLenderMembershipRoles` | action | 449 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `deactivateSharedLenderMembership` | action | 502 | see C1; canonical WorkOS-first path |
| `convex/workosManagement/membership.ts` | `createMembership` | action | 568 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `createClaimMembershipForUser` | action | 618 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `removeMembership` | action | 629 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `deactivateMembership` | action | 664 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/membership.ts` | `reactivateMembership` | action | 703 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/transfer.ts` | `beginPrincipalBrokerTransfer` | mutation | 93 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/transfer.ts` | `updatePrincipalBrokerTransferState` | mutation | 291 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosManagement/transfer.ts` | `transferPrincipalBroker` | action | 320 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosProjection/events.ts` | `ingestWorkosEvent` | mutation | 248 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosProjection/reads.ts` | `listUserManagement` | query | 206 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosProjection/reads.ts` | `listCurrentUserOrganizations` | query | 300 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosProjection/reads.ts` | `getActiveLenderOrganizationContext` | query | 420 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosProjection/reads.ts` | `getLenderOrganizationManagement` | query | 432 | reviewed; no standalone candidate in this discovery pass |
| `convex/workosProjection/reads.ts` | `listSyncStatus` | query | 701 | reviewed; no standalone candidate in this discovery pass |

## Migration and HTTP registration coverage

The handler manifest above covers all 937 exported fluent Convex handlers. The following registered migration definitions, migration runners, and HTTP route closures were reviewed separately because they are registered interfaces rather than ordinary exported handler variables.

### Migration registrations

Counts: 35 `migrations.define` registrations and 17 `migrations.runner` registrations.

| File | Registration | Kind | Declaration | Disposition |
| --- | --- | --- | ---: | --- |
| `convex/audit_event_migrations.ts` | `backfillAuditEventBuildId` | define | 130 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/audit_event_migrations.ts` | `runAuditEventBuildIdBackfill` | runner | 178 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_action_item_deadline_migrations.ts` | `backfillBuildActionItemDeadlineSchedules` | define | 13 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_action_item_deadline_migrations.ts` | `backfillBuildActionItemReferenceQueueSort` | define | 29 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_action_item_deadline_migrations.ts` | `runBuildActionItemDeadlineScheduleBackfill` | runner | 93 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_action_item_deadline_migrations.ts` | `runBuildActionItemReferenceQueueSortBackfill` | runner | 100 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_migrations.ts` | `backfillBuildNotesIntoCollaboration` | define | 4 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_migrations.ts` | `runBuildCollaborationNoteBackfill` | runner | 13 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_search_migrations.ts` | `backfillBuildCollaborationSearchBuilds` | define | 10 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_search_migrations.ts` | `backfillBuildCollaborationPostSearchRecords` | define | 22 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_search_migrations.ts` | `backfillBuildCollaborationCommentSearchRecords` | define | 35 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_search_migrations.ts` | `backfillBuildActionItemSearchRecords` | define | 50 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_search_migrations.ts` | `runBuildCollaborationSearchRecordBackfill` | runner | 63 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_system_post_boundary_migrations.ts` | `retireNoncanonicalAutomatedCollaborationPosts` | define | 13 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/build_collaboration_system_post_boundary_migrations.ts` | `runNoncanonicalAutomatedCollaborationPostRetirement` | runner | 85 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `backfillProposalBorrowerStartingCash` | define | 14 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `backfillActiveBuildBorrowerStartingCash` | define | 32 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `backfillCapitalPlanBorrowerStartingCash` | define | 54 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `runBorrowerStartingCashCutover` | runner | 69 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `backfillBrokeragePrincipalBrokerEmail` | define | 76 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `runBrokeragePrincipalBrokerEmailBackfill` | runner | 127 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `backfillWorkosUserNormalizedEmail` | define | 136 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `runWorkosUserNormalizedEmailBackfill` | runner | 147 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `backfillProposalCostItemBudgetTreatment` | define | 152 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `backfillBuildCostItemBudgetTreatment` | define | 162 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/legacy.ts` | `runCostItemBudgetTreatmentBackfill` | runner | 172 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/lender_member_permissions.ts` | `backfillLenderMemberDecisionPermissions` | define | 11 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/lender_member_permissions.ts` | `runLenderMemberDecisionPermissionsBackfill` | runner | 65 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/lender_organization.ts` | `backfillLegacyProposalLenderAssignmentOrganizations` | define | 139 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/lender_organization.ts` | `backfillLegacyProposalLenderApprovalOrganizations` | define | 176 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/lender_organization.ts` | `runLegacyLenderOrganizationCutover` | runner | 224 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase3.ts` | `backfillProposalPhase3PolicyAndRevision` | define | 172 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase3.ts` | `backfillProposalPhase3ApprovalRevision` | define | 208 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase3.ts` | `backfillProposalPhase3PolicyLock` | define | 474 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase3.ts` | `runProposalPhase3LifecycleBackfill` | runner | 635 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase9.ts` | `validateLenderPortalPhase9ApplyManifest` | define | 23 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase9.ts` | `reconcileLenderPortalPhase9PolicyAssignmentFacts` | define | 36 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase9.ts` | `reconcileLenderPortalPhase9ApprovalFacts` | define | 153 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase9.ts` | `reconcileLenderPortalPhase9PolicyLocks` | define | 359 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase9.ts` | `reconcileLenderPortalProposalLifecycle` | define | 512 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase9.ts` | `rebuildLenderPortalProposalKanbanProjection` | define | 646 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/migrations/phase9.ts` | `runLenderPortalPhase9Migration` | runner | 797 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/quote_response_template_migrations.ts` | `backfillQuoteResponseTemplateVersionIdentity` | define | 50 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/quote_response_template_migrations.ts` | `runQuoteResponseTemplateVersionIdentityBackfill` | runner | 71 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `backfillSubmilestoneScopeContracts` | define | 207 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `backfillSubmilestoneFieldGuidance` | define | 322 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `linkBuildSubmilestoneLineage` | define | 387 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `backfillQuoteRoundDraftScopePins` | define | 407 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `cleanupProposalSubmilestoneLegacyScopeFields` | define | 497 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `cleanupBuildSubmilestoneLegacyScopeFields` | define | 512 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `runSubmilestoneScopeGuidanceBackfill` | runner | 523 | reviewed; migration lifecycle excluded from runtime candidate ranking |
| `convex/submilestone_scope_guidance_migrations.ts` | `runSubmilestoneLegacyScopeFieldCleanup` | runner | 533 | reviewed; migration lifecycle excluded from runtime candidate ranking |

### HTTP route closures

Counts: 12 `httpAction` closures registered through `http.route`.

| File | Method | Path property | Interface | Handler line | Disposition |
| --- | --- | --- | --- | ---: | --- |
| convex/http.ts | "OPTIONS" | path=QUOTE_RESPONSE_DRAFT_ATTACHMENT_UPLOAD_PATH | httpAction route closure | 29 | registered HTTP interface |
| convex/http.ts | "POST" | path=QUOTE_RESPONSE_DRAFT_ATTACHMENT_UPLOAD_PATH | httpAction route closure | 44 | registered HTTP interface |
| convex/http.ts | "POST" | path="/resend-webhook" | httpAction route closure | 149 | registered HTTP interface |
| convex/http.ts | "GET" | path="/evidence-image-source" | httpAction route closure | 161 | registered HTTP interface |
| convex/http.ts | "OPTIONS" | path=BUILD_COLLABORATION_EXPORT_ASSET_PATH | httpAction route closure | 195 | registered HTTP interface |
| convex/http.ts | "OPTIONS" | path=BUILD_COLLABORATION_EXPORT_ARCHIVE_CHUNK_PATH | httpAction route closure | 212 | registered HTTP interface |
| convex/http.ts | "OPTIONS" | path=COST_DOCUMENT_PAGE_PATH | httpAction route closure | 229 | registered HTTP interface |
| convex/http.ts | "GET" | path=COST_DOCUMENT_PAGE_PATH | httpAction route closure | 244 | registered HTTP interface |
| convex/http.ts | "GET" | path=BUILD_COLLABORATION_EXPORT_ASSET_PATH | httpAction route closure | 370 | registered HTTP interface |
| convex/http.ts | "GET" | path=BUILD_COLLABORATION_EXPORT_ARCHIVE_CHUNK_PATH | httpAction route closure | 437 | registered HTTP interface |
| convex/http.ts | "GET" | path="/evidence-image-preview" | httpAction route closure | 532 | registered HTTP interface |
| convex/http.ts | "GET" | pathPrefix="/api/calendar/" | httpAction route closure | 562 | registered HTTP interface |

### Cron registrations

Counts: 16 scheduler registrations in `convex/crons.ts`. Every target is already present in the 937-handler manifest above.

| Declaration | Schedule | Target | Disposition |
| ---: | --- | --- | --- |
| 7 | every 5 minutes | `internal.build_collaboration_delivery_transport.processBuildCollaborationExternalDeliveries` | reviewed; scheduler interface |
| 15 | every 5 minutes | `internal.build_collaboration_scheduling.processDueBuildCollaborationScheduledPublications` | see C2; scheduler adapter |
| 23 | every 5 minutes | `internal.build_collaboration_scheduling.reconcileDueMilestoneSystemPosts` | see C2; scheduler adapter |
| 30 | every 5 minutes | `internal.build_collaboration_scheduling.reconcileDueDrawSystemPosts` | see C2; scheduler adapter |
| 37 | every 5 minutes | `internal.build_collaboration_planning_reconciliation.recoverActiveBuildPlanningRevisionMaterialization` | positive control; reconciliation module |
| 45 | every minute | `internal.build_collaboration_webhooks.recoverExpiredBuildCollaborationWebhookDeliveryLeases` | reviewed; scheduler interface |
| 53 | every 15 minutes | `internal.build_collaboration_export_archive.cleanupExpiredBuildCollaborationExportArchives` | reviewed; scheduler interface |
| 61 | every minute | `internal.quote_notifications.scheduleQuoteInvitationReminders` | reviewed; scheduler interface |
| 68 | every minute | `internal.quote_notifications.processDueCommunicationIntents` | reviewed; scheduler interface |
| 75 | every 15 minutes | `internal.build_collaboration_asset_maintenance.expireBuildCollaborationAssetStagingSessions` (open) | see C8; scheduler adapter |
| 83 | every 15 minutes | `internal.build_collaboration_asset_maintenance.expireBuildCollaborationAssetStagingSessions` (finalized) | see C8; scheduler adapter |
| 91 | daily 02:00 UTC | `internal.data_retention.fanOutDataRetentionWork` (reconcile) | secondary; retention seam |
| 98 | daily 03:00 UTC | `internal.data_retention.fanOutDataRetentionWork` (maintenance) | secondary; retention seam |
| 105 | daily 04:00 UTC | `internal.data_retention.cleanupExpiredDataRetentionTombstones` | reviewed; scheduler interface |
| 112 | hourly at minute 5 | `internal.build_action_item_queues.processBuildActionItemDeadlines` | see C3; scheduler adapter |
| 119 | daily 08:00 UTC | `internal.demo_timeline_plans.demo_rollForwardApprovedTimelines` | intentional demo infrastructure |

## C1-C4 implementation follow-up

The discovery phase identified C1-C4 as the first cutover set. The following
application/read-model owners now sit behind the existing fluent Convex
handlers. Public names, input contracts, authorization boundaries, and
realtime query entry points remain stable.

### C1 — Lender member deactivation

`convex/lender_organizations/member_deactivation.ts` owns the domain plans,
assignment transition, audit shape, idempotency preparation, accepted/failed
WorkOS command state, and projection reconciliation. `setLenderOrganizationStatus`
uses that owner for immediate application deactivation of active assignments;
pending invitations remain pending. Individual member deactivation remains
WorkOS-first: the WorkOS management action is an external adapter and the
WorkOS webhook projection is the reconciliation adapter.

### C2 — Build Collaboration publication

`convex/build_collaboration_publication_lifecycle.ts` owns publication approval,
exact-bundle revalidation, immediate and scheduled publication, retry/pause
transitions, audit, and outbox effects. Draft, scheduler, and cron functions
are inbound/scheduler adapters. Draw System Posts remain the canonical
automated collaboration publication source.

### C3 — Build Action Items

`convex/build_action_item_application.ts` owns the canonical Action Item row,
creation event, immutable revision, reference projection, queue ordering, and
deadline transition patches. Manual creation, collaboration publication,
policy deadlines, coordinator overrides, and queue processing retain their
distinct authorization and notification behavior while delegating shared
aggregate persistence.

### C4 — active Build projections

`convex/production_proposals/active_build_projection.ts` owns bounded,
indexed active-Build row loading and the shared funding projection. Builder,
Back Office, and Lender handlers continue to own authorization, privacy, and
persona DTOs; they no longer need separate core reads for the shared financial
and milestone rows. The loaders use the live Convex `QueryCtx`/`ctx.db`, so
extracting them preserves query dependency tracking and realtime invalidation.

### Verification and known baseline

- Focused C1-C4 tests: 33 passing; application/publication integration tests:
  75 passing; lender organization and WorkOS suites: 49 passing; production
  proposal and lender portal suites: 244 passing.
- `bun x tsc -p convex/tsconfig.json --noEmit`: passing.
- New application/read-model modules and the scheduling adapter pass focused
  Biome checks. Full-file lint still reports legacy complexity/import/format
  diagnostics in already-dirty large persona and organization modules; these
  were not reformatted or otherwise broadened in this cutover.
- The generated-companion fixture in `convex/build_action_items.test.ts` was
  aligned with the canonical System Post contract: it now supplies the
  `milestone-system:<buildId>:<milestoneId>` occurrence key and milestone
  reference fields. The Action Item suite now passes; the production reader
  remains fail-closed for legacy noncanonical rows.

## C6 and C8 implementation follow-up

The second cutover completes C6 and C8 without changing the existing fluent
Convex function names or the route-specific authorization contracts. Shared
application and projection owners now contain the repeated mechanics. Public,
scheduled, and persona-specific handlers remain adapters.

### C6 — Cost Document authorization and Contractor identity scope

`convex/cost_documents/authorization.ts` remains the single Cost Document
authorization decision owner. Builder draft, review, correction, submission,
and vendor adapters call that owner with an explicit intent. Shared audit
construction and persistence now live in `convex/cost_documents/audit.ts`.

`convex/contractor_identity_scope.ts` owns WorkOS projection-to-Brokerage scope
resolution. `convex/contractor_profile_application.ts` is the single
Contractor Profile persistence owner for creation, normalized patches, scoped
readback, and identity events. Contractor onboarding, claims, workspace,
merge, Cost Document vendor creation, quote invitation/round, and production
proposal handlers preserve their distinct authority and lifecycle decisions
while delegating canonical profile writes.

### C8 — Recipient inbox and collaboration asset upload orchestration

`convex/recipient_delivery_projection.ts` owns canonical recipient-delivery
projection, visibility policy, bounded summary, and pagination mechanics. The
Operations summary keeps its bounded aggregate contract. The Build
Collaboration inbox keeps recipient authorization, in-app visibility,
re-authentication privacy, and its paginated DTO.

`convex/build_collaboration_asset_upload_application.ts` owns the shared
finalize, abandon-on-failure, scan, and fail-closed status-readback sequence.
Builder and Lender handlers remain authority-specific inbound adapters and
continue to supply their existing finalize and status readers.

### Verification and residual baseline

- New canonical owner tests: 9 passing. C6 Cost Document, Contractor
  onboarding, merge, workspace, and evidence suites: 104 passing. C8 Build
  Collaboration, production proposal, and Lender Portal suites: 311 passing.
  Quote-round lifecycle coverage: 101 passing. Total focused evidence: 525
  passing tests.
- Production-consumer UI coverage for the notification inbox, Builder/Lender
  collaboration, Cost Document capture/drafts/vendor selection, and Contractor
  roster/detail surfaces: 176 passing tests. Combined impacted evidence: 701
  passing tests.
- `bun x tsc -p convex/tsconfig.json --noEmit`, `bun x convex codegen`, and
  `bun run build`: passing.
- The new owner modules pass focused Biome checks. Safe import and formatting
  fixes were applied to the changed adapters. The residual scoped diagnostics
  are existing complexity, explicit-`any`, non-null assertion, and type-style
  findings in large pre-existing modules; the refactor adds no unused-import or
  formatting diagnostics.
- The repository-wide suite currently has an unrelated dirty-tree baseline of
  15 failing files and 56 failing tests, with 299 files and 3,001 tests passing
  and 8 skipped. The focused C6/C8 suites above pass independently.

### Visible-browser acceptance evidence

Two dedicated GPT-5.6 Luna Max tasks exercised the current working-tree
snapshot against local Vite and disposable Convex dev data. They did not edit
source, commit, push, deploy, or mutate production.

- C6 Builder Cost Documents: `/builder/builds/$buildId?tab=costs` preserved a
  draft page, vendor, date, `$123.45` subtotal, and matching Sub-milestone
  allocation across reload. Freeze and submission completed. The ledger,
  documented amount, gross total, uploader context, and
  `cost document.submitted` audit UI updated observably. The Builder Staff
  entry point was independently reachable with creation available.
- C6 Contractor identity: `/contractor/onboarding` created one canonical
  profile and moved it to pending Back Office review. The same profile appeared
  in `/backoffice/contractors/onboarding` and `/backoffice/contractors/$id`;
  request-for-changes status/reason plus Back Office trade, city, and capability
  edits persisted. `/contractor/work` and `/contractor/profile` correctly
  failed closed at `profile-link-required` for the unlinked browser identity.
  Contractor/vendor submission remained blocked by the absence of a linked
  seeded contractor session, not by application failure.
- C8 inbox: the authorized Back Office global Notifications entry point loaded
  with All and Action required filters. The dev tenant contained no delivery
  rows, so manual read-state and cross-recipient assertions were not available;
  the dedicated inbox component and projection tests cover those contracts.
- C8 Builder collaboration asset: `/builder/builds/$buildId` accepted and
  published a disposable text attachment. The resulting feed rendered the
  attachment with MIME type, size, version, and Build audience. Publication
  proves the shared finalize/scan sequence returned an allowed asset, although
  the UI does not render the raw scan hash/status. Both tested Lender Build
  routes returned the same recoverable access error for the current session,
  so manual Lender upload was blocked by authorization/seed context; the
  Lender adapter and component suites pass independently.
