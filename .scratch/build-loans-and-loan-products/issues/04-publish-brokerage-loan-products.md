# 04: Publish Brokerage Loan Products

**What to build:** Let authorized Brokerage operators define reusable Loan Products and publish immutable versions that proposal users can select from Build Template selection and the Build Proposal Loans workflow. Product policy supplies reusable behavior while actual rate, amount, lender, dates, and collateral remain Build-specific Proposed Loan terms.

**Blocked by:** 01: Ship minimal supplemental Proposed Loans and HELOC Draws.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Build financing canonical vocabulary.

- [ ] Authorized Brokerage operators can reach the production Product catalog and create, revise, publish, retire, and inspect Brokerage Loan Products.
- [ ] Product lifecycle is `draft → published → retired`; published versions are immutable and revision creates a new draft version.
- [ ] Retiring a version prevents new selection without changing an existing Proposed Loan or Loan snapshot.
- [ ] A Product Version defines category, funding availability, revolving behavior where allowed, repayment structure, interest policy, security policy, fees, allowed Loan-level overrides, and validity rules.
- [ ] A Product Version does not supply the Build-specific actual rate, amount or limit, lender, term, collateral assignment, or lien position.
- [ ] Build Template selection may recommend a currently selectable Product, but the operator must confirm all Loan-specific terms before a draft Proposed Loan is created.
- [ ] Selecting a Product Version on a proposal snapshots its policy and preserves that snapshot through later product revisions or retirement.
- [ ] Product ownership, publication, selection, and retirement are authorized, organization-scoped, and audited.
- [ ] Focused domain, Convex, and route-level tests prove lifecycle validity, immutability, snapshot behavior, template selection, proposal reachability, and unauthorized access rejection.

