import { describe, expect, test } from "vitest";

type FieldGuidanceModule = {
  getSubmilestoneFieldGuidance?: unknown;
  saveSubmilestoneFieldGuidance?: unknown;
};

// SFG-02/SFG-04 have not introduced the canonical module yet. Keep these
// characterization checks executable without inventing a test-only table or
// API: once either named export exists, its `test.fails` check becomes an
// unexpected pass and must be replaced by a real Convex harness assertion.
const canonicalModules = import.meta.glob("./submilestone_field_guidance.ts", {
  eager: true,
});

function expectCanonicalExport(
  exportName: keyof FieldGuidanceModule,
): void {
  const module = canonicalModules["./submilestone_field_guidance.ts"] as
    | FieldGuidanceModule
    | undefined;
  expect(module, "SFG-04 canonical Field Guidance module is not present").toBeDefined();
  expect(
    module?.[exportName],
    `SFG-04 must export ${exportName} as a public Convex function`,
  ).toEqual(expect.anything());
}

describe("Sub-milestone Field Guidance", () => {
  test.fails(
    "stores verification guidance separately from contractual Scope",
    () => expectCanonicalExport("getSubmilestoneFieldGuidance"),
  );
  test.fails(
    "stores recommended camera angles as a separate rich-text field",
    () => expectCanonicalExport("getSubmilestoneFieldGuidance"),
  );
  test.fails(
    "replaces canonical guidance only after an explicit save",
    () => expectCanonicalExport("saveSubmilestoneFieldGuidance"),
  );
  test.fails(
    "allows empty planning values and reports Site Visit readiness separately",
    () => expectCanonicalExport("getSubmilestoneFieldGuidance"),
  );
  test.fails(
    "does not create revision or audit-history rows for guidance saves",
    () => expectCanonicalExport("saveSubmilestoneFieldGuidance"),
  );
  test.fails(
    "limits assigned-contractor reads to authorized Build records",
    () => expectCanonicalExport("getSubmilestoneFieldGuidance"),
  );
});
