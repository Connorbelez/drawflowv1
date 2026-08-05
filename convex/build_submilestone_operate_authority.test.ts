import { describe, expect, test } from "vitest";

import {
  normalizeOperateRoles,
  operateDenialMessage,
  type SubmilestoneOperateDenial,
} from "./build_submilestone_operate_authority";

describe("Sub-milestone operate authority helpers", () => {
  test("normalizes dual-role membership without collapsing to effective role", () => {
    expect(normalizeOperateRoles(["admin", "builder", "admin"])).toEqual([
      "admin",
      "builder",
    ]);
    expect(normalizeOperateRoles(["broker-staff", "principal-broker"])).toEqual(
      ["broker-staff", "principle-broker"]
    );
  });

  test("maps denials to permission-scoped copy rather than assignment language", () => {
    const cases: Array<[SubmilestoneOperateDenial, string]> = [
      [
        "permission_denied",
        "You do not have Sub-milestone update permission.",
      ],
      [
        "assignment_required",
        "Assign a tradesperson before a Contractor can start.",
      ],
      [
        "lender_review_only",
        "Review-only on this surface; field operate requires Builder or Admin authority.",
      ],
      ["already_started", "Work has already started on this Sub-milestone."],
      ["completed", "This Sub-milestone is already complete."],
    ];
    for (const [denial, message] of cases) {
      expect(operateDenialMessage(denial)).toBe(message);
      expect(message.toLowerCase()).not.toContain("assigned operator");
    }
  });

  test("treats admin in membership role mix as operate-capable identity", () => {
    expect(normalizeOperateRoles(["builder", "admin"])).toContain("admin");
    expect(normalizeOperateRoles(["builder", "admin"])).toContain("builder");
  });
});
