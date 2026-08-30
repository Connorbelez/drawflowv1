# 02: Carry supplemental Loans through closing

**What to build:** Convert every selected supplemental Proposed Loan into an active Loan when the Build Proposal closes. Preserve the approved terms and funding-event lineage, expose the Loans on the active Build, and keep their balances and interest separate. The existing primary construction facility remains on its current implementation path.

**Blocked by:** 01: Ship minimal supplemental Proposed Loans and HELOC Draws.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Freeze the Financing Package at first approval; Keep Build financing as a planning sub-ledger.

- [ ] Closing converts only Proposed Loans selected for closing and preserves their organization, lender when present, terms, actual rate, category, funding behavior, and approved schedule events.
- [ ] Active Loans follow the minimal `pending_disbursement → active → closed` lifecycle and remain distinct records rather than active capital-event metadata.
- [ ] Authorized users can reach the active Build Loans tab and inspect each Loan's approved terms, funded principal, projected interest, and linked funding events.
- [ ] Approved Loan and schedule configuration is immutable on the active Build; no supported command can add, remove, or replace a Loan after cutoff.
- [ ] Actual funding can link to the approved schedule event without replacing its approved date or amount.
- [ ] Build completion does not automatically close a Loan.
- [ ] The existing primary construction facility continues to be created, queried, and calculated exactly as before.
- [ ] Focused tests cover closing selection, snapshot fidelity, active-Build reachability, independent Loan lifecycle, cutoff enforcement, and construction-facility non-regression.

