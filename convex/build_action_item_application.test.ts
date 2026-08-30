import { describe, expect, test } from "vitest";

import {
  buildCanonicalBuildActionItemCreationPlan,
  buildManualBuildActionItemDeadlinePatch,
  buildPolicyBuildActionItemDeadlinePatch,
  buildPolicyOverrideBuildActionItemDeadlinePatch,
} from "./build_action_item_application";
import type { Doc, Id } from "./types";

const brokerageId = "brokerage_c3" as Id<"brokerages">;
const buildId = "build_c3" as Id<"activeBuilds">;
const postId = "post_c3" as Id<"buildCollaborationPosts">;
const actionItemId = "action_item_c3" as Id<"buildActionItems">;
const dueAt = 1_800_000_000_000;

const sharedConstruction = {
  assigneeWorkosUserId: "user_assignee",
  assignedByWorkosUserId: "user_creator",
  assignmentRequestedAt: undefined,
  assignmentState: "assigned" as const,
  brokerageId,
  buildId,
  createdAt: 1_700_000_000_000,
  descriptionPlainText: "Submit the evidence.",
  descriptionTiptapJson: JSON.stringify({ content: [], type: "doc" }),
  dueAt,
  organizationId: "org_c3",
  originatingPostId: postId,
  priority: "high" as const,
  references: [
    {
      entityId: "evidence-1",
      entityKind: "evidencePackage" as const,
      label: "Evidence package",
      primary: true,
      summary: "Evidence package summary",
    },
  ],
  requiresAcceptance: true,
  title: " Submit the evidence. ",
  workKind: "evidence" as const,
};

function planForAuthority(
  exercisedAuthority: string
) {
  return buildCanonicalBuildActionItemCreationPlan({
    ...sharedConstruction,
    actorRole: "builder",
    actorWorkosUserId: "user_creator",
    event: { exercisedAuthority },
  });
}

function deadlineItem(
  overrides: Partial<Doc<"buildActionItems">> = {}
): Doc<"buildActionItems"> {
  return {
    _creationTime: 1_700_000_000_000,
    _id: actionItemId,
    assignmentState: "assigned",
    brokerageId,
    buildId,
    createdAt: 1_700_000_000_000,
    creatorRole: "builder",
    creatorWorkosUserId: "user_creator",
    currentRevision: 1,
    descriptionPlainText: "Submit the evidence.",
    descriptionTiptapJson: JSON.stringify({ content: [], type: "doc" }),
    dueAt,
    dueDateSource: "manual",
    deadlineScheduleGeneration: 1,
    organizationId: "org_c3",
    originatingPostId: postId,
    priority: "high",
    queueSortAt: dueAt,
    requiresAcceptance: true,
    status: "todo",
    title: "Submit the evidence.",
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("Build Action Item application owner", () => {
  test("manual and publication adapters share the canonical construction plan", () => {
    const manual = planForAuthority("reader");
    const publication = planForAuthority("creator");

    expect(manual.actionItem).toEqual(publication.actionItem);
    expect(manual.queueSortAt).toBe(dueAt);
    expect(manual.actionItem).toMatchObject({
      currentRevision: 1,
      deadlineNextAt: dueAt - 24 * 60 * 60 * 1000,
      deadlineNextStage: "before",
      deadlineProcessingState: "pending",
      deadlineScheduleGeneration: 1,
      dueAt,
      dueDateSource: "manual",
      primaryReferenceId: "evidence-1",
      primaryReferenceKind: "evidencePackage",
      queueSortAt: dueAt,
      title: "Submit the evidence.",
    });
    expect(JSON.parse(manual.event.newState)).toMatchObject({
      dueAt,
      status: "todo",
      title: "Submit the evidence.",
      workKind: "evidence",
    });
    expect(manual.event.exercisedAuthority).toBe("reader");
    expect(publication.event.exercisedAuthority).toBe("creator");
  });

  test("manual, policy, and coordinator deadline patches preserve queue and schedule invariants", () => {
    const cleared = buildManualBuildActionItemDeadlinePatch(
      deadlineItem(),
      null
    );
    expect(cleared).toMatchObject({
      deadlineNextAt: undefined,
      deadlineNextStage: undefined,
      deadlineProcessingState: "complete",
      deadlineScheduleGeneration: 2,
      dueAt: undefined,
      dueDateSource: undefined,
      queueSortAt: Number.MAX_SAFE_INTEGER - 1,
    });

    const policy = buildPolicyBuildActionItemDeadlinePatch(
      deadlineItem({ dueDateSource: undefined }),
      { dueAt: dueAt + 60_000, policyKey: " evidence-review-sla " }
    );
    expect(policy).toMatchObject({
      deadlineNextAt: dueAt + 60_000 - 24 * 60 * 60 * 1000,
      deadlineNextStage: "before",
      deadlineProcessingState: "pending",
      deadlineScheduleGeneration: 2,
      dueAt: dueAt + 60_000,
      dueDatePolicyKey: "evidence-review-sla",
      dueDateSource: "policy",
      policyDueAt: dueAt + 60_000,
      queueSortAt: dueAt + 60_000,
    });

    const override = buildPolicyOverrideBuildActionItemDeadlinePatch(
      deadlineItem({
        dueDatePolicyKey: "evidence-review-sla",
        dueDateSource: "policy",
        policyDueAt: dueAt,
      }),
      {
        dueAt: dueAt + 120_000,
        now: 1_700_000_010_000,
        reason: " Site access changed ",
        workosUserId: "user_coordinator",
      }
    );
    expect(override).toMatchObject({
      deadlineNextAt: dueAt + 120_000 - 24 * 60 * 60 * 1000,
      deadlineNextStage: "before",
      deadlineProcessingState: "pending",
      deadlineScheduleGeneration: 2,
      dueAt: dueAt + 120_000,
      dueDateOverrideReason: "Site access changed",
      dueDateOverriddenAt: 1_700_000_010_000,
      dueDateOverriddenByWorkosUserId: "user_coordinator",
      queueSortAt: dueAt + 120_000,
    });
  });
});
