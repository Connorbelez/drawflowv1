import { describe, expect, test } from "vitest";

import { normalizeCostDocumentWorkingStateJson } from "./cost_document_working_state";

describe("Cost Document working state", () => {
  test("preserves exact incomplete monetary editor strings", () => {
    const normalized = normalizeCostDocumentWorkingStateJson(
      JSON.stringify({
        allocations: [
          {
            amount: "125.",
            buildSubmilestoneId: "submilestone-1",
            id: "allocation-local-1",
          },
        ],
        financialComponents: [
          {
            amount: "",
            id: "component-local-1",
            kind: "tax",
            label: "HST draft",
          },
        ],
        grossTotal: "1,250.",
        version: 1,
      })
    );

    expect(JSON.parse(normalized)).toEqual({
      allocations: [
        {
          amount: "125.",
          buildSubmilestoneId: "submilestone-1",
          id: "allocation-local-1",
        },
      ],
      financialComponents: [
        {
          amount: "",
          id: "component-local-1",
          kind: "tax",
          label: "HST draft",
        },
      ],
      grossTotal: "1,250.",
      version: 1,
    });
  });

  test.each([
    "not-json",
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      allocations: [],
      financialComponents: [],
      grossTotal: "0",
      version: 1,
      ignored: "field",
    }).replace('"financialComponents":[]', '"financialComponents":"bad"'),
    JSON.stringify({
      allocations: [],
      financialComponents: [
        { amount: "1", id: "component", kind: "other", label: "" },
      ],
      grossTotal: "1",
      version: 1,
    }),
    "x".repeat(32_001),
  ])("rejects malformed or unbounded snapshots", (value) => {
    expect(() => normalizeCostDocumentWorkingStateJson(value)).toThrow(
      "Cost Document working state"
    );
  });
});
