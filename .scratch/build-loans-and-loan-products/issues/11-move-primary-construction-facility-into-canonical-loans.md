# 11: Move the primary construction facility into canonical Loans

**What to build:** Migrate the existing primary construction facility into the canonical Loan model as the Build's single reimbursement-gated Loan. Keep the canonical Draw as the owner of approval, pooled availability, and release; a successful release posts exactly one linked Loan advance.

**Blocked by:** 03: Migrate legacy Home Equity Takeouts; 04: Publish Brokerage Loan Products; 06: Post canonical Loan Transactions and balances; 07: Configure complete interest and repayment schedules.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Allow one reimbursement-gated Loan per Build; Cleanly migrate legacy Build financing into Loans.

- [ ] A rehearsable migration creates one reimbursement-gated Loan for every valid legacy primary construction facility and preserves lender, principal limit, rate, interest start, Draw links, balances, and provenance.
- [ ] Schema and domain validation prevent more than one reimbursement-gated Loan on a Build.
- [ ] Canonical Draw approval, reservation, pooled Build availability, release authority, and audit ownership remain unchanged.
- [ ] Every successful Draw release atomically posts exactly one advance Loan Transaction linked to the Draw.
- [ ] A Draw is never split across Loans and no Draw Funding Allocation becomes a product relationship.
- [ ] Release is blocked when the construction Loan lacks limit, availability, or Unlocked Draw Capacity; capacity must be corrected before release.
- [ ] Construction interest begins only after released funds and is derived through the same Loan calculation policy without changing reimbursement-only Draw behavior.
- [ ] Proposal, active Build, Draw review, and Loan views project one consistent construction Loan and funding balance.
- [ ] All production consumers move from the legacy primary facility to the canonical Loan after verified migration.
- [ ] Focused migration, authorization, concurrency, Draw-release, interest, balance, and route tests prove exact parity and single-owner behavior.

