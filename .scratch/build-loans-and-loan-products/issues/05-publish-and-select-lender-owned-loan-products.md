# 05: Publish and select lender-owned Loan Products

**What to build:** Let permitted Lender Organization users publish their own Product Versions and let proposal users select them after choosing that lender. The product owner becomes the Loan Lender, but product ownership alone never grants Build operational access.

**Blocked by:** 04: Publish Brokerage Loan Products.

**Status:** ready-for-agent

**Source contracts:** Build Loans and Loan Products Specification; Separate Loan lenders from Build participation.

- [ ] A permitted Lender Organization user can reach the lender product-management surface and create, revise, publish, retire, and inspect only that organization's products.
- [ ] The implementation reuses canonical WorkOS organizations, memberships, roles, and permissions and does not create application-owned lender membership state.
- [ ] Selecting a lender on a proposal displays that lender's published products in addition to the Brokerage catalog.
- [ ] Selecting a lender-owned Product fixes its owning organization as the Loan Lender; a Brokerage Product requires explicit Loan Lender selection.
- [ ] Changing or clearing the proposed lender invalidates incompatible Product selections instead of silently rebinding them.
- [ ] The Brokerage may suspend a lender Product's tenant visibility with an audited reason without altering existing Proposed Loans or Loans.
- [ ] Selecting a lender or its Product does not create a Build Participant, Proposed Loan Share, or active Build permission.
- [ ] Product management and proposal selection are available from supported production entry points with role-correct UI actions.
- [ ] Focused tests cover WorkOS authorization, owner isolation, lender binding, Brokerage catalog coexistence, visibility suspension, and the absence of automatic Build access.

