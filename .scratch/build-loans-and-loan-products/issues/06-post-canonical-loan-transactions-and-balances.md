# 06: Post canonical Loan Transactions and balances

**What to build:** Give Back Office a complete active-Loan transaction path for advances, upfront disbursements, repayments, interest payments, fees, capitalization, reversals, and corrections. Derive Loan balances from append-only posted activity and show those balances on the active Build Loans tab.

**Blocked by:** 02: Carry supplemental Loans through closing.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Keep Build financing as a planning sub-ledger.

- [ ] Loan Transactions are organization-scoped and have posted or reversed status only; forecasts remain Loan Schedule Events.
- [ ] Authorized Back Office users can post supported transaction types from the active Loan surface and see principal, accrued interest, fees, payments, and available capacity update.
- [ ] Balances are derived from immutable transactions rather than directly edited stored totals.
- [ ] A correction links reversal and replacement transactions and preserves the original posting.
- [ ] Each transaction records effective date, source, actor, Loan, amount components, and linked schedule event when applicable.
- [ ] Transaction commands enforce Loan lifecycle, currency, amount, organization, and authorization invariants atomically with audit effects.
- [ ] Multiple Loans on one Build maintain independent transaction histories and balances.
- [ ] Active Build users can reach transaction history and balances through the supported Loans tab; unsupported roles receive a read-only or denied surface as defined by policy.
- [ ] Focused domain, Convex, projection, and route tests cover every supported posting, reversal, balance derivation, isolation, authorization, and observable UI result.

