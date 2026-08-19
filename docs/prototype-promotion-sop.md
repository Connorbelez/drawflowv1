# Prototype Promotion Standard Operating Procedure

**Status:** Active engineering standard
**Applies to:** Every UI prototype, route, component, workflow, or visual variant promoted into a production surface
**Owner:** Product + engineering owner of the promoted surface
**Related contract:** `docs/lender-portal-prototype-promotion.md` and the selected entry in `src/components/prototypes/README.md`

## 1. Purpose

This SOP turns an approved prototype into a production-owned, data-backed surface without losing the interaction contract that was approved.

The standard has four non-negotiable outcomes:

1. The original prototype remains unchanged and available as historical evidence.
2. Production starts from a literal file copy of the selected prototype: copy the file, paste it into the production-owned destination, and edit only that pasted copy. This is not a pixel-perfect re-creation, screenshot recreation, visual clone, or new implementation inspired by the source.
3. Every visible fact and action is wired to an authorized canonical production loader or command; no placeholder data survives the promotion.
4. Missing production data, missing wiring, authorization denial, loading, and failures are visible through deliberate, accessible, role-safe states rather than blank space or invented content.

This is a promotion process, not a license to redesign a locked surface. A material structural or interaction change requires a new product decision, an updated prototype contract, and a new promotion record.

## 2. Authority and vocabulary

### 2.1 Authority order

Use these sources in this order:

1. The current product contract, PRD, and explicit selected-variant decision.
2. The prototype registry and promotion contract.
3. The source prototype route and components.
4. The canonical production domain, projection, authorization, and design-system primitives.
5. The implementation ticket and tests.

Written requirements explain the intended behavior. They do not authorize a replacement visual implementation when a selected prototype exists.

### 2.2 Terms

| Term | Meaning |
| --- | --- |
| **Source prototype** | The selected route/component files that record the approved information architecture, hierarchy, interaction gates, copy direction, and visual contract. |
| **Selected variant** | The explicitly Accepted, Approved, or Locked variant in the registry. A variant cannot be selected by inference. |
| **Promotion copy** | The byte-preserving file copy created by copying the selected source file(s) into a production-owned path before integration edits. “Copy” means a filesystem or IDE duplicate of the file contents; it does not mean manually rewriting JSX/CSS, matching a screenshot, or generating a new component. It becomes the only file changed during wiring and integration. |
| **Canonical loader** | The production query, projection, adapter, or read model that owns the surface's data. It must enforce tenant, organization, resource, role, and privacy boundaries. |
| **Canonical command** | The production mutation/action/endpoint that owns a state transition, validation, audit event, notification, or side effect. |
| **Fixture** | Local prototype or visual-parity data used to make a prototype render. Fixtures are never a production fallback. |
| **Placeholder** | Any fake, representative, hard-coded, demo, sample, mock, fixture, inferred, or silently defaulted production value, row, actor, decision, metric, or action. |
| **Wiring gap** | A missing loader, command, route registration, permission boundary, projection field, or other dependency required for the copy to behave as production. |
| **Empty state** | An intentional, user-facing state for a valid request that has no records. It is not a substitute for an error or a wiring gap. |
| **Not-configured state** | An intentional state showing that the required production integration or capability is not connected yet. It must never masquerade as an empty dataset. |
| **Verified promotion** | A promotion copy that passed every gate in Section 8 and has an attached promotion record tied to the exact release commit. |

### 2.3 Promotion statuses

Use these statuses in the registry or promotion record:

`Exploration` → `Selected` → `Approved` → `Locked` → `Copied` → `Wired` → `Verified` → `Retired`

`Copied` and `Wired` are implementation milestones, not release approval. A surface is not production-complete until it is `Verified`. If canonical wiring is unavailable, use `Wired — blocked` or `Promotion blocked`; never mark the surface `Verified` with fixtures.

## 3. Roles and gates

| Role | Responsibility |
| --- | --- |
| Product decision owner | Confirms the selected variant, intended actor, task, allowed departures, and any explicit deferral. |
| Prototype owner | Freezes the source prototype and supplies the source path, variant, registry entry, and decision evidence. |
| Production implementer | Performs the literal file copy/paste into production ownership, productionizes the pasted copy, performs the data/action wiring, removes placeholders, and adds state and reachability tests. |
| Domain/auth owner | Confirms that loaders, commands, resource ownership, organization scope, privacy projections, audit, and notifications use canonical boundaries. |
| Design/accessibility reviewer | Confirms visual/interaction parity, responsive behavior, keyboard/focus behavior, semantics, and state quality. |
| Release owner | Confirms exact-commit evidence, route reachability, deployment readiness, rollback/flag behavior, and final status. |

One person may hold several roles, but every sign-off remains explicit in the promotion record.

## 4. Non-negotiable rules

### Rule A — Freeze the source

After a variant is selected or locked, treat its source files as immutable evidence. Do not edit the original prototype to make promotion easier. If the prototype itself needs a product change, create a new prototype revision and update the registry before promotion work continues.

### Rule B — Copy before changing

Perform a literal file copy/paste from the selected source path into the production-owned destination. The first destination bytes must match the source bytes. Capture the copy checkpoint before changing imports, route registration, markup, styles, state, or behavior. A visual comparison or a screenshot is not a substitute for this file operation or its hash/diff evidence.

The mandatory sequence is:

1. Create the production-owned destination directory.
2. Copy each selected source file into that destination without manually rewriting it (for this repository, `cp -p <prototype-file> <production-file>` is the reference operation).
3. Prove source-to-destination byte parity with a hash and `git diff --no-index` (no diff is the expected result).
4. Only after the parity checkpoint, edit the pasted production copy to adjust imports, route ownership, data loaders, commands, state handling, and rough edges.

Do not regenerate a component from a screenshot, “take inspiration from” the prototype, hand-retype the JSX/CSS, or ask a design tool to recreate the pixels. Pixel parity is a verification result after the literal copy; it is never the implementation method.

The source prototype and production copy must have separate ownership and separate routes. Production must not import a prototype route as its implementation boundary.

### Rule C — Preserve the contract, not the scaffolding

Keep the selected hierarchy, information architecture, interaction gates, copy intent, states, and accessibility behavior. Replace prototype-only chrome, variant switchers, comparison variants, local state, fixture records, and unavailable local actions in the production copy.

If an approved component is already shared by multiple production personas, extract a shared production-owned component and keep the source prototype untouched. Do not create a second domain model, request aggregate, review sheet, evidence system, membership system, or notification path to make the copy easier.

### Rule D — Wire facts before polishing

For every visible field, row, badge, count, status, progress indicator, date, amount, actor label, attachment, and action, identify its canonical source and authorization rule before styling or declaring completion. A UI that looks correct with fake data is not wired.

### Rule E — Never use a production fixture fallback

Production code must not fall back from an absent query or failed loader to prototype arrays, representative objects, visual-parity fixtures, demo settings, sample actors, or hard-coded metrics. A fallback may hide a broken integration and may expose data across tenants.

### Rule F — Make missing capability explicit

If the canonical loader or command does not exist, the promotion is blocked. The production copy may be developed behind an explicit default-off flag or an authorized internal route if that is part of the release plan, but it must render a deliberate not-configured state and remain `Promotion blocked` until the real wiring exists.

### Rule G — Reachability is part of completion

A file, component, query, mutation, or endpoint is not implemented until its intended actor can reach it through a supported production entry point and observe the expected result. Prove navigation or authorized direct-route access, authentication, authorization, data loading, action execution, paired handoff, and failure states.

## 5. Promotion workflow

Every step ends with a required completion criterion. Record the evidence in the promotion record as the work proceeds.

### Step 0 — Intake and decision lock

Before editing source or production code:

- identify the product surface, actor, user task, and intended production entry point;
- identify the selected variant and its registry status;
- read the controlling prototype contract and any surface-specific specification;
- record the exact source paths and current commit/working-tree provenance;
- list explicit exclusions, deferred variants, and allowed structural departures;
- assign the product, domain/auth, design/accessibility, and release owners.

**Completion criterion:** The promotion record names one selected source, one intended production consumer, one decision authority, one destination ownership boundary, and every known deferral.

### Step 1 — Freeze and fingerprint the source

Do this before copying:

- confirm the source prototype is clean or record pre-existing user-owned changes;
- capture the source commit and a content hash for every source file;
- record the selected query/variant parameters;
- mark rejected variants and comparison controls as prototype-only;
- do not edit the source after this point.

**Completion criterion:** A reviewer can prove which exact prototype was selected and can detect any later source change.

### Step 2 — Copy and paste the source files into production ownership

Copy the selected route and component files into the production-owned location as literal files. Preserve the source hierarchy, markup, styles, and interaction code first. Do not create a replacement implementation and do not edit the source to make the copy easier.

Use this sequence for every source file:

```sh
# Reference operation for a single file; repeat for every selected source file.
mkdir -p <production-directory>
cp -p <prototype-file> <production-file>
shasum -a 256 <prototype-file> <production-file>
git diff --no-index -- <prototype-file> <production-file>
```

The hash values must match and the no-index diff must be empty before productionization begins. If the destination cannot compile until an import or path changes, record the byte-identical checkpoint first, then make that change in the pasted production copy. The source file remains frozen.

Productionization is where rough edges are handled: fix destination imports, route ownership, loading/empty/error states, responsive behavior, focus and semantics, domain edge cases, and canonical data/action integration in the pasted copy. None of those rough edges authorize regenerating the UI or editing the source prototype.

Immediately capture:

- source-to-copy parity evidence;
- destination route and route-tree registration;
- the production owner of the new files;
- the list of prototype-only imports that must be removed in Step 4.

Do not wire data, redesign the layout, or polish rough edges in the same edit that first creates the copy. The parity checkpoint must remain reviewable. The first productionization diff must be distinguishable from the copy operation.

**Completion criterion:** Every selected source file has a production-owned pasted counterpart; source and destination hashes match at the copy checkpoint; the no-index diff is empty; the source remains unchanged; and the first integration edit begins only after this evidence is recorded.

### Step 3 — Build the wiring ledger

Create a field/action ledger before replacing local data. Use one row for every visible or interactive contract element:

| Contract element | Canonical source | Scope/authorization | Transformation | Empty/unavailable behavior | Test/evidence |
| --- | --- | --- | --- | --- | --- |
| Visible fact, row, badge, count, date, amount, attachment, or actor | Query/projection/table owner | Tenant, organization, resource, role, privacy | Typed adapter or none | Explicit state | Focused assertion and route evidence |
| Button, menu item, form, or link | Canonical command/route | Actor, state, revision/cycle, idempotency | Typed input/response | Disabled only when justified, with explanation | Allow/deny and transition test |

The ledger must also name:

- the loading source and request lifecycle;
- current versus historical records;
- stale revision/cycle behavior;
- audit event and notification consequences;
- the next responsible actor's surface;
- attachments, evidence, collaboration, and privacy projections;
- any dependency that does not yet exist.

**Completion criterion:** Every visible production contract element has one canonical owner and one verified authorization rule, or is explicitly marked as a wiring blocker.

### Step 4 — Replace fixtures and local actions in the copy

In the production copy only:

- replace local arrays, fixture objects, local reducers, and representative actors with the canonical loader;
- replace local state transitions with canonical commands and typed responses;
- preserve the prototype's interaction gates while delegating authorization and state guards to the domain owner;
- remove comparison switchers and rejected variants from the production route;
- remove prototype shells, prototype-only labels, local completion claims, and visual-parity flags;
- retain only shared design-system primitives and production-owned reusable components;
- remove every production fallback to fixture data.

Do not hide an unresolved dependency with `|| demoData`, a static empty array, a sample object, a fake success response, or a disabled button that has no user-facing reason.

**Completion criterion:** A placeholder scan finds no fixture path from the production entry point to rendered data or actions, and the wiring ledger points to real loaders and commands.

### Step 5 — Implement the production state model

The copy must render an intentional state for each outcome. Use existing repository primitives and visual language; do not invent a parallel card/surface system.

| State | Meaning | Required behavior |
| --- | --- | --- |
| Loading | The authorized request is still resolving | Show a stable skeleton or loading treatment that preserves layout; do not show “no records.” |
| Ready | Authorized records exist | Render canonical data and the permitted actions. |
| Empty | The request is valid and there are zero records | Show a concise explanation, the relevant next step or support path, and no invented counts/rows. |
| Not configured | The required production integration or capability is not connected | Say that the workspace is not connected or configured, explain the consequence, and direct the user to the supported owner/admin path. Do not call this “empty.” |
| Forbidden | The actor is authenticated but lacks access | Use the repository's safe forbidden state; do not reveal resource existence, private identity, or private rationale. |
| Stale/unavailable | The record, revision, cycle, or integration changed while the surface was open | Explain that the view changed, offer refresh/reload, and prevent stale commands from mutating state. |
| Error | The request failed unexpectedly | Give a role-safe message, retry when safe, preserve the page shell, and record the request/error identifier through the existing observability path. |

An empty state is part of the visual contract. It should have a clear heading, one short explanation, an appropriate CTA or support path, enough breathing room, accessible semantics, and no internal implementation notes. It must work at the target breakpoints and with keyboard and assistive technology.

**Completion criterion:** Tests or captured route evidence cover loading, ready, empty, not-configured, forbidden, stale, and error behavior appropriate to the surface.

### Step 6 — Prove route and consumer reachability

Trace the supported production path end to end:

1. Navigation item or documented direct URL.
2. Route registration and parent layout.
3. Authentication and organization/tenant guard.
4. Canonical loader and permission-shaped projection.
5. Visible action and canonical command.
6. Durable state, audit, notification, and projection update.
7. Next responsible actor's queue/detail/badge/notification.
8. Authorized deep link and stale/forbidden behavior.

If the intended surface is system-only, prove the scheduler, webhook, worker, or internal caller instead of inventing a GUI.

**Completion criterion:** An authorized test actor can reach the surface from the supported entry point, exercise its primary job, and observe the durable result and counterparty handoff.

### Step 7 — Run the interface reviews and Impeccable passes in sequence, then verify parity and accessibility

Run four separate, ordered reviews against the production-owned copy and its reachable states. Never run them concurrently, reverse their order, or review only the frozen source:

Before the first Impeccable pass in a session, run its context setup once against the production route or component, then load the playbook for each explicit command:

```sh
node .agents/skills/impeccable/scripts/context.mjs --target <production-route-or-component>
```

Use the resulting product/design guidance for the pasted production copy. If any pass changes web UI, run the Impeccable detector once after those UI edits are complete, inspect its findings, and resolve real defects in the pasted copy. Do not run the detector against the frozen prototype or against this SOP.

1. **First, run `better-interface`** (full mode unless the scope is explicitly narrowed). Review the complete production flow across accessibility, layout, writing, typography, colors, UI, loading, empty, unavailable, error, and narrow-width states. Resolve its actionable findings in the pasted production copy, then record its consolidated verdict and verification evidence.
2. **After the first review is resolved, run `make-interfaces-feel-better`** (full mode unless the scope is explicitly narrowed). Review typography, surfaces, motion, icons, hit areas, and performance details on the same production flow. Resolve its actionable findings in the pasted production copy, then record its verdict and verification evidence.
3. **After the first two reviews are resolved, run `impeccable harden <target>`**. Exercise long, short, missing, localized, RTL/CJK, emoji, large-number, large-list, slow/offline, timeout, 400/401/403/404/429/500, validation, permission, rate-limit, concurrent-action, stale, and no-data cases. Resolve the resulting resilience defects in the pasted production copy and record the edge-case matrix and verification evidence.
4. **After hardening is resolved, run `impeccable polish <target>`** as the final bounded refinement pass. Preserve the incumbent visual world and behavior while fixing remaining hierarchy, spacing, typography, responsive, interaction, motion, icon, semantic, and design-system drift in the pasted production copy. Record the final verdict, evidence, and any narrow accepted exceptions.

If any pass returns `Block` or `Needs changes`, the promotion remains blocked until the findings are resolved or explicitly accepted by the product decision owner. Re-run the affected pass after fixes; if hardening changes the interface, re-run the final polish pass. The source prototype is never edited to satisfy any pass.

Review the production copy against the selected prototype at the same viewport and meaningful states:

- hierarchy, spacing, typography, controls, and responsive reflow;
- preserved interaction gates and copy intent;
- real empty/not-configured/error states;
- keyboard order, focus return, labels, target size, status announcements, and visible focus;
- privacy-shaped data for each role;
- no prototype-only switcher, route, chrome, fixture banner, or comparison variant in the production path.

Capture screenshots or equivalent browser evidence for the primary task and each material state. A screenshot is evidence of appearance only; pair it with route, authorization, data, and transition tests.

**Completion criterion:** The design/accessibility reviewer accepts the production copy and records every known limitation that screenshots cannot prove.

### Step 8 — Release and exact-commit certification

Before release:

- run focused loader/command, authorization, state, privacy, idempotency, stale-cycle, and route tests;
- run the repository typecheck and production build gates;
- run the placeholder and prototype-import scans;
- confirm the source prototype diff is empty since Step 1;
- verify the route is reachable in the deployed environment with production-shaped data and with no-data data;
- attach evidence to the exact release commit;
- record feature-flag/default-off or rollback behavior if a dependency is not yet available;
- update the registry/promoted-surface record to `Verified` only after all gates pass.

**Completion criterion:** The release owner can reproduce the promotion from the record, identify the exact source and release commits, and explain the behavior for every data and authorization state.

## 6. Required production data contract

### 6.1 One canonical owner per fact

The production surface may compose data, but it may not become a second owner. Build, proposal, milestone, draw, evidence, site visit, policy, review, organization, membership, audit, and notification state must come from their canonical domains or approved projections.

The UI must not:

- read a prototype fixture and merge it with a partial production response;
- derive a new lifecycle state from display-only booleans when the domain already owns the state machine;
- infer urgency, approval, funding, evidence coverage, or reviewer identity from missing fields;
- show a record to an actor merely because a related WorkOS organization or user exists;
- write WorkOS-owned projection tables from a product flow when the integration boundary owns those writes.

### 6.2 Typed projection boundary

Prefer one permission-shaped projection for the surface over many table reads in the component. The projection should make unavailable information explicit and should distinguish:

- no record;
- record exists but is not visible to this actor;
- record is visible but a child collection is not loaded;
- child collection is loaded and genuinely empty;
- integration or capability is not configured.

Use typed adapters at the boundary. Do not use `any` to bypass generated API typing, and do not silently coerce missing fields into production-looking values.

### 6.3 Action boundary

Every production action must call the canonical command that owns:

- authentication and authorization;
- current resource, revision, and cycle checks;
- idempotency and terminal-state guards;
- validation and policy gates;
- durable state;
- append-only audit;
- notification intent or other required outbox work;
- the projection refresh or invalidation needed by the next consumer.

The presence of a button is not evidence that the action is wired.

## 7. Empty and unavailable state standard

### 7.1 State selection rules

Use the most specific truthful state:

- Zero authorized rows → `Empty`.
- No active assignment or no eligible records → a role-specific empty state that does not reveal other tenants or historical private data.
- Query/adapter is intentionally unavailable → `Not configured` or `Unavailable`, with a supported owner/admin path.
- Permission denied → `Forbidden`.
- Query failed → `Error`.
- Child data was not requested or is paginated → `Not loaded`, not an invented empty collection.

Never convert a wiring exception, missing API function, unauthorized result, or backend error into an empty list.

### 7.2 Empty-state content

Every empty or not-configured state must answer:

1. What is empty or unavailable?
2. Why is the user seeing this state?
3. What can the user do next, if anything?
4. Who owns the next action when the user cannot resolve it?

Use plain product language. Keep internal ticket names, implementation notes, stack traces, reviewer-only rationale, and domain debugging detail out of the user-facing surface.

### 7.3 State tests

At minimum, test:

- authenticated actor with records;
- authenticated actor with zero records;
- authenticated actor with a missing integration/capability;
- unauthenticated actor;
- authenticated actor from another tenant/organization;
- stale or terminal record;
- loader failure and retry;
- partially loaded child data where applicable.

## 8. Evidence and acceptance gates

Promotion is blocked until every applicable gate is green.

### Gate P1 — Source preservation

- [ ] Source prototype path and selected variant are recorded.
- [ ] Source commit/hash is recorded.
- [ ] Source files remain unchanged after the promotion copy is created.
- [ ] Rejected and deferred variants remain prototype-only and are not silently promoted.

### Gate P2 — Copy fidelity

- [ ] Every selected source file was literally copied and pasted into a production-owned destination; the copy was not reconstructed from prose, screenshots, or visual memory.
- [ ] Source and destination hashes match and `git diff --no-index` is empty at the initial copy checkpoint.
- [ ] Initial source-to-copy parity was captured before import, route, wiring, layout, or polish edits.
- [ ] Production owns the copied route/components.
- [ ] Production does not import a prototype route as its implementation boundary.
- [ ] The selected hierarchy, interaction gates, copy intent, and accessibility contract remain intact.

### Gate P3 — Data and action wiring

- [ ] The wiring ledger covers every visible fact, row, badge, count, attachment, and action.
- [ ] Every loader is canonical, typed, tenant/organization/resource scoped, and permission-shaped.
- [ ] Every action calls a canonical command with current-state, authorization, validation, audit, and idempotency guards.
- [ ] No fixture, mock, demo, sample, representative, or hard-coded production fallback remains.
- [ ] No `any` bypasses the generated production API at the boundary.
- [ ] Missing dependencies are recorded as blockers rather than hidden.

### Gate P4 — State quality

- [ ] Loading, ready, empty, not-configured/unavailable, forbidden, stale, and error states are intentionally designed.
- [ ] Empty states contain no invented data and provide an appropriate next step.
- [ ] Not-configured states do not masquerade as empty datasets.
- [ ] Privacy and reviewer/internal data boundaries hold in every state.

### Gate P5 — Reachability

- [ ] Navigation or an authorized direct route reaches the production copy.
- [ ] Parent route and workspace guards are registered and tested.
- [ ] The intended actor can load real production-shaped data.
- [ ] The primary action produces the expected durable result.
- [ ] The next responsible actor can reach the resulting queue/detail/notification.
- [ ] Deep links reauthorize at open time and stale links fail safely.

### Gate P6 — Interface quality, resilience, and accessibility parity

- [ ] Production screenshots or equivalent browser evidence exist for the primary task.
- [ ] Empty and unavailable states were inspected at the target breakpoints.
- [ ] Keyboard focus, labels, status announcements, and responsive reflow were checked.
- [ ] `better-interface` ran first against the production copy; its consolidated verdict and evidence are recorded, and actionable findings are resolved or explicitly accepted.
- [ ] `make-interfaces-feel-better` ran second against the same production copy; its verdict and evidence are recorded, and actionable findings are resolved or explicitly accepted.
- [ ] `impeccable harden` ran third against the same production copy; its edge-case matrix and verdict are recorded, and actionable findings are resolved or explicitly accepted.
- [ ] `impeccable polish` ran fourth and last against the same production copy; its final verdict and evidence are recorded, and actionable findings are resolved or explicitly accepted.
- [ ] All four passes were run separately and in this order; none inspected only the source prototype.
- [ ] Impeccable context setup ran once against the production target, and each command's playbook was followed.
- [ ] If UI files changed, the detector ran once after the UI edits; findings were inspected and real defects were resolved or explicitly accepted.
- [ ] No internal notes or prototype-only chrome appear in the user-facing surface.

### Gate P7 — Verification and release

- [ ] Focused domain, projection, authorization, transition, privacy, idempotency, and route tests pass.
- [ ] Typecheck and production build pass.
- [ ] Placeholder/prototype-import scans pass for the production entry point and its dependency graph.
- [ ] Evidence is tied to the exact release commit.
- [ ] Rollback/default-off behavior is documented for any remaining external dependency.
- [ ] Registry and promotion record are updated to `Verified` only after all applicable gates pass.

## 9. Failure-mode controls

| Failure mode | Control in this SOP | Detection evidence |
| --- | --- | --- |
| Prototype used only as inspiration or visually re-created | Rule B, Step 2 literal copy/paste, Gate P2 | Per-file hashes match; `git diff --no-index` is empty at the copy checkpoint; first productionization diff is recorded separately |
| Prototype route remains the production implementation | Rule B, Step 4, Gate P2 | Import scan from production entry point; route ownership check |
| Prototype remains a prototype but is wired directly into production | Rule B, Step 4, Gate P2 | Production route does not import prototype route/components; registry distinguishes source from copy |
| Production copy still renders fixture/placeholder data | Rules D/E, wiring ledger, Gate P3 | Placeholder scan plus field/action ledger and production-shaped route test |
| Missing backend wiring hidden by a blank page | Rule F, Step 5, State standard | Not-configured state test; no unresolved API/loader dependency is marked verified |
| No production records mistaken for broken wiring | Step 5 and Section 7 | Empty-state test with a truthful no-record response; separate unavailable test |
| A function exists but no actor can reach it | Rule G, Step 6, Gate P5 | Navigation/direct-route and consumer-to-command test |
| One surface has a new parallel domain model | Rules C and Section 6 | Canonical-owner review; schema/function/import inventory |
| Approved visual hierarchy drifts during integration | Rule C, Step 7, Gate P2/P6 | Same-viewport parity evidence and explicit deviation record |
| A stale or unauthorized action succeeds | Section 6.3, Gate P5/P7 | Stale, terminal, cross-tenant, and deny tests at the canonical command boundary |
| Source prototype is edited to resolve production defects | Rule A, Step 1, Gate P1 | Source hash/diff check and separate prototype revision process |
| Interface review or resilience pass is skipped, reversed, or run only against the prototype | Step 7, Gate P6 | Promotion record shows separate `better-interface` → `make-interfaces-feel-better` → `impeccable harden` → `impeccable polish` verdicts for the production copy |
| Impeccable context or detector is run repeatedly, against the source, or not recorded | Step 7, Gate P6 | Promotion record names one context setup target and one post-edit detector result for the production copy |

## 10. Promotion record template

Create one record beside the implementation ticket or in the surface's execution ledger. Do not mark a record `Verified` with blank fields.

```md
# Prototype Promotion Record — {surface}

- Promotion ID:
- Surface / actor / user task:
- Selected variant and registry status:
- Product decision authority and decision date:
- Source prototype paths:
- Source commit and file hashes:
- Production destination paths:
- Production route and navigation/direct-link contract:
- Allowed departures from the selected prototype:
- Explicitly deferred/rejected variants:
- Domain/auth owner:
- Design/accessibility owner:
- Release owner:

## Literal copy/paste checkpoint

- Copy command(s) or IDE file-copy operation:
- Source file hashes before copy:
- Destination file hashes before productionization:
- Hashes match: yes/no
- `git diff --no-index` is empty at checkpoint: yes/no
- Copy checkpoint commit or working-tree evidence:
- Productionization edits began after checkpoint: yes/no
- Source remained unchanged: yes/no

## Wiring ledger

| Element | Canonical loader/command | Scope and permission | State mapping | Evidence |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Placeholder removal

- Prototype imports removed from production entry point: yes/no
- Fixture/mock/demo/sample/representative values removed: yes/no
- Visual-parity flag/fallback removed or explicitly default-off: yes/no
- Placeholder scan command and result:

## State and reachability evidence

- Loading:
- Ready:
- Empty:
- Not configured/unavailable:
- Forbidden:
- Stale/terminal:
- Error/retry:
- Authorized route/navigation evidence:
- Primary action and durable result:
- Paired next-actor surface:
- Privacy/accessibility evidence:
- `better-interface` first-run scope, verdict, and evidence:
- `make-interfaces-feel-better` second-run scope, verdict, and evidence:
- `impeccable harden` third-run target, edge-case matrix, verdict, and evidence:
- `impeccable polish` fourth/final-run target, verdict, and evidence:
- Impeccable context setup command, target, and output reference:
- Detector command, changed UI targets, and result (one post-edit run):
- Findings resolved or explicitly accepted by product decision owner:

## Verification

- Focused tests:
- Typecheck/build:
- Browser/visual evidence:
- Exact release commit:
- Rollback or default-off behavior:
- Known limitations:
- Final status: Exploration / Selected / Approved / Locked / Copied / Wired / Wired — blocked / Verified / Retired
- Sign-offs: product / domain-auth / design-accessibility / release
```

## 11. Recommended repository checks

Use the repository's current package scripts and test conventions. The following checks are the minimum pattern for this codebase:

```sh
# Prove the literal source-file copy is byte-identical before productionization.
shasum -a 256 <prototype-file> <production-file>
git diff --no-index -- <prototype-source> <production-copy>

# Search the production entry point and its owned dependency files for fixture signals.
rg -n -i 'prototype|mock|fixture|demo|sample|representative|placeholder|hard-coded|TODO' <production-files>

# Confirm production consumers call generated canonical APIs.
rg -n 'api\.|useQuery|useMutation|useAction|navigate|Link' <production-route-and-features>

# Use the repository's focused tests, typecheck, build, and release gates.
bun run test
bun run typecheck
bun run build
```

These checks are evidence prompts, not substitutes for the wiring ledger, authorization review, browser verification, or product sign-off. Adapt the paths and focused test command to the surface, and record the exact commands and commit in the promotion record.

## 12. Definition of done

A prototype promotion is complete only when all of the following are true:

- The original selected prototype is preserved and fingerprinted.
- Every selected source file was copied and pasted into production ownership before it was edited; the copy checkpoint is byte-identical and independently evidenced.
- The production surface is a copy-derived implementation under production ownership, not a pixel-perfect re-creation or a prototype route wired directly into production.
- The selected information architecture, interaction gates, and boundaries are preserved.
- Every production-visible fact and action has a canonical, authorized source.
- No placeholder, fixture, mock, representative fallback, or prototype route remains in the production dependency path.
- Honest loading, ready, empty, not-configured, forbidden, stale, and error states exist where applicable.
- The intended actor can reach the surface and complete its primary task.
- The durable result, audit, notification, projection, and next-actor handoff are observable.
- `better-interface` ran first, `make-interfaces-feel-better` ran second, `impeccable harden` ran third, and `impeccable polish` ran fourth and last against the production copy; all four passes have resolved or explicitly accepted findings.
- Focused tests, typecheck, build, parity, accessibility, and exact-commit evidence pass.
- The promotion record and registry status say `Verified`.

If any item is false, the correct status is `Promotion blocked` or `Wired — blocked`, with the missing evidence named explicitly.
