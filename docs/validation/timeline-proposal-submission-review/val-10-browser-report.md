# VAL-10 browser report

Date: 2026-05-25
Plan: v979eqbk7j8fzharx2f2qms8nh87d5d7
Local app: http://localhost:3001

## Live approved timeline

Route: `/demo/timeline/v979eqbk7j8fzharx2f2qms8nh87d5d7`

Browser smoke probes passed:

- Live build banner is present.
- Old copy `Proposal approved / This reimbursement draw plan is read-only` is absent.
- Currency values are not rendered as `$...M`.

Observed text excerpt:

```text
Live build execution

This approved reimbursement roadmap is now the day-to-day build timeline for evidence, site visits, draw requests, and lender review.

active build
DrawFlow Roadmap
Live build
Durable Convex plan
approved
Saved
VAL-10 Submission Review Build draw roadmap
3 reimbursement milestones staged against $650,000 in lender policy, evidence review, and borrower working-capital exposure.
Cash on hand
Cash requirement vs draw recovery
Initial cash on hand
ENDING CASH
$250,000
```

Screenshot artifact: `reports/val10-live.png`

## Backoffice dashboard

Route: `/backoffice`

Browser smoke probes passed:

- Proposal/submitted copy is present.
- Active build/live-build copy is present.
- Dashboard counts include approved timelines in active builds and draft/submitted timelines in proposals.

Observed text excerpt:

```text
ACTIVE BUILDS
2
2 active builds including approved timelines

PROPOSALS
112
112 draft/submitted proposals
61 timeline drafts; 0 submitted
```

Screenshot artifact: `reports/val10-backoffice.png`

## Builder dashboard

Route: `/demo/drawflow/builder-dashboard`

Browser smoke probes passed:

- `Live builds` section is present.
- `Open live build` action is present and targets the approved timeline route.

Observed text excerpt:

```text
Timeline plans
Draft, submitted, approved, and archived reimbursement draw plans owned by the mock builder persona.

APPROVED
1

Live builds
Approved plans that now serve as day-to-day build timelines.
VAL-10 Submission Review Build
approved
$650,000
Open live build
```

Screenshot artifact: `reports/val10-builder.png`
