# Cost Document file security and recovery controls

**Research date:** 2026-07-28

**Decision scope:** Durable source files attached to DrawFlow Cost Documents

**Status:** Recommended v1 architecture for product and security review

## Verdict

DrawFlow should use Convex File Storage for v1, cap every source file at **20 MiB**, and keep every upload unavailable until server-side validation and malware scanning have completed. Upload and download capability must be granted only after organization-, Build-, role-, and lifecycle-aware authorization. Downloads must be served through an authenticated Convex HTTP action; DrawFlow must not expose `storage.getUrl()` URLs for Cost Documents because those URLs are reusable bearer URLs and can only be revoked by deleting the file.

Convex supplies durable storage primitives, SHA-256 metadata, encryption in transit and at rest, multi-availability-zone replication, scheduled execution, and optional backups that include file storage. It does **not** supply DrawFlow's authorization policy, trusted content detection, size policy, malware verdicts, quarantine state machine, duplicate business rules, orphan reclamation, restore validation, legal holds, or auditable privileged purge. Those are application controls DrawFlow must build and operate.

The 20 MiB limit is deliberate: Convex documents a 20 MiB response limit for HTTP actions, which are its recommended mechanism when every download requires a current authorization check. If a validated product requirement exceeds 20 MiB per source file, migrate the file bytes—not just the download endpoint—to a private object store with short-lived, object-scoped signed URLs; Convex itself recommends its Cloudflare R2 component when expiring URLs are required. Do not weaken access control by falling back to permanent Convex bearer URLs.

## Security boundary and invariants

The protected asset is the immutable original byte sequence uploaded as a Cost Document source file. A preview, thumbnail, or content-disarmed rendering is a derived asset and must never replace the original.

The following invariants apply:

1. Only an authenticated member with permission to add Cost Documents to the target organization and Build can reserve an upload.
2. A stored object is not a Cost Document source file until a one-use upload session claims it and server-side checks bind it to one organization, Build, actor, and Draft.
3. `pending`, `scanning`, `scan_error`, `rejected`, and `quarantined` files are never downloadable by ordinary product users and cannot be submitted with a Cost Document.
4. Only `clean` files can be attached or downloaded. Submission freezes the exact `storageId`, SHA-256 digest, byte length, validated type, and scan attestation.
5. Authorization is evaluated again on every download; possession of a storage ID is never authorization.
6. Deletion and restoration are reconciled against legal holds and a durable purge ledger so a restore cannot resurrect intentionally purged content.
7. Every material transition produces an organization-scoped audit event with actor or service identity, prior and new state, timestamp, reason, and relevant verification metadata.

## What Convex guarantees and what DrawFlow must build

Convex's official documentation supports the platform statements below. An empty cell in the Convex column is not evidence that Convex lacks an internal control; it means the reviewed public documentation does not provide an application-facing guarantee DrawFlow can rely on.

| Control area | Convex primitive or documented guarantee | DrawFlow requirement |
| --- | --- | --- |
| Upload authorization | `storage.generateUploadUrl()` is called from a mutation, so the application can decide who may receive a URL. Generated URLs expire after one hour. Direct uploads have no documented file-size limit, but the POST has a two-minute timeout. [Convex: uploading files](https://docs.convex.dev/file-storage/upload-files) | Authorize tenant, Build, role, Draft state, and quota before creating a one-use upload session. Never log the URL. Rate-limit issuance and finalization. Treat the URL as a bearer capability until expiry. |
| Type validation | `_storage` metadata exposes the client-provided `contentType`; Convex supports all file types. [Convex: metadata](https://docs.convex.dev/file-storage/file-metadata), [Convex: storage overview](https://docs.convex.dev/file-storage/overview) | Do not trust the header. Check extension, declared MIME, magic bytes, and a type-aware parser against an allowlist. Reject disagreement, polyglots, archives, executables, and encrypted/password-protected containers unless a separately reviewed flow is introduced. |
| Size and resource limits | Convex direct uploads are not size-limited by the storage API; authenticated HTTP action responses are capped at 20 MiB. [Convex: uploading files](https://docs.convex.dev/file-storage/upload-files), [Convex: serving files](https://docs.convex.dev/file-storage/serve-files) | Enforce 20 MiB per file and explicit per-session, per-document, per-Build, per-user, and per-organization quotas. Check the trusted `_storage.size` immediately after upload and before scanning. Delete over-limit objects. |
| Hashing and duplicate detection | `_storage` metadata includes a base16 SHA-256 digest and byte size. File GET responses include a standard `Digest` header with SHA-256. [Convex: metadata](https://docs.convex.dev/file-storage/file-metadata), [Convex: storage API](https://docs.convex.dev/api/interfaces/server.StorageWriter) | Persist the server-observed digest and size on the file record. Block an exact same-Build digest outside revision lineage; allow the defined revision path. Hash equality is duplicate evidence, not proof of provenance, safety, or authenticity. |
| Malware and hostile content | No application-level malware or content-safety verdict is documented for Convex File Storage. Convex actions can retrieve a stored file as a `Blob` and call external services. [Convex: storage action API](https://docs.convex.dev/api/interfaces/server.StorageActionWriter), [Convex: actions](https://docs.convex.dev/functions/actions) | Keep new bytes quarantined-by-default. Scan in an isolated service, record engine/signature versions, and fail closed on error, timeout, stale signatures, unsupported content, or limit exhaustion. Create safe derived previews separately. |
| Secure download | New-format storage IDs are identifiers, not direct URLs. `storage.getUrl()` produces a URL usable by anyone who has it, without another authorization check; it cannot be revoked without deleting the file. Convex recommends an authenticated HTTP action for per-request authorization and R2 for expiring URLs. [Convex: storage overview](https://docs.convex.dev/file-storage/overview), [Convex: serving files](https://docs.convex.dev/file-storage/serve-files) | Resolve a DrawFlow file record, re-authorize organization/Build/role/lifecycle access, verify `clean`, fetch by server-held `storageId`, and return the bytes with safe response headers. Never return a Cost Document `getUrl()` URL. |
| Encryption and isolation | Convex states that customer data, including file storage, is encrypted at rest with 256-bit AES; data in transit is encrypted with TLS or SSH; customer databases have unique credentials and production access is limited and audited. [Convex: platform security](https://www.convex.dev/security) | Protect secrets, limit production and dashboard roles, require MFA through the identity/control plane, prevent sensitive values in logs, and contractually verify data location and incident obligations. Application-level or end-to-end encryption is a separate requirement and would conflict with server-side malware/content scanning unless scanning occurs before encryption. |
| Orphan cleanup | Every object is represented in `_storage`, which can be queried; `storage.delete()` removes an object and makes previously generated URLs return 404. Convex supports recurring cron jobs and durable scheduled functions. [Convex: metadata](https://docs.convex.dev/file-storage/file-metadata), [Convex: deleting files](https://docs.convex.dev/file-storage/delete-files), [Convex: cron jobs](https://docs.convex.dev/scheduling/cron-jobs) | Schedule exact cleanup at upload-session expiry and run an independent reconciliation sweep. Delete unclaimed or unattached objects after 24 hours, except objects on hold or referenced by a durable record. Cleanup must be idempotent, paginated, observable, and audited. |
| Backup and restore | Dashboard backups are consistent snapshots; file storage is included only when selected. Manual and daily backups are retained seven days and weekly backups fourteen days. Restore is destructive for table data, does not delete files already present, and adds files missing from the deployment. Code, configuration, environment variables, and pending scheduled functions are excluded. [Convex: backup and restore](https://docs.convex.dev/database/backup-restore) | Enable file-inclusive backups, export recovery copies according to approved RPO/retention, separately protect code/config/secrets/runbooks, test restores, and reconcile file references and hashes before reopening access. Never treat provider durability as backup policy. |
| Integrity verification | Convex exposes SHA-256 metadata and a SHA-256 response digest. Its database state is replicated across physical availability zones, with periodic and incremental backups stored at eleven-nines durability. [Convex: metadata](https://docs.convex.dev/file-storage/file-metadata), [Convex: status and guarantees](https://docs.convex.dev/production/state) | Verify digest and size after upload, during restore, and in scheduled sampling/full scrubs. Alert and quarantine on missing objects, changed metadata, hash mismatch, or a file record/storage record ownership mismatch. |
| Incident recovery | Convex documents destructive restore, a recommended pre-restore backup, and separate recovery of code and environment variables. [Convex: backup and restore](https://docs.convex.dev/database/backup-restore) | Maintain a tested containment and recovery runbook: suspend URL issuance/download, preserve evidence, identify scope, restore into an isolated recovery deployment where possible, replay holds and purge ledger, reconcile, obtain security approval, then reopen. |
| Privileged purge | `storage.delete()` deletes active storage and causes generated URLs to return 404. The public delete documentation makes no claim of immediate erasure from backups or physical media. [Convex: deleting files](https://docs.convex.dev/file-storage/delete-files), [Convex: backup and restore](https://docs.convex.dev/database/backup-restore) | Require legal-hold and retention checks, a reason and case/ticket, step-up authentication, two-person approval, an immutable audit event, deletion verification, backup-expiry tracking, and a non-sensitive tombstone. Get contractual confirmation before claiming erasure beyond active storage. |

## Recommended v1 architecture

### 1. Data model

Create an organization-scoped `costDocumentFiles` record for every claimed upload:

```text
organizationId
buildId
costDocumentId?          // absent until attached to a Draft
uploadSessionId
storageId                // server validated; never an authorization token
originalFilename         // display metadata only; normalized and length-limited
declaredMimeType
detectedMimeType
sizeBytes
sha256
state                    // uploaded_unverified | scanning | clean |
                         // quarantined | rejected | scan_error |
                         // purge_pending | purged
scanEngine
scanEngineVersion
scanSignatureVersion
scannedAt
uploadedBy
uploadedAt
attachedAt?
submittedRevisionId?
quarantineReasonCode?
retentionClass
legalHoldIds[]
purgedAt?
purgedBy?
purgeReasonCode?
```

Maintain a separate `costDocumentUploadSessions` record containing a high-entropy nonce, organization, Build, Draft, actor, expiry, intended type, maximum bytes, and exactly-once claim status. Maintain `costDocumentFileAuditEvents` as append-only product audit history. Send security-relevant events to an external append-only log sink so a database restore cannot erase the only record of a purge or incident.

### 2. Upload and validation sequence

1. **Reserve.** An authenticated fluent-convex mutation resolves the WorkOS identity and current organization membership, checks Build access and Draft mutability, enforces quotas, inserts a 10-minute one-use upload session, and only then calls `generateUploadUrl()`. The underlying Convex URL may remain valid for up to one hour, so it must be handled as a secret bearer capability even after the DrawFlow session expires.
2. **Upload directly.** The browser sends exactly one file. Client-side type and size checks are usability only and never security decisions.
3. **Finalize.** A mutation consumes the session exactly once, reads `_storage` metadata, rejects reused storage IDs, validates creation time is compatible with the session, enforces 20 MiB and quota limits, saves the Convex SHA-256 and size, and records `uploaded_unverified`. Schedule scanning atomically from this mutation so a committed file cannot silently miss its scan job. Convex documents that scheduling from a mutation is atomic with that mutation. [Convex: scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)
4. **Identify content.** A Node action retrieves the `Blob`, computes or independently confirms SHA-256, parses the magic bytes with a maintained library, and verifies a narrow allowlist. Recommended v1 allowlist: PDF, JPEG, and PNG. Treat the filename and uploaded `Content-Type` only as corroborating signals. Reject ZIP and other archives, executable/active web content, malformed documents, and password-protected or encrypted files that cannot be scanned.
5. **Scan.** Stream the file over a private authenticated network connection to an isolated, current ClamAV service. Align `StreamMaxLength` and all decompression/recursion limits with DrawFlow's accepted size; an `INSTREAM size limit exceeded` response is a scan failure, not a clean verdict. ClamAV documents the `INSTREAM` protocol and `freshclam` signature updater. [ClamAV: clamd protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [ClamAV: signature updates](https://docs.clamav.net/manual/Usage/SignatureManagement.html)
6. **Publish or quarantine.** Only an explicit clean verdict with current engine/signature metadata transitions the file to `clean`. Malware, invalid content, and parser failure transition to `quarantined` or `rejected`; transient service errors transition to `scan_error` and retry with bounded exponential backoff. No non-clean state is attachable, submittable, previewable, or downloadable by ordinary users.
7. **Attach.** An authorized mutation attaches the clean file to the Draft. Cost Document submission atomically pins the file record, storage ID, SHA-256, size, validated type, and scan attestation to that revision.

OWASP recommends defense in depth: an extension allowlist, untrusted MIME handling, signature checks, generated storage names, size limits, authorized uploaders, segregated storage, malware/sandbox scanning, and Content Disarm and Reconstruction where applicable. It also warns that third-party public scanning services can leak submitted data. [OWASP: File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)

### 3. Malware quarantine and derived previews

The original object can remain in Convex File Storage because the storage ID is not itself a public URL, but DrawFlow must never mint or expose a `getUrl()` URL for it. Quarantine is therefore an application state enforced at every file-serving and attachment boundary.

Run scanner infrastructure outside the main web process with:

- no public ingress;
- no application or database credentials beyond a narrowly scoped scan callback;
- bounded CPU, memory, recursion, archive expansion, and time;
- current supported engine versions and automatically refreshed signatures;
- health checks that fail closed when engine or signature age breaches policy;
- result authentication, idempotency keys, and duplicate-safe callbacks;
- metrics for queue age, verdicts, errors, retries, engine version, and signature age.

For PDFs and images, generate previews only after the original is clean. Render in a sandbox with network access disabled and output a new inert image/PDF asset. A content-disarmed preview improves viewing safety but does not modify or replace the evidentiary original.

### 4. Duplicate detection

Use `(organizationId, buildId, sha256, sizeBytes)` as the exact duplicate key. On finalization:

- block a matching file already attached to a Cost Document in the same Build unless the operation is an explicit revision lineage action;
- return the existing record identifier without exposing unauthorized metadata;
- permit the same bytes in another Build only under that Build's independent authorization and policy;
- keep malware and quarantine decisions keyed by the immutable digest so rescanning can be targeted when signatures change, but never infer that a previously clean digest remains clean forever.

The duplicate decision must run in a mutation with an indexed lookup and a reservation record so concurrent finalizations cannot both win. Never use the original filename as identity.

### 5. Download path

Expose an application route based on the DrawFlow file record ID, not the storage ID:

```text
GET /api/cost-document-files/{fileRecordId}/download
```

The authenticated HTTP action must:

1. authenticate the caller and resolve current organization membership;
2. load the file record and its Build/Cost Document relationship;
3. authorize the caller's role and segmented access;
4. require `state === "clean"` and enforce lifecycle/hold/incident restrictions;
5. fetch the blob through `ctx.storage.get(storageId)`;
6. compare observed length/digest metadata to the pinned record;
7. return `Content-Disposition: attachment` with a sanitized display filename, the validated `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, and a restrictive content security policy where applicable;
8. emit an access audit event without recording URL secrets or file content.

If files larger than 20 MiB become mandatory, use a private R2 bucket and mint a short-lived, single-object, single-operation GET URL only after the same authorization. Cloudflare documents that R2 presigned URLs are bearer tokens, can be scoped to one operation/object, and can expire from one second to seven days; DrawFlow should use approximately 60 seconds and never a public bucket. [Cloudflare R2: presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

### 6. Orphan cleanup

Use two independent mechanisms:

- **Exact cleanup:** schedule session expiry from the reservation mutation. If no claimed file record exists, delete any known uploaded object and mark the session expired.
- **Reconciliation sweep:** at least hourly, paginate `_storage` and application file records. Delete objects older than 24 hours with no live upload session, file record, revision pin, quarantine investigation, legal hold, or purge workflow. Mark records whose objects are missing and page security/operations.

Deletion must be idempotent. Race safety requires a final mutation to re-check all references and holds immediately before `storage.delete()`. Emit counts and identifiers to observability, alert on backlog/age thresholds, and test the sweep against uploads finalizing at the cutoff.

### 7. Backup, restoration, and integrity

Convex's platform durability does not replace a recovery program. NIST SP 800-53 Rev. 5 CP-9 requires protecting backup confidentiality, integrity, and availability, and SI-7 requires integrity verification and defined action when unauthorized change is detected. [NIST SP 800-53 Rev. 5](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)

Required operating posture:

- use a Convex plan that supports periodic backups and explicitly enable **file storage inclusion**;
- take daily file-inclusive backups at minimum; select a longer approved export cadence and retention once RPO/RTO and legal retention are established;
- keep source code, deployment configuration, WorkOS configuration, scanner configuration, secrets recovery procedures, and the purge ledger outside the Convex backup because Convex backups exclude code, configuration, environment variables, and pending scheduled functions;
- encrypt exported backups, restrict them to a separate recovery role, log every create/read/delete/restore action, and store at least one recovery copy outside the production administrative blast radius;
- inventory each backup by timestamp, scope, file inclusion, checksum, encryption key version, retention expiry, and restore-test status;
- run a quarterly restore exercise and after any material schema/storage change.

Restore procedure:

1. declare an incident/recovery case and suspend Cost Document uploads, downloads, and purge execution;
2. preserve logs and take a new file-inclusive backup before any destructive restore;
3. restore to an isolated recovery deployment when feasible and deploy the known-good code/config separately;
4. replay the current external legal-hold and purge ledgers before enabling any file access;
5. enumerate every Cost Document file reference and verify object existence, size, SHA-256, ownership scope, state, revision pin, and scan attestation;
6. re-scan restored originals if the incident involved malware, scanner compromise, or stale signatures;
7. obtain security and product approval against the documented RPO/RTO, then restore or cut over production;
8. monitor reconciliation, access denials, and missing/mismatched objects; retain the recovery report and lessons learned.

Convex warns that restore replaces table data, leaves pre-existing files in place, uploads backup files that are missing, and excludes code/environment configuration. This makes post-restore reconciliation and purge-ledger replay mandatory, not optional. [Convex: backup and restore](https://docs.convex.dev/database/backup-restore)

### 8. Incident behavior

Follow the lifecycle in NIST SP 800-61 Rev. 3: prepare across the organization, detect, respond, recover, and feed lessons back into risk management. [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final)

| Failure or incident | Required behavior |
| --- | --- |
| Upload interrupted or client never finalizes | Leave unavailable; exact expiry plus reconciliation deletes after 24 hours. |
| Size/type/hash validation fails | Mark rejected, emit audit event, delete active bytes unless preservation is required for a security investigation, and return a non-sensitive reason to the user. |
| Scanner unavailable, times out, or reaches a limit | Fail closed as `scan_error`; retry idempotently. Alert when queue age or retry budget is exceeded. Never promote on timeout. |
| Malware detected | Quarantine, deny all ordinary access, preserve only under the incident evidence policy, revoke any accidentally issued access by deleting/re-uploading as necessary, notify security, and inspect same-digest and temporally adjacent uploads. |
| Digest/size mismatch | Treat as an integrity incident. Stop serving the object, preserve metadata and logs, identify affected revisions/backups, and recover only from a verified copy. |
| Authorization defect or URL leak | Disable affected download/URL issuance paths, revoke sessions, delete and re-upload any file whose permanent Convex URL escaped if continued service is required, review access logs, notify incident owners, and rotate related credentials. |
| Accidental active-object deletion | Keep record unavailable, recover from a file-inclusive verified backup, re-run integrity checks and malware scan, and preserve the same logical revision linkage. |
| Corrupt or malicious deployment state | Freeze mutations, preserve a pre-restore backup, restore known-good data and separately deploy known-good code/config, replay holds/purges, reconcile, then reopen under approval. |
| Backup missing, expired, or fails validation | Declare recovery-objective breach, do not silently accept partial recovery, preserve evidence, escalate, and execute the approved business-continuity path. |

### 9. Privileged purge

NIST SP 800-88 Rev. 2 defines media sanitization as rendering access to target data infeasible for a specified level of effort and requires a risk-based sanitization program. A Convex `storage.delete()` plus observed 404 proves removal from active application storage; it does not by itself prove erasure from provider backups or underlying physical media. [NIST SP 800-88 Rev. 2](https://csrc.nist.gov/pubs/sp/800/88/r2/final)

Implement purge as a state machine, never a direct dashboard or ad hoc mutation:

```text
requested -> policy_checked -> approved -> active_deleted
          -> deletion_verified -> backup_expiry_pending -> complete
```

Required controls:

- only a dedicated compliance role may request; the requester cannot be the sole approver;
- step-up authentication, two-person approval, structured reason, case/ticket, scope preview, and legal-hold/retention evaluation;
- atomic transition to `purge_pending` before external deletion so ordinary downloads stop immediately;
- delete the active storage object, then verify `_storage` metadata is absent and any known URL returns 404;
- retain only a non-sensitive tombstone and append-only audit event. Avoid retaining the original filename or raw digest if the purge objective covers identifying metadata; use an access-controlled keyed fingerprint only if legal/security approves the need to prevent resurrection;
- export the purge event to the external purge ledger before marking complete;
- track every backup that can contain the object until it expires or is sanitized under the provider contract;
- on every restore, replay the external purge ledger before access and delete any resurrected object;
- document that “active storage deleted” and “all recoverable copies sanitized” are separate completion milestones.

Bucket/object retention locks can prevent premature deletion but can also prevent a legally required purge. If DrawFlow later adopts R2, prefix and duration design must reconcile legal holds, normal retention, and exceptional purge before enabling locks. Cloudflare documents that the strictest R2 bucket lock applies and takes precedence over lifecycle deletion. [Cloudflare R2: bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

## Audit events and minimum evidence

Generate append-only events for:

- upload session issued, expired, consumed, or denied;
- upload finalized, rejected, orphaned, or deleted;
- MIME/signature/parser verdict;
- scan queued, started, retried, clean, quarantined, or failed, including engine/signature versions;
- duplicate blocked or revision-lineage exception applied;
- file attached, detached from a Draft, or pinned to a submitted revision;
- download allowed or denied, with actor, organization, Build, role, and policy reason;
- integrity check pass/fail and restore reconciliation;
- legal hold placed/released;
- purge requested, policy-checked, approved, active-deleted, verified, backup-expired, or failed;
- backup created, exported, expired, restoration started/completed, and recovery approval.

Do not put original bytes, signed/upload URLs, authentication tokens, malware samples, or unnecessary personal data into logs. Audit records need synchronized timestamps, durable actor/service identity, prior/new state, object and revision identifiers, reason codes, correlation/case IDs, and tamper-evident external retention. OWASP's logging vocabulary specifically models upload validation and deletion events. [OWASP: Logging Vocabulary](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html)

## Verification and acceptance tests

The implementation is not complete until automated tests prove:

1. unauthenticated, cross-organization, wrong-Build, wrong-role, and revoked-member upload/download attempts fail;
2. the same upload session and storage ID cannot be claimed twice;
3. spoofed MIME, double extension, malformed signature, polyglot fixture, archive, executable, password-protected PDF, empty file, exactly-at-limit file, and over-limit file follow the defined policy;
4. EICAR and scanner limit/timeout/unavailable fixtures never become `clean`;
5. a clean file cannot be substituted after its digest is pinned;
6. concurrent identical uploads produce one accepted same-Build digest outside revision lineage;
7. ordinary users cannot obtain a native Convex URL or access any non-clean state;
8. download headers prevent inline active-content execution and cache retention;
9. the 24-hour orphan sweep does not race a finalization or delete held/referenced content;
10. deletion makes active content inaccessible and leaves the required tombstone/audit event;
11. a file-inclusive backup restore recovers a deleted test object, then reconciliation verifies digest and scan state;
12. replaying the purge ledger after restoring an older backup prevents purged content from reappearing;
13. backup, scanner, cleanup, and integrity-monitor failures alert within the approved operational threshold.

Use benign synthetic fixtures only. EICAR is an antivirus test file, not malware, but it must still be handled as sensitive test data and never introduced into production. [EICAR: Anti-Malware Testfile](https://www.eicar.org/download-anti-malware-testfile/?lang=en)

## Unresolved choices requiring owner approval

These decisions do not change the architecture, but must be fixed in policy/configuration before production:

1. **RPO, RTO, and backup retention:** select business-approved targets and confirm that Convex's native seven-/fourteen-day windows plus exported copies satisfy them.
2. **Jurisdictional retention and deletion:** resolve the separate Cost Document retention research, legal-hold authority, and whether any law requires erasure from provider backups before normal expiry.
3. **Provider contract:** obtain written confirmation of Convex backup deletion, subprocessor/data residency, incident notification, support-assisted recovery, and physical-media sanitization semantics before making external compliance claims.
4. **Allowed types:** approve the v1 PDF/JPEG/PNG allowlist or document the business case and parser/scanner/CDR controls for HEIC, TIFF, Office, email, or archive formats.
5. **Malware service:** approve self-hosted ClamAV versus a contracted private scanning vendor, including availability target, data residency, retention, signature freshness, and false-positive escalation.
6. **Content Disarm and Reconstruction:** decide whether generated PDF/image previews require CDR in addition to sandboxed rendering; originals remain immutable either way.
7. **Large files:** validate whether 20 MiB is sufficient. If not, approve private R2 storage and short-lived signed URLs as a coherent migration rather than mixing permanent Convex URLs into the access model.
8. **Break-glass and two-person roles:** name the compliance/security roles allowed to quarantine, inspect malware evidence, restore, and purge.
9. **Integrity cadence:** set the full-versus-sampled scrub schedule and alert threshold based on object count, cost, and recovery objectives.
10. **Tombstone identifier:** determine whether a keyed digest may remain after purge or whether only an opaque purge ID can be retained.

## Decision record

Adopt the Convex-native 20 MiB architecture for v1 with:

- authenticated upload reservation and exact-once finalization;
- server-observed metadata plus independent content identification;
- quarantine-by-default malware scanning;
- immutable originals and separately generated safe previews;
- same-Build SHA-256 duplicate enforcement with explicit revision lineage;
- authenticated HTTP-action downloads and no Cost Document `getUrl()` exposure;
- 24-hour orphan reclamation;
- file-inclusive backups, external recovery artifacts, quarterly restore drills, and digest reconciliation;
- incident containment and purge-ledger replay before restored content becomes accessible;
- two-person, legal-hold-aware privileged purge with separate active-deletion and backup-sanitization milestones.

This posture preserves Cost Documents as durable, auditable evidence without pretending that storage primitives alone provide application security or recoverability.

## Primary sources

- Convex, [Uploading and Storing Files](https://docs.convex.dev/file-storage/upload-files)
- Convex, [File Storage security model](https://docs.convex.dev/file-storage/overview)
- Convex, [Serving Files](https://docs.convex.dev/file-storage/serve-files)
- Convex, [Accessing File Metadata](https://docs.convex.dev/file-storage/file-metadata)
- Convex, [Deleting Files](https://docs.convex.dev/file-storage/delete-files)
- Convex, [StorageActionWriter API](https://docs.convex.dev/api/interfaces/server.StorageActionWriter)
- Convex, [StorageWriter API](https://docs.convex.dev/api/interfaces/server.StorageWriter)
- Convex, [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions)
- Convex, [Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs)
- Convex, [Backup & Restore](https://docs.convex.dev/database/backup-restore)
- Convex, [Status and Guarantees](https://docs.convex.dev/production/state)
- Convex, [Platform Security](https://www.convex.dev/security)
- OWASP, [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- OWASP, [Logging Vocabulary Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html)
- NIST, [SP 800-53 Rev. 5, Security and Privacy Controls](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
- NIST, [SP 800-61 Rev. 3, Incident Response Recommendations](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
- NIST, [SP 800-88 Rev. 2, Guidelines for Media Sanitization](https://csrc.nist.gov/pubs/sp/800/88/r2/final)
- ClamAV, [clamd Protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- ClamAV, [Updating Signature Databases](https://docs.clamav.net/manual/Usage/SignatureManagement.html)
- EICAR, [Anti-Malware Testfile](https://www.eicar.org/download-anti-malware-testfile/?lang=en)
- Cloudflare, [R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- Cloudflare, [R2 Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
