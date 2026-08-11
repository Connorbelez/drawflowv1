import type { Id } from "../../../convex/_generated/dataModel";
import { parseBuildCollaborationFocus } from "../build-collaboration/referenceFocus.ts";

export type BuildDetailTarget =
  | {
      kind: "milestone";
      milestoneId: Id<"buildMilestones">;
    }
  | {
      companionId?: Id<"buildActionItems">;
      kind: "submilestone";
      submilestoneId: Id<"buildSubmilestones">;
    }
  | {
      actionItemId: Id<"buildActionItems">;
      kind: "actionItem";
    };

export type BuildDetailTargetKind = BuildDetailTarget["kind"];

export function isBuildDetailFocusCandidate(value: unknown) {
  return (
    typeof value === "string" &&
    /^(?:actionItem|milestone|submilestone):/.test(value.trim())
  );
}

export function parseBuildDetailFocus(
  value: unknown,
): BuildDetailTarget | undefined {
  const parsed = parseBuildCollaborationFocus(value);
  if (!parsed) {
    return;
  }
  if (parsed.entityKind === "milestone") {
    return {
      kind: "milestone",
      milestoneId: parsed.entityId as Id<"buildMilestones">,
    };
  }
  if (parsed.entityKind === "submilestone") {
    return {
      kind: "submilestone",
      submilestoneId: parsed.entityId as Id<"buildSubmilestones">,
    };
  }
  if (parsed.entityKind === "actionItem") {
    return {
      actionItemId: parsed.entityId as Id<"buildActionItems">,
      kind: "actionItem",
    };
  }
}

export function focusForBuildDetailTarget(target: BuildDetailTarget) {
  if (target.kind === "milestone") {
    return `milestone:${target.milestoneId}`;
  }
  if (target.kind === "submilestone") {
    return target.companionId
      ? `actionItem:${target.companionId}`
      : `submilestone:${target.submilestoneId}`;
  }
  return `actionItem:${target.actionItemId}`;
}

export function sameBuildDetailTarget(
  left: BuildDetailTarget | undefined,
  right: BuildDetailTarget | undefined,
) {
  if (!(left && right) || left.kind !== right.kind) {
    return left === right;
  }
  if (left.kind === "milestone" && right.kind === "milestone") {
    return left.milestoneId === right.milestoneId;
  }
  if (left.kind === "submilestone" && right.kind === "submilestone") {
    return (
      left.submilestoneId === right.submilestoneId &&
      left.companionId === right.companionId
    );
  }
  return (
    left.kind === "actionItem" &&
    right.kind === "actionItem" &&
    left.actionItemId === right.actionItemId
  );
}

export function detailTargetFromResolution(target: {
  actionItemId?: Id<"buildActionItems">;
  companionId?: Id<"buildActionItems">;
  kind: "actionItem" | "milestone" | "submilestone";
  milestoneId?: Id<"buildMilestones">;
  submilestoneId?: Id<"buildSubmilestones">;
}): BuildDetailTarget | undefined {
  if (target.kind === "milestone" && target.milestoneId) {
    return { kind: "milestone", milestoneId: target.milestoneId };
  }
  if (target.kind === "submilestone" && target.submilestoneId) {
    return {
      companionId: target.companionId,
      kind: "submilestone",
      submilestoneId: target.submilestoneId,
    };
  }
  if (target.kind === "actionItem" && target.actionItemId) {
    return { actionItemId: target.actionItemId, kind: "actionItem" };
  }
}
