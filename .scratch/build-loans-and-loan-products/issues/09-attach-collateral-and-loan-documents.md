# 09: Attach collateral and Loan Documents

**What to build:** Let proposal and active-Build users represent secured Loans using canonical Properties, Loan-specific Collateral Assignments, lien positions, and canonical Loan Documents. A collateral Property may be different from the Build site and may secure more than one Loan.

**Blocked by:** 02: Carry supplemental Loans through closing; 04: Publish Brokerage Loan Products.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Keep Build financing as a planning sub-ledger.

- [ ] A secured Product requires a Collateral Assignment and numeric Lien Position before its Proposed Loan is ready for closing.
- [ ] Users can select the Build Property or another Brokerage-scoped Property as collateral without duplicating Property identity.
- [ ] A Collateral Assignment snapshots declared value, valuation date and source, ownership description, and lien position for that Loan.
- [ ] Reusing a Property is allowed; duplicate lien positions, inconsistent valuations, and conflicting encumbrance declarations produce visible non-blocking warnings.
- [ ] Users can attach commitments, contracts, statements, and supporting records to a Proposed Loan before approval and to its Loan after closing.
- [ ] Attachments reuse the canonical Document owner and storage path rather than creating a Loan-specific file subsystem.
- [ ] Every Loan Document has explicit Brokerage-internal, Build-financing-participant, Primary Construction Lender, or specific Loan Lender visibility.
- [ ] DrawFlow presents collateral and document provenance without claiming title verification or authoritative contractual custody.
- [ ] Proposal and active-Build surfaces expose the authorized collateral and document actions through supported production entry points.
- [ ] Focused authorization and projection tests cover cross-organization isolation, alternate collateral, reuse warnings, document visibility, closing conversion, and active-Build attachment.

