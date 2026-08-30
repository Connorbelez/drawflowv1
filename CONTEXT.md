# DrawFlow

DrawFlow is the shared construction draw-management context for planning, evidencing, reviewing, and reimbursing organization-scoped Builds.

## Build Participation

**Build Participant**:
An authenticated person granted an explicit role and access boundary on one Build. Ending participation removes future access without erasing the person's historical actions.
_Avoid_: Tenant-wide user access

**Homeowner**:
A Build Participant representing a property owner for that Build, distinct from Builder ownership or staff membership. The same person may hold both Homeowner and Builder capacities, but each capacity grants its own permissions.
_Avoid_: Builder alias, unauthenticated guest

## Identity and Lender Organizations

**WorkOS Organization**:
The external identity boundary that owns a user's organization membership, WorkOS roles, and organization-wide access. In DrawFlow, one WorkOS Organization backs one Brokerage; it is not a Lender Organization.
_Avoid_: Lender Organization, lender group

**Brokerage**:
The DrawFlow tenant represented by one WorkOS Organization. Brokerage-wide membership and authority come from WorkOS, while one Brokerage may contain multiple application-level Lender Organizations.
_Avoid_: Lender Organization, lender team

**Lender**:
A WorkOS user carrying the literal `lender` role in a Brokerage. The role identifies the lender persona and grants access to lender workflows, but does not assign a Lender Organization or grant Brokerage administration.
_Avoid_: Lender Organization member, Brokerage administrator

**Brokerage Administrator**:
A WorkOS user carrying the `admin` role in a Brokerage. A user may be both a Brokerage Administrator and a Lender when the user carries both WorkOS roles; those authorities remain separate.
_Avoid_: Lender administrator, lender manager

**Lender Organization**:
An application-level group of registered Lenders within one Brokerage. It provides the product boundary for lender-specific assignments and permissions and is never provisioned or represented as a WorkOS Organization.
_Avoid_: WorkOS Organization, lender tenant

**Lender Organization Membership**:
The application-level relationship between one Lender and one Lender Organization within that Lender's Brokerage. A Lender has at most one active Lender Organization Membership per Brokerage; a Lender without one is unassigned.
_Avoid_: WorkOS membership, Brokerage membership

**Registered Lender**:
A Lender with an active Lender Organization Membership. Registration determines the lender's application-level group, not the user's Brokerage-wide WorkOS authority.
_Avoid_: WorkOS Organization member, Brokerage administrator

**Unassigned Lender**:
A Lender with no active Lender Organization Membership in the current Brokerage. The user remains a recognized WorkOS lender but has no Lender Organization-specific scope.
_Avoid_: Missing WorkOS user, inactive lender

**Lender Organization Permission**:
Application-level authority scoped to one Lender Organization. It may distinguish one registered Lender from another within that group but cannot grant or change Brokerage-wide WorkOS authority.
_Avoid_: WorkOS role, Brokerage permission

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
A single competitive solicitation for a defined Build scope and response schema, sent privately to one or more Contractors or Suppliers. Its scope mode is Labour, Material, or Combined; its recipients and responses are visible only to authorized internal Build participants.
_Avoid_: Bid marketplace, public tender

**Quote Lifecycle Ownership**:
The Quote Round owns solicitation-wide lifecycle and policy, each Quote Invitation owns one recipient's delivery and access lifecycle, and each Quote Response owns that recipient's Draft and immutable submission-revision lifecycle. Counts and labels such as submitted, drafting, revoked, or expired recipients are derived operational projections and never replace or implicitly mutate those authoritative states.
_Avoid_: One shared status field, response count as Round state, one recipient transition mutating every invitation

**Quote Round Lifecycle State**:
The authoritative four-state machine for a Quote Round: `draft` is editable and unsent; `open` begins when the initial Package Revision, deadline, active Invitations, and credentials are created atomically; `closed` is enforced at the deadline or by authorized early closure; and `cancelled` is terminal. A Closed Round returns to Open only through a new Package Revision, future deadline, and recipient notice. Draft, Open, or Closed may transition to Cancelled. Dispatch progress, delivery failures, response counts, and scheduler lag are projections and never weaken deadline enforcement or become Round states.
_Avoid_: Sent boolean, dispatching as Round state, delivery failure as Round failure, reopen toggle, scheduler-dependent deadline

**Labour Quote Round**:
A Quote Round whose scope contains one or more Sub-milestones and whose recipients are Contractors. Its atomic scope may span parent Milestones and non-contiguous dates within one frozen Build roadmap, while preserving each Sub-milestone's own pricing line and schedule window.
_Avoid_: Material scope, Combined Quote Round

**Material Quote Round**:
A Quote Round whose scope contains planned materials and whose recipients are Suppliers. Its atomic scope may span Sub-milestones, Milestones, and delivery windows within one frozen Build roadmap while preserving each requested material's quantity, unit, specification, location, and delivery window as a normalized pricing line.
_Avoid_: Labour scope, Combined Quote Round

**Combined Quote Round**:
A Quote Round whose atomic scope contains distinct Labour and Material pricing sections within one immutable Quote Package Revision. Every recipient receives and must address the same complete combined package; combining the sections never collapses their specialized line-item, schedule, quantity, unit, specification, or delivery semantics.
_Avoid_: Two loosely linked rounds, recipient-specific scope, merged untyped pricing lines

**Quote Package Revision**:
An immutable, recipient-visible snapshot of the permit, timeline dates, location, scope, specifications, attachments, and response schema published for a Quote Round. Material changes produce a new revision rather than silently changing what recipients were asked to price.
_Avoid_: Live Build view, mutable quote package

**Quote Package Revision Boundary**:
After a Quote Round is sent, any change to recipient-visible scope, permit, site address or map, schedule dates, specifications, attachments, response fields, or response deadline publishes a new immutable Quote Package Revision to every active recipient. Internal notes, reminders, operational status, and Preferred Quote tracking do not revise the package.
_Avoid_: In-place commercial edit, recipient-specific revision, revision for internal metadata

**Quote Response Deadline**:
The hard Quote Round-wide cutoff after which no active recipient may create or change a Draft, submit or revise a Quote Response, or withdraw a submission. Magic-link access remains read-only until its separate Access Window expires. Accepting further responses requires a new Quote Package Revision with an extended deadline for every active recipient, preserving the original cutoff and extension in audit history.
_Avoid_: Soft deadline, recipient-specific late submission, unaudited grace period, access expiry as submission deadline

**Quote Response Draft Start**:
The first meaningful recipient edit to an answer, line item, amount, or comment for a Quote Invitation and current Quote Package Revision. That edit creates the single autosaved Draft. Opening the magic link records invitation access only; navigation, focus, blur, and other empty interactions do not create a Draft, so "Not started" remains a derived status until substantive response data exists.
_Avoid_: Draft on link open, empty Draft, access treated as response progress, focus event as draft creation

**Canonical Quote Response Draft**:
The single server-authoritative mutable Draft for one Quote Invitation and one Quote Package Revision. Every valid magic-link session and any optional claimed contractor account resumes that same Draft. Autosaves use optimistic versioning; a stale concurrent write cannot silently replace newer data and instead produces an explicit recoverable conflict while preserving the unsaved local input.
_Avoid_: Duplicate Draft, forked response, session-local authoritative draft, blind last-write-wins

**Quote Response Draft Visibility**:
The recipient-private boundary around unsubmitted Draft content. Internal quote-management users may see only derived progress metadata such as Not started or Drafting, last-saved time, and Package Revision; they cannot inspect Draft line items, amounts, answers, or comments. Deadline or early closure makes the Draft read-only and visibly Not submitted without entering comparison or affecting totals. The recipient may view it until access expiry, and a reopened Round may seed compatible content under Package Revision acknowledgement rules.
_Avoid_: Internal draft preview, abandoned draft as response, automatic deadline submission, draft amount in comparison

**Quote Round Closure**:
The Round-wide transition that ends response writes at the configured deadline or earlier through an authorized Builder or Builder Staff action with confirmation and a required reason. Closure immediately makes every active invitation read-only. A Closed Round reopens only through a new Quote Package Revision with a future deadline and notice to every active recipient; a Cancelled Round is terminal and never reopens.
_Avoid_: Per-recipient closure, reversible close toggle, silent reopening, reopening a cancellation

**Quote Round Cancellation**:
The terminal aggregate-level abandonment of a Draft, Open, or Closed Quote Round by an authorized internal operator after explicit confirmation and a required reason. Cancellation immediately blocks recipient access and response writes, ends active credentials and browser sessions, removes submissions from current comparison, and clears Preferred while preserving every Invitation's original participation, delivery, access, package, Draft, submission, withdrawal, and audit history. It does not bulk-relabel Invitations as revoked. Internal access remains read-only, and continuing procurement requires a new Quote Round. Cancelling an unsent Draft has no recipient-side effects.
_Avoid_: Bulk invitation revocation, destructive cancellation, cancelled-round reopening, recipient-visible unsent cancellation

**Quote Response Revision Transition**:
Publishing a new Quote Package Revision preserves every prior Draft and submitted Quote Response against its original revision as immutable history. The current revision may seed a new Draft with structurally compatible answers, but the recipient must acknowledge the revision, review every changed or added field, and explicitly resubmit; the previous submission is visibly superseded.
_Avoid_: Silent response migration, destructive draft reset, old submission treated as current

**Quote Response Submission Revision**:
An immutable recipient-submitted version of a Quote Response against one Quote Package Revision. Before the deadline, the recipient may seed a new autosaved Draft from the latest submission, but that prior submission remains the authoritative current quote until an explicit resubmission creates a new immutable version and visibly supersedes it; abandoning the Draft changes nothing.
_Avoid_: In-place submitted edit, autosave replacing a submission, abandoned Draft superseding a quote

**Quote Response Withdrawal**:
The recipient-owned, pre-deadline removal of the current submitted Quote Response from active comparison through explicit confirmation and an optional explanation. Withdrawal is an immutable event rather than deletion, makes the submission ineligible to remain Preferred, and may be followed by a new submission before the deadline. Internal participants cannot withdraw for the recipient; they revoke the Quote Invitation instead.
_Avoid_: Deleted submission, internal withdrawal on behalf, post-deadline withdrawal, revocation as withdrawal

**Quote Round Cancellation Boundary**:
A sent Quote Round is cancelled with its history preserved, and a new round is created, when its procurement identity changes: Labour, Material, or Combined scope mode; Build; frozen roadmap baseline; abandonment of the original scope; or a round sent in error. Ordinary recipient-visible changes publish a revision; removing a wrong or withdrawn recipient revokes only that Quote Invitation.
_Avoid_: Destructive deletion, cancellation for an ordinary revision, whole-round cancellation for one recipient

**Quote Package Site Disclosure**:
Every Quote Package Revision discloses the exact Build site address and an embedded map to every invited recipient, including a recipient introduced through a never-before-seen email. The send confirmation previews this disclosure, and the immutable revision records exactly which address and location data was shared.
_Avoid_: Approximate location, hidden post-send disclosure, unaudited location change

**Quote Package Planning Disclosure**:
Every Quote Package Revision automatically includes the complete Build permit and every recipient-shareable specification, detail, and attachment inherited from its selected Sub-milestones. Each Sub-milestone's Scope of Work remains the canonical rich-text TipTap document: package publication preserves and recipient surfaces faithfully render its headings, paragraphs, ordered and unordered lists, emphasis, links, line breaks, and supported embedded content rather than flattening it into plain text or a lossy excerpt. The sender cannot remove required inherited context; explicitly internal or private content remains excluded, and any unclassified attachment blocks sending until its visibility is resolved.
_Avoid_: Curated partial scope, leaked internal note, ambiguous attachment visibility

**Atomic Quote Package**:
A Quote Package Revision whose complete scope is identical for every recipient and must be addressed line by line. A recipient may explicitly mark a line Unable to Quote with a reason, producing a visibly partial response, but cannot silently omit or alter scope.
_Avoid_: Recipient-specific scope, silent omission

**Quote Round Composer**:
The route-addressable, mobile-responsive workflow launched from a Build Proposal or active Build Workspace to select compatible scope, confirm the frozen Quote Package Revision, select recipients, configure the response form, and review private invitations before sending. Labour, Material, and Combined Quote Rounds share this composer while preserving their specialized scope and response fields.
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

**Labour Quote Recipient**:
A Contractor contact identified by a valid email, including an address that has never touched DrawFlow and has no partner-network membership or Build assignment. Sending to a new address provisions the minimum provisional Contractor identity needed to own its private Quote Invitation without requiring WorkOS registration.
_Avoid_: Partner-only recipient, assignment-required recipient

**Material Quote Recipient**:
A Supplier contact identified by a valid email, including an address that has never touched DrawFlow and has no partner-network membership or prior supplier relationship. Sending to a new address provisions the minimum provisional Supplier identity needed to own its private Quote Invitation without requiring WorkOS registration.
_Avoid_: Partner-only supplier, known-supplier-only invitation

**Quote Recipient Capabilities**:
One underlying company or email identity may hold both Contractor and Supplier capabilities and may receive Labour, Material, or Combined Quote Invitations. A Combined Quote Invitation requires the recipient to address the complete atomic package while preserving separate Labour and Material response sections; dual capability never merges the two schemas or rewrites historical provenance.
_Avoid_: Duplicate identities per capability, recipient-specific combined scope, merged response schema

**Provisional Quote Recipient Profile**:
A Brokerage-scoped Contractor or Supplier identity created when no active exact normalized-email match exists for an invitation's capability. An exact match is reused within that Brokerage, dual capability attaches without duplicating the person, and profiles or history never auto-merge across Brokerages.
_Avoid_: Global recipient profile, cross-tenant match, fuzzy auto-merge

**Quote Issuer Identity**:
The legal business or individual name a recipient must confirm before submitting its first Quote Response. A valid email alone is sufficient to send an invitation, optional contact details may enrich the provisional profile, and entering issuer details does not establish authenticated account ownership.
_Avoid_: Email-derived name, mandatory company name at send, form entry as account claim

**Optional Quote Recipient Account Claim**:
A non-blocking post-submission path for a magic-link recipient to create or link a WorkOS account to its Brokerage-scoped profile. It is never required to inspect, draft, or submit a quote and never changes an existing Quote Response.
_Avoid_: Login-gated quote, pre-submit signup interruption, claim as response mutation

**Claimed Quote Recipient**:
A WorkOS-backed owner of a Brokerage-scoped Quote Recipient Profile with authenticated access only to that profile's own Quote Invitations and Responses. Claiming does not establish partner-network status, a Build assignment, or full Contractor or Supplier workspace authority.
_Avoid_: Automatic partner enrollment, quote claim as onboarding approval, Build-wide access

**Quote Recipient Account Link**:
The ownership relationship between a WorkOS user and a Provisional Quote Recipient Profile, created automatically only when their verified normalized emails match exactly and neither side has another in-Brokerage account link; linking adds authenticated access without ending active Magic Links. Any mismatch, duplicate, or existing link requires a backoffice identity review without changing the profile or Quote Response.
_Avoid_: Bearer-link ownership, fuzzy account match, automatic profile merge

**Cross-Brokerage Quote Recipient Identity**:
One WorkOS user may own separate Contractor or Supplier profiles in multiple Brokerages, with ownership and authorization always resolved by Brokerage and user together. Profiles, capabilities, invitations, responses, and history remain isolated across those Brokerage boundaries.
_Avoid_: Global profile lookup, cross-Brokerage history, globally merged recipient

**Quote Recipient Profile Merge**:
The backoffice-approved alias relationship from a provisional or duplicate recipient profile to a canonical in-Brokerage profile. Historical invitation email, issuer identity, ownership, and response provenance remain unchanged, while approved account access and future targeting resolve through the canonical profile.
_Avoid_: Rewritten response ownership, deleted source profile, unaudited merge

**Quote Invitation**:
One recipient's private invitation to participate in a Quote Round. It has its own access lifecycle and cannot expose other recipients or their responses.
_Avoid_: Shared quote link

**Quote Invitation Lifecycle Dimensions**:
The independent state machines attached to one Quote Invitation: participation is `active` until the terminal `revoked` transition; each delivery attempt is an append-only record progressing through queued, accepted, delivered, bounced, or failed outcomes; and each Access Generation is active, expired, rotated, or revoked. Delivery failure never revokes participation or invalidates access, Access Window expiry preserves the Invitation rather than revoking it, and link opens are telemetry events rather than lifecycle states.
_Avoid_: One invitation status field, bounce as revocation, open as response progress, expiry as revocation

**Quote Invitation Revocation**:
The terminal, authorized removal of one recipient's participation after explicit confirmation and a required internal reason. Revocation immediately ends every credential and browser session, blocks recipient reads and writes, removes the active submission from current comparison, and clears any Preferred Quote marker while preserving all delivery, access, Draft, submission, and withdrawal history. The recipient sees only the generic unavailable state. Reinviting the same recipient creates a new Quote Invitation without transferring response data.
_Avoid_: Reversible revocation, deleted history, disclosed internal reason, response transfer to replacement invitation

**Quote Invitation Magic Link**:
A recipient-specific, reusable bearer credential that grants access only to one Quote Invitation without requiring WorkOS. Its expiry is time-configurable, and opening it never consumes or invalidates the credential.
_Avoid_: Single-use token, first-open expiry, shared round link, required login

**Quote Invitation Access Window**:
The Quote Round-level interval during which every recipient's Magic Link remains usable, ending at a configured expiry no earlier than the response deadline and no later than 90 days after send. It defaults to seven days after the response deadline; after the deadline and before expiry, invitation access is read-only.
_Avoid_: Per-recipient deadline, unlimited bearer access, expiry before response deadline

**Quote Invitation Access Renewal**:
An operator-approved restoration of passwordless access after the Access Window has ended, creating a new Access Generation and fresh credentials for active recipients. It never reactivates an expired credential; only a pre-expiry extension changes the current window.
_Avoid_: Automatic renewal, revived expired link, silent access extension

**Quote Invitation Access Generation**:
The set of simultaneously valid Magic Link credentials and browser sessions for one Quote Invitation. A reminder adds a credential without ending the generation; rotation ends the generation and starts a replacement, while revocation ends it without replacement.
_Avoid_: Reminder as rotation, partial security reset, package revision for access control

**Quote Invitation Browser Session**:
A single-browser access lease for one Quote Invitation, refreshed by active use for up to 24 hours of inactivity and never beyond the Access Window. Expiry, rotation, or revocation ends it immediately.
_Avoid_: Link-lifetime browser session, cross-invitation session, session surviving revocation

**Quote Invitation Recipient Correction**:
The replacement of a misaddressed Quote Invitation by revoking it and creating a new invitation for the corrected email within the same Quote Round. The original access and response history remains quarantined for audit, and no Draft or submission transfers to the replacement recipient.
_Avoid_: Editable sent recipient, response reassignment, deleted misaddressed history

**Quote Invitation Access Failure**:
An unavailable Magic Link state that reveals no Build or quote content: a valid expired credential may show only expiry, the issuing Builder or Brokerage, and an operator-approved fresh-access request. Revoked, rotated, malformed, and unknown credentials share one generic unavailable state.
_Avoid_: Automatic expiry bypass, revocation disclosure, expired quote preview

**External Quote Response**:
The single mobile-first, magic-link route used by a Contractor or Supplier to inspect the invitation's permit, location map, dates, bundled scope, specifications, attachments, and Quote Package Revision before completing the configured response form, required line items, and required rich-text additional comments. Autosaved Draft, expired, revoked, revision-acknowledgement, submitted-confirmation, and optional post-submit WorkOS account-claim experiences are states of this surface.
_Avoid_: Login-gated quoting, separate supplier portal, one screen per invitation state

**Quote Response**:
One recipient's private, autosaved response to a Quote Invitation and a specific Quote Package Revision, including the configured answers, line items, and additional comments.
_Avoid_: Public bid

**Quote Response Aggregate**:
The response history composed from zero or one Canonical Quote Response Draft, append-only immutable Submission Revisions, an optional pointer to the currently active Submission Revision, and append-only withdrawal events. A submission promotes the Draft into a new immutable revision and clears that Draft; starting a revision creates another Draft without displacing the active submission. Not started, Drafting, Submitted, Submitted with revision in progress, Withdrawn, Withdrawn with new draft in progress, and Read-only are derived interface projections rather than one mutable status enum. Round closure blocks writes without rewriting response history.
_Avoid_: Mutable response status as source of truth, submission overwritten by Draft, closure status mutation, flattened response history

**Quote Response Submission Boundary**:
The server-authoritative atomic transition that promotes the current Draft into an immutable Submission Revision. It requires an active Invitation and valid access, an effectively Open Round, server receipt strictly before the deadline, the current acknowledged Package Revision, the current Draft version, valid required fields and permanent escape-hatch fields, and a canonical total recomputed from submitted line items. One transaction creates and activates the Submission Revision and clears the Draft. A client idempotency key makes duplicate taps and retries return the same accepted revision, including after a lost network response.
_Avoid_: Client-clock deadline, partial submission, trusted client total, stale Draft submission, duplicate retry revision

**Preferred Quote**:
The exact current, non-withdrawn immutable Submission Revision from an active Quote Invitation that the internal project team currently favours for a Quote Round. At most one may be selected while the Round is Open or Closed. Resubmission, withdrawal, Invitation revocation, Package Revision supersession, or Round cancellation clears the marker with an audit reason rather than silently migrating it. It is informational internal tracking only: selection or clearing never notifies the recipient, awards work, forms a contract or purchase order, changes the approved Budget or Construction Roadmap, authorizes payment, or triggers another workflow.
_Avoid_: Floating recipient-level preference, winner, awarded quote, accepted quote, automatic preference migration

## Build Financing

**Financing Package**:
The collection of Proposed Loans selected to finance one Build Proposal, or the Loans created from them for the resulting active Build. Each member retains its own terms, availability, balance, interest, repayment, security, and documents.
_Avoid_: Blended loan, single Build-wide interest rate

**Loan Product**:
A reusable Brokerage-owned or Lender Organization-owned configuration of permitted funding, revolving, repayment, interest, and security behaviour. It does not contain a Build-specific interest rate, principal, credit limit, term, lender selection, collateral assignment, or lien position.
_Avoid_: Loan offer, booked Loan, fixed interest rate

**Brokerage Loan Product**:
A Loan Product owned by and available throughout one Brokerage.
_Avoid_: Global product, Lender Organization product

**Lender Loan Product**:
A Loan Product owned by one Lender Organization and offered only when that Lender Organization is selected for the Build Proposal.
_Avoid_: Brokerage-wide product, WorkOS-owned product

**Loan Product Publication**:
The release of an immutable Loan Product Version for new selection. Brokerage Administrators publish Brokerage Loan Products, while a Registered Lender with the required Lender Organization Permission publishes its organization's products; the Brokerage may suspend tenant visibility with an audited reason without changing existing Proposed Loans or Loans.
_Avoid_: Mutable product edit, per-product Brokerage approval

**Loan Product Version**:
An immutable revision of a Loan Product whose behaviour and permitted overrides are snapshotted into a Proposed Loan and retained by the resulting Loan. Publishing a later version never changes existing Proposed Loans or Loans.
_Avoid_: Mutable product reference, silent term update

**Loan Product Lifecycle**:
The catalog state machine `draft → published → retired`. A published version is immutable; a change creates a new draft version. Retiring a version prevents new selection but never changes a Proposed Loan or Loan that already carries its snapshot.
_Avoid_: Editing a published version, deleting a used product, retroactive product change

**Loan Product Configuration**:
The shared role-aware operator workflow for Brokerage and Lender Organization catalogs, organized by identity and ownership, funding availability, revolving behaviour, repayment, interest, security, permitted Loan-level overrides, and validity. A schedule preview may use temporary example rate, amount, dates, and term, but those inputs are not saved as product defaults unless explicitly configured as defaults.
_Avoid_: Separate product models by owner, hidden policy combination, saved preview assumptions

**Proposed Loan**:
A Build Proposal's planned financing instrument with selected product version, proposed terms, selected lender when applicable, and supporting Loan Documents. It is not a booked contractual obligation and becomes a Loan only through proposal closing.
_Avoid_: Active Loan, informal capital event

**Proposed Loan Lifecycle**:
The financing-selection state machine `draft → proposed → selected_for_closing → converted`, with `withdrawn` available before conversion. Commitment attachment, term completeness, and document completeness are derived readiness facts rather than lifecycle states, and only a Proposed Loan selected for closing becomes a Loan.
_Avoid_: Verified commitment state, document-driven lifecycle

**Financing Template Recommendation**:
An optional Build Template recommendation for financing categories or currently selectable Loan Products. The template-selection workflow must ask the operator to confirm the lender, Loan Product Version, principal or limit, interest rate, and term before creating draft Proposed Loans. A template never silently binds a lender or preserves a retired product version for new selection.
_Avoid_: Automatic Loan creation, hidden lender binding, retired product selection

**Proposed Loan Editing Authority**:
Before the Financing Approval Cutoff, the Builder and Back Office may add and edit Proposed Loans. The Primary Construction Lender may inspect them, attach its Loan Documents, request changes, and approve the Build Proposal but may not directly rewrite proposed terms. A secondary Loan Lender remains strictly read-only when explicitly shared. Product administrators manage their catalogs but gain no Build financing edit authority through that role.
_Avoid_: Lender-authored borrower terms, product-admin Build access, post-cutoff edit

**Financing Approval Cutoff**:
The earliest Primary Construction Lender or Back Office approval of a Build Proposal, which freezes the Financing Package composition and Proposed Loan terms. A secondary Loan Lender's read-only activity never triggers the cutoff. No Proposed Loan may be added, removed, or changed after this cutoff, and an active Build cannot add another Loan.
_Avoid_: Active-Build Loan Addition, financing edit after approval

**Synthetic Financing Approval Cutoff**:
The immutable cutoff created during migration for an already approved or active Build, using its earliest known approval or activation timestamp. Migration is the only path that may establish Loans for an already active Build; it does not reopen financing configuration.
_Avoid_: Editable migrated financing, current-time cutoff, general active-Build Loan addition

**Loan**:
The active Build-linked representation of a booked contractual financing obligation created from an accepted Proposed Loan at proposal closing. DrawFlow uses it for planning and collaboration but does not claim to be the authoritative servicing, compliance, or accounting record.
_Avoid_: Proposed Loan, authoritative LMS account

**Loan Document**:
A canonical Document attached to a Proposed Loan or Loan, such as a commitment, contract, statement, or supporting financing record. It retains explicit type, visibility, provenance, and effective date; attachment preserves its owning financing instrument without making DrawFlow the authoritative contractual repository.
_Avoid_: Generic Build attachment, separate Loan file store, canonical loan terms

**Loan Document Visibility**:
The explicit audience on each Loan Document: Brokerage internal, Build financing participants, Primary Construction Lender, or the specific Loan Lender. A secondary Loan Lender can see only documents explicitly shared with its organization.
_Avoid_: Inherited Build-wide visibility, all-lender access, implicit sensitive-document sharing

**Proposed Loan Share**:
An explicit, narrow, read-only grant allowing a non-primary Loan Lender to inspect one Proposed Loan and its permitted Loan Documents before closing. The recipient cannot approve, acknowledge, upload, comment, or mutate anything. Selecting the lender or its Loan Product does not create this grant, and the share never exposes the Build Proposal packet or Build Workspace.
_Avoid_: Automatic lender exposure, secondary-lender approval, Build participation

**Primary Construction Lender**:
The one selected Lender Organization, if any, that participates in Build Proposal review and the active Build's construction-draw operations. This operational assignment is separate from the lender counterparty on any individual Proposed Loan or Loan.
_Avoid_: Every financing provider, Loan Product owner

**Loan Lender**:
The lender counterparty for one Proposed Loan or Loan. A Loan Lender that is not the Primary Construction Lender may view its own active Loans and a limited reference to the associated Build but does not become a Build Participant or receive Build operational access.
_Avoid_: Primary Construction Lender, automatic Build Participant

**Lender Loan Portfolio**:
The Lender Organization-scoped view of active Loans for which that organization is the Loan Lender. It may show the associated Build's name, identifier, property address, status, and Primary Construction Lender, but it does not expose Build budgets, milestones, evidence, working-capital information, other Loans, or the Build Workspace.
_Avoid_: Lender Build access, Brokerage-wide financing package

**Build Loans Workspace**:
The canonical Loans tab shared by Build Proposal and active Build detail. Before the Financing Approval Cutoff it presents the Financing Package, cash from scheduled upfront proceeds, Available Credit, Unlocked Draw Capacity, Proposed Loan terms, schedules, collateral, and Loan Documents with authorized configuration actions. After closing it preserves immutable contractual configuration while allowing authorized document attachment, external activity recording, reconciliation, permitted rate-schedule entries, and scheduled-versus-posted variance review.
_Avoid_: Separate proposal and active Loan models, active-Build Loan addition, editable closed terms

**Build Financing Timeline Lanes**:
The separate timeline projections for cash on hand, each on-demand Loan's Available Credit, and the single reimbursement-gated Loan's Unlocked Draw Capacity. A funding event transfers value between a capacity lane and cash; neither form of unused capacity counts as cash or silently covers a shortfall.
_Avoid_: Total available capital as cash, blended credit pool, implicit borrowing

**Loan Transaction**:
An append-only record of a Loan's financial activity, such as an advance, upfront disbursement, repayment, interest accrual, interest capitalization, or correcting reversal. Outstanding principal, accrued interest, available credit, and repayment totals are derived from these records rather than directly edited balances.
_Avoid_: Mutable balance, overwritten payment

**Loan Transaction Status**:
A posted or reversed state only. Entry and import commands validate before posting, forecasts remain Loan Schedule Events, and corrections link reversing and replacement transactions rather than introducing draft or pending financial records.
_Avoid_: Draft transaction, pending balance effect, edited posting

**External Transaction Identity**:
The unique combination of Loan, source system, and external transaction reference used to make imports idempotent. Replaying the same source record returns the existing result instead of creating another Loan Transaction.
_Avoid_: Import retry duplication, filename identity, amount-and-date matching

**Loan Schedule Event**:
The single event lineage for a forecast financing activity and its eventual posting. Before the Financing Approval Cutoff, its proposed date and amount may change; approval freezes the scheduled event, closing carries it into the Loan schedule, and an actual Loan Transaction links to it when posted. Variance remains visible, and cancellation requires an audited reason rather than deletion. DrawFlow does not maintain parallel planned and actual financing aggregates.
_Avoid_: Duplicate forecast and actual events, overwritten schedule, mutable posted event

**Timeline Event Ordering**:
The deterministic sequence of financing receipts, transfers, payments, fees, and Build expenses within each date. Funds may finance a later event on the same date only after the funding event has occurred; the engine preserves this order even when the interface displays date-level precision.
_Avoid_: Unordered same-day netting, spending before receipt, implicit timestamp

**Approved Schedule Variance**:
The difference between an immutable approved Loan Schedule Event and its linked actual Loan Transaction or changed Build timing. Build delays never rewrite the approved schedule. A contractual rescheduling requires a Loan Amendment, while temporary what-if results are not saved as a second financing plan.
_Avoid_: Schedule rewrite, parallel approved and actual plans, persisted what-if schedule

**Closing Loan Schedule**:
The complete repayment and interest forecast generated when a Proposed Loan is selected for closing and frozen at approval. An on-demand Loan uses its confirmed Credit Advance Schedule Events to project balances and payments; actual activity later links to this schedule and exposes variance.
_Avoid_: Schedule generated after funding, mutable approved forecast, implicit LOC advances

**Loan Product Lender Binding**:
A Lender Loan Product fixes its owning Lender Organization as the Loan Lender. A Brokerage Loan Product requires an explicit Loan Lender selection. Selecting the Primary Construction Lender makes that organization's products available for selection but does not select a product or make another Loan Lender a Build Participant.
_Avoid_: Product owner inferred after closing, automatic product selection, lender access through product ownership

**External Balance Snapshot**:
A dated, source-attributed lender or servicing-system statement of a Loan's balances used to reconcile DrawFlow's transaction-derived projection. A discrepancy remains visible and never silently replaces the Loan Transaction history.
_Avoid_: Balance overwrite, authoritative DrawFlow balance

**External Loan Activity Recording**:
The Back Office entry or import of Loan activity that occurred outside DrawFlow, with source, external reference, effective date, and supporting Loan Document. Construction Draw advances remain system-created from canonical Draw release. Lenders cannot enter transactions in the initial release.
_Avoid_: Unattributed manual balance, lender-authored transaction, duplicate construction advance

**Backdated Loan Activity Recalculation**:
The deterministic recomputation of Daily Interest Accrual from a late activity's effective date. Unposted calculations are regenerated, while already posted interest is corrected through linked reversal and replacement Loan Transactions rather than silent mutation.
_Avoid_: Current-date posting for old activity, overwritten accrual, unexplained balance adjustment

**External Capacity Exception**:
The visible reconciliation exception created when a source-attributed external advance occurred outside the Loan's recorded limit or availability dates. DrawFlow preserves the fact without silently increasing capacity; system-created advances remain blocked.
_Avoid_: Rejecting external fact, automatic limit increase, ordinary over-limit advance

**Excess Payment Exception**:
The reconciliation record for source-attributed payment value beyond known fees, interest, and principal. DrawFlow allocates only to known balances and does not introduce a servicing-style suspense account.
_Avoid_: Negative principal, hidden overpayment, suspense-account subsystem

**Loan Rate Schedule**:
The immutable effective-dated history of a Loan's actual interest rate. A fixed-rate Loan has one entry, while a variable-rate Loan may add later entries with optional reference-index and spread context and source provenance.
_Avoid_: Loan Product rate, edited current rate

**Variable Rate Projection**:
The use of the currently effective Loan Rate Schedule entry for future interest unless an operator records an explicit future forecast rate. The initial release does not retrieve reference-index rates automatically; actual changes are source-attributed manual entries or future imports.
_Avoid_: Assumed index feed, hidden forward curve, retroactive rate edit

**Loan Amendment**:
An append-only, effective-dated record created by Back Office when an externally agreed post-closing contract change must be represented. It preserves the prior and new values, reason, actor, and source Loan Document. It cannot introduce another Loan or retrospectively rewrite posted Loan Transactions.
_Avoid_: Editing the Loan snapshot, silent contract change, transaction rewrite

**Loan Monetary Precision**:
The use of integer minor units for posted CAD principal, cash, fee, and payment amounts and higher decimal precision for principal segmentation and interest calculation. Amounts round half-up only when posted, and the final scheduled payment absorbs any residual cent.
_Avoid_: Floating-point money, daily cent rounding, unexplained final residual

**Loan Effective Date**:
A Brokerage-local calendar date used for disbursement, accrual, payment, and timeline ordering. Audit timestamps remain UTC, but UTC conversion never shifts the contractual effective date; the Brokerage timezone and holiday calendar govern schedule behavior.
_Avoid_: UTC-derived due date, browser-local Loan date, timezone-dependent accrual

**Funding Availability Policy**:
The Loan Product rule that makes funds available upfront, on demand within a credit limit, or through reimbursement-gated construction draws.
_Avoid_: Loan type, repayment schedule

**Available Credit**:
The unadvanced portion of an on-demand Loan's credit limit from its effective availability date. It is a Loan-specific funding pool and does not count as cash on hand until advanced.
_Avoid_: Cash on hand, Unlocked Draw Capacity

**Credit Advance Schedule Event**:
The approved plan to transfer a dated amount from one on-demand Loan's Available Credit into Build cash. Builder or Back Office may propose it before the Financing Approval Cutoff; the actual advance Loan Transaction later links to it and preserves any amount or date variance.
_Avoid_: Available credit as cash, automatic advance, unlinked HELOC deployment

**Unlocked Draw Capacity**:
The reimbursement-gated amount currently eligible for release from a construction Loan. It remains separate from Available Credit and cash on hand until a canonical Draw is released.
_Avoid_: Available Credit, released cash

**Upfront Loan Proceeds**:
The net proceeds of an upfront-funded Loan that become cash on hand only on the effective disbursement date. Fees withheld at funding reduce the cash received while the gross principal and fee effects remain explicit Loan Transactions.
_Avoid_: Loan approval amount, available credit, gross proceeds as cash

**Construction Draw Loan Posting**:
The Loan Transaction created from a canonical construction Draw when that Draw is released. The Draw retains approval and release lifecycle ownership, while the linked posting supplies the Loan ledger effect.
_Avoid_: Duplicate Loan draw, independent disbursement approval

**Construction Loan Capacity Gate**:
The release-time requirement that the canonical construction Draw fit within the reimbursement-gated Loan's limit, availability dates, and Unlocked Draw Capacity. Ordinary release is blocked until a valid Loan Amendment supplies capacity; a later external exception never retroactively authorizes the Draw.
_Avoid_: Over-limit release override, post-release capacity fiction, disconnected Draw and Loan validation

**Reimbursement-Gated Loan Exclusivity**:
A Build may contain exactly one reimbursement-gated Loan. Every released canonical construction Draw posts one advance transaction to that Loan; a Draw is never allocated across multiple Loans. The same Financing Package may also contain upfront-funded and on-demand Loans.
_Avoid_: Multiple construction draw facilities, Draw Funding Allocation, split Draw posting

**Debt Service Cash Event**:
A principal payment, interest payment, or financing fee that reduces projected or recorded Build cash on hand on its applicable date.
_Avoid_: Non-cash accrual, ignored financing cost

**Loan Fee Policy**:
The Loan Product definition of permitted origination, annual, commitment, transaction, or other fee rules and defaults, with the Proposed Loan snapshotting the actual negotiated amounts or rates. Each fee explicitly states whether it is withheld from proceeds, paid from cash, financed into principal, or deducted from an advance; financing a fee requires product permission.
_Avoid_: Hidden netting, implicit financed fee, product rate mistaken for negotiated fee

**Revolving Policy**:
The Loan Product rule that determines whether posted principal repayments replenish available borrowing capacity, subject to the credit limit, expiry, and any freeze. Interest and fee payments never replenish capacity, and reimbursement-gated Loans are non-replenishing.
_Avoid_: Funding availability, payment frequency

**Interest Calculation Policy**:
The Loan Product rules for calculating interest on actual outstanding principal across effective-dated principal and rate segments. Actual/365 Fixed is the default day-count convention; Actual/Actual, Actual/360, and 30/360 may be configured. Calculations retain high precision and round only when an accrual or payment is posted. Undrawn Available Credit and unreleased Unlocked Draw Capacity never accrue interest.
_Avoid_: Interest on approved limits, implicit day count, daily rounding

**Interest Accrual Boundary**:
The effective-date rule under which advanced or released principal begins accruing on its funding date and repaid principal stops accruing from its repayment date. Ordered, end-exclusive principal segments prevent the same amount from being charged twice for one day.
_Avoid_: Approval-date accrual, duplicate boundary day, interest before release

**Daily Interest Accrual**:
The immutable high-precision calculation detail for one Loan and accrual date. Daily detail is retained even when several days are grouped into one later interest posting.
_Avoid_: Monthly estimate without daily basis, rounded running balance, mutable accrual result

**Interest Posting Policy**:
The Loan Product rule that posts accumulated Daily Interest Accrual to the Loan daily, monthly, or at another configured interval. Daily calculation and daily posting are the safe defaults; posting frequency is independent from capitalization and payment frequency.
_Avoid_: Posting frequency as compounding, payment-driven accrual, discarded daily detail

**Interest Capitalization Policy**:
The explicit Loan Product permission and schedule for converting accrued unpaid interest into principal: never, daily, monthly, quarterly, annually, at maturity, or through a manual contractual event. Capitalization creates a Loan Transaction, changes principal without changing cash, and cannot include planned interest or fees unless a separate explicit fee rule permits financing.
_Avoid_: Automatic compounding, cash expense on capitalization, unposted-interest capitalization

**Repayment Allocation**:
The breakdown of a payment among fees, interest, and principal. DrawFlow preserves an explicit source allocation when one is supplied; otherwise it applies the snapshotted Loan Product waterfall, whose default is fees, then interest, then principal. Corrections use reversing and replacement Loan Transactions rather than editing a posted allocation.
_Avoid_: Principal-only payment, mutable allocation, unexplained waterfall

**Repayment Structure**:
The Loan Product rule that defines amortizing repayment, periodic interest with a principal balloon, or a single payment at maturity.
_Avoid_: Interest calculation frequency, Loan category

**Amortization Method**:
The method for an amortizing Loan's principal schedule: fixed total payment or fixed principal. It operates independently from payment frequency and day-count convention.
_Avoid_: Amortization as Loan category, implicit payment method, interest-only schedule

**Payment Frequency**:
The Loan Product interval for scheduled payments: weekly, biweekly, semi-monthly, monthly, quarterly, annually, or maturity-only where the Repayment Structure permits it.
_Avoid_: Interest posting frequency, capitalization interval, ambiguous twice-monthly schedule

**Business Day Convention**:
The rule for moving a scheduled due date that falls on a non-business day: unadjusted, following, or modified following, using the Brokerage's applicable holiday calendar. Interest continues to accrue by calendar day according to the Loan's day-count convention.
_Avoid_: Weekend-only calendar, shifted accrual basis, implicit due-date movement

**Interest-Only Repayment**:
A Repayment Structure in which interest becomes due at the configured payment frequency and all principal becomes due as a balloon at maturity.
_Avoid_: Single-payment repayment, interest capitalization

**Single-Payment Repayment**:
A Repayment Structure in which principal and unpaid interest become due at maturity. Any capitalization of unpaid interest is governed separately by the Loan's capitalization policy.
_Avoid_: Interest-only repayment, automatic compounding

**Loan Security**:
The Proposed Loan or Loan's secured or unsecured status and any assigned collateral property. The collateral property may differ from the Build property.
_Avoid_: Build location, Loan category

**Property**:
A Brokerage-scoped identity for real property that may be the Build site, collateral for one or more Loans, or both. Its existence in DrawFlow records planning identity and does not represent title verification.
_Avoid_: Build-only address, verified title record

**Collateral Assignment**:
The Loan-specific use of a Property as security, preserving the address, declared value, valuation date and source, ownership description, and Lien Position used for that financing decision.
_Avoid_: Property ownership proof, mutable shared valuation

**Collateral Conflict Warning**:
A non-blocking warning when reused Property collateral has duplicate declared lien positions, inconsistent valuations, or conflicting encumbrance information. DrawFlow preserves each source-attributed Collateral Assignment but does not claim title-registry authority.
_Avoid_: Authoritative lien validation, automatic assignment rejection, shared mutable valuation

**Lien Position**:
The priority of a property-secured Proposed Loan or Loan against its assigned collateral, expressed as first, second, third, or a higher numeric position.
_Avoid_: Mortgage type, repayment priority

**Loan Category**:
A reporting and discovery label such as construction, home equity, mortgage, or bridge that does not determine funding, revolving, repayment, interest, or security behaviour.
_Avoid_: Exclusive Loan type, behaviour policy

**Loan Product Validity Rules**:
The constraints that prevent contradictory policy combinations: upfront funding is non-revolving; on-demand funding may be revolving or non-revolving; reimbursement-gated funding is non-revolving; property-secured products require collateral and a Lien Position; amortizing products require a term and payment frequency; interest-only products require maturity, payment frequency, and a principal balloon; single-payment products require maturity; and capitalization must be explicitly permitted.
_Avoid_: Invalid policy bundle, implicit capitalization, label-driven validation

**Financing Plan Feasibility**:
The requirement that ordered Build timeline events never produce negative cash, exceed a Loan's Available Credit or Unlocked Draw Capacity, lack cash for a payment or fee, or occur outside the Loan's availability or maturity dates. Unused capacity never silently resolves a failure.
_Avoid_: End-date-only balance check, automatic borrowing, capacity overrun

**Credit Advance Optimization**:
The Draw Plan optimizer's ability to propose Credit Advance Schedule Events that prevent cash shortfalls and reduce projected interest. An operator must confirm the proposed events before approval, and optimization never creates an actual Loan Transaction.
_Avoid_: Automatic HELOC draw, optimizer-posted transaction, invisible borrowing

**Interest Cash Treatment**:
The rule that interest affects cash only through an interest payment or withholding from proceeds. Accrual alone does not reduce cash, capitalization changes principal without changing cash, and payment from another Loan requires separate explicit advance and payment events.
_Avoid_: Accrual as cash expense, capitalization as payment, implicit cross-Loan funding

**Build Financing Currency**:
The single currency shared by a Build and every Proposed Loan and Loan in its Financing Package. The initial supported currency is CAD; mixed-currency Financing Packages are not permitted.
_Avoid_: Per-Loan Build currency, implicit exchange rate

**Loan Lifecycle Independence**:
The rule that completing or closing a Build does not close its Loans. Each Loan remains in its Loan Lender's portfolio until its own closure is recorded and retains a limited reference to the completed Build.
_Avoid_: Build completion as Loan payoff, orphaned Loan

**Loan Lifecycle**:
The deliberately limited planning lifecycle `pending_disbursement → active → closed`. Closing records one source-attributed reason: paid off, refinanced, cancelled before funding, written off, or transferred externally. DrawFlow does not own delinquency, collections, covenant compliance, or regulatory servicing status; it may preserve a source-attributed attention note without presenting that note as authoritative servicing state.
_Avoid_: Servicing workflow, compliance status machine, Build-driven Loan closure

**Refinance Reference**:
The documentation and external identifier retained when a Loan closes as refinanced. Because the Financing Package is already frozen, the replacement obligation is not added as another Loan on the active Build.
_Avoid_: Post-cutoff replacement Loan, silent payoff, active-Build refinancing package

**Proposed Loan Closing Readiness**:
The validation required before selection for closing: selectable Loan Product Version, Loan Lender, Build Financing Currency, principal or credit limit, actual rate and rate structure, availability and maturity dates, valid repayment and interest policies, required collateral and Lien Position, a feasible Build financing timeline, and compliance with Reimbursement-Gated Loan Exclusivity. Commitments and other Loan Documents remain visible readiness facts unless Brokerage policy makes a document type mandatory.
_Avoid_: Document-driven lifecycle, incomplete closing snapshot, invalid financing package

**Legacy Financing Migration**:
The clean conversion of an existing construction `loanFacility` into the Build's reimbursement-gated Loan and an existing fully cash-funded `homeEquityTakeout` into an upfront-funded Loan on its original event date. Migration preserves lender, limits, released principal, Draw links, calculated values, source identifiers, and provenance; new HELOC products use on-demand availability instead of inheriting the legacy cash behavior.
_Avoid_: Compatibility shadow model, HELOC semantic rewrite, lost legacy provenance
