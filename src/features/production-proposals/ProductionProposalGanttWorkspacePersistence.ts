import type { Id } from "../../../convex/_generated/dataModel";
import type {
  ProposalGanttDrawDraft,
  ProposalGanttMilestoneDraft,
} from "./ProductionProposalGanttWorkspaceTypes.ts";
import {
  sameStringArray,
  sameSubmilestones,
} from "./ProductionProposalGanttWorkspaceUtils.ts";

export async function syncMilestonesToProductionTimeline({
  createMilestone,
  deleteMilestone,
  nextMilestones,
  previousMilestones,
  proposalId,
  updateMilestone,
  workosOrganizationId,
}: {
  createMilestone: (input: any) => Promise<unknown>;
  deleteMilestone: (input: any) => Promise<unknown>;
  nextMilestones: ProposalGanttMilestoneDraft[];
  previousMilestones: ProposalGanttMilestoneDraft[];
  proposalId: Id<"buildProposals">;
  updateMilestone: (input: any) => Promise<unknown>;
  workosOrganizationId: string;
}) {
  const previousByKey = new Map(
    previousMilestones.map((milestone) => [milestone.key, milestone])
  );
  const nextByKey = new Map(
    nextMilestones.map((milestone) => [milestone.key, milestone])
  );

  for (const previous of previousMilestones) {
    if (!nextByKey.has(previous.key)) {
      await deleteMilestone({
        milestoneKey: previous.key,
        proposalId,
        workosOrganizationId,
      });
    }
  }

  for (const milestone of nextMilestones) {
    const previous = previousByKey.get(milestone.key);
    if (!previous) {
      await createMilestone({
        milestone: productionTimelineMilestoneInputFromDraft(milestone),
        proposalId,
        workosOrganizationId,
      });
      continue;
    }
    const patch = productionTimelineMilestonePatch(previous, milestone);
    if (Object.keys(patch).length > 0) {
      await updateMilestone({
        ...patch,
        milestoneKey: milestone.key,
        proposalId,
        workosOrganizationId,
      });
    }
  }
}

export async function syncDrawsToProductionTimeline({
  createDraw,
  deleteDraw,
  nextDraws,
  previousDraws,
  proposalId,
  updateDraw,
  workosOrganizationId,
}: {
  createDraw: (input: any) => Promise<unknown>;
  deleteDraw: (input: any) => Promise<unknown>;
  nextDraws: ProposalGanttDrawDraft[];
  previousDraws: ProposalGanttDrawDraft[];
  proposalId: Id<"buildProposals">;
  updateDraw: (input: any) => Promise<unknown>;
  workosOrganizationId: string;
}) {
  const previousByKey = new Map(
    previousDraws.map((draw) => [draw.drawKey, draw])
  );
  const nextByKey = new Map(nextDraws.map((draw) => [draw.drawKey, draw]));

  for (const previous of previousDraws) {
    if (!nextByKey.has(previous.drawKey)) {
      await deleteDraw({
        drawKey: previous.drawKey,
        proposalId,
        workosOrganizationId,
      });
    }
  }

  for (const draw of nextDraws) {
    const previous = previousByKey.get(draw.drawKey);
    if (!previous) {
      await createDraw({
        amountCents: draw.amountCents,
        customDate: draw.customDate ?? true,
        drawKey: draw.drawKey,
        itemMilestoneKey: draw.milestoneKey,
        label: draw.label,
        order: draw.order,
        proposalId,
        workosOrganizationId,
        x: draw.timingDay,
      });
      continue;
    }
    const patch = productionTimelineDrawPatch(previous, draw);
    if (Object.keys(patch).length > 0) {
      await updateDraw({
        ...patch,
        drawKey: draw.drawKey,
        proposalId,
        workosOrganizationId,
      });
    }
  }
}

function productionTimelineMilestoneInputFromDraft(
  milestone: ProposalGanttMilestoneDraft
) {
  return {
    budgetCents: milestone.budgetCents,
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    dependencyKeys: milestone.dependencyKeys,
    durationDays: milestone.durationDays,
    evidenceState: "Draft package",
    ...(milestone.icon ? { icon: milestone.icon } : {}),
    markerLabel: String(milestone.order),
    milestoneKey: milestone.key,
    name: milestone.name,
    order: milestone.order,
    policyState: "Draft policy review",
    submilestones: milestone.submilestones,
    x: milestone.dayStart,
  };
}

function productionTimelineMilestonePatch(
  previous: ProposalGanttMilestoneDraft,
  next: ProposalGanttMilestoneDraft
) {
  return {
    ...(previous.budgetCents === next.budgetCents
      ? {}
      : { budgetCents: next.budgetCents }),
    ...(previous.dayEnd === next.dayEnd ? {} : { dayEnd: next.dayEnd }),
    ...(previous.dayStart === next.dayStart ? {} : { dayStart: next.dayStart }),
    ...(sameStringArray(previous.dependencyKeys, next.dependencyKeys)
      ? {}
      : { dependencyKeys: next.dependencyKeys }),
    ...(previous.durationDays === next.durationDays
      ? {}
      : { durationDays: next.durationDays }),
    ...(previous.icon === next.icon || next.icon === undefined
      ? {}
      : { icon: next.icon }),
    ...(previous.name === next.name ? {} : { name: next.name }),
    ...(previous.order === next.order ? {} : { order: next.order }),
    ...(sameSubmilestones(previous.submilestones, next.submilestones)
      ? {}
      : { submilestones: next.submilestones }),
  };
}

function productionTimelineDrawPatch(
  previous: ProposalGanttDrawDraft,
  next: ProposalGanttDrawDraft
) {
  const patch = {
    ...(previous.amountCents === next.amountCents
      ? {}
      : { amountCents: next.amountCents }),
    ...(previous.label === next.label ? {} : { label: next.label }),
    ...(previous.milestoneKey === next.milestoneKey ||
    next.milestoneKey === undefined
      ? {}
      : { itemMilestoneKey: next.milestoneKey }),
    ...(previous.order === next.order ? {} : { order: next.order }),
    ...(previous.timingDay === next.timingDay ? {} : { x: next.timingDay }),
  };
  return Object.keys(patch).length === 0
    ? patch
    : { ...patch, customDate: true };
}
