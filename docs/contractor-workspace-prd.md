# Contractor Workspace PRD

**Product:** DrawFlow  
**Module:** Contractor Workspace, contractor onboarding, contractor identity resolution, and contractor-scoped work access  
**Status:** Draft for production implementation  
**Created:** June 24, 2026  
**Primary audience:** Product, engineering, implementation agents  
**Supersedes:** `docs/contractors-v1.md`

---

## 1. Problem Statement

DrawFlow currently has production contractor profiles, contractor assignment primitives, contractor planning surfaces, and backoffice contractor management, but contractors do not yet have a first-class authenticated workspace. Builders and backoffice users can create contractor records and attach contractors to proposals/builds, but the contractor role itself cannot sign in, claim a profile, view assigned scope, manage operational profile data, see relevant schedule events, or submit supporting evidence.

This creates a gap in the operational loop. Contractors are part of construction execution, but DrawFlow treats them mostly as records managed by other actors. The product now needs to flesh out the contractor role as a production-authenticated workspace while preserving DrawFlow's lending controls: contractors must not become builder users, backoffice reviewers, draw request actors, or milestone approval authorities.

## 2. Solution

Create a production-ready Contractor Workspace under a standalone `/contractor` route family. The workspace is brokerage-scoped to FairLendBrokerage for this phase, using WorkOS organization `org_01KSNW6JHW9P9YS41DZX1YHHGS`.

Contractor Workspace gives authenticated contractor users:

- active build assignments they are linked to,
- active proposal assignments they are linked to,
- contractor-scoped schedule events,
- contractor-visible build context, including location, permit information, high-level scope, assigned milestone/submilestone scope, and coordination contacts,
- contractor profile management for trades, capabilities, optional rates, service area, availability, equipment, and optional compliance fields,
- contractor-submitted supporting evidence,
- assignment and schedule acknowledgements,
- structured scope clarification/dispute requests.

The feature also adds contractor onboarding and identity resolution:

- contractors can self-service onboard into FairLendBrokerage as `member` users, submit contractor profile details, and wait for backoffice approval before promotion to WorkOS `contractor`,
- builders/backoffice can create contractor profiles for record keeping without inviting the contractor,
- builders/backoffice can invite unlinked contractor profiles through WorkOS organization invitations,
- invited contractors claim the contractor profile after AuthKit acceptance and confirmation,
- exact normalized email matches resolve to one canonical contractor profile per brokerage,
- no-email and fuzzy duplicates are never auto-merged, but backoffice can manually resolve them through aliases/merge workflows.

This PRD is the single contractor feature source of truth. `docs/contractors-v1.md` is deprecated and should only point here.

## 3. Non-Negotiable Decisions

1. Contractor Workspace is production-only. Do not build demo routes, demo tables, or public demo flows.
2. All new contractor onboardings default to FairLendBrokerage WorkOS organization `org_01KSNW6JHW9P9YS41DZX1YHHGS`.
3. Contractor Workspace is brokerage-scoped for this phase. No cross-brokerage workspace aggregation.
4. WorkOS remains the source of truth for users, organization membership, and role assignment.
5. WorkOS projection tables remain webhook-owned. Product flows must not write directly to WorkOS projection tables.
6. A contractor profile is not the same thing as a contractor account. Profiles can exist without authenticated users.
7. Builder-created contractor records do not require email, invitation, or account linking.
8. Invite/claim is optional and explicit.
9. One active canonical contractor profile per normalized email is allowed inside FairLendBrokerage.
10. No-email duplicate contractor records are allowed, with soft duplicate hints only.
11. Backoffice owns manual duplicate merge and identity resolution.
12. Contractors only see assignments after their authenticated WorkOS user is linked to the canonical contractor profile.
13. Contractors have contractor-specific access paths, not generic proposal/build read permissions.
14. Contractor evidence is supporting context only. It must not automatically satisfy completion, draw, or approval requirements.
15. Contractor evidence is visible immediately to the assigned builder side and backoffice/lender staff.
16. No contractor evidence geofencing is required in this phase.
17. Permit metadata and permit documents are contractor-visible by default.
18. Raw/internal contractor quality ratings are not visible to contractors in this phase.
19. Contractors cannot self-delete or self-unlink their profile.
20. Rates are optional. Missing rate means unknown, not zero.

## 4. User Stories

1. As a contractor, I want to sign up for DrawFlow contractor onboarding, so that FairLend can review my capabilities and make me available for work.
2. As a contractor, I want onboarding to save drafts, so that I can complete profile details later.
3. As a contractor, I want to enter my trades and capabilities, so that builders and FairLend know what work I can perform.
4. As a contractor, I want to enter optional default rates, so that assignment planning can start with my usual pricing when I provide it.
5. As a contractor, I want rates to be optional, so that missing rates do not block me from onboarding.
6. As a contractor, I want to enter my service area, so that FairLend and builders know where I am willing to work.
7. As a contractor, I want to enter availability, so that scheduling can account for my capacity.
8. As a contractor, I want to enter equipment and compliance details, so that FairLend can assess operational readiness.
9. As a contractor, I want to upload optional compliance documents, so that backoffice can review license and insurance context.
10. As a contractor, I want to see whether my onboarding is draft, under review, approved, rejected, or waiting on WorkOS role sync, so that I know what is blocking access.
11. As a contractor, I want to confirm an existing profile matched by my email, so that I do not accidentally claim the wrong contractor record.
12. As a contractor, I want to reject an incorrect email match, so that a stale or mistyped profile does not become linked to me.
13. As a contractor, I want an invite claim flow to show the profile I am claiming, so that I can confirm it is mine.
14. As an invited contractor, I want to claim a contractor profile after accepting a WorkOS invitation, so that assignments attached to that profile become visible.
15. As an invited contractor, I want to optionally complete profile fields during claim, so that I can fix incomplete builder-created profile data.
16. As an invited contractor, I want identity-sensitive edits to be reviewable without blocking a valid claim, so that I can access assigned work while FairLend reviews sensitive changes.
17. As a contractor, I want a mobile-friendly dashboard, so that I can check upcoming work from the field.
18. As a contractor, I want a Today / Next 14 Days section, so that I know what is coming up.
19. As a contractor, I want to see all active build assignments, so that I know where I am currently working.
20. As a contractor, I want to see active proposal assignments, so that I know where I am included in planning work.
21. As a contractor, I want proposal work labeled as planning or pending, so that I do not confuse tentative work with active execution.
22. As a contractor, I want a unified work list sorted by urgency, so that I can work from the most important next action.
23. As a contractor, I want separate proposal and build lists, so that I can navigate by DrawFlow object when needed.
24. As a contractor, I want schedule events scoped to my milestones/submilestones, so that unrelated project schedule data does not clutter my workspace.
25. As a contractor, I want milestone and submilestone start/end dates, so that I can coordinate labor and materials.
26. As a contractor, I want schedule change acknowledgements, so that builders and backoffice know I saw important changes.
27. As a contractor, I want to flag a scope mismatch, so that builder/backoffice can resolve issues before work starts.
28. As a contractor, I want to request clarification, so that ambiguous scope is handled in a structured way.
29. As a contractor, I want dispute/clarification statuses, so that I know whether an issue is pending, resolved, or waiting on me.
30. As a contractor, I want builder contact information on each assignment, so that I know who coordinates the work.
31. As a contractor, I want assigned backoffice contact information where applicable, so that I know who to contact for FairLend operations.
32. As a contractor, I want to see project location and permit information, so that I can plan site work.
33. As a contractor, I want permit documents visible by default, so that I can access public permit context without asking.
34. As a contractor, I want only contractor-visible documents beyond permits, so that I am not shown private financing/legal material.
35. As a contractor, I want to upload supporting images or PDFs against assigned scope, so that builder/backoffice can see work context.
36. As a contractor, I want evidence uploads constrained to my assignment scope, so that I cannot accidentally attach files to unrelated milestones.
37. As a contractor, I want contractor-submitted evidence labeled clearly, so that reviewers know the source.
38. As a contractor, I want to see feedback on my evidence, so that I can add more context or replace an item.
39. As a contractor, I want to mark evidence feedback addressed, so that reviewers know I responded.
40. As a contractor, I want to see my submitted evidence history, so that I can reference what I provided.
41. As a contractor, I want a work history area for completed assignments, so that prior FairLend work remains visible after closeout.
42. As a contractor, I want profile completion guidance, so that I know which operational fields are missing.
43. As a contractor, I want profile edits to write audit history, so that changes are traceable.
44. As a builder, I want to create a contractor entity for record keeping without inviting the contractor, so that I can plan my build without forcing account setup.
45. As a builder, I want to add contractors with no email, so that field-level record keeping is not blocked by missing contact details.
46. As a builder, I want to add a contractor by email and reuse the canonical profile if it exists, so that duplicate contractor identities do not fragment work history.
47. As a builder, I want to invite a contractor only when I choose to, so that record keeping does not send unexpected emails.
48. As a builder, I want to invite only contractors attached to my own proposals/builds, so that I cannot invite arbitrary brokerage directory records.
49. As a builder, I want to see contractor evidence immediately, so that I can catch stale, incorrect, or missing work context before lender review.
50. As a builder, I want to respond to contractor clarification requests, so that scope issues are handled before they delay work.
51. As builder staff, I want contractor invite permissions bounded to my builder access, so that I only affect contractor records tied to our work.
52. As backoffice, I want to create contractor profiles without accounts, so that operational records can exist before contractor login.
53. As backoffice, I want to invite any contractor profile in FairLendBrokerage, so that I can onboard contractors directly.
54. As backoffice, I want to review self-service contractor onboardings, so that unknown contractors are approved before full workspace access.
55. As backoffice, I want explicit onboarding outcomes, so that review decisions are auditable and unambiguous.
56. As backoffice, I want to approve and promote a self-service user from `member` to `contractor`, so that WorkOS role assignment stays controlled.
57. As backoffice, I want to reject onboarding with a reason, so that contractors understand why they were not approved.
58. As backoffice, I want to request changes with a reason, so that contractors can correct incomplete or risky profile details.
59. As backoffice, I want to merge an onboarding/profile into an existing canonical contractor profile, so that duplicates do not create orphaned work history.
60. As backoffice, I want duplicate warnings for fuzzy/no-email contractor profiles, so that I can resolve identity issues manually.
61. As backoffice, I want exact email duplicates to resolve automatically, so that the obvious case does not create manual work.
62. As backoffice, I want builder-created contractor profiles visible immediately in the roster, so that I have operational visibility.
63. As backoffice, I want source/status badges for contractor profiles, so that I can distinguish builder-created, backoffice-created, self-service, claimed, and merged records.
64. As backoffice, I want to see contractor evidence immediately, so that lender staff can use it as supporting context.
65. As backoffice, I want to mark contractor evidence useful, not relevant, or needing more context, so that contractor submissions are actionable without becoming a chat thread.
66. As backoffice, I want contractor disputes visible as attention flags, so that scope risk does not disappear.
67. As backoffice, I want to revoke or resend contractor invites, so that stale invitations can be controlled.
68. As backoffice, I want to deactivate or unlink contractor accounts only through reviewed actions, so that active assignments and audit history are protected.
69. As an admin, I want WorkOS invitations used for contractor claims, so that organization membership and role assignment follow the supported AuthKit path.
70. As an admin, I want contractor role sessions to be WorkOS role-aware, so that route access is enforced consistently.
71. As an admin, I want the FairLendBrokerage org id centralized, so that implementation does not spread magic strings across routes and functions.
72. As an implementation agent, I want denormalized contractor-safe view models, so that frontend routes cannot accidentally stitch together private proposal/build data.
73. As an implementation agent, I want contractor-specific Convex authorization helpers, so that contractors do not inherit broad builder/backoffice capabilities.
74. As an implementation agent, I want contractor workspace tests at route, backend, and component seams, so that access control and product behavior are verified end to end.

## 5. Actors And Permissions

### 5.1 Contractor

Authenticated WorkOS user with active membership in FairLendBrokerage and role `contractor`. A contractor must also be linked to a canonical contractor profile through `contractorProfiles.accountWorkosUserId` before accessing the full workspace.

Contractors can:

- view their own contractor workspace,
- view assigned proposal/build scope,
- view schedule events scoped to their assignments,
- view permit metadata and permit documents for assigned proposals/builds,
- view explicitly contractor-visible non-permit documents,
- update operational profile fields,
- submit supporting evidence against assigned scope,
- acknowledge assignments and schedule changes,
- flag scope mismatch or request clarification,
- view their work history.

Contractors cannot:

- edit proposals,
- submit completion claims,
- request draws,
- approve milestones,
- approve draw release,
- perform lender review,
- view private financing/draw details unless explicitly added later,
- view unrelated contractor scopes,
- view raw/internal ratings or risk notes,
- self-delete or self-unlink.

### 5.2 Self-Service Onboarding User

Authenticated WorkOS user with active FairLendBrokerage membership but no contractor role yet. This user can access only the onboarding bridge and cannot access the full contractor workspace.

### 5.3 Builder And Builder Staff

Builder-side users can create contractor records for their own proposal/build record keeping. Authorized builder-side users can invite only contractors attached to their own proposals/builds. Builder-side users can see contractor evidence and contractor issues for their own proposals/builds.

### 5.4 Backoffice And Lender Staff

Backoffice can manage contractor profiles across FairLendBrokerage, review self-service onboardings, approve role promotion, send/revoke/resend invitations, view contractor evidence, and resolve duplicate identities.

### 5.5 Lender Admin

Lender admin retains final authority over milestone and draw-release workflows. Contractor Workspace does not change reimbursement approval rules.

## 6. Core Domain Model

### 6.1 Profile, Account, Assignment, Alias

Contractor identity has four distinct layers:

1. **Contractor profile**
   - Brokerage-scoped canonical contractor domain entity.
   - Can exist without email and without authenticated account.
   - Stores operational profile fields and optional account linkage.

2. **Contractor account link**
   - `contractorProfiles.accountWorkosUserId` links a canonical profile to an authenticated WorkOS user.
   - Only populated after invited claim, self-service approval, or reviewed account link.

3. **Assignment**
   - Proposal/build/milestone/submilestone-specific relationship.
   - Stores role, status, assignment scope, optional agreed rates, optional cost fields, notes, and scheduling context.
   - Assignment-specific economics are owned by builder/backoffice, not overwritten by profile default rate edits.

4. **Alias**
   - Original builder/build/proposal-created identity label that may differ from the canonical profile.
   - Preserves original display name, email, phone, trade, source builder/build/proposal, creator, and merge/resolution metadata.
   - Prevents orphaned assignments when two builds use different names for the same contractor.

### 6.2 Canonical Email Rules

- Email is optional.
- If email is absent, create or retain an unclaimed profile/alias. Do not auto-merge.
- If email is present, normalize it before matching.
- One active canonical contractor profile per normalized email is allowed inside FairLendBrokerage.
- Builder/backoffice creation with an existing normalized email reuses the canonical contractor profile.
- Self-service onboarding matches only on normalized email.
- Phone/name/trade/city matches can produce duplicate hints only. They must not auto-link or auto-merge.
- Legacy duplicate email records must route to backoffice merge/review.

### 6.3 Identity Merge Rules

Backoffice manual merge:

- selects a canonical contractor profile,
- preserves losing profiles as aliases/merged records,
- migrates active assignment pointers to canonical profile,
- preserves alias references for audit/display,
- migrates contractor evidence, ratings, schedule links, and work history to canonical profile access,
- writes audit events with actor, prior state, new state, reason, and affected records.

Builders cannot merge brokerage-wide contractor identities. Builders can see relevant duplicate hints for their own records.

## 7. Onboarding And Claim Workflows

### 7.1 Self-Service Onboarding

Self-service onboarding is open, but full contractor workspace access requires backoffice approval and WorkOS contractor role promotion.

Flow:

1. User starts contractor onboarding through AuthKit sign-up/sign-in for FairLendBrokerage.
2. User enters onboarding bridge as a `member` if the `contractor` role is not yet assigned.
3. User completes or saves draft contractor profile fields.
4. System matches by normalized verified WorkOS email only.
5. If one unclaimed profile matches, show confirmation before linking.
6. If no email match exists, create a pending self-service contractor profile.
7. If multiple email matches exist, route to backoffice review. Do not guess.
8. Contractor submits onboarding.
9. Backoffice reviews.
10. Approval requests WorkOS role promotion to `contractor`.
11. User reaches full workspace only after WorkOS role/session sync and profile link are complete.

Self-service onboarding states:

- `draft`
- `pending_backoffice_review`
- `changes_requested`
- `approved_pending_workos`
- `active`
- `rejected`
- `merged`

### 7.2 Backoffice Review Outcomes

Backoffice can:

- approve,
- reject with reason,
- request changes with reason,
- merge into existing canonical profile,
- mark compliance required,
- mark approved with missing compliance,
- mark compliance not required.

Backoffice approval is the only self-service path that attempts WorkOS contractor role promotion.

### 7.3 Invited Contractor Claim

Invited known contractors bypass backoffice onboarding review when the invite was issued by an authorized actor to a specific existing contractor profile email.

Flow:

1. Builder/backoffice creates or reuses a contractor profile.
2. Builder/backoffice explicitly sends an invite.
3. DrawFlow creates contractor claim intent metadata tied to contractor profile, normalized email, inviter, WorkOS invitation id/token metadata, expiry, and revocation state.
4. WorkOS organization invitation is sent for FairLendBrokerage with role `contractor`.
5. Contractor accepts through AuthKit.
6. After return to DrawFlow, the contractor sees a confirmation screen.
7. Contractor confirms "this is my contractor profile."
8. DrawFlow links `contractorProfiles.accountWorkosUserId` to the authenticated WorkOS user.
9. Full workspace unlocks after WorkOS contractor role is present and profile link is active.

Invite claim states:

- `not_invited`
- `invited`
- `accepted_pending_confirmation`
- `claimed`
- `revoked`
- `expired`

Claim tokens/invites:

- are bound to invited email when email exists,
- require exact verified email match for consumer email domains,
- follow WorkOS organization invitation rules,
- expire,
- are revocable,
- are single-use after successful claim.

### 7.4 Record-Keeping-Only Contractor Creation

Builders/backoffice can create contractor records without sending invitations.

If email is provided:

- normalize email,
- reuse existing active canonical profile when present,
- create new unclaimed canonical profile when absent,
- do not send invitation unless explicitly requested.

If email is absent:

- create an unclaimed profile/alias with available name/trade metadata,
- attach it to proposal/build assignment,
- show soft duplicate hints to backoffice only.

### 7.5 WorkOS Happy Path

Contractor invitations use WorkOS organization invitations, not custom-only claim emails.

WorkOS invitation fields:

- email,
- organization id `org_01KSNW6JHW9P9YS41DZX1YHHGS`,
- role slug `contractor`.

DrawFlow stores only app-level claim intent and audit metadata. WorkOS/webhooks own organization membership and role projection updates.

For open self-service sign-up, if WorkOS creates a `member` first, the user can access only `/contractor/onboarding`. Full `/contractor` access is blocked until backoffice approval and WorkOS role/session sync complete.

## 8. Contractor Workspace Surfaces

### 8.1 Route Family

Add standalone production-authenticated contractor routes:

- `/contractor`
- `/contractor/work`
- `/contractor/proposals`
- `/contractor/proposals/$proposalId`
- `/contractor/builds`
- `/contractor/builds/$buildId`
- `/contractor/schedule`
- `/contractor/evidence`
- `/contractor/profile`
- `/contractor/onboarding`

These routes use shared app shell primitives but contractor-specific navigation. They must not be folded into builder or backoffice navigation.

### 8.2 Dashboard

Primary dashboard sections:

- Today / Next 14 Days
- Active Build Assignments
- Active Proposal Assignments
- Evidence Queue
- Profile Readiness
- Pending Clarifications / Scope Issues

The first screen must answer: where am I working, what is next, and what does DrawFlow need from me?

### 8.3 Work List

The unified work list shows all active assigned scope items across proposals/builds sorted by urgency/date. It should include:

- object type: proposal or active build,
- build/proposal name,
- milestone/submilestone scope,
- role,
- schedule status,
- acknowledgement status,
- evidence status,
- issue/dispute status.

### 8.4 Proposal Detail

Contractors can see scope-limited proposal context:

- proposal/build name,
- planning/pending status,
- high-level build scope,
- project location,
- permit metadata and documents,
- assigned milestones/submilestones,
- schedule dates relevant to their scope,
- contractor-visible documents,
- builder contact,
- assignment-specific agreed rate if contractor-visible.

Contractors cannot see full proposal package, borrower financing details, draw economics, lender review notes, unrelated contractor scopes, or full budget unless explicitly tied to their scope.

### 8.5 Active Build Detail

Contractors can see:

- active build context,
- assigned milestone/submilestone scope,
- upcoming schedule,
- permit metadata and documents,
- contractor-visible documents,
- builder/backoffice contacts,
- contractor-submitted evidence,
- relevant evidence feedback,
- scope issue/acknowledgement status,
- completed work history for that build.

### 8.6 Schedule

Contractor schedule events include:

- milestone/submilestone planned start,
- milestone/submilestone planned end,
- dependency blockers relevant to assigned scope,
- site visits where contractor scope is targeted,
- coordination reminders,
- schedule change acknowledgement requests.

Manual contractor events include:

- kickoff/walkthrough,
- delivery/install window,
- inspection prep,
- builder-contractor coordination meeting,
- reminder-only events.

Schedule should use the existing calendar projection/reminder model where possible and add contractor visibility rules. Add a contractor-specific ICS feed scoped to the contractor profile and tokenized subscription key.

### 8.7 Evidence

Contractor evidence uploads are supporting context only.

Allowed file types:

- jpg,
- png,
- heic,
- webp,
- pdf.

Required metadata:

- proposal or build id,
- assigned milestone id/key,
- optional assigned submilestone id/key,
- contractor profile id derived server-side,
- assignment id where applicable,
- note/caption,
- uploaded at,
- source `contractor_submitted`,
- source actor role `contractor`.

Optional metadata:

- tags,
- taken-at timestamp if available,
- linked schedule event,
- file metadata.

Visibility:

- contractor sees their own submitted evidence and relevant scope history,
- builder/builder staff sees contractor evidence for their own proposal/build immediately,
- backoffice sees contractor evidence for the brokerage immediately,
- other contractors do not see it in this phase.

Feedback states:

- useful,
- not relevant,
- more context requested,
- replacement requested,
- addressed.

No threaded comments in this phase.

### 8.8 Profile

Contractors can directly edit operational fields:

- trades,
- capabilities,
- optional default rates,
- service area,
- availability,
- equipment,
- website/description,
- phone.

Identity/risk-sensitive changes require review or reviewable audit:

- legal/company name when originally builder/backoffice-created,
- primary email,
- tax/payment/compliance docs,
- deactivation,
- merge/split,
- account unlink.

Rates:

- optional,
- stored as profile defaults only,
- assignment agreed rates remain assignment-owned,
- missing rates are shown as "not provided."

Service area:

- primary city/region,
- service radius in km,
- optional postal code prefixes or region tags,
- freeform notes.

Kinds:

- `company`,
- `individual`,
- `crew`.

## 9. Backoffice Contractor Operations

Backoffice contractor review lives under `/backoffice/contractors`, not a disconnected route.

Required surfaces:

- contractor roster with source/status/review badges,
- onboarding review tab or route under contractor operations,
- contractor detail with review, invite, claim, duplicate, merge, deactivate, unlink request handling,
- duplicate resolution workflow,
- evidence review context for contractor-submitted evidence.

Profile sources/statuses should distinguish:

- builder-created,
- backoffice-created,
- self-service,
- claimed,
- merged,
- unclaimed,
- review pending,
- active,
- inactive.

Backoffice review must show:

- profile identity fields,
- WorkOS user/membership state when present,
- email match status,
- proposed trades/capabilities,
- optional rates,
- service area,
- availability,
- equipment,
- compliance fields/docs,
- linked assignments,
- duplicate warnings,
- audit history.

## 10. Notifications

Add narrow notifications. Do not build broad messaging or chat.

In-app notifications:

- assigned to proposal/build scope,
- removed from scope,
- milestone/submilestone start date changed,
- schedule acknowledgement requested,
- contractor evidence viewed/commented/flagged,
- invite/profile claimed,
- profile change requires review,
- scope clarification requested/responded/resolved.

Email notifications:

- WorkOS invitation/claim,
- new assignment,
- material schedule change,
- evidence feedback requiring contractor action,
- onboarding review result,
- changes requested.

## 11. Authorization Model

### 11.1 Frontend Route Guard

Contractor workspace route access requires:

- authenticated session,
- active organization claim,
- FairLendBrokerage organization context,
- WorkOS `contractor` role for full workspace,
- linked contractor profile for full workspace.

Build collaboration entrypoint exception:

- authorized build viewers may open `/contractor/builds/$buildId` to use the
  shared Build Collaboration surface,
- this includes `admin`, `principle-broker`, assigned `broker`/
  `broker-staff`, authorized `builder`/`builder-staff`, assigned `contractor`,
  and an explicitly granted build-scoped `member`,
- the route remains subject to backend active-Build authorization and does not
  grant contractor profile, work-list, evidence, or onboarding APIs to
  non-contractor roles.

Onboarding bridge requires:

- authenticated session,
- active FairLendBrokerage membership,
- `member` or `contractor` role,
- no full workspace access unless contractor role plus profile link are present.

### 11.2 Backend Authorization

Contractor-specific backend access requires:

- authenticated WorkOS identity,
- active FairLendBrokerage membership,
- WorkOS `contractor` role for full workspace,
- canonical contractor profile linked to viewer WorkOS user,
- requested resource belongs to assignment on that contractor profile,
- requested document/evidence/event is contractor-visible.

Do not grant contractors generic `proposals:read` or `builds:read`. Contractor view models must be explicitly scoped and redacted.

### 11.3 Builder/Backoffice Invite Permissions

Backoffice can invite any contractor profile in FairLendBrokerage.

Builder/builder staff can invite only contractor profiles already attached to one of their own proposals/builds and only if their builder-side permissions allow contractor management for that scope.

Every invite, resend, revoke, claim, merge, profile link, unlink, and role-promotion request writes audit history.

## 12. Backend API Surface

Create a dedicated production Convex module for contractor workspace behavior. Reuse shared fluent-convex helpers and existing production proposal/build helper logic, but expose contractor-safe view models from the dedicated module.

Suggested public contractor workspace functions:

- `getContractorWorkspaceSummary`
- `listContractorWorkItems`
- `getContractorProposalDetail`
- `getContractorBuildDetail`
- `listContractorScheduleEvents`
- `listContractorEvidence`
- `getContractorProfile`
- `saveContractorOnboardingDraft`
- `submitContractorOnboarding`
- `confirmContractorProfileClaim`
- `rejectContractorProfileMatch`
- `updateContractorOperationalProfile`
- `acknowledgeContractorAssignment`
- `acknowledgeContractorScheduleChange`
- `requestContractorScopeClarification`
- `flagContractorScopeMismatch`
- `uploadContractorSupportingEvidence`
- `addressContractorEvidenceFeedback`

Suggested backoffice functions:

- `listContractorOnboardingReviews`
- `getContractorOnboardingReview`
- `approveContractorOnboarding`
- `rejectContractorOnboarding`
- `requestContractorOnboardingChanges`
- `mergeContractorProfiles`
- `sendContractorProfileInvite`
- `resendContractorProfileInvite`
- `revokeContractorProfileInvite`
- `unlinkContractorAccount`
- `deactivateContractorProfile`
- `reviewContractorEvidence`

Suggested builder/backoffice shared functions:

- create or reuse contractor profile by email,
- create unclaimed contractor alias/profile without email,
- invite attached contractor profile,
- list contractor duplicate hints for authorized scope.

## 13. Data Model Changes

Existing tables already cover much of the base:

- `contractorProfiles`
- `contractorCapabilities`
- `contractorEquipment`
- `contractorAvailabilityWindows`
- `proposalContractorAssignments`
- `proposalMilestoneContractorAssignments`
- `buildContractorAssignments`
- `milestoneContractorAssignments`
- `contractorQualityRatings`
- `calendarReminderEvents`

Required additions or extensions:

1. Normalized contractor email support
   - store normalized email or add a deterministic lookup table if Convex index constraints require it,
   - enforce one active canonical profile per normalized email at mutation boundary.

2. Contractor aliases / merged identity records
   - preserve builder-created names/emails/phones/trades,
   - source builder/build/proposal context,
   - canonical profile pointer,
   - merge/rejection status,
   - audit metadata.

3. Contractor onboarding review state
   - onboarding status state machine,
   - review decision metadata,
   - requested changes/rejection reasons,
   - submitted/approved/rejected/merged timestamps,
   - backoffice reviewer.

4. Contractor invite/claim intent
   - contractor profile id,
   - normalized invited email,
   - WorkOS invitation id/token metadata,
   - inviter,
   - expiry,
   - state,
   - accepted WorkOS user id,
   - confirmation timestamp.

5. Contractor evidence submissions
   - source `contractor_submitted`,
   - source actor role,
   - contractor profile id,
   - assignment id,
   - proposal/build/milestone/submilestone target,
   - caption/note,
   - file metadata,
   - feedback state.

6. Contractor acknowledgements/issues
   - assignment acknowledgement state,
   - schedule acknowledgement state,
   - clarification/dispute state,
   - builder/backoffice resolution metadata.

7. Contractor visibility metadata for documents
   - permits visible by default,
   - non-permit docs need contractor-visible audience/ACL.

8. Contractor notification records if existing notification primitives are insufficient.

9. Central FairLendBrokerage config
   - shared backend/frontend constant or config with env override for `org_01KSNW6JHW9P9YS41DZX1YHHGS`.

## 14. State Machines

### 14.1 Self-Service Onboarding

```text
draft
  -> pending_backoffice_review
pending_backoffice_review
  -> changes_requested
  -> approved_pending_workos
  -> rejected
  -> merged
changes_requested
  -> pending_backoffice_review
approved_pending_workos
  -> active
merged
  -> active on canonical profile after role/profile resolution
```

### 14.2 Invite Claim

```text
not_invited
  -> invited
invited
  -> accepted_pending_confirmation
  -> revoked
  -> expired
accepted_pending_confirmation
  -> claimed
  -> revoked
claimed
  -> final
```

### 14.3 Assignment Acknowledgement

```text
pending_acknowledgement
  -> acknowledged
  -> clarification_requested
  -> scope_disputed
clarification_requested
  -> resolved
  -> scope_disputed
scope_disputed
  -> resolved
resolved
  -> acknowledged
```

### 14.4 Evidence Feedback

```text
submitted
  -> useful
  -> not_relevant
  -> more_context_requested
  -> replacement_requested
more_context_requested
  -> addressed
replacement_requested
  -> addressed
addressed
  -> useful
  -> not_relevant
```

## 15. Document Visibility

Default contractor-visible:

- build/proposal name,
- project address/location,
- permit number/status,
- permit documents,
- high-level build scope,
- contractor's assigned milestone/submilestone scope,
- relevant schedule dates,
- builder company/contact,
- site access notes when marked operational.

Explicit ACL required:

- non-permit documents,
- budgets outside contractor scope,
- financing/draw details,
- lender notes,
- contracts/legal docs,
- other contractor scopes,
- internal risk/approval notes.

## 16. Implementation Plan

1. Centralize FairLendBrokerage organization config.
2. Add contractor workspace route access decision logic to frontend RBAC.
3. Add contractor-specific fluent-convex auth helpers.
4. Add schema extensions for aliases, onboarding review, invite claim intent, acknowledgements/issues, evidence feedback, normalized email lookup, and document visibility.
5. Implement email normalization and canonical contractor profile reuse in builder/backoffice contractor creation flows.
6. Implement WorkOS invitation-backed contractor invite actions.
7. Implement self-service onboarding draft/submit and backoffice review/promote flow.
8. Implement contractor workspace denormalized view model queries.
9. Implement contractor profile update mutations with operational vs reviewable field boundaries.
10. Implement assignment/schedule acknowledgement and clarification/dispute mutations.
11. Implement contractor supporting evidence upload and feedback workflow.
12. Implement contractor-specific schedule and ICS projection.
13. Build `/contractor` route family and production UI surfaces.
14. Extend `/backoffice/contractors` with onboarding review, duplicate resolution, invite, merge, and evidence review.
15. Wire builder-side optional invite actions for contractors attached to authorized proposals/builds.
16. Add audit events and event outbox rows for material actions.
17. Add tests and run production validation commands.
18. Replace old contractor documentation with a deprecation pointer to this PRD.

## 17. Testing Decisions

Tests should assert external behavior and authorization outcomes, not component internals or implementation details.

### 17.1 Backend Tests

Add Convex tests for:

- self-service onboarding draft/save/submit,
- email-only matching,
- no-email profile creation without invite,
- normalized email canonical reuse,
- duplicate email conflict routing,
- invite creation with WorkOS invitation metadata,
- invite claim confirmation,
- invited known contractor bypassing backoffice review,
- self-service onboarding requiring backoffice approval,
- approved onboarding waiting for WorkOS role sync,
- contractor workspace queries returning only assigned scope,
- contractor workspace denial without contractor role,
- contractor workspace denial without linked profile,
- contractor evidence upload constrained to assigned scope,
- contractor evidence visible to builder/backoffice,
- contractor evidence excluded from completion/draw eligibility,
- acknowledgement/dispute state transitions,
- backoffice merge preserving aliases and migrating assignments,
- audit events for invite/claim/merge/evidence/review actions.

Use existing production Convex tests around contractor planning, proposal claim links, calendar reminders, production proposal authorization, and builder staff provisioning as prior art.

### 17.2 Frontend Route/RBAC Tests

Add route access tests for:

- unauthenticated contractor route redirects to sign-in,
- authenticated member can access onboarding bridge only,
- contractor role without linked profile sees onboarding/empty resolution state,
- contractor role with linked profile can access `/contractor`,
- builder/backoffice route access remains unchanged.

### 17.3 Component/Surface Tests

Add production component tests for:

- dashboard summary sections,
- active build/proposal work list rendering,
- scope-limited proposal detail redaction,
- permit visibility,
- document ACL filtering,
- evidence upload target selection,
- evidence feedback states,
- profile completeness and optional rates,
- onboarding state display,
- backoffice review outcomes,
- duplicate merge confirmation behavior.

### 17.4 Calendar Tests

Add tests for:

- contractor schedule projection from proposal/build assignments,
- contractor reminder event visibility,
- contractor-specific ICS feed scoping,
- schedule acknowledgement events.

### 17.5 Build/Typecheck Commands

Required verification for implementation:

- `bun x convex codegen`
- `bun x tsc -p convex/tsconfig.json`
- focused Convex tests for contractor workspace/onboarding
- focused route/component tests for contractor and backoffice contractor surfaces
- `bun run test`
- `bun run build`

## 18. Out Of Scope

- Contractor marketplace/search product.
- Cross-brokerage contractor workspace aggregation.
- Public contractor profile/share pages.
- Contractor chat or threaded messaging.
- Contractor authority to submit completion claims.
- Contractor authority to request draws.
- Contractor authority to approve milestones or draw releases.
- Geofenced contractor evidence.
- Raw/internal contractor rating visibility.
- Automatic fuzzy identity merge.
- Contractor self-delete.
- Contractor self-unlink.
- Complex GIS territory mapping.
- Automatic external calendar write-back beyond existing reminder materialization patterns.
- Full compliance enforcement policy engine.

## 19. Further Notes

- This PRD intentionally replaces the old `docs/contractors-v1.md` implementation notes as the contractor source of truth.
- Existing contractor v1 code is prior art and should be reused where it fits production requirements, but it must not constrain this feature away from the decisions in this PRD.
- Contractor Workspace should feel like a field-operational product surface: dense, mobile-friendly, and centered on work, schedule, evidence, and scope.
- Contractor users are participants in construction execution, not lenders or borrowers. Preserve this role boundary throughout UI copy, authorization, and backend view models.
