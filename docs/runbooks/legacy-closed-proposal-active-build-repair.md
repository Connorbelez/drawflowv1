# Legacy closed-proposal Active Build repair

## Purpose

Use this runbook when a proposal is already `closed` but has no
`activeBuildId`. Backoffice dashboards and `/backoffice/builds` intentionally
read canonical `activeBuilds`, so an incomplete legacy closing is otherwise
invisible even though its proposal, milestones, and draw plan still exist.

The repair is organization-scoped, idempotent, and audited. It reconstructs
the Active Build graph from persisted proposal data but deliberately does not
invent lender-configurable loan terms. No `loanFacilities` row is created; the
audit records the warning
`loan_facility_not_reconstructed_missing_authoritative_terms`.

## Before running

1. Confirm the proposal is genuinely a closed loan/build and is not an
   intentionally archived proposal.
2. Confirm its organization, brokerage, builder profile, workflow snapshot,
   milestones, and draw rows are correct.
3. Obtain an authoritative build start date from the closing record.
4. Record the operator's WorkOS user ID and a material repair reason.
5. Deploy the current Convex functions before invoking the repair.

Do not infer the start date from `closedAt`, and do not infer principal or
interest from the budget or lender draw-policy limit.

If an authorized operator explicitly directs the repair to use a synthetic
date (for example, the recorded closing calendar date), include
`"warnings":["build_start_date_synthesized_from_recorded_closed_at_by_operator"]`
in the internal mutation input and state that decision in `reason`. The date
must then be reviewed and corrected through the normal admin workflow.

## Development repair

```bash
bun x convex run production_proposals:repairLegacyClosedProposalActiveBuildInternal \
  '{"actorWorkosUserId":"USER_ID","buildStartDate":"YYYY-MM-DD","proposalId":"PROPOSAL_ID","reason":"REPAIR_REASON"}'
```

## Production repair

Only after reviewing the production proposal and authoritative start date:

```bash
bun x convex run production_proposals:repairLegacyClosedProposalActiveBuildInternal \
  '{"actorWorkosUserId":"USER_ID","buildStartDate":"YYYY-MM-DD","proposalId":"PROPOSAL_ID","reason":"REPAIR_REASON"}' \
  --prod
```

Expected operations:

- `created`: a missing Active Build aggregate was materialized.
- `relinked`: one valid existing Active Build was found and linked back to the
  proposal.
- `already_repaired`: no write or duplicate audit/outbox event was produced.

The repair blocks cross-organization/cross-brokerage rows, missing referenced
builds, non-closed proposals, and multiple Active Builds for one proposal.

## Verification

1. Run the same command again and confirm `already_repaired` with the same
   `buildId`.
2. Confirm exactly one `activeBuilds.by_proposal` row exists.
3. Confirm the proposal's `activeBuildId` points to that row.
4. Confirm copied milestones, submilestones, draws, documents, evidence, cost
   items, and contractor assignments are organization-scoped to the build.
5. Confirm no loan facility was fabricated.
6. Confirm two audit events contain the real actor, role, reason, warning, and
   prior/new state.
7. Confirm the build appears in both `/backoffice` and `/backoffice/builds`.
8. Enter authoritative loan terms through the normal lender-admin workflow.

## Rollback and escalation

Do not manually delete a repaired aggregate. If the wrong proposal or date was
used, stop and perform an audited administrative correction. Multiple Active
Builds, scope mismatches, or a proposal referencing a missing build require
manual data-integrity investigation before any further writes.
