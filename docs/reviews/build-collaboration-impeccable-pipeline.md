# Build Collaboration Impeccable Application Review

> Production surfaces: `/backoffice/builds/$buildId`,
> `/builder/builds/$buildId`, `/homeowner/builds/$buildId`, and
> `/contractor/builds/$buildId`.
>
> Canonical product contract: `docs/specs/build-collaboration.md`.

## Interaction contract

### Target and outcome

Build Collaboration is the Build-local, permission-aware operational record for
lender teams, builders, builder staff, homeowners, and contractors. The default
Backoffice and Builder destination remains Details. Build Overview stays first
and unchanged; collaboration follows it in the same canonical Build context.
Homeowner and grant-only Contractor routes lead with the same shared
collaboration workspace.

The interface succeeds when authorized participants can understand current
Build activity, publish to an unambiguous audience, turn discussion into
accountable work, return to exact referenced entities, and recover from
interruption without fabricating receipts, authorship, or shared state.

### Material personas

- **Admin and Principal Broker:** organization-wide governance, moderation,
  audit, acknowledgement, escalation, export, and final decision support.
- **Broker and Broker Staff:** assigned/granted Build coordination, evidence
  follow-up, Action Item triage, scheduling, and decision preparation.
- **Builder and Builder Staff:** progress reporting, contractor coordination,
  evidence submission, blocker resolution, and assigned work execution.
- **Homeowner:** explicitly assigned Build participation, questions,
  acknowledgements, and assigned work without lender-only disclosure.
- **Contractor:** mobile-first field updates, governed attachments, referenced
  work, and Action Item execution without financing detail.
- **Human approving agent-prepared work:** exact bundle review and HITL publish;
  the human is always the author.
- **Accessibility and resilience personas:** keyboard, screen-reader, touch,
  narrow viewport, reduced-motion, intermittent-network, interrupted, revoked,
  and high-volume users.

### Core user stories

1. Enter the same authorized Build through the correct role shell and see the
   same canonical collaboration projection.
2. Publish an Update, Question, Decision, Issue/Blocker, or authorized
   Announcement with typed references, governed files, Action Items, and an
   explicit effective audience.
3. Read, search, pin, follow, acknowledge, discuss, resolve, moderate, and
   export only when server-projected capabilities permit it.
4. Convert a post into Linear-like work with assignment, priority, due date,
   dependency, status, acceptance, revision, and audit context.
5. Follow a notification, search result, or `@` reference to the exact
   authorized post, comment, tab, or reusable detail sheet.
6. Preserve private work offline or through interruption, then revalidate
   identity, access, audience, assets, and revision before publication.
7. Read a closed Build as an archive without being offered mutations that can
   only fail.

### Required states and transitions

- Authentication and route admission: unauthenticated, wrong shell,
  organization mismatch, Build grant, active access, revoked access.
- Workspace availability: loading, active rollout, inactive rollout,
  collaboration-local error, empty feed, restricted placeholder.
- Composer: closed, editing, saving, saved privately, offline-only, stale
  revision, conflict, HITL review, scheduling, publishing, published.
- Feed: stable current rows, buffered new activity, focused deep link,
  load-more, search/filter, revoked target, empty results.
- Post: open, resolved, reopened, revised, tombstoned, moderated, pinned,
  followed, acknowledgement outstanding/complete.
- Action Item: unassigned/requested/accepted, valid workflow transitions,
  dependency blocked, completion awaiting acceptance, done/cancelled.
- Build lifecycle: active, closed read-only archive, reopened, purged.

### Interaction invariants

- Server-projected authorization and capabilities are authoritative; route,
  role label, or hidden UI never grants permission.
- Audience can narrow only down the approved hierarchy and never exclude
  mandatory peers or higher roles. Typed entity ACLs may narrow further but
  never widen access.
- Seen means meaningful viewport exposure of the current revision, not React
  mount. Receipt visibility is hierarchy-filtered, and Admin view receipts are
  never exposed to another participant.
- Agents may prepare everything except publication. HITL approval publishes
  under the human author.
- Offline work remains private. Reconnect never replays shared effects without
  current server validation.
- Realtime updates do not move the content being read; new rows are introduced
  through an explicit, accessible control.
- Closed Builds preserve read/search/export/audit access and reject or suppress
  every shared mutation affordance.
- Build Overview remains unchanged and above collaboration on Backoffice and
  Builder Details.
- The shared workspace and primitives are reused across all four route
  families; no role-specific parallel feed is introduced.

### Non-goals

- Redesigning Build Overview, the Build tab model, or construction-finance
  workflows outside direct collaboration integration.
- Creating a generic social network, generic project board, or separate
  collaboration domain per role.
- Replacing server authorization with optimistic client role inference.
- Granting Homeowners or Contractors lender-only operational or financing data.

### Settled implementation defaults

- Seen exposure: at least 50% intersection for one continuous second while the
  document is visible; focused deep links use the same accountable rule.
- Autosave: one-second debounce, immediate flush when the document becomes
  hidden, tenant/user/Build-scoped device fallback, and removal after successful
  publication or confirmed discard.
- Closed Build UI: hide creation/mutation controls, retain audit/history/search,
  and show one explicit read-only banner.
- Narrow layouts: assigned work is reachable before the long feed; the primary
  Publish action remains unambiguous and controls reflow without horizontal
  scrolling.

## Pipeline ledger

| Stage | Status | Material result |
| --- | --- | --- |
| Persona/workflow analysis | Complete | Cross-role interaction contract and severity-ranked risk register established. |
| Clarify | Complete | Audience, acknowledgement, loading, offline, receipt, and Action Item language made explicit and accessible. |
| Distill | Complete | Approved Familiar Feed, Build Overview-first composition, and progressive composer retained; no functional surface removed. |
| Typeset | Complete | Collaboration headings, detail-sheet hierarchy, rich-text measure, dense metadata, and readable status copy were normalized without changing Build Overview. |
| Colorize | Complete | Existing semantic tokens and DrawFlow lime accent were retained; reference, warning, offline, and read-only states now use consistent semantic emphasis. |
| Technical audit | Complete | Impeccable detector: zero findings. HTML interaction audit: 78 snippets, zero failures. Toolbar controls now expose accessible names and pressed state. |
| UX critique | Complete | Initial dual critique plus isolated layout/mechanical scans drove the mobile work priority, composer hierarchy, lazy discussion, and reference-detail improvements. |
| Harden | Complete | Wrong-shell admission fails closed with an intentional unavailable state; closed/purged Builds suppress shared mutations; search, offline, autosave, and route recovery states are explicit. |
| Optimize | Complete | Initial feed discussion fan-out reduced from one query per rendered post to zero until discussion intent; comment editors and post subpanels are lazy. |
| Polish | Complete | Personal work is first on narrow layouts, composer actions reflow, comment indentation is capped, rich reference cards open existing detail sheets, and toolbar buttons are touch/assistive-technology ready. |
| Final regression gates | Complete | Independent final critiques converged at 37/40 and 40/40 with no actionable P0/P1/P2 findings; typecheck/build, tests, production browser interaction, route-boundary checks, detector, and HTML interaction audit are green. |

## Initial severity register

- P1: mount-based false Seen receipts.
- P1: Admin-peer receipt visibility does not match the approved hierarchy.
- P1: missing private composer autosave.
- P1: realtime feed updates can displace the reader.
- P1: closed Builds expose mutation controls despite server read-only rules.
- P1: effective custom audience is not previewed before publication.
- P1: role/capability divergence exposes unsupported post types, Action Item
  transitions, and edit controls.
- P1: some Action Item notifications use the wrong role shell.
- P2: Contractor legacy-detail loading can render a blank screen.
- P2: route recovery, search retry, mobile work priority, touch targets, pending
  states, and large-discussion request amplification need convergence work.

## Convergence decisions

- Build Overview and its existing nested operational cards were intentionally
  left unchanged. The only addition is the following `Build collaboration`
  section heading and supporting copy.
- Linked entity surfaces remain content cards because they are real interactive
  entities with hover/click affordances, typed metadata, and reusable detail
  sheets—not structural wrapper decoration.
- Composer complexity remains progressively disclosed behind the collapsed
  “What should people involved in this Build know?” launcher. Role-projected
  controls remove Announcement and custom-audience affordances where they are
  not authorized.
- Homeowner and Contractor wrong-shell or unassigned access returns a deliberate
  `Build unavailable` state. The collaboration API remains inaccessible, so the
  friendlier boundary does not broaden authorization.
- Closed Builds keep read-safe asset access and personal preferences available,
  while post, discussion, Action Item workflow, child-work, checklist, and
  relationship mutations are absent or inert.
- The compact narrow-screen personal queue uses one truthful disclosure: it
  reveals every currently loaded Action Item before offering server pagination.
- Final independent critiques scored 37/40 and 40/40 and reported no remaining
  actionable P0, P1, or P2 findings.

## Validation evidence

- `bun run typecheck`: pass, including Convex TypeScript and production Vite /
  Nitro builds.
- Focused Build Collaboration regression suite: 10 files, 104 tests, all pass;
  the final archive and responsive-disclosure gate is 65/65.
- Complete Vitest suite: 207 files and 1,741 tests, all pass with a clean exit.
- `node /Users/connor/.agents/skills/impeccable/scripts/detect.mjs --json`:
  `[]`.
- `bun scripts/audit-ui-html-interactions.mjs`: 78 snippets audited, zero
  failures.
- Production browser QA: Backoffice and Builder render Build Overview first and
  the shared collaboration workspace second; wrong-role Homeowner and
  Contractor requests render explicit unavailable states without route errors;
  `@` exposes typed participants and Build entities; linked Milestones open the
  reusable detail sheet; toolbar controls have accessible names.
