import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./types";

type ManifestReadCtx = Pick<QueryCtx, "db">;

export async function requireSealedLenderAssignmentManifest(
  ctx: ManifestReadCtx,
  assignment: Doc<"proposalLenderAssignments">
) {
  const manifest = await ctx.db
    .query("proposalLenderAssignmentManifests")
    .withIndex("by_assignment", (query) =>
      query.eq("assignmentId", assignment._id)
    )
    .unique();
  const lenderOrganizationId = ctx.db.normalizeId(
    "lenderOrganizations",
    String(assignment.lenderOrganizationId)
  );
  if (
    assignment.status !== "withdrawn" ||
    !lenderOrganizationId ||
    !manifest ||
    manifest.status !== "sealed" ||
    manifest.phase !== "complete" ||
    assignment.archiveManifestId !== manifest._id ||
    manifest.assignmentId !== assignment._id ||
    manifest.brokerageId !== assignment.brokerageId ||
    manifest.organizationId !== assignment.organizationId ||
    manifest.proposalId !== assignment.proposalId ||
    manifest.lenderOrganizationId !== lenderOrganizationId
  ) {
    throw new Error("Withdrawn lender assignment manifest is unavailable.");
  }
  return manifest;
}

export async function loadFrozenLenderAssignmentSnapshot(
  ctx: ManifestReadCtx,
  assignment: Doc<"proposalLenderAssignments">
) {
  const manifest = await requireSealedLenderAssignmentManifest(ctx, assignment);
  return {
    assignmentId: assignment._id,
    capturedAt: manifest.capturedAt,
    lifecycle: manifest.lifecycleSnapshot,
    proposal: manifest.proposalSnapshot,
  };
}
