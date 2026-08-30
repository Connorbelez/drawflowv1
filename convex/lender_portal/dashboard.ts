import type { Doc } from "../_generated/dataModel";
import {
  lenderOrganizationQuery,
  requireLenderOrganizationPermission,
} from "../authz";
import {
  type LenderPortalQueryCtx,
  latestLenderAssignments,
  listAccessibleLenderBuilds,
} from "../lender_portal_access";
import {
  currentLenderApproverMaps,
  reviewerQueueRow,
} from "../lender_portal_phase5";
import {
  productionDaysActive,
  productionMilestoneIsBehindSchedule,
} from "../production_proposals/roster_projection_helpers.js";
import { getCurrentLenderConfirmationStatus } from "./proposals.js";
import {
  assertLenderBuildScopedRows,
  LENDER_DASHBOARD_MAX_ACTIONS,
  LENDER_DASHBOARD_MAX_ASSIGNMENT_ROWS,
  LENDER_DASHBOARD_MAX_BUILDS,
  isCurrentBuildDrawRequest,
  isCurrentBuildMilestone,
  lenderDashboardData,
  lenderDrawQueueReviewCycle,
  lenderMilestoneQueueReviewCycle,
} from "./shared.js";

interface LenderDashboardAction {
  actionId: string;
  amountCents?: number;
  assignmentId?: Doc<"proposalLenderAssignments">["_id"];
  buildId?: Doc<"activeBuilds">["_id"];
  fact: string;
  meta: string;
  proposalId?: Doc<"buildProposals">["_id"];
  title: string;
  type: "Proposal" | "Milestone" | "Draw";
  updatedAt: number;
}

type LenderDashboardQueryCtx = Parameters<typeof reviewerQueueRow>[0] &
  LenderPortalQueryCtx;

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
    const [
      latestAssignments,
      eligibleLenderWorkosUserIds,
      canReviewProposals,
      canReviewSiteVisits,
    ] = await Promise.all([
      latestLenderAssignments(
        {
          db: ctx.db,
          scope: {
            brokerageId: ctx.activeOrganization.brokerageId,
            lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
          },
        },
        {
          maxScannedRows: LENDER_DASHBOARD_MAX_ASSIGNMENT_ROWS,
          overflowMessage: "Lender dashboard assignment limit exceeded",
        }
      ),
      currentLenderApproverMaps(ctx),
      canUseLenderPermission(ctx, "proposalReview"),
      canUseLenderPermission(ctx, "siteVisitReview"),
    ]);
    const assignments = latestAssignments.filter(
      (assignment) => assignment.status === "current"
    );
    const accessibleBuilds = await listAccessibleLenderBuilds(ctx, {
      assignments,
    });
    const accessibleBuildByProposalId = new Map(
      accessibleBuilds.map((row) => [String(row.proposal._id), row] as const)
    );

    const actions: LenderDashboardAction[] = [];
    const builds = new Map<Doc<"activeBuilds">["_id"], Doc<"activeBuilds">>();
    let assignedProposalCount = 0;
    let latestUpdatedAt = 0;

    for (const assignment of assignments) {
      const proposal = await ctx.db.get(assignment.proposalId);
      if (
        !proposal ||
        proposal.brokerageId !== assignment.brokerageId ||
        proposal.organizationId !== assignment.organizationId
      ) {
        continue;
      }
      assignedProposalCount += 1;
      latestUpdatedAt = Math.max(latestUpdatedAt, proposal.updatedAt);

      const accessibleBuild = accessibleBuildByProposalId.get(
        String(proposal._id)
      );
      if (accessibleBuild) {
        builds.set(accessibleBuild.build._id, accessibleBuild.build);
        latestUpdatedAt = Math.max(
          latestUpdatedAt,
          accessibleBuild.build.updatedAt
        );
      }

      if (!canReviewProposals) {
        continue;
      }
      const lenderConfirmation = await getCurrentLenderConfirmationStatus(
        ctx,
        proposal,
        assignment
      );
      if (lenderConfirmation === "pending") {
        actions.push({
          actionId: `proposal:${String(proposal._id)}`,
          assignmentId: assignment._id,
          fact: "Lender confirmation required",
          meta: `Current assignment · ${formatWorkflowStatus(proposal.status)}`,
          proposalId: proposal._id,
          title: proposal.buildName,
          type: "Proposal",
          updatedAt: proposal.updatedAt,
          ...(accessibleBuild ? { buildId: accessibleBuild.build._id } : {}),
        });
        assertLenderDashboardActionCapacity(actions);
      }
    }

    if (builds.size > LENDER_DASHBOARD_MAX_BUILDS) {
      throw new Error("Lender dashboard Build limit exceeded");
    }

    const buildProjections = await Promise.all(
      [...builds.values()].map(async (build) => {
        const [
          facilities,
          capitalEvents,
          milestones,
          submilestones,
          siteVisits,
          drawRequests,
        ] = await Promise.all([
          ctx.db
            .query("loanFacilities")
            .withIndex("by_build", (query) => query.eq("buildId", build._id))
            .take(51),
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
            .query("buildSubmilestones")
            .withIndex("by_build", (query) => query.eq("buildId", build._id))
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
          facilities.length > 50 ||
          capitalEvents.length > 500 ||
          milestones.length > 500 ||
          submilestones.length > 500 ||
          siteVisits.length > 500 ||
          drawRequests.length > 500
        ) {
          throw new Error("Lender dashboard record limit exceeded");
        }

        assertLenderBuildScopedRows(build, [
          ...facilities,
          ...capitalEvents,
          ...milestones,
          ...submilestones,
          ...siteVisits,
          ...drawRequests,
        ]);

        const visibleMilestones = milestones.filter(isCurrentBuildMilestone);
        const visibleDrawRequests = drawRequests.filter(
          isCurrentBuildDrawRequest
        );
        const visibleMilestoneIds = new Set(
          visibleMilestones.map((milestone) => milestone._id)
        );
        const visibleSiteVisits = siteVisits.filter((siteVisit) =>
          visibleMilestoneIds.has(siteVisit.buildMilestoneId)
        );

        const facility = [...facilities]
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .find((candidate) => candidate.status === "active");
        const facilityCents = facility?.principalCents ?? 0;
        const releasedCents = capitalEvents
          .filter((event) => event.eventType === "draw_release")
          .reduce((total, event) => total + event.amountCents, 0);
        const progressPercent = averageProgress(visibleMilestones);
        const currentDay = productionDaysActive(build.startDate);
        const milestonesBehindSchedule = visibleMilestones.filter(
          (milestone) =>
            productionMilestoneIsBehindSchedule(
              milestone,
              currentDay,
              submilestones.filter(
                (submilestone) =>
                  submilestone.milestoneKey === milestone.key,
              ),
            ),
        ).length;
        await appendLenderDashboardMilestoneActions(ctx, {
          actions,
          build,
          canReviewSiteVisits,
          eligibleLenderIds: eligibleLenderWorkosUserIds.milestone,
          milestones: visibleMilestones,
          siteVisits: visibleSiteVisits,
        });
        await appendLenderDashboardDrawActions(ctx, {
          actions,
          build,
          drawRequests: visibleDrawRequests,
          eligibleLenderIds: eligibleLenderWorkosUserIds.draw,
        });
        assertLenderDashboardActionCapacity(actions);

        const buildActions = actions.filter(
          (action) => action.buildId === build._id
        );
        const nextAction = [...buildActions].sort(
          (left, right) => right.updatedAt - left.updatedAt
        )[0];
        latestUpdatedAt = Math.max(
          latestUpdatedAt,
          build.updatedAt,
          ...visibleMilestones.map((milestone) => milestone.updatedAt),
          ...visibleDrawRequests.map((drawRequest) => drawRequest.updatedAt),
          ...visibleSiteVisits.map((siteVisit) => siteVisit.updatedAt)
        );

        return {
          build: {
            buildId: build._id,
            buildName: build.buildName,
            facilityCents,
            location: build.location,
            milestonesBehindSchedule,
            nextState:
              nextAction?.fact ??
              (milestonesBehindSchedule > 0
                ? `${milestonesBehindSchedule} ${milestonesBehindSchedule === 1 ? "Milestone" : "Milestones"} behind schedule`
                : "No action required"),
            progressPercent,
            releasedCents,
            status: nextAction
              ? ("needs_action" as const)
              : build.status === "future_start"
                ? ("future_start" as const)
                : ("on_track" as const),
            updatedAt: build.updatedAt,
          },
          drawCount: visibleDrawRequests.length,
          milestoneCount: visibleMilestones.length,
        };
      })
    );

    const buildRows = buildProjections.map((projection) => projection.build);
    actions.sort((left, right) => right.updatedAt - left.updatedAt);
    const totalFacilityCents = buildRows.reduce(
      (total, build) => total + build.facilityCents,
      0
    );
    const releasedCents = buildRows.reduce(
      (total, build) => total + build.releasedCents,
      0
    );

    return {
      actions,
      builds: buildRows.sort((left, right) => right.updatedAt - left.updatedAt),
      stats: {
        activeBuildCount: buildRows.filter(
          (build) => build.status !== "future_start"
        ).length,
        assignedProposalCount,
        drawCount: buildProjections.reduce(
          (total, projection) => total + projection.drawCount,
          0
        ),
        milestoneCount: buildProjections.reduce(
          (total, projection) => total + projection.milestoneCount,
          0
        ),
        releasedCents,
        totalFacilityCents,
      },
      updatedAt: latestUpdatedAt,
    };
  })
  .public();

async function appendLenderDashboardMilestoneActions(
  ctx: LenderDashboardQueryCtx,
  input: {
    actions: LenderDashboardAction[];
    build: Doc<"activeBuilds">;
    canReviewSiteVisits: boolean;
    eligibleLenderIds: Awaited<
      ReturnType<typeof currentLenderApproverMaps>
    >["milestone"];
    milestones: Doc<"buildMilestones">[];
    siteVisits: Doc<"buildSiteVisits">[];
  }
) {
  const completedSiteVisits = new Map<string, number>();
  for (const siteVisit of input.siteVisits) {
    if (siteVisit.status === "complete") {
      completedSiteVisits.set(
        String(siteVisit.buildMilestoneId),
        Math.max(
          completedSiteVisits.get(String(siteVisit.buildMilestoneId)) ?? 0,
          siteVisit.updatedAt
        )
      );
    }
  }

  for (const milestone of input.milestones) {
    const cycle = await lenderMilestoneQueueReviewCycle(
      ctx,
      input.build,
      milestone
    );
    const reviewState = cycle
      ? await reviewerQueueRow(ctx, {
          build: input.build,
          cycle,
          eligibleLenderIds: input.eligibleLenderIds,
          group: "lender",
          viewerWorkosUserId: ctx.activeOrganization.workosUserId,
        })
      : null;
    if (reviewState?.actionRequired) {
      input.actions.push({
        actionId: `milestone:${String(milestone._id)}`,
        buildId: input.build._id,
        fact: "Lender decision required",
        meta: "Milestone ready for approval",
        title: `${input.build.buildName} · ${milestone.name}`,
        type: "Milestone",
        updatedAt: milestone.updatedAt,
      });
      continue;
    }
    const siteVisitUpdatedAt = completedSiteVisits.get(String(milestone._id));
    if (
      input.canReviewSiteVisits &&
      siteVisitUpdatedAt &&
      milestone.reviewDecisionState !== "approved"
    ) {
      input.actions.push({
        actionId: `site-visit:${String(milestone._id)}`,
        buildId: input.build._id,
        fact: "Site visit report ready",
        meta: "Completed site visit",
        title: `${input.build.buildName} · ${milestone.name}`,
        type: "Milestone",
        updatedAt: siteVisitUpdatedAt,
      });
    }
  }
}

async function appendLenderDashboardDrawActions(
  ctx: LenderDashboardQueryCtx,
  input: {
    actions: LenderDashboardAction[];
    build: Doc<"activeBuilds">;
    drawRequests: Doc<"activeBuildDrawRequests">[];
    eligibleLenderIds: Awaited<
      ReturnType<typeof currentLenderApproverMaps>
    >["draw"];
  }
) {
  for (const drawRequest of input.drawRequests) {
    const cycle = await lenderDrawQueueReviewCycle(
      ctx,
      input.build,
      drawRequest
    );
    const reviewState = cycle
      ? await reviewerQueueRow(ctx, {
          build: input.build,
          cycle,
          eligibleLenderIds: input.eligibleLenderIds,
          group: "lender",
          viewerWorkosUserId: ctx.activeOrganization.workosUserId,
        })
      : null;
    if (reviewState?.actionRequired) {
      input.actions.push({
        actionId: `draw:${String(drawRequest._id)}`,
        amountCents: drawRequest.amountCents,
        buildId: input.build._id,
        fact: "Lender approval required",
        meta: "Draw request in review",
        title: `${input.build.buildName} · ${drawRequest.label}`,
        type: "Draw",
        updatedAt: drawRequest.updatedAt,
      });
    }
  }
}

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

function assertLenderDashboardActionCapacity(actions: LenderDashboardAction[]) {
  if (actions.length > LENDER_DASHBOARD_MAX_ACTIONS) {
    throw new Error("Lender dashboard action limit exceeded");
  }
}

function averageProgress(milestones: Doc<"buildMilestones">[]) {
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
