import { describe, test } from "vitest";

const scopeModulePath = "./submilestone_scope_contracts.ts";
const scopeModules = import.meta.glob("./submilestone_scope_contracts.ts", {
  eager: true,
});

/**
 * SFG-01 deliberately lands before the canonical Scope schema and commands.
 *
 * These executable characterization guards assert the public exports planned
 * by SFG-02, SFG-03, and SFG-05. They are expected to fail in this checkout
 * because `submilestone_scope_contracts.ts` does not exist yet; they must
 * become ordinary fixture-backed Convex invariant tests as those tickets add
 * the schema and fluent-convex functions. No argument shape or test-only
 * lifecycle model is invented here.
 */
function assertScopeExportExists(functionName: string) {
  const scopeModule = scopeModules[scopeModulePath] as
    | Record<string, unknown>
    | undefined;
  if (!scopeModule) {
    throw new Error(
      `Missing canonical Scope module: ${scopeModulePath}. ` +
        `Implement SFG-02/SFG-03/SFG-05 before converting this characterization guard.`,
    );
  }
  if (!(functionName in scopeModule)) {
    throw new Error(
      `Missing canonical Scope export: ${scopeModulePath}#${functionName}.`,
    );
  }
}

describe("Sub-milestone Scope contract", () => {
  test.fails("updates one mutable v1 draft before Proposal submission", async () => {
    assertScopeExportExists("saveSubmilestoneScopeDraft");
  });

  test.fails("publishes and makes v1 effective with Proposal submission", async () => {
    assertScopeExportExists("publishSubmilestoneScopeRevision");
  });

  test.fails("creates at most one successor draft with the next version", async () => {
    assertScopeExportExists("createSubmilestoneScopeDraft");
  });

  test.fails("keeps published Scope content immutable", async () => {
    assertScopeExportExists("saveSubmilestoneScopeDraft");
  });

  test.fails("requires a change reason when publishing v2 or later", async () => {
    assertScopeExportExists("publishSubmilestoneScopeRevision");
  });

  test.fails("keeps the prior revision effective until required decisions pass", async () => {
    assertScopeExportExists("getSubmilestoneScopeHistory");
  });

  test.fails("records borrower acknowledgement and rejection per revision", async () => {
    assertScopeExportExists("acknowledgeSubmilestoneScopeRevision");
    assertScopeExportExists("rejectSubmilestoneScopeRevision");
  });

  test.fails("requires borrower acknowledgement and lender-admin approval after activation", async () => {
    assertScopeExportExists("approveSubmilestoneScopeRevision");
  });

  test.fails("allows only lender admins to override with an audit reason", async () => {
    assertScopeExportExists("overrideSubmilestoneScopeRevision");
  });

  test.fails("does not change Budget, schedule, assignments, Evidence, Draws, or execution state", async () => {
    assertScopeExportExists("publishSubmilestoneScopeRevision");
  });
});
