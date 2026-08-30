# 12: Integrate all financing pools with the optimizer

**What to build:** Make hybrid financing participate in one deterministic Build timeline while keeping cash, each on-demand Loan's Available Credit, and construction Unlocked Draw Capacity separate. Let the optimizer propose explicit HELOC DRAW events that prevent cash shortfalls and reduce projected interest, but never borrow silently.

**Blocked by:** 08: Complete revolving HELOC behavior; 11: Move the primary construction facility into canonical Loans.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Keep financing capacity separate from Build cash.

- [ ] The proposal and active-Build timeline expose Cash on Hand, one Available Credit lane per on-demand Loan, and the construction Loan's Unlocked Draw Capacity as distinct values.
- [ ] Only upfront disbursements, explicit credit advances, released construction Draws, and borrower infusions increase cash.
- [ ] Principal payments, interest payments, cash-paid fees, and Build costs reduce cash according to deterministic same-day ordering.
- [ ] Interest accrual and capitalization do not directly reduce cash; withheld financing costs reduce net proceeds explicitly.
- [ ] A plan is infeasible if ordered cash becomes negative, a Loan capacity is exceeded, a payment lacks cash, or an event falls outside availability or maturity.
- [ ] Unused Available Credit or Unlocked Draw Capacity never silently repairs an infeasible plan.
- [ ] The optimizer may propose Loan-specific HELOC DRAW events and explains their interest and cash effect; an authorized operator must confirm them before approval.
- [ ] Optimizer output never posts a Loan Transaction or mutates an approved schedule.
- [ ] Cheapest Feasible, Fastest, and Capital-Constrained comparisons include all Loan interest, fees, debt service, and explicit funding events.
- [ ] Focused deterministic and property tests cover same-day ordering, multiple Loans, revolving and non-revolving credit, construction capacity, optimizer confirmation, and user-visible feasibility explanations.

