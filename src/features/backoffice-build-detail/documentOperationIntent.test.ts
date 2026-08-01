import { describe, expect, test } from "vitest";

import { DocumentOperationIntentRegistry } from "./documentOperationIntent.ts";

describe("DocumentOperationIntentRegistry", () => {
  test("retains one operation ID through retries and rotates after success", () => {
    let sequence = 0;
    const registry = new DocumentOperationIntentRegistry(
      () => `document-operation-${++sequence}`
    );
    const intent = {
      documentType: "permit" as const,
      fileName: "Building permit.pdf",
      supersedesDocumentId: "document-1",
    };

    const first = registry.keyFor(intent);
    expect(registry.keyFor({ ...intent })).toBe(first);

    registry.confirm(intent);
    expect(registry.keyFor(intent)).not.toBe(first);
  });

  test("does not collapse distinct versions or Document types", () => {
    let sequence = 0;
    const registry = new DocumentOperationIntentRegistry(
      () => `document-operation-${++sequence}`
    );

    const permit = registry.keyFor({
      documentType: "permit",
      fileName: "Permit.pdf",
    });
    const plan = registry.keyFor({
      documentType: "plan",
      fileName: "Permit.pdf",
    });
    const replacement = registry.keyFor({
      documentType: "permit",
      fileName: "Permit.pdf",
      supersedesDocumentId: "document-1",
    });

    expect(new Set([permit, plan, replacement]).size).toBe(3);
  });
});
