# Evidence Site Visit Screen PRD

**Product:** DrawFlow  
**Surface:** Tokenized Evidence Site Visit Screen  
**Route:** `/backoffice/builds/:buildId/newsitevisit/:siteVisitToken`  
**Document type:** Product Requirements Document  
**Status:** Redesign input draft  
**Last updated:** May 20, 2026  

## 1. Summary

The Evidence Site Visit screen is a mobile-first field interface used by a site visitor to complete a lender-requested construction verification visit. A lender admin generates a one-hour tokenized link for a specific build and selected milestone scope. The site visitor opens the link at or near the job site, reviews the visit scope, captures photos/videos/files, writes a detailed report, recommends an outcome, and submits the package. Submission persists evidence files, consumes the token, marks the visit complete, and makes the report visible to the lender admin.

The redesign should treat this as a focused field tool, not a backoffice dashboard. The primary experience must support phone-first use with direct camera capture, local evidence staging, thumbnail review, compression, then explicit upload to Convex.

## 2. Goals

1. Make it obvious what site, build, milestone scope, and report task the visitor is completing.
2. Enable fast field evidence capture from a phone: multiple photos, video, and files.
3. Stage captured evidence locally before upload, with visible thumbnails and status.
4. Compress images to WebP and compress videos to a reasonable size before upload.
5. Enforce a maximum total evidence package size of 1 GB.
6. Upload staged evidence to Convex when the user taps an explicit upload button, or automatically during final submit if the visitor forgot to upload ready staged evidence.
7. Persist uploaded evidence metadata with references to Convex storage IDs.
8. Provide clear milestone-specific guidance for effective site visit completion.
9. Support a structured written report and recommendation.
10. Show invalid, expired, in-progress, and completed token states clearly.
11. Preserve locally staged evidence through page refresh until the visitor uploads or removes it.

## 3. Non-Goals

1. Full WorkOS enforcement in this iteration. Token-only access remains acceptable for v1, with TODOs for WorkOS-authenticated enforcement.
2. Real maps integration in this iteration.
3. Real satellite imagery integration in this iteration.
4. Offline sync guarantees beyond browser-local persistence.
5. AI image quality scoring or good/bad photo examples in this iteration.
6. Native app camera APIs. Use browser capture capabilities first.

## 4. Personas

### 4.1 Site Visitor / Field Inspector

The primary user. Usually on a phone or tablet at the build site. Needs to understand what to verify, capture evidence quickly, avoid losing photos/videos, and submit a defensible report.

Needs:

- minimal navigation,
- large touch targets,
- clear capture/upload state,
- direct camera access,
- guidance for required photos and observations,
- confidence that evidence was uploaded successfully.

### 4.2 Lender Staff Reviewer

May complete the visit directly or review the resulting package later. Needs evidence mapped to the correct milestone/submilestone and a consistent written report.

Needs:

- structured capture,
- enough context to validate work,
- file metadata and tags,
- clear recommendation rationale.

### 4.3 Lender Admin

Requests the visit and consumes the completed package from the admin dashboard. Does not usually use the field screen, but depends on its output to make final approval decisions.

Needs:

- complete report visibility,
- evidence persisted and linked to the visit,
- reliable visit status,
- auditability,
- token consumption after submission.

### 4.4 System / Audit Layer

Validates token access, expiry, file persistence, package size, and state transitions.

Needs:

- token/build match,
- one-hour token expiry,
- consumed-token rejection,
- evidence metadata integrity,
- auditable submit event.

## 5. User Stories

### 5.1 Token Access and Visit Context

1. As a site visitor, I can open the tokenized site visit link on my phone so I can complete the visit without navigating the full backoffice app.
2. As a site visitor, I can see whether the token is valid, expired, completed, or invalid before doing work.
3. As a site visitor, I can see the build name and address so I know I am inspecting the right site.
4. As a site visitor, I can see when the token expires so I know how much time remains.
5. As a site visitor, opening a valid token marks the visit in progress for the admin in real time.

### 5.2 Site Location

1. As a site visitor, I can see the build address prominently on the screen.
2. As a site visitor, I can tap a maps button to get directions in the future.
3. As a site visitor, I can see a satellite image area so I can orient myself around the build site.

For this iteration:

- Use whatever location/address information currently exists on the demo build record. Today that means `demo_builds.name`, `demo_builds.subtitle`, and `demo_builds.key`; no new production address model is required for this proof of concept.
- The maps button must be present and labeled `Open Directions - Under construction`.
- The button may be a stub and does not need to open maps yet.
- The satellite image area must be a dummy image frame labeled `Satellite image under construction`.

### 5.3 Milestone Scope

1. As a site visitor, I can see each milestone included in the site visit.
2. As a site visitor, I can see submilestones under each included milestone when available.
3. As a site visitor, I can tell which milestone/submilestone each piece of evidence belongs to.
4. As a site visitor, I can mark evidence as visit-wide when it applies to the overall site rather than one milestone.

### 5.4 Guidance

1. As a site visitor, I can open a guidance section when I need help completing the visit.
2. As a site visitor, the guidance is collapsed by default so it does not block the primary capture workflow.
3. As a site visitor, guidance is specific to the selected milestone scope.
4. As a site visitor, guidance tells me what to inspect, what photos are required, what issues to call out, and what report notes are expected.
5. As a future user, I will be able to see examples of good and bad photos.

For this iteration:

- Guidance is plain text.
- Guidance must be generated/displayed from available milestone/submilestone labels and static inspection rules.
- Good/bad photo examples are deferred.

### 5.5 Local Evidence Capture

1. As a site visitor, I can take multiple photos directly from the device camera.
2. As a site visitor, I can record or attach video directly from the device camera.
3. As a site visitor, I can also select existing files from the device.
4. As a site visitor, newly added photos/videos/files appear locally before upload.
5. As a site visitor, I can review thumbnails/previews before uploading.
6. As a site visitor, I can remove a locally staged item before uploading.
7. As a site visitor, I can tag each staged item to a milestone/submilestone or visit-wide.
8. As a site visitor, staged evidence survives page refresh so I do not lose field media before upload.

### 5.6 Compression and Package Limits

1. As a site visitor, added photos are compressed in the browser to WebP before upload.
2. As a site visitor, added videos are compressed to a reasonable size before upload where browser capabilities allow.
3. As a site visitor, I can see if a file cannot be compressed or exceeds limits.
4. As a site visitor, I cannot upload an evidence package larger than 1 GB total after compression.
5. As a site visitor, I can see local staged package size and uploaded package size.

### 5.7 Upload to Convex

1. As a site visitor, local capture does not immediately upload.
2. As a site visitor, I explicitly tap an upload button to upload staged evidence to Convex.
3. As a site visitor, I can see per-file upload progress/status.
4. As a site visitor, uploaded files remain visible with thumbnails/previews.
5. As a site visitor, uploaded files show enough metadata to confirm what was uploaded.
6. As the system, uploaded files are persisted in Convex storage.
7. As the system, each uploaded file has metadata linked to the site visit and Convex storage ID.
8. As a site visitor, if I tap final submit with ready staged evidence that has not been uploaded yet, the screen uploads it before submitting the report.

### 5.8 Report Submission

1. As a site visitor, I can write a detailed narrative report.
2. As a site visitor, I can indicate whether completion was observed.
3. As a site visitor, I can recommend approval, more information, or rejection.
4. As a site visitor, I cannot submit the visit with an empty report.
5. As a site visitor, I cannot submit while evidence uploads are pending.
6. As a site visitor, I cannot submit without at least one uploaded evidence file.
7. As a site visitor, I can submit after all required report and evidence conditions are met.
8. As a site visitor, after submission I see a clear confirmation.
9. As the system, submission consumes the token so it cannot be reused.

## 6. Functional Requirements

### 6.1 Route and Token Validation

- The screen is accessed from `/backoffice/builds/:buildId/newsitevisit/:siteVisitToken`.
- The singular alias may redirect from `/backoffice/build/:buildId/newsitevisit/:siteVisitToken`.
- The token must be validated against the route build ID.
- Token access is sufficient for v1.
- The token expires one hour after generation.
- A consumed token must not show editable controls.
- Invalid, expired, or consumed token states must render a non-editable state screen.

### 6.2 Visit Status

The screen must support these states:

- `un-opened`: token generated but not opened.
- `in progress`: token opened and visit not yet submitted.
- `complete`: report submitted and token consumed.
- `expired`: token expiry time passed before completion.
- `invalid`: token/build mismatch or unknown token.

Opening the valid screen should transition `un-opened` to `in progress`.

### 6.3 Mobile-First Layout

- The default layout must be optimized for phone screens.
- Primary actions must be reachable without horizontal scrolling.
- Buttons must be large enough for field use.
- The evidence capture/upload area must be above or near the report area.
- Context panels should collapse or stack rather than crowd the viewport.
- The screen should remain usable in portrait orientation.

### 6.4 Build and Location Header

The top of the screen must show:

- build name,
- build address/location display using the current demo build fields,
- token status,
- expiry time or completion state,
- `Open Directions - Under construction` button.

The maps button is a stub for this iteration. Since `demo_builds` currently does not expose canonical street-address fields, the proof-of-concept display should use existing build identity/location text: `name`, `subtitle`, and `key`.

### 6.5 Satellite Image Stub

The screen must include a site imagery frame.

For this iteration:

- Use a dummy image/frame.
- Display `Satellite image under construction`.
- The frame should preserve stable dimensions on mobile and desktop.
- The frame should not imply live map/satellite integration is active.

### 6.6 Visit Scope Display

The screen must show:

- included milestones,
- submilestones when available,
- milestone labels,
- any report/capture guidance derived from those milestones.

The scope display must be read-only. The admin defines scope before token generation.

### 6.7 Collapsible Guidance

- Guidance section is collapsed by default.
- Guidance can be expanded/collapsed with a clear touch target.
- Guidance content is milestone-specific plain text.
- Guidance should include:
  - what work to verify,
  - required photo angles,
  - required close-up/detail shots,
  - video recommendations,
  - signs of incomplete or poor-quality work,
  - safety/access notes,
  - report-writing prompts.

### 6.8 Camera and File Capture

The screen must provide:

- photo capture from camera,
- video capture from camera,
- file picker upload,
- support for selecting/capturing multiple items,
- local staging list before upload.

Implementation expectations:

- Use browser file/capture inputs where possible.
- Photo capture should accept `image/*`.
- Video capture should accept `video/*`.
- Existing device files should also be selectable.

### 6.9 Local Staging

When files are added:

- They are held locally in browser state before upload.
- They appear in a staging queue.
- Image items show thumbnails.
- Video items show video thumbnails or preview frames when feasible.
- Non-previewable files show a file-type placeholder.
- Each item has local status: `staged`, `compressing`, `ready`, `failed`, `uploading`, `uploaded`.
- Each item can be removed before upload.
- Each item can be tagged before upload.
- The local staging queue must be persisted in browser storage so it survives refresh before upload.
- Use IndexedDB for persisted local blobs and local metadata; local state must be cleared after successful final submission or explicit removal.

### 6.10 Compression

- Photos must be compressed to WebP before upload.
- Video must be compressed to a reasonable size where browser capabilities allow.
- Compression should happen locally before upload.
- The UI must show compression progress/status at least at item level.
- If compression fails, the user should see a clear error and either retry or remove the item.
- Original media should not be uploaded if a compressed version is available.
- Direct video capture should prefer browser-native recording constraints and `MediaRecorder` bitrates before resorting to heavier transcoding.
- Existing/selected video files should use a lazy-loaded worker-based compression path.
- Recommended proof-of-concept video strategy: use `ffmpeg.wasm` in a Web Worker as the fallback transcode/compression engine, with a clear loading state and graceful fallback if the browser cannot initialize it.
- Use the single-thread ffmpeg.wasm core first to avoid cross-origin-isolation requirements during the demo. Evaluate the multi-thread core later if the app can reliably serve `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers.
- Do not make video capture required for any milestone type in this iteration.

Target defaults for redesign/implementation:

- Photo output: WebP.
- Photo quality: implementation-defined, tuned for readable construction evidence.
- Video output: implementation-defined based on browser support.
- Maximum evidence package total: 1 GB after compression.
- The package size should include staged and uploaded evidence for the current visit.

Research basis:

- `MediaRecorder` supports browser media recording with configurable MIME type and bitrate options.
- `WebCodecs` gives low-level frame/codec control and works in dedicated workers, but it requires more pipeline/muxing work than this proof of concept needs.
- `ffmpeg.wasm` runs FFmpeg in the browser and offloads work to a Web Worker by default, but its own performance documentation shows it is much slower than native FFmpeg, so it should be lazy-loaded and reserved for fallback compression/transcoding rather than the default path for every capture.

### 6.11 Upload Button

- Adding files locally must not automatically upload them.
- A primary button must explicitly upload ready staged evidence to Convex.
- Button copy should be clear, for example `Upload Evidence`.
- Upload button is disabled when:
  - no ready staged files exist,
  - compression is still running,
  - package size exceeds 1 GB,
  - token is no longer active.
- Upload progress must be visible.
- If the user taps final submit while ready staged evidence exists, the app must upload that evidence first, then submit the report if uploads succeed.
- If automatic upload during submit fails, report submission must stop and show the upload error.

### 6.12 Persistence

Uploaded files must be persisted in Convex storage. Metadata must be persisted in `demo_` prefixed tables.

Required metadata:

- site visit ID,
- build ID,
- Convex storage ID,
- original file name,
- persisted file name if transformed,
- MIME type,
- byte size,
- media kind: `photo`, `video`, `document`, or `other`,
- upload timestamp,
- target milestone key if tagged,
- target submilestone key/label if tagged,
- compression status,
- original byte size when available,
- compressed byte size when available.

If the existing `demo_siteVisitFiles` table does not contain all required fields, extend it or add additional `demo_` tables. Continue to follow the `demo_` prefix convention.

### 6.13 Uploaded Evidence Gallery

The screen must display uploaded evidence:

- image thumbnails for uploaded photos,
- video thumbnails/placeholders for uploaded video,
- file placeholders for PDFs/other documents,
- filename,
- tag/target,
- size,
- uploaded status.

The user should be able to distinguish local staged items from already uploaded items.

### 6.14 Report Form

The report form must include:

- detailed written report textarea,
- completion observed checkbox/toggle,
- recommended outcome selector:
  - recommend approval,
  - needs more information,
  - recommend rejection.

Report notes are required. The submit button is disabled until notes are non-empty.

### 6.15 Submission

On final submit:

- Validate token is still active.
- Validate report notes are non-empty.
- Validate no uploads are pending.
- Validate at least one evidence file is uploaded or ready for automatic upload.
- Upload any ready staged evidence before report submission if the visitor skipped the explicit upload button.
- Stop submission and show an error if automatic evidence upload fails.
- Persist report notes.
- Persist completion observed value.
- Persist recommended outcome.
- Mark visit complete.
- Consume token.
- Update included milestone state.
- Write audit/outbox events.
- Render read-only confirmation.

## 7. Data Requirements

### 7.1 Existing / Expected Demo Tables

The design assumes the following exist or are added:

- `demo_siteVisits`
- `demo_siteVisitTargets`
- `demo_siteVisitFiles`

### 7.2 File Metadata Additions

If missing, file metadata should support:

- `storageId`
- `fileName`
- `originalFileName`
- `mimeType`
- `mediaKind`
- `sizeBytes`
- `originalSizeBytes`
- `compressedSizeBytes`
- `uploadedAt`
- `targetMilestoneKey`
- `targetSubmilestoneKey`
- `targetSubmilestoneLabel`
- `compressionStatus`

### 7.3 Local-Only Client State

The local staging queue should track:

- local ID,
- original file object,
- compressed file/blob,
- preview URL,
- media kind,
- target tag,
- compression status,
- upload status,
- upload error,
- byte size before and after compression.

Local state must not be treated as persisted until upload succeeds and Convex metadata is registered.

Local staged evidence must survive page refresh. Store staged blobs and metadata in IndexedDB under a key scoped by build ID and site visit token/visit ID. Clear that local store when the site visit is submitted, the token is no longer active, or the user explicitly discards the staged item.

## 8. UX Requirements

### 8.1 First Screen Priority

On mobile, the first viewport should communicate:

1. This is an evidence site visit.
2. The token is active/in progress.
3. The build address/location display.
4. Capture evidence is the main task.
5. The visit scope is available.

### 8.2 Recommended Mobile Information Architecture

The redesign may use this ordering:

1. Sticky compact header: build, status, expiry.
2. Address and directions stub.
3. Satellite image stub.
4. Evidence capture controls.
5. Local staged media gallery.
6. Upload evidence button/progress.
7. Uploaded evidence gallery.
8. Visit scope.
9. Collapsible guidance.
10. Report form.
11. Submit button.

### 8.3 Interaction Details

- Capture buttons should use recognizable icons and labels.
- Avoid hiding capture actions behind menus.
- Use clear empty states for staged and uploaded media.
- Show package size used out of 1 GB.
- Show upload/compression errors inline next to the relevant item.
- Keep report submission separate from evidence upload.
- If the visitor forgets to upload but has ready staged evidence, final submit should run the upload step first.
- Confirmation should make it clear that the token is now consumed.

## 9. Error and Edge States

The screen must handle:

- invalid token,
- expired token,
- consumed token,
- build/token mismatch,
- no included milestones,
- no submilestones,
- camera permission denied,
- unsupported media type,
- image compression failure,
- video compression unsupported/failure,
- package size over 1 GB,
- network failure during upload,
- Convex upload URL generation failure,
- storage upload success but metadata registration failure,
- refresh after local staging but before upload,
- duplicate tab opening,
- submit while upload is pending,
- submit after token expires,
- submit with no uploaded or upload-ready evidence,
- final submit auto-upload failure.

## 10. Accessibility Requirements

- All controls must be keyboard accessible.
- Camera/file inputs must have labels.
- Thumbnails need accessible labels or surrounding metadata.
- Status changes should be announced or visible without relying only on color.
- Buttons must have clear disabled states.
- Guidance collapse control must expose expanded/collapsed state.
- The UI must remain readable on small screens.

## 11. Security and Privacy Requirements

- Raw token must not be stored in Convex tables; only a hash is stored.
- Token-only access is permitted for v1.
- TODO comments must remain for future WorkOS enforcement.
- Files must be associated with the specific site visit/build.
- Token must be consumed after final submission.
- Expired/consumed tokens must not allow upload or report submission.
- Evidence files may contain sensitive site imagery and should not be publicly listed outside authorized report views.
- Admins may regenerate a new site visit token after a token is consumed, but consumed tokens must not be reopened.

## 12. Acceptance Criteria

1. Valid token opens the mobile-first Evidence Site Visit screen.
2. Invalid token shows a non-editable unavailable state.
3. Expired token shows a non-editable expired state.
4. Opening a valid token marks the visit in progress.
5. Screen displays build address.
6. Screen displays `Open Directions - Under construction`.
7. Screen displays satellite placeholder labeled `Satellite image under construction`.
8. Screen displays included milestones and submilestones.
9. Guidance is collapsed by default.
10. Guidance expands and shows milestone-specific plain text instructions.
11. User can add multiple photos from camera.
12. User can add video from camera.
13. User can add existing files.
14. Added media appears locally before upload.
15. Photos are compressed to WebP before upload.
16. Video compression is attempted or clearly reported as unsupported/fallback.
17. Evidence package cannot exceed 1 GB after compression.
18. User can see local thumbnails/previews.
19. User can tag staged evidence.
20. User explicitly uploads staged evidence to Convex.
21. Uploaded files persist and show in uploaded gallery.
22. Report notes are required.
23. Submit is disabled during pending uploads.
24. Submit is blocked until at least one evidence file is uploaded or ready to be uploaded automatically.
25. If ready staged evidence exists at final submit, the app uploads it before submitting the report.
26. Submit consumes the token and marks visit complete.
27. Completed token cannot be reused.
28. Admin can generate a new token for a follow-up site visit; the completed token is not reopened.
29. Completed report/files are visible to admin through the backoffice projection.

## 13. Future Enhancements

- Real map directions integration.
- Real satellite imagery integration.
- GPS/geofence attempt and location verification.
- Offline draft persistence with resumable upload.
- Good/bad photo examples per milestone.
- AI-assisted photo quality checks.
- AI-assisted report draft from uploaded media and checklist answers.
- WorkOS-authenticated access layered on top of token possession.
- Inspector assignment and signature capture.
- Structured checklist per milestone template.

## 14. Resolved Product Decisions

1. Address/location fields: use whatever currently exists for the demo. Today this means `demo_builds.name`, `demo_builds.subtitle`, and `demo_builds.key`; do not block the proof of concept on a production address schema.
2. Local staged evidence must survive page refresh before upload. Use IndexedDB for staged blobs and metadata.
3. Video compression strategy: use native capture/recording constraints first; use a lazy-loaded `ffmpeg.wasm` worker fallback for selected videos or cases needing transcode/compression. Prefer single-thread core for the proof of concept; revisit multi-thread core when cross-origin-isolation headers are intentionally configured.
4. Video capture is optional. It is not required for any milestone type in this iteration.
5. If the visitor taps final submit with ready staged photos/videos/files that have not been uploaded, the app must upload them first, then submit the report.
6. The 1 GB cap applies after compression.
7. Admins can regenerate a new site visit token, but cannot reopen a consumed token.
8. The site visitor must provide at least one uploaded evidence file before final submission. Ready staged evidence may satisfy this only if final submit successfully uploads it first.

## 15. Research References

- [MediaRecorder API - MDN](https://developer.mozilla.org/docs/Web/API/MediaRecorder)
- [WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [Using the WebCodecs API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API)
- [ffmpeg.wasm Overview](https://ffmpegwasm.netlify.app/docs/overview/)
- [ffmpeg.wasm Performance](https://ffmpegwasm.netlify.app/docs/performance)
