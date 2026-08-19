import type { Doc } from "./_generated/dataModel";
import type { ActiveLenderOrganizationContext } from "./authz";
import type { QueryCtx } from "./types";

export type LenderAssignment = Doc<"proposalLenderAssignments">;

interface LenderAssignmentScope {
  brokerageId: Doc<"brokerages">["_id"];
  lenderOrganizationId: Doc<"lenderOrganizations">["_id"];
}

export type LenderPortalQueryCtx = Pick<QueryCtx, "db"> & {
  activeOrganization: ActiveLenderOrganizationContext;
};

export interface AccessibleLenderBuild {
  assignment: LenderAssignment;
  build: Doc<"activeBuilds">;
  proposal: Doc<"buildProposals">;
}

interface LenderAssignmentEnumerationOptions {
  maxScannedRows?: number;
  overflowMessage?: string;
}

/**
 * Traverse the tenant-scoped assignment index and retain the latest assignment
 * for every Proposal visible to the active lender organization. Consumers that
 * cannot safely exhaust an unbounded index may supply a fail-closed scan limit.
 */
export async function latestLenderAssignments(
  ctx: {
    db: LenderPortalQueryCtx["db"];
    scope: LenderAssignmentScope;
  },
  options: LenderAssignmentEnumerationOptions = {}
) {
  const assignments = ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_lender_organization", (query) =>
      query.eq("lenderOrganizationId", ctx.scope.lenderOrganizationId)
    )
    .order("desc");

  const latest = new Map<string, LenderAssignment>();
  let scannedRows = 0;
  for await (const assignment of assignments) {
    scannedRows += 1;
    if (
      options.maxScannedRows !== undefined &&
      scannedRows > options.maxScannedRows
    ) {
      throw new Error(
        options.overflowMessage ?? "Lender assignment record limit exceeded"
      );
    }
    if (
      assignment.lenderBrokerageId === ctx.scope.brokerageId &&
      !latest.has(assignment.proposalId)
    ) {
      latest.set(assignment.proposalId, assignment);
    }
  }
  return [...latest.values()];
}

export async function listAccessibleLenderBuilds(
  ctx: LenderPortalQueryCtx,
  options: { assignments?: LenderAssignment[] } = {}
) {
  const assignments = (
    options.assignments ??
    (await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    }))
  ).filter((assignment) => assignment.status === "current");

  const rows = await Promise.all(
    assignments.map(
      async (assignment): Promise<AccessibleLenderBuild | null> => {
        const proposal = await ctx.db.get(assignment.proposalId);
        if (
          !proposal?.activeBuildId ||
          proposal.brokerageId !== assignment.brokerageId ||
          proposal.organizationId !== assignment.organizationId
        ) {
          return null;
        }
        const build = await ctx.db.get(proposal.activeBuildId);
        if (
          !build ||
          build.proposalId !== proposal._id ||
          build.brokerageId !== assignment.brokerageId ||
          build.organizationId !== assignment.organizationId
        ) {
          return null;
        }
        return { assignment, build, proposal };
      }
    )
  );
  return rows.filter((row): row is AccessibleLenderBuild => row !== null);
}
