import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import {
  adminQuery,
  type ActiveLenderOrganizationContext,
  requireLenderOrganizationPermission,
  lenderOrganizationQuery,
} from "./authz";
import { resolveLenderOrganizationTarget } from "./lenderOrganizationAccess";
import type { QueryCtx } from "./types";

const LENDER_PORTAL_ASSIGNMENT_SCAN_LIMIT = 200;
const LENDER_PORTAL_RESULT_LIMIT = 50;

const lenderProposalListRow = v.object({
  assignedAt: v.number(),
  assignmentStatus: v.union(v.literal("current"), v.literal("withdrawn")),
  buildName: v.string(),
  lenderConfirmation: v.union(v.literal("approved"), v.literal("pending")),
  location: v.string(),
  proposalId: v.id("buildProposals"),
  proposalStatus: v.union(
    v.literal("draft"),
    v.literal("submitted"),
    v.literal("approved"),
    v.literal("closed")
  ),
  readOnly: v.boolean(),
  withdrawnAt: v.optional(v.number()),
});

const lenderBuildListRow = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  location: v.string(),
  proposalId: v.id("buildProposals"),
  status: v.union(v.literal("active"), v.literal("future_start")),
  updatedAt: v.number(),
});

const lenderDashboardActionItem = v.object({
  actionId: v.string(),
  amountCents: v.optional(v.number()),
  buildId: v.optional(v.id("activeBuilds")),
  fact: v.string(),
  meta: v.string(),
  title: v.string(),
  type: v.union(
    v.literal("Proposal"),
    v.literal("Milestone"),
    v.literal("Draw")
  ),
  updatedAt: v.number(),
});

const lenderDashboardBuildRow = v.object({
  buildId: v.id("activeBuilds"),
  buildName: v.string(),
  facilityCents: v.number(),
  location: v.string(),
  nextState: v.string(),
  progressPercent: v.number(),
  releasedCents: v.number(),
  status: v.union(
    v.literal("active"),
    v.literal("future_start"),
    v.literal("needs_action"),
    v.literal("on_track")
  ),
  updatedAt: v.number(),
});

const lenderDashboardData = v.object({
  actions: v.array(lenderDashboardActionItem),
  builds: v.array(lenderDashboardBuildRow),
  stats: v.object({
    activeBuildCount: v.number(),
    assignedProposalCount: v.number(),
    releasedCents: v.number(),
    totalFacilityCents: v.number(),
  }),
  updatedAt: v.number(),
});

const backofficeLenderOrganizationPortfolio = v.object({
  organization: v.object({
    id: v.id("lenderOrganizations"),
    displayName: v.string(),
    legalName: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive")),
    brokerageId: v.id("brokerages"),
    brokerageName: v.string(),
    permissions: v.object({
      proposalReview: v.boolean(),
      milestoneDecisions: v.boolean(),
      drawDecisions: v.boolean(),
      siteVisitReview: v.boolean(),
    }),
  }),
  proposals: v.array(lenderProposalListRow),
  builds: v.array(lenderBuildListRow),
});

type LenderAssignment = Doc<"proposalLenderAssignments">;
type LenderAssignmentScope = {
  lenderOrganizationId: Doc<"lenderOrganizations">["_id"];
  brokerageId: Doc<"brokerages">["_id"];
};
type LenderPortalQueryCtx = Pick<QueryCtx, "db"> & {
  activeOrganization: ActiveLenderOrganizationContext;
};

/**
 * Return the latest assignment record for each proposal visible to the active
 * lender organization. Assignment history is intentionally bounded and the
 * organization middleware remains the first authorization boundary.
 */
async function latestLenderAssignments(ctx: {
  scope: LenderAssignmentScope;
  db: LenderPortalQueryCtx["db"];
}) {
  const assignments = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_lender_organization", (query) =>
      query.eq(
        "lenderOrganizationId",
        ctx.scope.lenderOrganizationId
      )
    )
    .order("desc")
    .take(LENDER_PORTAL_ASSIGNMENT_SCAN_LIMIT);

  const latest = new Map<string, LenderAssignment>();
  for (const assignment of assignments) {
    if (
      assignment.lenderBrokerageId === ctx.scope.brokerageId &&
      !latest.has(assignment.proposalId)
    ) {
      latest.set(assignment.proposalId, assignment);
    }
  }
  return [...latest.values()];
}

async function projectLenderAssignedProposals(
  ctx: Pick<QueryCtx, "db">,
  assignments: readonly LenderAssignment[]
) {
  const rows = await Promise.all(
    assignments.map(async (assignment) => {
      const proposal = await ctx.db.get(assignment.proposalId);
      if (!proposal) {
        return null;
      }

      let lenderConfirmation: "approved" | "pending" = "pending";
      if (assignment.status === "current") {
        const approval = await ctx.db
          .query("proposalLenderApprovals")
          .withIndex("by_proposal_assignment_status", (query) =>
            query
              .eq("proposalId", assignment.proposalId)
              .eq("assignmentId", assignment._id)
              .eq("status", "approved")
          )
          .take(1);
        lenderConfirmation = approval.length > 0 ? "approved" : "pending";
      }

      return {
        assignedAt: assignment.assignedAt,
        assignmentStatus: assignment.status,
        buildName: proposal.buildName,
        lenderConfirmation,
        location: proposal.location,
        proposalId: proposal._id,
        proposalStatus: proposal.status,
        readOnly: assignment.status === "withdrawn",
        ...(assignment.withdrawnAt === undefined
          ? {}
          : { withdrawnAt: assignment.withdrawnAt }),
      };
    })
  );

  return rows
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => right.assignedAt - left.assignedAt)
    .slice(0, LENDER_PORTAL_RESULT_LIMIT);
}

async function projectLenderActiveBuilds(
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

export const listLenderActiveBuilds = lenderOrganizationQuery
  .input({})
  .returns(v.array(lenderBuildListRow))
  .handler(async (ctx) => {
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    });
    return projectLenderActiveBuilds(ctx, assignments);
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

/**
 * Return the live Variant D dashboard projection for the current application
 * lender organization. Every row is derived from the assigned proposal,
 * active Build, facility, capital-event, milestone, site-visit, and draw
 * records; this query intentionally has no representative fallback data.
 */
export const getLenderDashboard = lenderOrganizationQuery
  .input({})
  .returns(lenderDashboardData)
  .handler(async (ctx) => {
    const assignments = (
      await latestLenderAssignments({
        db: ctx.db,
        scope: {
          brokerageId: ctx.activeOrganization.brokerageId,
          lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
        },
      })
    ).filter(
      (assignment) => assignment.status === "current"
    );
    const canReviewProposals = await canUseLenderPermission(
      ctx,
      "proposalReview"
    );
    const canDecideMilestones = await canUseLenderPermission(
      ctx,
      "milestoneDecisions"
    );
    const canReviewSiteVisits = await canUseLenderPermission(
      ctx,
      "siteVisitReview"
    );
    const canDecideDraws = await canUseLenderPermission(ctx, "drawDecisions");

    const actions: Array<{
      actionId: string;
      amountCents?: number;
      buildId?: Doc<"activeBuilds">["_id"];
      fact: string;
      meta: string;
      title: string;
      type: "Proposal" | "Milestone" | "Draw";
      updatedAt: number;
    }> = [];
    const builds = new Map<
      Doc<"activeBuilds">["_id"],
      Doc<"activeBuilds">
    >();
    let assignedProposalCount = 0;
    let latestUpdatedAt = 0;

    for (const assignment of assignments) {
      const proposal = await ctx.db.get(assignment.proposalId);
      if (!proposal) {
        continue;
      }
      assignedProposalCount += 1;
      latestUpdatedAt = Math.max(latestUpdatedAt, proposal.updatedAt);

      if (proposal.activeBuildId) {
        const build = await ctx.db.get(proposal.activeBuildId);
        if (build && build.proposalId === proposal._id) {
          builds.set(build._id, build);
          latestUpdatedAt = Math.max(latestUpdatedAt, build.updatedAt);
        }
      }

      if (!canReviewProposals) {
        continue;
      }
      const approval = await ctx.db
        .query("proposalLenderApprovals")
        .withIndex("by_proposal_assignment_status", (query) =>
          query
            .eq("proposalId", proposal._id)
            .eq("assignmentId", assignment._id)
            .eq("status", "approved")
        )
        .take(1);
      if (approval.length === 0) {
        actions.push({
          actionId: `proposal:${String(proposal._id)}`,
          fact: "Lender confirmation required",
          meta: `Current assignment · ${formatWorkflowStatus(proposal.status)}`,
          title: proposal.buildName,
          type: "Proposal",
          updatedAt: proposal.updatedAt,
          ...(proposal.activeBuildId ? { buildId: proposal.activeBuildId } : {}),
        });
      }
    }

    const buildRows = await Promise.all(
      [...builds.values()].map(async (build) => {
        const [facilities, capitalEvents, milestones, siteVisits, drawRequests] =
          await Promise.all([
            ctx.db
              .query("loanFacilities")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
              .take(50),
            ctx.db
              .query("capitalEvents")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
              .take(501),
            ctx.db
              .query("buildMilestones")
              .withIndex("by_build_order", (query) =>
                query.eq("buildId", build._id)
              )
              .take(501),
            ctx.db
              .query("buildSiteVisits")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
              .take(501),
            ctx.db
              .query("activeBuildDrawRequests")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
              .take(501),
          ]);
        if (
          capitalEvents.length > 500 ||
          milestones.length > 500 ||
          siteVisits.length > 500 ||
          drawRequests.length > 500
        ) {
          throw new Error("Lender dashboard record limit exceeded");
        }

        const facility = [...facilities]
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .find((candidate) => candidate.status === "active");
        const facilityCents = facility?.principalCents ?? 0;
        const releasedCents = capitalEvents
          .filter((event) => event.eventType === "draw_release")
          .reduce((total, event) => total + event.amountCents, 0);
        const progressPercent = averageProgress(milestones);
        const completedSiteVisits = new Map<string, number>();
        for (const siteVisit of siteVisits) {
          if (siteVisit.status !== "complete") {
            continue;
          }
          const timestamp = siteVisit.updatedAt;
          completedSiteVisits.set(
            siteVisit.milestoneKey,
            Math.max(completedSiteVisits.get(siteVisit.milestoneKey) ?? 0, timestamp)
          );
        }

        for (const milestone of milestones) {
          if (
            canDecideMilestones &&
            milestone.reviewDecisionState === "ready_for_approval"
          ) {
            actions.push({
              actionId: `milestone:${String(milestone._id)}`,
              buildId: build._id,
              fact: "Lender decision required",
              meta: "Milestone ready for approval",
              title: `${build.buildName} · ${milestone.name}`,
              type: "Milestone",
              updatedAt: milestone.updatedAt,
            });
            continue;
          }
          const siteVisitUpdatedAt = completedSiteVisits.get(milestone.key);
          if (
            canReviewSiteVisits &&
            siteVisitUpdatedAt &&
            milestone.reviewDecisionState !== "approved"
          ) {
            actions.push({
              actionId: `site-visit:${String(milestone._id)}`,
              buildId: build._id,
              fact: "Site visit report ready",
              meta: "Completed site visit",
              title: `${build.buildName} · ${milestone.name}`,
              type: "Milestone",
              updatedAt: siteVisitUpdatedAt,
            });
          }
        }

        for (const drawRequest of drawRequests) {
          if (!canDecideDraws || drawRequest.status !== "in_review") {
            continue;
          }
          actions.push({
            actionId: `draw:${String(drawRequest._id)}`,
            amountCents: drawRequest.amountCents,
            buildId: build._id,
            fact: "Lender approval required",
            meta: "Draw request in review",
            title: `${build.buildName} · ${drawRequest.label}`,
            type: "Draw",
            updatedAt: drawRequest.updatedAt,
          });
        }

        const buildActions = actions.filter(
          (action) => action.buildId === build._id
        );
        const nextAction = [...buildActions].sort(
          (left, right) => right.updatedAt - left.updatedAt
        )[0];
        latestUpdatedAt = Math.max(
          latestUpdatedAt,
          build.updatedAt,
          ...milestones.map((milestone) => milestone.updatedAt),
          ...drawRequests.map((drawRequest) => drawRequest.updatedAt),
          ...siteVisits.map((siteVisit) => siteVisit.updatedAt)
        );

        return {
          buildId: build._id,
          buildName: build.buildName,
          facilityCents,
          location: build.location,
          nextState: nextAction?.fact ?? "No action required",
          progressPercent,
          releasedCents,
          status:
            nextAction
              ? ("needs_action" as const)
              : build.status === "future_start"
                ? ("future_start" as const)
                : ("on_track" as const),
          updatedAt: build.updatedAt,
        };
      })
    );

    actions.sort((left, right) => right.updatedAt - left.updatedAt);
    const limitedActions = actions.slice(0, LENDER_PORTAL_RESULT_LIMIT);
    const totalFacilityCents = buildRows.reduce(
      (total, build) => total + build.facilityCents,
      0
    );
    const releasedCents = buildRows.reduce(
      (total, build) => total + build.releasedCents,
      0
    );

    return {
      actions: limitedActions,
      builds: buildRows.sort((left, right) => right.updatedAt - left.updatedAt),
      stats: {
        activeBuildCount: buildRows.filter(
          (build) => build.status !== "future_start"
        ).length,
        assignedProposalCount,
        releasedCents,
        totalFacilityCents,
      },
      updatedAt: latestUpdatedAt,
    };
  })
  .public();

async function canUseLenderPermission(
  ctx: LenderPortalQueryCtx,
  permission:
    | "proposalReview"
    | "milestoneDecisions"
    | "drawDecisions"
    | "siteVisitReview"
) {
  try {
    await requireLenderOrganizationPermission(
      ctx,
      ctx.activeOrganization,
      permission
    );
    return true;
  } catch {
    return false;
  }
}

function averageProgress(milestones: Array<Doc<"buildMilestones">>) {
  if (milestones.length === 0) {
    return 0;
  }
  const total = milestones.reduce(
    (sum, milestone) => sum + (milestone.progressPercent ?? 0),
    0
  );
  return Math.round(total / milestones.length);
}

function formatWorkflowStatus(status: Doc<"buildProposals">["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
