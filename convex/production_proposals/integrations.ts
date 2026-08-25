/**
 * Production proposals integrations bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedAction, authenticatedMutation, normalizeRoleSlugs } from "../authz";
import { internalMutation, internalQuery } from "../fluent";
import { generateShareToken, shareTokenHash } from "../proposal_collaboration_model";
import { type Doc, type Id, type MutationCtx } from "../types";
import { requireAnyRole } from "./contractor_policy_helpers.js";
import { integrationEndpointProjectionValidator, integrationDeliveryProjectionValidator } from "./contracts_workflow.js";
import { integrationEndpointProjection, integrationDeliveryProjection, authorizeIntegrationAdmin, getIntegrationEndpointOrThrow, getIntegrationDeliveryAttemptOrThrow, requireIntegrationText, requireIntegrationReason, normalizeIntegrationEndpointUrl, normalizeIntegrationEventTypes, integrationEndpointAuditState, writeIntegrationEvent } from "./integration_helpers.js";

export const createIntegrationEndpoint = authenticatedMutation
  .input({
    endpointUrl: v.string(),
    eventTypes: v.array(v.string()),
    name: v.string(),
    payloadVersion: v.string(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      endpoint: integrationEndpointProjectionValidator,
      signingSecret: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const auth = await authorizeIntegrationAdmin(
      ctx,
      args.workosOrganizationId,
    );
    const now = Date.now();
    const name = requireIntegrationText(args.name, "Endpoint name");
    const endpointUrl = normalizeIntegrationEndpointUrl(args.endpointUrl);
    const eventTypes = normalizeIntegrationEventTypes(args.eventTypes);
    const payloadVersion = requireIntegrationText(
      args.payloadVersion,
      "Payload version",
    );
    const reason = requireIntegrationReason(args.reason);
    const signingSecret = `dfwhsec_${generateShareToken().replaceAll("-", "")}`;
    const secretHash = await shareTokenHash(signingSecret);
    const endpointId = await ctx.db.insert("integrationEndpoints", {
      brokerageId: auth.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      endpointUrl,
      eventTypes,
      name,
      organizationId: args.workosOrganizationId,
      payloadVersion,
      secretFingerprint: `…${signingSecret.slice(-6)}`,
      secretHash,
      secretVersion: 1,
      status: "draft",
      updatedAt: now,
    });
    const endpoint = await ctx.db.get(endpointId);
    if (!endpoint) {
      throw new ConvexError("Integration endpoint could not be created.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "createIntegrationEndpoint",
      endpoint,
      eventType: "integration.endpoint.created",
      newState: integrationEndpointAuditState(endpoint),
      organizationId: args.workosOrganizationId,
      reason,
    });
    return { endpoint: integrationEndpointProjection(endpoint), signingSecret };
  })
  .public();

export const updateIntegrationEndpointConfiguration = authenticatedMutation
  .input({
    endpointId: v.id("integrationEndpoints"),
    endpointUrl: v.string(),
    eventTypes: v.array(v.string()),
    name: v.string(),
    payloadVersion: v.string(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(integrationEndpointProjectionValidator)
  .handler(async (ctx, args) => {
    const { auth, endpoint } = await getIntegrationEndpointOrThrow(
      ctx,
      args.endpointId,
      args.workosOrganizationId,
    );
    if (endpoint.status === "revoked") {
      throw new ConvexError("Revoked endpoints cannot be changed.");
    }
    const now = Date.now();
    const priorState = integrationEndpointAuditState(endpoint);
    await ctx.db.patch(endpoint._id, {
      endpointUrl: normalizeIntegrationEndpointUrl(args.endpointUrl),
      eventTypes: normalizeIntegrationEventTypes(args.eventTypes),
      name: requireIntegrationText(args.name, "Endpoint name"),
      payloadVersion: requireIntegrationText(
        args.payloadVersion,
        "Payload version",
      ),
      updatedAt: now,
      validatedAt: undefined,
    });
    const updated = await ctx.db.get(endpoint._id);
    if (!updated) {
      throw new ConvexError("Integration endpoint unavailable.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "updateIntegrationEndpointConfiguration",
      endpoint: updated,
      eventType: "integration.endpoint.configuration_updated",
      newState: integrationEndpointAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState,
      reason: requireIntegrationReason(args.reason),
    });
    return integrationEndpointProjection(updated);
  })
  .public();

export const validateIntegrationEndpoint = authenticatedMutation
  .input({
    endpointId: v.id("integrationEndpoints"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(integrationEndpointProjectionValidator)
  .handler(async (ctx, args) => {
    const { auth, endpoint } = await getIntegrationEndpointOrThrow(
      ctx,
      args.endpointId,
      args.workosOrganizationId,
    );
    if (endpoint.status === "revoked") {
      throw new ConvexError("Revoked endpoints cannot be validated.");
    }
    const now = Date.now();
    await ctx.db.patch(endpoint._id, { updatedAt: now, validatedAt: now });
    const updated = await ctx.db.get(endpoint._id);
    if (!updated) {
      throw new ConvexError("Integration endpoint unavailable.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "validateIntegrationEndpoint",
      endpoint: updated,
      eventType: "integration.endpoint.validated",
      newState: integrationEndpointAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState: integrationEndpointAuditState(endpoint),
      reason: requireIntegrationReason(args.reason),
    });
    return integrationEndpointProjection(updated);
  })
  .public();

export const activateIntegrationEndpoint = authenticatedMutation
  .input({
    endpointId: v.id("integrationEndpoints"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(integrationEndpointProjectionValidator)
  .handler(async (ctx, args) => {
    const { auth, endpoint } = await getIntegrationEndpointOrThrow(
      ctx,
      args.endpointId,
      args.workosOrganizationId,
    );
    if (!endpoint.validatedAt) {
      throw new ConvexError("Validate the endpoint before activation.");
    }
    if (endpoint.status === "revoked") {
      throw new ConvexError("Revoked endpoints cannot be activated.");
    }
    const now = Date.now();
    await ctx.db.patch(endpoint._id, {
      activatedAt: now,
      disabledAt: undefined,
      status: "active",
      updatedAt: now,
    });
    const updated = await ctx.db.get(endpoint._id);
    if (!updated) {
      throw new ConvexError("Integration endpoint unavailable.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "activateIntegrationEndpoint",
      endpoint: updated,
      eventType: "integration.endpoint.activated",
      newState: integrationEndpointAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState: integrationEndpointAuditState(endpoint),
      reason: requireIntegrationReason(args.reason),
    });
    return integrationEndpointProjection(updated);
  })
  .public();

export const disableIntegrationEndpoint = authenticatedMutation
  .input({
    endpointId: v.id("integrationEndpoints"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(integrationEndpointProjectionValidator)
  .handler(async (ctx, args) => {
    const { auth, endpoint } = await getIntegrationEndpointOrThrow(
      ctx,
      args.endpointId,
      args.workosOrganizationId,
    );
    if (endpoint.status === "revoked") {
      throw new ConvexError("Revoked endpoints are already unavailable.");
    }
    const now = Date.now();
    await ctx.db.patch(endpoint._id, {
      disabledAt: now,
      status: "disabled",
      updatedAt: now,
    });
    const updated = await ctx.db.get(endpoint._id);
    if (!updated) {
      throw new ConvexError("Integration endpoint unavailable.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "disableIntegrationEndpoint",
      endpoint: updated,
      eventType: "integration.endpoint.disabled",
      newState: integrationEndpointAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState: integrationEndpointAuditState(endpoint),
      reason: requireIntegrationReason(args.reason),
    });
    return integrationEndpointProjection(updated);
  })
  .public();

export const rotateIntegrationEndpointSecret = authenticatedMutation
  .input({
    endpointId: v.id("integrationEndpoints"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      endpoint: integrationEndpointProjectionValidator,
      signingSecret: v.string(),
    }),
  )
  .handler(async (ctx, args) => {
    const { auth, endpoint } = await getIntegrationEndpointOrThrow(
      ctx,
      args.endpointId,
      args.workosOrganizationId,
    );
    if (endpoint.status === "revoked") {
      throw new ConvexError("Revoked endpoint secrets cannot be rotated.");
    }
    const signingSecret = `dfwhsec_${generateShareToken().replaceAll("-", "")}`;
    const now = Date.now();
    await ctx.db.patch(endpoint._id, {
      secretFingerprint: `…${signingSecret.slice(-6)}`,
      secretHash: await shareTokenHash(signingSecret),
      secretVersion: endpoint.secretVersion + 1,
      updatedAt: now,
    });
    const updated = await ctx.db.get(endpoint._id);
    if (!updated) {
      throw new ConvexError("Integration endpoint unavailable.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "rotateIntegrationEndpointSecret",
      endpoint: updated,
      eventType: "integration.endpoint.secret_rotated",
      newState: integrationEndpointAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState: integrationEndpointAuditState(endpoint),
      reason: requireIntegrationReason(args.reason),
    });
    return { endpoint: integrationEndpointProjection(updated), signingSecret };
  })
  .public();

export const revokeIntegrationEndpoint = authenticatedMutation
  .input({
    endpointId: v.id("integrationEndpoints"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(integrationEndpointProjectionValidator)
  .handler(async (ctx, args) => {
    const { auth, endpoint } = await getIntegrationEndpointOrThrow(
      ctx,
      args.endpointId,
      args.workosOrganizationId,
    );
    const now = Date.now();
    await ctx.db.patch(endpoint._id, {
      revokedAt: now,
      secretHash: await shareTokenHash(generateShareToken()),
      status: "revoked",
      updatedAt: now,
    });
    const updated = await ctx.db.get(endpoint._id);
    if (!updated) {
      throw new ConvexError("Integration endpoint unavailable.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "revokeIntegrationEndpoint",
      endpoint: updated,
      eventType: "integration.endpoint.revoked",
      newState: integrationEndpointAuditState(updated),
      organizationId: args.workosOrganizationId,
      priorState: integrationEndpointAuditState(endpoint),
      reason: requireIntegrationReason(args.reason),
    });
    return integrationEndpointProjection(updated);
  })
  .public();

export const retryIntegrationDeliveryAttempt = authenticatedMutation
  .input({
    attemptId: v.id("integrationDeliveryAttempts"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(integrationDeliveryProjectionValidator)
  .handler(async (ctx, args) => {
    const { attempt, auth, endpoint } =
      await getIntegrationDeliveryAttemptOrThrow(
        ctx,
        args.attemptId,
        args.workosOrganizationId,
      );
    if (attempt.status !== "failed") {
      throw new ConvexError("Only failed deliveries can be retried.");
    }
    if (endpoint.status !== "active") {
      throw new ConvexError("Activate the endpoint before retrying delivery.");
    }
    requireIntegrationReason(args.reason);
    const existingRetry = await ctx.db
      .query("integrationDeliveryAttempts")
      .withIndex("by_event", (q) =>
        q
          .eq("organizationId", args.workosOrganizationId)
          .eq("eventId", attempt.eventId),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("retryOfAttemptId"), attempt._id),
          q.eq(q.field("status"), "retry_pending"),
        ),
      )
      .first();
    if (existingRetry) {
      return integrationDeliveryProjection(existingRetry, endpoint);
    }
    const now = Date.now();
    const retryId = await ctx.db.insert("integrationDeliveryAttempts", {
      attemptNumber: attempt.attemptNumber + 1,
      attemptedAt: now,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      deliveryId: `delivery_${crypto.randomUUID()}`,
      endpointId: endpoint._id,
      eventId: attempt.eventId,
      eventType: attempt.eventType,
      nextRetryAt: now,
      organizationId: args.workosOrganizationId,
      payloadVersion: attempt.payloadVersion,
      retryOfAttemptId: attempt._id,
      status: "retry_pending",
      updatedAt: now,
    });
    const retry = await ctx.db.get(retryId);
    if (!retry) {
      throw new ConvexError("Delivery retry could not be scheduled.");
    }
    await writeIntegrationEvent(ctx, {
      auth,
      command: "retryIntegrationDeliveryAttempt",
      endpoint,
      eventType: "integration.delivery.retry_scheduled",
      newState: JSON.stringify({
        attemptNumber: retry.attemptNumber,
        deliveryId: retry.deliveryId,
        eventId: retry.eventId,
        status: retry.status,
      }),
      organizationId: args.workosOrganizationId,
      reason: requireIntegrationReason(args.reason),
    });
    return integrationDeliveryProjection(retry, endpoint);
  })
  .public();

type IntegrationDeliveryDispatchContext = {
  attempt: Doc<"integrationDeliveryAttempts">;
  endpoint: {
    endpointUrl: string;
    name: string;
    secretHash: string;
  };
};

type IntegrationDeliveryProjection = {
  _id: Id<"integrationDeliveryAttempts">;
  attemptNumber: number;
  attemptedAt: number;
  completedAt?: number;
  deliveryId: string;
  endpointId: Id<"integrationEndpoints">;
  endpointName: string;
  endpointUrl: string;
  eventId: string;
  eventType: string;
  nextRetryAt?: number;
  payloadVersion: string;
  responseCode?: number;
  retryOfAttemptId?: Id<"integrationDeliveryAttempts">;
  safeError?: string;
  status: Doc<"integrationDeliveryAttempts">["status"];
  updatedAt: number;
};

export const getIntegrationDeliveryDispatchContext = internalQuery
  .input({
    attemptId: v.id("integrationDeliveryAttempts"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.organizationId !== args.workosOrganizationId) {
      throw new ConvexError("Integration delivery unavailable.");
    }
    const endpoint = await ctx.db.get(attempt.endpointId);
    if (
      !endpoint ||
      endpoint.organizationId !== args.workosOrganizationId ||
      endpoint.status !== "active"
    ) {
      throw new ConvexError("Integration endpoint is not active.");
    }
    if (attempt.status !== "pending" && attempt.status !== "retry_pending") {
      throw new ConvexError("Integration delivery is not pending dispatch.");
    }
    return {
      attempt,
      endpoint: {
        endpointUrl: endpoint.endpointUrl,
        name: endpoint.name,
        secretHash: endpoint.secretHash,
      },
    };
  })
  .internal();

export const completeIntegrationDeliveryDispatch = internalMutation
  .input({
    actorRoles: v.array(v.string()),
    actorWorkosUserId: v.string(),
    attemptId: v.id("integrationDeliveryAttempts"),
    responseCode: v.optional(v.number()),
    safeError: v.optional(v.string()),
    status: v.union(v.literal("delivered"), v.literal("failed")),
    workosOrganizationId: v.string(),
  })
  .returns(integrationDeliveryProjectionValidator)
  .handler(async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.organizationId !== args.workosOrganizationId) {
      throw new ConvexError("Integration delivery unavailable.");
    }
    const endpoint = await ctx.db.get(attempt.endpointId);
    if (!endpoint || endpoint.organizationId !== args.workosOrganizationId) {
      throw new ConvexError("Integration endpoint unavailable.");
    }
    if (attempt.status !== "pending" && attempt.status !== "retry_pending") {
      throw new ConvexError("Integration delivery is no longer pending.");
    }
    const now = Date.now();
    const nextRetryAt =
      args.status === "failed"
        ? now + Math.min(86_400_000, 300_000 * 2 ** (attempt.attemptNumber - 1))
        : undefined;
    await ctx.db.patch(attempt._id, {
      completedAt: now,
      nextRetryAt,
      responseCode: args.responseCode,
      safeError: args.safeError,
      status: args.status,
      updatedAt: now,
    });
    const updated = await ctx.db.get(attempt._id);
    if (!updated) {
      throw new ConvexError("Integration delivery unavailable.");
    }
    await writeIntegrationEvent(ctx, {
      auth: {
        brokerage: await requireBrokerageById(ctx, endpoint.brokerageId),
        roles: normalizeRoleSlugs(args.actorRoles),
        subject: args.actorWorkosUserId,
      },
      command: "dispatchIntegrationDeliveryAttempt",
      endpoint,
      eventType:
        args.status === "delivered"
          ? "integration.delivery.delivered"
          : "integration.delivery.failed",
      newState: JSON.stringify({
        attemptId: String(updated._id),
        responseCode: updated.responseCode,
        status: updated.status,
      }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({ status: attempt.status }),
      reason:
        args.status === "delivered"
          ? "Signed webhook delivery accepted by the endpoint."
          : (args.safeError ?? "Signed webhook delivery failed."),
    });
    return integrationDeliveryProjection(updated, endpoint);
  })
  .internal();

export const dispatchIntegrationDeliveryAttempt = authenticatedAction
  .input({
    attemptId: v.id("integrationDeliveryAttempts"),
    workosOrganizationId: v.string(),
  })
  .returns(integrationDeliveryProjectionValidator)
  .handler(async (ctx, args): Promise<IntegrationDeliveryProjection> => {
    requireAnyRole(ctx.viewer.roles, ["admin"]);
    const dispatchContext = (await ctx.runQuery(
      internal.production_proposals.getIntegrationDeliveryDispatchContext,
      args,
    )) as IntegrationDeliveryDispatchContext;
    const timestamp = String(Date.now());
    const body = JSON.stringify({
      deliveryId: dispatchContext.attempt.deliveryId,
      eventId: dispatchContext.attempt.eventId,
      eventType: dispatchContext.attempt.eventType,
      occurredAt: dispatchContext.attempt.createdAt,
      payloadVersion: dispatchContext.attempt.payloadVersion,
    });
    const signature = await integrationDeliverySignature(
      dispatchContext.endpoint.secretHash,
      `${timestamp}.${body}`,
    );
    let responseCode: number | undefined;
    let safeError: string | undefined;
    let status: "delivered" | "failed" = "failed";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const request: Request = new Request(
        normalizeIntegrationEndpointUrl(dispatchContext.endpoint.endpointUrl),
        {
          body,
          headers: {
            "Content-Type": "application/json",
            "X-DrawFlow-Delivery": dispatchContext.attempt.deliveryId,
            "X-DrawFlow-Signature": `v1=${signature}`,
            "X-DrawFlow-Timestamp": timestamp,
          },
          method: "POST",
          signal: controller.signal,
        },
      );
      const response = await fetch(request);
      responseCode = response.status;
      if (response.ok) {
        status = "delivered";
      } else {
        safeError = `Endpoint returned HTTP ${response.status}. Response content was not stored.`;
      }
    } catch (error) {
      safeError =
        error instanceof DOMException && error.name === "AbortError"
          ? "Endpoint timed out before acknowledging delivery."
          : "Endpoint could not be reached. No response content was stored.";
    } finally {
      clearTimeout(timeout);
    }
    return await ctx.runMutation(
      internal.production_proposals.completeIntegrationDeliveryDispatch,
      {
        actorRoles: ctx.viewer.roles,
        actorWorkosUserId: ctx.viewer.subject,
        attemptId: args.attemptId,
        responseCode,
        safeError,
        status,
        workosOrganizationId: args.workosOrganizationId,
      },
    );
  })
  .public();

async function integrationDeliverySignature(
  secretHash: string,
  message: string,
) {
  const keyBytes = new Uint8Array(
    secretHash.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requireBrokerageById(
  ctx: MutationCtx,
  brokerageId: Id<"brokerages">,
) {
  const brokerage = await ctx.db.get(brokerageId);
  if (!brokerage) {
    throw new ConvexError("Integration brokerage unavailable.");
  }
  return brokerage;
}
