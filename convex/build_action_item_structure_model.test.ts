import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { wouldCreateActionItemDependencyCycle } from "./build_action_item_structure_model";

describe("Action Item dependency graph", () => {
  test("rejects every generated back-edge across a directed dependency chain", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ max: 1000, min: 0 }), {
          maxLength: 30,
          minLength: 2,
        }),
        (nodes) => {
          const edges = nodes.slice(1).map((target, index) => ({
            source: String(nodes[index]),
            target: String(target),
          }));
          expect(
            wouldCreateActionItemDependencyCycle(
              edges,
              String(nodes.at(-1)),
              String(nodes[0])
            )
          ).toBe(true);
        }
      ),
      { numRuns: 250 }
    );
  });

  test("accepts generated forward shortcuts and rejects self-links", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ max: 1000, min: 0 }), {
          maxLength: 30,
          minLength: 2,
        }),
        (nodes) => {
          const edges = nodes.slice(1).map((target, index) => ({
            source: String(nodes[index]),
            target: String(target),
          }));
          expect(
            wouldCreateActionItemDependencyCycle(
              edges,
              String(nodes[0]),
              String(nodes.at(-1))
            )
          ).toBe(false);
          expect(
            wouldCreateActionItemDependencyCycle(
              edges,
              String(nodes[0]),
              String(nodes[0])
            )
          ).toBe(true);
        }
      ),
      { numRuns: 250 }
    );
  });
});
