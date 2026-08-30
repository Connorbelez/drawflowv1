import { demoBuildAddress } from "../demo_build_address";
import {
  addDays,
  dateDiffDays,
  earliestDate,
  latestDate,
  type DecoratedMilestone,
  type DemoReadCtx,
  type ProjectedDrawGroup,
} from "./data";
import type { Doc } from "../types";
import { buildProjection } from "./projection";

export const BACKOFFICE_MILESTONE_COLUMNS = [
  {
    description: "Builder marked complete; triage",
    id: "backlog",
    name: "Backlog",
  },
  {
    description: "Visit ordered or requested",
    id: "needsSiteVisit",
    name: "Needs site visit",
  },
  {
    description: "Visit picked up and scheduled",
    id: "inProgress",
    name: "In progress",
  },
  {
    description: "Planned finish date has passed",
    id: "behindSchedule",
    name: "Behind schedule",
  },
  {
    description: "Pending staff approval",
    id: "inReview",
    name: "In review",
  },
] as const;

export const BACKOFFICE_PROPOSAL_COLUMNS = [
  { id: "draft", name: "Draft" },
  { id: "submitted", name: "Submitted" },
  { id: "approved", name: "Approved" },
  { id: "closed", name: "Closed" },
] as const;

export function centsToCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function buildDisplayId(build: Doc<"demo_builds">, prefix: string) {
  return `${prefix}-${build.key.replace(/[^a-z0-9]/gi, "-").toUpperCase()}`;
}

export function daysBetween(startDate: string, endDate: string) {
  return Math.max(0, dateDiffDays(startDate, endDate));
}

export function initials(persona: string | undefined) {
  if (!persona) {
    return;
  }
  const cleaned = persona.replace(/[_-]+/g, " ").trim();
  if (!cleaned) {
    return;
  }
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function activeBuildStatus(
  build: Doc<"demo_builds">,
  milestones: DecoratedMilestone[]
) {
  if (build.status === "behind_schedule") {
    return { label: "Behind schedule", status: "behind" as const };
  }
  if (
    milestones.some((milestone) =>
      milestone.status.toLowerCase().includes("behind")
    )
  ) {
    return { label: "Behind schedule", status: "behind" as const };
  }
  if (
    milestones.some(
      (milestone) =>
        (milestone.requestedAmountCents ?? milestone.approvedValueCents) >
        milestone.approvedValueCents
    )
  ) {
    return { label: "Over approved budget", status: "overBudget" as const };
  }
  return {
    label: build.status === "active" ? "On track" : build.status,
    status: "onTrack" as const,
  };
}

export function milestoneState(status: string) {
  if (
    status === "planned" ||
    status === "draft" ||
    status === "ready" ||
    status === "not_started"
  ) {
    return "backlog" as const;
  }
  if (status.includes("submitted") || status.includes("review")) {
    return "inReview" as const;
  }
  return "inProgress" as const;
}

export function milestoneColumn(
  build: Doc<"demo_builds">,
  milestone: DecoratedMilestone
) {
  if (
    milestone.status.includes("submitted") ||
    milestone.status.includes("review") ||
    milestone.status === "site_visit_complete"
  ) {
    return "inReview";
  }
  if (
    milestone.requiresSiteVisit &&
    !milestone.latestSiteVisit &&
    milestone.status !== "completion_approved"
  ) {
    return "needsSiteVisit";
  }
  if (
    milestone.latestSiteVisit &&
    milestone.latestSiteVisit.status !== "completed"
  ) {
    return "inProgress";
  }
  const targetDate = milestone.forecastEndDate ?? milestone.plannedEndDate;
  if (targetDate && targetDate < build.todayDate) {
    return "behindSchedule";
  }
  return milestoneState(milestone.displayStatus);
}

export function milestonePriority(milestone: DecoratedMilestone) {
  if (milestone.blockingReasons.length > 0 || milestone.issues.length > 0) {
    return "high" as const;
  }
  if (milestone.requiresSiteVisit || milestone.evidenceCount > 0) {
    return "medium" as const;
  }
  return "low" as const;
}

export function milestoneDueLabel(
  build: Doc<"demo_builds">,
  milestone: DecoratedMilestone
) {
  const targetDate =
    milestone.forecastEndDate ?? milestone.plannedEndDate ?? build.todayDate;
  const delta = daysBetween(build.todayDate, targetDate);
  if (targetDate < build.todayDate) {
    return "overdue";
  }
  if (delta <= 7) {
    return `${delta}d`;
  }
  return;
}

export function proposalColumn(status: string) {
  if (status === "approved") {
    return "approved";
  }
  if (status === "archived" || status === "closed") {
    return "closed";
  }
  if (status === "submitted" || status === "active") {
    return "submitted";
  }
  return "draft";
}

export function proposalStatusLabel(status: string) {
  if (status === "approved") {
    return "Approved";
  }
  if (status === "submitted") {
    return "Submitted";
  }
  if (status === "archived" || status === "closed") {
    return "Closed";
  }
  return "Draft";
}

export async function buildBackofficeDashboardProjection(ctx: DemoReadCtx) {
  const [activeWorkspace, proposalWorkspace] = await Promise.all([
    buildProjection(ctx, "active"),
    buildProjection(ctx, "proposal"),
  ]);

  const timelineCards = await ctx.db
    .query("demo_backofficeProposalCards")
    .withIndex("by_updated")
    .order("desc")
    .take(50);

  if (activeWorkspace.needsSeed || proposalWorkspace.needsSeed) {
    return {
      gapAnalysis: [
        {
          display: "All dashboard sections",
          gap: "DrawFlow demo tables have not been seeded.",
          resolution: "Frontend uses explicit Mock-prefixed fallback rows.",
          source: "demo_* seed state",
        },
      ],
      needsSeed: true,
    };
  }

  const activeBuild = activeWorkspace.build as Doc<"demo_builds">;
  const proposalBuild = proposalWorkspace.build as Doc<"demo_builds">;
  const activeMilestones = activeWorkspace.milestones as DecoratedMilestone[];
  const activeDrawGroups = activeWorkspace.drawGroups as ProjectedDrawGroup[];
  const proposalSummary = proposalWorkspace.summary as {
    approvedProjectValueCents: number;
  };

  const activeDisplayId = buildDisplayId(activeBuild, "B");
  const proposalDisplayId = buildDisplayId(proposalBuild, "P");
  const activePendingMilestones = activeMilestones.filter(
    (milestone) => milestone.status !== "completion_approved"
  );
  const activeMilestone =
    activePendingMilestones.find((milestone) =>
      milestone.status.includes("progress")
    ) ??
    activePendingMilestones[0] ??
    activeMilestones[0];
  const buildStatus = activeBuildStatus(activeBuild, activeMilestones);
  const pendingDrawGroups = activeDrawGroups.filter(
    (group) => group.requestedValueCents > 0 && !group.releaseApprovedAt
  );
  const locationUnverifiedPackages = activeMilestones.filter((milestone) =>
    milestone.evidenceFiles.some((file) => !file.isSample)
  ).length;
  const pendingReviewMilestones = activeMilestones.filter((milestone) =>
    ["submitted_for_review", "site_visit_complete"].includes(milestone.status)
  );
  const siteVisitsThisWeek = activeMilestones.filter(
    (milestone) => milestone.latestSiteVisit
  ).length;
  const proposalCards = [
    {
      address: demoBuildAddress(proposalBuild),
      builder: "Mock builder - demo_builds has no builder company",
      column: proposalColumn(proposalBuild.status),
      href: "/demo/drawflow/proposal",
      id: proposalDisplayId,
      isMockAddress: true,
      isMockBuilder: true,
      isMockLtv: true,
      loanAmount: centsToCurrency(proposalSummary.approvedProjectValueCents),
      ltv: 68,
      name: proposalBuild.name,
      tag: "demo",
    },
    ...timelineCards.map((card) => ({
      address: card.subtitle,
      builder: "Mock builder - timeline setup has no builder company",
      column: proposalColumn(card.column),
      href: `/demo/timeline/${card.planId}`,
      id: String(card._id),
      isMockBuilder: true,
      isMockLtv: true,
      loanAmount: centsToCurrency(card.totalBudgetCents),
      ltv: 68,
      name: card.title,
      tag: card.tag,
    })),
  ];

  const scheduleEvents = activeMilestones
    .flatMap((milestone) => {
      const events = [];
      if (milestone.latestSiteVisit) {
        events.push({
          date: new Date(
            milestone.latestSiteVisit.completedAt ??
              milestone.latestSiteVisit.claimedAt ??
              milestone.latestSiteVisit.createdAt
          ).toISOString(),
          id: `site-visit-${milestone.latestSiteVisit._id}-${milestone.key}`,
          kind: "siteVisit" as const,
          label: `${milestone.name} site visit`,
        });
      }
      if (milestone.submittedAt) {
        events.push({
          date: new Date(milestone.submittedAt).toISOString(),
          id: `milestone-review-${milestone._id}`,
          kind: "milestoneReview" as const,
          label: `${milestone.name} review`,
        });
      }
      return events;
    })
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 6);

  const drawReviewEvents = pendingDrawGroups.map((group) => ({
    date: `${group.eligibleDate}T14:00:00.000Z`,
    id: `draw-review-${group.key}`,
    kind: "drawReview" as const,
    label: `${group.label} draw review`,
  }));

  return {
    dashboard: {
      activeBuilds: [
        {
          activeMilestone: activeMilestone?.name ?? "No active milestone",
          address: demoBuildAddress(activeBuild),
          buildKey: activeBuild.key,
          builder: "Mock builder - demo_builds has no builder company",
          daysActive: daysBetween(
            activeBuild.projectStartDate,
            activeBuild.todayDate
          ),
          href: `/backoffice/builds/${activeBuild.key}?rail=closed&tab=timeline`,
          id: activeDisplayId,
          milestoneState: milestoneState(
            activeMilestone?.displayStatus ??
              activeMilestone?.status ??
              "planned"
          ),
          status: buildStatus.status,
          statusLabel: buildStatus.label,
        },
      ],
      drawRequests: pendingDrawGroups.map((group) => ({
        address: demoBuildAddress(activeBuild),
        buildId: activeDisplayId,
        buildKey: activeBuild.key,
        eligibleDate: group.eligibleDate,
        href: `/backoffice/builds/${activeBuild.key}?rail=closed&tab=timeline`,
        id: group.key,
        label: group.label,
        requestedAmount: centsToCurrency(group.requestedValueCents),
        statusLabel:
          group.eligibleDate < activeBuild.todayDate ? "Overdue" : "Pending",
      })),
      metrics: [
        {
          detail: `${pendingReviewMilestones.length} milestone reviews pending`,
          id: "draw-requests",
          label: "Draw requests",
          tone: pendingDrawGroups.length > 0 ? "warning" : "success",
          trend:
            locationUnverifiedPackages > 0
              ? `${locationUnverifiedPackages} location-unverified package candidates`
              : "Evidence packages from demo_evidencePackages",
          value: pendingDrawGroups.length,
        },
        {
          detail: `${buildStatus.label}; ${activePendingMilestones.length} incomplete milestones`,
          id: "active-builds",
          label: "Active builds",
          tone: buildStatus.status === "onTrack" ? "success" : "destructive",
          trend: `${siteVisitsThisWeek} site visits in demo_siteVisits`,
          value: 1,
        },
        {
          detail: `${timelineCards.length} generated timeline proposals`,
          id: "proposals",
          label: "Proposals",
          tone: "default",
          trend: `${proposalCards.filter((card) => card.column === "draft").length} draft proposals`,
          value: proposalCards.length,
        },
        {
          detail: `${activePendingMilestones.length} active milestone queue items`,
          id: "milestones",
          label: "Milestones",
          tone: "success",
          trend: `${pendingReviewMilestones.length} in lender review`,
          value: activeMilestones.length,
        },
      ],
      milestoneColumns: BACKOFFICE_MILESTONE_COLUMNS,
      milestones: activePendingMilestones.map((milestone) => ({
        address: demoBuildAddress(activeBuild),
        buildKey: activeBuild.key,
        buildId: activeDisplayId,
        column: milestoneColumn(activeBuild, milestone),
        dueLabel: milestoneDueLabel(activeBuild, milestone),
        href: `/backoffice/builds/${activeBuild.key}?milestone=${milestone.key}`,
        id: String(milestone._id),
        milestoneKey: milestone.key,
        name: milestone.name,
        priority: milestonePriority(milestone),
        reviewerInitials:
          initials(milestone.latestReview?.reviewerPersona) ??
          initials(milestone.latestSiteVisit?.assignedPersona),
      })),
      proposalColumns: BACKOFFICE_PROPOSAL_COLUMNS,
      proposals: proposalCards.map((card) => ({
        ...card,
        statusLabel: proposalStatusLabel(
          card.id === proposalDisplayId ? proposalBuild.status : card.column
        ),
      })),
      quickActions: [
        ...pendingReviewMilestones.slice(0, 2).map((milestone) => ({
          actionLabel: "Review milestone",
          address: demoBuildAddress(activeBuild),
          buildId: activeDisplayId,
          dueLabel: milestoneDueLabel(activeBuild, milestone) ?? "ready",
          id: `qa-milestone-${milestone.key}`,
          title: milestone.name,
          type: "milestone" as const,
        })),
        ...activeMilestones
          .filter((milestone) => milestone.latestSiteVisit)
          .slice(0, 2)
          .map((milestone) => ({
            actionLabel:
              milestone.latestSiteVisit?.status === "completed"
                ? "Open report"
                : "Track visit",
            address: demoBuildAddress(activeBuild),
            buildId: activeDisplayId,
            dueLabel: milestoneDueLabel(activeBuild, milestone) ?? "scheduled",
            id: `qa-site-visit-${milestone.key}`,
            title: `${milestone.name} site visit`,
            type: "siteVisit" as const,
          })),
        ...pendingDrawGroups.slice(0, 2).map((group) => ({
          actionLabel: "Review draw request",
          address: demoBuildAddress(activeBuild),
          buildId: activeDisplayId,
          dueLabel:
            group.eligibleDate < activeBuild.todayDate
              ? "overdue"
              : group.eligibleDate,
          id: `qa-draw-${group.key}`,
          title: `${group.label} requested`,
          type: "drawRequest" as const,
        })),
      ].slice(0, 5),
      scheduleDate: `${activeBuild.todayDate}T12:00:00.000Z`,
      scheduleEvents: [...scheduleEvents, ...drawReviewEvents]
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        .slice(0, 6),
    },
    gapAnalysis: [
      {
        display: "Active build table address",
        gap: "demo_builds has subtitle/location but no street address column.",
        resolution:
          "Displayed as Mock address while preserving the real city from subtitle.",
        source: "demo_builds.subtitle",
      },
      {
        display: "Builder/company names",
        gap: "demo_builds and timeline proposal cards do not store builder companies.",
        resolution: "Displayed as Mock builder labels.",
        source: "No demo_ table field available",
      },
      {
        display: "Proposal LTV",
        gap: "No demo loan/collateral valuation table exists for LTV derivation.",
        resolution: "Displayed with a Mock LTV badge in the proposal card.",
        source: "No demo_ table field available",
      },
    ],
    needsSeed: false,
  };
}
