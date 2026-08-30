# 01: Ship minimal supplemental Proposed Loans and HELOC Draws

**What to build:** Give authorized Build Proposal users the smallest useful supplemental financing workflow. They can add more than one Proposed Loan beside the existing primary construction facility, classify each as Mortgage, HELOC, Bridge, or Other, and choose either upfront or on-demand funding. Upfront proceeds enter cash on their funding date. A HELOC limit is not cash until the user adds a clearly labelled **HELOC DRAW** timeline event. Each Proposed Loan projects its own Actual/365 interest on funded principal. This is an additive implementation; it must not refactor, migrate, or change the existing primary construction `loanFacility`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Keep Build financing as a planning sub-ledger; Freeze the Financing Package at first approval.

- [ ] Authorized users can reach a production Build Proposal Loans surface and add, edit, and remove multiple supplemental Proposed Loans before the Financing Approval Cutoff.
- [ ] Each Proposed Loan is Brokerage- and organization-scoped and records a stable identity, category, funding behavior, amount or credit limit, actual annual rate, funding or availability date, and maturity date where supplied.
- [ ] Mortgage, Bridge, and Other upfront Loans add their proceeds to projected cash only on the configured funding date.
- [ ] A HELOC credit limit does not increase cash; one or more explicit **HELOC DRAW** events increase cash on their scheduled dates and cannot exceed the Loan's remaining limit.
- [ ] Interest is calculated independently per Proposed Loan using Actual/365 on funded principal only, and the proposal exposes both per-Loan interest and the combined financing total.
- [ ] Supplemental Loan proceeds participate in the same ordered cash-on-hand projection used by Borrower Starting Cash and borrower cash infusions.
- [ ] Existing proposal approval rules reject Loan and HELOC DRAW creation, editing, or removal after the Financing Approval Cutoff.
- [ ] The existing primary construction facility, construction interest calculation, Draw schedule, approval behavior, and persistence remain unchanged.
- [ ] The UI reuses existing production form, timeline, tab, and layout primitives and is reachable by its intended authorized proposal users.
- [ ] Focused Convex and route-level tests prove multiple Loan types, multiple Loans, HELOC DRAW limit enforcement, independent interest, cash effects, authorization, cutoff enforcement, and construction-facility non-regression.

