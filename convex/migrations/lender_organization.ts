import { internal } from "../_generated/api.js";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../types.js";
import { migrations } from "./context";

type LegacyLenderSource =
  | "proposalLenderAssignments"
  | "proposalLenderApprovals";

/**
 * Resolve one legacy WorkOS-derived lender identifier into the application
 * organization under its existing lender Brokerage. This migration is
 * additive and intentionally leaves unresolved rows as reconciliation
 * candidates instead of guessing across tenants.
 */
export async function materializeLegacyLenderOrganization(
  ctx: MutationCtx,
  input: {
    brokerageId?: Id<"brokerages">;
    legacyWorkosOrganizationId: string;
    organizationId: string;
    snapshotName?: string;
    sourceTable: LegacyLenderSource;
    sourceRecordId: string;
  }
): Promise<Id<"lenderOrganizations"> | null> {
  let currentOrganization = null;
  try {
    currentOrganization = await ctx.db.get(
      input.legacyWorkosOrganizationId as Id<"lenderOrganizations">
    );
  } catch {
    // WorkOS organization IDs are not Convex IDs. Treat an invalid Convex ID
    // shape as a legacy value and continue with the grouped cutover.
  }
  if (currentOrganization) {
    if (
      input.brokerageId &&
      currentOrganization.brokerageId === input.brokerageId &&
      currentOrganization.status === "active"
    ) {
      return currentOrganization._id;
    }
    await recordLenderReconciliationCandidate(
      ctx,
      input,
      input.brokerageId,
      currentOrganization.status !== "active"
        ? "The legacy lender identifier resolves to an inactive application-owned Lender Organization."
        : "The legacy lender identifier resolves outside its recorded lender Brokerage."
    );
    return null;
  }

  const brokerage = input.brokerageId
    ? await ctx.db.get(input.brokerageId)
    : null;
  if (!brokerage) {
    await recordLenderReconciliationCandidate(
      ctx,
      input,
      undefined,
      "The legacy lender assignment has no resolvable parent Brokerage."
    );
    return null;
  }

  const existing = await ctx.db
    .query("lenderOrganizations")
    .withIndex("by_brokerage_and_legacy_workos_organization", (query) =>
      query
        .eq("brokerageId", brokerage._id)
        .eq("legacyWorkosOrganizationId", input.legacyWorkosOrganizationId)
    )
    .take(2);
  if (existing.length === 1 && existing[0]?.status === "active") {
    return existing[0]._id;
  }
  await recordLenderReconciliationCandidate(
    ctx,
    input,
    brokerage._id,
    existing.length > 1
      ? "Multiple application-owned Lender Organizations match the legacy identifier."
      : existing[0]
        ? "The matching application-owned Lender Organization is inactive."
        : "No application-owned Lender Organization verifies the legacy identifier; WorkOS projection data is not migration authority."
  );
  return null;
}

async function recordLenderReconciliationCandidate(
  ctx: MutationCtx,
  input: {
    brokerageId?: Id<"brokerages">;
    legacyWorkosOrganizationId: string;
    organizationId: string;
    snapshotName?: string;
    sourceTable: LegacyLenderSource;
    sourceRecordId: string;
  },
  brokerageId: Id<"brokerages"> | undefined,
  reason: string
) {
  const existing = await ctx.db
    .query("lenderOrganizationReconciliationCandidates")
    .withIndex("by_scope_source", (query) =>
      query
        .eq("brokerageId", brokerageId ?? input.brokerageId)
        .eq("organizationId", input.organizationId)
        .eq("sourceTable", input.sourceTable)
        .eq("sourceRecordId", input.sourceRecordId)
    )
    .take(2);
  if (existing.length > 1) {
    throw new Error(
      "Lender reconciliation candidate scope contains contradictory duplicates."
    );
  }
  if (existing[0]?.status === "open") {
    return;
  }
  const now = Date.now();
  await ctx.db.insert("lenderOrganizationReconciliationCandidates", {
    brokerageId: brokerageId ?? input.brokerageId,
    legacyWorkosOrganizationId: input.legacyWorkosOrganizationId,
    organizationId: input.organizationId,
    sourceTable: input.sourceTable,
    sourceRecordId: input.sourceRecordId,
    snapshotName: input.snapshotName,
    status: "open",
    reason,
    createdAt: now,
    updatedAt: now,
  });
}

export const backfillLegacyProposalLenderAssignmentOrganizations =
  migrations.define({
    table: "proposalLenderAssignments",
    migrateOne: async (ctx, assignment) => {
      let currentOrganization = null;
      try {
        currentOrganization = await ctx.db.get(
          assignment.lenderOrganizationId as Id<"lenderOrganizations">
        );
      } catch {
        // Legacy WorkOS IDs are not Convex IDs.
      }
      if (currentOrganization) {
        return;
      }

      const lenderOrganizationId = await materializeLegacyLenderOrganization(
        ctx,
        {
          brokerageId: assignment.lenderBrokerageId,
          legacyWorkosOrganizationId: String(assignment.lenderOrganizationId),
          organizationId: assignment.organizationId,
          snapshotName: assignment.lenderOrganizationName,
          sourceTable: "proposalLenderAssignments",
          sourceRecordId: String(assignment._id),
        }
      );
      if (!lenderOrganizationId) {
        return;
      }
      return {
        lenderOrganizationId,
        legacyLenderOrganizationId: String(assignment.lenderOrganizationId),
      };
    },
  });

export const backfillLegacyProposalLenderApprovalOrganizations =
  migrations.define({
    table: "proposalLenderApprovals",
    migrateOne: async (ctx, approval) => {
      let currentOrganization = null;
      try {
        currentOrganization = await ctx.db.get(
          approval.lenderOrganizationId as Id<"lenderOrganizations">
        );
      } catch {
        // Legacy WorkOS IDs are not Convex IDs.
      }
      if (currentOrganization) {
        return;
      }

      const assignment = await ctx.db.get(approval.assignmentId);
      const lenderOrganizationId = assignment
        ? await materializeLegacyLenderOrganization(ctx, {
            brokerageId: assignment.lenderBrokerageId,
            legacyWorkosOrganizationId: String(approval.lenderOrganizationId),
            organizationId: approval.organizationId,
            snapshotName: assignment.lenderOrganizationName,
            sourceTable: "proposalLenderApprovals",
            sourceRecordId: String(approval._id),
          })
        : null;
      if (!lenderOrganizationId) {
        await recordLenderReconciliationCandidate(
          ctx,
          {
            brokerageId: approval.brokerageId,
            legacyWorkosOrganizationId: String(approval.lenderOrganizationId),
            organizationId: approval.organizationId,
            sourceTable: "proposalLenderApprovals",
            sourceRecordId: String(approval._id),
          },
          undefined,
          "The lender approval references an assignment that is unavailable."
        );
        return;
      }
      return {
        lenderOrganizationId,
        legacyLenderOrganizationId: String(approval.lenderOrganizationId),
      };
    },
  });

export const runLegacyLenderOrganizationCutover = migrations.runner([
  internal.migrations.backfillLegacyProposalLenderAssignmentOrganizations,
  internal.migrations.backfillLegacyProposalLenderApprovalOrganizations,
]);
