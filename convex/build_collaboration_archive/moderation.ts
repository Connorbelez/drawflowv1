import { canSeeCollaborationReceipt } from "../build_collaboration_access";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import { ARCHIVE_ROW_LIMIT } from "./contracts";
import { limited } from "./common";
import type { Doc, QueryCtx } from "../types";

export function isVisibleArchivePin(
  authorization: ActiveBuildAuthorization,
  pin: Doc<"buildCollaborationPins">
) {
  return (
    pin.kind !== "personal" || pin.workosUserId === authorization.viewer.subject
  );
}

export async function moderationHistory(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  entityKind: "comment" | "post",
  entityId: string
) {
  const cases = await limited(
    ctx.db
      .query("buildCollaborationModerationCases")
      .withIndex("by_entityKind_and_entityId", (query) =>
        query.eq("entityKind", entityKind).eq("entityId", entityId)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    "moderation cases"
  );
  const history: Record<string, unknown>[] = [];
  for (const moderationCase of cases) {
    history.push(
      await archiveModerationCase(ctx, authorization, moderationCase)
    );
  }
  return history;
}

export async function archiveModerationCase(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization,
  moderationCase: Doc<"buildCollaborationModerationCases">
) {
  return {
    case: {
      ...moderationCase,
      evidenceSnapshotJson: sanitizeModerationEvidenceSnapshot(
        authorization,
        moderationCase.evidenceSnapshotJson
      ),
    },
    events: await limited(
      ctx.db
        .query("buildCollaborationModerationEvents")
        .withIndex("by_caseId_and_createdAt", (query) =>
          query.eq("caseId", moderationCase._id)
        )
        .take(ARCHIVE_ROW_LIMIT + 1),
      "moderation events"
    ),
  };
}

export function sanitizeModerationEvidenceSnapshot(
  authorization: ActiveBuildAuthorization,
  value: string
) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const receiptSnapshots = Array.isArray(parsed.receiptSnapshots)
      ? parsed.receiptSnapshots.filter(
          (
            receipt
          ): receipt is {
            viewerRole: Doc<"buildCollaborationReceipts">["viewerRole"];
            workosUserId: string;
          } =>
            Boolean(
              receipt &&
                typeof receipt === "object" &&
                typeof (receipt as Record<string, unknown>).workosUserId ===
                  "string" &&
                typeof (receipt as Record<string, unknown>).viewerRole ===
                  "string" &&
                canSeeCollaborationReceipt(
                  authorization,
                  receipt as {
                    viewerRole: Doc<"buildCollaborationReceipts">["viewerRole"];
                    workosUserId: string;
                  }
                )
            )
        )
      : [];
    return JSON.stringify({ ...parsed, receiptSnapshots });
  } catch {
    return JSON.stringify({
      attachmentIds: [],
      receiptSnapshots: [],
      referenceIds: [],
    });
  }
}


