# 14: Contract legacy financing paths and certify reachability

**What to build:** Finish the expand-contract rollout by removing remaining production financing reads and writes from legacy facility and financing-capital-event paths, validating migration parity, and certifying every intended operator and lender journey through supported production entry points.

**Blocked by:** 03: Migrate legacy Home Equity Takeouts; 10: Deliver lender Loan portfolios and read-only sharing; 11: Move the primary construction facility into canonical Loans; 12: Integrate all financing pools with the optimizer; 13: Reconcile external servicing activity.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification and all Build financing ADRs.

- [ ] No production financing command, query, projection, UI, optimizer, assistant action, closing path, or Draw-release path depends on legacy `loanFacilities` or financing-specific capital events.
- [ ] Borrower cash infusions and Build costs remain on their canonical capital-event path and retain existing behavior.
- [ ] Migration verification proves per-Build parity for cash, principal, interest, Draw release, source identity, lender, and organization scope before legacy contraction.
- [ ] Any retained legacy table or field has an explicit non-production retention purpose and no runtime writer.
- [ ] Supported production navigation reaches Brokerage Product management, lender Product management, Build Template financing selection, proposal Loans, active Build Loans, and lender Loan portfolios.
- [ ] Multi-actor verification covers Builder, Back Office, Primary Construction Lender, secondary Loan Lender, Brokerage product administrator, and lender product administrator permissions and observable results.
- [ ] Documentation, domain vocabulary, API contracts, audit descriptions, migration runbook, and operator guidance match the shipped canonical model.
- [ ] Focused Convex tests, route tests, calculation tests, migration tests, code generation, Convex TypeScript validation, and the production build pass from the exact final checkout.
- [ ] No parallel Loan, Product, Document, lender membership, Build participation, Draw approval, timeline, or Audit Event owner remains.
- [ ] Final evidence records the exact commit, commands, results, supported entry points, and any external deployment evidence that remains outside repository verification.
