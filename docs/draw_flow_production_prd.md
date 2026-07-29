# DrawFlow Production PRD

**Product:** DrawFlow
**Module:** FairLend Construction Draw Management
**Document type:** Production product requirements document
**Status:** Draft for product review
**Primary audience:** Product, engineering, operations, brokerage leadership, implementation agents
**Created:** May 25, 2026

---

## 1. Purpose

DrawFlow is moving from demo surfaces into a coherent, production-ready multi-tenant SaaS product. This PRD defines the missing product spine:

- authentication and identity,
- authorization, RBAC, and domain roles,
- tenant and brokerage structure,
- production domain schema,
- user, organization, builder, and contractor management,
- proposal, live build, evidence, site visit, milestone approval, and draw release workflows.

This document extends `docs/draw_flow_prd.md`. Where the older PRD uses generic lender roles, this document is authoritative for the brokerage-scoped production model.

DrawFlow remains reimbursement-only in v1. No workflow may release proactive advance funding before work is completed, evidenced, reviewed, and approved by an authorized final approver.

---

## 2. Product Thesis

DrawFlow is a construction draw operating system for brokerages, brokers, builders, contractors, and backoffice teams. The product helps a builder turn a construction roadmap into a feasible reimbursement draw plan, then helps the brokerage govern execution through evidence, site visits, milestone approvals, draw approvals, audit trails, and integrations.

The production product must stop behaving like independent demos. It needs one coherent model:

1. A **brokerage** is the primary tenant.
2. A **Principal Broker** owns brokerage administration inside that tenant.
3. **Brokers** onboard and manage builder relationships.
4. **Backoffice Staff** perform operational work but do not silently become final approvers.
5. **Builders** are borrowers onboarded under a broker and brokerage.
6. **Contractors** are deduped domain entities that may exist without accounts and may later be linked to authenticated contractor users.
7. **Platform Admins** can provision and manage all tenants, users, assignments, and policy exceptions.

---

## 3. Tenancy and Organization Model

### 3.1 Tenant Definition

The primary tenant is a **Brokerage Organization**.

Each brokerage maps to exactly one WorkOS Organization in production:

- `workosOrganizationId` identifies the WorkOS org.
- `brokerageId` identifies the DrawFlow domain org.
- All tenant-scoped entities store `organizationId`.
- Route params, user role labels, and UI state are never sufficient authorization.

### 3.2 Platform Scope

Platform Admins operate above tenant scope.

Platform actions include:

- create, suspend, archive, and restore brokerages,
- provision the first Principal Broker for a brokerage,
- transfer builders across brokerages,
- resolve cross-tenant duplicate contractor profiles,
- investigate audit events across tenants,
- configure platform-level policies, feature flags, and integration settings,
- impersonate or assist users only through audited support workflows.

### 3.3 Brokerage Scope

Within a brokerage organization:

- one active Principal Broker is required,
- brokers, backoffice staff, and external participants are members or invitees,
- builders are onboarded under a broker,
- contractors are added to the brokerage contractor bank through relationship records,
- proposals, builds, loans, budgets, milestones, draws, evidence, work orders, policies, webhooks, and audit events are organization-scoped.

### 3.4 Multi-Organization Users

A user may belong to multiple WorkOS Organizations.

Examples:

- a backoffice specialist works for two brokerages,
- a contractor has relationships with several brokerages,
- a platform admin belongs to the FairLend platform admin org and also test brokerages,
- a broker moves between brokerages and has historical access only where explicitly retained.

The app shell must show active organization context and must evaluate permissions against the active organization for every route and mutation.

---

## 4. Personas and Role Boundaries

### 4.1 Platform Admin

Platform Admin is the FairLend/DrawFlow administrator with global authority.

Responsibilities:

- provision brokerages,
- invite or replace Principal Brokers,
- view all organizations and builds,
- resolve support issues,
- reassign builders across organizations,
- perform emergency access actions,
- manage platform policies, feature flags, and integration templates.

Restrictions:

- god mode is not audit-free mode,
- every material cross-tenant action must record actor, reason, prior state, new state, affected tenant, and affected entity,
- support impersonation must be time-bound and visible in audit history.

### 4.2 Principal Broker

Principal Broker is the organization owner for one brokerage. There is exactly one active Principal Broker per brokerage organization.

Responsibilities:

- manage brokerage profile and policy defaults,
- invite, deactivate, and role-change brokers and staff,
- see all builders, proposals, builds, draws, contractors, work orders, and audit events in the brokerage,
- assign or reassign builders to brokers inside the brokerage,
- request or approve builder transfer out of the brokerage where policy allows,
- approve high-authority brokerage actions, including final draw release where configured,
- manage brokerage-level integrations and webhook settings.

Restrictions:

- cannot silently view or mutate another brokerage unless also a member there,
- cannot create a second active Principal Broker without transfer-of-control workflow,
- cross-organization builder transfer requires Platform Admin action or explicit source/destination approval policy.

### 4.3 Broker

Broker is a brokerage user who owns borrower relationships and deal intake.

Responsibilities:

- invite and onboard builders,
- create proposals on behalf of builders where policy allows,
- receive and review applications,
- manage assigned builder relationships,
- view assigned builders, proposals, live builds, draw status, evidence state, contractor assignments, and communications,
- request backoffice work,
- recommend proposal decisions where policy allows.

Restrictions:

- default access is assigned-portfolio access, not full brokerage access,
- cannot manage brokerage staff roles,
- cannot final-approve draw release unless separately granted a high-authority policy role,
- cannot reassign builders outside their permitted brokerage scope.

### 4.4 Backoffice Staff

Backoffice Staff are brokerage operations users.

Responsibilities:

- read brokerage work queues where granted,
- claim or receive assigned work,
- review proposals and evidence,
- request missing information,
- request or perform site visits,
- complete structured site visit reports,
- submit recommendations,
- prepare work for Principal Broker, Broker, or configured final approver.

Restrictions:

- read access does not imply mutation access,
- staff can recommend but do not final-approve milestone completion or draw release by default,
- assigned work can narrow access to specific proposals, builds, milestones, or site visits.

### 4.5 Builder

Builder is the borrower or borrower-side organization responsible for the construction project.

Responsibilities:

- sign up or accept invite under a broker,
- complete onboarding,
- create and submit Build Proposals,
- manage proposal milestones and contractors,
- maintain live build progress,
- adjust milestone start and completion dates as field reality changes,
- upload evidence,
- request milestone completion review,
- request draws after eligible milestone completion,
- respond to missing-information requests,
- confirm draw receipt.

Restrictions:

- sees only their own proposals/builds unless added to another builder organization,
- cannot approve lender/brokerage work,
- cannot mutate approved budgets or draw plans without revision workflow,
- reassignment to another broker or brokerage is controlled by Platform Admin and Principal Broker policy.

### 4.6 Contractor

Contractor is a company or individual that performs construction work.

Important distinction:

- **Contractor Profile:** domain entity used for assignment, history, dedupe, and project records.
- **Contractor Account:** authenticated user identity linked to one or more contractor profiles.

A contractor profile can exist without an account. A contractor account can be invited later and linked to a profile after verification.

Responsibilities:

- maintain profile details where account-linked,
- be assigned to builds, milestones, subtasks, or site work,
- upload permitted work evidence where invited,
- respond to contractor-specific requests,
- view only work and brokerage relationships they are allowed to see.

Contractor profiles are deduped across brokerages but exposed through brokerage-scoped relationship records. A single contractor can belong to multiple brokerages.

### 4.7 Site Visit Staff / Inspector

Site Visit Staff may be internal backoffice staff, contractors, or external inspectors.

Responsibilities:

- claim or accept assigned site visits,
- review target build/milestone scope,
- capture photos, video, files, notes, and geofence/location attempt,
- submit structured reports and recommendations,
- sync offline drafts when connectivity returns.

Restrictions:

- token or assignment access is scoped to the target site visit,
- site visitors cannot browse unrelated brokerage data,
- recommendations are not final approvals.

---

## 5. Authentication Requirements

### 5.1 Auth Provider

Production authentication uses WorkOS AuthKit:

- frontend: `@workos/authkit-tanstack-react-start`,
- Convex side: `@convex-dev/workos-authkit`,
- WorkOS Organizations for brokerage tenancy,
- WorkOS invitations for staff, brokers, builders, contractors, and inspectors where possible.

The app must not use `@workos-inc/authkit-react`.

### 5.2 Identity Lifecycle

Required states:

1. `invited`: invite exists, no completed auth session yet.
2. `active`: user authenticated and mapped to at least one active organization relationship.
3. `suspended`: login may succeed, but app access is blocked for the suspended scope.
4. `deactivated`: user is removed from active work but retained for audit history.
5. `pending_claim`: contractor or builder account is attempting to claim an existing domain profile.

### 5.3 Account Linking

The authenticated user record must link to domain profiles through explicit link tables:

- staff/broker membership links,
- builder account links,
- contractor account links,
- site visitor assignment links.

Do not collapse user identity, builder profile, and contractor profile into one table. The same human may act in different capacities across organizations.

---

## 6. Authorization Model

### 6.1 Authorization Layers

Every protected route, query, mutation, and action evaluates all applicable layers:

1. **Authenticated user:** valid WorkOS session.
2. **Active organization:** user has selected a WorkOS Organization or platform scope.
3. **Organization membership:** user has active membership or invited participant access.
4. **Domain role:** principal broker, broker, backoffice staff, builder, contractor, inspector, platform admin.
5. **Resource relationship:** assigned builder, assigned broker, contractor relationship, build participant, work-order assignee.
6. **Workflow state:** action is legal for the current proposal/build/milestone/draw state.
7. **Policy grants:** brokerage policy allows the action for this role.
8. **Audit requirements:** reason/comment/warning capture is present for material actions.

### 6.2 Role Hierarchy

Platform Admin outranks tenant roles but is still audited.

Within a brokerage:

1. Principal Broker.
2. Broker with assigned portfolio permissions.
3. Backoffice Staff with role grants and assignment grants.
4. Builder with owned proposal/build permissions.
5. Contractor with assigned contractor permissions.
6. Tokenized Site Visitor with site-visit-only permissions.

Hierarchy is not enough. A Principal Broker can see all brokerage builds; a Broker usually sees assigned builders; Backoffice Staff may see queues or assigned work depending on grant.

### 6.3 Permission Matrix

| Capability | Platform Admin | Principal Broker | Broker | Backoffice Staff | Builder | Contractor | Site Visitor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Provision brokerage | Yes | No | No | No | No | No | No |
| Assign Principal Broker | Yes | Transfer only | No | No | No | No | No |
| Manage brokerage staff | Yes | Yes | No | No | No | No | No |
| Invite brokers | Yes | Yes | Configurable request | No | No | No | No |
| Invite backoffice staff | Yes | Yes | Configurable request | No | No | No | No |
| Invite/onboard builder | Yes | Yes | Yes | Configurable | Self-signup under broker | No | No |
| Reassign builder inside brokerage | Yes | Yes | Assigned only/request | No | No | No | No |
| Transfer builder across brokerage | Yes | Request/approve policy | No | No | No | No | No |
| Create Build Proposal | Yes | Yes | Yes on behalf | Staff assist | Yes | No | No |
| Edit draft proposal roadmap | Yes | Yes | Assigned | Staff assist | Yes | Assigned contractor input only | No |
| Submit proposal | Yes | Yes | On behalf if policy | No | Yes | No | No |
| Review proposal | Yes | Yes | Assigned | Assigned/queue | Own proposal status | No | No |
| Final approve proposal | Yes | Yes | Configurable high authority | No | No | No | No |
| View all brokerage builds | Yes | Yes | Assigned portfolio | Queue/assigned/read grant | Own builds | Assigned work only | Assigned visit only |
| Update live milestone progress | Yes | Yes | Assigned | Staff assist if granted | Yes | Assigned milestone if granted | No |
| Adjust milestone dates | Yes | Yes | Assigned | Staff assist if granted | Yes with rules | No | No |
| Upload builder evidence | Yes | Yes | Assigned assist | Staff assist | Yes | Assigned if granted | Site visit only |
| Claim evidence review work | Yes | Yes | Configurable | Yes | No | No | No |
| Request site visit | Yes | Yes | Assigned/configurable | Yes | No | No | No |
| Complete site visit | Yes | Yes | If assigned | If assigned | No | If assigned | Token/assignment only |
| Recommend milestone approval | Yes | Yes | Assigned/configurable | Yes | No | No | Yes for visit scope |
| Final approve milestone | Yes | Yes | High-authority grant only | No | No | No | No |
| Request draw | Yes | Yes | Assigned assist | No | Yes when eligible | No | No |
| Final approve draw release | Yes | Yes | High-authority grant only | No | No | No | No |
| Manage contractors in brokerage bank | Yes | Yes | Assigned portfolio | Staff grant | Own project contractors | Own linked profile | No |
| Link contractor account to profile | Yes | Yes | Request/review | Review grant | No | Claim own profile | No |
| Configure policies/integrations | Yes | Yes | No | No | No | No | No |
| Read audit events | Yes | Yes | Assigned portfolio | Staff grant | Own events | Own events | Visit events only |

---

## 7. Production Domain Schema

### 7.1 Schema Principles

- Every tenant-owned table includes `organizationId`.
- Global tables are limited to platform identity, canonical contractor dedupe, and controlled lookup data.
- Every material entity includes status, timestamps, actor references, and audit hooks.
- Budget records are versioned, never overwritten.
- Role and relationship tables are explicit.
- Contractor profile dedupe is global, but brokerage access is relationship-scoped.
- Work orders model operations. Chat/comments do not replace workflow state.

### 7.2 Identity and Organization Tables

| Table | Scope | Purpose | Required fields |
|---|---|---|---|
| `users` | Global | Authenticated human identity | `workosUserId`, `email`, `name`, `status`, timestamps |
| `brokerages` | Tenant root | Brokerage organization | `workosOrganizationId`, `name`, `slug`, `status`, `principalBrokerUserId`, policy refs |
| `organizationMemberships` | Tenant | User membership and role grants | `organizationId`, `userId`, `role`, `status`, `invitedBy`, timestamps |
| `organizationInvitations` | Tenant | Pending invites | `organizationId`, `email`, `role`, `invitedBy`, `expiresAt`, `status` |
| `roleGrantOverrides` | Tenant | Exceptional grants | `organizationId`, `userId`, `grant`, `reason`, `expiresAt`, `createdBy` |
| `supportAccessSessions` | Global | Audited platform support access | `adminUserId`, `organizationId`, `reason`, `startsAt`, `endsAt`, `status` |

### 7.3 Builder Tables

| Table | Scope | Purpose | Required fields |
|---|---|---|---|
| `builderProfiles` | Tenant by active relationship | Borrower/builder domain profile | `organizationId`, `displayName`, `legalName`, `status`, `primaryBrokerId` |
| `builderAccountLinks` | Tenant | Auth user to builder profile | `organizationId`, `builderProfileId`, `userId`, `status`, `verifiedAt` |
| `builderBrokerAssignments` | Tenant | Broker ownership history | `organizationId`, `builderProfileId`, `brokerUserId`, `status`, `startsAt`, `endsAt` |
| `builderTransferRequests` | Cross-tenant workflow | Reassignment between brokers/orgs | `sourceOrganizationId`, `targetOrganizationId`, `builderProfileId`, `requestedBy`, `status`, reasons |

V1 assumption: a builder has one active managing brokerage at a time. History must be preserved when reassigned.

### 7.4 Contractor Tables

| Table | Scope | Purpose | Required fields |
|---|---|---|---|
| `contractorProfiles` | Global canonical | Deduped contractor entity | `kind`, `legalName`, `displayName`, normalized contact/license fields, `dedupeKey`, `status` |
| `contractorAccountLinks` | Global plus tenant context | Auth user linked to contractor profile | `contractorProfileId`, `userId`, `verificationStatus`, `verifiedBy`, timestamps |
| `contractorOrganizationRelationships` | Tenant | Contractor belongs to brokerage | `organizationId`, `contractorProfileId`, `sourceBrokerUserId`, `status`, `visibility`, notes |
| `contractorBrokerRelationships` | Tenant | Contractor associated with broker | `organizationId`, `contractorProfileId`, `brokerUserId`, `status` |
| `contractorProfileClaims` | Tenant/global | Contractor account claim workflow | `contractorProfileId`, `userId`, `organizationId`, `evidence`, `status`, `reviewedBy` |
| `buildContractorAssignments` | Tenant | Contractor on a Build | `organizationId`, `buildId`, `contractorProfileId`, `role`, `assignedBy`, dates, status |
| `milestoneContractorAssignments` | Tenant | Contractor on a Milestone | `organizationId`, `buildId`, `milestoneId`, `contractorProfileId`, `role`, dates, status |

Contractor dedupe must not leak confidential brokerage relationship data. Searching the contractor bank inside a brokerage returns only contractors related to that brokerage unless the user has a platform/global dedupe permission.

### 7.5 Build and Loan Tables

| Table | Scope | Purpose |
|---|---|---|
| `buildProposals` | Tenant | Draft/submitted borrower proposal package |
| `proposalDocuments` | Tenant | Permits, uploads, supporting docs |
| `proposalParticipants` | Tenant | Builder, broker, staff, contractor participants |
| `builds` | Tenant | Active construction project after proposal approval |
| `loans` | Tenant | Credit facility for the Build |
| `budgetVersions` | Tenant | Versioned approved and proposed budgets |
| `constructionRoadmaps` | Tenant | Roadmap container and active version |
| `milestones` | Tenant | Roadmap work units |
| `milestoneDependencies` | Tenant | Hard/soft dependency edges |
| `submilestones` | Tenant | Optional lower-level work units |
| `drawPlans` | Tenant | Custom draw plans, optimizer outputs, and optional preset metadata |
| `drawGroups` | Tenant | Planned milestone groupings for reimbursement |
| `draws` | Tenant | Actual reimbursement draw lifecycle |

### 7.6 Evidence and Operations Tables

| Table | Scope | Purpose |
|---|---|---|
| `evidencePackages` | Tenant | Submitted proof package for milestone/site visit/draw |
| `evidenceFiles` | Tenant | File metadata and storage references |
| `geofenceAttempts` | Tenant | Location verification attempts and results |
| `workOrders` | Tenant | Evidence review, site visit, approval, draw release, receipt exception |
| `siteVisits` | Tenant | Site visit workflow and report state |
| `siteVisitTokens` | Tenant | Tokenized field access, scoped and expiring |
| `reviewReports` | Tenant | Staff/backoffice recommendation reports |
| `approvalDecisions` | Tenant | Final approval/rejection records |
| `comments` | Tenant | Non-authoritative contextual discussion |
| `notifications` | Tenant | User-facing notification records |
| `auditEvents` | Tenant | Immutable material event trail |
| `webhookConfigs` | Tenant | Webhook endpoints and subscriptions |
| `eventOutbox` | Tenant | Reliable event dispatch queue |
| `externalReferences` | Tenant | External IDs for CRM/LMS/servicing systems |

### 7.7 Required Indexes

Minimum production indexes:

- `by_organization` on every tenant table.
- `by_org_status` for queueable entities.
- `by_org_user_role` for memberships.
- `by_builder_assignment` for builder-broker access.
- `by_contractor_dedupe_key` on global contractor profiles.
- `by_contractor_org` on contractor organization relationships.
- `by_build_order` on milestones.
- `by_build_status` on work orders, draws, site visits, and evidence packages.
- `by_work_order_assignee` for staff queues.
- `by_audit_entity` and `by_audit_actor` for audit review.

---

## 8. Core Workflows

### 8.1 Platform Admin Provisions Brokerage

1. Platform Admin creates brokerage.
2. System creates WorkOS Organization.
3. Admin invites first Principal Broker.
4. Principal Broker accepts invite.
5. System activates brokerage only when one Principal Broker is active.
6. Audit event records provisioning and principal assignment.

Acceptance criteria:

- no brokerage can be active without one Principal Broker,
- no brokerage can have two active Principal Brokers,
- Principal Broker transfer preserves history.

### 8.2 Principal Broker Manages Brokerage

1. Principal Broker opens Brokerage Management Dashboard.
2. Views staff, brokers, builders, contractors, proposals, live builds, work queues, and policy status.
3. Invites brokers and backoffice staff.
4. Changes roles or deactivates users.
5. Assigns builders to brokers.
6. Reviews all builds and work across the brokerage.

Acceptance criteria:

- role changes require audit events,
- deactivation removes future access but preserves history,
- broker visibility changes update route nav and query access immediately.

### 8.3 Broker Onboards Builder

1. Broker invites builder or starts application on builder's behalf.
2. Builder creates account or accepts invitation.
3. System creates or links `builderProfile`.
4. System creates active `builderBrokerAssignment`.
5. Builder can begin proposal intake.

Acceptance criteria:

- builder is tied to a broker and brokerage before proposal submission,
- broker can view assigned builder proposals,
- reassignment history is preserved.

### 8.4 Builder Reassignment

Inside brokerage:

1. Principal Broker chooses builder.
2. Selects new broker.
3. Provides reason.
4. System closes previous assignment and opens new assignment.
5. Audit event records prior/new broker.

Across brokerages:

1. Platform Admin initiates or approves transfer.
2. Source and destination brokerage rules are evaluated.
3. Active builds, proposals, documents, contractor assignments, and audit visibility are transferred or retained according to policy.
4. System records cross-tenant transfer audit event.

Acceptance criteria:

- cross-tenant transfer cannot be a blind `organizationId` rewrite,
- historical audit remains readable by prior authorized parties according to retention policy,
- active work queues are rerouted or closed explicitly.

### 8.5 Contractor Bank and Account Linking

1. User searches brokerage contractor bank.
2. If contractor exists in brokerage relationship set, user attaches it to build/milestone.
3. If not found, user creates contractor profile candidate.
4. System attempts dedupe against global contractor profiles.
5. If match is high confidence, system creates brokerage relationship to canonical profile.
6. If match is ambiguous, system creates review task.
7. Contractor may later be invited to create account and claim profile.
8. Backoffice or Principal Broker verifies claim.

Acceptance criteria:

- contractor profile can exist without account,
- account link is never automatic solely because an email matches,
- one contractor can have relationships with multiple brokerages,
- brokerage users do not see another brokerage's private contractor notes or assignments.

### 8.6 Builder Proposal Creation

This is the production version of the current timeline/proposal demo.

The proposal creation surface must remove live-build actions such as site visit requests, completion submission, milestone approval, and draw release. It is limited to creating a proposal package.

Builder actions:

1. Enter build identity and site.
2. Upload permits/documents.
3. Enter budget, borrower working capital, and Loan Percentage assumptions.
4. Select construction template.
5. Edit milestones, durations, dependencies, and costs.
6. Add contractors to project or milestone by creating/searching contractor profiles.
7. Optionally generate and compare Cheapest Feasible, Fastest, and Capital-Constrained optimizer presets.
8. Continue editing the custom Timeline draw plan and optionally apply an optimizer preset.
9. Submit the current custom or preset-assisted draw plan.

Acceptance criteria:

- proposal mode has role-aware actions limited to drafting and submission,
- completion/site-visit/draw-release controls are absent or disabled with correct explanation,
- custom Timeline draw plans can be submitted without selecting an optimizer preset,
- draw availability unlocks five calendar days after milestone completion,
- the Timeline and proposal packet both call out any auto-generated draw scheduled above cumulative unlocked draw availability,
- submitted proposal freezes a review snapshot and audit event.

### 8.7 Proposal Review

1. Broker, backoffice staff, or Principal Broker opens proposal queue according to grants.
2. Reviewer inspects builder profile, broker assignment, site, docs, budget, roadmap, contractors, draw plans, warnings, and working capital.
3. Reviewer requests changes, recommends approval, rejects, or escalates.
4. Principal Broker or configured final approver approves proposal.
5. Approved proposal creates active Build, Loan, Budget version, Roadmap, Milestones, Draw Plan, Draw Groups, and initial work context.

Acceptance criteria:

- final approval is distinct from staff review,
- the proposal packet preserves the draw-availability warning and identifies the first over-capacity draw, available amount, and overage,
- proposal approval creates versioned records, not mutable demo state,
- rejection and changes-requested states preserve reasons.

### 8.8 Live Build Management

Builder and permitted participants use the live Build Workspace after proposal approval.

Allowed builder actions:

- update milestone progress,
- adjust planned/actual start and completion dates,
- extend or shorten milestone dates with reason,
- upload evidence,
- mark milestone complete,
- enter actual costs,
- assign/update/remove contractors on build and milestones,
- request draw when eligible,
- submit budget revision when required.

System rules:

- date changes create schedule variance records,
- material schedule or cost changes can trigger draw-plan recomputation,
- approved budget is never overwritten,
- contractor assignment history is preserved,
- draw request eligibility follows milestone approval and policy state.

### 8.9 Backoffice Operations

Backoffice Staff operate queues, not final approvals by default.

Queues:

- proposal review support,
- evidence review,
- missing information,
- site visits,
- ready for Principal Broker/admin decision,
- draw release preparation,
- receipt exceptions.

Staff can:

- claim assigned work,
- request missing info,
- request or perform site visits,
- review evidence,
- submit recommendations,
- prepare approval package.

Staff cannot by default:

- final approve milestone completion,
- final release draw,
- silently override site visit policy.

### 8.10 Milestone Completion, Evidence, and Draw Release

1. Builder submits milestone completion package.
2. System records evidence and geofence attempt.
3. Evidence Review Work Order is created.
4. Staff reviews and recommends next action.
5. Site visit occurs if required.
6. Principal Broker or final approver reviews package.
7. Milestone is approved or rejected.
8. When all milestones in draw group are approved, draw becomes ready.
9. Final approver reviews draw amount, fee treatment, loan availability, and interest implications.
10. Draw is approved and released.
11. Interest begins only after release.
12. Builder confirms receipt or reports exception.

Acceptance criteria:

- geofence failure never discards evidence,
- location-unverified evidence routes for review,
- draw release is impossible before required milestone approval,
- every override records actor, role, reason, warnings, prior state, and new state.

---

## 9. Required Product Surfaces

### 9.1 Platform Admin Dashboard

Capabilities:

- brokerage directory,
- create/provision brokerage,
- assign/replace Principal Broker,
- cross-tenant builder transfer,
- platform audit search,
- contractor dedupe review,
- support access sessions,
- system health and webhook delivery view.

### 9.2 Brokerage Management Dashboard

Primary user: Principal Broker.

Capabilities:

- manage brokerage details,
- invite/manage brokers and backoffice staff,
- role and permission management,
- builder directory with broker assignment,
- contractor bank,
- all builds across brokerage,
- proposal and work queue overview,
- policy and integration settings,
- audit history.

### 9.3 Broker Dashboard

Capabilities:

- assigned builder portfolio,
- application/proposal intake,
- proposal statuses,
- live build statuses,
- contractor shortcuts for assigned projects,
- pending borrower actions,
- backoffice request status.

### 9.4 Builder Proposal Workspace

Capabilities:

- proposal-only roadmap/timeline interface,
- budget and working capital input,
- milestone/template editing,
- dependency editing,
- contractor assignment during proposal,
- draw plan comparison,
- submit proposal.

### 9.5 Live Build Workspace

Capabilities:

- canonical milestone rail and Gantt roadmap,
- draw group bounding boxes,
- live progress and schedule edits,
- evidence upload,
- contractor assignment,
- draw request readiness,
- role-aware actions for builder, broker, staff, and approver.

### 9.6 Backoffice Work Queues

Capabilities:

- proposal support,
- evidence review,
- site visit management,
- admin/Principal Broker ready queue,
- draw release queue,
- exception handling.

---

## 10. Non-Goals for Production V1

V1 does not include:

- proactive advance funding,
- a contractor marketplace,
- full accounting ledger,
- full payment rail integration,
- full standalone lender licensing package,
- municipal permit integrations,
- automated lien waiver workflows,
- formal contractor smart-selection ranking beyond structured data capture,
- full offline editing of the Build Workspace.

---

## 11. MVP Acceptance Criteria

The production MVP is ready when:

1. WorkOS AuthKit signs users in and maps them to active organizations.
2. A brokerage can be provisioned with exactly one Principal Broker.
3. Principal Broker can manage brokers, staff, builders, roles, and assignments.
4. Broker can onboard builders and manage assigned applications.
5. Builder can create and submit proposal-only roadmap/draw plan.
6. Proposal review creates active production domain records on approval.
7. Contractor profiles can be created without accounts, deduped globally, related to multiple brokerages, and assigned to builds/milestones.
8. Contractor account linking is explicit, reviewed, and audited.
9. Live Build Workspace supports progress, evidence, schedule changes, contractors, and draw requests.
10. Backoffice queues support evidence review, site visits, recommendations, and ready-for-final decision handoff.
11. Final milestone and draw approvals are separated from staff recommendations.
12. All tenant-scoped entities enforce `organizationId`.
13. Material actions write audit events.
14. Budget versions are preserved.
15. Draw release remains reimbursement-only and starts interest only after release.

---

## 12. Open Product Decisions

1. **Final approver label:** Should the tenant final approver be named Principal Broker everywhere, or should some brokerages configure a separate Lender Admin role?
2. **Builder cross-brokerage transfer:** Should Principal Broker be able to directly transfer a builder to another brokerage, or only request/approve transfer with Platform Admin final execution?
3. **Broker proposal authority:** Can Brokers approve low-risk proposals, or do all approvals require Principal Broker/high-authority role?
4. **Contractor global search:** Should brokers see only brokerage-known contractors, or can they search global deduped public contractor records?
5. **Builder organization model:** Should larger builders have their own WorkOS Organization later, or stay as external participants inside brokerage organizations for v1?
