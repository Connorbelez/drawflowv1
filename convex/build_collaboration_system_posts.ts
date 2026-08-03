import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { buildActionItemQueueSortAt } from "./build_action_item_deadline_model";
import { recordBuildActionItemRevision } from "./build_action_item_history";
import {
  linkBuildActionItemToPost,
  syncLinkedActionItemPostCounts,
} from "./build_action_item_post_links";
import {
  type BuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import { queueBuildCollaborationSearchOwnerRebuild } from "./build_collaboration_search_maintenance";
import {
  publishCanonicalBuildCollaborationSystemEvent,
  resolveSystemEventScope,
} from "./build_collaboration_system_events";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const SYSTEM_AUTHOR = "system";
const SYSTEM_LABEL = "DrawFlow System";

export type MilestoneSystemActivationReason =
  | "explicit_start"
  | "recovery"
  | "scheduled";

export type SystemActionItemPresentationColumn =
  | "backlog"
  | "behind_schedule"
  | "in_progress"
  | "in_review"
  | "approved";

export type SystemActionItemPresentation = {
  attention?: "overdue_completion";
  column: SystemActionItemPresentationColumn;
  plannedCompletionDate?: string;
  plannedStartDate?: string;
  state: "known" | "unknown";
  timezone?: string;
  unknownReason?: string;
};

/** Validate and normalize the one canonical timezone accepted by Build writes. */
export function validateBuildTimezone(value: string) {
  const timezone = value.trim();
  if (!timezone || timezone.length > 120) {
    throw new Error("Build timezone must be a valid IANA timezone string.");
  }
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      new Date(0)
    );
  } catch {
    throw new Error(
      `Build timezone ${timezone} is not a valid IANA timezone string.`
    );
  }
  return timezone;
}

export function buildLocalDateAt(epochMs: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: validateBuildTimezone(timezone),
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(epochMs))
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addBuildLocalDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  if (
    !(
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(day)
    ) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(`Invalid Build-local calendar date ${date}.`);
  }
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + Math.round(days));
  return next.toISOString().slice(0, 10);
}

function timeZoneOffsetMs(epochMs: number, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: timezone,
      year: "numeric",
    })
      .formatToParts(new Date(epochMs))
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Return the UTC instant corresponding to Build-local midnight, DST-safe. */
export function buildLocalMidnightUtc(date: string, timezone: string) {
  const normalizedTimezone = validateBuildTimezone(timezone);
  const [year, month, day] = date.split("-").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day);
  let candidate = wallClockUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    candidate = wallClockUtc - timeZoneOffsetMs(candidate, normalizedTimezone);
  }
  return candidate;
}

function unknownSystemActionItemPresentation(reason: string) {
  return {
    column: "backlog" as const,
    state: "unknown" as const,
    unknownReason: reason,
  } satisfies SystemActionItemPresentation;
}

export async function deriveMilestoneSystemActionItemPresentation(
  ctx: QueryCtx,
  input: {
    actionItem: Doc<"buildActionItems">;
    asOf: number;
    build: Doc<"activeBuilds">;
  }
): Promise<SystemActionItemPresentation | undefined> {
  if (input.actionItem.systemMode !== "generated_milestone_submilestone") {
    return;
  }
  if (
    !input.actionItem.canonicalBuildMilestoneId ||
    !input.actionItem.canonicalBuildSubmilestoneId
  ) {
    return unknownSystemActionItemPresentation(
      "Generated System Action Item is missing its canonical Milestone binding."
    );
  }
  if (!input.build.timezone) {
    return unknownSystemActionItemPresentation(
      "Build timezone is unavailable; schedule state requires an explicit IANA timezone."
    );
  }
  let localDate: string;
  try {
    localDate = buildLocalDateAt(input.asOf, input.build.timezone);
  } catch {
    return unknownSystemActionItemPresentation(
      "Build timezone is invalid; schedule state requires an explicit IANA timezone."
    );
  }
  const [milestone, submilestone] = await Promise.all([
    ctx.db.get(input.actionItem.canonicalBuildMilestoneId),
    ctx.db.get(input.actionItem.canonicalBuildSubmilestoneId),
  ]);
  if (
    !(milestone && submilestone) ||
    milestone.buildId !== input.build._id ||
    milestone.organizationId !== input.build.organizationId ||
    milestone.brokerageId !== input.build.brokerageId ||
    submilestone.buildId !== input.build._id ||
    submilestone.organizationId !== input.build.organizationId ||
    submilestone.brokerageId !== input.build.brokerageId ||
    submilestone.buildMilestoneId !== milestone._id
  ) {
    return unknownSystemActionItemPresentation(
      "Canonical Milestone or Sub-milestone binding is unavailable."
    );
  }
  const plannedStartDate = addBuildLocalDays(
    input.build.startDate,
    submilestone.startDay ?? milestone.dayStart
  );
  const plannedCompletionDate = addBuildLocalDays(
    plannedStartDate,
    Math.max(0, (submilestone.durationDays ?? 1) - 1)
  );
  const base = {
    plannedCompletionDate,
    plannedStartDate,
    state: "known" as const,
    timezone: input.build.timezone,
  };
  if (
    submilestone.status === "complete" ||
    milestone.completionClaim !== undefined
  ) {
    return {
      ...base,
      column:
        milestone.completionReview?.status === "approved"
          ? "approved"
          : "in_review",
    };
  }
  if (submilestone.actualStartedAt !== undefined) {
    return {
      ...base,
      attention:
        localDate > plannedCompletionDate ? "overdue_completion" : undefined,
      column: "in_progress",
    };
  }
  return {
    ...base,
    column: localDate > plannedStartDate ? "behind_schedule" : "backlog",
  };
}

export async function ensureMilestoneSystemPost(
  ctx: MutationCtx,
  input: {
    actor: {
      roles: string[];
      workosUserId: string;
    };
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    activationReason: MilestoneSystemActivationReason;
    now?: number;
  }
) {
  const occurrenceKey = `milestone-system:${input.build._id}:${input.milestone._id}`;
  const now = input.now ?? Date.now();
  const plainText =
    input.activationReason === "scheduled"
      ? `${input.milestone.name} is scheduled to begin today. Canonical Sub-milestone cards are synchronized from the roadmap; this does not record that work has started.`
      : `${input.milestone.name} started. Canonical Sub-milestone cards are synchronized from the roadmap.`;
  const postId = await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.build._id,
    idempotencyKey: occurrenceKey,
    organizationId: input.build.organizationId,
    plainText,
    postType: "update",
    primaryReferenceId: String(input.milestone._id),
    primaryReferenceKind: "milestone",
    systemPostKind: "milestone",
    systemLabel: SYSTEM_LABEL,
    suppressNotifications: input.activationReason !== "explicit_start",
    now,
  });
  if (!postId) {
    return null;
  }

  // The generic publisher owns publication/audience/revision plumbing.  The
  // specialized pass adds immutable domain identity and recovers any children
  // that may be missing after a partial historical write.
  const scope = await resolveSystemEventScope(
    ctx,
    {
      buildId: input.build._id,
      idempotencyKey: `${occurrenceKey}:scope`,
      organizationId: input.build.organizationId,
      plainText: "Milestone System Post authorization scope.",
      postType: "update",
      systemLabel: SYSTEM_LABEL,
    },
    `${occurrenceKey}:scope`
  );
  if (scope.status !== "ready") {
    return null;
  }

  const post = await ctx.db.get(postId);
  if (!post || post.buildId !== input.build._id) {
    throw new Error("Milestone System Post became unavailable.");
  }
  const triggeredByRole = resolveEffectiveCollaborationRole(
    input.actor.roles
  )?.role;
  const submilestones = (
    await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (query) =>
        query.eq("buildMilestoneId", input.milestone._id)
      )
      .take(500)
  ).filter(
    (submilestone) =>
      submilestone.buildId === input.build._id &&
      submilestone.organizationId === input.build.organizationId
  );

  const postPatch = {
    activationReason: post.activationReason ?? input.activationReason,
    authorDisplayNameSnapshot: SYSTEM_LABEL,
    authorRolesSnapshot: ["system"],
    authorWorkosUserId: SYSTEM_AUTHOR,
    canonicalBuildMilestoneId: input.milestone._id,
    systemEventKey: occurrenceKey,
    systemOccurrenceKey: occurrenceKey,
    systemPostKind: "milestone" as const,
    triggeredAt: post.triggeredAt ?? now,
    triggeredByRole: post.triggeredByRole ?? triggeredByRole,
    triggeredByWorkosUserId:
      post.triggeredByWorkosUserId ?? input.actor.workosUserId,
  };
  const postChanged =
    post.activationReason !== postPatch.activationReason ||
    post.authorDisplayNameSnapshot !== postPatch.authorDisplayNameSnapshot ||
    post.authorWorkosUserId !== postPatch.authorWorkosUserId ||
    post.canonicalBuildMilestoneId !== postPatch.canonicalBuildMilestoneId ||
    post.systemEventKey !== postPatch.systemEventKey ||
    post.systemOccurrenceKey !== postPatch.systemOccurrenceKey ||
    post.systemPostKind !== postPatch.systemPostKind ||
    post.triggeredAt !== postPatch.triggeredAt ||
    post.triggeredByRole !== postPatch.triggeredByRole ||
    post.triggeredByWorkosUserId !== postPatch.triggeredByWorkosUserId;
  if (postChanged) {
    await ctx.db.patch(postId, { ...postPatch, updatedAt: now });
  }

  const generatedActionItemIds: Id<"buildActionItems">[] = [];
  let actionItemsChanged = false;
  for (const submilestone of submilestones) {
    const ensured = await ensureGeneratedSubmilestoneActionItem(ctx, {
      authorization: scope.authorization,
      milestone: input.milestone,
      now,
      postId,
      submilestone,
    });
    generatedActionItemIds.push(ensured.actionItemId);
    actionItemsChanged ||= ensured.changed;
  }
  if (actionItemsChanged) {
    await syncPostCounts(ctx, generatedActionItemIds, now);
  }

  if (postChanged || actionItemsChanged) {
    await queueBuildCollaborationSearchOwnerRebuild(ctx, {
      authorization: scope.authorization,
      owner: { id: postId, kind: "post" },
      postId,
    });
  }
  return {
    actionItemIds: generatedActionItemIds,
    postId,
    recoveryRequired: submilestones.length === 0,
  };
}

async function ensureGeneratedSubmilestoneActionItem(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    now: number;
    postId: Id<"buildCollaborationPosts">;
    submilestone: Doc<"buildSubmilestones">;
  }
): Promise<{ actionItemId: Id<"buildActionItems">; changed: boolean }> {
  const existing = (
    await ctx.db
      .query("buildActionItems")
      .withIndex("by_originatingPostId_and_createdAt", (query) =>
        query.eq("originatingPostId", input.postId)
      )
      .take(500)
  ).find(
    (item) =>
      item.systemMode === "generated_milestone_submilestone" &&
      item.canonicalBuildSubmilestoneId === input.submilestone._id
  );
  if (existing) {
    if (
      existing.canonicalBuildMilestoneId !== input.milestone._id ||
      existing.canonicalBindingRevision !==
        (input.milestone.collaborationEventRevision ?? 1)
    ) {
      await ctx.db.patch(existing._id, {
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBindingRevision:
          input.milestone.collaborationEventRevision ?? 1,
        title: input.submilestone.name,
        updatedAt: input.now,
      });
      return { actionItemId: existing._id, changed: true };
    }
    return { actionItemId: existing._id, changed: false };
  }

  const title = input.submilestone.name.trim() || "Unnamed Sub-milestone";
  const description = `Canonical Sub-milestone: ${title}. This card mirrors the roadmap state and cannot be completed independently.`;
  const actionItemId = await ctx.db.insert("buildActionItems", {
    assignmentState: "unassigned",
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    canonicalBindingRevision: input.milestone.collaborationEventRevision ?? 1,
    canonicalBuildMilestoneId: input.milestone._id,
    canonicalBuildSubmilestoneId: input.submilestone._id,
    createdAt: input.now,
    creatorRole: "admin",
    creatorWorkosUserId: SYSTEM_AUTHOR,
    currentRevision: 1,
    descriptionPlainText: description,
    descriptionTiptapJson: plainTextDocument(description),
    originatingPostId: input.postId,
    organizationId: input.authorization.organizationId,
    priority: "none",
    queueSortAt: buildActionItemQueueSortAt(undefined, "todo"),
    requiresAcceptance: false,
    status: "todo",
    systemMode: "generated_milestone_submilestone",
    title,
    updatedAt: input.now,
    workKind: "ordinary",
  });
  const item = await ctx.db.get(actionItemId);
  if (!item) {
    throw new Error("Generated Milestone Action Item became unavailable.");
  }
  await Promise.all([
    linkBuildActionItemToPost(ctx, {
      actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      linkKind: "originating",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
    }),
    recordBuildActionItemRevision(ctx, {
      authorization: input.authorization,
      item,
      now: input.now,
      reason: "canonical_milestone_start",
    }),
    ctx.db.insert("buildActionItemEvents", {
      actionItemId,
      actorRole: "admin",
      actorWorkosUserId: SYSTEM_AUTHOR,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created_by_canonical_milestone",
      exercisedAuthority: "canonical_milestone",
      newState: JSON.stringify({
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBuildSubmilestoneId: input.submilestone._id,
        status: "todo",
        systemMode: "generated_milestone_submilestone",
      }),
      organizationId: input.authorization.organizationId,
      revision: 1,
      warnings: ["canonical_state_is_authoritative"],
    }),
    ctx.db.insert("buildActionItemCreationRequests", {
      actionItemId,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      creatorWorkosUserId: SYSTEM_AUTHOR,
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      requestId: `milestone-system:${input.milestone._id}:${input.submilestone._id}`,
    }),
    ctx.db.insert("buildCollaborationReferences", {
      actionItemQueueSortAt: item.queueSortAt,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: String(input.submilestone._id),
      entityKind: "submilestone",
      labelSnapshot: input.submilestone.name,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: actionItemId,
      postId: input.postId,
      primary: true,
      summarySnapshot: description,
    }),
    ctx.db.insert("buildCollaborationReferences", {
      actionItemQueueSortAt: item.queueSortAt,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      entityId: String(input.milestone._id),
      entityKind: "milestone",
      labelSnapshot: input.milestone.name,
      organizationId: input.authorization.organizationId,
      ownerKind: "actionItem",
      ownerRecordId: actionItemId,
      postId: input.postId,
      primary: false,
      summarySnapshot: "Canonical Milestone binding",
    }),
    ctx.db.insert("buildCollaborationActivityProjections", {
      actionItemId,
      actorWorkosUserId: SYSTEM_AUTHOR,
      brokerageId: input.authorization.brokerage._id,
      buildId: input.authorization.build._id,
      createdAt: input.now,
      eventType: "created_by_canonical_milestone",
      organizationId: input.authorization.organizationId,
      postId: input.postId,
      projectionKey: `milestone-system:${input.milestone._id}:${input.submilestone._id}`,
      targetId: String(input.submilestone._id),
      targetKind: "submilestone",
    }),
    ctx.db.insert("auditEvents", {
      actorRoles: ["system"],
      actorWorkosUserId: SYSTEM_AUTHOR,
      brokerageId: input.authorization.brokerage._id,
      command: "ensureMilestoneSystemPost",
      createdAt: input.now,
      entityId: actionItemId,
      entityType: "buildActionItem",
      eventType: "build.collaboration.action_item.canonical_milestone_created",
      newState: JSON.stringify({
        actionItemId,
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBuildSubmilestoneId: input.submilestone._id,
        postId: input.postId,
      }),
      organizationId: input.authorization.organizationId,
      warnings: ["canonical_state_is_authoritative"],
    }),
    ctx.db.insert("eventOutbox", {
      brokerageId: input.authorization.brokerage._id,
      createdAt: input.now,
      eventType: "build.collaboration.action_item.canonical_milestone_created",
      organizationId: input.authorization.organizationId,
      payloadPreview: JSON.stringify({
        actionItemId,
        canonicalBuildMilestoneId: input.milestone._id,
        canonicalBuildSubmilestoneId: input.submilestone._id,
      }),
      relatedEntityId: actionItemId,
      relatedEntityType: "buildActionItem",
      status: "pending",
    }),
  ]);
  return { actionItemId, changed: true };
}

async function syncPostCounts(
  ctx: MutationCtx,
  actionItemIds: Id<"buildActionItems">[],
  now: number
) {
  for (const actionItemId of actionItemIds) {
    await syncLinkedActionItemPostCounts(ctx, {
      actionItemId,
      actorWorkosUserId: SYSTEM_AUTHOR,
      now,
    });
  }
}

function plainTextDocument(value: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text: value, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

export function milestoneSystemTriggerRole(
  roles: readonly string[]
): BuildCollaborationRole | undefined {
  return resolveEffectiveCollaborationRole(roles)?.role;
}
