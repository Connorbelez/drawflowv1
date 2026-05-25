import type {
  BackofficeDashboardData,
  DashboardMetric,
  MetricDrilldownItem,
  ProposalKanbanCard,
} from "#/features/backoffice-dashboard/mock-data.ts";

function proposalBadgeVariant(
  proposal: ProposalKanbanCard,
): MetricDrilldownItem["badgeVariant"] {
  switch (proposal.column) {
    case "approved":
      return "success";
    case "closed":
      return "outline";
    case "submitted":
      return "warning";
    default:
      return "outline";
  }
}

export function getMetricDrilldownItems(
  metricId: DashboardMetric["id"],
  dashboard: BackofficeDashboardData,
): MetricDrilldownItem[] {
  switch (metricId) {
    case "draw-requests":
      return dashboard.drawRequests.map((request) => ({
        badgeLabel: request.statusLabel,
        badgeVariant:
          request.statusLabel === "Overdue" ? "destructive" : "warning",
        context: `${request.requestedAmount} requested · Eligible ${request.eligibleDate}`,
        href: request.href,
        id: request.id,
        subtitle: `${request.buildId} · ${request.address}`,
        title: request.label,
      }));
    case "active-builds":
      return dashboard.activeBuilds.map((build) => ({
        badgeLabel: build.statusLabel,
        badgeVariant: build.status === "onTrack" ? "success" : "warning",
        context: `T+${build.daysActive} days · ${build.activeMilestone}`,
        href: build.href,
        id: build.id,
        subtitle: `${build.address} · ${build.builder}`,
        title: build.id,
      }));
    case "proposals":
      return dashboard.proposals.map((proposal) => ({
        badgeLabel: proposal.statusLabel ?? proposal.closeLabel ?? proposal.column,
        badgeVariant: proposalBadgeVariant(proposal),
        context: `${proposal.loanAmount} · ${
          proposal.isMockLtv ? "Mock " : ""
        }${proposal.ltv}% LTV`,
        href: proposal.href ?? "#proposals-kanban",
        id: proposal.id,
        subtitle: `${proposal.address} · ${proposal.builder}`,
        title: proposal.name,
      }));
    case "milestones":
      return dashboard.milestones.map((milestone) => ({
        badgeLabel: milestone.priority,
        badgeVariant:
          milestone.priority === "high"
            ? "destructive"
            : milestone.priority === "medium"
              ? "warning"
              : "outline",
        context: milestone.dueLabel
          ? `${milestone.buildId} · Due ${milestone.dueLabel}`
          : `${milestone.buildId} · Active queue item`,
        href: milestone.href,
        id: milestone.id,
        subtitle: `${milestone.address}${
          milestone.reviewerInitials ? ` · ${milestone.reviewerInitials}` : ""
        }`,
        title: milestone.name,
      }));
    default:
      return [];
  }
}

export function getMetricSectionHref(metricId: DashboardMetric["id"]): string {
  switch (metricId) {
    case "draw-requests":
    case "active-builds":
      return "#active-builds";
    case "proposals":
      return "#proposals-kanban";
    case "milestones":
      return "#milestones-kanban";
    default:
      return "#";
  }
}
