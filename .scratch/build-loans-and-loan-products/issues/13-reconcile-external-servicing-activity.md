# 13: Reconcile external servicing activity

**What to build:** Let Back Office reconcile DrawFlow's planning sub-ledger with source-attributed activity from lenders or servicing systems. Support idempotent transaction imports, balance snapshots, backdated recalculation, Loan Amendments, exceptions, and independent Loan closure without introducing a compliance or servicing subsystem.

**Blocked by:** 06: Post canonical Loan Transactions and balances; 07: Configure complete interest and repayment schedules; 09: Attach collateral and Loan Documents.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Keep Build financing as a planning sub-ledger.

- [ ] Back Office can record or import source-attributed advances, repayments, fees, rate changes, balance snapshots, and closure facts through a supported production Loan surface or API.
- [ ] Loan, source system, and external transaction reference form an idempotency identity; replay returns the existing result instead of duplicating activity.
- [ ] An External Balance Snapshot remains separate from transaction-derived balances and exposes any difference without overwriting history.
- [ ] A backdated transaction or rate entry regenerates unposted daily accrual and corrects posted effects through linked reversals and replacements.
- [ ] An externally observed over-limit advance is preserved as a visible reconciliation exception without silently raising the Loan limit or authorizing a canonical Draw.
- [ ] Payment value beyond known balances remains an explicit exception and does not create negative principal or a suspense-account subsystem.
- [ ] A source-backed Loan Amendment records effective date, prior and new values, actor, reason, and supporting Document without rewriting posted transactions.
- [ ] Loan closure is independent from Build completion and records paid off, refinanced, cancelled before funding, written off, or transferred externally.
- [ ] Refinancing retains the external replacement reference but cannot add a replacement Loan to an already frozen active Build.
- [ ] Focused idempotency, recalculation, reversal, exception, amendment, closure, authorization, and reachable-interface tests prove the complete reconciliation path.

