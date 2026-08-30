# 07: Configure complete interest and repayment schedules

**What to build:** Apply immutable Product Version policy to generate complete Loan schedules and calculate interest, payments, capitalization, and fees independently for each Loan. Operators can preview a Product with temporary example terms, while proposal and active-Loan surfaces show the approved schedule and actual variance.

**Blocked by:** 04: Publish Brokerage Loan Products; 06: Post canonical Loan Transactions and balances.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Build financing canonical vocabulary.

- [ ] Interest is calculated daily on actual outstanding principal using the snapshotted day-count convention, with Actual/365 Fixed as the default.
- [ ] Actual/Actual, Actual/360, and 30/360 calculations have exact boundary-date and leap-year coverage.
- [ ] Daily calculation, accrual posting, capitalization, and payment frequency remain independent policies.
- [ ] Capitalization is disabled unless explicitly permitted and creates a posted principal-increasing transaction without changing cash.
- [ ] Amortizing fixed-payment, amortizing fixed-principal, interest-only balloon, and bullet repayment structures generate valid schedules.
- [ ] Weekly, biweekly, semi-monthly, monthly, quarterly, annual, and maturity-only frequencies are accepted only where compatible.
- [ ] Effective-dated fixed and variable Loan rate entries recalculate only the applicable segments; the initial implementation does not require an external index feed.
- [ ] Posted money uses integer minor units, calculations retain high precision, posting rounds half-up, and final payments absorb residual cents.
- [ ] Product preview inputs are temporary and never become Product defaults unless the operator explicitly configures them as defaults.
- [ ] Proposal and active-Loan surfaces show per-Loan schedule, interest, fees, combined financing totals, and scheduled-versus-posted variance.
- [ ] Focused property, example, Convex, and route tests cover valid combinations, rejected combinations, exact calculations, schedule freezing, and user-visible projections.

