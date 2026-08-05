import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { assistantMutationActionKeys } from "./assistantActionCatalog";

function backendMutationActionKeys() {
  const source = readFileSync(resolve("convex/assistant.ts"), "utf8");
  const match = source.match(
    /const MUTATION_ACTION_KEYS = \[([\s\S]*?)\] as const;/
  );
  if (!match) {
    throw new Error("Could not locate the Convex assistant mutation catalog.");
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

describe("assistant action catalog", () => {
  test("keeps the frontend and Convex mutation catalogs in exact parity", () => {
    expect(assistantMutationActionKeys).toEqual(backendMutationActionKeys());
  });

  test("does not expose the retired active-Build Notes action", () => {
    expect(assistantMutationActionKeys).not.toContain("add_active_build_note");
  });
});
