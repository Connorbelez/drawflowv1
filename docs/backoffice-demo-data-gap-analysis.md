# Backoffice Demo Data Gap Analysis

This dashboard now reads from Convex `demo_` tables through
`api.demo_drawflow.demo_getBackofficeDashboard`.

## Migrated To Persistent Demo Data

| Backoffice display | Persistent source | Derivation |
| --- | --- | --- |
| Draw requests metric | `demo_drawGroups`, `demo_milestones` | Counts requested draw groups without `releaseApprovedAt`; review detail from submitted/site-visit-complete milestones. |
| Active builds metric/table | `demo_builds`, `demo_milestones` | Active scenario build, days active from `projectStartDate` to `todayDate`, status from milestone schedule/budget state. |
| Proposals metric/kanban | `demo_builds`, `demo_milestones`, `demo_backofficeProposalCards` | Includes seeded proposal workspace and generated timeline proposal cards. |
| Milestones metric/kanban | `demo_milestones`, `demo_evidencePackages`, `demo_siteVisits`, `demo_reviewReports` | Columns, priority, due labels, and reviewer initials are derived from milestone state and related records. |
| Schedule rail | `demo_siteVisits`, `demo_milestones`, `demo_drawGroups` | Site visit, milestone review, and draw-review events are derived from durable timestamps/dates. |
| Quick actions | `demo_milestones`, `demo_siteVisits`, `demo_drawGroups` | Review, visit, and draw actions are derived from current queue state. |

## Explicit Mock Gaps

| Gap | Why it cannot be inferred safely | UI treatment |
| --- | --- | --- |
| Street-level build address | `demo_builds.subtitle` has a city/location phrase, not a street address. | Displays `Mock address - <city>` and proposal cards show a `Mock address` badge when applicable. |
| Builder/company name | No `demo_` table currently stores borrower/builder company identity for drawflow or timeline plans. | Displays `Mock builder - ...` and proposal cards show a `Mock builder` badge. |
| Proposal LTV | There is no persisted collateral value, loan amount, or loan-to-value source table. | Displays `Mock 68% LTV` and proposal cards carry `isMockLtv`. |
| Unseeded demo state | No `demo_` rows exist until `demo_seedDrawFlowDemo` runs. | Frontend uses only obvious `Mock ...` fallback rows. |

## Notes

- Reimbursement-only domain rules remain intact: draw review and release state are derived from requested/approved draw-group and milestone state; no proactive advance funding is displayed.
- The old broad mock dashboard dataset was removed and replaced with an explicit fallback whose visible strings are all mock-labeled.
