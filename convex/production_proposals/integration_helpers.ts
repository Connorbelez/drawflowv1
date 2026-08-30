/**
 * Production proposals integration helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError } from "convex/values";
import { type AuthorizedViewer, type RoleSlug } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { authorizeBrokerage } from "./authorization_core.js";
import { requireAnyRole, normalizeOptionalString } from "./contractor_policy_helpers.js";

export function integrationEndpointProjection(endpoint: Doc<"integrationEndpoints">) {
  return {
    _id: endpoint._id,
    activatedAt: endpoint.activatedAt,
    createdAt: endpoint.createdAt,
    disabledAt: endpoint.disabledAt,
    endpointUrl: endpoint.endpointUrl,
    eventTypes: endpoint.eventTypes,
    name: endpoint.name,
    payloadVersion: endpoint.payloadVersion,
    revokedAt: endpoint.revokedAt,
    secretFingerprint: endpoint.secretFingerprint,
    secretVersion: endpoint.secretVersion,
    status: endpoint.status,
    updatedAt: endpoint.updatedAt,
    validatedAt: endpoint.validatedAt,
  };
}

export function integrationDeliveryProjection(
  attempt: Doc<"integrationDeliveryAttempts">,
  endpoint: Doc<"integrationEndpoints">,
) {
  return {
    _id: attempt._id,
    attemptNumber: attempt.attemptNumber,
    attemptedAt: attempt.attemptedAt,
    completedAt: attempt.completedAt,
    deliveryId: attempt.deliveryId,
    endpointId: attempt.endpointId,
    endpointName: endpoint.name,
    endpointUrl: endpoint.endpointUrl,
    eventId: attempt.eventId,
    eventType: attempt.eventType,
    nextRetryAt: attempt.nextRetryAt,
    payloadVersion: attempt.payloadVersion,
    responseCode: attempt.responseCode,
    retryOfAttemptId: attempt.retryOfAttemptId,
    safeError: sanitizeIntegrationError(attempt.safeError),
    status: attempt.status,
    updatedAt: attempt.updatedAt,
  };
}

export async function authorizeIntegrationAdmin(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId);
  requireAnyRole(auth.roles, ["admin"]);
  return auth;
}

export async function getIntegrationEndpointOrThrow(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  endpointId: Id<"integrationEndpoints">,
  workosOrganizationId: string,
) {
  const auth = await authorizeIntegrationAdmin(ctx, workosOrganizationId);
  const endpoint = await ctx.db.get(endpointId);
  if (
    !endpoint ||
    endpoint.brokerageId !== auth.brokerage._id ||
    endpoint.organizationId !== workosOrganizationId
  ) {
    throw new ConvexError("Integration endpoint unavailable.");
  }
  return { auth, endpoint };
}

export async function getIntegrationDeliveryAttemptOrThrow(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  attemptId: Id<"integrationDeliveryAttempts">,
  workosOrganizationId: string,
) {
  const auth = await authorizeIntegrationAdmin(ctx, workosOrganizationId);
  const attempt = await ctx.db.get(attemptId);
  if (
    !attempt ||
    attempt.brokerageId !== auth.brokerage._id ||
    attempt.organizationId !== workosOrganizationId
  ) {
    throw new ConvexError("Integration delivery unavailable.");
  }
  const endpoint = await ctx.db.get(attempt.endpointId);
  if (
    !endpoint ||
    endpoint.brokerageId !== auth.brokerage._id ||
    endpoint.organizationId !== workosOrganizationId
  ) {
    throw new ConvexError("Integration endpoint unavailable.");
  }
  return { attempt, auth, endpoint };
}

export function requireIntegrationText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new ConvexError(`${label} is required.`);
  }
  return normalized;
}

export function requireIntegrationReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 8) {
    throw new ConvexError("Provide a reason with at least 8 characters.");
  }
  return normalized;
}

export function normalizeIntegrationEndpointUrl(value: string) {
  const normalized = value.trim();
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(normalized);
  } catch {
    throw new ConvexError("Enter a valid HTTPS endpoint URL.");
  }
  if (endpointUrl.protocol !== "https:") {
    throw new ConvexError("Integration endpoints must use HTTPS.");
  }
  const hostname = endpointUrl.hostname
    .toLowerCase()
    .replaceAll("[", "")
    .replaceAll("]", "");
  const ipv4Parts = hostname.split(".").map(Number);
  const isIpv4 =
    ipv4Parts.length === 4 &&
    ipv4Parts.every(
      (part) => Number.isInteger(part) && part >= 0 && part <= 255,
    );
  const isPrivateIpv4 =
    isIpv4 &&
    (ipv4Parts[0] === 10 ||
      ipv4Parts[0] === 127 ||
      (ipv4Parts[0] === 169 && ipv4Parts[1] === 254) ||
      (ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31) ||
      (ipv4Parts[0] === 192 && ipv4Parts[1] === 168));
  const isPrivateHostname =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:");
  if (isPrivateIpv4 || isPrivateHostname) {
    throw new ConvexError(
      "Integration endpoint hosts must be publicly routable.",
    );
  }
  const allowedHosts = process.env.DRAWFLOW_WEBHOOK_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    allowedHosts?.length &&
    !allowedHosts.some(
      (allowedHost) =>
        hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
    )
  ) {
    throw new ConvexError("Integration endpoint host is not allowlisted.");
  }
  endpointUrl.username = "";
  endpointUrl.password = "";
  endpointUrl.hash = "";
  return endpointUrl.toString();
}

export function normalizeIntegrationEventTypes(eventTypes: string[]) {
  const normalized = [
    ...new Set(eventTypes.map((eventType) => eventType.trim()).filter(Boolean)),
  ];
  if (normalized.length === 0) {
    throw new ConvexError("Select at least one event subscription.");
  }
  return normalized;
}

function sanitizeIntegrationError(value?: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return;
  }
  return normalized
    .replace(/dfwhsec_[A-Za-z0-9-]+/g, "[secret redacted]")
    .replace(
      /(authorization|secret|token|signature)\s*[:=]\s*\S+/gi,
      "$1: [redacted]",
    )
    .slice(0, 500);
}

export function integrationEndpointAuditState(endpoint: Doc<"integrationEndpoints">) {
  return JSON.stringify({
    endpointUrl: endpoint.endpointUrl,
    eventTypes: endpoint.eventTypes,
    name: endpoint.name,
    payloadVersion: endpoint.payloadVersion,
    secretFingerprint: endpoint.secretFingerprint,
    secretVersion: endpoint.secretVersion,
    status: endpoint.status,
    validatedAt: endpoint.validatedAt,
  });
}

export async function writeIntegrationEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    endpoint: Doc<"integrationEndpoints">;
    eventType: string;
    newState?: string;
    organizationId: string;
    priorState?: string;
    reason: string;
  },
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: String(input.endpoint._id),
    entityType: "integrationEndpoint",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      endpointId: String(input.endpoint._id),
      status: input.endpoint.status,
    }),
    relatedEntityId: input.endpoint._id,
    relatedEntityType: "integrationEndpoint",
    status: "pending",
  });
}

export async function getRecipientDeliveryOrThrow(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  deliveryId: Id<"recipientDeliveries">,
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId);
  const delivery = await ctx.db.get(deliveryId);
  if (
    !delivery ||
    delivery.brokerageId !== auth.brokerage._id ||
    delivery.organizationId !== workosOrganizationId ||
    delivery.recipientWorkosUserId !== auth.subject
  ) {
    throw new ConvexError("Delivery unavailable.");
  }
  return delivery;
}
