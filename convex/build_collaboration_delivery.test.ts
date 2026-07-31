/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_collaboration_delivery";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  input: { roles: string[]; subject: string }
) {
  return t.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId: ORGANIZATION_ID,
    role: input.roles[0],
    roles: input.roles,
    subject: input.subject,
    tokenIdentifier: `https://api.workos.com/|${input.subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedDeliveryBuild() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, {
    roles: ["admin", "principle-broker"],
    subject: "user_admin",
  });
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const buildId = await admin.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "Notification delivery Build",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    const workflowRuleSnapshotId = await ctx.db.insert(
      "workflowRuleSnapshots",
      {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId: foundation.brokerageId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalStates: ["draft", "submitted", "approved", "closed"],
        requirePermitForApproval: false,
        ruleKey: "default",
        settings: {},
        version: 1,
        workflowRuleId: foundation.workflowRuleId,
      }
    );
    const activeBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Notification delivery Build",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-07-31",
      status: "active",
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, {
      activeBuildId,
      workflowRuleSnapshotId,
    });
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
    return activeBuildId;
  });
  const participantId = await provisionBrokerParticipant(base, buildId);
  return {
    admin,
    base,
    broker: withIdentity(base, {
      roles: ["broker"],
      subject: "user_broker",
    }),
    buildId,
    participantId,
  };
}

async function provisionBrokerParticipant(
  base: ReturnType<typeof convexTest>,
  buildId: Id<"activeBuilds">
) {
  await base.mutation((internal as any).workosProjection.ingestWorkosEvent, {
    data: {
      email: "user_broker@example.com",
      email_verified: true,
      first_name: "Broker",
      id: "user_broker",
      last_name: "Reviewer",
    },
    event: "user.created",
    id: "delivery_user_broker_created",
  });
  await base.mutation((internal as any).workosProjection.ingestWorkosEvent, {
    data: {
      id: "membership_delivery_user_broker",
      organization_id: ORGANIZATION_ID,
      role: { slug: "broker" },
      roles: [{ slug: "broker" }],
      status: "active",
      user_id: "user_broker",
    },
    event: "organization_membership.created",
    id: "delivery_membership_broker_created",
  });
  return await base.run(async (ctx) => {
    const build = await ctx.db.get(buildId);
    if (!build) {
      throw new Error("Delivery Build fixture is unavailable.");
    }
    const now = Date.now();
    return await ctx.db.insert("buildParticipants", {
      brokerageId: build.brokerageId,
      buildId,
      createdAt: now,
      displayNameSnapshot: "Broker Reviewer",
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "broker",
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: "user_broker",
    });
  });
}

function publicationArgs(
  buildId: Id<"activeBuilds">,
  input: { assigned?: boolean; mentioned?: boolean; text: string }
) {
  return {
    actionItems: input.assigned
      ? [
          {
            assigneeWorkosUserId: "user_broker",
            descriptionPlainText: "Review this Build item.",
            descriptionTiptapJson: JSON.stringify({
              content: [
                {
                  content: [
                    { text: "Review this Build item.", type: "text" },
                  ],
                  type: "paragraph",
                },
              ],
              type: "doc",
            }),
            title: "Review Build item",
          },
        ]
      : [],
    audienceMode: "build_wide" as const,
    buildId,
    organizationId: ORGANIZATION_ID,
    plainText: input.text,
    postType: "update" as const,
    references: input.mentioned
      ? [
          {
            entityId: "user_broker",
            entityKind: "participant" as const,
            label: "Broker Reviewer",
          },
        ]
      : [],
    requestedReaderIds: [],
    tiptapJson: JSON.stringify({
      content: [
        {
          content: [{ text: input.text, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    }),
  };
}

async function processExternalDeliveries(
  base: ReturnType<typeof convexTest>,
  now: number
) {
  await base.action(
    (internal as any).build_collaboration_delivery
      .processBuildCollaborationExternalDeliveries,
    { asOf: now, batchSize: 100 }
  );
}

describe("Build collaboration external delivery", () => {
  beforeEach(() => {
    vi.stubEnv(
      "BUILD_COLLABORATION_EMAIL_DELIVERY_URL",
      "https://delivery.example.test/email"
    );
    vi.stubEnv(
      "BUILD_COLLABORATION_PUSH_DELIVERY_URL",
      "https://delivery.example.test/push"
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("queues direct email immediately while keeping push opt-in", async () => {
    const fixture = await seedDeliveryBuild();
    const defaults = await fixture.broker.query(
      (api as any).build_collaboration_notifications
        .getMyBuildCollaborationNotificationPreferences,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(defaults).toEqual(
      expect.objectContaining({
        digestCadence: "never",
        digestEnabled: false,
      })
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Broker, review this update.",
      })
    );

    const state = await fixture.base.run(async (ctx) => ({
      deliveries: (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).filter((row) => row.recipientWorkosUserId === "user_broker"),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    const deliveries = state.deliveries;
    expect(deliveries).toEqual([
      expect.objectContaining({
        cadence: "immediate",
        channel: "email",
        deliveryMode: "immediate",
        eventKind: "direct_mention",
        recipientWorkosUserId: "user_broker",
        status: "queued",
      }),
    ]);
    expect(
      state.scheduled.some(
        (scheduled) =>
          scheduled.state.kind === "pending" &&
          scheduled.name.endsWith(
            "build_collaboration_delivery:processBuildCollaborationExternalDeliveries"
          )
      )
    ).toBe(true);
  });

  test("bundles ordinary activity into ACL-safe daily email and push digests", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.broker.mutation(
      (api as any).build_collaboration_notifications
        .updateMyBuildCollaborationNotificationPreferences,
      {
        buildId: fixture.buildId,
        channels: ["in_app", "email", "push"],
        digestCadence: "daily",
        digestEnabled: true,
        ordinaryMuted: false,
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.broker.mutation(
      (api as any).build_collaboration_delivery
        .registerMyBuildCollaborationPushSubscription,
      {
        auth: "push-auth",
        buildId: fixture.buildId,
        endpoint: "https://push.example.test/subscription",
        organizationId: ORGANIZATION_ID,
        p256dh: "push-public-key",
      }
    );
    const visiblePostId = await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, { text: "Visible digest update." })
    );
    const revokedPostId = await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, { text: "Revoked digest update." })
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_editing
        .tombstoneBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId: revokedPostId,
      }
    );
    const queued = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).filter(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(queued).toHaveLength(4);
    expect(new Set(queued.map((row) => row.channel))).toEqual(
      new Set(["email", "push"])
    );

    const requests: Array<{ body: string; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ body: String(init?.body), url: String(url) });
        return new Response(null, {
          headers: { "x-message-id": `message-${requests.length}` },
          status: 202,
        });
      })
    );
    await processExternalDeliveries(
      fixture.base,
      Math.max(...queued.map((row) => row.scheduledFor))
    );

    const state = await fixture.base.run(async (ctx) => ({
      attempts: await ctx.db
        .query("buildCollaborationDeliveryAttempts")
        .collect(),
      deliveries: await ctx.db
        .query("buildCollaborationExternalDeliveries")
        .collect(),
    }));
    expect(
      state.deliveries.filter(
        (row) =>
          row.collaborationPostId === revokedPostId &&
          row.recipientWorkosUserId === "user_broker"
      )
    ).toEqual([
      expect.objectContaining({ status: "cancelled" }),
      expect.objectContaining({ status: "cancelled" }),
    ]);
    const brokerRequests = requests.filter((request) =>
      request.body.includes('"recipientWorkosUserId":"user_broker"')
    );
    expect(
      state.attempts.filter((attempt) =>
        attempt.deliveryIds.some((deliveryId) =>
          queued.some((delivery) => delivery._id === deliveryId)
        )
      )
    ).toHaveLength(2);
    expect(brokerRequests).toHaveLength(2);
    for (const request of brokerRequests) {
      expect(request.body).toContain("Visible digest update.");
      expect(request.body).toContain(visiblePostId);
      expect(request.body).not.toContain("Revoked digest update.");
      expect(request.body).not.toContain(revokedPostId);
    }
    await processExternalDeliveries(fixture.base, Number.MAX_SAFE_INTEGER);
    expect(
      requests.filter((request) =>
        request.body.includes('"recipientWorkosUserId":"user_broker"')
      )
    ).toHaveLength(2);
  });

  test("does not let ordinary mute suppress a critical assignment", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.broker.mutation(
      (api as any).build_collaboration_notifications
        .updateMyBuildCollaborationNotificationPreferences,
      {
        buildId: fixture.buildId,
        channels: ["email"],
        digestCadence: "never",
        digestEnabled: false,
        ordinaryMuted: true,
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        assigned: true,
        text: "Critical assignment.",
      })
    );
    const deliveries = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).filter(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(deliveries).toEqual([
      expect.objectContaining({
        cadence: "immediate",
        channel: "email",
        eventKind: "assignment",
        status: "queued",
      }),
    ]);
  });

  test("reschedules queued digest work when cadence changes", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.broker.mutation(
      (api as any).build_collaboration_notifications
        .updateMyBuildCollaborationNotificationPreferences,
      {
        buildId: fixture.buildId,
        channels: ["in_app", "email"],
        digestCadence: "daily",
        digestEnabled: true,
        ordinaryMuted: false,
        organizationId: ORGANIZATION_ID,
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, { text: "Cadence-safe update." })
    );
    const daily = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).find(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(daily).toEqual(expect.objectContaining({ cadence: "daily" }));

    await fixture.broker.mutation(
      (api as any).build_collaboration_notifications
        .updateMyBuildCollaborationNotificationPreferences,
      {
        buildId: fixture.buildId,
        channels: ["in_app", "email"],
        digestCadence: "weekly",
        digestEnabled: true,
        ordinaryMuted: false,
        organizationId: ORGANIZATION_ID,
      }
    );
    const weekly = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).find(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(weekly).toEqual(
      expect.objectContaining({ cadence: "weekly", status: "queued" })
    );
    expect(weekly?.scheduledFor).not.toBe(daily?.scheduledFor);

    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          headers: { "x-message-id": "cadence-message" },
          status: 202,
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    await processExternalDeliveries(
      fixture.base,
      daily?.scheduledFor ?? Date.now()
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await processExternalDeliveries(
      fixture.base,
      weekly?.scheduledFor ?? Number.MAX_SAFE_INTEGER
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("cancels queued delivery immediately when participation is revoked", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "This preview must not escape after revocation.",
      })
    );
    await fixture.admin.mutation(
      (api as any).build_participants.removeBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        participantId: fixture.participantId,
        reason: "Recipient left the Build.",
      }
    );
    const delivery = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).find(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(delivery).toEqual(
      expect.objectContaining({
        cancellationReason: "participant_access_revoked",
        status: "cancelled",
      })
    );

    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await processExternalDeliveries(fixture.base, Number.MAX_SAFE_INTEGER);
    expect(
      fetchMock.mock.calls
        .map(([, init]) => String(init?.body))
        .filter((body) =>
          body.includes('"recipientWorkosUserId":"user_broker"')
        )
        .join(" ")
    ).not.toContain("This preview must not escape after revocation.");
  });

  test("scrubs an already-rendered outbox when access is revoked before send", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Restricted race-window preview.",
      })
    );
    await fixture.base.mutation(
      (internal as any).build_collaboration_delivery
        .prepareDueBuildCollaborationExternalDeliveries,
      { asOf: Number.MAX_SAFE_INTEGER, batchSize: 100 }
    );
    const beforeRevoke = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("eventOutbox").collect()).find((row) =>
        row.eventType.startsWith("build_collaboration.external_delivery.")
      )
    );
    expect(beforeRevoke?.payloadPreview).toContain(
      "Restricted race-window preview."
    );

    await fixture.admin.mutation(
      (api as any).build_participants.removeBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        participantId: fixture.participantId,
        reason: "Recipient left before provider handoff.",
      }
    );
    const afterRevoke = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("eventOutbox").collect()).find((row) =>
        row.eventType.startsWith("build_collaboration.external_delivery.")
      )
    );
    expect(afterRevoke).toEqual(
      expect.objectContaining({
        payloadPreview: expect.stringContaining('"redacted":true'),
        status: "failed",
      })
    );
    expect(afterRevoke?.payloadPreview).not.toContain(
      "Restricted race-window preview."
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    if (!afterRevoke) {
      throw new Error("Expected a revocation-safe outbox fixture.");
    }
    await fixture.base.action(
      (internal as any).build_collaboration_delivery
        .dispatchBuildCollaborationExternalOutbox,
      { eventOutboxId: afterRevoke._id }
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("reclaims an interrupted dispatch after its lease with stable idempotency", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Lease recovery alert.",
      })
    );
    const firstOutboxIds = await fixture.base.mutation(
      (internal as any).build_collaboration_delivery
        .prepareDueBuildCollaborationExternalDeliveries,
      { asOf: Date.now(), batchSize: 100 }
    );
    expect(firstOutboxIds).toHaveLength(1);
    const interrupted = await fixture.base.run(async (ctx) => ({
      attempts: await ctx.db
        .query("buildCollaborationDeliveryAttempts")
        .collect(),
      delivery: (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker"),
    }));
    expect(interrupted.delivery).toEqual(
      expect.objectContaining({ status: "dispatched" })
    );
    const early = await fixture.base.mutation(
      (internal as any).build_collaboration_delivery
        .prepareDueBuildCollaborationExternalDeliveries,
      {
        asOf: (interrupted.delivery?.leaseExpiresAt ?? Date.now()) - 1,
        batchSize: 100,
      }
    );
    expect(early).toEqual([]);
    const reclaimed = await fixture.base.mutation(
      (internal as any).build_collaboration_delivery
        .prepareDueBuildCollaborationExternalDeliveries,
      {
        asOf: interrupted.delivery?.leaseExpiresAt ?? Number.MAX_SAFE_INTEGER,
        batchSize: 100,
      }
    );
    expect(reclaimed).toHaveLength(1);
    const afterReclaim = await fixture.base.run(async (ctx) => ({
      attempts: await ctx.db
        .query("buildCollaborationDeliveryAttempts")
        .collect(),
      outboxes: (
        await ctx.db.query("eventOutbox").collect()
      ).filter((row) =>
        row.eventType.startsWith("build_collaboration.external_delivery.")
      ),
    }));
    expect(afterReclaim.attempts).toHaveLength(2);
    expect(afterReclaim.attempts[0]).toEqual(
      expect.objectContaining({
        safeError: "dispatch_lease_expired",
        state: "failed",
      })
    );
    expect(afterReclaim.attempts[1].providerIdempotencyKey).toBe(
      afterReclaim.attempts[0].providerIdempotencyKey
    );
    expect(afterReclaim.outboxes[0]).toEqual(
      expect.objectContaining({
        payloadPreview: expect.stringContaining('"redacted":true'),
        status: "failed",
      })
    );

    const fetchMock = vi.fn(
      async () => new Response(null, { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await fixture.base.action(
      (internal as any).build_collaboration_delivery
        .dispatchBuildCollaborationExternalOutbox,
      { eventOutboxId: reclaimed[0] }
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).find(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(sent).toEqual(
      expect.objectContaining({ attemptCount: 2, status: "sent" })
    );
  });

  test("retries provider failures with one stable idempotency key", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Retry this direct alert.",
      })
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { "x-message-id": "provider-message-1" },
          status: 202,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await processExternalDeliveries(fixture.base, Date.now());
    const failed = await fixture.base.run(async (ctx) => ({
      attempts: await ctx.db
        .query("buildCollaborationDeliveryAttempts")
        .collect(),
      delivery: (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker"),
    }));
    expect(failed.delivery).toEqual(
      expect.objectContaining({
        attemptCount: 1,
        lastError: "External delivery failed with HTTP 503.",
        status: "queued",
      })
    );
    expect(failed.attempts).toEqual([
      expect.objectContaining({ state: "failed" }),
    ]);

    await processExternalDeliveries(
      fixture.base,
      failed.delivery?.scheduledFor ?? Number.MAX_SAFE_INTEGER
    );
    await processExternalDeliveries(
      fixture.base,
      failed.delivery?.scheduledFor ?? Number.MAX_SAFE_INTEGER
    );
    const finalState = await fixture.base.run(async (ctx) => ({
      attempts: await ctx.db
        .query("buildCollaborationDeliveryAttempts")
        .collect(),
      delivery: (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker"),
    }));
    expect(finalState.delivery).toEqual(
      expect.objectContaining({ attemptCount: 2, status: "sent" })
    );
    expect(finalState.attempts).toHaveLength(2);
    expect(finalState.attempts[1]).toEqual(
      expect.objectContaining({
        providerMessageId: "provider-message-1",
        state: "succeeded",
      })
    );
    const idempotencyKeys = fetchMock.mock.calls.map(
      ([, init]) => new Headers(init?.headers).get("idempotency-key")
    );
    expect(new Set(idempotencyKeys).size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
