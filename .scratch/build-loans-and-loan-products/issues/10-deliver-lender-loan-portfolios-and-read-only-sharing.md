# 10: Deliver lender Loan portfolios and read-only sharing

**What to build:** Give each Lender Organization a portfolio of its deployed Loans and allow an explicit, narrow, read-only Proposed Loan share before closing. Keep Loan Lender visibility separate from the Primary Construction Lender's operational Build participation.

**Blocked by:** 05: Publish and select lender-owned Loan Products; 06: Post canonical Loan Transactions and balances; 09: Attach collateral and Loan Documents.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Separate Loan lenders from Build participation.

- [ ] A Lender Organization can reach a production portfolio containing every active Loan for which it is the Loan Lender and no other lender's Loans.
- [ ] Portfolio entries show the lender's Loan terms, balances, transactions, permitted documents, and only the approved limited Build reference.
- [ ] The limited Build reference contains Build name, identifier, property address, status, and Primary Construction Lender but excludes budgets, milestones, evidence, working capital, other Loans, and Build Workspace access.
- [ ] An authorized proposal actor can explicitly grant and revoke a Proposed Loan Share to its Loan Lender.
- [ ] The share is strictly read-only: the secondary lender cannot approve, acknowledge, upload, comment, or mutate anything.
- [ ] Selecting a lender or lender Product never creates a share automatically.
- [ ] Only the Primary Construction Lender receives proposal review and active Build operational participation through the existing canonical access model.
- [ ] The UI uses route context to expose portfolio actions without broadening permission caps for users who hold multiple roles.
- [ ] Focused multi-actor tests prove portfolio scope, explicit sharing, revocation, document filtering, forbidden mutations, and the distinction between Loan Lender and Primary Construction Lender.

