import { describe, expect, test } from "vitest";

import type { CollaborationSystemPresentation } from "./model";
import {
  classifyCollaborationActionItem,
  systemPresentationSummary,
} from "./model";

describe("systemPresentationSummary", () => {
  test("keeps the known presentation label", () => {
    expect(
      systemPresentationSummary({
        column: "behind_schedule",
      } as CollaborationSystemPresentation),
    ).toBe("Behind Schedule");
  });

  test("falls back to the raw runtime column when no label exists", () => {
    expect(
      systemPresentationSummary({
        column: "future_runtime_column",
      } as unknown as CollaborationSystemPresentation),
    ).toBe("future_runtime_column");
  });
});

describe("classifyCollaborationActionItem", () => {
  test("normalizes a valid generated root to the canonical Sub-milestone target", () => {
    expect(
      classifyCollaborationActionItem({
        _id: "companion-1" as never,
        canonicalBuildSubmilestoneId: "submilestone-1" as never,
        parentActionItemId: undefined,
        systemMode: "generated_milestone_submilestone",
        systemPresentation: {
          bindingState: "valid",
          column: "in_progress",
          state: "known",
        },
      }),
    ).toEqual({
      editableGenericWorkflow: false,
      integrityState: "valid",
      kind: "generated_submilestone",
      label: "Sub-milestone",
      target: {
        companionId: "companion-1",
        kind: "submilestone",
        submilestoneId: "submilestone-1",
      },
    });
  });

  test("keeps malformed generated roots non-editable and on the integrity resolver path", () => {
    expect(
      classifyCollaborationActionItem({
        _id: "companion-broken" as never,
        canonicalBuildSubmilestoneId: undefined,
        parentActionItemId: undefined,
        systemMode: "generated_milestone_submilestone",
        systemPresentation: {
          bindingState: "invalid",
          column: "backlog",
          state: "unknown",
        },
      }),
    ).toMatchObject({
      editableGenericWorkflow: false,
      integrityState: "invalid",
      kind: "generated_submilestone",
      label: "Sub-milestone",
      target: {
        actionItemId: "companion-broken",
        kind: "actionItem",
      },
    });
  });

  test("accepts a known canonical projection from the previous backend during rollout", () => {
    expect(
      classifyCollaborationActionItem({
        _id: "companion-legacy-projection" as never,
        canonicalBuildSubmilestoneId: "submilestone-legacy" as never,
        systemMode: "generated_milestone_submilestone",
        systemPresentation: {
          column: "in_progress",
          state: "known",
        },
      }),
    ).toMatchObject({
      integrityState: "valid",
      target: {
        companionId: "companion-legacy-projection",
        kind: "submilestone",
        submilestoneId: "submilestone-legacy",
      },
    });
    expect(
      classifyCollaborationActionItem({
        _id: "companion-legacy-unknown" as never,
        canonicalBuildSubmilestoneId: "submilestone-legacy" as never,
        systemMode: "generated_milestone_submilestone",
        systemPresentation: {
          column: "backlog",
          state: "unknown",
        },
      }),
    ).toMatchObject({
      integrityState: "invalid",
      target: {
        actionItemId: "companion-legacy-unknown",
        kind: "actionItem",
      },
    });
  });

  test("distinguishes manual roots from child Action Items without changing generic workflow", () => {
    expect(
      classifyCollaborationActionItem({
        _id: "manual-root" as never,
        parentActionItemId: undefined,
        systemMode: undefined,
        systemPresentation: undefined,
      }),
    ).toMatchObject({
      editableGenericWorkflow: true,
      kind: "manual_action_item",
      label: "Action Item",
    });
    expect(
      classifyCollaborationActionItem({
        _id: "child-1" as never,
        parentActionItemId: "manual-root" as never,
        systemMode: undefined,
        systemPresentation: undefined,
      }),
    ).toMatchObject({
      editableGenericWorkflow: true,
      kind: "child_action_item",
      label: "Action Item",
    });
  });
});
