import { stableContentHash } from "./build_collaboration_hash";
import type { Id, MutationCtx, QueryCtx } from "./types";

/**
 * Returns an organization-scoped watermark for implicit Build readers that are
 * resolved outside buildParticipants. These source rows are immutable or
 * update their indexed timestamp on every production mutation, so comparing
 * the watermark in the activation transaction detects reader drift after a
 * cutover verification without scanning every Build.
 */
export async function buildCollaborationImplicitReaderSourceFingerprint(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
  }
) {
  const [builderAccountLink, brokerAssignment, contractorAssignment] =
    await Promise.all([
      ctx.db
        .query("builderAccountLinks")
        .withIndex("by_brokerageId_and_updatedAt", (query) =>
          query.eq("brokerageId", input.brokerageId)
        )
        .order("desc")
        .first(),
      ctx.db
        .query("buildBrokerAssignments")
        .withIndex("by_organizationId_and_createdAt", (query) =>
          query.eq("organizationId", input.organizationId)
        )
        .order("desc")
        .first(),
      ctx.db
        .query("buildContractorAssignments")
        .withIndex("by_organizationId_and_updatedAt", (query) =>
          query.eq("organizationId", input.organizationId)
        )
        .order("desc")
        .first(),
    ]);
  return stableContentHash(
    JSON.stringify({
      brokerAssignment: brokerAssignment
        ? {
            id: brokerAssignment._id,
            reader: brokerAssignment.assignedBrokerWorkosUserId,
            role: brokerAssignment.role,
            timestamp: brokerAssignment.createdAt,
          }
        : null,
      builderAccountLink: builderAccountLink
        ? {
            id: builderAccountLink._id,
            reader: builderAccountLink.workosUserId,
            role: builderAccountLink.role,
            status: builderAccountLink.status,
            timestamp: builderAccountLink.updatedAt,
          }
        : null,
      contractorAssignment: contractorAssignment
        ? {
            contractorId: contractorAssignment.contractorId,
            id: contractorAssignment._id,
            status: contractorAssignment.status ?? "active",
            timestamp: contractorAssignment.updatedAt,
          }
        : null,
    })
  );
}
