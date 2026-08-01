/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES } from "./build_collaboration_webhook_contracts";
import {
  emitBuildCollaborationWebhookEvent,
  signBuildCollaborationWebhookPayload,
} from "./build_collaboration_webhooks";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_collaboration_webhooks";
const BASE_TIME = Date.parse("2026-08-02T12:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Build collaboration webhooks", () => {
  test("delivers an identifier-only signed publication event exactly once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        requests.push(request.clone());
        return new Response(null, { status: 204 });
      }),
    );
    const created = await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/collaboration",
        eventTypes: ["build.collaboration.post.published"],
        name: "Construction operations",
        organizationId: ORGANIZATION_ID,
        reason: "Connect the governed construction event stream.",
      },
    );

    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Do not put this body in a webhook.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: textDocument("Do not put this body in a webhook."),
      },
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());

    expect(requests).toHaveLength(1);
    const request = requests[0];
    const body = await request.text();
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({
      buildId: fixture.buildId,
      entity: { id: postId, type: "post" },
      eventType: "build.collaboration.post.published",
      organizationId: ORGANIZATION_ID,
      payloadVersion: "2026-08-01",
    });
    expect(body).not.toContain("Do not put this body");
    expect(body).not.toMatch(/tiptap|plainText|receipt|assetUrl/i);
    const timestamp = request.headers.get("X-DrawFlow-Timestamp");
    expect(timestamp).toBeTruthy();
    expect(request.headers.get("X-DrawFlow-Signature")).toBe(
      `v1=${await signBuildCollaborationWebhookPayload(
        created.signingSecret,
        `${timestamp}.${body}`,
      )}`,
    );

    const stored = await fixture.base.run(async (ctx) => ({
      attempts: await ctx.db
        .query("buildCollaborationWebhookAttempts")
        .collect(),
      deliveries: await ctx.db
        .query("buildCollaborationWebhookDeliveries")
        .collect(),
      events: await ctx.db.query("buildCollaborationWebhookEvents").collect(),
    }));
    expect(stored.events).toHaveLength(1);
    expect(stored.deliveries).toHaveLength(1);
    expect(stored.deliveries[0]).toMatchObject({
      attemptCount: 1,
      sequence: 1,
      status: "delivered",
    });
    expect(stored.attempts).toHaveLength(1);
    expect(stored.attempts[0]).toMatchObject({
      responseCode: 204,
      status: "delivered",
    });
    const detail = await fixture.admin.query(
      (api as any).build_collaboration_webhooks
        .getBuildCollaborationWebhookDelivery,
      {
        buildId: fixture.buildId,
        deliveryId: stored.deliveries[0]._id,
        organizationId: ORGANIZATION_ID,
      },
    );
    expect(detail).toMatchObject({
      attempts: [{ attemptNumber: 1, responseCode: 204 }],
      event: {
        entityId: postId,
        entityType: "post",
        eventType: "build.collaboration.post.published",
      },
    });
  });

  test("deduplicates events, preserves endpoint order, and recovers failed delivery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    const deliveredEventIds: string[] = [];
    let requestCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        const payload = JSON.parse(await request.clone().text());
        deliveredEventIds.push(payload.eventId);
        requestCount += 1;
        return new Response(null, { status: requestCount === 1 ? 503 : 204 });
      }),
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/ordered",
        eventTypes: [...BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES],
        name: "Ordered lifecycle",
        organizationId: ORGANIZATION_ID,
        reason: "Verify ordered recovery.",
      },
    );
    const first = await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        actorRole: "admin",
        actorWorkosUserId: "user_admin",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: "post_1",
        entityType: "post",
        eventType: "build.collaboration.thread.resolved",
        idempotencyKey: "thread:post_1:resolved:1",
        metadata: { postId: "post_1", threadRevision: 1 },
        occurredAt: BASE_TIME,
        organizationId: ORGANIZATION_ID,
      }),
    );
    const duplicate = await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        actorRole: "admin",
        actorWorkosUserId: "user_admin",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: "post_1",
        entityType: "post",
        eventType: "build.collaboration.thread.resolved",
        idempotencyKey: "thread:post_1:resolved:1",
        metadata: { postId: "post_1", threadRevision: 1 },
        occurredAt: BASE_TIME,
        organizationId: ORGANIZATION_ID,
      }),
    );
    const second = await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        actorRole: "admin",
        actorWorkosUserId: "user_admin",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: "post_1",
        entityType: "post",
        eventType: "build.collaboration.thread.reopened",
        idempotencyKey: "thread:post_1:reopened:2",
        metadata: { postId: "post_1", threadRevision: 2 },
        occurredAt: BASE_TIME + 1,
        organizationId: ORGANIZATION_ID,
      }),
    );
    expect(duplicate).toBe(first);
    expect(second).not.toBe(first);

    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const deliveries = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationWebhookDeliveries")
        .withIndex("by_endpointId_and_sequence")
        .collect(),
    );
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((delivery) => delivery.sequence)).toEqual([1, 2]);
    expect(deliveries.every((delivery) => delivery.status === "delivered")).toBe(
      true,
    );
    expect(deliveredEventIds.at(-1)).toBe(String(second));
  });

  test("emits comment and thread lifecycle events from canonical mutations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    const deliveredTypes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        deliveredTypes.push(JSON.parse(await request.clone().text()).eventType);
        return new Response(null, { status: 204 });
      }),
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/thread-lifecycle",
        eventTypes: [
          "build.collaboration.comment.published",
          "build.collaboration.thread.resolved",
          "build.collaboration.thread.reopened",
        ],
        name: "Thread lifecycle",
        organizationId: ORGANIZATION_ID,
        reason: "Verify canonical thread mutations emit governed events.",
      },
    );
    const postId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Which inspection report should govern?",
        postType: "question",
        references: [],
        requestedReaderIds: [],
        tiptapJson: textDocument("Which inspection report should govern?"),
      },
    );
    const commentId = await fixture.builder.mutation(
      (api as any).build_collaboration_threads.addBuildCollaborationComment,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Use the signed engineer report.",
        postId,
        references: [],
        tiptapJson: textDocument("Use the signed engineer report."),
      },
    );
    await fixture.builder.mutation(
      (api as any).build_collaboration_resolution
        .resolveBuildCollaborationThread,
      {
        acceptedCommentId: commentId,
        buildId: fixture.buildId,
        expectedThreadRevision: 0,
        organizationId: ORGANIZATION_ID,
        postId,
        resolutionSummary: "The signed engineer report governs.",
      },
    );
    await fixture.builder.mutation(
      (api as any).build_collaboration_resolution
        .reopenBuildCollaborationThread,
      {
        buildId: fixture.buildId,
        expectedThreadRevision: 1,
        organizationId: ORGANIZATION_ID,
        postId,
        reason: "A revised signed report was received.",
      },
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(deliveredTypes).toEqual([
      "build.collaboration.comment.published",
      "build.collaboration.thread.resolved",
      "build.collaboration.thread.reopened",
    ]);
  });

  test("supports idempotent replay and stops future delivery after revocation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const created = await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/replay",
        eventTypes: ["build.collaboration.build.closed"],
        name: "Compliance archive",
        organizationId: ORGANIZATION_ID,
        reason: "Test replay and revocation.",
      },
    );
    const eventId = await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        actorRole: "admin",
        actorWorkosUserId: "user_admin",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: fixture.buildId,
        entityType: "build",
        eventType: "build.collaboration.build.closed",
        idempotencyKey: `lifecycle:${fixture.buildId}:closed:1`,
        metadata: { lifecycleRevision: 1, state: "closed" },
        occurredAt: BASE_TIME,
        organizationId: ORGANIZATION_ID,
      }),
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const original = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationWebhookDeliveries")
        .withIndex("by_eventId_and_endpointId", (query) =>
          query.eq("eventId", eventId).eq("endpointId", created.endpoint._id),
        )
        .first(),
    );
    if (!original) {
      throw new Error("Expected original webhook delivery.");
    }
    const replayInput = {
      buildId: fixture.buildId,
      deliveryId: original._id,
      idempotencyKey: "operator-replay-1",
      organizationId: ORGANIZATION_ID,
      reason: "Consumer requested a safe replay.",
    };
    const replayId = await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .replayBuildCollaborationWebhookDelivery,
      replayInput,
    );
    expect(
      await fixture.admin.mutation(
        (api as any).build_collaboration_webhooks
          .replayBuildCollaborationWebhookDelivery,
        replayInput,
      ),
    ).toBe(replayId);
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .revokeBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointId: created.endpoint._id,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "Integration access revoked.",
      },
    );
    await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        actorRole: "admin",
        actorWorkosUserId: "user_admin",
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: fixture.buildId,
        entityType: "build",
        eventType: "build.collaboration.build.closed",
        idempotencyKey: `lifecycle:${fixture.buildId}:closed:2`,
        metadata: { lifecycleRevision: 2, state: "closed" },
        occurredAt: BASE_TIME + 2,
        organizationId: ORGANIZATION_ID,
      }),
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      await fixture.base.run(async (ctx) =>
        ctx.db
          .query("buildCollaborationWebhookDeliveries")
          .withIndex("by_endpointId_and_sequence", (query) =>
            query.eq("endpointId", created.endpoint._id),
          )
          .collect(),
      ),
    ).toHaveLength(2);
  });

  test("emits Action Item, moderation, and Build lifecycle events from canonical mutations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    const deliveredTypes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        deliveredTypes.push(JSON.parse(await request.clone().text()).eventType);
        return new Response(null, { status: 204 });
      }),
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/governed-lifecycle",
        eventTypes: [
          "build.collaboration.action_item.transitioned",
          "build.collaboration.moderation.changed",
          "build.collaboration.build.closed",
          "build.collaboration.build.reopened",
        ],
        name: "Governed lifecycle",
        organizationId: ORGANIZATION_ID,
        reason: "Verify canonical governed mutations emit events.",
      },
    );
    const postId = await fixture.builder.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Prepare the engineer package.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: textDocument("Prepare the engineer package."),
      },
    );
    const actionItemId = await fixture.builder.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId,
        title: "Prepare engineer package",
      },
    );
    await fixture.builder.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: ORGANIZATION_ID,
      },
    );
    await fixture.admin.mutation(
      (api as any).build_action_item_workflow.transitionBuildActionItem,
      {
        actionItemId,
        buildId: fixture.buildId,
        expectedRevision: 2,
        nextStatus: "cancelled",
        organizationId: ORGANIZATION_ID,
        reason: "The engineer package is no longer required.",
      },
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_moderation
        .moderateBuildCollaborationContent,
      {
        buildId: fixture.buildId,
        entityId: postId,
        entityKind: "post",
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "This test validates permission-safe moderation metadata.",
      },
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_retention
        .setBuildCollaborationRetentionPolicy,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        policyKey: "regulated-construction-records",
        reason: "Apply the approved tenant retention policy.",
        retentionDays: 365,
      },
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.closeBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 0,
        organizationId: ORGANIZATION_ID,
        reason: "Construction collaboration is complete.",
      },
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration_lifecycle.reopenBuildCollaboration,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        organizationId: ORGANIZATION_ID,
        reason: "A final correction requires collaboration.",
      },
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(deliveredTypes).toEqual([
      "build.collaboration.action_item.transitioned",
      "build.collaboration.action_item.transitioned",
      "build.collaboration.moderation.changed",
      "build.collaboration.build.closed",
      "build.collaboration.build.reopened",
    ]);
  });

  test("replays an exhausted delivery in place before later endpoint events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    let acceptDelivery = false;
    const acceptedEventIds: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: Request) => {
        const payload = JSON.parse(await request.clone().text());
        if (acceptDelivery) {
          acceptedEventIds.push(payload.eventId);
        }
        return new Response(null, { status: acceptDelivery ? 204 : 503 });
      }),
    );
    const created = await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/exhausted-replay",
        eventTypes: ["build.collaboration.thread.resolved"],
        name: "Strictly ordered recovery",
        organizationId: ORGANIZATION_ID,
        reason: "Verify failed delivery replay preserves ordering.",
      },
    );
    const firstEventId = await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: "thread_1",
        entityType: "thread",
        eventType: "build.collaboration.thread.resolved",
        idempotencyKey: "thread:thread_1:resolved:1",
        metadata: { threadRevision: 1 },
        occurredAt: BASE_TIME,
        organizationId: ORGANIZATION_ID,
      }),
    );
    const secondEventId = await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: "thread_2",
        entityType: "thread",
        eventType: "build.collaboration.thread.resolved",
        idempotencyKey: "thread:thread_2:resolved:1",
        metadata: { threadRevision: 1 },
        occurredAt: BASE_TIME + 1,
        organizationId: ORGANIZATION_ID,
      }),
    );
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    const [firstDelivery, secondDelivery] = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationWebhookDeliveries")
        .withIndex("by_endpointId_and_sequence", (query) =>
          query.eq("endpointId", created.endpoint._id),
        )
        .collect(),
    );
    expect(firstDelivery.status).toBe("failed");
    expect(secondDelivery.status).toBe("pending");

    acceptDelivery = true;
    const replayInput = {
      buildId: fixture.buildId,
      deliveryId: firstDelivery._id,
      idempotencyKey: "recover-terminal-sequence-1",
      organizationId: ORGANIZATION_ID,
      reason: "Consumer recovered and requested the blocked event.",
    };
    expect(
      await fixture.admin.mutation(
        (api as any).build_collaboration_webhooks
          .replayBuildCollaborationWebhookDelivery,
        replayInput,
      ),
    ).toBe(firstDelivery._id);
    expect(
      await fixture.admin.mutation(
        (api as any).build_collaboration_webhooks
          .replayBuildCollaborationWebhookDelivery,
        replayInput,
      ),
    ).toBe(firstDelivery._id);
    await fixture.base.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(acceptedEventIds).toEqual([String(firstEventId), String(secondEventId)]);
  });

  test("recovers a delivery whose dispatch action loses its lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    const created = await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/lease-recovery",
        eventTypes: ["build.collaboration.build.closed"],
        name: "Lease recovery",
        organizationId: ORGANIZATION_ID,
        reason: "Verify interrupted dispatch recovery.",
      },
    );
    await fixture.base.run((ctx) =>
      emitBuildCollaborationWebhookEvent(ctx, {
        brokerageId: fixture.brokerageId,
        buildId: fixture.buildId,
        entityId: fixture.buildId,
        entityType: "build",
        eventType: "build.collaboration.build.closed",
        idempotencyKey: `lease:${fixture.buildId}:closed:1`,
        metadata: { lifecycleRevision: 1 },
        occurredAt: BASE_TIME,
        organizationId: ORGANIZATION_ID,
      }),
    );
    const delivery = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("buildCollaborationWebhookDeliveries")
        .withIndex("by_endpointId_and_sequence", (query) =>
          query.eq("endpointId", created.endpoint._id),
        )
        .unique(),
    );
    if (!delivery) {
      throw new Error("Expected a delivery for lease recovery.");
    }
    const dispatch = await fixture.base.mutation(
      (internal as any).build_collaboration_webhooks
        .reserveBuildCollaborationWebhookDelivery,
      { deliveryId: delivery._id },
    );
    vi.setSystemTime(BASE_TIME + 60_000);
    await fixture.base.mutation(
      (internal as any).build_collaboration_webhooks
        .recoverBuildCollaborationWebhookDeliveryLease,
      {
        deliveryId: delivery._id,
        leaseToken: dispatch.leaseToken,
      },
    );
    const recovered = await fixture.base.run((ctx) => ctx.db.get(delivery._id));
    expect(recovered).toMatchObject({
      attemptCount: 1,
      attemptLimit: 5,
      status: "pending",
    });
    expect(recovered?.leaseToken).toBeUndefined();
  });

  test("covers every approved event family and enforces Admin organization ownership", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    const fixture = await seedWebhookFixture();
    const foreignAdmin = withIdentity(
      fixture.base,
      "admin",
      "foreign_admin",
      "org_foreign_webhooks",
    );
    await expect(
      foreignAdmin.query(
        (api as any).build_collaboration_webhooks
          .listBuildCollaborationWebhookEndpoints,
        {
          buildId: fixture.buildId,
          organizationId: "org_foreign_webhooks",
        },
      ),
    ).rejects.toThrow();
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_webhooks
          .createBuildCollaborationWebhookEndpoint,
        {
          buildId: fixture.buildId,
          endpointUrl: "https://hooks.example.test/forbidden",
          eventTypes: [...BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES],
          name: "Forbidden builder endpoint",
          organizationId: ORGANIZATION_ID,
          reason: "Builders cannot authorize tenant integrations.",
        },
      ),
    ).rejects.toThrow("Admin");

    await fixture.admin.mutation(
      (api as any).build_collaboration_webhooks
        .createBuildCollaborationWebhookEndpoint,
      {
        buildId: fixture.buildId,
        endpointUrl: "https://hooks.example.test/all-events",
        eventTypes: [...BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES],
        name: "Complete event contract",
        organizationId: ORGANIZATION_ID,
        reason: "Verify complete collaboration lifecycle coverage.",
      },
    );
    await fixture.base.run(async (ctx) => {
      for (const [index, eventType] of
        BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES.entries()) {
        await emitBuildCollaborationWebhookEvent(ctx, {
          actorRole: "admin",
          actorWorkosUserId: "user_admin",
          brokerageId: fixture.brokerageId,
          buildId: fixture.buildId,
          entityId: `entity_${index}`,
          entityType: "contract_fixture",
          eventType,
          idempotencyKey: `contract:${eventType}:${index}`,
          metadata: { revision: index + 1 },
          occurredAt: BASE_TIME + index,
          organizationId: ORGANIZATION_ID,
        });
      }
    });
    const eventTypes = await fixture.base.run(async (ctx) =>
      (
        await ctx.db
          .query("buildCollaborationWebhookEvents")
          .withIndex("by_buildId_and_sequence", (query) =>
            query.eq("buildId", fixture.buildId),
          )
          .collect()
      ).map((event) => event.eventType),
    );
    expect(eventTypes).toEqual(BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES);
  });
});

function withIdentity(
  base: ReturnType<typeof convexTest>,
  role: "admin" | "builder",
  subject: string,
  organizationId = ORGANIZATION_ID,
) {
  return base.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role,
    roles: [role],
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedWebhookFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, "admin", "user_admin");
  const builder = withIdentity(base, "builder", "user_builder");
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID },
  );
  const buildId = await base.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "Webhook fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "23 Event Lane",
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
      },
    );
    const activeBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Webhook fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "23 Event Lane",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-02",
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
    await ctx.db.insert("buildParticipants", {
      brokerageId: foundation.brokerageId,
      buildId: activeBuildId,
      createdAt: now,
      displayNameSnapshot: "Builder",
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "builder",
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: "user_builder",
    });
    return activeBuildId;
  });
  return {
    admin,
    base,
    brokerageId: foundation.brokerageId,
    buildId,
    builder,
  };
}

function textDocument(text: string) {
  return JSON.stringify({
    content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
    type: "doc",
  });
}
