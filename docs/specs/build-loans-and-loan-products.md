# Build Loans and Loan Products Specification

Status: **Approved requirements; implementation pending**

Applies to: Build Template selection, Build Proposal detail, active Build detail,
Back Office Loan Product administration, Lender Organization Loan Product
administration, the lender Loan portfolio, timeline cash projections, Draw Plan
optimization, canonical Draw release, and Loan Documents.

Canonical vocabulary: `CONTEXT.md`, section **Build Financing**.

Related decisions:

- `docs/adr/0002-build-financing-boundary.md`
- `docs/adr/0003-separate-loan-lender-from-build-participation.md`
- `docs/adr/0004-freeze-financing-at-first-approval.md`
- `docs/adr/0005-one-reimbursement-gated-loan-per-build.md`
- `docs/adr/0006-separate-build-financing-timeline-pools.md`
- `docs/adr/0007-clean-cutover-from-legacy-financing-events.md`

## 1. Product Outcome

DrawFlow must represent the complete hybrid financing package for a Build. A
package may combine an upfront mortgage, an on-demand HELOC or bridge line, and
one reimbursement-gated construction Loan. Each Loan keeps its own lender,
principal or limit, rate schedule, term, funding availability, repayment
structure, interest policy, collateral, documents, schedule, transactions, and
balances.

DrawFlow is a planning and collaboration sub-ledger. It is not the authoritative
servicing, compliance, accounting, title, or contractual system. It must retain
source provenance, immutable posted activity, reconciliation differences, and
material audit events without implementing delinquency, collections, general
ledger, regulatory classification, suspense accounting, or title verification.

## 2. Research Basis

The design was checked against two open-source lending systems:

- [Frappe Lending](https://github.com/frappe/lending) separates Loan Products,
  Loans, disbursements, repayment schedules, repayments, accruals, and security.
- [Frappe Loan Product documentation](https://docs.frappe.io/lending/loan-product)
  configures reusable repayment behavior and supports a line-of-credit schedule
  with a sanctioned upper limit and multiple disbursements.
- [Frappe Repayment Schedule documentation](https://docs.frappe.io/lending/repayment-schedules)
  generates a schedule from booking and disbursement information.
- [Frappe Loan Repayment Repost documentation](https://docs.frappe.io/lending/loan-management/tools/loan-repayment-repost)
  reverses and re-books affected activity after backdated changes.
- [Apache Fineract platform documentation](https://fineract.apache.org/docs/stable/)
  separates product configuration from the Loan account, transactions,
  collateral, charges, schedule calculation, and effective-dated changes.
- [Apache Fineract API documentation](https://fineract.apache.org/docs/legacy/)
  exposes distinct APIs for Loan Products, Loans, Loan Transactions, collateral,
  charges, and rescheduling.

DrawFlow adopts the separation of reusable policy, booked obligation, schedule,
transactions, and collateral. It does not adopt full servicing and accounting.
Unlike Frappe's default product form, a DrawFlow Loan Product never supplies the
actual interest rate; the negotiated rate belongs to the Build-specific Proposed
Loan and resulting Loan.

## 3. Existing DrawFlow Boundary

The current PRD models `homeEquityTakeout` as a proposal capital event whose
full principal becomes cash on its timeline date. Closing creates a secondary
`loanFacility`. The current schema stores:

- proposal events in `proposalCapitalEvents`,
- active events in `capitalEvents`, and
- construction and home-equity facilities in `loanFacilities`.

This feature replaces those financing-specific records with the canonical model
below. Borrower cash infusions and Build costs remain capital events; Loans and
their advances are no longer encoded as generic capital events.

## 4. Domain Model

| Entity | Responsibility | Canonical ownership |
| --- | --- | --- |
| Loan Product | Stable catalog identity and owner | Brokerage or Lender Organization |
| Loan Product Version | Immutable policy bundle and permitted overrides | Loan Product |
| Proposed Loan | Build Proposal-specific negotiated financing before closing | Build Proposal |
| Financing Package | Collection of Proposed Loans or converted Loans for one Build | Build Proposal / Build |
| Loan | Booked Build-linked obligation created at closing | Build, with a Loan Lender counterparty |
| Loan Rate Schedule Entry | Effective-dated actual or forecast rate | Loan |
| Loan Schedule Event | Approved forecast event and actual-posting lineage | Proposed Loan, then Loan |
| Loan Transaction | Posted financial activity or reversal | Loan |
| Daily Interest Accrual | High-precision daily calculation detail | Loan |
| Loan Amendment | Effective-dated post-closing contract change | Loan |
| Property | Brokerage-scoped identity for a Build site or collateral | Brokerage |
| Collateral Assignment | Loan-specific property security and lien declaration | Proposed Loan, then Loan |
| External Balance Snapshot | Source-attributed reconciliation observation | Loan |
| Reconciliation Exception | Visible difference or externally observed rule violation | Loan |
| Proposed Loan Share | Explicit secondary-lender read grant | Proposed Loan |
| Loan Document relationship | Typed, scoped attachment using canonical Documents | Proposed Loan or Loan |

All records are Brokerage-scoped. Lender-owned records also carry the owning
WorkOS Lender Organization identity. The implementation must reuse canonical
WorkOS organization, membership, role, and permission projections and canonical
Document and Audit Event owners. It must not create parallel identity,
membership, document-storage, comment, or audit systems.

## 5. Composable Loan Product Policy

A Loan Product packages a valid combination of independent policies and gives
that combination an operator-facing name such as **Construction LOC**,
**HELOC**, **First Mortgage**, or **Bridge Loan**. Category is a reporting label,
not behavioral dispatch.

### 5.1 Product identity and lifecycle

A product is Brokerage-owned or Lender Organization-owned. Its lifecycle is:

`draft → published → retired`

A published Loan Product Version is immutable. A change creates a new draft
version. Retirement prevents new selection but never changes existing Proposed
Loans or Loans. The Brokerage may suspend a lender product's tenant visibility
with an audited reason without changing existing obligations.

### 5.2 Required policy axes

Each Loan Product Version defines:

1. Funding Availability: `upfront`, `on_demand`, or `reimbursement_gated`.
2. Revolving Policy: `replenishing` or `non_replenishing` where permitted.
3. Repayment Structure: `amortizing`, `interest_only_balloon`, or `bullet`.
4. Amortization Method: `fixed_payment` or `fixed_principal` when amortizing.
5. Payment Frequency: weekly, biweekly, semi-monthly, monthly, quarterly,
   annually, or maturity-only where valid.
6. Interest Calculation: actual outstanding principal, day-count convention,
   and precision rules.
7. Interest Posting: daily, monthly, or another supported posting interval.
8. Capitalization: never or an explicit daily, monthly, quarterly, annual,
   maturity, or manual contractual schedule.
9. Security: unsecured or property-secured.
10. Category: construction, home equity, mortgage, bridge, or another label.
11. Fee rules and defaults.
12. Business-day convention and applicable Brokerage holiday calendar.
13. Fields that a Proposed Loan may override and any allowed bounds.

The Product Version does not contain the actual rate, principal, credit limit,
term, lender selection for Brokerage products, collateral assignment, or lien
position. Those are Proposed Loan terms.

### 5.3 Combination validity

- Upfront funding is non-revolving.
- On-demand funding may be replenishing or non-replenishing.
- Reimbursement-gated funding is non-replenishing.
- A Build may have at most one reimbursement-gated Proposed Loan or Loan.
- Property-secured financing requires a Property and numeric Lien Position.
- Amortizing financing requires term, payment frequency, and amortization method.
- Interest-only financing requires maturity, payment frequency, and a principal
  balloon.
- Bullet financing requires maturity.
- Capitalization is forbidden unless explicitly permitted.
- Every member of a Financing Package uses the Build Financing Currency. The
  initial supported currency is CAD; mixed-currency packages are invalid.

## 6. Product and Loan Lifecycles

### 6.1 Proposed Loan

`draft → proposed → selected_for_closing → converted`

`withdrawn` is available before conversion. Commitment presence, document
completeness, and term completeness are derived readiness facts rather than
lifecycle states.

A Proposed Loan may be selected for closing only when it has a selectable
Product Version, Loan Lender, currency, principal or limit, actual rate and rate
structure, availability and maturity dates, valid policy combination, required
collateral and lien, a feasible timeline, and compliance with the one
reimbursement-gated Loan rule. A Brokerage policy may additionally make a
specific Loan Document type mandatory.

### 6.2 Financing Approval Cutoff

The earliest Primary Construction Lender or Back Office Build Proposal approval
freezes the Financing Package composition, Proposed Loan terms, and Loan
Schedule Events. Secondary Loan Lenders are read-only and cannot trigger the
cutoff. No Loan may be added, removed, or replaced after the cutoff or on an
active Build.

If an approved financing package must change before activation, the Build
Proposal must return through the canonical pre-approval revision path. An active
Build cannot reopen financing selection.

### 6.3 Loan

Closing converts each `selected_for_closing` Proposed Loan into a distinct Loan
with the Product Version and negotiated terms snapshotted.

`pending_disbursement → active → closed`

Closure reasons are paid off, refinanced, cancelled before funding, written off,
or transferred externally. Build completion never closes a Loan. Refinancing
closes the original and retains source documents and the external replacement
reference; it does not add a replacement Loan to the active Build.

### 6.4 Loan Schedule Event

A schedule event has one lineage:

`proposed → frozen → posted`

Cancellation uses an audited reason. Before cutoff, authorized proposal actors
may change proposed events. Approval freezes them. At closing they become the
Loan schedule. A posted Loan Transaction links to the schedule event and
retains date and amount variance. DrawFlow does not create separate planned and
actual financing aggregates.

### 6.5 Loan Transaction

A Loan Transaction is `posted` or `reversed`. It is never draft or pending.
Corrections use linked reversal and replacement records. Forecasts remain Loan
Schedule Events. Imports are idempotent by Loan, source system, and external
transaction reference.

## 7. Lender Roles and Access

The Loan Lender and Primary Construction Lender are separate relationships.

| Capability | Builder | Back Office | Primary Construction Lender | Secondary Loan Lender | Product administrator |
| --- | --- | --- | --- | --- | --- |
| Add/edit Proposed Loans before cutoff | Yes | Yes | No | No | No |
| Request proposal changes | No | Yes | Yes | No | No |
| Approve proposal and trigger cutoff | No | Yes | Yes | No | No |
| Attach permitted Loan Documents | Yes | Yes | Yes | No | Product scope only |
| View active Build Workspace | Yes | Yes | Yes | No | No |
| View own active Loan | When Build-authorized | Yes | Yes | Yes | No automatic right |
| Record external Loan activity | No | Yes | No | No | No |
| Record Loan Amendment | No | Yes | No | No | No |
| Publish Brokerage product | No | Authorized Brokerage role | No | No | Authorized Brokerage role |
| Publish Lender product | No | No automatic right | With organization permission | With organization permission | With organization permission |

A secondary lender sees a Proposed Loan only through an explicit read-only
share. It cannot approve, acknowledge, upload, comment, or mutate. Its active
portfolio shows its own Loan plus limited Build name, identifier, property
address, status, and Primary Construction Lender. It does not expose Build
budgets, milestones, evidence, working capital, other Loans, or the Build
Workspace.

Loan Documents have explicit visibility: Brokerage internal, Build financing
participants, Primary Construction Lender, or the specific Loan Lender.

## 8. Funding and Build Timeline

The Build timeline maintains three kinds of projection:

1. Cash on Hand.
2. Available Credit for each on-demand Loan.
3. Unlocked Draw Capacity for the single reimbursement-gated Loan.

Unused credit and unlocked reimbursement capacity are never cash.

### 8.1 Cash projection

For each deterministically ordered timeline event:

`cash_after = cash_before + cash_receipts - cash_expenses`

Cash receipts include borrower infusions, net upfront Loan proceeds, posted or
scheduled on-demand advances, and released construction Draws. Cash expenses
include Build costs, principal and interest payments, and cash-paid fees.
Capitalized interest changes principal but not cash.

Events on the same date carry a deterministic sequence. A receipt can finance a
later same-day expense only after the receipt event.

### 8.2 Upfront funding

An upfront Loan contributes cash only on its effective disbursement date. Fees
withheld at funding reduce net cash while gross principal and fees remain
explicit transactions.

### 8.3 On-demand funding

Each Loan has its own Available Credit lane. A Credit Advance Schedule Event
plans a dated transfer into cash. For a replenishing line, posted principal
repayments restore capacity subject to limit, expiry, and freeze. For a
non-replenishing line, capacity is reduced by cumulative advances. Interest and
fee payments never replenish capacity.

The optimizer may propose Credit Advance Schedule Events that prevent shortfalls
and reduce interest. An operator must confirm them before approval. Optimization
never posts an actual advance.

### 8.4 Reimbursement-gated funding

Exactly one reimbursement-gated Loan may exist per Build. The canonical Draw
and pooled Build funding snapshot remain the owners of approval, reservation,
and release. Every released Draw creates one linked advance Loan Transaction on
that Loan. There are no Draw Funding Allocations and no split Draw postings.

A system-created release is blocked if it exceeds Loan limit, availability, or
Unlocked Draw Capacity. Capacity must be corrected through a source-backed Loan
Amendment before release. A later external over-limit observation is retained as
an exception but never retroactively authorizes a Draw.

### 8.5 Feasibility

A financing plan is infeasible if any ordered event:

- makes cash negative,
- exceeds a Loan's Available Credit,
- exceeds Unlocked Draw Capacity,
- cannot fund a payment or fee, or
- occurs outside availability or maturity dates.

The optimizer cannot silently borrow unused credit to make an infeasible plan
appear feasible.

## 9. Interest, Repayment, and Fees

### 9.1 Interest basis

Interest is calculated only on actual outstanding principal. Undrawn Available
Credit and unreleased Unlocked Draw Capacity do not accrue interest. The safe
default is Actual/365 Fixed. Products may permit Actual/Actual, Actual/360, or
30/360.

For each effective principal and rate segment, the engine applies the configured
day-count fraction to:

`interest = outstanding_principal × annual_rate × day_count_fraction`

Advanced or released principal begins accruing on its effective funding date. A
principal repayment stops accrual from its effective date. Ordered,
end-exclusive segments prevent duplicate boundary-day interest.

Daily Interest Accrual retains high-precision detail. Posting frequency is
independent and defaults to daily. Posted CAD values use integer cents and
round half-up only at posting. The final scheduled payment absorbs residual
cents.

### 9.2 Rate schedule

The actual rate belongs to the Proposed Loan and Loan. A fixed-rate Loan has one
effective entry. A variable-rate Loan has immutable effective-dated entries with
optional index, spread, source, and future-forecast designation. The initial
release has no automatic index feed. Future projections use the current rate
unless an explicit forecast entry exists.

### 9.3 Capitalization

Capitalization is independent from calculation, posting, and payment frequency.
Only accrued unpaid interest may capitalize. A capitalization transaction
increases principal without changing cash. Planned interest and fees cannot be
capitalized unless separately and explicitly permitted.

### 9.4 Repayment

Amortizing products support fixed-payment and fixed-principal schedules.
Interest-only products schedule periodic interest and a principal balloon.
Bullet products schedule principal and unpaid interest at maturity, subject to
the separate capitalization policy.

An explicit source allocation is preserved. Without one, the snapshotted
waterfall defaults to fees, then interest, then principal. A payment beyond
known balances becomes a reconciliation exception; DrawFlow does not create a
suspense-account subsystem.

### 9.5 Fees

Products define permitted fee kinds, formulas, and defaults. Proposed Loans
contain negotiated values. Each fee is explicitly withheld from proceeds, paid
from cash, financed into principal, or deducted from an advance. A financed fee
requires Product Version permission.

### 9.6 Business dates

Loan effective dates use the Brokerage timezone and local calendar. Audit
timestamps use UTC. Products select unadjusted, following, or modified-following
due-date behavior using the Brokerage holiday calendar. Interest remains
calendar-day based under the selected day-count convention.

## 10. Backdated Activity and Reconciliation

Back Office may record or import source-attributed external advances,
repayments, fees, accrual postings, rate entries, balance snapshots, and closure
facts. Construction Draw advances are created only from canonical Draw release.

A backdated entry recalculates Daily Interest Accrual from its effective date.
Unposted calculations are regenerated. Posted effects are corrected with linked
reversal and replacement Loan Transactions.

An External Balance Snapshot never overwrites transaction-derived balances.
Differences remain visible. An external advance beyond recorded capacity is
retained as an External Capacity Exception. An excess payment is allocated only
to known balances and retains an Excess Payment Exception.

## 11. Security and Collateral

A property-secured Proposed Loan requires a Brokerage-scoped Property,
Collateral Assignment, declared valuation and source, ownership description,
and numeric Lien Position. The collateral Property may differ from the Build
site.

One Property may secure multiple Loans. Duplicate lien positions, inconsistent
valuations, and conflicting encumbrance declarations create non-blocking
warnings. DrawFlow does not claim title verification or authoritative lien
priority.

## 12. Required Operator Surfaces

### 12.1 Loan Product catalogs

- Brokerage products live in Back Office organization settings.
- Lender products live in the lender organization-management area.
- Both use one role-aware editor.
- The editor groups identity, availability, revolving behavior, repayment,
  interest, security, Loan-level overrides, and validity.
- A schedule preview uses temporary example rate, amount, dates, and term. Those
  values are not product defaults unless explicitly configured as defaults.

### 12.2 Build Template selection

A template may recommend categories or currently selectable Loan Products. The
operator must confirm lender, active Product Version, principal or limit, actual
rate, and term. Confirmation creates draft Proposed Loans. A template never
silently binds a lender or selects a retired Product Version.

### 12.3 Build Proposal Loans tab

Show:

- Financing Package summary.
- Cash from scheduled upfront proceeds.
- Available Credit per on-demand Loan.
- Unlocked Draw Capacity for the construction Loan.
- Proposed Loan lender, Product Version, terms, collateral, schedule, fees,
  balances, and Loan Documents.
- Add, edit, withdraw, and reorder controls until cutoff.
- Read-only configuration after cutoff.

### 12.4 Active Build Loans tab

Terms and package composition are immutable. Authorized Back Office actions may
attach documents, record external activity, reconcile balances, add permitted
rate entries, create source-backed Loan Amendments, and review schedule variance.
No role can add or replace a Loan.

### 12.5 Lender Loan portfolio

A lender sees all active Loans for which it is the Loan Lender and the permitted
limited Build reference. Build operational access appears only when that lender
is also the Primary Construction Lender.

## 13. Migration and Cutover

This is a clean cutover, not a permanent compatibility layer.

1. Convert each construction `loanFacility` into the Build's single
   reimbursement-gated Loan.
2. Convert each existing `homeEquityTakeout` into an upfront-funded Loan with a
   disbursement on the original event date, preserving the existing full-cash
   projection.
3. Preserve lender, limit or principal, annual rate, interest start, payback
   date, released Draw relationships, source capital-event key, source IDs, and
   migration provenance.
4. Convert financing-specific `proposalCapitalEvents` into Proposed Loans and
   Loan Schedule Events where the proposal remains pre-approval.
5. Give approved and active Builds a Synthetic Financing Approval Cutoff at the
   earliest known approval or activation timestamp.
6. Assert one reimbursement-gated Loan per Build and one Build Financing
   Currency.
7. Reconcile pre- and post-migration cash, principal, interest, and Draw release
   projections. Any irreconcilable row must fail or be explicitly quarantined;
   it must not be silently dropped.
8. Remove financing reads and writes from the legacy facility and capital-event
   paths after verified migration. Borrower cash and Build cost capital events
   remain canonical capital events.

Migration is the only mechanism allowed to create Loans for an already active
Build. New HELOC products use on-demand credit and do not inherit the legacy
home-equity full-cash behavior.

## 14. Canonical Backend Responsibilities

Implementation should expose domain commands and projections rather than CRUD
over every table.

Required command families include:

- draft, revise, publish, retire, and suspend Loan Products,
- create, revise, withdraw, select, and convert Proposed Loans,
- freeze a Financing Package through the canonical approval path,
- add and revoke Proposed Loan Shares,
- attach and scope canonical Loan Documents,
- post, reverse, import, and idempotently replay Loan Transactions,
- generate schedules and Daily Interest Accrual,
- record rate entries, Loan Amendments, balance snapshots, and reconciliation
  exceptions,
- close a Loan with a source-attributed reason.

Required projections include:

- role-aware Brokerage and lender Product catalogs,
- proposal and active Build Loans workspaces,
- per-Loan balances and schedule variance,
- Build cash, Available Credit, and Unlocked Draw Capacity timeline lanes,
- lender-scoped active Loan portfolio.

Every command must enforce Brokerage scope, WorkOS organization authorization,
revision or idempotency guards where applicable, and canonical Audit Events.

## 15. Material Audit Events

Audit at minimum:

- Product publication, retirement, revision, and visibility suspension.
- Proposed Loan creation, change, withdrawal, selection, and conversion.
- Lender selection and Primary Construction Lender assignment.
- Financing Approval Cutoff creation.
- Proposed Loan share grant and revocation.
- Loan Document attachment and visibility change.
- Schedule generation, freeze, cancellation, and variance linkage.
- Transaction posting, import replay, reversal, and replacement.
- Loan Amendment and effective rate entry.
- Capacity, excess-payment, collateral, and balance reconciliation exceptions.
- Loan closure.
- Migration provenance and Synthetic Financing Approval Cutoff creation.

Material events retain actor, role, timestamp, prior and new values, source,
reason where required, and warnings.

## 16. Acceptance Criteria

The feature is complete only when all of the following are true:

1. Authorized Brokerage and lender operators can reach their respective Product
   catalogs through supported production navigation.
2. Published Product Versions are immutable, and new versions do not change
   existing Proposed Loans or Loans.
3. A Proposal can combine multiple upfront and on-demand Loans with no more than
   one reimbursement-gated Loan.
4. The actual interest rate is required per Proposed Loan and is not inherited
   as a Product rate.
5. A single-currency Financing Package is enforced.
6. Builder and Back Office can configure Proposed Loans before cutoff.
7. Primary Construction Lender and Back Office approval freeze financing through
   the canonical proposal approval path.
8. Secondary lenders are explicitly shared, read-only, and cannot access the
   Build Workspace.
9. Closing converts only selected Proposed Loans and preserves immutable Product
   and term snapshots.
10. No ordinary command can add, remove, or replace a Loan after cutoff.
11. Upfront proceeds affect cash only on disbursement.
12. Each on-demand Loan has a separate Available Credit lane, and an explicit
    advance is required before cash changes.
13. The construction Loan uses canonical pooled Draw availability, and every
    released Draw posts exactly one advance to that Loan.
14. Cash, Available Credit, and Unlocked Draw Capacity remain distinct in the
    timeline and optimizer.
15. Interest calculations cover supported day-count, posting, payment, and
    capitalization combinations with exact boundary-date and rounding tests.
16. Interest never accrues on undrawn or unreleased capacity.
17. Backdated activity produces deterministic reversal and replacement results.
18. Imported transactions are idempotent.
19. Reconciliation snapshots and exceptions never overwrite posted history.
20. Property collateral may differ from the Build site and may be reused without
    claiming authoritative title status.
21. The active Build Loans tab permits operational recording but not financing
    composition changes.
22. A Loan remains visible in its Loan Lender's portfolio after Build completion
    until independently closed.
23. Migration preserves existing Build cash, interest, facility, and Draw-link
    outcomes and leaves no production consumer on legacy financing records.
24. Focused authorization tests cover Builder, Back Office, Primary Construction
    Lender, secondary Loan Lender, Brokerage product administrator, and lender
    product administrator access.
25. Route-level tests prove the intended users can reach and exercise the Product
    catalog, template selection, proposal Loans tab, active Build Loans tab, and
    lender Loan portfolio through supported production entry points.

## 17. Recommended Implementation Sequence

1. Add the policy types, calculation library, validators, and focused financial
   schedule tests.
2. Add canonical Product, Proposed Loan, Loan, schedule, transaction, accrual,
   amendment, collateral, sharing, and reconciliation persistence.
3. Implement and rehearse the clean migration with pre/post projection checks.
4. Cut proposal financing reads and writes from `homeEquityTakeout` and
   `loanFacilities` to the canonical model.
5. Add Brokerage and lender Product catalogs and the shared editor.
6. Add Build Template financing selection and the proposal Loans tab.
7. Integrate the three financing lanes and explicit credit advances into the
   timeline and optimizer.
8. Link canonical Draw release to the single construction Loan transaction.
9. Add the active Build Loans tab, Back Office recording and reconciliation, and
   Loan Documents.
10. Add the lender Loan portfolio and explicit secondary-lender sharing.
11. Run role-aware route tests, calculation property tests, migration tests,
    focused Convex tests, and production-interface reachability verification.

No stage may introduce a second Loan, Document, lender membership, Build
participation, Draw approval, timeline, or Audit Event owner.
