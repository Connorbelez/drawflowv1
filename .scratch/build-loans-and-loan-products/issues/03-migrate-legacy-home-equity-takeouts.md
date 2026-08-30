# 03: Migrate legacy Home Equity Takeouts

**What to build:** Cleanly move existing proposal and active-Build Home Equity Takeouts into the supplemental Proposed Loan and Loan model. Preserve the legacy full-cash behavior, interest, dates, source identity, closing links, and audit provenance, then remove the old Home Equity Takeout creation and read path without changing the primary construction facility.

**Blocked by:** 02: Carry supplemental Loans through closing.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Cleanly migrate legacy Build financing into Loans.

- [ ] A rehearsable, idempotent migration converts pre-approval Home Equity Takeouts into upfront Proposed Loans and active Home Equity Takeouts into upfront Loans.
- [ ] Migrated records preserve amount, annual rate, funding date, source capital-event identity, Build or Proposal association, and organization scope.
- [ ] Pre- and post-migration projected cash and interest match for every successfully migrated Home Equity Takeout.
- [ ] Approved and active Builds receive the required immutable migration provenance without reopening financing configuration.
- [ ] Invalid or ambiguous legacy rows fail or enter an explicit reviewed quarantine; none are silently dropped or guessed.
- [ ] Production Home Equity Takeout creation, update, closing, and projection consumers use the canonical supplemental Loan model after migration.
- [ ] Financing-specific legacy capital-event and secondary-facility behavior is contracted after all consumers move; borrower cash infusions and Build costs remain capital events.
- [ ] The primary construction `loanFacility`, its consumers, and its data are not migrated or refactored in this ticket.
- [ ] Migration and production-path tests prove idempotency, parity, provenance, supported-route behavior, and construction-facility isolation.

