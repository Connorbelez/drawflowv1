/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DAY_MS, NEVER_PERSISTED_RETENTION_CONTROLS } from "./data_retention";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const BASE_TIME = Date.parse("2026-08-03T12:00:00.000Z");

beforeEach(() => {
  vi.stubEnv(
    "DATA_RETENTION_TOMBSTONE_HMAC_KEY",
    "eng-402-test-only-tombstone-hmac-key"
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("ENG-402 data retention control plane", () => {
  test("derives the seven-year schedule from the later Build/Loan closure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_clock", {
      buildClosedAt: BASE_TIME,
    });
    const loanFacilityId = await t.run(async (ctx) => {
      return await ctx.db.insert("loanFacilities", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: BASE_TIME,
        interestAnnualBps: 900,
        interestStartsOn: "funds_released",
        organizationId: fixture.organizationId,
        principalCents: 1_000_000,
        proposalId: fixture.proposalId,
        status: "active",
        updatedAt: BASE_TIME + 10 * DAY_MS,
      });
    });

    await t.mutation(internal.data_retention.reconcileDataRetention, {
      asOf: BASE_TIME + 11 * DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
      runKey: "clock-controlled-run",
    });
    const activeLoanSchedule = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionSchedules")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique()
    );
    expect(activeLoanSchedule).toMatchObject({
      buildClosedAt: BASE_TIME,
      state: "active",
    });
    expect(activeLoanSchedule?.laterClosureAt).toBeUndefined();
    expect(activeLoanSchedule?.retainUntil).toBeUndefined();
    await t.run((ctx) =>
      ctx.db.patch(loanFacilityId, { status: "closed" })
    );
    await t.mutation(internal.data_retention.reconcileDataRetention, {
      asOf: BASE_TIME + 11 * DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
      runKey: "clock-controlled-run-missing-facility-closed-at",
    });
    const missingFacilityClosure = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionSchedules")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique()
    );
    expect(missingFacilityClosure?.retainUntil).toBeUndefined();
    await t.run(async (ctx) => {
      await ctx.db.patch(loanFacilityId, {
        closedAt: BASE_TIME + 10 * DAY_MS,
        status: "closed",
      });
    });
    await t.mutation(internal.data_retention.reconcileDataRetention, {
      asOf: BASE_TIME + 11 * DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
      runKey: "clock-controlled-run-after-loan-close",
    });
    const schedule = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionSchedules")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique(),
    );
    expect(schedule).toMatchObject({
      buildClosedAt: BASE_TIME,
      laterClosureAt: BASE_TIME + 10 * DAY_MS,
      loanClosedAt: BASE_TIME + 10 * DAY_MS,
      baselineRetainUntil: Date.parse("2033-08-13T12:00:00.000Z"),
      retainUntil: Date.parse("2033-08-13T12:00:00.000Z"),
      state: "active",
    });
  });

  test("records a manifest once and proves communication minimization controls are never persisted", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_backup", {});
    const manifestJson = JSON.stringify({ documents: 4 });
    const input = {
      backupDate: "2026-08-03",
      brokerageId: fixture.brokerageId,
      buildCount: 1,
      capturedAt: BASE_TIME,
      documentsCount: 4,
      manifestJson,
      manifestSha256: await testSha256(manifestJson),
      organizationId: fixture.organizationId,
      relationshipCount: 0,
      revisionLineageCount: 0,
      rpoDeadlineAt: BASE_TIME + DAY_MS,
      state: "verified" as const,
      storageBytes: 256,
      storageObjectsCount: 2,
    };
    const first = await t.mutation(
      internal.data_retention.recordDataRetentionBackupManifest,
      input,
    );
    const replay = await t.mutation(
      internal.data_retention.recordDataRetentionBackupManifest,
      input,
    );
    expect(replay).toBe(first);
    const manifest = await t.run((ctx) => ctx.db.get(first));
    expect(manifest?.neverPersistedControls).toEqual(
      expect.arrayContaining([...NEVER_PERSISTED_RETENTION_CONTROLS]),
    );
    expect(manifest?.verifiedAt).toBeTypeOf("number");
    expect(manifest?.verifiedAt).not.toBe(BASE_TIME);
    const admin = t.withIdentity({
      email: "backup-admin@example.com",
      name: "backup-admin",
      organizationId: fixture.organizationId,
      role: "admin",
      roles: ["admin"],
      subject: "backup-admin",
      tokenIdentifier: "https://api.workos.com/|backup-admin",
      "https://fairlend.ca/actor_kind": "human",
    } as never);
    const publicMetadata = await admin.query(
      (api as any).data_retention.getLatestDataRetentionBackupManifest,
      { buildId: fixture.buildId, organizationId: fixture.organizationId }
    );
    expect(publicMetadata).not.toHaveProperty("manifestJson");
    expect(publicMetadata).toMatchObject({
      manifestSha256: await testSha256(manifestJson),
      storageObjectsCount: 2,
    });
    await expect(
      t.mutation(internal.data_retention.recordDataRetentionBackupManifest, {
        ...input,
        backupDate: "2026-08-04",
        manifestJson: "{invalid",
        manifestSha256: "invalid-json-manifest",
      }),
    ).rejects.toThrow("valid JSON");
    await expect(
      t.mutation(internal.data_retention.recordDataRetentionBackupManifest, {
        ...input,
        backupDate: "2026-08-05",
        manifestSha256: "0".repeat(64),
      })
    ).rejects.toThrow("SHA-256 does not match");
  });

  test("keeps terminal Quote Drafts recoverable for 90 days, then purges only editable children", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_quote_draft", {});
    const draft = await seedTerminalQuoteDraft(t, fixture);
    const beforeWindow = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf: BASE_TIME + 89 * DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
    });
    expect(beforeWindow.markedRecoveryCount).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(draft.draftId)))?.retentionState).toBe("recovery");

    const atWindow = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf: BASE_TIME + 90 * DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
    });
    expect(atWindow.deletedOrRedactedCount).toBeGreaterThanOrEqual(2);
    const persisted = await t.run(async (ctx) => ({
      answer: await ctx.db.get(draft.answerId),
      attachment: await ctx.db.get(draft.attachmentId),
      draft: await ctx.db.get(draft.draftId),
      line: await ctx.db.get(draft.lineId),
      tombstone: await ctx.db
        .query("dataRetentionTombstones")
        .withIndex("by_scopeKind_and_scopeId", (query) =>
          query
            .eq("scopeKind", "quoteInvitationResponseDraft")
            .eq("scopeId", String(draft.draftId)),
        )
        .unique(),
    }));
    expect(persisted.draft?.commentsHtml).toBeUndefined();
    expect(persisted.draft).toMatchObject({
      retentionState: "purged",
      purgedAt: BASE_TIME + 90 * DAY_MS,
    });
    expect(persisted.answer).toBeNull();
    expect(persisted.attachment).toBeNull();
    expect(persisted.line).toBeNull();
    expect(persisted.tombstone).toBeTruthy();
    expect(persisted.tombstone?.auditEventId).toBeTruthy();
    const replay = await t.mutation(
      internal.data_retention.runDataRetentionMaintenance,
      {
        asOf: BASE_TIME + 90 * DAY_MS,
        buildId: fixture.buildId,
        organizationId: fixture.organizationId,
      }
    );
    expect(replay.completedOperations).toBe(0);
    const replayedTombstone = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionTombstones")
        .withIndex("by_scopeKind_and_scopeId", (query) =>
          query
            .eq("scopeKind", "quoteInvitationResponseDraft")
            .eq("scopeId", String(draft.draftId))
        )
        .unique()
    );
    expect(replayedTombstone?._id).toBe(persisted.tombstone?._id);
    expect(replayedTombstone?.auditEventId).toBe(
      persisted.tombstone?.auditEventId
    );
  });

  test("advances past the bounded terminal Quote Draft page on successive sweeps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_quote_draft_page", {});
    for (let index = 0; index < 101; index += 1) {
      await seedTerminalQuoteDraft(t, fixture);
    }
    const first = await t.mutation(
      internal.data_retention.runDataRetentionMaintenance,
      {
        asOf: BASE_TIME + 90 * DAY_MS,
        buildId: fixture.buildId,
        organizationId: fixture.organizationId,
      }
    );
    expect(first.completedOperations).toBe(100);
    const second = await t.mutation(
      internal.data_retention.runDataRetentionMaintenance,
      {
        asOf: BASE_TIME + 90 * DAY_MS,
        buildId: fixture.buildId,
        organizationId: fixture.organizationId,
      }
    );
    expect(second.completedOperations).toBe(1);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("quoteInvitationResponseDrafts")
          .withIndex(
            "by_buildId_and_retentionState_and_purgeEligibleAt",
            (query) =>
              query
                .eq("buildId", fixture.buildId)
                .eq("retentionState", "purged")
          )
          .collect()
      )
    ).toHaveLength(101);
  });

  test("expires a staged Cost upload at the seven-day boundary and deletes unbound storage", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_cost_upload", {});
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["staged-cost"], { type: "text/plain" })),
    );
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("buildCollaborationAssetStagingSessions", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        contextKind: "costDocumentDraft",
        createdAt: BASE_TIME,
        expectedFileName: "invoice.pdf",
        expectedMimeType: "application/pdf",
        expectedSizeBytes: 11,
        expiresAt: BASE_TIME + 7 * DAY_MS,
        organizationId: fixture.organizationId,
        ownerWorkosUserId: "cost-owner",
        pendingStorageId: storageId,
        state: "open",
        updatedAt: BASE_TIME,
      }),
    );
    const result = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf: BASE_TIME + 7 * DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
    });
    expect(result.deletedOrRedactedCount).toBe(1);
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(sessionId)))?.state).toBe("abandoned");
  });

  test("never deletes an available asset when its stale Cost staging session expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_available_asset", {});
    const seeded = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["available-cost"], { type: "text/plain" })
      );
      const assetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        contentHashSha256: "available-cost-asset-sha",
        createdAt: BASE_TIME,
        fileName: "available-cost.pdf",
        maximumAudienceMode: "build_wide",
        mimeType: "application/pdf",
        organizationId: fixture.organizationId,
        publishedAt: undefined,
        readerWorkosUserIds: [],
        scanCompletedAt: BASE_TIME,
        scanState: "clean",
        sizeBytes: 14,
        state: "available",
        storageId,
        updatedAt: BASE_TIME,
        uploadedByWorkosUserId: "retention-test",
        version: 1,
      });
      const sessionId = await ctx.db.insert(
        "buildCollaborationAssetStagingSessions",
        {
          assetId,
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          contextKind: "costDocumentDraft",
          createdAt: BASE_TIME,
          expectedFileName: "available-cost.pdf",
          expectedMimeType: "application/pdf",
          expectedSizeBytes: 14,
          expiresAt: BASE_TIME + 7 * DAY_MS,
          organizationId: fixture.organizationId,
          ownerWorkosUserId: "retention-test",
          state: "finalized",
          updatedAt: BASE_TIME,
        }
      );
      return { assetId, sessionId, storageId };
    });
    const result = await t.mutation(
      internal.data_retention.runDataRetentionMaintenance,
      {
        asOf: BASE_TIME + 7 * DAY_MS,
        buildId: fixture.buildId,
        organizationId: fixture.organizationId,
      }
    );
    expect(result.deletedOrRedactedCount).toBe(0);
    expect(await t.run((ctx) => ctx.storage.getUrl(seeded.storageId))).toBeTruthy();
    const persisted = await t.run(async (ctx) => ({
      asset: await ctx.db.get(seeded.assetId),
      session: await ctx.db.get(seeded.sessionId),
    }));
    expect(persisted.asset?.storageDeletedAt).toBeUndefined();
    expect(persisted.asset?.state).toBe("available");
    expect(persisted.session?.state).toBe("abandoned");
  });

  test("clears terminal credential and browser-session verifiers after 30 days, but never active verifiers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_credentials", {});
    const credentials = await seedCredentialMaterial(t, fixture);
    const beforeWindow = await t.mutation(
      internal.data_retention.runDataRetentionMaintenance,
      {
        asOf: BASE_TIME - 1,
        buildId: fixture.buildId,
        organizationId: fixture.organizationId,
      },
    );
    expect(beforeWindow.deletedOrRedactedCount).toBe(0);
    const result = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf: BASE_TIME,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
    });
    expect(result.deletedOrRedactedCount).toBe(2);
    const persisted = await t.run(async (ctx) => ({
      activeCredential: await ctx.db.get(credentials.activeCredentialId),
      expiredCredential: await ctx.db.get(credentials.expiredCredentialId),
      expiredSession: await ctx.db.get(credentials.expiredSessionId),
    }));
    expect(persisted.expiredCredential?.credentialVerifier).toBeUndefined();
    expect(persisted.expiredSession?.sessionVerifier).toBeUndefined();
    expect(persisted.activeCredential?.credentialVerifier).toBe("active-verifier");
  });

  test("restricted archive makes canonical Quote/Cost writes read-only without changing retention eligibility", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_archive", {
      buildClosedAt: BASE_TIME,
    });
    await t.mutation(internal.data_retention.reconcileDataRetention, {
      asOf: BASE_TIME,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
      runKey: "archive-pre-transition",
    });
    const retainUntilBeforeArchive = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionSchedules")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique()
        .then((schedule) => schedule?.retainUntil),
    );
    expect(retainUntilBeforeArchive).toBeTypeOf("number");
    const admin = t.withIdentity({
      email: "archive-admin@example.com",
      name: "archive-admin",
      organizationId: fixture.organizationId,
      role: "admin",
      roles: ["admin", "builder"],
      subject: "archive-admin",
      tokenIdentifier: "https://api.workos.com/|archive-admin",
      "https://fairlend.ca/actor_kind": "human",
    } as never);
    const communicationIntentId = await t.run((ctx) =>
      ctx.db.insert("communicationIntents", {
        attemptCount: 0,
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        channel: "email",
        createdAt: BASE_TIME,
        idempotencyKey: "archive-pending-intent",
        kind: "quote_invitation_initial",
        nextAttemptAt: BASE_TIME,
        organizationId: fixture.organizationId,
        payloadSnapshot: "{}",
        recipientEmailSnapshot: "vendor@example.com",
        relatedEntityId: String(fixture.buildId),
        relatedEntityType: "activeBuild",
        status: "pending",
        templateKey: "quote_invitation_initial",
        updatedAt: BASE_TIME,
      })
    );
    const claimedIntent = await t.mutation(
      internal.quote_notifications.claimCommunicationIntent,
      {
        intentId: communicationIntentId,
        now: BASE_TIME,
      }
    );
    if (!claimedIntent) {
      throw new Error("Expected the communication intent to be claimed.");
    }
    await expect(
      t.mutation(
        internal.quote_notifications.authorizeCommunicationProviderSubmission,
        {
          attemptId: claimedIntent.attemptId,
          intentId: communicationIntentId,
          now: BASE_TIME,
        }
      )
    ).resolves.toBe(true);
    const transitionInput = {
      buildId: fixture.buildId,
      confirmed: true,
      organizationId: fixture.organizationId,
      reason: "Organization service cancellation",
    };
    await expect(
      admin.mutation(
        (api as any).data_retention.transitionOrganizationToRestrictedArchive,
        transitionInput,
      )
    ).rejects.toThrow("provider submission is active");
    await t.mutation(
      internal.quote_notifications.releaseCommunicationProviderReservation,
      { attemptId: claimedIntent.attemptId, now: BASE_TIME }
    );
    const transition = await admin.mutation(
      (api as any).data_retention.transitionOrganizationToRestrictedArchive,
      transitionInput,
    );
    expect(transition.archiveRunKey).toMatch(/^archive:/);
    expect(
      await admin.mutation(
        (api as any).data_retention.transitionOrganizationToRestrictedArchive,
        transitionInput,
      )
    ).toEqual(transition);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await expect(
      t.mutation(
        internal.quote_notifications.authorizeCommunicationProviderSubmission,
        {
          attemptId: claimedIntent.attemptId,
          intentId: communicationIntentId,
          now: BASE_TIME,
        }
      )
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.quote_notifications.claimCommunicationIntent, {
        intentId: communicationIntentId,
        now: BASE_TIME,
      })
    ).resolves.toBeNull();
    const cancelledIntent = await t.run((ctx) =>
      ctx.db.get(communicationIntentId)
    );
    expect(cancelledIntent).toMatchObject({
      status: "cancelled",
      suppressionReason:
        "Communication dispatch cancelled because the organization is in restricted archive.",
    });
    const suppressedOutcomes = await t.run((ctx) =>
      ctx.db
        .query("communicationOutcomes")
        .withIndex("by_communicationIntentId_and_providerCreatedAt", (query) =>
          query.eq("communicationIntentId", communicationIntentId)
        )
        .collect()
    );
    expect(suppressedOutcomes).toHaveLength(1);
    expect(suppressedOutcomes[0]?.outcomeType).toBe("dispatch_suppressed");
    await expect(
      admin.mutation((api as any).quote_rounds.createQuoteRoundDraft, {
        buildId: fixture.buildId,
        mode: "combined",
        title: "Should be read-only",
        workosOrganizationId: fixture.organizationId,
      }),
    ).rejects.toThrow("restricted archive");
    const schedule = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionSchedules")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique(),
    );
    expect(schedule?.state).toBe("restricted_archive");
    expect(schedule?.retainUntil).toBe(retainUntilBeforeArchive);
    await t.mutation(internal.data_retention.reconcileDataRetention, {
      asOf: (retainUntilBeforeArchive as number) - DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
      runKey: "archive-reminder-suppression",
    });
    const suppressedReminder = await t.run(async (ctx) => ({
      operations: await ctx.db
        .query("dataRetentionOperations")
        .withIndex("by_buildId_and_operationKind", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("operationKind", "retention_reminder")
        )
        .collect(),
      outbox: (await ctx.db.query("eventOutbox").collect()).filter(
        (event) =>
          event.organizationId === fixture.organizationId &&
          event.eventType === "data_retention.reminder_due"
      ),
    }));
    expect(suppressedReminder).toEqual({ operations: [], outbox: [] });
  });

  test("isolates a failed fan-out Build, retries it, and still reaches later pages", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_fanout_retry", {});
    const facilityIds = await t.run(async (ctx) => {
      const original = await ctx.db.get(fixture.buildId);
      if (!original) {
        throw new Error("Expected the fan-out fixture Build.");
      }
      const { _creationTime, _id, ...buildFields } = original;
      void _creationTime;
      void _id;
      for (let index = 1; index <= 20; index += 1) {
        await ctx.db.insert("activeBuilds", {
          ...buildFields,
          buildName: `Fan-out Build ${index}`,
          createdAt: BASE_TIME + index,
          updatedAt: BASE_TIME + index,
        });
      }
      const ids = [];
      for (let index = 0; index < 21; index += 1) {
        ids.push(
          await ctx.db.insert("loanFacilities", {
            brokerageId: fixture.brokerageId,
            buildId: fixture.buildId,
            createdAt: BASE_TIME + index,
            interestAnnualBps: 900,
            interestStartsOn: "funds_released",
            organizationId: fixture.organizationId,
            principalCents: 1_000_000,
            proposalId: fixture.proposalId,
            status: "active",
            updatedAt: BASE_TIME + index,
          })
        );
      }
      return ids;
    });
    await t.action(internal.data_retention.fanOutDataRetentionWork, {
      mode: "reconcile",
      organizationId: fixture.organizationId,
      runKey: "fanout-retry-regression",
    });
    const failedProgress = await t.run(async (ctx) => ({
      buildFailure: await ctx.db
        .query("dataRetentionFanoutBuildFailures")
        .withIndex("by_runKey_and_buildId", (query) =>
          query
            .eq("runKey", "fanout-retry-regression")
            .eq("buildId", fixture.buildId)
        )
        .unique(),
      run: await ctx.db
        .query("dataRetentionFanoutRuns")
        .withIndex("by_runKey", (query) =>
          query.eq("runKey", "fanout-retry-regression")
        )
        .unique(),
    }));
    expect(failedProgress.run).toMatchObject({
      attemptCount: 1,
      failureCount: 0,
      state: "running",
    });
    expect(failedProgress.run?.cursor).toBeTypeOf("string");
    expect(failedProgress.buildFailure).toMatchObject({
      failureCount: 1,
      state: "retry_scheduled",
    });
    expect(failedProgress.buildFailure?.failureReason).toMatch(
      /bounded loan facility limit/i
    );
    await t.run(async (ctx) => {
      for (const facilityId of facilityIds.slice(1)) {
        await ctx.db.delete(facilityId);
      }
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const completed = await t.run(async (ctx) => ({
      run: await ctx.db
        .query("dataRetentionFanoutRuns")
        .withIndex("by_runKey", (query) =>
          query.eq("runKey", "fanout-retry-regression")
        )
        .unique(),
      buildFailure: await ctx.db
        .query("dataRetentionFanoutBuildFailures")
        .withIndex("by_runKey_and_buildId", (query) =>
          query
            .eq("runKey", "fanout-retry-regression")
            .eq("buildId", fixture.buildId)
        )
        .unique(),
      schedules: await ctx.db
        .query("dataRetentionSchedules")
        .withIndex("by_organizationId_and_state", (query) =>
          query.eq("organizationId", fixture.organizationId)
        )
        .collect(),
    }));
    expect(completed.run).toMatchObject({
      attemptCount: 1,
      failureCount: 0,
      state: "completed",
    });
    expect(completed.buildFailure).toMatchObject({ state: "resolved" });
    expect(completed.schedules).toHaveLength(21);
  });

  test("reconciles changed closure inputs and records quarterly isolated drill evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_reconcile", {
      buildClosedAt: BASE_TIME,
    });
    const first = await t.mutation(internal.data_retention.reconcileDataRetention, {
      asOf: BASE_TIME + DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
      runKey: "reconcile-1",
    });
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("buildCollaborationBuildStates")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique();
      if (!state) throw new Error("Expected Build lifecycle state");
      await ctx.db.patch(state._id, { closedAt: BASE_TIME + 2 * DAY_MS, revision: 2 });
      await ctx.db.insert("costDocuments", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        category: "materials",
        createdAt: BASE_TIME,
        currency: "CAD",
        documentDate: "2026-08-03",
        grossTotalCents: 100,
        kind: "invoice",
        organizationId: fixture.organizationId,
        revisionNumber: 1,
        state: "submitted",
        submittedAt: BASE_TIME,
        title: "Retention drill lineage",
        uploaderEmailSnapshot: "retention@example.com",
        uploaderWorkosUserId: "retention-test",
        vendorName: "Retention Vendor",
      });
      await ctx.db.insert("dataRetentionBackupManifests", {
        backupDate: "2026-08-03",
        brokerageId: fixture.brokerageId,
        buildCount: 1,
        capturedAt: BASE_TIME + DAY_MS,
        createdByWorkosUserId: "test",
        documentsCount: 1,
        manifestJson: "{}",
        manifestSha256: "drill-backup",
        neverPersistedControls: [...NEVER_PERSISTED_RETENTION_CONTROLS],
        organizationId: fixture.organizationId,
        relationshipCount: 1,
        revisionLineageCount: 1,
        rpoDeadlineAt: BASE_TIME + 2 * DAY_MS,
        state: "verified",
        storageBytes: 0,
        storageObjectsCount: 0,
        verifiedAt: BASE_TIME + DAY_MS,
      });
    });
    const second = await t.mutation(internal.data_retention.reconcileDataRetention, {
      asOf: BASE_TIME + 3 * DAY_MS,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
      runKey: "reconcile-2",
    });
    expect(second.runId).not.toBe(first.runId);
    const schedule = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionSchedules")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .unique(),
    );
    expect(schedule?.buildClosedAt).toBe(BASE_TIME + 2 * DAY_MS);
    expect(schedule?.revision).toBeGreaterThan(1);

    const backupManifestId = await t.run((ctx) =>
      ctx.db
        .query("dataRetentionBackupManifests")
        .withIndex("by_organizationId_and_backupDate", (query) =>
          query
            .eq("organizationId", fixture.organizationId)
            .eq("backupDate", "2026-08-03"),
        )
        .unique()
        .then((row) => row!._id),
    );
    const restoredEvidence = {
      restoredBuildCount: 1,
      restoredDocumentsCount: 1,
      restoredRelationshipCount: 1,
      restoredRevisionLineageCount: 1,
      restoredSampleSourceSha256: "drill-restored-sample-sha256",
      restoredStorageBytes: 0,
      restoredStorageObjectsCount: 0,
    };
    await expect(
      t.mutation(internal.data_retention.runQuarterlyDataRetentionDrill, {
        backupManifestId,
        isolatedAccessBoundaryValidated: true,
        isolatedNamespace: "production-retention-drill",
        organizationId: fixture.organizationId,
        productionStorageCredentialFingerprint: "prod-storage-fingerprint",
        productionTenantCredentialFingerprint: "prod-tenant-fingerprint",
        quarterKey: "2026-Q3",
        productionAccessDenied: true,
        ...restoredEvidence,
        storageCredentialFingerprint: "prod-storage-fingerprint",
        tenantCredentialFingerprint: "drill-tenant-fingerprint",
      }),
    ).rejects.toThrow("non-production");
    await expect(
      t.mutation(internal.data_retention.runQuarterlyDataRetentionDrill, {
        backupManifestId,
        isolatedAccessBoundaryValidated: false,
        isolatedNamespace: "retention-drill-2026-q3-boundary-failure",
        organizationId: fixture.organizationId,
        productionAccessDenied: true,
        productionStorageCredentialFingerprint: "prod-storage-fingerprint",
        productionTenantCredentialFingerprint: "prod-tenant-fingerprint",
        quarterKey: " 2026-Q3 ",
        ...restoredEvidence,
        storageCredentialFingerprint: "drill-storage-fingerprint",
        tenantCredentialFingerprint: "drill-tenant-fingerprint",
      })
    ).rejects.toThrow("isolated access boundaries");
    const drillId = await t.mutation(internal.data_retention.runQuarterlyDataRetentionDrill, {
      backupManifestId,
      isolatedAccessBoundaryValidated: true,
      isolatedNamespace: "retention-drill-2026-q3",
      organizationId: fixture.organizationId,
      productionStorageCredentialFingerprint: "prod-storage-fingerprint",
      productionTenantCredentialFingerprint: "prod-tenant-fingerprint",
      quarterKey: "2026-Q3",
      productionAccessDenied: true,
      ...restoredEvidence,
      storageCredentialFingerprint: "drill-storage-fingerprint",
      tenantCredentialFingerprint: "drill-tenant-fingerprint",
    });
    const drill = await t.run((ctx) => ctx.db.get(drillId));
    expect(drill).toMatchObject({
      buildCount: 1,
      isolatedNamespace: "retention-drill-2026-q3",
      passed: true,
      quarterKey: "2026-Q3",
      relationshipCount: 1,
    });
    expect(drill?.sampleSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("purges an isolated failed asset exactly once and leaves a disposal tombstone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_idempotent", {
      rejectedAssetAgeMs: 31 * DAY_MS,
    });
    const asOf = BASE_TIME + 31 * DAY_MS;
    const first = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
    });
    const replay = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf,
      buildId: fixture.buildId,
      organizationId: fixture.organizationId,
    });
    expect(first.deletedOrRedactedCount).toBe(1);
    expect(first.tombstoneCount).toBe(1);
    expect(replay.deletedOrRedactedCount).toBe(0);
    expect(replay.tombstoneCount).toBe(0);
    const persisted = await t.run(async (ctx) => ({
      asset: await ctx.db.get(fixture.assetId),
      operations: await ctx.db
        .query("dataRetentionOperations")
        .withIndex("by_buildId_and_operationKind", (query) =>
          query.eq("buildId", fixture.buildId).eq("operationKind", "isolated_asset"),
        )
        .collect(),
      tombstones: await ctx.db
        .query("dataRetentionTombstones")
        .withIndex("by_scopeKind_and_scopeId", (query) =>
          query.eq("scopeKind", "buildCollaborationAsset").eq("scopeId", String(fixture.assetId)),
        )
        .collect(),
    }));
    expect(persisted.asset?.storageDeletedAt).toBe(asOf);
    expect(persisted.operations).toHaveLength(1);
    expect(persisted.operations[0]?.state).toBe("completed");
    expect(persisted.tombstones).toHaveLength(1);
    expect(persisted.tombstones[0]?.auditEventId).toBeTruthy();
    expect(persisted.tombstones[0]?.sourceProofHmacSha256).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(persisted.tombstones[0]?.sourceProofHmacSha256).not.toBe(
      "org_retention_idempotent-asset-sha"
    );
    expect(
      await t.mutation(
        internal.data_retention.cleanupExpiredDataRetentionTombstones,
        { asOf: asOf + 2 * 365 * DAY_MS - 1 },
      ),
    ).toBe(0);
    expect(
      await t.mutation(
        internal.data_retention.cleanupExpiredDataRetentionTombstones,
        { asOf: asOf + 2 * 365 * DAY_MS },
      ),
    ).toBe(1);
  });

  test("fails closed on a Build legal hold and scopes a sweep to one organization", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const held = await seedBuild(t, "org_retention_held", {
      rejectedAssetAgeMs: 31 * DAY_MS,
      legalHold: true,
    });
    const other = await seedBuild(t, "org_retention_other", {
      rejectedAssetAgeMs: 31 * DAY_MS,
    });
    const asOf = BASE_TIME + 31 * DAY_MS;
    const result = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf,
      buildId: held.buildId,
      organizationId: held.organizationId,
    });
    expect(result.blockedByLegalHold).toBe(1);
    expect(result.deletedOrRedactedCount).toBe(0);
    const persisted = await t.run(async (ctx) => ({
      heldAsset: await ctx.db.get(held.assetId),
      otherAsset: await ctx.db.get(other.assetId),
    }));
    expect(persisted.heldAsset?.storageDeletedAt).toBeUndefined();
    expect(persisted.otherAsset?.storageDeletedAt).toBeUndefined();
    const otherRun = await t.mutation(internal.data_retention.runDataRetentionMaintenance, {
      asOf,
      buildId: other.buildId,
      organizationId: other.organizationId,
    });
    expect(otherRun.deletedOrRedactedCount).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(other.assetId)))?.storageDeletedAt).toBe(asOf);
  });

  test("requires retention-admin authority and break-glass before physical file deletion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_physical_delete", {
      rejectedAssetAgeMs: 31 * DAY_MS,
    });
    await t.run((ctx) =>
      ctx.db.insert("buildParticipants", {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        createdAt: BASE_TIME,
        displayNameSnapshot: "Retention Builder",
        joinedAt: BASE_TIME,
        organizationId: fixture.organizationId,
        participationPeriod: 1,
        role: "builder",
        status: "active",
        updatedAt: BASE_TIME,
        validFrom: BASE_TIME,
        workosUserId: "retention-builder",
      })
    );
    const builder = t.withIdentity({
      email: "builder@example.com",
      name: "builder",
      organizationId: fixture.organizationId,
      role: "builder",
      roles: ["builder"],
      subject: "retention-builder",
      tokenIdentifier: "https://api.workos.com/|retention-builder",
      "https://fairlend.ca/actor_kind": "human",
    } as never);
    await expect(
      builder.mutation(
        (api as any).data_retention.approveAndDeleteDataRetentionFile,
        {
          administrativeCapacity: "builder",
          assetId: fixture.assetId,
          breakGlassConfirmed: false,
          buildId: fixture.buildId,
          confirmed: true,
          organizationId: fixture.organizationId,
          reason: "Builder must not dispose of retained source bytes",
        },
      ),
    ).rejects.toThrow("Physical file deletion requires Brokerage Admin");
    const admin = t.withIdentity({
      email: "admin@example.com",
      name: "admin",
      organizationId: fixture.organizationId,
      role: "admin",
      roles: ["admin"],
      subject: "retention-admin",
      tokenIdentifier: "https://api.workos.com/|retention-admin",
      "https://fairlend.ca/actor_kind": "human",
    } as never);
    await t.run(async (ctx) => {
      const asset = await ctx.db.get(fixture.assetId);
      if (!asset) {
        throw new Error("Expected the retained source asset.");
      }
      await ctx.storage.delete(asset.storageId);
    });
    const input = {
      administrativeCapacity: "admin",
      assetId: fixture.assetId,
      breakGlassConfirmed: true,
      buildId: fixture.buildId,
      confirmed: true,
      organizationId: fixture.organizationId,
      reason: "Approved physical disposal after retention review",
    };
    const deleted = await admin.mutation(
      (api as any).data_retention.approveAndDeleteDataRetentionFile,
      input,
    );
    const replay = await admin.mutation(
      (api as any).data_retention.approveAndDeleteDataRetentionFile,
      input,
    );
    expect(replay).toEqual(deleted);
    const tombstoneId = deleted.tombstoneId as Id<"dataRetentionTombstones">;
    const tombstone = await t.run((ctx) => ctx.db.get(tombstoneId));
    expect(tombstone).toMatchObject({
      physicalStorageDeletedAt: BASE_TIME,
      scopeId: String(fixture.assetId),
    });
    expect(tombstone?.auditEventId).toBeTruthy();
    const auditEventId = tombstone?.auditEventId;
    expect(
      auditEventId
        ? await t.run((ctx) => ctx.db.get(auditEventId))
        : null
    ).toMatchObject({ eventType: "data_retention.physical_file.deleted" });
  });

  test("requires explicit Brokerage Admin break-glass and a fresh verified backup for restore", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const t = convexTest(schema, modules);
    const fixture = await seedBuild(t, "org_retention_restore", {});
    const admin = t.withIdentity({
      email: "restore-admin@example.com",
      name: "restore-admin",
      organizationId: fixture.organizationId,
      role: "admin",
      roles: ["admin"],
      subject: "restore-admin",
      tokenIdentifier: "https://api.workos.com/|restore-admin",
      "https://fairlend.ca/actor_kind": "human",
    } as never);
    const manifestId = await t.mutation(
      internal.data_retention.recordDataRetentionBackupManifest,
      {
        backupDate: "2026-08-03",
        brokerageId: fixture.brokerageId,
        buildCount: 1,
        capturedAt: BASE_TIME,
        documentsCount: 1,
        manifestJson: "{}",
        manifestSha256: await testSha256("{}"),
        organizationId: fixture.organizationId,
        relationshipCount: 0,
        revisionLineageCount: 0,
        rpoDeadlineAt: BASE_TIME + DAY_MS,
        state: "verified",
        storageBytes: 0,
        storageObjectsCount: 0,
      },
    );
    await expect(
      admin.mutation((api as any).data_retention.startDataRetentionRestore, {
        administrativeCapacity: "admin",
        breakGlassConfirmed: false,
        buildId: fixture.buildId,
        confirmed: true,
        correctionHistoryJson: "{}",
        freshBackupManifestId: manifestId,
        incidentReference: "INC-402-1",
        organizationId: fixture.organizationId,
        reason: "Restore test",
      }),
    ).rejects.toThrow("break-glass");
    const staleManifestId = await t.mutation(
      internal.data_retention.recordDataRetentionBackupManifest,
      {
        backupDate: "2026-08-01",
        brokerageId: fixture.brokerageId,
        buildCount: 1,
        capturedAt: BASE_TIME - 2 * DAY_MS,
        documentsCount: 1,
        manifestJson: "{}",
        manifestSha256: await testSha256("{}"),
        organizationId: fixture.organizationId,
        relationshipCount: 0,
        revisionLineageCount: 0,
        rpoDeadlineAt: BASE_TIME - DAY_MS,
        state: "verified",
        storageBytes: 0,
        storageObjectsCount: 0,
      },
    );
    await expect(
      admin.mutation((api as any).data_retention.startDataRetentionRestore, {
        administrativeCapacity: "admin",
        breakGlassConfirmed: true,
        buildId: fixture.buildId,
        confirmed: true,
        correctionHistoryJson: "{}",
        freshBackupManifestId: staleManifestId,
        incidentReference: "INC-402-STALE",
        organizationId: fixture.organizationId,
        reason: "Restore test with stale backup",
      }),
    ).rejects.toThrow("fresh verified backup");
    const expiredRpoManifestId = await t.mutation(
      internal.data_retention.recordDataRetentionBackupManifest,
      {
        backupDate: "2026-08-02",
        brokerageId: fixture.brokerageId,
        buildCount: 1,
        capturedAt: BASE_TIME - DAY_MS / 2,
        documentsCount: 1,
        manifestJson: "{}",
        manifestSha256: await testSha256("{}"),
        organizationId: fixture.organizationId,
        relationshipCount: 0,
        revisionLineageCount: 0,
        rpoDeadlineAt: BASE_TIME - DAY_MS / 2,
        state: "verified",
        storageBytes: 0,
        storageObjectsCount: 0,
      }
    );
    await expect(
      admin.mutation((api as any).data_retention.startDataRetentionRestore, {
        administrativeCapacity: "admin",
        breakGlassConfirmed: true,
        buildId: fixture.buildId,
        confirmed: true,
        correctionHistoryJson: "{}",
        freshBackupManifestId: expiredRpoManifestId,
        incidentReference: "INC-402-EXPIRED-RPO",
        organizationId: fixture.organizationId,
        reason: "Restore test with an expired RPO deadline",
      })
    ).rejects.toThrow("fresh verified backup");
    const restoreInput = {
      administrativeCapacity: "admin",
      breakGlassConfirmed: true,
      buildId: fixture.buildId,
      confirmed: true,
      correctionHistoryJson: "{}",
      freshBackupManifestId: manifestId,
      incidentReference: "INC-402-1",
      organizationId: fixture.organizationId,
      reason: "Restore test",
    };
    const started = await admin.mutation(
      (api as any).data_retention.startDataRetentionRestore,
      restoreInput,
    );
    expect(started.state).toBe("started");
    expect(
      await admin.mutation(
        (api as any).data_retention.startDataRetentionRestore,
        restoreInput,
      )
    ).toEqual(started);
    const incident = await t.run((ctx) => ctx.db.get(started.incidentId));
    expect(incident).toMatchObject({
      breakGlassConfirmed: true,
      freshBackupManifestId: manifestId,
      state: "started",
    });
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "dataRetentionRestoreIncident"),
        )
        .collect(),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.overrideKind).toBe("destructive_restore");
    expect(audits[0]?.breakGlass).toBe(true);
  });
});

async function seedTerminalQuoteDraft(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof seedBuild>>,
) {
  return await t.run(async (ctx) => {
    const terminalAt = BASE_TIME;
    const recipientProfileId = fixture.contractorProfileId;
    const quoteRoundId = await ctx.db.insert("quoteRounds", {
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      cancelledAt: terminalAt,
      cancelledByWorkosUserId: "retention-test",
      cancellationReason: "Quote Round cancelled for retention test",
      createdAt: terminalAt,
      createdByWorkosUserId: "retention-test",
      mode: "combined",
      organizationId: fixture.organizationId,
      proposalId: fixture.proposalId,
      revision: 1,
      state: "cancelled",
      title: "Terminal retention Quote Round",
      updatedAt: terminalAt,
    });
    const packageRevisionId = await ctx.db.insert("quotePackageRevisions", {
      buildId: fixture.buildId,
      brokerageId: fixture.brokerageId,
      organizationId: fixture.organizationId,
      permitDocumentId: fixture.buildDocumentId,
      permitDocumentVersion: 1,
      publishedAt: terminalAt,
      publishedByWorkosUserId: "retention-test",
      quoteRoundId,
      responseDeadline: terminalAt + DAY_MS,
      revision: 1,
      roadmapSnapshotFingerprint: "retention-roadmap",
      siteAddressSnapshot: "Retention Lane",
      siteMapUrlSnapshot: "",
      sourceDraftRevision: 1,
      templateId: fixture.templateId,
      templateVersionId: fixture.templateVersionId,
      timelineStartDateSnapshot: "2026-08-03",
    });
    await ctx.db.patch(quoteRoundId, { currentPackageRevisionId: packageRevisionId });
    const packageResponseFieldId = await ctx.db.insert("quotePackageRevisionResponseFields", {
      allowAlternates: false,
      allowExclusions: false,
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: terminalAt,
      fieldKey: "notes",
      isPermanent: false,
      kind: "long_text",
      label: "Notes",
      order: 1,
      organizationId: fixture.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      renderer: "input",
      repeatable: false,
      required: false,
      scope: "whole_quote",
      sourceTemplateFieldId: fixture.responseFieldId,
      supportsTax: false,
    });
    const invitationId = await ctx.db.insert("quoteRoundInvitations", {
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: terminalAt,
      currentQuotePackageRevisionId: packageRevisionId,
      organizationId: fixture.organizationId,
      participationState: "active",
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      recipientCapabilitiesSnapshot: ["contractor"],
      recipientEmailSnapshot: "retention@example.com",
      recipientNameSnapshot: "Retention Recipient",
      recipientProfileId,
      updatedAt: terminalAt,
    });
    const draftId = await ctx.db.insert("quoteInvitationResponseDrafts", {
      answeredFieldCount: 1,
      attachmentCount: 1,
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      commentsHtml: "<p>Recoverable terminal draft</p>",
      completedPricingLineCount: 1,
      createdAt: terminalAt,
      organizationId: fixture.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      quoteRoundInvitationId: invitationId,
      updatedAt: terminalAt,
      version: 3,
    });
    const storageId = await ctx.storage.store(
      new Blob(["terminal attachment"], { type: "text/plain" }),
    );
    const lineId = await ctx.db.insert("quoteInvitationResponseDraftLineItems", {
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: terminalAt,
      lineKey: "line-1",
      organizationId: fixture.organizationId,
      quotedAmountCents: 123,
      quoteInvitationResponseDraftId: draftId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      quoteRoundInvitationId: invitationId,
      scope: "whole_quote",
      source: "expanded_scope",
      title: "Retained line",
      updatedAt: terminalAt,
    });
    const answerId = await ctx.db.insert("quoteInvitationResponseDraftAnswers", {
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: terminalAt,
      fieldKey: "notes",
      organizationId: fixture.organizationId,
      quoteInvitationResponseDraftId: draftId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      quoteRoundInvitationId: invitationId,
      scope: "whole_quote",
      sourcePackageRevisionResponseFieldId: packageResponseFieldId,
      updatedAt: terminalAt,
      value: "redact me",
    });
    const attachmentId = await ctx.db.insert("quoteInvitationResponseDraftAttachments", {
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: terminalAt,
      fileName: "terminal.txt",
      mimeType: "text/plain",
      organizationId: fixture.organizationId,
      quoteInvitationResponseDraftId: draftId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      quoteRoundInvitationId: invitationId,
      sizeBytes: 19,
      storageId,
    });
    return { answerId, attachmentId, draftId, lineId };
  });
}

async function seedCredentialMaterial(
  t: ReturnType<typeof convexTest>,
  fixture: Awaited<ReturnType<typeof seedBuild>>,
) {
  return await t.run(async (ctx) => {
    const updatedAt = BASE_TIME - 30 * DAY_MS;
    const recipientProfileId = fixture.contractorProfileId;
    const quoteRoundId = await ctx.db.insert("quoteRounds", {
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: BASE_TIME,
      createdByWorkosUserId: "retention-test",
      mode: "combined",
      organizationId: fixture.organizationId,
      proposalId: fixture.proposalId,
      revision: 1,
      state: "open",
      title: "Credential retention Quote Round",
      updatedAt: BASE_TIME,
    });
    const packageRevisionId = await ctx.db.insert("quotePackageRevisions", {
      buildId: fixture.buildId,
      brokerageId: fixture.brokerageId,
      organizationId: fixture.organizationId,
      permitDocumentId: fixture.buildDocumentId,
      permitDocumentVersion: 1,
      publishedAt: BASE_TIME,
      publishedByWorkosUserId: "retention-test",
      quoteRoundId,
      responseDeadline: BASE_TIME + DAY_MS,
      revision: 1,
      roadmapSnapshotFingerprint: "retention-roadmap",
      siteAddressSnapshot: "Retention Lane",
      siteMapUrlSnapshot: "",
      sourceDraftRevision: 1,
      templateId: fixture.templateId,
      templateVersionId: fixture.templateVersionId,
      timelineStartDateSnapshot: "2026-08-03",
    });
    await ctx.db.patch(quoteRoundId, { currentPackageRevisionId: packageRevisionId });
    const invitationId = await ctx.db.insert("quoteRoundInvitations", {
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: updatedAt,
      currentQuotePackageRevisionId: packageRevisionId,
      organizationId: fixture.organizationId,
      participationState: "active",
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      recipientCapabilitiesSnapshot: ["contractor"],
      recipientEmailSnapshot: "credential@example.com",
      recipientNameSnapshot: "Credential Recipient",
      recipientProfileId,
      updatedAt,
    });
    const expiredCredentialId = await ctx.db.insert("quoteInvitationAccessCredentials", {
      accessExpiresAt: BASE_TIME + DAY_MS,
      accessGeneration: 1,
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      credentialVersion: 1,
      credentialVerifier: "expired-verifier",
      createdAt: updatedAt,
      organizationId: fixture.organizationId,
      purpose: "initial",
      quoteRoundId,
      quoteRoundInvitationId: invitationId,
      state: "expired",
      updatedAt,
    });
    const activeCredentialId = await ctx.db.insert("quoteInvitationAccessCredentials", {
      accessExpiresAt: BASE_TIME + DAY_MS,
      accessGeneration: 1,
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      credentialVersion: 2,
      credentialVerifier: "active-verifier",
      createdAt: updatedAt,
      organizationId: fixture.organizationId,
      purpose: "reminder",
      quoteRoundId,
      quoteRoundInvitationId: invitationId,
      state: "active",
      updatedAt,
    });
    const expiredSessionId = await ctx.db.insert("quoteInvitationBrowserSessions", {
      accessExpiresAt: BASE_TIME + DAY_MS,
      brokerageId: fixture.brokerageId,
      buildId: fixture.buildId,
      createdAt: updatedAt,
      lastActiveAt: updatedAt,
      organizationId: fixture.organizationId,
      quoteInvitationAccessCredentialId: expiredCredentialId,
      quoteRoundId,
      quoteRoundInvitationId: invitationId,
      sessionExpiresAt: BASE_TIME + DAY_MS,
      sessionVerifier: "expired-session-verifier",
      state: "expired",
      updatedAt,
    });
    return { activeCredentialId, expiredCredentialId, expiredSessionId, quoteRoundId };
  });
}

async function seedBuild(
  t: ReturnType<typeof convexTest>,
  organizationId: string,
  options: {
    buildClosedAt?: number;
    legalHold?: boolean;
    rejectedAssetAgeMs?: number;
  },
) {
  return await t.run(async (ctx) => {
    const now = BASE_TIME;
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: `${organizationId} Brokerage`,
      legalName: `${organizationId} Brokerage Inc.`,
      status: "active",
      updatedAt: now,
      workosOrganizationId: organizationId,
    });
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId,
      createdAt: now,
      displayName: `${organizationId} Builder`,
      legalName: `${organizationId} Builder Inc.`,
      organizationId,
      status: "active",
      updatedAt: now,
    });
    const contractorProfileId = await ctx.db.insert("contractorProfiles", {
      brokerageId,
      createdAt: now,
      email: `${organizationId}@example.com`,
      name: `${organizationId} Recipient`,
      normalizedEmail: `${organizationId}@example.com`,
      organizationId,
      quoteRecipientCapabilities: ["contractor"],
      status: "active",
      trades: [],
      updatedAt: now,
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 1_000_000,
      brokerageId,
      buildName: `${organizationId} Build`,
      builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "retention-test",
      lenderDrawPolicyLimitCents: 1_000_000,
      location: "Retention Lane",
      organizationId,
      reviewOutcome: "approved",
      status: "approved",
      totalBudgetCents: 1_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "retention-test",
    });
    const workflowRuleId = await ctx.db.insert("workflowRules", {
      allowPermitWaiverByRoles: [],
      brokerageId,
      createdAt: now,
      organizationId,
      proposalStates: ["approved"],
      requirePermitForApproval: false,
      ruleKey: `${organizationId}-retention`,
      settings: {},
      status: "active",
      updatedAt: now,
      version: 1,
    });
    const workflowRuleSnapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: [],
      brokerageId,
      createdAt: now,
      organizationId,
      proposalId,
      proposalStates: ["approved"],
      requirePermitForApproval: false,
      ruleKey: `${organizationId}-retention`,
      settings: {},
      version: 1,
      workflowRuleId,
    });
    const templateId = await ctx.db.insert("quoteResponseTemplates", {
      audience: "either",
      brokerageId,
      createdAt: now,
      createdByWorkosUserId: "retention-test",
      name: "Retention Template",
      organizationId,
      status: "active",
      templateKey: `${organizationId}-retention-template`,
      updatedAt: now,
    });
    const templateVersionId = await ctx.db.insert("quoteResponseTemplateVersions", {
      audience: "either",
      brokerageId,
      createdAt: now,
      createdByWorkosUserId: "retention-test",
      name: "Retention Template v1",
      organizationId,
      status: "published",
      templateId,
      updatedAt: now,
      validationState: "valid",
      version: 1,
    });
    const responseFieldId = await ctx.db.insert("quoteResponseTemplateFields", {
      allowAlternates: false,
      allowExclusions: false,
      brokerageId,
      createdAt: now,
      fieldKey: "notes",
      isPermanent: false,
      kind: "long_text",
      label: "Notes",
      organizationId,
      order: 1,
      renderer: "input",
      repeatable: false,
      required: false,
      scope: "whole_quote",
      supportsTax: false,
      templateId,
      updatedAt: now,
      versionId: templateVersionId,
    });
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId,
      buildName: `${organizationId} Build`,
      builderProfileId,
      createdAt: now,
      location: "Retention Lane",
      organizationId,
      proposalId,
      startDate: "2026-08-03",
      status: "active",
      totalBudgetCents: 1_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId, workflowRuleSnapshotId });
    const buildDocumentId = await ctx.db.insert("buildDocuments", {
      brokerageId,
      buildId,
      createdAt: now,
      documentType: "permit",
      fileName: "permit.pdf",
      mimeType: "application/pdf",
      organizationId,
      proposalId,
      sizeBytes: 1,
      status: "linked",
      updatedAt: now,
      uploadedByWorkosUserId: "retention-test",
      version: 1,
    });
    await ctx.db.patch(buildDocumentId, { buildId });
    if (options.buildClosedAt !== undefined) {
      await ctx.db.insert("buildCollaborationBuildStates", {
        brokerageId,
        buildId,
        closedAt: options.buildClosedAt,
        closedByRole: "admin",
        closedByWorkosUserId: "retention-test",
        closeReason: "Retention clock test",
        createdAt: now,
        organizationId,
        revision: 1,
        state: "closed",
        updatedAt: now,
      });
    }
    if (options.legalHold) {
      await ctx.db.insert("buildCollaborationLegalHolds", {
        brokerageId,
        buildId,
        organizationId,
        placedAt: now,
        placedByRole: "admin",
        placedByWorkosUserId: "retention-test",
        reason: "Active retention test hold",
        state: "active",
      });
    }
    let assetId;
    if (options.rejectedAssetAgeMs !== undefined) {
      const storageId = await ctx.storage.store(
        new Blob([`${organizationId}-isolated-asset`], { type: "text/plain" }),
      );
      const agedAt = now - options.rejectedAssetAgeMs;
      assetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId,
        buildId,
        contentHashSha256: `${organizationId}-asset-sha`,
        createdAt: agedAt,
        fileName: "rejected.txt",
        maximumAudienceMode: "build_wide",
        mimeType: "text/plain",
        organizationId,
        readerWorkosUserIds: [],
        scanCompletedAt: agedAt,
        scanMessage: "Scanner rejected asset",
        scanState: "rejected",
        sizeBytes: 32,
        state: "rejected",
        storageId,
        updatedAt: agedAt,
        uploadedByWorkosUserId: "retention-test",
        version: 1,
      });
    }
    return {
      assetId: assetId!,
      brokerageId,
      buildId,
      buildDocumentId,
      builderProfileId,
      contractorProfileId,
      organizationId,
      proposalId,
      responseFieldId,
      templateId,
      templateVersionId,
    };
  });
}

async function testSha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
