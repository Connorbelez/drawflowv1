# DrawFlow

DrawFlow is the shared construction draw-management context for planning, evidencing, reviewing, and reimbursing organization-scoped Builds.

## Build Participation

**Build Participant**:
An authenticated person granted an explicit role and access boundary on one Build. Ending participation removes future access without erasing the person's historical actions.
_Avoid_: Tenant-wide user access

**Homeowner**:
A Build Participant representing a property owner for that Build, distinct from Builder ownership or staff membership. The same person may hold both Homeowner and Builder capacities, but each capacity grants its own permissions.
_Avoid_: Builder alias, unauthenticated guest

## Cost Evidence

**Costs Workspace**:
The canonical Build-scoped interface for finding, comparing, allocating, reviewing, revising, voiding, and exporting Cost Documents. Milestone and Evidence Package surfaces may launch or reference Cost Documents but do not own duplicate management interfaces.
_Avoid_: Evidence-tab ownership, disconnected invoice page

**Cost Document Detail**:
The route-addressable interface for one Cost Document's source files, immutable facts, allocations, review lanes, revision lineage, audit history, and permitted actions.
_Avoid_: List-row expansion as the only detail

**Cost Document Capture**:
The focused interface for source-file intake, metadata, financial reconciliation, allocation, duplicate handling, Draft collaboration, and submission. Proposal import and preselected Sub-milestone entry are modes of this same surface.
_Avoid_: Separate upload screen per entry point

**Contractor Cost Document Surface**:
The scope-limited Invoices & Receipts region inside the existing Contractor Build workspace. It reuses Cost Document Capture and Cost Document Detail, permits submission only against Qualifying Contractor Assignments, and does not introduce a contractor-wide Costs Workspace or top-level costs route.
_Avoid_: Parallel contractor invoice system, cross-Build contractor costs dashboard

**Cost Document**:
A durable, active-Build Invoice or Receipt record with a title, description, vendor or merchant snapshot, document date, Gross Document Total, Cost Document Currency, source files, and Cost Allocations. It is editable while in Draft and becomes an immutable source record when Submitted.
_Avoid_: Generic attachment, proof of payment

**Proposal Cost Attachment Import**:
An explicit conversion of a Proposal supporting file into an active-Build Cost Document Draft while preserving its original file provenance and Proposal reference. The attachment has no Cost Document semantics until the imported Draft passes full submission validation.
_Avoid_: Automatic proposal Cost Document

**Cost Document Source File**:
One immutable file or ordered page belonging to the Invoice or Receipt represented by a Cost Document. Unrelated supporting material is a separate Evidence Asset.
_Avoid_: Supporting attachment

**Cost Document Submitter**:
The authenticated Build Participant or Contractor who actually submits a Cost Document under an active capacity and permitted Sub-milestone scope. Submission preserves that identity and capacity; another role cannot silently submit as that person.
_Avoid_: Impersonated uploader, generic system user

**Cost Document Draft Collaborator**:
An authenticated Builder owner or Builder Staff member explicitly granted access to another participant's Cost Document Draft on the same Build. Collaboration never obscures which person performed each change and ends when the document is Submitted.
_Avoid_: Automatic organization-wide draft access

**Submitted Cost Document Visibility**:
Build-scoped access that gives active Builder and Homeowner participants full project-cost transparency, gives authorized brokerage roles access within their operational scope, and limits Contractors to their own submitted records and feedback. Platform content access is break-glass only.
_Avoid_: Storage-link access, assignment-overlap visibility

**Cost Document File Access**:
A request-time authorization to preview, download, or export a specific Cost Document Revision under the actor's current organization, Build, capacity, and assignment scope. Bulk export is a separate capability with a stated purpose and immutable manifest.
_Avoid_: Reusable bearer URL, implied bulk access

**Qualifying Contractor Assignment**:
An active Contractor assignment covering every Sub-milestone targeted by a Cost Document action. Normal assignment completion preserves read access to the Contractor's submitted records, while a reasoned security or policy revocation ends that access.
_Avoid_: Historical assignment as write authority

**Cost Allocation**:
The portion of a Cost Document's total attributed to a specific Sub-milestone. All Cost Allocations for a Cost Document must sum exactly to the document total.
_Avoid_: Tag, loose association

**Gross Document Total**:
The strictly positive final tax-inclusive amount payable or paid on a Cost Document after fees and discounts. Optional subtotal, tax, fee, and discount components must reconcile exactly to this amount.
_Avoid_: Pre-tax total, estimated total

**Cost Document Currency**:
The ISO currency inherited from the Build and shared by the Gross Document Total and every Cost Allocation. The initial supported currency is CAD; mixed-currency allocation is not permitted.
_Avoid_: Per-allocation currency, implicit currency

**Cost Document Revision**:
A Submitted Cost Document that corrects and supersedes an earlier Submitted Cost Document while preserving the complete lineage. The superseded record remains retained and readable.
_Avoid_: Edited invoice, overwritten receipt

**Cost Document Correction Authority**:
Permission to create a provenance-preserving replacement revision or reasoned void without editing the submitted source record. The correcting actor is always recorded and cannot impersonate the original Submitter.
_Avoid_: In-place correction, submitter impersonation

**Voided Cost Document**:
A Submitted Cost Document explicitly excluded from current use with a mandatory reason. Voiding preserves the source record and is not deletion.
_Avoid_: Deleted document

**Cost Document Annotation**:
Mutable internal context such as notes, review state, or classification tags associated with a Cost Document without changing its immutable source facts.
_Avoid_: Source data correction

**Cost Document Lifecycle**:
The source-record state of a Cost Document: Draft, Submitted, Superseded, or Voided. Lifecycle state is independent of review opinion.
_Avoid_: Review status

**Builder Review**:
The Builder-side assessment of a Submitted Cost Document as Unreviewed, Accepted as Supporting Context, More Information Requested, Replacement Requested, Disputed, or Not Relevant.
_Avoid_: Brokerage decision, payment verification

**Brokerage Review**:
The brokerage-side assessment of a Submitted Cost Document using the same review vocabulary as Builder Review. It governs brokerage attention only and does not verify payment, completion, reimbursement, or draw authorization.
_Avoid_: Draw approval, universal review state

**Cost Document Attention State**:
A derived signal that presents Builder Review and Brokerage Review together and highlights unresolved requests or disagreement without erasing either assessment.
_Avoid_: Single current review truth

**Cost Document Duplicate Signal**:
A same-Build integrity check based on an exact source-file match or a normalized business fingerprint. Exact matches block independent duplication outside revision lineage; fingerprint matches require an auditable acknowledgement and reason but do not prohibit submission.
_Avoid_: Cross-organization duplicate search

**Cost Document Evidence Reference**:
An explicit reference from an Evidence Package to a specific Submitted Cost Document Revision and its applicable Cost Allocation snapshot. It supplies financial context without proving payment, completion, reimbursement eligibility, or satisfaction of an evidence requirement.
_Avoid_: Automatic evidence package, payment verification

**Cost Document Retention Policy**:
The organization or lender rule governing when Submitted Cost Document content may be purged after applicable holds and obligations are satisfied. An absent policy retains content rather than permitting deletion.
_Avoid_: User-controlled deletion, assumed retention period

**Cost Document Tombstone**:
A non-sensitive record proving that a privileged, reasoned compliance purge occurred without retaining the purged source content.
_Avoid_: Deleted without trace

## Quote Solicitation

**Quote Round**:
A single competitive solicitation for a defined Build scope and response schema, sent privately to one or more Contractors or Suppliers. Its recipients and responses are visible only to authorized internal Build participants.
_Avoid_: Bid marketplace, public tender

**Labour Quote Round**:
A Quote Round whose scope contains one or more Sub-milestones and whose recipients are Contractors.
_Avoid_: Material quote, mixed quote

**Material Quote Round**:
A Quote Round whose scope contains planned materials and whose recipients are Suppliers.
_Avoid_: Labour quote, mixed quote

**Quote Package Revision**:
An immutable, recipient-visible snapshot of the permit, timeline dates, location, scope, specifications, attachments, and response schema published for a Quote Round. Material changes produce a new revision rather than silently changing what recipients were asked to price.
_Avoid_: Live Build view, mutable quote package

**Quote Round Composer**:
The route-addressable, mobile-responsive workflow launched from a Build Proposal or active Build Workspace to select compatible scope, confirm the frozen Quote Package Revision, select recipients, configure the response form, and review private invitations before sending. Labour and Material Quote Rounds share this composer with specialized fields and can never be mixed.
_Avoid_: Quote-send modal, separate labour and material composers

**Quote Requests Workspace**:
The Build-scoped internal operations index for finding and managing Quote Rounds, including filters, deadlines, invitation and response status, reminders, and attention states. It lives in the Build Workspace Quotes tab and does not contain the full response-comparison experience.
_Avoid_: Cross-Build inbox as the only quote view, inline comparison overload

**Quote Round Detail and Comparison**:
The route-addressable internal surface for inspecting a Quote Round's frozen scope, recipients, revision history, responses, normalized line items, and side-by-side comparisons, and for setting or clearing the reversible Preferred Quote marker.
_Avoid_: Award workflow, contract acceptance, budget or timeline mutation

**Quote Operations Authority**:
Builder owners and Builder Staff may create, send, revise, remind, close, compare, and set or clear the Preferred Quote. Homeowners may view Quote Requests and comparisons without solicitation or preference controls. Backoffice roles have read and audit visibility only. Contractors and Suppliers remain isolated to their own invitation and response.
_Avoid_: Homeowner solicitation controls, backoffice bid selection, recipient competitor visibility

**Quote Invitation**:
One recipient's private invitation to participate in a Quote Round. It has its own access lifecycle and cannot expose other recipients or their responses.
_Avoid_: Shared quote link

**External Quote Response**:
The single mobile-first, magic-link route used by a Contractor or Supplier to inspect the invitation's permit, location map, dates, bundled scope, specifications, attachments, and Quote Package Revision before completing the configured response form, required line items, and required rich-text additional comments. Autosaved Draft, expired, revoked, revision-acknowledgement, submitted-confirmation, and optional post-submit WorkOS account-claim experiences are states of this surface.
_Avoid_: Login-gated quoting, separate supplier portal, one screen per invitation state

**Quote Response**:
One recipient's private, autosaved response to a Quote Invitation and a specific Quote Package Revision, including the configured answers, line items, and additional comments.
_Avoid_: Public bid

**Preferred Quote**:
The Quote Response currently favoured by the internal project team for a Quote Round. It is an informational comparison marker only and does not award work, form a contract or purchase order, change the approved Budget or Construction Roadmap, authorize payment, or trigger another workflow.
_Avoid_: Winner, awarded quote, accepted quote
