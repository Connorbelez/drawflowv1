import { ARCHIVE_ROW_LIMIT } from "./contracts";
import type { Doc, QueryCtx } from "../types";

export async function ownerAttachments(
  ctx: QueryCtx,
  ownerKind: Doc<"buildCollaborationAttachments">["ownerKind"],
  ownerRecordId: string
) {
  return await limited(
    ctx.db
      .query("buildCollaborationAttachments")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    `${ownerKind} attachments`
  );
}

export async function ownerReferences(
  ctx: QueryCtx,
  ownerKind: Doc<"buildCollaborationReferences">["ownerKind"],
  ownerRecordId: string
) {
  return await limited(
    ctx.db
      .query("buildCollaborationReferences")
      .withIndex("by_ownerKind_and_ownerRecordId", (query) =>
        query.eq("ownerKind", ownerKind).eq("ownerRecordId", ownerRecordId)
      )
      .take(ARCHIVE_ROW_LIMIT + 1),
    `${ownerKind} references`
  );
}

export async function limited<T>(promise: Promise<T[]>, label: string) {
  const rows = await promise;
  if (rows.length > ARCHIVE_ROW_LIMIT) {
    throw new Error(
      `Full archive exceeds the ${ARCHIVE_ROW_LIMIT} ${label} limit.`
    );
  }
  return rows;
}

