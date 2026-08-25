import { ConvexError } from "convex/values";

import { privacyMinimizedAuditState } from "../administrative_override_policy";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  STORAGE_OBJECT_MISSING_PATTERN,
  TOMBSTONE_RETENTION_MS,
} from "./contracts";
import type { Doc, Id, MutationCtx } from "../types";

export async function beginOperation(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    operationKey: string;
    operationKind: Doc<"dataRetentionOperations">["operationKind"];
    reasonCode: string;
    scopeId: string;
    scopeKind: string;
    now: number;
  }
) {
  const existing = await findOperation(
    ctx,
    input.build.organizationId,
    input.operationKey
  );
  if (existing?.state === "completed") {
    return existing;
  }
  if (existing) {
    await ctx.db.patch(existing._id, {
      attemptCount: (existing.attemptCount ?? 1) + 1,
      state: "started",
      blockReason: undefined,
      failureReason: undefined,
      updatedAt: input.now,
    });
    return await ctx.db.get(existing._id);
  }
  const id = await ctx.db.insert("dataRetentionOperations", {
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    operationKey: input.operationKey,
    operationKind: input.operationKind,
    organizationId: input.build.organizationId,
    reasonCode: input.reasonCode,
    scopeId: input.scopeId,
    scopeKind: input.scopeKind,
    startedAt: input.now,
    attemptCount: 1,
    state: "started",
    updatedAt: input.now,
  });
  return await ctx.db.get(id);
}

export async function findOperation(
  ctx: MutationCtx,
  organizationId: string,
  operationKey: string
) {
  return await ctx.db
    .query("dataRetentionOperations")
    .withIndex("by_operationKey", (query) =>
      query
        .eq("organizationId", organizationId)
        .eq("operationKey", operationKey)
    )
    .unique();
}

export async function blockOperation(
  ctx: MutationCtx,
  operation: Doc<"dataRetentionOperations">,
  reason: string,
  asOf: number
) {
  await ctx.db.patch(operation._id, {
    blockReason: reason,
    state: "blocked",
    updatedAt: asOf,
  });
}

export async function completeOperation(
  ctx: MutationCtx,
  operation: Doc<"dataRetentionOperations">,
  affectedCount: number,
  asOf: number
) {
  await ctx.db.patch(operation._id, {
    affectedCount,
    completedAt: asOf,
    state: "completed",
    updatedAt: asOf,
  });
}

export async function addTombstone(
  ctx: MutationCtx,
  input: {
    build: Doc<"activeBuilds">;
    completedAt: number;
    lifecycleState: string;
    operation: Doc<"dataRetentionOperations">;
    physicalStorageDeletedAt?: number;
    revisionCount?: number;
    scopeId: string;
    scopeKind: string;
    sourceHashSha256?: string;
    tombstoneExpiresAt: number;
  }
) {
  const existing = await findTombstone(ctx, input.scopeKind, input.scopeId);
  if (existing) {
    return existing._id;
  }
  const sourceProofHmacSha256 = input.sourceHashSha256
    ? await retentionSourceProofHmac(
        input.build.organizationId,
        input.sourceHashSha256
      )
    : undefined;
  return await ctx.db.insert("dataRetentionTombstones", {
    brokerageId: input.build.brokerageId,
    buildId: input.build._id,
    completedAt: input.completedAt,
    lifecycleState: input.lifecycleState,
    operationId: input.operation._id,
    organizationId: input.build.organizationId,
    physicalStorageDeletedAt: input.physicalStorageDeletedAt,
    revisionCount: input.revisionCount,
    scopeId: input.scopeId,
    scopeKind: input.scopeKind,
    sourceProofHmacSha256,
    tombstoneExpiresAt: input.tombstoneExpiresAt,
  });
}

export async function addSystemAuditedTombstone(
  ctx: MutationCtx,
  input: Parameters<typeof addTombstone>[1],
  audit: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: object;
    now: number;
    reason: string;
  }
) {
  const tombstoneId = await addTombstone(ctx, input);
  const tombstone = await ctx.db.get(tombstoneId);
  if (tombstone?.auditEventId) {
    return tombstoneId;
  }
  const auditEventId = await recordSystemAudit(ctx, input.build, audit);
  await ctx.db.patch(tombstoneId, { auditEventId });
  return tombstoneId;
}

export async function findTombstone(
  ctx: MutationCtx,
  scopeKind: string,
  scopeId: string
) {
  return await ctx.db
    .query("dataRetentionTombstones")
    .withIndex("by_scopeKind_and_scopeId", (query) =>
      query.eq("scopeKind", scopeKind).eq("scopeId", scopeId)
    )
    .unique();
}

export async function recordSystemAudit(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: object;
    now: number;
    reason: string;
  }
) {
  return await recordAudit(ctx, {
    actorKind: "system",
    actorRoles: ["system"],
    actorWorkosUserId: "system:data-retention",
    brokerageId: build.brokerageId,
    buildId: build._id,
    command: input.command,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: build.organizationId,
    reason: input.reason,
    now: input.now,
  });
}

export async function recordAudit(
  ctx: MutationCtx,
  input: {
    actorKind: "agent" | "automation" | "human" | "service" | "system";
    actorRole?: ActiveBuildAuthorization["effectiveRole"]["role"];
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    buildId?: Id<"activeBuilds">;
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: object;
    organizationId: string;
    priorState?: object;
    reason: string;
    now: number;
  }
) {
  const priorState = input.priorState
    ? privacyMinimizedAuditState(input.priorState)
    : undefined;
  const newState = privacyMinimizedAuditState(input.newState);
  const actorRoles = input.actorRoles.slice(0, 100);
  const auditEventId = await ctx.db.insert("auditEvents", {
    actorKind: input.actorKind,
    actorRole: input.actorRole,
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    effectiveCapacity: input.actorRole,
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    command: input.command,
    createdAt: input.now,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: JSON.stringify(newState),
    organizationId: input.organizationId,
    priorState: priorState ? JSON.stringify(priorState) : undefined,
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.brokerageId,
    createdAt: input.now,
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify(newState),
    relatedEntityId: input.entityId,
    relatedEntityType: input.entityType,
    status: "pending",
  });
  return auditEventId;
}


export async function deleteStorageIfPresent(
  ctx: MutationCtx,
  storageId: Id<"_storage">
) {
  try {
    await ctx.storage.delete(storageId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!STORAGE_OBJECT_MISSING_PATTERN.test(message)) {
      throw error;
    }
  }
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function retentionSourceProofHmac(
  organizationId: string,
  sourceHashSha256: string
) {
  const secret = requireRetentionTombstoneHmacKey();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${organizationId}:${sourceHashSha256}`)
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function requireRetentionTombstoneHmacKey() {
  const secret = process.env.DATA_RETENTION_TOMBSTONE_HMAC_KEY?.trim();
  if (!secret) {
    throw new ConvexError(
      "DATA_RETENTION_TOMBSTONE_HMAC_KEY is required for disposal proofs."
    );
  }
  return secret;
}
