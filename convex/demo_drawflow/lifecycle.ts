import {
  appendAudit,
  appendOutbox,
  getDrawGroups,
  getMilestones,
  latestEvidencePackage,
} from "./access";
import {
  earliestDate,
  groupAmount,
  latestDate,
  type DemoMilestone,
  type DemoMutationCtx,
  type Scenario,
} from "./data";

export async function recomputeActiveDrawGroupStatuses(ctx: DemoMutationCtx) {
  const groups = await getDrawGroups(ctx, "active");
  const milestones = await getMilestones(ctx, "active");
  for (const group of groups) {
    const groupMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === group.key
    );
    const allApproved = groupMilestones.every(
      (milestone) => milestone.status === "completion_approved"
    );
    const nextStatus = allApproved
      ? "release_approved"
      : group.order === 2
        ? "partially_eligible"
        : "not_yet_eligible";
    if (group.status !== nextStatus) {
      await ctx.db.patch(group._id, {
        releaseApprovedAt:
          nextStatus === "release_approved"
            ? Date.now()
            : group.releaseApprovedAt,
        status: nextStatus,
        updatedAt: Date.now(),
      });
      if (nextStatus === "release_approved") {
        await appendAudit(ctx, {
          actorPersona: "system",
          buildId: group.buildId,
          command: "demo_recomputeDrawGroupStatuses",
          drawGroupKey: group.key,
          entityKey: group.key,
          entityLabel: group.label,
          entityType: "draw_group",
          eventType: "DrawGroupReleaseApproved",
          scenario: "active",
        });
        await appendOutbox(ctx, {
          buildId: group.buildId,
          drawGroupKey: group.key,
          eventType: "demo.drawGroup.releaseApproved",
          payloadPreview: `${group.label} release approved; capital exposure reset.`,
          relatedEntity: group.label,
          scenario: "active",
        });
      }
    }
  }
}
export async function recalcDrawGroupDates(ctx: DemoMutationCtx, scenario: Scenario) {
  const groups = await getDrawGroups(ctx, scenario);
  const milestones = await getMilestones(ctx, scenario);
  const startField =
    scenario === "active" ? "forecastStartDate" : "plannedStartDate";
  const endField = scenario === "active" ? "forecastEndDate" : "plannedEndDate";

  for (const group of groups) {
    const groupMilestones = milestones.filter(
      (milestone) => milestone.drawGroupKey === group.key
    );
    if (groupMilestones.length === 0) {
      continue;
    }
    await ctx.db.patch(group._id, {
      approvedValueCents: groupAmount(groupMilestones),
      [endField]: latestDate(groupMilestones.map((item) => item[endField])),
      [startField]: earliestDate(
        groupMilestones.map((item) => item[startField])
      ),
      requestedValueCents: groupMilestones.reduce(
        (sum, item) =>
          sum + (item.requestedAmountCents ?? item.approvedValueCents),
        0
      ),
      updatedAt: Date.now(),
    });
  }
}

export async function ensureDraftEvidencePackage(
  ctx: DemoMutationCtx,
  milestone: DemoMilestone
) {
  const existing = await latestEvidencePackage(ctx, "active", milestone.key);
  if (existing && existing.status === "draft") {
    return existing._id;
  }
  return await ctx.db.insert("demo_evidencePackages", {
    buildId: milestone.buildId,
    createdAt: Date.now(),
    milestoneId: milestone._id,
    milestoneKey: milestone.key,
    reviewStatus: "not_started",
    scenario: "active",
    status: "draft",
  });
}
