import { describe, expect, test } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import {
  pushBuildDetailHistory,
  reconcileBuildDetailHistory,
  resolveBuildDetailCloseNavigation,
} from "./useBuildDetailTargetController.ts";

const milestone = {
  kind: "milestone" as const,
  milestoneId: "milestone-01" as Id<"buildMilestones">,
};
const submilestone = {
  companionId: "action-01" as Id<"buildActionItems">,
  kind: "submilestone" as const,
  submilestoneId: "submilestone-01" as Id<"buildSubmilestones">,
};

describe("Build detail target history", () => {
  test("pushes typed targets and truncates the forward branch", () => {
    const first = pushBuildDetailHistory(
      { frames: [], index: -1, interactive: false },
      milestone,
      { focusSelector: "#milestone", scrollY: 120, selectedTab: "overview" },
    );
    const second = pushBuildDetailHistory(first, submilestone);
    const back = { ...second, index: 0 };
    const replacement = pushBuildDetailHistory(back, {
      actionItemId: "action-02" as Id<"buildActionItems">,
      kind: "actionItem",
    });
    expect(replacement.frames).toHaveLength(2);
    expect(replacement.frames[0]).toMatchObject({ scrollY: 120 });
    expect(replacement.frames[1]?.target.kind).toBe("actionItem");
  });

  test("reconciles browser back and forward without adding frames", () => {
    const history = pushBuildDetailHistory(
      pushBuildDetailHistory(
        { frames: [], index: -1, interactive: false },
        milestone,
      ),
      submilestone,
    );
    const back = reconcileBuildDetailHistory(
      history,
      "milestone:milestone-01",
      milestone,
    );
    expect(back.index).toBe(0);
    const forward = reconcileBuildDetailHistory(
      back,
      "actionItem:action-01",
      submilestone,
    );
    expect(forward.index).toBe(1);
    expect(forward.frames).toHaveLength(2);
  });

  test("keeps the current history object stable when resolution repeats", () => {
    const history = pushBuildDetailHistory(
      { frames: [], index: -1, interactive: false },
      submilestone,
    );
    expect(
      reconcileBuildDetailHistory(
        history,
        "actionItem:action-01",
        submilestone,
      ),
    ).toBe(history);
  });

  test("treats a direct deep link as a non-interactive session", () => {
    const direct = reconcileBuildDetailHistory(
      { frames: [], index: -1, interactive: false },
      "submilestone:submilestone-01",
      submilestone,
    );
    const nested = pushBuildDetailHistory(direct, milestone);
    expect(nested).toMatchObject({ index: 1, interactive: false });
    expect(resolveBuildDetailCloseNavigation(nested)).toEqual({
      replace: true,
    });
  });

  test("includes a pending nested target when restoring an interactive launch route", () => {
    const history = pushBuildDetailHistory(
      { frames: [], index: -1, interactive: false },
      milestone,
    );
    expect(resolveBuildDetailCloseNavigation(history, true)).toEqual({
      delta: -2,
      replace: false,
    });
  });

  test("clears protected history when focus is removed", () => {
    expect(
      reconcileBuildDetailHistory(
        pushBuildDetailHistory(
          { frames: [], index: -1, interactive: false },
          milestone,
        ),
        undefined,
        undefined,
      ),
    ).toEqual({ frames: [], index: -1, interactive: false });
  });
});
