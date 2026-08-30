/**
 * Production proposals assignment manifest bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { normalizeRoleSlugs } from "../authz";
import { internalMutation } from "../fluent";
import { projectLenderSnapshotRevision, projectLenderSnapshotDecision, projectLenderSnapshotDocuments } from "./confirmation_history_helpers.js";
import { APPROVER_ROLES } from "./contracts_foundation.js";
import { LENDER_ASSIGNMENT_ARCHIVE_BATCH_SIZE } from "./contracts_workflow.js";
import { upsertKanbanCard } from "./proposal_copy_audit.js";
import { createImmutableProposalRevision } from "./review_lifecycle_helpers.js";

function archiveFailureReason(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown archive finalization error.";
  return message.slice(0, 1_000);
}

export const finalizeLenderAssignmentManifest = internalMutation
  .input({ manifestId: v.id("proposalLenderAssignmentManifests") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.status === "sealed") return null;
    if (manifest.status !== "building" || manifest.phase !== "decisions") {
      throw new Error("Lender assignment archive is not ready for finalization.");
    }
    const [assignment, proposal] = await Promise.all([
      ctx.db.get(manifest.assignmentId),
      ctx.db.get(manifest.proposalId),
    ]);
    if (
      !assignment ||
      !proposal ||
      assignment.status !== "archiving" ||
      assignment.archiveManifestId !== manifest._id
    ) {
      throw new Error("Lender assignment archive state is inconsistent.");
    }
    const policyVersion = manifest.reviewPolicyVersionId
      ? await ctx.db.get(manifest.reviewPolicyVersionId)
      : null;
    const brokerage = await ctx.db.get(proposal.brokerageId);
    const withdrawnByRole = assignment.withdrawnByRole
      ? normalizeRoleSlugs([assignment.withdrawnByRole]).find((role) =>
          APPROVER_ROLES.includes(role as (typeof APPROVER_ROLES)[number]),
        )
      : undefined;
    if (
      !policyVersion ||
      policyVersion.proposalId !== proposal._id ||
      !brokerage ||
      !withdrawnByRole ||
      !assignment.withdrawnByWorkosUserId
    ) {
      throw new Error(
        "Lender assignment archive finalization prerequisites are unavailable.",
      );
    }
    await createImmutableProposalRevision(ctx, {
      assignment: null,
      auth: {
        brokerage,
        proposal,
        roles: [withdrawnByRole],
        subject: assignment.withdrawnByWorkosUserId,
      },
      idempotencyKey: `system:lender-withdrawal:${assignment._id}`,
      policyVersion,
      reason: assignment.withdrawalReason ?? "Withdraw lender assignment.",
    });
    const now = Date.now();
    await ctx.db.patch(manifest._id, {
      cursor: null,
      failureReason: undefined,
      failedAt: undefined,
      lastAttemptAt: now,
      phase: "complete",
      sealedAt: now,
      status: "sealed",
    });
    await ctx.db.patch(assignment._id, { status: "withdrawn" });
    await upsertKanbanCard(ctx, proposal._id, now);
    return null;
  })
  .internal();

export const sealLenderAssignmentManifestBatch = internalMutation
  .input({ manifestId: v.id("proposalLenderAssignmentManifests") })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.status === "sealed" || manifest.status === "failed") {
      return null;
    }
    try {
      const assignment = await ctx.db.get(manifest.assignmentId);
      const proposal = await ctx.db.get(manifest.proposalId);
      if (!assignment || !proposal || assignment.status !== "archiving" || assignment.archiveManifestId !== manifest._id) {
        throw new Error("Lender assignment archive state is inconsistent.");
      }

      if (manifest.phase === "documents") {
        if (
          manifest.documentCutoffVersion === 1 &&
          manifest.documentCreationTimeCutoff === undefined
        ) {
          await ctx.db.patch(manifest._id, { cursor: null, phase: "revisions" });
        } else {
          const page = manifest.documentCutoffVersion === 1
            ? await ctx.db.query("proposalDocuments")
                .withIndex("by_proposal", (query) =>
                  query
                    .eq("proposalId", proposal._id)
                    .lte("_creationTime", manifest.documentCreationTimeCutoff!),
                )
                .paginate({ cursor: manifest.cursor ?? null, numItems: LENDER_ASSIGNMENT_ARCHIVE_BATCH_SIZE })
            : await ctx.db.query("proposalDocuments")
                .withIndex("by_proposal", (query) => query.eq("proposalId", proposal._id))
                .filter((query) => query.lte(query.field("createdAt"), manifest.capturedAt))
                .paginate({ cursor: manifest.cursor ?? null, numItems: LENDER_ASSIGNMENT_ARCHIVE_BATCH_SIZE });
          for (const document of page.page) {
            const existing = await ctx.db.query("proposalLenderAssignmentManifestDocuments")
              .withIndex("by_manifest_and_document", (query) => query.eq("manifestId", manifest._id).eq("documentId", document._id)).unique();
            if (!existing) {
              const projected = (await projectLenderSnapshotDocuments(ctx, [document]))[0];
              if (!projected) continue;
              const { storageUrl: _storageUrl, ...storedDocument } = projected;
              await ctx.db.insert("proposalLenderAssignmentManifestDocuments", { manifestId: manifest._id, ...storedDocument });
            }
          }
          await ctx.db.patch(manifest._id, page.isDone
            ? { cursor: null, phase: "revisions" }
            : { cursor: page.continueCursor });
        }
      } else if (manifest.phase === "revisions") {
        const page = await ctx.db.query("proposalRevisions")
          .withIndex("by_assignment_and_revision_number", (query) => query.eq("assignmentId", assignment._id))
          .order("asc")
          .paginate({ cursor: manifest.cursor ?? null, numItems: LENDER_ASSIGNMENT_ARCHIVE_BATCH_SIZE });
        for (const revision of page.page) {
          const existing = await ctx.db.query("proposalLenderAssignmentManifestRevisions")
            .withIndex("by_manifest_and_revision", (query) => query.eq("manifestId", manifest._id).eq("revisionId", revision._id)).unique();
          if (!existing) await ctx.db.insert("proposalLenderAssignmentManifestRevisions", { manifestId: manifest._id, ...projectLenderSnapshotRevision(revision) });
        }
        await ctx.db.patch(manifest._id, page.isDone
          ? { cursor: null, phase: "decisions" }
          : { cursor: page.continueCursor });
      } else if (manifest.phase === "decisions") {
        const page = await ctx.db.query("proposalLenderApprovals")
          .withIndex("by_assignment", (query) => query.eq("assignmentId", assignment._id))
          .order("asc")
          .paginate({ cursor: manifest.cursor ?? null, numItems: LENDER_ASSIGNMENT_ARCHIVE_BATCH_SIZE });
        for (const decision of page.page) {
          const existing = await ctx.db.query("proposalLenderAssignmentManifestDecisions")
            .withIndex("by_manifest_and_approval", (query) => query.eq("manifestId", manifest._id).eq("approvalId", decision._id)).unique();
          if (!existing) await ctx.db.insert("proposalLenderAssignmentManifestDecisions", { manifestId: manifest._id, ...projectLenderSnapshotDecision(decision) });
        }
        if (!page.isDone) {
          await ctx.db.patch(manifest._id, { cursor: page.continueCursor });
        } else {
          const finalized: null = await ctx.runMutation(
            internal.production_proposals.finalizeLenderAssignmentManifest,
            { manifestId: manifest._id },
          );
          return finalized;
        }
      }
      const updated = await ctx.db.get(manifest._id);
      if (updated?.status === "building") {
        await ctx.scheduler.runAfter(0, internal.production_proposals.sealLenderAssignmentManifestBatch, { manifestId: manifest._id });
      }
      return null;
    } catch (error) {
      const failedAt = Date.now();
      await ctx.db.patch(manifest._id, {
        attemptCount: (manifest.attemptCount ?? 0) + 1,
        failedAt,
        failureReason: archiveFailureReason(error),
        lastAttemptAt: failedAt,
        status: "failed",
      });
      return null;
    }
  })
  .internal();
