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
