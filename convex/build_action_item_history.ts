import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import type { Doc, MutationCtx } from "./types";

export function buildActionItemRevisionSnapshot(item: Doc<"buildActionItems">) {
  return {
    assigneeWorkosUserId: item.assigneeWorkosUserId ?? null,
    assignmentState: item.assignmentState,
    blockedReason: item.blockedReason ?? null,
    cancellationReason: item.cancellationReason ?? null,
    completedAt: item.completedAt ?? null,
    completedByWorkosUserId: item.completedByWorkosUserId ?? null,
    completionAcceptedByWorkosUserId:
      item.completionAcceptedByWorkosUserId ?? null,
    completionRequestedAt: item.completionRequestedAt ?? null,
    completionRequestedByWorkosUserId:
      item.completionRequestedByWorkosUserId ?? null,
    creatorWorkosUserId: item.creatorWorkosUserId,
    descriptionPlainText: item.descriptionPlainText,
    descriptionTiptapJson: item.descriptionTiptapJson,
    dueAt: item.dueAt ?? null,
    priority: item.priority,
    requiresAcceptance: item.requiresAcceptance,
    revision: item.currentRevision,
    status: item.status,
    title: item.title,
    workKind: item.workKind ?? "ordinary",
  };
}

export async function recordBuildActionItemRevision(
  ctx: MutationCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    item: Doc<"buildActionItems">;
    now: number;
    reason?: string;
  }
) {
  return await ctx.db.insert("buildActionItemRevisions", {
    actionItemId: input.item._id,
    actorRole: input.authorization.effectiveRole.role,
    actorWorkosUserId: input.authorization.viewer.subject,
    brokerageId: input.authorization.brokerage._id,
    buildId: input.authorization.build._id,
    createdAt: input.now,
    organizationId: input.authorization.organizationId,
    reason: input.reason?.trim() || undefined,
    revision: input.item.currentRevision,
    snapshotJson: JSON.stringify(buildActionItemRevisionSnapshot(input.item)),
  });
}
