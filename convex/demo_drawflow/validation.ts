import {
  dateValue,
  earliestDate,
  issueHash,
  latestDate,
  type DemoDependency,
  type DemoDrawGroup,
  type DemoEvidenceFile,
  type DemoMilestone,
  type DemoSiteVisit,
  type Scenario,
  type WorkspaceIssue,
} from "./data";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Proposal validation keeps rule emission colocated with issue metadata.
export function validateProposal(
  milestones: DemoMilestone[],
  drawGroups: DemoDrawGroup[],
  dependencies: DemoDependency[],
  workingCapitalLimitCents: number
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: WorkspaceIssue[] = [];
  const byKey = new Map<string, DemoMilestone>();
  for (const milestone of milestones) {
    byKey.set(milestone.key, milestone);
    if (milestone.approvedValueCents <= 0) {
      const message = `${milestone.name} must have a positive approved value.`;
      errors.push(message);
      issues.push({
        code: "MILESTONE_VALUE_MISSING",
        conditionHash: issueHash([milestone.key, milestone.approvedValueCents]),
        dependencyIds: [],
        dismissible: false,
        dismissed: false,
        drawGroupIds: [milestone.drawGroupKey],
        id: `milestone-value-${milestone.key}`,
        impact:
          "Proposal submission is blocked until every budget line has a reimbursable value.",
        message,
        milestoneIds: [milestone.key],
        quickFix: {
          action: "openMilestoneEditor",
          label: "Open milestone estimate",
          targetId: milestone.key,
        },
        scope: "milestone",
        severity: "blocking",
        title: "Missing milestone value",
      });
    }
  }

  for (const group of drawGroups) {
    const groupMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === group.key
    );
    const amount = groupMilestones.reduce(
      (sum, milestone) => sum + milestone.approvedValueCents,
      0
    );
    if (amount > workingCapitalLimitCents) {
      const message = `${group.label} exceeds Borrower Working Capital Limit.`;
      errors.push(message);
      issues.push({
        code: "DRAW_GROUP_WORKING_CAPITAL_EXCEEDED",
        conditionHash: issueHash([group.key, amount, workingCapitalLimitCents]),
        dependencyIds: [],
        dismissible: false,
        dismissed: false,
        drawGroupIds: [group.key],
        id: `draw-capital-${group.key}`,
        impact:
          "The borrower would need more working capital than the lender-configured cap before reimbursement.",
        message,
        milestoneIds: groupMilestones.map((milestone) => milestone.key),
        quickFix: {
          action: "splitDrawGroup",
          label: "Split this draw group",
          targetId: group.key,
        },
        scope: "drawGroup",
        severity: "blocking",
        title: "Working-capital cap exceeded",
      });
    }
  }

  const sortedGroups = [...drawGroups].sort((a, b) => a.order - b.order);
  for (let index = 0; index < sortedGroups.length - 1; index += 1) {
    const current = sortedGroups[index];
    const next = sortedGroups[index + 1];
    const currentMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === current.key
    );
    const nextMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === next.key
    );
    const currentEnd =
      current.plannedEndDate ??
      (currentMilestones.length
        ? latestDate(
            currentMilestones.map((milestone) => milestone.plannedEndDate)
          )
        : undefined);
    const nextStart =
      next.plannedStartDate ??
      (nextMilestones.length
        ? earliestDate(
            nextMilestones.map((milestone) => milestone.plannedStartDate)
          )
        : undefined);
    if (currentEnd && nextStart && currentEnd >= nextStart) {
      const message = `${current.label} ends on or after ${next.label} starts.`;
      warnings.push(message);
      issues.push({
        code: "DRAW_GROUP_OVERLAP",
        conditionHash: issueHash([
          current.key,
          currentEnd,
          next.key,
          nextStart,
        ]),
        dependencyIds: [],
        dismissible: true,
        dismissed: false,
        drawGroupIds: [current.key, next.key],
        id: `draw-overlap-${current.key}-${next.key}`,
        impact:
          "Eligibility dates, review sequencing, and reimbursement release timing become ambiguous when draw groups overlap.",
        message,
        milestoneIds: [
          ...currentMilestones.map((milestone) => milestone.key),
          ...nextMilestones.map((milestone) => milestone.key),
        ],
        quickFix: {
          action: "shiftNextDrawGroup",
          label: `Shift ${next.label} after ${current.label}`,
          targetId: current.key,
        },
        scope: "drawGroup",
        severity: "warning",
        title: "Draw groups overlap",
      });
    }
  }

  for (const edge of dependencies) {
    const blocker = byKey.get(edge.blockerKey);
    const blocked = byKey.get(edge.blockedKey);
    if (!(blocker && blocked)) {
      continue;
    }
    const blockerEnd = blocker.plannedEndDate;
    const blockedStart = blocked.plannedStartDate;
    if (!(blockerEnd && blockedStart)) {
      continue;
    }
    const violatesSchedule = blockerEnd >= blockedStart;
    if (violatesSchedule && edge.severity === "blocking") {
      const message = `${blocker.name} must finish before ${blocked.name}.`;
      errors.push(message);
      issues.push({
        code: "DEPENDENCY_ORDER_BLOCKED",
        conditionHash: issueHash([edge._id, blockerEnd, blockedStart]),
        dependencyIds: [edge._id],
        dismissible: false,
        dismissed: false,
        drawGroupIds: [blocker.drawGroupKey, blocked.drawGroupKey],
        id: `dependency-order-${edge.blockerKey}-${edge.blockedKey}`,
        impact:
          "A hard construction dependency is out of sequence, so proposal submission cannot proceed.",
        message,
        milestoneIds: [blocker.key, blocked.key],
        quickFix: {
          action: "shiftDependentMilestone",
          label: `Shift ${blocked.name} after ${blocker.name}`,
          targetId: edge._id,
        },
        scope: "dependency",
        severity: "blocking",
        title: "Dependency schedule conflict",
      });
    } else if (violatesSchedule) {
      const message = `${blocker.name} is scheduled tight against ${blocked.name}.`;
      warnings.push(message);
      issues.push({
        code: "DEPENDENCY_ORDER_WARNING",
        conditionHash: issueHash([edge._id, blockerEnd, blockedStart]),
        dependencyIds: [edge._id],
        dismissible: true,
        dismissed: false,
        drawGroupIds: [blocker.drawGroupKey, blocked.drawGroupKey],
        id: `dependency-warning-${edge.blockerKey}-${edge.blockedKey}`,
        impact:
          "This soft dependency may create field coordination risk or lender review questions.",
        message,
        milestoneIds: [blocker.key, blocked.key],
        quickFix: {
          action: "shiftDependentMilestone",
          label: `Shift ${blocked.name}`,
          targetId: edge._id,
        },
        scope: "dependency",
        severity: "warning",
        title: "Soft dependency is tight",
      });
    }
  }

  return { errors, issues, warnings };
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Blocking reason derivation mirrors workspace rule branches.
export function deriveBlockingReasons(input: {
  dependencies: DemoDependency[];
  drawGroups: DemoDrawGroup[];
  evidenceFiles: DemoEvidenceFile[];
  groupByKey: Map<string, DemoDrawGroup>;
  milestone: DemoMilestone;
  milestoneByKey: Map<string, DemoMilestone>;
  proposalValidation: { errors: string[]; warnings: string[] };
  scenario: Scenario;
  siteVisit?: DemoSiteVisit;
}) {
  const reasons = new Set<string>();
  if (input.scenario === "active") {
    const group = input.groupByKey.get(input.milestone.drawGroupKey);
    if (!group) {
      return [...reasons];
    }
    const priorGroups = input.drawGroups.filter(
      (candidate) => candidate.order < group.order
    );
    if (
      priorGroups.some((candidate) => candidate.status !== "release_approved")
    ) {
      reasons.add("capital_blocked");
    }
  }

  for (const edge of input.dependencies) {
    const blocker = input.milestoneByKey.get(edge.blockerKey);
    if (!blocker) {
      continue;
    }
    if (edge.blockedKey === input.milestone.key) {
      const dependencySatisfied = blocker.status === "completion_approved";
      if (!dependencySatisfied && edge.type === "procurement_dependency") {
        reasons.add("procurement_dependency_blocked");
      } else if (!dependencySatisfied && edge.severity === "blocking") {
        reasons.add("hard_dependency_blocked");
      }
    }
    if (
      input.scenario === "active" &&
      edge.blockerKey === input.milestone.key &&
      dateValue(input.milestone.forecastEndDate) >=
        (input.milestoneByKey.get(edge.blockedKey)?.forecastStartDate ??
          "9999-01-01")
    ) {
      reasons.add("forecast_invalid");
    }
  }

  if (
    input.milestone.status === "complete_pending_submission" &&
    input.evidenceFiles.length === 0
  ) {
    reasons.add("evidence_required");
  }
  if (
    input.milestone.status === "submitted_for_review" &&
    input.milestone.evidenceReviewStatus !== "accepted"
  ) {
    reasons.add("review_required");
  }
  if (
    input.milestone.requiresSiteVisit &&
    ["submitted_for_review", "site_visit_requested"].includes(
      input.milestone.status
    ) &&
    input.siteVisit?.status !== "completed"
  ) {
    reasons.add("site_visit_required");
  }
  if (input.scenario === "proposal") {
    const relatedHardError = input.proposalValidation.errors.some((error) =>
      error.includes(input.milestone.name)
    );
    if (relatedHardError) {
      reasons.add("draw_group_limit_exceeded");
    }
  }

  return [...reasons];
}
