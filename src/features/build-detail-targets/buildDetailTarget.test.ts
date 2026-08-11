import { describe, expect, test } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";
import {
  focusForBuildDetailTarget,
  isBuildDetailFocusCandidate,
  parseBuildDetailFocus,
  sameBuildDetailTarget,
} from "./buildDetailTarget.ts";

describe("Build detail targets", () => {
  test("distinguishes malformed detail focus from other collaboration focus", () => {
    expect(isBuildDetailFocusCandidate("submilestone:")).toBe(true);
    expect(isBuildDetailFocusCandidate("material:material-01")).toBe(false);
  });

  test.each([
    ["milestone:milestone-01", "milestone"],
    ["submilestone:submilestone-01", "submilestone"],
    ["actionItem:action-01", "actionItem"],
  ] as const)("parses %s", (focus, kind) => {
    expect(parseBuildDetailFocus(focus)).toMatchObject({ kind });
  });

  test.each([undefined, "post:post-01", "milestone:", "milestone:a:b"])(
    "rejects non-detail focus %s",
    (focus) => expect(parseBuildDetailFocus(focus)).toBeUndefined(),
  );

  test("normalizes new canonical Sub-milestone links while retaining companion context", () => {
    expect(
      focusForBuildDetailTarget({
        companionId: "action-01" as Id<"buildActionItems">,
        kind: "submilestone",
        submilestoneId: "submilestone-01" as Id<"buildSubmilestones">,
      }),
    ).toBe("submilestone:submilestone-01");
  });

  test("compares the canonical and retained companion identities", () => {
    const target = {
      companionId: "action-01" as Id<"buildActionItems">,
      kind: "submilestone" as const,
      submilestoneId: "submilestone-01" as Id<"buildSubmilestones">,
    };
    expect(sameBuildDetailTarget(target, target)).toBe(true);
    expect(
      sameBuildDetailTarget(target, {
        ...target,
        companionId: "action-02" as Id<"buildActionItems">,
      }),
    ).toBe(false);
  });
});
