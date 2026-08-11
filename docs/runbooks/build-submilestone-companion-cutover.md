# Sub-milestone companion cutover

This runbook governs the ENG-424 migration from legacy or inconsistent generated Action Items to one active collaboration companion for every active canonical Sub-milestone.

## Safety contract

- Run as an authenticated Admin or Principal Broker for the representative Build.
- Preview is read-only and returns a versioned plan token plus deterministic record and report identifiers.
- Apply is bounded and resumable. Reusing the same plan token returns the same run and receipts.
- Missing companions are created only through the canonical Milestone System Post ensure path.
- A duplicate is repaired automatically only when zero or one candidate owns human collaboration history. The history-bearing candidate wins. Empty candidates use canonical revision, creation time, then ID as deterministic tie-breakers.
- If multiple candidates own comments, attachments, checklist rows, children, relations, labels, human revisions/activity, or deliveries, the run blocks with `conflicting_history`. No history is merged or deleted.
- Cross-scope bindings and malformed bindings with history block. Empty malformed records are quarantined. Superseded canonical records remain historical and read-only.
- Generated companions have a separate metric dimension and are excluded from the manual Action Item count.

## Operator sequence

Use the public Convex functions in `build_submilestone_companion_cutover`.

1. Call `previewBuildSubmilestoneCompanionCutover` with `organizationId` and `buildId`.
2. Retain the complete preview response. Every preview warning is blocking, including truncated sources, bounded candidate scans, or incomplete dependency scans. Stop if `truncated` is true or any warning is present.
3. Call `startBuildSubmilestoneCompanionCutover` with the returned `planToken` and a batch size from 1 to 25. The run starts in `seeding_reports`; no repair is allowed until the complete preview manifest is persisted in bounded report batches. Only one non-terminal run may exist for a Build.
4. Call `advanceBuildSubmilestoneCompanionCutover` through `seeding_reports`, `repairing`, `materializing`, and `checking_parity` until `status` is `complete` or `blocked`. Parity uses a durable record-key cursor, not a positional offset, and blocks if the checked count no longer matches the canonical record set.
5. If blocked, read `getBuildSubmilestoneCompanionCutoverReports`. Resolve the named exception outside the run, create a new preview, and start a new plan. Do not edit a blocked manifest.
6. After completion, call `startBuildSubmilestoneCompanionCutover` again with the original token. It must return the exact completed run ID and report hash with `companionWriteCount: 0`. Any changed run ID, changed report hash, or write blocks release.
7. Retain the completed run, paginated reports, authenticated cutover certification state, and before/after rollback snapshots.

## Parity requirements

A completed run proves:

- every active Sub-milestone has exactly one active companion;
- superseded Sub-milestones do not cause a new active companion;
- companion, parent System Post, Milestone, Build, organization, and brokerage bindings agree;
- repair exceptions and parity mismatches are zero;
- `reportHash` binds the durable record receipts;
- `manualActionItemCount` excludes generated Sub-milestone companions;
- `generatedCompanionCount` remains visible as its own dimension.

## Release artifacts

Write these four typed artifacts under the release evidence directory referenced by `docs/runbooks/build-collaboration-deployment-record.template.json`:

- `migration-preview.json` -> `migration.previewArtifact`, schema `build-collaboration-migration-artifact/v1`, stage `preview`;
- `migration-application.json` -> `migration.applicationArtifact`, schema `build-collaboration-migration-artifact/v1`, stage `application`;
- `migration-replay.json` -> `migration.replayArtifact`, schema `build-collaboration-migration-artifact/v1`, stage `replay`;
- `migration-parity.json` -> `migration.parityArtifact`, schema `build-collaboration-migration-artifact/v1`, stage `parity`.

Pass the deployment-record manifest and authenticated live-state JSON to `scripts/build-collaboration-cutover-certification.ts`. The four artifacts keep the existing release-scope fields. When a companion cutover exists, include:

- every stage: `companionRunId`, `companionPlanToken`, `companionReportCount`;
- application, replay, and parity: `companionReportHash`;
- replay: `companionReplayed: true`, `companionWriteCount: 0`;
- parity: `companionParityPassed: true`, `activeSubmilestoneCount`, `generatedCompanionCount`, and `manualActionItemCount`.

The operator must attach the four artifact SHA-256 values, the rollback rehearsal attestation ID, and the exact release Git commit to the deployment record. The cutover certification validator compares these fields with authenticated server state and requires human artifact attestations tied to that rollback rehearsal and Git commit.

## Rollback evidence

The repair never deletes a generated Action Item that may contain collaboration history. Duplicate losers keep their stable ID, historical canonical ID, survivor pointer, and superseded timestamp. Before and after cutover snapshots must retain stable-ID/content digests for posts, revisions, assets, receipts, audit events, and every generated companion Action Item. The companion snapshot includes its stable ID, canonical and historical canonical Sub-milestone IDs, survivor pointer, superseded timestamp, active or historical disposition, planning state, and Build, Milestone, organization, brokerage, and parent-post bindings. The rollback rehearsal must compare these companion fields before disable, while disabled, and after re-enable and prove exact equality: tenant disable and re-enable must not replace, reactivate, rebind, or rewrite any companion record.
