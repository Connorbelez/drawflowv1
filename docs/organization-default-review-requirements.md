# Organization Default Review Requirements

Status: implemented

## Authority and ownership

Back Office is the only policy author. WorkOS remains authoritative for shared
identity, memberships, roles, and permissions. DrawFlow stores organization
defaults in the application-owned Lender Organization policy domain and does
not write WorkOS projection tables.

The canonical Proposal policy, assignment, immutable Proposal revision,
`accessReviewPolicy` lender-confirmation checkpoint, policy lock, active Build
snapshot, and audit owners remain unchanged. Organization defaults extend those
owners; they are not a parallel policy system.

## Lifecycle

1. A Back Office actor saves an immutable organization-default version with an
   expected current version, actor, time, reason, policy, Brokerage, and Lender
   Organization scope.
2. Save validates lender quorum against current canonical approval-eligible
   membership. An unsatisfiable default is rejected without a version or audit
   write.
3. Assignment or reassignment validates the current default again, then copies
   it into a new canonical Proposal policy version and the current assignment.
   If no custom default exists, the existing Back Office system baseline is
   copied with explicit `system_baseline` provenance.
4. Later organization-default versions apply only to future assignments. They
   do not mutate existing Proposal or Build policy records.
5. Before policy lock, Back Office may save a per-Build override or explicitly
   restore the assigned organization's current default. Each operation creates
   a new canonical policy version and Proposal revision, opens the existing
   lender-confirmation cycle, and writes the existing Proposal audit event.
6. Closing locks the exact Proposal policy version and provenance into the
   active Build policy snapshot. Override and restore commands then fail
   closed.

Withdrawal does not erase the assignment's policy provenance. Reassignment
creates a new assignment interval and snapshots the newly selected
organization's current default.

## Compatibility and migration

No destructive backfill is required. Organization-default versions are a new
immutable table. Existing organizations without a row resolve to the explicit
system baseline. Existing Proposal policy, assignment, and lock records may
omit provenance fields; readers treat those legacy policies as customized
Build policy and preserve their existing behavior. New writes always record
provenance.

This compatibility rule avoids inventing historical organization-default
versions or silently changing any assigned Proposal or active Build.

## Failure behavior

- Expected-version mismatch: reject with a reload-and-retry message.
- Cross-Brokerage or cross-organization access: reject before reading or
  writing policy data.
- Membership drift that makes quorum unsatisfiable: show an actionable state
  on organization detail and reject assignment without partial writes.
- Stale Proposal revision or assignment: reject override or restore.
- Locked or closed policy: reject override and restore.
- Reused idempotency key with different command values: reject.
