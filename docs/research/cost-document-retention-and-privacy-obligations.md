# Cost Document retention and privacy-deletion obligations

**Research snapshot:** 2026-07-28  
**Launch context:** Canadian federal law and Ontario law, for a commercial construction-financing product  
**Status:** Product and engineering research, not legal advice

## Decision summary

DrawFlow should not encode one universal number of years for every invoice or receipt. The primary sources impose different retention periods on different organizations, records, and trigger events:

- federal income-tax and GST/HST records are generally kept for six years after the end of the relevant tax year or year, with longer retention for late returns, objections, appeals, or a CRA demand;
- an Ontario licensed mortgage brokerage generally keeps records related to a mortgage or renewal for at least six years after the mortgage term, renewal, or other mortgage transaction expires;
- an Ontario licensed mortgage administrator generally keeps records related to an administration agreement for at least six years after that agreement expires;
- applicable FINTRAC mortgage-sector records generally have five-year, record-specific periods;
- a PIPEDA breach record must be kept for 24 months after the organization determines that the breach occurred; and
- PIPEDA otherwise requires purpose-limited retention and a retention/destruction program, not indefinite retention.

The safe product posture is therefore a **rules engine that retains a Submitted Cost Document until the latest applicable deadline or hold has expired**. Automatic purge must be disabled when an applicable rule or trigger date is unresolved, but an unresolved record must create a compliance exception for an accountable person rather than becoming a silent permission to retain personal information forever.

The Ontario launch template should calculate, where applicable:

```text
retainUntil = latest(
  incomeTaxDeadline,
  gstHstDeadline,
  mortgageBrokerageDeadline,
  mortgageAdministrationDeadline,
  fintracDeadline,
  contractDeadline,
  approvedLitigationRiskDeadline
)
```

An active legal, regulatory, tax, privacy-access, complaint, audit, or contractual hold suspends disposal regardless of `retainUntil`. Once all purposes, deadlines, and holds are exhausted, personal information should be securely erased or irreversibly anonymized across primary data, derived data, copies, and backups, leaving only a deliberately minimized and separately scheduled audit tombstone.

## Scope and assumptions

For this note, a **Cost Document** includes an invoice or receipt source file and the facts DrawFlow derives from or associates with it: vendor snapshot, dates, description, totals and tax, allocations, uploader provenance, revisions, review state, decision history, and audit events.

The analysis assumes:

- DrawFlow is used in commercial activity in Ontario;
- a Cost Document may identify a homeowner, sole proprietor, vendor contact, uploader, reviewer, or other individual and may therefore contain personal information;
- DrawFlow may act as a service provider while a lender, brokerage, administrator, builder, or another organization remains accountable for the record;
- a Cost Document is not automatically a tax, mortgage-regulatory, FINTRAC, construction-trust, or litigation record merely because it exists in DrawFlow; classification depends on the organization, transaction, and use; and
- the product remains multi-tenant and must support obligations that differ by organization and loan.

This note does not determine whether FairLend or a tenant is licensed, exempt, a FINTRAC reporting entity, the controller of particular personal information, or a party subject to a particular tax or contractual duty. Those are legal and operational facts that must be supplied to the policy engine.

## Primary-source findings

### 1. PIPEDA applies to commercial personal information in Ontario

[PIPEDA section 4(1)](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/section-4.html) applies Part 1 to personal information an organization collects, uses, or discloses in the course of commercial activities. Ontario does not have a generally applicable private-sector law deemed substantially similar to PIPEDA; the Ontario substantially similar statute identified by the Office of the Privacy Commissioner of Canada is for personal health information. The OPC therefore describes PIPEDA as applying to private-sector commercial activity in Ontario, subject to the Act's facts and exceptions. See the OPC's [PIPEDA requirements in brief](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/) and [provincial-law overview](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/r_o_p/prov-pipeda/).

PIPEDA does not let an organization avoid accountability by putting records in a SaaS product. Schedule 1, clause 4.1.3 makes an organization responsible for personal information in its possession or custody, including information transferred to a third party for processing, and requires contractual or other means to provide comparable protection. [PIPEDA, Schedule 1, clause 4.1.3](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html#h-417659).

**Product consequence:** retention configuration and deletion execution need controller/processor ownership, tenant-scoped instructions, subcontractor and backup coverage, and evidence that the instructions were carried out.

### 2. PIPEDA requires purpose-limited retention and governed disposal

PIPEDA Schedule 1, clause 4.5 says personal information shall be retained only as long as necessary to fulfil the identified purposes. Clause 4.5.2 recommends documented minimum and maximum periods and enough post-decision retention to permit individual access. Clause 4.5.3 says information no longer required should be destroyed, erased, or made anonymous, and requires destruction procedures. Clauses 4.7 and 4.7.5 require safeguards appropriate to sensitivity and care during disposal so unauthorized parties cannot gain access. [PIPEDA, Schedule 1, clauses 4.5 and 4.7](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html#h-417768).

This wording matters. Under [PIPEDA section 5(2)](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/section-5.html), “should” in Schedule 1 is a recommendation, while “shall” states an obligation. The retention-only-as-long-as-necessary rule, safeguards, and destruction-procedure requirement should be treated as mandatory product constraints; the detailed minimum/maximum schedule is also the OPC's expected accountability practice.

The OPC's current [retention and disposal guidance](https://www.priv.gc.ca/en/privacy-topics/business-privacy/breaches-and-safeguards/safeguarding-personal-information/gd_rd_201406/) says there is no one-size-fits-all period, recommends an inventory of purposes, statutory minimums, copies, and backups, and says disposal should make personal information irrecoverable. It expressly says associated copies and backup files should also be destroyed.

**Product consequence:** “keep everything forever” is not a compliant default. Every personal-information class needs a documented purpose, minimum, maximum, owner, and disposal path. Backups, OCR text, previews, search indexes, exports still under DrawFlow's control, and analytics copies are part of that lifecycle.

Anonymization is not merely removing a name. In [PIPEDA Findings #2026-001, paragraphs 58–61 and 115–126](https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2026/pipeda-2026-001/), the OPC applied the test that there must be no serious possibility that an individual could be identified through the information alone or combined with other available information. The organization must be able to demonstrate that result, account for changing re-identification risk, and remove personal information from backups as part of a deletion program.

**Product consequence:** an opaque identifier, content hash, vendor fingerprint, actor reference, or build linkage is pseudonymous—not anonymous—while DrawFlow or a tenant can reconnect it to a person or source. Treat it as personal information and retain it only under its own documented purpose and maximum period.

### 3. PIPEDA does not create an unconditional erase-now right

PIPEDA Schedule 1, clause 4.3.8 allows an individual to withdraw consent subject to legal or contractual restrictions and reasonable notice. [PIPEDA, Schedule 1, clause 4.3.8](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html#h-417730). The OPC's 2026 joint investigation states that Canadian privacy laws considered there do not grant a general explicit deletion right, while explaining that withdrawal of consent and the purpose-limited retention rules may nevertheless require deletion in context. [PIPEDA Findings #2026-002, paragraphs 499–511](https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2026/pipeda-2026-002/#toc5c).

PIPEDA also creates preservation exceptions:

- if personal information is the subject of an access request, section 8(8) requires the organization to retain it as long as necessary for the individual to exhaust recourse under Part 1; and
- Schedule 1, clause 4.9 gives individuals access and correction rights, subject to statutory exceptions and severance rules for third-party information.

See [PIPEDA sections 8 and 9](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-3.html#h-417147) and [Schedule 1, clause 4.9](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html#h-417798).

**Product consequence:** a privacy request is a review workflow, not a direct hard-delete command. DrawFlow must identify personal information, applicable legal and contractual reasons, third-party information requiring severance, active access/complaint recourse, and the parts that can be deleted or anonymized now.

### 4. PIPEDA breach records have a specific 24-month period

PIPEDA section 10.3 requires a record of every breach of security safeguards involving personal information under the organization's control. Section 6 of the [Breach of Security Safeguards Regulations](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-64/section-6.html) requires each record to be maintained for 24 months after the organization determines the breach occurred and to contain enough information for the Commissioner to verify compliance.

**Product consequence:** a purge of affected Cost Document content must not erase the separately required breach record. The breach record should itself be minimized to what is needed to satisfy section 10.3 and the Regulations.

### 5. Federal tax law commonly makes invoices and receipts six-year records

The [Income Tax Act, section 230](https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-230.html) requires persons carrying on business and other covered persons to keep records and books of account sufficient to determine tax, along with accounts and vouchers. Most such records must be retained for six years after the end of the last taxation year to which they relate. Electronic records must remain electronically readable. Late-filed returns, objections, appeals, and a Minister's demand can extend the period; written permission is required for early disposal.

The [Excise Tax Act, section 286](https://laws-lois.justice.gc.ca/eng/acts/E-15/section-286.html) similarly requires records needed to determine GST/HST liabilities, obligations, rebates, or refunds, generally for six years after the end of the year to which they relate. It also extends retention for objections, appeals, references, or a Minister's demand, requires electronically readable records, and requires written permission for early disposal.

The CRA expressly lists sales invoices, purchase receipts, contracts, work orders, delivery slips, and related correspondence as supporting records. See:

- CRA, [What are records, who has to keep them, and why it is important](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records/what-records-who-keep-them.html);
- CRA, [GST/HST records to keep](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/gst-hst-records-keep.html); and
- CRA, [Where to keep records, for how long, and early-destruction permission](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records/where-keep-your-records-long-request-permission-destroy-them-early.html).

CRA's current [Electronic record keeping guidance (IC05-1R1)](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/ic05-1/electronic-record-keeping.html) adds that source documents must be retained in an electronically readable format even when an electronic business system summarizes them, and that electronic records, audit trails, supporting software, and backup arrangements must remain accessible through the applicable period. System migrations must preserve the ability to retrieve readable records.

Section 230(1) of the Income Tax Act and section 286(1.2) of the Excise Tax Act also generally require covered records to be kept in Canada unless the Minister authorizes another place. CRA guidance warns that records stored outside Canada and merely accessed electronically from Canada are not considered kept in Canada.

**Product consequence:** the taxpayer remains responsible even if DrawFlow stores the record. DrawFlow must capture the relevant tax year rather than guessing it from upload date, preserve a readable export, support tax holds, and resolve whether its hosting region can serve as the tenant's legally required system of record. A tenant may instead designate DrawFlow as a working copy and retain the authoritative tax record in an approved Canadian system.

### 6. Ontario mortgage record periods depend on the licensee and trigger

These obligations are conditional. The [Mortgage Brokerages, Lenders and Administrators Act, 2006](https://www.ontario.ca/laws/statute/06m29) defines regulated activities and exempts specified financial institutions from licensing in section 6. The record rules below therefore must not be applied to every lender merely because it funds a mortgage.

For a licensed mortgage brokerage:

- [O. Reg. 188/08, sections 46–48](https://www.ontario.ca/laws/regulation/080188) require complete and accurate records of licensed financial activity, mortgage applications and instruments, agreements, and information required under the Act;
- section 47 requires precautions against falsification;
- section 48(1) requires records related to a mortgage or renewal for at least six years after the mortgage term, renewal, or other mortgage transaction expires;
- section 48(2) sets six years after completion or other expiry for a purchase, sale, or trade; and
- section 48(3) requires other required records for at least six years.

For a licensed mortgage administrator:

- [O. Reg. 189/08, sections 29–31](https://www.ontario.ca/laws/regulation/080189) require complete and accurate licensed financial records, required written information, and administration agreements;
- section 30 requires precautions against falsification; and
- section 31 requires records related to an administration agreement for at least six years after the agreement expires, with other required records kept for at least six years.

Both regulations allow electronic records away from the specified Ontario premises only when they can be retrieved there promptly in understandable electronic and paper form, and they require retrieval capacity through the retention period.

FSRA's current operational guidance states that relevant brokerage and administrator transaction records are maintained for six years past the transaction's expiry; if there is no expiry or a file never completes, it says documentation is kept for six years from creation. It also expects access controls and protection against falsification and data breaches. [FSRA, Keep good records to protect your reputation](https://www.fsrao.ca/industry/mortgage-brokering/compliance-and-other-resources/keep-good-records-protect-your-reputation).

**Product consequence:** the required trigger is usually mortgage or administration-agreement expiry, not Build closure or upload date. DrawFlow must not purge a potentially regulated record while the relevant expiry is missing. Whether a post-closing construction invoice “relates to” a mortgage or administration agreement is a classification for the regulated entity and its counsel, not a platform inference.

### 7. FINTRAC creates separate five-year mortgage-sector record classes

Since October 11, 2024, applicable mortgage administrators, brokers, and lenders are reporting entities under the federal anti-money-laundering regime. FINTRAC's definitions exclude a “financial entity” from its mortgage-administrator and mortgage-lender categories, and other entity-specific rules may apply to financial institutions. [FINTRAC mortgage-sector record-keeping guidance](https://fintrac-canafe.canada.ca/guidance-directives/recordkeeping-document/record/mort-eng.php).

For covered mortgage-sector entities, FINTRAC identifies records including:

- reports sent to FINTRAC;
- large-cash and large-virtual-currency transaction records;
- receipt-of-funds records;
- client information records; and
- mortgage-loan records.

The guidance assigns five-year periods using different events: creation, report submission, the last business transaction, or another specified event. Records must be producible to FINTRAC within 30 days. The covered entity must obtain records from an employee or contractor before that relationship ends.

A construction invoice or receipt is **not automatically an enumerated FINTRAC record**. It may become part of a required record or supporting file if it evidences receipt of funds, financial capacity, loan terms, client information, ongoing monitoring, or a reportable/suspicious transaction.

**Product consequence:** store an explicit FINTRAC record class and trigger, not a generic “AML = five years” flag. A privacy deletion cannot remove a required FINTRAC record before its period ends.

### 8. Ontario's Construction Act can make transaction records material without stating a retention period

The current [Construction Act, section 8.1](https://www.ontario.ca/laws/statute/90c30#BK16) requires a contractor or subcontractor who is a statutory trustee to maintain written records of trust-fund receipts, payments, and transfers, separately for each trust. The Act does not state a general retention period in section 8.1.

Cost Documents may substantiate those trust records or prompt-payment events, but the platform should not convert section 8.1 into an invented numeric period. Tax, contract, mortgage, litigation, and other applicable rules determine the actual deadline.

### 9. Electronic retention must preserve readability and evidentiary integrity

Ontario's [Electronic Commerce Act, 2000, sections 8 and 12](https://www.ontario.ca/laws/statute/00e17) permits electronic retention to satisfy many original-document and retention requirements when the record accurately represents the information, preserves integrity, remains accessible for later reference, and retains origin, destination, date, and time information where required.

Ontario's [Evidence Act, section 34.1](https://www.ontario.ca/laws/statute/90e23#BK36) places the burden of authenticating an electronic record on the party tendering it and ties the best-evidence rule to the integrity of the record or record system. [Canada Evidence Act sections 31.1–31.3](https://laws-lois.justice.gc.ca/eng/acts/C-5/page-3.html#h-137833) use a similar integrity model in proceedings to which the federal Act applies.

**Product consequence:** submitted sources, derived financial facts, revisions, approvals, and deletion events should be immutable or append-only; changes should record actor, time, prior/new state, and reason; files should have integrity checks; and exports must remain intelligible without proprietary UI access.

### 10. Litigation rules justify holds but do not create a universal retention period

Ontario's [Limitations Act, 2002](https://www.ontario.ca/laws/statute/02l24) generally provides a two-year basic period after a claim is discovered and a 15-year ultimate period after the underlying act or omission, subject to important exceptions, suspensions, and other statutes. Those periods limit when proceedings may be started; they are not commands to keep every Cost Document for two or 15 years.

Once an Ontario action exists, [Rules of Civil Procedure 30.01–30.03](https://www.ontario.ca/laws/regulation/900194#BK691) require disclosure of relevant electronic and other documents that are or have been in a party's possession, control, or power. Rule 30.08 permits serious consequences for failure to disclose or produce, including limits on using a favourable document, dismissal of an action, or striking a defence.

**Product consequence:** counsel should define when a claim, complaint, investigation, or dispute makes preservation necessary. DrawFlow should provide a hold mechanism that suspends routine disposal and preserves the record, its revisions, audit trail, and relevant system context. The platform should not label a 15-year product-policy period as a statutory minimum.

### 11. Contracts can extend operational retention but cannot erase statutory or privacy constraints

Loan agreements, servicing agreements, lender policies, investor agreements, insurance terms, data-processing agreements, and litigation-settlement terms may require records for longer than the statutory minimum. PIPEDA clause 4.3.8 expressly recognizes legal or contractual restrictions on withdrawal of consent, while clause 4.5 still requires purpose-limited retention.

**Product consequence:** contract obligations need an explicit authority, trigger, deadline, and owner. A free-form “keep forever” setting should not be available. Contract configuration cannot shorten a statutory minimum or bypass an active hold, and any longer period containing personal information needs a documented, appropriate purpose.

## Applicability matrix

| Authority | Applies when | Cost Document relationship | Minimum or controlling rule | Required product trigger |
| --- | --- | --- | --- | --- |
| PIPEDA, Schedule 1, clauses 4.5 and 4.7 | An organization handles personal information in commercial activity and no applicable exemption displaces PIPEDA | Source or associated facts identify an individual | Retain only as long as necessary for identified purposes; govern and securely execute disposal | Purpose end date, legal basis, maximum period |
| PIPEDA, s. 8(8) | Personal information is subject to an access request | Requested or responsive content | Preserve until the individual can exhaust Part 1 recourse | Request opened, recourse exhausted |
| PIPEDA Breach Regulations, s. 6 | A breach of security safeguards involving personal information is determined | Separate breach record may refer to the Cost Document | 24 months after breach determination | Breach determination date |
| Income Tax Act, s. 230 | A covered taxpayer uses the document to determine federal income tax | Invoice, receipt, voucher, contract, or other supporting record | Generally six years after end of last taxation year; longer for late filing, objection/appeal, or CRA demand | Taxpayer, last related tax year, extension/permission |
| Excise Tax Act, s. 286 | A covered person uses the document for GST/HST liability, obligation, rebate, or refund | Sales or purchase invoice and supporting record | Generally six years after end of related year; longer for objection/appeal/reference or demand | Registrant, related year, extension/permission |
| O. Reg. 188/08, s. 48 | The record is held by a covered Ontario licensed mortgage brokerage and relates to regulated activity | Classified as related to mortgage, renewal, trade, or another required brokerage record | Commonly six years after mortgage/renewal/transaction expiry; other required records at least six years | Licensee role, record class, term/transaction expiry |
| O. Reg. 189/08, s. 31 | The record is held by a covered Ontario licensed mortgage administrator | Classified as related to an administration agreement or another required administrator record | Six years after administration agreement expiry; other required records at least six years | Licensee role, record class, agreement expiry |
| PCMLTFA/Regulations and FINTRAC guidance | The organization and record are within an applicable mortgage-sector reporting-entity class | It is or supports an enumerated report, transaction, funds, client-information, or loan record | Generally five years using the record-specific trigger | Reporting-entity class, FINTRAC record class, trigger event |
| Construction Act, s. 8.1 | Contractor/subcontractor is a statutory trustee | It substantiates trust receipts, payments, or transfers | Written records required; section 8.1 states no general period | Trustee role, trust/project association |
| Contract | A binding agreement specifies record retention | Agreement identifies this record or class | As contracted, unless inconsistent with governing law | Contract, clause, trigger, deadline |
| Litigation/regulatory hold | Counsel or accountable officer determines preservation is required | Relevant or potentially responsive content and system history | No generic numeric period; preserve until authorized release | Hold scope, custodian, placed/reviewed/released dates |

## Recommended configurable policy

### A. Record states and deletion authority

1. **Draft:** user-editable and user-deletable only while it has not been submitted, relied upon, classified as a required record, or placed on hold.
2. **Submitted:** immutable source, financial facts, allocations, and provenance. Ordinary users cannot hard-delete it.
3. **Superseded:** a Submitted revision replaced by a linked revision. It remains subject to the same retention computation.
4. **Voided:** excluded from active financial use but not treated as deleted or reversed. It remains subject to the same retention computation.
5. **Purged:** source and personal content have been securely removed after all purposes, deadlines, and holds are cleared; only the minimized tombstone remains for its separate period.

The agreed 30-day inactive-Draft and 24-hour unattached-orphan cleanup periods are reasonable product defaults only if the object was never submitted, used to make a decision, used as a tax/regulatory/contract record, or placed on hold. Promote an object out of ephemeral storage immediately when any of those conditions occurs. Warn the Draft owner seven days before scheduled deletion.

### B. Required organization policy inputs

Each organization must configure or explicitly attest to:

- operating and record jurisdictions;
- organization roles, licences, exemptions, and FINTRAC reporting-entity classes;
- whether DrawFlow is the authoritative record, a processor copy, or a convenience copy for each record class;
- tax-record use and the taxpayer/registrant;
- mortgage term, renewal, transaction, and administration-agreement expiry dates;
- contract retention clauses;
- approved litigation-risk retention, if any, with a documented purpose and legal owner;
- data location and export requirements;
- backup and subprocessors' deletion behaviour; and
- the accountable privacy, tax, regulatory, and legal-hold owners.

The system must record every computed component, its authority, trigger, deadline, and status. `retainUntil` is the latest satisfied component. A missing trigger for an applicable component sets `retentionStatus = "unresolved"` and blocks automatic purge.

For a new production tenant, unresolved policy should block enabling automatic retention jobs and create an onboarding compliance gate. For existing data, preserve the record, alert the accountable owner, and escalate on a fixed schedule; do not let “unresolved” become an indefinite background state.

### C. Holds

Support organization-scoped and record-scoped holds for:

- threatened, pending, or active litigation;
- a demand letter, construction dispute, lien, adjudication, or payment dispute;
- a regulator, law-enforcement, FINTRAC, CRA, insurer, lender, or investor inquiry;
- a tax return not filed, objection, appeal, reference, or CRA retention demand;
- a PIPEDA access request, complaint, or related recourse;
- an internal investigation or suspected fraud; and
- a contractual preservation notice.

A hold must:

- override every scheduled deletion, including Draft and orphan jobs;
- preserve sources, revisions, OCR/derived values, allocations, reviews, decisions, and relevant audit events;
- be immutable except for scoped amendments and authorized release;
- record scope, authority category, custodian, owner, placed/reviewed/released timestamps, and reason without exposing privileged advice in ordinary audit views;
- have periodic review without an automatic expiry; and
- on release, recompute all ordinary deadlines and require a disposal review instead of immediately purging overdue content.

### D. Privacy-deletion workflow

1. Authenticate the requester and identify the organization responsible for the information.
2. Inventory all responsive primary, derived, duplicate, backup, search, preview, and subprocessed data.
3. Place the responsive information on a PIPEDA access/recourse hold when section 8(8) applies.
4. Evaluate each retention component and contract restriction; explain the result without promising unconditional deletion.
5. Correct inaccurate personal information where appropriate and sever third-party information when providing access.
6. Delete or irreversibly anonymize portions for which no purpose, legal minimum, contract restriction, or hold remains.
7. Queue deletion across live storage, object versions, OCR text, thumbnails, search indexes, caches, and controlled analytics copies.
8. Make expired data unavailable for ordinary use immediately. Where backup architecture cannot selectively erase an item, encrypt backups, enforce a short documented rotation period, prohibit ordinary restoration, and reapply deletion suppressions before any restore becomes available.
9. Obtain deletion confirmation from subprocessors where DrawFlow instructed processing.
10. Emit a minimized disposal certificate/tombstone and notify the accountable organization.

### E. Tombstone and audit policy

No reviewed primary source requires a general permanent Cost Document deletion tombstone. A tombstone is a product accountability control and must not become a shadow copy of the deleted record.

Recommended linked tombstone fields:

- opaque tenant and record identifiers;
- record class, lifecycle state at disposal, and revision count;
- disposal request/event identifier;
- deletion method and completion timestamps for primary, derived, backup, and subprocessor stages;
- policy identifier/version and non-free-text authority codes;
- approving service or role identifier;
- hold-clearance result; and
- an integrity value only if counsel approves its purpose and period.

Do not retain vendor/customer names, addresses, invoice numbers, descriptions, amounts, filenames, source bytes, OCR text, free-text reasons, or deterministic content hashes by default. An identifier, actor reference, or keyed digest can still be personal information if it remains linkable to an individual or source; treat it as personal information until irreversibly de-identified.

Recommended default for a **linked** disposal tombstone: 24 months after completed disposal, solely to reconcile delayed backup/subprocessor deletion, prevent accidental restoration, and investigate disposal failures. A tenant may configure a longer period only with a documented legal, regulatory, contractual, or appropriate accountability purpose. At expiry, destroy the linkage/key and retain only genuinely anonymous aggregate metrics, if needed.

This 24-month tombstone default is a product recommendation, not the 24-month statutory breach-record rule. A breach record remains a separate class with its own legal basis.

### F. Disposal controls

- two-person approval for privileged compliance purge of Submitted records;
- reason code and authority, not unrestricted sensitive free text;
- append-only disposal job and retry events;
- tenant-scoped cryptographic erasure or standards-based media sanitization;
- explicit coverage of object versions, replicas, search, OCR, previews, caches, and backups;
- documented backup rotation and restore suppression;
- subprocessor deletion attestations;
- downloadable, intelligible audit/export package before disposal when authorized;
- integrity verification before and after export; and
- alerts for missed deadlines, missing triggers, failed deletes, holds nearing review, and restored tombstoned identifiers.

## Confirmed obligations, conditional rules, and policy choices

### Confirmed for an in-scope organization or event

- PIPEDA purpose limitation, accountability for processors, safeguards, access/recourse preservation, and governed disposal.
- The PIPEDA breach-record 24-month minimum.
- The Income Tax Act and Excise Tax Act six-year general rules and their extension/early-disposal exceptions.
- Ontario mortgage brokerage and administrator record periods when the entity and record fall within the respective regulation.
- FINTRAC five-year record-specific rules when the organization and record are in scope.
- Ontario civil discovery obligations once an action exists.

### Conditional and fact-dependent

- whether a particular invoice or receipt is necessary to verify tax;
- whether a construction-draw Cost Document “relates to” a mortgage, renewal, trade, or administration agreement;
- whether FairLend or a tenant is a licensed brokerage/administrator, exempt financial institution, or FINTRAC reporting entity;
- whether a Cost Document forms part of a FINTRAC record;
- whether Construction Act trust-record duties attach to the uploader or tenant;
- which organization controls the personal information; and
- contractual and litigation-hold scope.

### Product-policy recommendations, not legal minimums

- no ordinary-user hard deletion after submission;
- automatic cleanup of never-used Drafts after 30 inactive days and unattached orphan uploads after 24 hours;
- fail-closed purge when a rule or trigger is unresolved, coupled with mandatory escalation;
- latest-of-deadlines computation;
- 24-month linked disposal tombstone;
- two-person privileged purge approval; and
- optional counsel-approved litigation-risk retention rather than a hard-coded 15-year default.

## Open questions for Canadian/Ontario counsel and compliance owners

1. What exact legal roles and licence/exemption statuses do FairLend and each launch tenant hold: brokerage, lender, administrator, financial institution, software processor, or more than one?
2. For construction draws after mortgage closing, which Cost Documents are records “related to” the mortgage, renewal, other transaction, or administration agreement under O. Reg. 188/08 or 189/08?
3. What event constitutes “other expiry of the mortgage transaction” for construction loans that are extended, renewed, discharged, refinanced, accelerated, or defaulted?
4. Is DrawFlow intended to be the authoritative tax record? If yes, does its hosting and backup topology satisfy the Canadian-location requirements, or is Ministerial authorization required?
5. Which party is the taxpayer/GST-HST registrant for each Cost Document, and how will the last related taxation year/year be supplied and corrected?
6. Which FairLend and tenant activities fall within FINTRAC's mortgage administrator, broker, lender, or financial-entity regimes, and which DrawFlow objects are required records?
7. Which loan, servicing, investor, insurer, funding, and data-processing contracts impose longer retention, return, residency, deletion, or audit rights?
8. What events trigger a litigation hold before an Ontario action exists, who can issue/release it, and what counsel-approved limitation-risk period—if any—should be offered as a template?
9. Can the proposed tombstone identifiers, actor references, or integrity values identify an individual or reconstruct linkage, and what maximum is appropriate for each field?
10. What cross-border processing notices, contractual protections, data-location controls, and subprocessor deletion evidence are required for the selected infrastructure?
11. What additional provincial privacy and mortgage rules must be added before DrawFlow serves organizations or individuals outside Ontario?
12. Does any lender or regulator require a non-electronic original despite the general electronic-equivalence rules?

## Primary sources

### Federal privacy

- [Personal Information Protection and Electronic Documents Act](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html)
- [Breach of Security Safeguards Regulations](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2018-64/FullText.html)
- Office of the Privacy Commissioner of Canada, [PIPEDA requirements in brief](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/)
- Office of the Privacy Commissioner of Canada, [Personal Information Retention and Disposal: Principles and Best Practices](https://www.priv.gc.ca/en/privacy-topics/business-privacy/breaches-and-safeguards/safeguarding-personal-information/gd_rd_201406/)
- Office of the Privacy Commissioner of Canada, [PIPEDA Findings #2026-001](https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2026/pipeda-2026-001/)
- Office of the Privacy Commissioner of Canada, [PIPEDA Findings #2026-002](https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2026/pipeda-2026-002/)

### Federal tax and AML

- [Income Tax Act, section 230](https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-230.html)
- [Excise Tax Act, section 286](https://laws-lois.justice.gc.ca/eng/acts/E-15/section-286.html)
- CRA, [Keeping records](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records.html)
- CRA, [Electronic record keeping guidance (IC05-1R1)](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/ic05-1/electronic-record-keeping.html)
- CRA, [Where to keep records, for how long, and early-destruction permission](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/keeping-records/where-keep-your-records-long-request-permission-destroy-them-early.html)
- FINTRAC, [Record keeping requirements for mortgage administrators, brokers and lenders](https://fintrac-canafe.canada.ca/guidance-directives/recordkeeping-document/record/mort-eng.php)
- [Proceeds of Crime (Money Laundering) and Terrorist Financing Regulations](https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/FullText.html)

### Ontario

- [Mortgage Brokerages, Lenders and Administrators Act, 2006](https://www.ontario.ca/laws/statute/06m29)
- [O. Reg. 188/08: Mortgage Brokerages — Standards of Practice](https://www.ontario.ca/laws/regulation/080188)
- [O. Reg. 189/08: Mortgage Administrators — Standards of Practice](https://www.ontario.ca/laws/regulation/080189)
- FSRA, [Keep good records to protect your reputation](https://www.fsrao.ca/industry/mortgage-brokering/compliance-and-other-resources/keep-good-records-protect-your-reputation)
- [Construction Act](https://www.ontario.ca/laws/statute/90c30)
- [Electronic Commerce Act, 2000](https://www.ontario.ca/laws/statute/00e17)
- [Evidence Act](https://www.ontario.ca/laws/statute/90e23)
- [Limitations Act, 2002](https://www.ontario.ca/laws/statute/02l24)
- [Rules of Civil Procedure, Rule 30](https://www.ontario.ca/laws/regulation/900194#BK691)
