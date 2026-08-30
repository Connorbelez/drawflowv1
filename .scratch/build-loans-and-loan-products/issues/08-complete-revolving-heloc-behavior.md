# 08: Complete revolving HELOC behavior

**What to build:** Upgrade the minimal HELOC workflow into a canonical on-demand credit facility. HELOC DRAW events and posted advances consume Available Credit, principal repayments replenish only revolving lines, and all capacity changes remain visible and Loan-specific.

**Blocked by:** 06: Post canonical Loan Transactions and balances; 07: Configure complete interest and repayment schedules.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Keep financing capacity separate from Build cash.

- [ ] Every on-demand Loan exposes its own credit limit, outstanding principal, Available Credit, availability dates, expiry, and freeze state.
- [ ] Proposed HELOC DRAW events and posted advances cannot exceed that Loan's Available Credit.
- [ ] The HELOC limit never counts as cash; only an approved or posted advance changes the cash projection.
- [ ] Posted principal repayments replenish a revolving line subject to limit, expiry, and freeze; interest and fee payments never replenish capacity.
- [ ] Non-revolving on-demand Loans remain reduced by cumulative advances even after principal repayment.
- [ ] Interest accrues independently on each advance's outstanding principal and never on undrawn capacity.
- [ ] Proposal and active-Build Loans surfaces distinguish Available Credit, advanced principal, cash received, and projected or posted interest.
- [ ] Unscheduled external advances are represented as source-attributed transactions and variance, not silently inserted into the approved plan.
- [ ] Focused tests cover multiple HELOCs, multiple draws, repayment replenishment, non-replenishing behavior, limit enforcement, expiry, freeze, interest, cash, and route reachability.

