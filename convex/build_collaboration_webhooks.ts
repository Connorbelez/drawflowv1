import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES,
  BUILD_COLLABORATION_WEBHOOK_PAYLOAD_VERSION,
  type BuildCollaborationWebhookDispatchContext,
  type BuildCollaborationWebhookEventType,
  buildCollaborationWebhookAttemptStatusValidator,
  buildCollaborationWebhookDeliveryStatusValidator,
  buildCollaborationWebhookEndpointStatusValidator,
  buildCollaborationWebhookEventTypeValidator,
} from "./build_collaboration_webhook_contracts";
import { isPublicWebhookIpAddress } from "./build_collaboration_webhook_network";
import { signBuildCollaborationWebhookPayload } from "./build_collaboration_webhook_signing";
import { internalAction, internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_ENDPOINTS_PER_ORGANIZATION = 25;
const MAX_ENDPOINT_NAME_LENGTH = 120;
const MAX_REASON_LENGTH = 1000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 300;
const MAX_METADATA_BYTES = 8192;
const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_LEASE_MS = 60_000;
const DELIVERY_TIMEOUT_MS = 10_000;
const ORDER_RECHECK_MS = 1000;
const FORBIDDEN_METADATA_KEY =
  /body|content|plaintext|tiptap|receipt|asseturl|downloadurl|label|summary/i;
const IPV4_LITERAL_HOST = /^\d+(?:\.\d+){3}$/;

const endpointProjectionValidator = v.object({
  _id: v.id("buildCollaborationWebhookEndpoints"),
  deliveryGeneration: v.number(),
  endpointUrl: v.string(),
  eventTypes: v.array(buildCollaborationWebhookEventTypeValidator),
  name: v.string(),
  payloadVersion: v.string(),
  revision: v.number(),
  secretFingerprint: v.string(),
  secretVersion: v.number(),
  status: buildCollaborationWebhookEndpointStatusValidator,
  updatedAt: v.number(),
});

const endpointWithSecretValidator = v.object({
  endpoint: endpointProjectionValidator,
  signingSecret: v.string(),
});

const deliveryProjectionValidator = v.object({
  _id: v.id("buildCollaborationWebhookDeliveries"),
  attemptCount: v.number(),
  deliveryId: v.string(),
  endpointId: v.id("buildCollaborationWebhookEndpoints"),
  eventId: v.id("buildCollaborationWebhookEvents"),
  failureReason: v.optional(v.string()),
  sequence: v.number(),
  status: buildCollaborationWebhookDeliveryStatusValidator,
  updatedAt: v.number(),
});

const deliveryAttemptProjectionValidator = v.object({
  attemptNumber: v.number(),
  completedAt: v.number(),
  responseCode: v.optional(v.number()),
  safeError: v.optional(v.string()),
  secretVersion: v.number(),
  startedAt: v.number(),
  status: buildCollaborationWebhookAttemptStatusValidator,
});

const deliveryDetailValidator = v.object({
  attempts: v.array(deliveryAttemptProjectionValidator),
  delivery: deliveryProjectionValidator,
  event: v.object({
    entityId: v.string(),
    entityType: v.string(),
    eventId: v.id("buildCollaborationWebhookEvents"),
    eventSequence: v.number(),
    eventType: buildCollaborationWebhookEventTypeValidator,
    metadata: v.record(v.string(), v.any()),
    occurredAt: v.number(),
    payloadVersion: v.string(),
  }),
});

interface EmitBuildCollaborationWebhookEventInput {
  actorRole?: Doc<"buildCollaborationWebhookEvents">["actorRole"];
  actorWorkosUserId?: string;
  brokerageId: Id<"brokerages">;
  buildId: Id<"activeBuilds">;
  entityId: string;
  entityType: string;
  eventType: BuildCollaborationWebhookEventType;
  idempotencyKey: string;
  metadata: Record<string, boolean | number | string | null | undefined>;
  occurredAt: number;
  organizationId: string;
}

export const createBuildCollaborationWebhookEndpoint = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    endpointUrl: v.string(),
    eventTypes: v.array(buildCollaborationWebhookEventTypeValidator),
    name: v.string(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(endpointWithSecretValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    const reason = boundedText(
      args.reason,
      "A webhook endpoint reason",
      1,
      MAX_REASON_LENGTH
    );
    const active = await ctx.db
      .query("buildCollaborationWebhookEndpoints")
      .withIndex("by_organizationId_and_status", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("status", "active")
      )
      .take(MAX_ENDPOINTS_PER_ORGANIZATION + 1);
    const disabled = await ctx.db
      .query("buildCollaborationWebhookEndpoints")
      .withIndex("by_organizationId_and_status", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("status", "disabled")
      )
      .take(MAX_ENDPOINTS_PER_ORGANIZATION + 1);
    if (active.length + disabled.length >= MAX_ENDPOINTS_PER_ORGANIZATION) {
      throw new Error(
        `An organization may configure at most ${MAX_ENDPOINTS_PER_ORGANIZATION} webhook endpoints.`
      );
    }
    const eventTypes = normalizeEventTypes(args.eventTypes);
    const signingSecret = generateSigningSecret();
    const now = Date.now();
    const endpointId = await ctx.db.insert(
      "buildCollaborationWebhookEndpoints",
      {
        authorizedByRole: authorization.effectiveRole.role,
        authorizedByWorkosUserId: authorization.viewer.subject,
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        deliveryGeneration: 1,
        endpointUrl: normalizeEndpointUrl(args.endpointUrl),
        name: boundedText(
          args.name,
          "Endpoint name",
          1,
          MAX_ENDPOINT_NAME_LENGTH
        ),
        nextSequence: 0,
        organizationId: authorization.organizationId,
        payloadVersion: BUILD_COLLABORATION_WEBHOOK_PAYLOAD_VERSION,
        revision: 1,
        secretFingerprint: secretFingerprint(signingSecret),
        secretVersion: 1,
        signingKeyMaterial: signingSecret,
        status: "active",
        updatedAt: now,
      }
    );
    await replaceEndpointEventTypes(ctx, {
      authorization,
      endpointId,
      eventTypes,
      now,
    });
    const endpoint = await requireEndpoint(ctx, authorization, endpointId);
    await auditEndpointChange(ctx, {
      authorization,
      command: "createBuildCollaborationWebhookEndpoint",
      endpoint,
      eventType: "build.collaboration.webhook.endpoint.created",
      reason,
    });
    return {
      endpoint: await endpointProjection(ctx, endpoint),
      signingSecret,
    };
  })
  .public();

export const listBuildCollaborationWebhookEndpoints = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.array(endpointProjectionValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    const endpoints = await ctx.db
      .query("buildCollaborationWebhookEndpoints")
      .withIndex("by_organizationId_and_createdAt", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .order("desc")
      .take(100);
    return await Promise.all(
      endpoints.map((endpoint) => endpointProjection(ctx, endpoint))
    );
  })
  .public();

export const updateBuildCollaborationWebhookEndpoint = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    enabled: v.boolean(),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    endpointUrl: v.string(),
    eventTypes: v.array(buildCollaborationWebhookEventTypeValidator),
    expectedRevision: v.number(),
    name: v.string(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(endpointProjectionValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    const endpoint = await requireEndpoint(ctx, authorization, args.endpointId);
    assertEndpointRevision(endpoint, args.expectedRevision);
    if (endpoint.status === "revoked") {
      throw new Error("Revoked webhook endpoints cannot be changed.");
    }
    const reason = boundedText(
      args.reason,
      "A webhook endpoint reason",
      1,
      MAX_REASON_LENGTH
    );
    const eventTypes = normalizeEventTypes(args.eventTypes);
    const now = Date.now();
    await ctx.db.patch(endpoint._id, {
      deliveryGeneration: endpoint.deliveryGeneration + 1,
      disabledAt: args.enabled ? undefined : now,
      endpointUrl: normalizeEndpointUrl(args.endpointUrl),
      name: boundedText(
        args.name,
        "Endpoint name",
        1,
        MAX_ENDPOINT_NAME_LENGTH
      ),
      revision: endpoint.revision + 1,
      status: args.enabled ? "active" : "disabled",
      updatedAt: now,
    });
    await replaceEndpointEventTypes(ctx, {
      authorization,
      endpointId: endpoint._id,
      eventTypes,
      now,
    });
    const updated = await requireEndpoint(ctx, authorization, endpoint._id);
    await auditEndpointChange(ctx, {
      authorization,
      command: "updateBuildCollaborationWebhookEndpoint",
      endpoint: updated,
      eventType: "build.collaboration.webhook.endpoint.updated",
      reason,
    });
    return await endpointProjection(ctx, updated);
  })
  .public();

export const rotateBuildCollaborationWebhookSecret = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(endpointWithSecretValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    const endpoint = await requireEndpoint(ctx, authorization, args.endpointId);
    assertEndpointRevision(endpoint, args.expectedRevision);
    if (endpoint.status === "revoked") {
      throw new Error("Revoked webhook endpoint secrets cannot be rotated.");
    }
    const reason = boundedText(
      args.reason,
      "A secret rotation reason",
      1,
      MAX_REASON_LENGTH
    );
    const signingSecret = generateSigningSecret();
    const now = Date.now();
    await ctx.db.patch(endpoint._id, {
      revision: endpoint.revision + 1,
      secretFingerprint: secretFingerprint(signingSecret),
      secretVersion: endpoint.secretVersion + 1,
      signingKeyMaterial: signingSecret,
      updatedAt: now,
    });
    const updated = await requireEndpoint(ctx, authorization, endpoint._id);
    await auditEndpointChange(ctx, {
      authorization,
      command: "rotateBuildCollaborationWebhookSecret",
      endpoint: updated,
      eventType: "build.collaboration.webhook.endpoint.secret_rotated",
      reason,
    });
    return {
      endpoint: await endpointProjection(ctx, updated),
      signingSecret,
    };
  })
  .public();

export const revokeBuildCollaborationWebhookEndpoint = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(endpointProjectionValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    const endpoint = await requireEndpoint(ctx, authorization, args.endpointId);
    assertEndpointRevision(endpoint, args.expectedRevision);
    const reason = boundedText(
      args.reason,
      "A webhook revocation reason",
      1,
      MAX_REASON_LENGTH
    );
    if (endpoint.status !== "revoked") {
      const now = Date.now();
      await ctx.db.patch(endpoint._id, {
        deliveryGeneration: endpoint.deliveryGeneration + 1,
        revision: endpoint.revision + 1,
        revokedAt: now,
        secretFingerprint: "revoked",
        signingKeyMaterial: generateSigningSecret(),
        status: "revoked",
        updatedAt: now,
      });
    }
    const updated = await requireEndpoint(ctx, authorization, endpoint._id);
    await auditEndpointChange(ctx, {
      authorization,
      command: "revokeBuildCollaborationWebhookEndpoint",
      endpoint: updated,
      eventType: "build.collaboration.webhook.endpoint.revoked",
      reason,
    });
    return await endpointProjection(ctx, updated);
  })
  .public();

export const listBuildCollaborationWebhookDeliveries = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    endpointId: v.id("buildCollaborationWebhookEndpoints"),
    organizationId: v.string(),
  })
  .returns(v.array(deliveryProjectionValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    await requireEndpoint(ctx, authorization, args.endpointId);
    const deliveries = await ctx.db
      .query("buildCollaborationWebhookDeliveries")
      .withIndex("by_endpointId_and_sequence", (query) =>
        query.eq("endpointId", args.endpointId)
      )
      .order("desc")
      .take(100);
    return deliveries.map(deliveryProjection);
  })
  .public();

export const getBuildCollaborationWebhookDelivery = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    deliveryId: v.id("buildCollaborationWebhookDeliveries"),
    organizationId: v.string(),
  })
  .returns(deliveryDetailValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    const delivery = await ctx.db.get(args.deliveryId);
    if (
      !delivery ||
      delivery.organizationId !== authorization.organizationId ||
      delivery.brokerageId !== authorization.brokerage._id ||
      delivery.buildId !== authorization.build._id
    ) {
      throw new Error("Webhook delivery is unavailable.");
    }
    await requireEndpoint(ctx, authorization, delivery.endpointId);
    const event = await requireEvent(ctx, delivery.eventId);
    if (
      event.organizationId !== authorization.organizationId ||
      event.brokerageId !== authorization.brokerage._id ||
      event.buildId !== authorization.build._id
    ) {
      throw new Error("Webhook event tenancy integrity failure.");
    }
    const attempts = await ctx.db
      .query("buildCollaborationWebhookAttempts")
      .withIndex("by_deliveryId_and_attemptNumber", (query) =>
        query.eq("deliveryId", delivery._id)
      )
      .take(500);
    return {
      attempts: attempts.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        completedAt: attempt.completedAt,
        responseCode: attempt.responseCode,
        safeError: attempt.safeError,
        secretVersion: attempt.secretVersion,
        startedAt: attempt.startedAt,
        status: attempt.status,
      })),
      delivery: deliveryProjection(delivery),
      event: {
        entityId: event.entityId,
        entityType: event.entityType,
        eventId: event._id,
        eventSequence: event.sequence,
        eventType: event.eventType,
        metadata: JSON.parse(event.metadataJson),
        occurredAt: event.occurredAt,
        payloadVersion: event.payloadVersion,
      },
    };
  })
  .public();

export const replayBuildCollaborationWebhookDelivery = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    deliveryId: v.id("buildCollaborationWebhookDeliveries"),
    idempotencyKey: v.string(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("buildCollaborationWebhookDeliveries"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeWebhookAdmin(ctx, args);
    const original = await ctx.db.get(args.deliveryId);
    if (
      !original ||
      original.organizationId !== authorization.organizationId ||
      original.brokerageId !== authorization.brokerage._id ||
      original.buildId !== authorization.build._id
    ) {
      throw new Error("Webhook delivery is unavailable.");
    }
    const endpoint = await requireEndpoint(
      ctx,
      authorization,
      original.endpointId
    );
    if (endpoint.status !== "active") {
      throw new Error("Only active webhook endpoints can replay delivery.");
    }
    await requireEndpointSubscription(
      ctx,
      endpoint._id,
      (await requireEvent(ctx, original.eventId)).eventType
    );
    const replayKey = `${authorization.organizationId}:${endpoint._id}:${boundedText(
      args.idempotencyKey,
      "Replay idempotency key",
      1,
      MAX_IDEMPOTENCY_KEY_LENGTH
    )}`;
    const reason = boundedText(
      args.reason,
      "A webhook replay reason",
      1,
      MAX_REASON_LENGTH
    );
    const existing = await ctx.db
      .query("buildCollaborationWebhookReplayRequests")
      .withIndex("by_endpointId_and_replayKey", (query) =>
        query.eq("endpointId", endpoint._id).eq("replayKey", replayKey)
      )
      .unique();
    if (existing) {
      if (existing.originalDeliveryId !== original._id) {
        throw new Error(
          "Replay idempotency key was reused for a different delivery."
        );
      }
      return existing.resultDeliveryId;
    }
    if (original.status === "pending" || original.status === "delivering") {
      throw new Error("Only terminal webhook deliveries can be replayed.");
    }
    const now = Date.now();
    const tenant = await requireActiveWebhookTenant(ctx, {
      brokerageId: authorization.brokerage._id,
      organizationId: authorization.organizationId,
    });
    let replayId = original._id;
    if (original.status === "failed") {
      await ctx.db.patch(original._id, {
        attemptLimit: original.attemptLimit + MAX_DELIVERY_ATTEMPTS,
        endpointGeneration: endpoint.deliveryGeneration,
        failureReason: undefined,
        nextAttemptAt: now,
        status: "pending",
        tenantAccessRevision: tenant.accessRevision ?? 0,
        updatedAt: now,
      });
    } else {
      const sequence = await nextEndpointSequence(ctx, endpoint);
      replayId = await ctx.db.insert("buildCollaborationWebhookDeliveries", {
        attemptCount: 0,
        attemptLimit: MAX_DELIVERY_ATTEMPTS,
        brokerageId: original.brokerageId,
        buildId: original.buildId,
        createdAt: now,
        deliveryId: `dfwh_${crypto.randomUUID()}`,
        endpointId: endpoint._id,
        endpointGeneration: endpoint.deliveryGeneration,
        eventId: original.eventId,
        nextAttemptAt: now,
        organizationId: original.organizationId,
        replayKey,
        replayOfDeliveryId: original._id,
        sequence,
        status: "pending",
        tenantAccessRevision: tenant.accessRevision ?? 0,
        updatedAt: now,
      });
    }
    await ctx.db.insert("buildCollaborationWebhookReplayRequests", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      endpointId: endpoint._id,
      organizationId: authorization.organizationId,
      originalDeliveryId: original._id,
      reason,
      replayKey,
      requestedByWorkosUserId: authorization.viewer.subject,
      resultDeliveryId: replayId,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_webhooks
        .dispatchBuildCollaborationWebhookDelivery,
      { deliveryId: replayId }
    );
    await auditEndpointChange(ctx, {
      authorization,
      command: "replayBuildCollaborationWebhookDelivery",
      endpoint,
      eventType: "build.collaboration.webhook.delivery.replayed",
      reason,
    });
    return replayId;
  })
  .public();

export async function emitBuildCollaborationWebhookEvent(
  ctx: MutationCtx,
  input: EmitBuildCollaborationWebhookEventInput
) {
  assertEventType(input.eventType);
  const metadataJson = safeMetadataJson(input.metadata);
  const idempotencyKey = `${input.organizationId}:${boundedText(
    input.idempotencyKey,
    "Webhook event idempotency key",
    1,
    MAX_IDEMPOTENCY_KEY_LENGTH
  )}`;
  const existing = await ctx.db
    .query("buildCollaborationWebhookEvents")
    .withIndex("by_idempotencyKey", (query) =>
      query.eq("idempotencyKey", idempotencyKey)
    )
    .unique();
  if (existing) {
    if (
      existing.organizationId !== input.organizationId ||
      existing.brokerageId !== input.brokerageId ||
      existing.buildId !== input.buildId ||
      existing.eventType !== input.eventType ||
      existing.entityType !== input.entityType ||
      existing.entityId !== input.entityId ||
      existing.actorRole !== input.actorRole ||
      existing.actorWorkosUserId !== input.actorWorkosUserId ||
      existing.metadataJson !== metadataJson ||
      existing.occurredAt !== input.occurredAt
    ) {
      throw new Error(
        "Webhook event idempotency key was reused for different content."
      );
    }
    return existing._id;
  }
  const tenant = await requireActiveWebhookTenant(ctx, {
    brokerageId: input.brokerageId,
    organizationId: input.organizationId,
  });
  const sequence = await nextBuildSequence(ctx, input);
  const eventId = await ctx.db.insert("buildCollaborationWebhookEvents", {
    actorRole: input.actorRole,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    createdAt: Date.now(),
    entityId: boundedText(input.entityId, "Webhook entity ID", 1, 300),
    entityType: boundedText(input.entityType, "Webhook entity type", 1, 100),
    eventType: input.eventType,
    idempotencyKey,
    metadataJson,
    occurredAt: input.occurredAt,
    organizationId: input.organizationId,
    payloadVersion: BUILD_COLLABORATION_WEBHOOK_PAYLOAD_VERSION,
    sequence,
  });
  const endpoints = await ctx.db
    .query("buildCollaborationWebhookEndpoints")
    .withIndex("by_organizationId_and_status", (query) =>
      query.eq("organizationId", input.organizationId).eq("status", "active")
    )
    .take(MAX_ENDPOINTS_PER_ORGANIZATION + 1);
  if (endpoints.length > MAX_ENDPOINTS_PER_ORGANIZATION) {
    throw new Error("Webhook endpoint limit integrity failure.");
  }
  for (const endpoint of endpoints) {
    if (endpoint.brokerageId !== input.brokerageId) {
      throw new Error("Webhook endpoint tenancy integrity failure.");
    }
    const subscription = await findEndpointSubscription(
      ctx,
      endpoint._id,
      input.eventType
    );
    if (!subscription) {
      continue;
    }
    const deliverySequence = await nextEndpointSequence(ctx, endpoint);
    const now = Date.now();
    const deliveryId = await ctx.db.insert(
      "buildCollaborationWebhookDeliveries",
      {
        attemptCount: 0,
        attemptLimit: MAX_DELIVERY_ATTEMPTS,
        brokerageId: input.brokerageId,
        buildId: input.buildId,
        createdAt: now,
        deliveryId: `dfwh_${crypto.randomUUID()}`,
        endpointId: endpoint._id,
        endpointGeneration: endpoint.deliveryGeneration,
        eventId,
        nextAttemptAt: now,
        organizationId: input.organizationId,
        sequence: deliverySequence,
        status: "pending",
        tenantAccessRevision: tenant.accessRevision ?? 0,
        updatedAt: now,
      }
    );
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_webhooks
        .dispatchBuildCollaborationWebhookDelivery,
      { deliveryId }
    );
  }
  return eventId;
}

export const dispatchBuildCollaborationWebhookDelivery = internalAction
  .input({ deliveryId: v.id("buildCollaborationWebhookDeliveries") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const dispatch = (await ctx.runMutation(
      internal.build_collaboration_webhooks
        .reserveBuildCollaborationWebhookDelivery,
      args
    )) as BuildCollaborationWebhookDispatchContext | null;
    if (!dispatch) {
      return null;
    }
    const timestamp = String(Date.now());
    const signature = `v1=${await signBuildCollaborationWebhookPayload(
      dispatch.signingSecret,
      `${timestamp}.${dispatch.body}`
    )}`;
    let result: {
      responseCode?: number;
      safeError?: string;
      status: "delivered" | "failed";
    };
    const endpoint = new URL(dispatch.endpointUrl);
    const hostname = endpoint.hostname.replace(/^\[|\]$/g, "");
    const isLiteral =
      hostname.includes(":") || IPV4_LITERAL_HOST.test(hostname);
    if (isLiteral) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      try {
        const response = await fetch(
          new Request(endpoint, {
            body: dispatch.body,
            headers: {
              "Content-Type": "application/json",
              "X-DrawFlow-Delivery": dispatch.deliveryId,
              "X-DrawFlow-Event": dispatch.eventType,
              "X-DrawFlow-Sequence": String(dispatch.sequence),
              "X-DrawFlow-Signature": signature,
              "X-DrawFlow-Timestamp": timestamp,
              "X-DrawFlow-Version": BUILD_COLLABORATION_WEBHOOK_PAYLOAD_VERSION,
            },
            method: "POST",
            redirect: "error",
            signal: controller.signal,
          })
        );
        result =
          response.status >= 200 && response.status < 300
            ? { responseCode: response.status, status: "delivered" }
            : {
                responseCode: response.status,
                safeError: `Endpoint returned HTTP ${response.status}. Response content was not stored.`,
                status: "failed",
              };
      } catch (error) {
        result = {
          safeError:
            error instanceof DOMException && error.name === "AbortError"
              ? "Endpoint timed out before acknowledging delivery."
              : "Endpoint could not be reached. No response content was stored.",
          status: "failed",
        };
      } finally {
        clearTimeout(timeout);
      }
    } else {
      result = (await ctx.runAction(
        internal.build_collaboration_webhook_transport
          .sendBuildCollaborationWebhookRequest,
        {
          body: dispatch.body,
          deliveryId: dispatch.deliveryId,
          endpointUrl: dispatch.endpointUrl,
          eventType: dispatch.eventType,
          sequence: dispatch.sequence,
          signature,
          timestamp,
          version: BUILD_COLLABORATION_WEBHOOK_PAYLOAD_VERSION,
        }
      )) as typeof result;
    }
    await ctx.runMutation(
      internal.build_collaboration_webhooks
        .completeBuildCollaborationWebhookDelivery,
      {
        deliveryId: args.deliveryId,
        leaseToken: dispatch.leaseToken,
        responseCode: result.responseCode,
        safeError: result.safeError,
        secretVersion: dispatch.secretVersion,
        status: result.status,
      }
    );
    return null;
  })
  .internal();

export const reserveBuildCollaborationWebhookDelivery = internalMutation
  .input({ deliveryId: v.id("buildCollaborationWebhookDeliveries") })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") {
      return null;
    }
    const now = Date.now();
    if ((delivery.nextAttemptAt ?? 0) > now) {
      await scheduleDeliveryAt(
        ctx,
        delivery._id,
        delivery.nextAttemptAt ?? now
      );
      return null;
    }
    const endpoint = await ctx.db.get(delivery.endpointId);
    const event = await ctx.db.get(delivery.eventId);
    if (
      !(
        endpoint &&
        event &&
        (await deliveryStillAuthorized(ctx, delivery, endpoint, event))
      )
    ) {
      await cancelDelivery(
        ctx,
        delivery,
        "Webhook subscription or tenant access was revoked."
      );
      return null;
    }
    const previous = await ctx.db
      .query("buildCollaborationWebhookDeliveries")
      .withIndex("by_endpointId_and_sequence", (query) =>
        query.eq("endpointId", endpoint._id).lt("sequence", delivery.sequence)
      )
      .order("desc")
      .first();
    if (
      previous &&
      previous.status !== "delivered" &&
      previous.status !== "cancelled"
    ) {
      if (previous.status !== "failed") {
        await scheduleDeliveryAt(ctx, delivery._id, now + ORDER_RECHECK_MS);
      }
      return null;
    }
    const leaseToken = crypto.randomUUID();
    await ctx.db.patch(delivery._id, {
      attemptCount: delivery.attemptCount + 1,
      lastAttemptAt: now,
      leaseExpiresAt: now + DELIVERY_LEASE_MS,
      leaseSecretVersion: endpoint.secretVersion,
      leaseToken,
      status: "delivering",
      updatedAt: now,
    });
    return {
      body: webhookPayload(event),
      deliveryId: delivery.deliveryId,
      endpointUrl: endpoint.endpointUrl,
      eventType: event.eventType,
      leaseToken,
      secretVersion: endpoint.secretVersion,
      sequence: delivery.sequence,
      signingSecret: endpoint.signingKeyMaterial,
    } satisfies BuildCollaborationWebhookDispatchContext;
  })
  .internal();

export const completeBuildCollaborationWebhookDelivery = internalMutation
  .input({
    deliveryId: v.id("buildCollaborationWebhookDeliveries"),
    leaseToken: v.string(),
    responseCode: v.optional(v.number()),
    safeError: v.optional(v.string()),
    secretVersion: v.number(),
    status: v.union(v.literal("delivered"), v.literal("failed")),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (
      !delivery ||
      delivery.status !== "delivering" ||
      delivery.leaseToken !== args.leaseToken
    ) {
      return null;
    }
    const endpoint = await ctx.db.get(delivery.endpointId);
    const event = await ctx.db.get(delivery.eventId);
    const now = Date.now();
    const stillAuthorized =
      endpoint && event
        ? await deliveryStillAuthorized(ctx, delivery, endpoint, event)
        : false;
    const finalAttemptStatus = stillAuthorized ? args.status : "cancelled";
    await ctx.db.insert("buildCollaborationWebhookAttempts", {
      attemptNumber: delivery.attemptCount,
      brokerageId: delivery.brokerageId,
      buildId: delivery.buildId,
      completedAt: now,
      deliveryId: delivery._id,
      endpointId: delivery.endpointId,
      eventId: delivery.eventId,
      organizationId: delivery.organizationId,
      responseCode: args.responseCode,
      safeError: stillAuthorized
        ? args.safeError
        : "Webhook subscription or tenant access was revoked during delivery.",
      secretVersion: args.secretVersion,
      startedAt: delivery.lastAttemptAt ?? now,
      status: finalAttemptStatus,
    });
    if (!stillAuthorized) {
      await ctx.db.patch(delivery._id, {
        cancelledAt: now,
        failureReason:
          "Webhook subscription or tenant access was revoked during delivery.",
        leaseExpiresAt: undefined,
        leaseSecretVersion: undefined,
        leaseToken: undefined,
        nextAttemptAt: undefined,
        status: "cancelled",
        updatedAt: now,
      });
      await scheduleNextEndpointDelivery(
        ctx,
        delivery.endpointId,
        delivery.sequence
      );
      return null;
    }
    if (args.status === "delivered") {
      await ctx.db.patch(delivery._id, {
        deliveredAt: now,
        failureReason: undefined,
        leaseExpiresAt: undefined,
        leaseSecretVersion: undefined,
        leaseToken: undefined,
        nextAttemptAt: undefined,
        status: "delivered",
        updatedAt: now,
      });
      await scheduleNextEndpointDelivery(
        ctx,
        delivery.endpointId,
        delivery.sequence
      );
      return null;
    }
    const exhausted = delivery.attemptCount >= delivery.attemptLimit;
    const nextAttemptAt = exhausted
      ? undefined
      : now + Math.min(3_600_000, 1000 * 2 ** (delivery.attemptCount - 1));
    await ctx.db.patch(delivery._id, {
      failureReason: args.safeError ?? "Webhook delivery failed.",
      leaseExpiresAt: undefined,
      leaseSecretVersion: undefined,
      leaseToken: undefined,
      nextAttemptAt,
      status: exhausted ? "failed" : "pending",
      updatedAt: now,
    });
    if (nextAttemptAt) {
      await scheduleDeliveryAt(ctx, delivery._id, nextAttemptAt);
    }
    return null;
  })
  .internal();

export const recoverBuildCollaborationWebhookDeliveryLease = internalMutation
  .input({
    deliveryId: v.id("buildCollaborationWebhookDeliveries"),
    leaseToken: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (
      !delivery ||
      delivery.status !== "delivering" ||
      delivery.leaseToken !== args.leaseToken
    ) {
      return null;
    }
    await recoverExpiredDeliveryLease(ctx, delivery, Date.now());
    return null;
  })
  .internal();

export const recoverExpiredBuildCollaborationWebhookDeliveryLeases =
  internalMutation
    .input({})
    .returns(v.number())
    .handler(async (ctx) => {
      const now = Date.now();
      const expired = await ctx.db
        .query("buildCollaborationWebhookDeliveries")
        .withIndex("by_status_and_leaseExpiresAt", (query) =>
          query.eq("status", "delivering").lte("leaseExpiresAt", now)
        )
        .take(100);
      for (const delivery of expired) {
        await recoverExpiredDeliveryLease(ctx, delivery, now);
      }
      return expired.length;
    })
    .internal();

import { recoverExpiredDeliveryLease, authorizeWebhookAdmin, requireEndpoint, endpointProjection, deliveryProjection, replaceEndpointEventTypes, findEndpointSubscription, requireEndpointSubscription, requireEvent, nextBuildSequence, nextEndpointSequence, deliveryStillAuthorized, requireActiveWebhookTenant, webhookPayload, cancelDelivery, scheduleNextEndpointDelivery, scheduleDeliveryAt, auditEndpointChange, normalizeEventTypes, assertEventType, safeMetadataJson, normalizeEndpointUrl, isPrivateIp, generateSigningSecret, secretFingerprint, assertEndpointRevision, boundedText } from "./build_collaboration_webhooks/helpers";
