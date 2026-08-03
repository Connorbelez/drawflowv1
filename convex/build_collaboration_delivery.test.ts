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

async function seedQueuedExternalDeliveries(
  base: ReturnType<typeof convexTest>,
  buildId: Id<"activeBuilds">,
  count: number
) {
  await base.run(async (ctx) => {
    const build = await ctx.db.get(buildId);
    if (!build) {
      throw new Error("Delivery Build fixture is unavailable.");
    }
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("buildCollaborationExternalDeliveries", {
        attemptCount: 0,
        brokerageId: build.brokerageId,
        buildId,
        cadence: "daily",
        channel: "email",
        createdAt: now - count + index,
        dedupeKey: `overflow-delivery-${index}`,
        deliveryMode: "digest",
        eventKind: "ordinary_activity",
        organizationId: ORGANIZATION_ID,
        recipientParticipationPeriod: 1,
        recipientWorkosUserId: "user_broker",
        scheduledFor: now + 86_400_000,
        status: "queued",
        updatedAt: now - count + index,
      });
    }
  });
}

async function muteBuilderOrdinaryActivity(
  base: ReturnType<typeof convexTest>,
  buildId: Id<"activeBuilds">
) {
  await base.run(async (ctx) => {
    const build = await ctx.db.get(buildId);
    if (!build) {
      throw new Error("Delivery Build fixture is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildCollaborationNotificationPreferences", {
      brokerageId: build.brokerageId,
      buildId,
      channels: ["in_app", "email"],
      createdAt: now,
      digestCadence: "never",
      digestEnabled: false,
      ordinaryMuted: true,
      organizationId: ORGANIZATION_ID,
      updatedAt: now,
      workosUserId: "user_builder",
    });
  });
}

function publicationArgs(
  buildId: Id<"activeBuilds">,
  input: {
    assigned?: boolean;
    mentioned?: boolean;
    notificationChannel?: "in_app" | "email" | "push";
    text: string;
  }
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
    notificationEffects: input.notificationChannel
      ? [
          {
            channel: input.notificationChannel,
            recipientWorkosUserIds: ["user_broker"],
            summary: input.text,
          },
        ]
      : [],
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
    (internal as any).build_collaboration_delivery_transport
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
    vi.useRealTimers();
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
        digestCadence: "daily",
        digestEnabled: true,
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
            "build_collaboration_delivery_transport:processBuildCollaborationExternalDeliveries"
          )
      )
    ).toBe(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 202 }))
    );
    await processExternalDeliveries(fixture.base, Date.now());
  });

  test("enforces an approved delivery channel and bounds its rendered preview", async () => {
    const fixture = await seedDeliveryBuild();
    const text = `Approved push alert ${"x".repeat(1200)}`;
    const args = publicationArgs(fixture.buildId, {
      mentioned: true,
      notificationChannel: "push",
      text,
    });

    await expect(
      fixture.admin.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        args
      )
    ).rejects.toThrow("approved push notification channel is not enabled");

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
      (api as any).build_collaboration_delivery_api
        .registerMyBuildCollaborationPushSubscription,
      {
        auth: "push-auth",
        buildId: fixture.buildId,
        endpoint: "https://push.example.test/subscription",
        organizationId: ORGANIZATION_ID,
        p256dh: "push-public-key",
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      args
    );

    const deliveries = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).filter(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(deliveries.map((delivery) => delivery.channel).sort()).toEqual([
      "email",
      "push",
    ]);

    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(null, { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await processExternalDeliveries(fixture.base, Date.now());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      const payload = JSON.parse(String(init?.body));
      expect(payload.items[0].body.length).toBeLessThanOrEqual(280);
    }
  });

  test("authorizes delivery activity against the requested tenant", async () => {
    const fixture = await seedDeliveryBuild();
    await expect(
      fixture.broker.query(
        (api as any).build_collaboration_delivery_api
          .listMyBuildCollaborationExternalDeliveryActivity,
        { organizationId: "org_not_authorized" }
      )
    ).rejects.toThrow();
  });

  test("delivers push notifications to every active device registered for the Build", async () => {
    const fixture = await seedDeliveryBuild();
    for (const endpoint of ["device-one", "device-two"]) {
      await fixture.broker.mutation(
        (api as any).build_collaboration_delivery_api
          .registerMyBuildCollaborationPushSubscription,
        {
          auth: `auth-${endpoint}`,
          buildId: fixture.buildId,
          endpoint: `https://push.example.test/${endpoint}`,
          organizationId: ORGANIZATION_ID,
          p256dh: `key-${endpoint}`,
        }
      );
    }
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Notify every registered browser.",
      })
    );
    const requests: Array<Record<string, any>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 202 });
      })
    );

    await processExternalDeliveries(fixture.base, Date.now());

    const push = requests.find((request) => request.channel === "push");
    expect(push?.contact.subscriptions).toEqual([
      expect.objectContaining({ endpoint: "https://push.example.test/device-one" }),
      expect.objectContaining({ endpoint: "https://push.example.test/device-two" }),
    ]);
  });

  test("atomically transfers a shared browser endpoint to its current WorkOS user", async () => {
    vi.useFakeTimers();
    const fixture = await seedDeliveryBuild();
    const endpoint = "https://push.example.test/shared-browser";
    await fixture.broker.mutation(
      (api as any).build_collaboration_delivery_api
        .registerMyBuildCollaborationPushSubscription,
      {
        auth: "broker-auth",
        buildId: fixture.buildId,
        endpoint,
        organizationId: ORGANIZATION_ID,
        p256dh: "broker-key",
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_delivery_api
        .registerMyBuildCollaborationPushSubscription,
      {
        auth: "admin-auth",
        buildId: fixture.buildId,
        endpoint,
        organizationId: ORGANIZATION_ID,
        p256dh: "admin-key",
      }
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    expect(
      await fixture.broker.query(
        (api as any).build_collaboration_delivery_api
          .getMyBuildCollaborationPushSubscription,
        { buildId: fixture.buildId, endpoint, organizationId: ORGANIZATION_ID }
      )
    ).toBeNull();
    expect(
      await fixture.admin.query(
        (api as any).build_collaboration_delivery_api
          .getMyBuildCollaborationPushSubscription,
        { buildId: fixture.buildId, endpoint, organizationId: ORGANIZATION_ID }
      )
    ).toEqual(expect.objectContaining({ endpoint }));
    const brokerPreference = await fixture.broker.query(
      (api as any).build_collaboration_notifications
        .getMyBuildCollaborationNotificationPreferences,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(brokerPreference.channels).not.toContain("push");
  });

  test("does not let stale transfer cleanup revoke an endpoint reacquired by its original user", async () => {
    vi.useFakeTimers();
    const fixture = await seedDeliveryBuild();
    const endpoint = "https://push.example.test/round-trip-browser";
    const register = async (
      actor: typeof fixture.broker,
      key: string
    ) =>
      await actor.mutation(
        (api as any).build_collaboration_delivery_api
          .registerMyBuildCollaborationPushSubscription,
        {
          auth: `${key}-auth`,
          buildId: fixture.buildId,
          endpoint,
          organizationId: ORGANIZATION_ID,
          p256dh: `${key}-key`,
        }
      );

    await register(fixture.broker, "broker-first");
    await register(fixture.admin as typeof fixture.broker, "admin");
    await register(fixture.broker, "broker-current");
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    expect(
      await fixture.broker.query(
        (api as any).build_collaboration_delivery_api
          .getMyBuildCollaborationPushSubscription,
        { buildId: fixture.buildId, endpoint, organizationId: ORGANIZATION_ID }
      )
    ).toEqual(expect.objectContaining({ endpoint }));
    expect(
      await fixture.admin.query(
        (api as any).build_collaboration_delivery_api
          .getMyBuildCollaborationPushSubscription,
        { buildId: fixture.buildId, endpoint, organizationId: ORGANIZATION_ID }
      )
    ).toBeNull();
    const owner = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("buildCollaborationPushEndpointOwners")
        .withIndex("by_endpoint", (query) => query.eq("endpoint", endpoint))
        .unique()
    );
    expect(owner).toMatchObject({ revision: 3, workosUserId: "user_broker" });
  });

  test("cleans every displaced owner across a multi-hop endpoint transfer", async () => {
    vi.useFakeTimers();
    const fixture = await seedDeliveryBuild();
    const thirdOwner = withIdentity(fixture.base, {
      roles: ["admin"],
      subject: "user_admin_successor",
    });
    const endpoint = "https://push.example.test/multi-hop-browser";
    const register = async (actor: typeof fixture.broker, key: string) =>
      await actor.mutation(
        (api as any).build_collaboration_delivery_api
          .registerMyBuildCollaborationPushSubscription,
        {
          auth: `${key}-auth`,
          buildId: fixture.buildId,
          endpoint,
          organizationId: ORGANIZATION_ID,
          p256dh: `${key}-key`,
        }
      );

    await register(fixture.broker, "broker");
    await register(fixture.admin as typeof fixture.broker, "admin");
    await register(thirdOwner as typeof fixture.broker, "successor");
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    vi.useRealTimers();

    const subscriptions = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("buildCollaborationPushSubscriptions")
        .withIndex("by_endpoint_and_state", (query) =>
          query.eq("endpoint", endpoint).eq("state", "active")
        )
        .collect()
    );
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.workosUserId).toBe("user_admin_successor");
    for (const actor of [fixture.broker, fixture.admin]) {
      expect(
        await actor.query(
          (api as any).build_collaboration_delivery_api
            .getMyBuildCollaborationPushSubscription,
          { buildId: fixture.buildId, endpoint, organizationId: ORGANIZATION_ID }
        )
      ).toBeNull();
    }
  });

  test("prunes stale ownership bindings before enforcing the per-Build device cap", async () => {
    const fixture = await seedDeliveryBuild();
    const staleEndpoints = Array.from(
      { length: 20 },
      (_, index) => `https://push.example.test/stale-${index}`
    );
    for (const endpoint of staleEndpoints) {
      await fixture.broker.mutation(
        (api as any).build_collaboration_delivery_api
          .registerMyBuildCollaborationPushSubscription,
        {
          auth: `auth-${endpoint}`,
          buildId: fixture.buildId,
          endpoint,
          organizationId: ORGANIZATION_ID,
          p256dh: `key-${endpoint}`,
        }
      );
    }
    await fixture.base.run(async (ctx) => {
      const owners = await ctx.db
        .query("buildCollaborationPushEndpointOwners")
        .collect();
      for (const owner of owners) {
        await ctx.db.patch(owner._id, {
          revision: owner.revision + 1,
          workosUserId: "user_admin",
        });
      }
    });

    const currentEndpoint = "https://push.example.test/current-device";
    await expect(
      fixture.broker.mutation(
        (api as any).build_collaboration_delivery_api
          .registerMyBuildCollaborationPushSubscription,
        {
          auth: "current-auth",
          buildId: fixture.buildId,
          endpoint: currentEndpoint,
          organizationId: ORGANIZATION_ID,
          p256dh: "current-key",
        }
      )
    ).resolves.toBeDefined();
    const bindings = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("buildCollaborationPushEndpointBuildBindings")
        .withIndex(
          "by_organizationId_and_workosUserId_and_buildId_and_endpoint",
          (query) =>
            query
              .eq("organizationId", ORGANIZATION_ID)
              .eq("workosUserId", "user_broker")
              .eq("buildId", fixture.buildId)
        )
        .collect()
    );
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.endpoint).toBe(currentEndpoint);
  });

  test("revokes only the current Build device and removes push after the last device", async () => {
    const fixture = await seedDeliveryBuild();
    const endpoints = [
      "https://push.example.test/device-one",
      "https://push.example.test/device-two",
    ];
    for (const endpoint of endpoints) {
      await fixture.broker.mutation(
        (api as any).build_collaboration_delivery_api
          .registerMyBuildCollaborationPushSubscription,
        {
          auth: `auth-${endpoint}`,
          buildId: fixture.buildId,
          endpoint,
          organizationId: ORGANIZATION_ID,
          p256dh: `key-${endpoint}`,
        }
      );
    }
    await fixture.broker.mutation(
      (api as any).build_collaboration_delivery_api
        .revokeMyBuildCollaborationPushSubscription,
      {
        buildId: fixture.buildId,
        endpoint: endpoints[0],
        organizationId: ORGANIZATION_ID,
      }
    );
    const afterFirst = await fixture.broker.query(
      (api as any).build_collaboration_notifications
        .getMyBuildCollaborationNotificationPreferences,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(afterFirst.channels).toContain("push");
    expect(
      await fixture.broker.query(
        (api as any).build_collaboration_delivery_api
          .getMyBuildCollaborationPushSubscription,
        {
          buildId: fixture.buildId,
          endpoint: endpoints[1],
          organizationId: ORGANIZATION_ID,
        }
      )
    ).not.toBeNull();

    await fixture.broker.mutation(
      (api as any).build_collaboration_delivery_api
        .revokeMyBuildCollaborationPushSubscription,
      {
        buildId: fixture.buildId,
        endpoint: endpoints[1],
        organizationId: ORGANIZATION_ID,
      }
    );
    const afterLast = await fixture.broker.query(
      (api as any).build_collaboration_notifications
        .getMyBuildCollaborationNotificationPreferences,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(afterLast.channels).not.toContain("push");
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
      (api as any).build_collaboration_delivery_api
        .registerMyBuildCollaborationPushSubscription,
      {
        auth: "push-auth",
        buildId: fixture.buildId,
        endpoint: "https://push.example.test/subscription",
        organizationId: ORGANIZATION_ID,
        p256dh: "push-public-key",
      }
    );
    expect(
      await fixture.broker.query(
        (api as any).build_collaboration_delivery_api
          .getMyBuildCollaborationPushSubscription,
        {
          buildId: fixture.buildId,
          endpoint: "https://push.example.test/subscription",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).toEqual(
      expect.objectContaining({
        endpoint: "https://push.example.test/subscription",
      })
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
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-07-31T14:30:00.000Z"));
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
      async (_url: string | URL | Request, _init?: RequestInit) =>
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
    expect(
      fetchMock.mock.calls.some(([, init]) =>
        String(init?.body).includes(
          '"recipientWorkosUserId":"user_broker"'
        )
      )
    ).toBe(false);
    await processExternalDeliveries(
      fixture.base,
      weekly?.scheduledFor ?? Number.MAX_SAFE_INTEGER
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        String(init?.body).includes(
          '"recipientWorkosUserId":"user_broker"'
        )
      )
    ).toHaveLength(1);
  });

  test("does not backfill historical notifications when a channel is enabled", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Historical email-only mention.",
      })
    );
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
    let deliveries = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).filter(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].channel).toBe("email");

    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Future email and push mention.",
      })
    );
    deliveries = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).filter(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    expect(deliveries).toHaveLength(3);
    expect(deliveries.filter((row) => row.channel === "push")).toHaveLength(1);
  });

  test("reconciles preference changes beyond five hundred queued rows", async () => {
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
    await seedQueuedExternalDeliveries(fixture.base, fixture.buildId, 501);

    vi.useFakeTimers();
    try {
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
      await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }
    const rows = await fixture.base.run((ctx) =>
      ctx.db.query("buildCollaborationExternalDeliveries").collect()
    );
    expect(rows).toHaveLength(501);
    expect(rows.every((row) => row.cadence === "weekly")).toBe(true);
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

  test("cancels revocation overflow beyond five hundred queued rows", async () => {
    const fixture = await seedDeliveryBuild();
    await seedQueuedExternalDeliveries(fixture.base, fixture.buildId, 501);

    vi.useFakeTimers();
    try {
      await fixture.admin.mutation(
        (api as any).build_participants.removeBuildParticipant,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          participantId: fixture.participantId,
          reason: "Overflow revocation coverage.",
        }
      );
      await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
      await fixture.admin.mutation(
        (api as any).build_participants.reinviteBuildParticipant,
        {
          buildId: fixture.buildId,
          displayName: "Broker Reviewer",
          organizationId: ORGANIZATION_ID,
          role: "broker",
          workosUserId: "user_broker",
        }
      );
      await fixture.base.run(async (ctx) => {
        const build = await ctx.db.get(fixture.buildId);
        if (!build) {
          throw new Error("Delivery Build fixture is unavailable.");
        }
        const now = Date.now();
        await ctx.db.insert("buildCollaborationExternalDeliveries", {
          attemptCount: 0,
          brokerageId: build.brokerageId,
          buildId: build._id,
          cadence: "immediate",
          channel: "email",
          createdAt: now,
          dedupeKey: "reinvited-period-delivery",
          deliveryMode: "immediate",
          eventKind: "direct_mention",
          organizationId: ORGANIZATION_ID,
          recipientParticipationPeriod: 2,
          recipientWorkosUserId: "user_broker",
          scheduledFor: now,
          status: "queued",
          updatedAt: now,
        });
      });
    } finally {
      vi.useRealTimers();
    }
    const rows = await fixture.base.run((ctx) =>
      ctx.db.query("buildCollaborationExternalDeliveries").collect()
    );
    expect(rows).toHaveLength(502);
    expect(
      rows
        .filter((row) => row.dedupeKey.startsWith("overflow-delivery-"))
        .every((row) => row.status === "cancelled")
    ).toBe(true);
    expect(
      rows.find((row) => row.dedupeKey === "reinvited-period-delivery")
    ).toEqual(
      expect.objectContaining({
        recipientParticipationPeriod: 2,
        status: "queued",
      })
    );
    const reinvited = rows.find(
      (row) => row.dedupeKey === "reinvited-period-delivery"
    );
    expect(reinvited?.createdAt).toBeGreaterThanOrEqual(
      rows[0]?.cancelledAt ?? 0
    );
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
      (internal as any).build_collaboration_delivery_maintenance
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
      (internal as any).build_collaboration_delivery_transport
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
      (internal as any).build_collaboration_delivery_maintenance
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
      (internal as any).build_collaboration_delivery_maintenance
        .prepareDueBuildCollaborationExternalDeliveries,
      {
        asOf: (interrupted.delivery?.leaseExpiresAt ?? Date.now()) - 1,
        batchSize: 100,
      }
    );
    expect(early).toEqual([]);
    const reclaimed = await fixture.base.mutation(
      (internal as any).build_collaboration_delivery_maintenance
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
      (internal as any).build_collaboration_delivery_transport
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

  test("revalidates post-owned assets before provider handoff", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Review the attached inspection record.",
      })
    );
    const assetId = await fixture.base.run(async (ctx) => {
      const delivery = (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker");
      const post = delivery?.collaborationPostId
        ? await ctx.db.get(delivery.collaborationPostId)
        : null;
      if (!(delivery && post?.currentRevisionId)) {
        throw new Error("Expected a published post delivery fixture.");
      }
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Expected the delivery Build fixture.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["inspection"], { type: "application/pdf" })
      );
      const now = Date.now();
      const createdAssetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        fileName: "inspection.pdf",
        maximumAudienceMode: "custom",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        originatingPostId: post._id,
        readerWorkosUserIds: ["user_broker"],
        sizeBytes: 10,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
      await ctx.db.insert("buildCollaborationAttachments", {
        attachmentId: createdAssetId,
        attachmentKind: "collaborationAsset",
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        organizationId: ORGANIZATION_ID,
        ownerKind: "postRevision",
        ownerRecordId: post.currentRevisionId,
      });
      return createdAssetId;
    });
    const outboxIds = await fixture.base.mutation(
      (internal as any).build_collaboration_delivery_maintenance
        .prepareDueBuildCollaborationExternalDeliveries,
      { asOf: Date.now(), batchSize: 100 }
    );
    expect(outboxIds).toHaveLength(1);
    await fixture.base.run((ctx) =>
      ctx.db.patch(assetId, {
        scanMessage: "Malware scan failed.",
        state: "quarantined",
        updatedAt: Date.now(),
      })
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await fixture.base.action(
      (internal as any).build_collaboration_delivery_transport
        .dispatchBuildCollaborationExternalOutbox,
      { eventOutboxId: outboxIds[0] }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const state = await fixture.base.run(async (ctx) => ({
      delivery: (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker"),
      outbox: await ctx.db.get(outboxIds[0]),
    }));
    expect(state.delivery).toEqual(
      expect.objectContaining({
        cancellationReason: "access_revoked",
        status: "cancelled",
      })
    );
    expect(state.outbox).toEqual(
      expect.objectContaining({
        payloadPreview: expect.stringContaining('"redacted":true'),
        status: "failed",
      })
    );
  });

  test("revalidates the exact source revision before retrying an immutable batch", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Original restricted attachment context.",
      })
    );
    const assetId = await fixture.base.run(async (ctx) => {
      const delivery = (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker");
      const post = delivery?.collaborationPostId
        ? await ctx.db.get(delivery.collaborationPostId)
        : null;
      const build = await ctx.db.get(fixture.buildId);
      if (!(delivery?.collaborationPostRevisionId && post && build)) {
        throw new Error("Expected an exact source revision fixture.");
      }
      const storageId = await ctx.storage.store(
        new Blob(["restricted"], { type: "application/pdf" })
      );
      const now = Date.now();
      const createdAssetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        fileName: "restricted.pdf",
        maximumAudienceMode: "custom",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        originatingPostId: post._id,
        readerWorkosUserIds: ["user_broker"],
        sizeBytes: 10,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
      await ctx.db.insert("buildCollaborationAttachments", {
        attachmentId: createdAssetId,
        attachmentKind: "collaborationAsset",
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        organizationId: ORGANIZATION_ID,
        ownerKind: "postRevision",
        ownerRecordId: delivery.collaborationPostRevisionId,
      });
      return createdAssetId;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await processExternalDeliveries(fixture.base, Date.now());
    const failed = await fixture.base.run(async (ctx) => {
      const delivery = (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker");
      const batch = delivery?.batchId ? await ctx.db.get(delivery.batchId) : null;
      const post = delivery?.collaborationPostId
        ? await ctx.db.get(delivery.collaborationPostId)
        : null;
      const sourceRevision = delivery?.collaborationPostRevisionId
        ? await ctx.db.get(delivery.collaborationPostRevisionId)
        : null;
      if (!(delivery && batch && post && sourceRevision)) {
        throw new Error("Expected a failed immutable batch.");
      }
      const now = Date.now();
      const editedRevisionId = await ctx.db.insert(
        "buildCollaborationPostRevisions",
        {
          authorRole: sourceRevision.authorRole,
          authorWorkosUserId: sourceRevision.authorWorkosUserId,
          brokerageId: sourceRevision.brokerageId,
          buildId: sourceRevision.buildId,
          contentHash: "edited-without-attachment",
          createdAt: now,
          organizationId: sourceRevision.organizationId,
          plainText: "Edited without the restricted attachment.",
          postId: sourceRevision.postId,
          revision: sourceRevision.revision + 1,
          tiptapJson: sourceRevision.tiptapJson,
        }
      );
      await ctx.db.patch(post._id, {
        currentRevisionId: editedRevisionId,
        revision: post.revision + 1,
        updatedAt: now,
      });
      await ctx.db.patch(assetId, {
        scanMessage: "Access revoked after original attempt.",
        state: "quarantined",
        updatedAt: now,
      });
      return {
        batchId: batch._id,
        deliveryId: delivery._id,
        payloadSnapshot: batch.payloadSnapshot,
        providerIdempotencyKey: batch.providerIdempotencyKey,
        scheduledFor: delivery.scheduledFor,
      };
    });

    await processExternalDeliveries(fixture.base, failed.scheduledFor);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const state = await fixture.base.run(async (ctx) => ({
      batch: await ctx.db.get(failed.batchId),
      delivery: await ctx.db.get(failed.deliveryId),
    }));
    expect(state.batch).toEqual(
      expect.objectContaining({
        payloadSnapshot: failed.payloadSnapshot,
        providerIdempotencyKey: failed.providerIdempotencyKey,
        state: "cancelled",
      })
    );
    expect(state.delivery).toEqual(
      expect.objectContaining({
        cancellationReason: "access_revoked",
        status: "cancelled",
      })
    );
  });

  test("cancels an entire immutable digest batch when one source loses access", async () => {
    const fixture = await seedDeliveryBuild();
    const firstPostId = await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, { text: "First digest member." })
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, { text: "Second digest member." })
    );
    const deliveries = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).filter(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    const outboxIds = await fixture.base.mutation(
      (internal as any).build_collaboration_delivery_maintenance
        .prepareDueBuildCollaborationExternalDeliveries,
      {
        asOf: Math.max(...deliveries.map((delivery) => delivery.scheduledFor)),
        batchSize: 100,
      }
    );
    expect(outboxIds.length).toBeGreaterThanOrEqual(1);
    const brokerOutboxId = await fixture.base.run(async (ctx) => {
      const refreshed = await Promise.all(
        deliveries.map((delivery) => ctx.db.get(delivery._id))
      );
      const ids = [
        ...new Set(
          refreshed.flatMap((delivery) =>
            delivery?.providerOutboxId ? [delivery.providerOutboxId] : []
          )
        ),
      ];
      if (ids.length !== 1 || !ids[0]) {
        throw new Error("Expected one immutable broker digest batch.");
      }
      return ids[0];
    });
    await fixture.admin.mutation(
      (api as any).build_collaboration_editing
        .tombstoneBuildCollaborationPost,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId: firstPostId,
      }
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await fixture.base.action(
      (internal as any).build_collaboration_delivery_transport
        .dispatchBuildCollaborationExternalOutbox,
      { eventOutboxId: brokerOutboxId }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    const state = await fixture.base.run(async (ctx) => ({
      batches: (
        await ctx.db.query("buildCollaborationDeliveryBatches").collect()
      ).filter((row) => row.recipientWorkosUserId === "user_broker"),
      deliveries: (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).filter((row) => row.recipientWorkosUserId === "user_broker"),
      outbox: await ctx.db.get(brokerOutboxId),
    }));
    expect(state.batches).toEqual([
      expect.objectContaining({
        deliveryIds: expect.arrayContaining(deliveries.map((row) => row._id)),
        state: "cancelled",
      }),
    ]);
    expect(state.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "cancelled" }),
        expect.objectContaining({ status: "cancelled" }),
      ])
    );
    expect(state.deliveries.some((row) => row.status === "queued")).toBe(false);
    expect(state.outbox).toEqual(
      expect.objectContaining({
        payloadPreview: expect.stringContaining('"redacted":true'),
        status: "failed",
      })
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

    await fixture.base.run(async (ctx) => {
      const post = failed.delivery?.collaborationPostId
        ? await ctx.db.get(failed.delivery.collaborationPostId)
        : null;
      const revision = post?.currentRevisionId
        ? await ctx.db.get(post.currentRevisionId)
        : null;
      if (!revision) {
        throw new Error("Expected the retry post revision.");
      }
      await ctx.db.patch(revision._id, {
        plainText: "Mutated after the first provider attempt.",
      });
    });

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
    const payloads = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body))
    );
    expect(payloads.map((payload) => payload.items[0].body)).toEqual([
      "Retry this direct alert.",
      "Retry this direct alert.",
    ]);
  });

  test("supersedes a failed batch before sending to a changed email destination", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Destination snapshot alert.",
      })
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await processExternalDeliveries(fixture.base, Date.now());
    const failed = await fixture.base.run(async (ctx) => {
      const delivery = (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker");
      const batch = delivery?.batchId ? await ctx.db.get(delivery.batchId) : null;
      if (!(delivery && batch)) {
        throw new Error("Expected a failed destination batch.");
      }
      return { batch, delivery };
    });
    await fixture.base.mutation(
      (internal as any).workosProjection.ingestWorkosEvent,
      {
        data: {
          email: "broker-updated@example.com",
          email_verified: true,
          first_name: "Broker",
          id: "user_broker",
          last_name: "Reviewer",
        },
        event: "user.updated",
        id: "delivery_user_broker_email_updated",
      }
    );

    await processExternalDeliveries(fixture.base, failed.delivery.scheduledFor);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const superseded = await fixture.base.run(async (ctx) => ({
      batch: await ctx.db.get(failed.batch._id),
      delivery: await ctx.db.get(failed.delivery._id),
    }));
    expect(superseded.batch).toEqual(
      expect.objectContaining({ state: "cancelled" })
    );
    expect(superseded.delivery).toEqual(
      expect.objectContaining({ status: "queued" })
    );
    expect(superseded.delivery?.batchId).toBeUndefined();

    await processExternalDeliveries(fixture.base, Number.MAX_SAFE_INTEGER);
    const payloads = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body))
    );
    const brokerPayloads = payloads.filter(
      (payload) => payload.recipientWorkosUserId === "user_broker"
    );
    expect(brokerPayloads).toHaveLength(2);
    expect(brokerPayloads[0].contact).toEqual({
      email: "user_broker@example.com",
    });
    expect(brokerPayloads[1].contact).toEqual({
      email: "broker-updated@example.com",
    });
    expect(brokerPayloads[1].idempotencyKey).not.toBe(
      brokerPayloads[0].idempotencyKey
    );
  });

  test("cancels legacy unsent rows that lack their original source revision", async () => {
    const fixture = await seedDeliveryBuild();
    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, {
        mentioned: true,
        text: "Legacy source revision alert.",
      })
    );
    const deliveryId = await fixture.base.run(async (ctx) => {
      const delivery = (
        await ctx.db.query("buildCollaborationExternalDeliveries").collect()
      ).find((row) => row.recipientWorkosUserId === "user_broker");
      if (!delivery) {
        throw new Error("Expected a legacy source delivery.");
      }
      await ctx.db.patch(delivery._id, {
        collaborationPostRevisionId: undefined,
      });
      return delivery._id;
    });

    const result = await fixture.base.mutation(
      (internal as any).build_collaboration_delivery_maintenance
        .cancelLegacyDeliveriesMissingSourceRevision,
      { status: "queued" }
    );

    expect(result.cancelled).toBeGreaterThanOrEqual(1);
    expect(await fixture.base.run((ctx) => ctx.db.get(deliveryId))).toEqual(
      expect.objectContaining({
        cancellationReason: "missing_source_revision",
        status: "cancelled",
      })
    );
  });

  test("keeps newly due digest work out of an existing retry batch", async () => {
    const fixture = await seedDeliveryBuild();
    await muteBuilderOrdinaryActivity(fixture.base, fixture.buildId);
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
      publicationArgs(fixture.buildId, { text: "Original digest item." })
    );
    const first = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).find(
        (row) => row.recipientWorkosUserId === "user_broker"
      )
    );
    if (!first) {
      throw new Error("Expected an original digest delivery.");
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await processExternalDeliveries(fixture.base, first.scheduledFor);
    const failed = await fixture.base.run((ctx) => ctx.db.get(first._id));
    expect(failed).toEqual(
      expect.objectContaining({ batchKey: expect.any(String), status: "queued" })
    );

    await fixture.admin.mutation(
      (api as any).build_collaboration.approveAndPublishBuildCollaborationBundle,
      publicationArgs(fixture.buildId, { text: "Newly due digest item." })
    );
    const second = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("buildCollaborationExternalDeliveries").collect()).find(
        (row) =>
          row.recipientWorkosUserId === "user_broker" && row._id !== first._id
      )
    );
    if (!(failed && second)) {
      throw new Error("Expected both retry and newly due digest deliveries.");
    }
    await fixture.base.run((ctx) =>
      ctx.db.patch(second._id, { scheduledFor: failed.scheduledFor })
    );
    await processExternalDeliveries(fixture.base, failed.scheduledFor);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const payloads = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body))
    );
    expect(payloads[1].idempotencyKey).toBe(payloads[0].idempotencyKey);
    expect(payloads[2].idempotencyKey).not.toBe(payloads[0].idempotencyKey);
    expect(payloads[1].items.map((item: { body: string }) => item.body)).toEqual([
      "Original digest item.",
    ]);
    expect(payloads[2].items.map((item: { body: string }) => item.body)).toEqual([
      "Newly due digest item.",
    ]);
  });
});
