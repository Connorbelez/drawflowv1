import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  assertNoActiveBuildCollaborationArchiveSnapshot,
  BUILD_COLLABORATION_PURGED_ERROR,
  getStoredBuildCollaborationState,
} from "./build_collaboration_lifecycle_state";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";
import type { Doc, MutationCtx, QueryCtx } from "./types";

const lifecycleStateValidator = v.object({
  closedAt: v.optional(v.number()),
  closedByRole: v.optional(buildCollaborationRoleValidator),
  closedByWorkosUserId: v.optional(v.string()),
  closeReason: v.optional(v.string()),
  purgedAt: v.optional(v.number()),
  reopenReason: v.optional(v.string()),
  reopenedAt: v.optional(v.number()),
  retentionEligibleAt: v.optional(v.number()),
  retentionPolicyId: v.optional(v.id("buildCollaborationRetentionPolicies")),
  retentionPolicyVersion: v.optional(v.number()),
  revision: v.number(),
  state: v.union(v.literal("open"), v.literal("closed"), v.literal("purged")),
});

const closureWaiverValidator = v.object({
  actionItemId: v.id("buildActionItems"),
  reason: v.string(),
});

export const getBuildCollaborationLifecycleState = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(lifecycleStateValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const state = await getStoredBuildCollaborationState(ctx, authorization);
    return projectLifecycleState(state);
  })
  .public();

export const closeBuildCollaboration = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
    waivers: v.optional(v.array(closureWaiverValidator)),
  })
  .returns(v.id("buildCollaborationBuildStates"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeLifecycleAuthority(ctx, args);
    const reason = requiredReason(args.reason, "A Build closure reason");
    const current = await getStoredBuildCollaborationState(ctx, authorization);
    assertNoActiveBuildCollaborationArchiveSnapshot(current);
    assertLifecycleRevision(current, args.expectedRevision);
    if (current?.state === "closed") {
      throw new Error("Build collaboration is already closed.");
    }
    if (current?.state === "purged") {
      throw new Error(BUILD_COLLABORATION_PURGED_ERROR);
    }

    const openItems = await listOpenBuildActionItems(ctx, authorization);
    const waivers = normalizeClosureWaivers(args.waivers ?? []);
    const openIds = new Set(openItems.map((item) => item._id));
    for (const actionItemId of waivers.keys()) {
      if (!openIds.has(actionItemId)) {
        throw new Error(
          "Closure waivers may reference only currently open Action Items on this Build."
        );
      }
    }
    const blockingItems = openItems.filter((item) => !waivers.has(item._id));
    if (blockingItems.length > 0) {
      throw new Error(
        `Build collaboration cannot close while ${blockingItems.length} Action Item${blockingItems.length === 1 ? " is" : "s are"} open. Complete, cancel, or explicitly waive every blocker.`
      );
    }

    const now = Date.now();
    const revision = (current?.revision ?? 0) + 1;
    const retentionPolicy = await activeRetentionPolicy(ctx, authorization);
    if (!retentionPolicy) {
      throw new Error(
        "Configure an active Build collaboration retention policy before closure."
      );
    }
    const retentionEligibleAt =
      now + retentionPolicy.retentionDays * 86_400_000;
    const stateId = current
      ? current._id
      : await ctx.db.insert("buildCollaborationBuildStates", {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          createdAt: now,
          organizationId: authorization.organizationId,
          revision: 0,
          state: "open",
          updatedAt: now,
        });
    await ctx.db.patch(stateId, {
      closedAt: now,
      closedByRole: authorization.effectiveRole.role,
      closedByWorkosUserId: authorization.viewer.subject,
      closeReason: reason,
      contentRevision: (current?.contentRevision ?? 0) + 1,
      purgedAt: undefined,
      reopenReason: undefined,
      reopenedAt: undefined,
      reopenedByRole: undefined,
      reopenedByWorkosUserId: undefined,
      retentionEligibleAt,
      retentionPolicyId: retentionPolicy?._id,
      retentionPolicyVersion: retentionPolicy?.version,
      revision,
      state: "closed",
      updatedAt: now,
    });
    for (const item of openItems) {
      const waiverReason = waivers.get(item._id);
      if (!waiverReason) {
        continue;
      }
      await ctx.db.insert("buildCollaborationClosureWaivers", {
        actionItemId: item._id,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        lifecycleRevision: revision,
        organizationId: authorization.organizationId,
        reason: waiverReason,
        waivedByRole: authorization.effectiveRole.role,
        waivedByWorkosUserId: authorization.viewer.subject,
      });
    }
    await recordLifecycleTransition(ctx, {
      authorization,
      eventType: "closed",
      newState: JSON.stringify({
        retentionEligibleAt,
        revision,
        state: "closed",
        waivedActionItemIds: [...waivers.keys()],
      }),
      now,
      priorState: JSON.stringify(projectLifecycleState(current)),
      reason,
      revision,
      stateId,
    });
    return stateId;
  })
  .public();

export const reopenBuildCollaboration = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("buildCollaborationBuildStates"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeLifecycleAuthority(ctx, args);
    const reason = requiredReason(args.reason, "A reopening reason");
    const current = await getStoredBuildCollaborationState(ctx, authorization);
    assertNoActiveBuildCollaborationArchiveSnapshot(current);
    assertLifecycleRevision(current, args.expectedRevision);
    if (!current || current.state === "open") {
      throw new Error("Build collaboration is already open.");
    }
    if (current.state === "purged") {
      throw new Error(BUILD_COLLABORATION_PURGED_ERROR);
    }
    const activePurge = await ctx.db
      .query("buildCollaborationRetentionPurges")
      .withIndex("by_buildId_and_state", (query) =>
        query.eq("buildId", authorization.build._id).eq("state", "in_progress")
      )
      .first();
    if (activePurge) {
      throw new Error(
        "Build collaboration cannot be reopened while retention purge is in progress."
      );
    }
    const now = Date.now();
    const revision = current.revision + 1;
    await ctx.db.patch(current._id, {
      contentRevision: (current.contentRevision ?? 0) + 1,
      reopenReason: reason,
      reopenedAt: now,
      reopenedByRole: authorization.effectiveRole.role,
      reopenedByWorkosUserId: authorization.viewer.subject,
      retentionEligibleAt: undefined,
      retentionPolicyId: undefined,
      retentionPolicyVersion: undefined,
      revision,
      state: "open",
      updatedAt: now,
    });
    await recordLifecycleTransition(ctx, {
      authorization,
      eventType: "reopened",
      newState: JSON.stringify({ revision, state: "open" }),
      now,
      priorState: JSON.stringify(projectLifecycleState(current)),
      reason,
      revision,
      stateId: current._id,
    });
    return current._id;
  })
  .public();

function projectLifecycleState(
  state: Doc<"buildCollaborationBuildStates"> | null
) {
  return {
    closedAt: state?.closedAt,
    closedByRole: state?.closedByRole,
    closedByWorkosUserId: state?.closedByWorkosUserId,
    closeReason: state?.closeReason,
    purgedAt: state?.purgedAt,
    reopenReason: state?.reopenReason,
    reopenedAt: state?.reopenedAt,
    retentionEligibleAt: state?.retentionEligibleAt,
    retentionPolicyId: state?.retentionPolicyId,
    retentionPolicyVersion: state?.retentionPolicyVersion,
    revision: state?.revision ?? 0,
    state: state?.state ?? ("open" as const),
  };
}

export async function authorizeLifecycleAuthority(
  ctx: MutationCtx & { viewer: ActiveBuildAuthorization["viewer"] },
  args: {
    buildId: ActiveBuildAuthorization["build"]["_id"];
    organizationId: string;
  }
) {
  const authorization = await authorizeActiveBuildCollaborationAccess(
    ctx,
    args
  );
  await requireHumanCollaborationActor(ctx, authorization);
  if (
    authorization.effectiveRole.role !== "admin" &&
    authorization.effectiveRole.role !== "principle-broker"
  ) {
    throw new Error(
      "Only an Admin or Principal Broker may close or reopen Build collaboration."
    );
  }
  return authorization;
}

async function listOpenBuildActionItems(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
) {
  const statuses = ["todo", "in_progress", "in_review", "blocked"] as const;
  const rows = (
    await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("buildActionItems")
          .withIndex("by_buildId_and_status_and_updatedAt", (query) =>
            query.eq("buildId", authorization.build._id).eq("status", status)
          )
          .take(501)
      )
    )
  ).flat();
  if (rows.length > 2000) {
    throw new Error(
      "Build closure preflight exceeded 2,000 open Action Items; reduce the queue before closing."
    );
  }
  return rows;
}

function normalizeClosureWaivers(
  submitted: Array<{
    actionItemId: Doc<"buildActionItems">["_id"];
    reason: string;
  }>
) {
  if (submitted.length > 2000) {
    throw new Error("A closure request may waive at most 2,000 Action Items.");
  }
  const waivers = new Map<Doc<"buildActionItems">["_id"], string>();
  for (const waiver of submitted) {
    if (waivers.has(waiver.actionItemId)) {
      throw new Error("Each Action Item may be waived only once per closure.");
    }
    waivers.set(
      waiver.actionItemId,
      requiredReason(waiver.reason, "Every Action Item waiver reason")
    );
  }
  return waivers;
}

function assertLifecycleRevision(
  state: Doc<"buildCollaborationBuildStates"> | null,
  expectedRevision: number
) {
  const actualRevision = state?.revision ?? 0;
  if (expectedRevision !== actualRevision) {
    throw new Error(
      `Build collaboration lifecycle changed concurrently; expected revision ${expectedRevision} but found ${actualRevision}.`
    );
  }
}

async function activeRetentionPolicy(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
) {
  const policy = await ctx.db
    .query("buildCollaborationRetentionPolicies")
    .withIndex("by_organizationId_and_state", (query) =>
      query
        .eq("organizationId", authorization.organizationId)
        .eq("state", "active")
    )
    .unique();
  if (policy && policy.brokerageId !== authorization.brokerage._id) {
    throw new Error("Build collaboration retention policy tenancy is invalid.");
  }
  return policy;
}

async function recordLifecycleTransition(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    eventType: "closed" | "reopened";
    newState: string;
    now: number;
    priorState: string;
    reason: string;
    revision: number;
    stateId: Doc<"buildCollaborationBuildStates">["_id"];
  }
) {
  const { authorization } = input;
  await ctx.db.insert("buildCollaborationBuildLifecycleEvents", {
    actorRole: authorization.effectiveRole.role,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    createdAt: input.now,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    revision: input.revision,
  });
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command:
      input.eventType === "closed"
        ? "closeBuildCollaboration"
        : "reopenBuildCollaboration",
    createdAt: input.now,
    entityId: input.stateId,
    entityType: "buildCollaborationBuildState",
    eventType: `build.collaboration.${input.eventType}`,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: input.now,
    eventType: `build.collaboration.${input.eventType}`,
    organizationId: authorization.organizationId,
    payloadPreview: input.newState,
    relatedEntityId: authorization.build._id,
    relatedEntityType: "activeBuild",
    status: "pending",
  });
}

function requiredReason(value: string, label: string) {
  const normalized = value.trim();
  if (normalized.length < 5 || normalized.length > 2000) {
    throw new Error(`${label} must be between 5 and 2,000 characters.`);
  }
  return normalized;
}
