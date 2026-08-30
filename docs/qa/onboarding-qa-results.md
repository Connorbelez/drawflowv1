# DrawFlow onboarding QA results

Date: 2026-08-26

## Environment

- Convex deployment: `fortunate-cassowary-439` (development only)
- Builder/contractor QA inbox: `drawflow-builder-1@agentmail.to`
- The AgentMail API key could read the existing inbox but did not have the
  `inbox_create` permission. Separate builder-existing and contractor inboxes
  could not be created, so the reusable inbox was used for both persona runs.

## Builder owner flow

Passed through the supported interfaces:

- Back Office `/backoffice/onboard-builder` created the builder profile and
  owner invitation.
- AgentMail received `Your DrawFlow builder invitation` addressed to the QA
  inbox.
- WorkOS sign-up and email verification succeeded.
- The invitation was accepted, the local WorkOS projection was synchronized,
  and the builder reached `/builder`.
- First-run proposal setup reached milestone generation and the proposal tabs
  were checked without server or uncaught-error output.

## Contractor flow

Passed through the supported interfaces:

- Back Office `/backoffice/onboard-contractor` created the contractor profile
  and the invite-after-create action sent a WorkOS contractor invitation.
- AgentMail received `Your DrawFlow contractor invitation` addressed to the
  QA inbox.
- WorkOS sign-up and email verification succeeded.
- Local contractor onboarding displayed the invited profile, confirmation
  linked the canonical contractor profile, and `/contractor` loaded with the
  expected dashboard and profile readiness state.

## Existing-owner builder flow

Passed through the supported Back Office roster interface:

- A fresh disposable WorkOS builder identity was synchronized into the local
  projection without creating another inbox.
- `/backoffice/builders` listed the identity under “Builders awaiting a
  profile”; the profile dialog selected Elie Soberano as the active FairLend
  broker.
- Creating the profile linked the existing WorkOS identity as the canonical
  owner account and produced a healthy broker assignment.
- This `attach_existing_owner` path correctly sent no invitation email; the
  AgentMail inbox contained only the previously verified new-builder and
  contractor messages.

## Fixes verified during QA

- Repaired the development WorkOS fixture so the configured principal broker
  had an active verified broker membership. The production eligibility checks
  remain intact.
- Live builder provisioning now carries the actual WorkOS user id returned by
  the directory lookup into the canonical builder owner link, while the fake
  adapter retains its deterministic fallback.
- Replaying a canonical invitation whose unsent communication intent stopped
  at `action_required` resets that intent to pending so the configured worker
  can deliver it.
- Builder proposal assignment UI now respects the redaction boundary and does
  not display missing owner, broker, or brokerage data as false empty states.
- The Back Office broker-options query now isolates an invalid unrelated
  brokerage instead of making the entire builder roster unrecoverable. It
  still propagates duplicate-principal failures, and all provisioning and
  assignment writes continue to fail closed on invalid broker configuration.
- Added an explicit-target cleanup command that scans every schema table,
  deletes only application-owned references, deletes test WorkOS users, and
  feeds deletion events through the canonical WorkOS projection processor.

## Cleanup result

The final cleanup dry run reported zero application references, zero live
WorkOS users, zero memberships, and zero remaining protected projection
references for the reusable QA email. No production deployment was modified.
