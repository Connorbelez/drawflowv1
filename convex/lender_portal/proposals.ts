import {
  type PaginationOptions,
  paginationOptsValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  type ActiveLenderOrganizationContext,
  adminQuery,
  lenderOrganizationQuery,
} from "../authz";
import { loadFrozenLenderAssignmentSnapshot } from "../lender_assignment_manifest";
import { type LenderAssignment, latestLenderAssignments } from "../lender_portal_access";
import {
  encodeLenderQueueCursor,
  parseValidatedLenderQueueCursor,
} from "../lender_portal_pagination";
import {
  LENDER_PROPOSAL_DECISION_ROLES,
  PROPOSAL_CONFIRMATION_CHECKPOINTS,
} from "../lender_portal_phase4";
import { resolveLenderOrganizationTarget } from "../lenderOrganizationAccess";
import type { QueryCtx } from "../types";
import {
  LENDER_PORTAL_RESULT_LIMIT,
  LENDER_PROPOSAL_PORTFOLIO_MAX_PAGE_SIZE,
  backofficeLenderOrganizationPortfolio,
  lenderBuildListRow,
  lenderProposalListRow,
  lenderProposalPortfolioPage,
  lenderProposalPortfolioViewValidator,
  type LenderProposalPortfolioView,
} from "./shared.js";

async function projectLenderAssignedProposals(
  ctx: Pick<QueryCtx, "db">,
  assignments: readonly LenderAssignment[]
) {
  const rows = await Promise.all(
    assignments.map((assignment) =>
      projectLenderAssignedProposalRecord(ctx, assignment)
    )
  );

  return rows
    .filter((record): record is NonNullable<typeof record> => record !== null)
    .map((record) => record.row)
    .sort(compareLenderProposalRows)
    .slice(0, LENDER_PORTAL_RESULT_LIMIT);
}

async function projectLenderAssignedProposalRecord(
  ctx: Pick<QueryCtx, "db">,
  assignment: LenderAssignment
) {
  if (assignment.status === "archiving") {
    return null;
  }
  if (assignment.status === "withdrawn") {
    const snapshot = await loadFrozenLenderAssignmentSnapshot(ctx, assignment);
    return {
      proposal: null,
      row: {
        assignedAt: assignment.assignedAt,
        assignmentId: assignment._id,
        assignmentStatus: assignment.status,
        buildName: snapshot.proposal.buildName,
        lenderConfirmation:
          snapshot.lifecycle.lenderConfirmation === "approved"
            ? ("approved" as const)
            : ("pending" as const),
        location: snapshot.proposal.location,
        proposalId: assignment.proposalId,
        proposalStatus: snapshot.proposal.status,
        readOnly: true,
        ...(assignment.withdrawnAt === undefined
          ? {}
          : { withdrawnAt: assignment.withdrawnAt }),
      },
    };
  }
  const proposal = await ctx.db.get(assignment.proposalId);
  if (!proposal) {
    return null;
  }

  const lenderConfirmation = await getCurrentLenderConfirmationStatus(
    ctx,
    proposal,
    assignment
  );

  return {
    proposal,
    row: {
      assignedAt: assignment.assignedAt,
      assignmentId: assignment._id,
      assignmentStatus: assignment.status,
      buildName: proposal.buildName,
      lenderConfirmation,
      location: proposal.location,
      proposalId: proposal._id,
      proposalStatus: proposal.status,
      readOnly: false,
      ...(assignment.withdrawnAt === undefined
        ? {}
        : { withdrawnAt: assignment.withdrawnAt }),
    },
  };
}

function compareLenderProposalRows(
  left: {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  },
  right: {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  }
) {
  return (
    right.assignedAt - left.assignedAt ||
    String(right.assignmentId).localeCompare(String(left.assignmentId))
  );
}

export async function getCurrentLenderConfirmationStatus(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment
): Promise<"approved" | "pending"> {
  if (!proposal.currentProposalRevisionId) {
    return "pending";
  }
  const revision = await ctx.db.get(proposal.currentProposalRevisionId);
  if (
    !revision ||
    revision.proposalId !== proposal._id ||
    revision.assignmentId !== assignment._id
  ) {
    return "pending";
  }
  const cycle = await ctx.db
    .query("proposalLenderConfirmationCycles")
    .withIndex("by_assignment_and_revision", (query) =>
      query
        .eq("assignmentId", assignment._id)
        .eq("proposalRevisionId", revision._id)
    )
    .unique();
  if (!cycle) {
    return "pending";
  }
  const decisions = await ctx.db
    .query("proposalLenderApprovals")
    .withIndex("by_confirmation_cycle", (query) =>
      query.eq("confirmationCycleId", cycle._id)
    )
    .take(2);
  return decisions.some((decision) => decision.status === "approved")
    ? "approved"
    : "pending";
}

async function projectLenderProposalPortfolioRows(
  ctx: Pick<QueryCtx, "db">,
  assignments: readonly LenderAssignment[],
  activeOrganization: ActiveLenderOrganizationContext
) {
  const assignmentsById = new Map(
    assignments.map((assignment) => [String(assignment._id), assignment])
  );
  const records = await Promise.all(
    assignments.map((assignment) =>
      projectLenderAssignedProposalRecord(ctx, assignment)
    )
  );
  const rows = await Promise.all(
    records
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .map(async (record) => {
        if (record.row.assignmentStatus === "withdrawn") {
          return { ...record.row, view: "withdrawn" as const };
        }
        if (!record.proposal) {
          throw new Error(
            "Lender Proposal portfolio projection is unavailable."
          );
        }
        const assignment = assignmentsById.get(String(record.row.assignmentId));
        if (!assignment || assignment.status !== "current") {
          throw new Error(
            "Lender Proposal portfolio assignment is unavailable."
          );
        }
        return {
          ...record.row,
          view: await getLenderProposalPortfolioView(
            ctx,
            record.proposal,
            assignment,
            activeOrganization
          ),
        };
      })
  );
  return rows.sort(compareLenderProposalRows);
}

async function getLenderProposalPortfolioView(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  activeOrganization: ActiveLenderOrganizationContext
): Promise<LenderProposalPortfolioView> {
  validateLenderProposalPortfolioScope(
    proposal,
    assignment,
    activeOrganization
  );
  if (!proposal.currentProposalRevisionId) {
    return "in_progress";
  }
  const revision = await requireLenderProposalPortfolioRevision(
    ctx,
    proposal,
    assignment
  );
  const cycle = await ctx.db
    .query("proposalLenderConfirmationCycles")
    .withIndex("by_assignment_and_revision", (query) =>
      query
        .eq("assignmentId", assignment._id)
        .eq("proposalRevisionId", revision._id)
    )
    .unique();
  if (!cycle) {
    return "in_progress";
  }
  validateLenderProposalPortfolioCycle(cycle, proposal, assignment, revision);

  if (cycle.status === "approved" || cycle.status === "declined") {
    return requireLenderProposalTerminalPortfolioView(
      ctx,
      proposal,
      assignment,
      revision,
      cycle,
      activeOrganization
    );
  }
  if (cycle.decisionId) {
    throw new Error("Lender Proposal pending cycle is unavailable.");
  }
  if (proposal.status === "closed") {
    throw new Error("Lender Proposal closed lifecycle is unavailable.");
  }

  const acknowledgedCheckpoints =
    await getLenderProposalActorAcknowledgedCheckpoints(
      ctx,
      proposal,
      assignment,
      revision,
      cycle,
      activeOrganization
    );

  if (
    PROPOSAL_CONFIRMATION_CHECKPOINTS.some(
      (checkpoint) => !acknowledgedCheckpoints.has(checkpoint)
    )
  ) {
    return "needs_action";
  }
  return canActorDecideLenderProposal(activeOrganization)
    ? "needs_action"
    : "in_progress";
}

function validateLenderProposalPortfolioScope(
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  activeOrganization: ActiveLenderOrganizationContext
) {
  if (
    assignment.status !== "current" ||
    assignment.proposalId !== proposal._id ||
    assignment.organizationId !== proposal.organizationId ||
    assignment.brokerageId !== proposal.brokerageId ||
    assignment.lenderBrokerageId !== activeOrganization.brokerageId ||
    assignment.lenderOrganizationId !==
      activeOrganization.lenderOrganizationId ||
    proposal.brokerageId !== activeOrganization.brokerageId
  ) {
    throw new Error("Lender Proposal portfolio scope is unavailable.");
  }
}

async function requireLenderProposalPortfolioRevision(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment
) {
  const revisionId = proposal.currentProposalRevisionId;
  if (!revisionId) {
    throw new Error("Lender Proposal portfolio revision is unavailable.");
  }
  const revision = await ctx.db.get(revisionId);
  if (
    !revision ||
    revision.proposalId !== proposal._id ||
    revision.assignmentId !== assignment._id ||
    revision.organizationId !== proposal.organizationId ||
    revision.brokerageId !== proposal.brokerageId ||
    revision.revisionNumber !== proposal.currentProposalRevisionNumber
  ) {
    throw new Error("Lender Proposal portfolio revision is unavailable.");
  }
  return revision;
}

function validateLenderProposalPortfolioCycle(
  cycle: Doc<"proposalLenderConfirmationCycles">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  revision: Doc<"proposalRevisions">
) {
  if (
    cycle.assignmentId !== assignment._id ||
    cycle.proposalId !== proposal._id ||
    cycle.proposalRevisionId !== revision._id ||
    cycle.proposalRevisionNumber !== revision.revisionNumber ||
    cycle.organizationId !== proposal.organizationId ||
    cycle.brokerageId !== proposal.brokerageId ||
    cycle.status === "superseded"
  ) {
    throw new Error("Lender Proposal portfolio cycle is unavailable.");
  }
}

async function requireLenderProposalTerminalPortfolioView(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  revision: Doc<"proposalRevisions">,
  cycle: Doc<"proposalLenderConfirmationCycles">,
  activeOrganization: ActiveLenderOrganizationContext
): Promise<LenderProposalPortfolioView> {
  if (!cycle.decisionId) {
    throw new Error("Lender Proposal portfolio decision is unavailable.");
  }
  const decision = await ctx.db.get(cycle.decisionId);
  if (
    !decision ||
    decision.confirmationCycleId !== cycle._id ||
    decision.assignmentId !== assignment._id ||
    decision.proposalId !== proposal._id ||
    decision.proposalRevisionId !== revision._id ||
    decision.proposalRevisionNumber !== revision.revisionNumber ||
    decision.organizationId !== proposal.organizationId ||
    decision.brokerageId !== proposal.brokerageId ||
    String(decision.lenderOrganizationId) !==
      String(activeOrganization.lenderOrganizationId) ||
    decision.status !== cycle.status
  ) {
    throw new Error("Lender Proposal portfolio decision is unavailable.");
  }
  if (proposal.status === "closed") {
    if (cycle.status !== "approved") {
      throw new Error("Lender Proposal closed lifecycle is unavailable.");
    }
    return "closed";
  }
  return cycle.status === "approved" ? "approved" : "update_pending";
}

async function getLenderProposalActorAcknowledgedCheckpoints(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"buildProposals">,
  assignment: LenderAssignment,
  revision: Doc<"proposalRevisions">,
  cycle: Doc<"proposalLenderConfirmationCycles">,
  activeOrganization: ActiveLenderOrganizationContext
) {
  const acknowledgements = await ctx.db
    .query("proposalLenderConfirmationAcknowledgements")
    .withIndex("by_cycle_and_actor", (query) =>
      query
        .eq("confirmationCycleId", cycle._id)
        .eq("acknowledgedByWorkosUserId", activeOrganization.workosUserId)
    )
    .collect();
  const acknowledgedCheckpoints = new Set<string>();
  for (const acknowledgement of acknowledgements) {
    if (
      acknowledgement.assignmentId !== assignment._id ||
      acknowledgement.proposalId !== proposal._id ||
      acknowledgement.proposalRevisionId !== revision._id ||
      acknowledgement.confirmationCycleId !== cycle._id ||
      acknowledgement.organizationId !== proposal.organizationId ||
      acknowledgement.brokerageId !== proposal.brokerageId ||
      acknowledgement.acknowledgedByWorkosUserId !==
        activeOrganization.workosUserId ||
      !PROPOSAL_CONFIRMATION_CHECKPOINTS.includes(acknowledgement.checkpoint) ||
      acknowledgedCheckpoints.has(acknowledgement.checkpoint)
    ) {
      throw new Error(
        "Lender Proposal portfolio acknowledgement is unavailable."
      );
    }
    acknowledgedCheckpoints.add(acknowledgement.checkpoint);
  }
  return acknowledgedCheckpoints;
}

function canActorDecideLenderProposal(
  activeOrganization: ActiveLenderOrganizationContext
) {
  return (
    activeOrganization.roles.includes("admin") ||
    (activeOrganization.permissions.proposalReview &&
      activeOrganization.roles.some((role) =>
        LENDER_PROPOSAL_DECISION_ROLES.includes(
          role as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number]
        )
      ))
  );
}

function paginateLenderProposalPortfolioRows<
  T extends {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  },
>(input: {
  authorizedRows: T[];
  paginationOpts: PaginationOptions;
  rows: T[];
  scope: LenderProposalPortfolioView;
}) {
  const cursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.cursor,
    getAnchorId: (row) => String(row.assignmentId),
    getAnchorValue: (row) => row.assignedAt,
    label: "Proposal",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const endCursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.endCursor ?? null,
    getAnchorId: (row) => String(row.assignmentId),
    getAnchorValue: (row) => row.assignedAt,
    label: "Proposal",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const afterStart = cursor
    ? input.rows.filter((row) =>
        lenderProposalPortfolioRowIsAfterCursor(row, cursor)
      )
    : input.rows;
  const candidates = endCursor
    ? afterStart.filter(
        (row) => !lenderProposalPortfolioRowIsAfterCursor(row, endCursor)
      )
    : afterStart;
  const page = endCursor
    ? candidates
    : candidates.slice(0, input.paginationOpts.numItems);
  if (endCursor) {
    return {
      continueCursor: input.paginationOpts.endCursor ?? "",
      isDone: true,
      page,
    };
  }
  const isDone = candidates.length <= input.paginationOpts.numItems;
  const last = page.at(-1);
  return {
    continueCursor:
      isDone || !last
        ? ""
        : encodeLenderQueueCursor({
            position: {
              anchorId: String(last.assignmentId),
              anchorValue: last.assignedAt,
            },
            scope: input.scope,
          }),
    isDone,
    page,
  };
}

function lenderProposalPortfolioRowIsAfterCursor(
  row: {
    assignedAt: number;
    assignmentId: Doc<"proposalLenderAssignments">["_id"];
  },
  cursor: { anchorId: string; anchorValue: number }
) {
  return (
    row.assignedAt < cursor.anchorValue ||
    (row.assignedAt === cursor.anchorValue &&
      String(row.assignmentId).localeCompare(cursor.anchorId) < 0)
  );
}

function validateLenderProposalPortfolioPageSize(numItems: number) {
  if (
    !Number.isSafeInteger(numItems) ||
    numItems < 1 ||
    numItems > LENDER_PROPOSAL_PORTFOLIO_MAX_PAGE_SIZE
  ) {
    throw new ConvexError({
      code: "INVALID_PAGINATION_PAGE_SIZE",
      message: `Proposal portfolio page size must be between 1 and ${LENDER_PROPOSAL_PORTFOLIO_MAX_PAGE_SIZE}.`,
      recoverable: true,
    });
  }
}

export async function projectLenderActiveBuilds(
  ctx: Pick<QueryCtx, "db">,
  assignments: readonly LenderAssignment[]
) {
  const rows = await Promise.all(
    assignments
      .filter((assignment) => assignment.status === "current")
      .map(async (assignment) => {
        const proposal = await ctx.db.get(assignment.proposalId);
        if (!proposal?.activeBuildId) {
          return null;
        }

        const build = await ctx.db.get(proposal.activeBuildId);
        if (!build || build.proposalId !== proposal._id) {
          return null;
        }

        return {
          buildId: build._id,
          buildName: build.buildName,
          location: build.location,
          proposalId: proposal._id,
          status: build.status,
          updatedAt: build.updatedAt,
        };
      })
  );

  return rows
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, LENDER_PORTAL_RESULT_LIMIT);
}

export const listLenderAssignedProposals = lenderOrganizationQuery
  .input({})
  .returns(v.array(lenderProposalListRow))
  .handler(async (ctx) => {
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    });
    return projectLenderAssignedProposals(ctx, assignments);
  })
  .public();

export const listLenderAssignedProposalPage = lenderOrganizationQuery
  .input({
    paginationOpts: paginationOptsValidator,
    view: lenderProposalPortfolioViewValidator,
  })
  .returns(lenderProposalPortfolioPage)
  .handler(async (ctx, args) => {
    validateLenderProposalPortfolioPageSize(args.paginationOpts.numItems);
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    });
    const authorizedRows = await projectLenderProposalPortfolioRows(
      ctx,
      assignments.filter((assignment) =>
        args.view === "withdrawn"
          ? assignment.status === "withdrawn"
          : assignment.status === "current"
      ),
      ctx.activeOrganization
    );
    const rows = authorizedRows.filter((row) => row.view === args.view);
    return paginateLenderProposalPortfolioRows({
      authorizedRows,
      paginationOpts: args.paginationOpts,
      rows,
      scope: args.view,
    });
  })
  .public();


export const getBackofficeLenderOrganizationPortfolio = adminQuery
  .input({ lenderOrganizationId: v.id("lenderOrganizations") })
  .returns(backofficeLenderOrganizationPortfolio)
  .handler(async (ctx, args) => {
    const { brokerage, organization } = await resolveLenderOrganizationTarget(
      ctx,
      args.lenderOrganizationId
    );
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: brokerage._id,
        lenderOrganizationId: organization._id,
      },
    });

    const [proposals, builds] = await Promise.all([
      projectLenderAssignedProposals(ctx, assignments),
      projectLenderActiveBuilds(ctx, assignments),
    ]);

    return {
      organization: {
        id: organization._id,
        displayName: organization.displayName,
        legalName: organization.legalName,
        status: organization.status,
        brokerageId: brokerage._id,
        brokerageName: brokerage.displayName,
        permissions: organization.permissions,
      },
      proposals,
      builds,
    };
  })
  .public();
