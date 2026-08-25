import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import { requireHumanCollaborationActor } from "../build_collaboration_human";
import { authorizeActiveBuildCollaborationAccess } from "../build_collaboration_rollout";
import {
  BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES,
  BUILD_COLLABORATION_WEBHOOK_PAYLOAD_VERSION,
  type BuildCollaborationWebhookDispatchContext,
  type BuildCollaborationWebhookEventType,
  buildCollaborationWebhookAttemptStatusValidator,
  buildCollaborationWebhookDeliveryStatusValidator,
  buildCollaborationWebhookEndpointStatusValidator,
  buildCollaborationWebhookEventTypeValidator,
} from "../build_collaboration_webhook_contracts";
import { isPublicWebhookIpAddress } from "../build_collaboration_webhook_network";
import { signBuildCollaborationWebhookPayload } from "../build_collaboration_webhook_signing";
import { internalAction, internalMutation } from "../fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

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

export async function recoverExpiredDeliveryLease(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationWebhookDeliveries">,
  now: number
) {
  if (
    delivery.status !== "delivering" ||
    (delivery.leaseExpiresAt ?? 0) > now
  ) {
    return;
  }
  const safeError =
    "Webhook delivery lease expired before the dispatch action completed.";
  await ctx.db.insert("buildCollaborationWebhookAttempts", {
    attemptNumber: delivery.attemptCount,
    brokerageId: delivery.brokerageId,
    buildId: delivery.buildId,
    completedAt: now,
    deliveryId: delivery._id,
    endpointId: delivery.endpointId,
    eventId: delivery.eventId,
    organizationId: delivery.organizationId,
    safeError,
    secretVersion: delivery.leaseSecretVersion ?? 0,
    startedAt: delivery.lastAttemptAt ?? now,
    status: "failed",
  });
  const exhausted = delivery.attemptCount >= delivery.attemptLimit;
  const nextAttemptAt = exhausted ? undefined : now;
  await ctx.db.patch(delivery._id, {
    failureReason: safeError,
    leaseExpiresAt: undefined,
    leaseSecretVersion: undefined,
    leaseToken: undefined,
    nextAttemptAt,
    status: exhausted ? "failed" : "pending",
    updatedAt: now,
  });
  if (nextAttemptAt !== undefined) {
    await scheduleDeliveryAt(ctx, delivery._id, nextAttemptAt);
  }
}

export async function authorizeWebhookAdmin(
  ctx: Parameters<typeof authorizeActiveBuildCollaborationAccess>[0],
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  const authorization = await authorizeActiveBuildCollaborationAccess(
    ctx,
    input
  );
  await requireHumanCollaborationActor(ctx, authorization);
  if (authorization.effectiveRole.role !== "admin") {
    throw new Error("Only Admin can manage organization webhook integrations.");
  }
  return authorization;
}

export async function requireEndpoint(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  endpointId: Id<"buildCollaborationWebhookEndpoints">
) {
  const endpoint = await ctx.db.get(endpointId);
  if (
    !endpoint ||
    endpoint.organizationId !== authorization.organizationId ||
    endpoint.brokerageId !== authorization.brokerage._id
  ) {
    throw new Error("Webhook endpoint is unavailable.");
  }
  return endpoint;
}

export async function endpointProjection(
  ctx: QueryCtx,
  endpoint: Doc<"buildCollaborationWebhookEndpoints">
) {
  const subscriptions = await ctx.db
    .query("buildCollaborationWebhookEndpointEventTypes")
    .withIndex("by_endpointId", (query) => query.eq("endpointId", endpoint._id))
    .take(BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES.length + 1);
  return {
    _id: endpoint._id,
    deliveryGeneration: endpoint.deliveryGeneration,
    endpointUrl: endpoint.endpointUrl,
    eventTypes: subscriptions
      .map((subscription) => subscription.eventType)
      .sort(),
    name: endpoint.name,
    payloadVersion: endpoint.payloadVersion,
    revision: endpoint.revision,
    secretFingerprint: endpoint.secretFingerprint,
    secretVersion: endpoint.secretVersion,
    status: endpoint.status,
    updatedAt: endpoint.updatedAt,
  };
}

export function deliveryProjection(
  delivery: Doc<"buildCollaborationWebhookDeliveries">
) {
  return {
    _id: delivery._id,
    attemptCount: delivery.attemptCount,
    deliveryId: delivery.deliveryId,
    endpointId: delivery.endpointId,
    eventId: delivery.eventId,
    failureReason: delivery.failureReason,
    sequence: delivery.sequence,
    status: delivery.status,
    updatedAt: delivery.updatedAt,
  };
}

export async function replaceEndpointEventTypes(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    endpointId: Id<"buildCollaborationWebhookEndpoints">;
    eventTypes: BuildCollaborationWebhookEventType[];
    now: number;
  }
) {
  const existing = await ctx.db
    .query("buildCollaborationWebhookEndpointEventTypes")
    .withIndex("by_endpointId", (query) =>
      query.eq("endpointId", input.endpointId)
    )
    .take(BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES.length + 1);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  for (const eventType of input.eventTypes) {
    await ctx.db.insert("buildCollaborationWebhookEndpointEventTypes", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      endpointId: input.endpointId,
      eventType,
      organizationId: input.authorization.organizationId,
    });
  }
}

export async function findEndpointSubscription(
  ctx: QueryCtx,
  endpointId: Id<"buildCollaborationWebhookEndpoints">,
  eventType: BuildCollaborationWebhookEventType
) {
  return await ctx.db
    .query("buildCollaborationWebhookEndpointEventTypes")
    .withIndex("by_endpointId_and_eventType", (query) =>
      query.eq("endpointId", endpointId).eq("eventType", eventType)
    )
    .unique();
}

export async function requireEndpointSubscription(
  ctx: QueryCtx,
  endpointId: Id<"buildCollaborationWebhookEndpoints">,
  eventType: BuildCollaborationWebhookEventType
) {
  const subscription = await findEndpointSubscription(
    ctx,
    endpointId,
    eventType
  );
  if (!subscription) {
    throw new Error("Webhook endpoint is not subscribed to this event type.");
  }
  return subscription;
}

export async function requireEvent(
  ctx: QueryCtx,
  eventId: Id<"buildCollaborationWebhookEvents">
) {
  const event = await ctx.db.get(eventId);
  if (!event) {
    throw new Error("Webhook event is unavailable.");
  }
  return event;
}

export async function nextBuildSequence(
  ctx: MutationCtx,
  input: Pick<
    EmitBuildCollaborationWebhookEventInput,
    "brokerageId" | "buildId" | "organizationId"
  >
) {
  const state = await ctx.db
    .query("buildCollaborationWebhookBuildSequences")
    .withIndex("by_buildId", (query) => query.eq("buildId", input.buildId))
    .unique();
  if (state) {
    if (
      state.organizationId !== input.organizationId ||
      state.brokerageId !== input.brokerageId
    ) {
      throw new Error("Webhook Build sequence tenancy integrity failure.");
    }
    const sequence = state.nextSequence + 1;
    await ctx.db.patch(state._id, {
      nextSequence: sequence,
      updatedAt: Date.now(),
    });
    return sequence;
  }
  await ctx.db.insert("buildCollaborationWebhookBuildSequences", {
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    nextSequence: 1,
    organizationId: input.organizationId,
    updatedAt: Date.now(),
  });
  return 1;
}

export async function nextEndpointSequence(
  ctx: MutationCtx,
  endpoint: Doc<"buildCollaborationWebhookEndpoints">
) {
  const current = await ctx.db.get(endpoint._id);
  if (!current || current.organizationId !== endpoint.organizationId) {
    throw new Error("Webhook endpoint sequence is unavailable.");
  }
  const sequence = current.nextSequence + 1;
  await ctx.db.patch(current._id, {
    nextSequence: sequence,
    updatedAt: Date.now(),
  });
  return sequence;
}

export async function deliveryStillAuthorized(
  ctx: QueryCtx,
  delivery: Doc<"buildCollaborationWebhookDeliveries">,
  endpoint: Doc<"buildCollaborationWebhookEndpoints">,
  event: Doc<"buildCollaborationWebhookEvents">
) {
  if (
    endpoint.status !== "active" ||
    endpoint.deliveryGeneration !== delivery.endpointGeneration ||
    endpoint.organizationId !== delivery.organizationId ||
    endpoint.brokerageId !== delivery.brokerageId ||
    event.organizationId !== delivery.organizationId ||
    event.brokerageId !== delivery.brokerageId ||
    event.buildId !== delivery.buildId
  ) {
    return false;
  }
  const tenant = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", delivery.organizationId)
    )
    .unique();
  return Boolean(
    tenant?.status === "active" &&
      (tenant.accessRevision ?? 0) === delivery.tenantAccessRevision &&
      (await findEndpointSubscription(ctx, endpoint._id, event.eventType))
  );
}

export async function requireActiveWebhookTenant(
  ctx: QueryCtx,
  input: { brokerageId: Id<"brokerages">; organizationId: string }
) {
  const tenant = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", input.organizationId)
    )
    .unique();
  if (
    !tenant ||
    tenant.brokerageId !== input.brokerageId ||
    tenant.status !== "active"
  ) {
    throw new Error("Build collaboration webhook tenant is not active.");
  }
  return tenant;
}

export function webhookPayload(event: Doc<"buildCollaborationWebhookEvents">) {
  return JSON.stringify({
    buildId: event.buildId,
    entity: { id: event.entityId, type: event.entityType },
    eventId: event._id,
    eventSequence: event.sequence,
    eventType: event.eventType,
    metadata: JSON.parse(event.metadataJson),
    occurredAt: event.occurredAt,
    organizationId: event.organizationId,
    payloadVersion: event.payloadVersion,
  });
}

export async function cancelDelivery(
  ctx: MutationCtx,
  delivery: Doc<"buildCollaborationWebhookDeliveries">,
  reason: string
) {
  const now = Date.now();
  await ctx.db.patch(delivery._id, {
    cancelledAt: now,
    failureReason: reason,
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
}

export async function scheduleNextEndpointDelivery(
  ctx: MutationCtx,
  endpointId: Id<"buildCollaborationWebhookEndpoints">,
  afterSequence: number
) {
  const next = await ctx.db
    .query("buildCollaborationWebhookDeliveries")
    .withIndex("by_endpointId_and_sequence", (query) =>
      query.eq("endpointId", endpointId).gt("sequence", afterSequence)
    )
    .first();
  if (next?.status === "pending") {
    await ctx.scheduler.runAfter(
      0,
      internal.build_collaboration_webhooks
        .dispatchBuildCollaborationWebhookDelivery,
      { deliveryId: next._id }
    );
  }
}

export async function scheduleDeliveryAt(
  ctx: MutationCtx,
  deliveryId: Id<"buildCollaborationWebhookDeliveries">,
  scheduledAt: number
) {
  await ctx.scheduler.runAt(
    scheduledAt,
    internal.build_collaboration_webhooks
      .dispatchBuildCollaborationWebhookDelivery,
    { deliveryId }
  );
}

export async function auditEndpointChange(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    command: string;
    endpoint: Doc<"buildCollaborationWebhookEndpoints">;
    eventType: string;
    reason: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.authorization.roles,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.endpoint._id,
    entityType: "buildCollaborationWebhookEndpoint",
    eventType: input.eventType,
    newState: JSON.stringify({
      endpointId: input.endpoint._id,
      revision: input.endpoint.revision,
      secretVersion: input.endpoint.secretVersion,
      status: input.endpoint.status,
    }),
    organizationId: input.authorization.organizationId,
    reason: input.reason,
    warnings: [],
  });
}

export function normalizeEventTypes(eventTypes: BuildCollaborationWebhookEventType[]) {
  const normalized = [...new Set(eventTypes)].sort();
  if (normalized.length === 0) {
    throw new Error("Select at least one collaboration webhook event type.");
  }
  for (const eventType of normalized) {
    assertEventType(eventType);
  }
  return normalized;
}

export function assertEventType(
  eventType: string
): asserts eventType is BuildCollaborationWebhookEventType {
  if (
    !(BUILD_COLLABORATION_WEBHOOK_EVENT_TYPES as readonly string[]).includes(
      eventType
    )
  ) {
    throw new Error("Unsupported collaboration webhook event type.");
  }
}

export function safeMetadataJson(
  metadata: Record<string, boolean | number | string | null | undefined>
) {
  const entries = Object.entries(metadata).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  for (const [key, value] of entries) {
    if (FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error(`Webhook metadata field ${key} is not permission-safe.`);
    }
    if (
      value !== undefined &&
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error(
        "Webhook metadata values must be scalar identifiers or state."
      );
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Webhook metadata numbers must be finite.");
    }
  }
  const serialized = JSON.stringify(Object.fromEntries(entries));
  if (new TextEncoder().encode(serialized).byteLength > MAX_METADATA_BYTES) {
    throw new Error("Webhook metadata exceeds the 8 KiB limit.");
  }
  return serialized;
}

export function normalizeEndpointUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Webhook endpoint URL is invalid.");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isPrivateIp(hostname)
  ) {
    throw new Error("Webhook endpoint must use a public HTTPS URL.");
  }
  url.hash = "";
  return url.toString();
}

export function isPrivateIp(hostname: string) {
  const isLiteral = hostname.includes(":") || IPV4_LITERAL_HOST.test(hostname);
  return isLiteral && !isPublicWebhookIpAddress(hostname);
}

export function generateSigningSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `dfwhsec_${[...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function secretFingerprint(secret: string) {
  return `…${secret.slice(-8)}`;
}

export function assertEndpointRevision(
  endpoint: Doc<"buildCollaborationWebhookEndpoints">,
  expectedRevision: number
) {
  if (endpoint.revision !== expectedRevision) {
    throw new Error("Webhook endpoint revision conflict; refresh and retry.");
  }
}

export function boundedText(
  value: string,
  label: string,
  minimumLength: number,
  maximumLength: number
) {
  const normalized = value.trim();
  if (normalized.length < minimumLength || normalized.length > maximumLength) {
    throw new Error(
      `${label} must be ${minimumLength}-${maximumLength} characters.`
    );
  }
  return normalized;
}
