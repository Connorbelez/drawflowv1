import { describe, expect, test } from "vitest";

import {
  buildCanonicalContractorProfileInsert,
  buildCanonicalContractorProfilePatch,
} from "./contractor_profile_application";
import type { Doc, Id } from "./types";

const brokerageId = "brokerage-1" as Id<"brokerages">;

function contractor(
  overrides: Partial<Doc<"contractorProfiles">> = {}
): Doc<"contractorProfiles"> {
  return {
    _creationTime: 1,
    _id: "contractor-1" as Id<"contractorProfiles">,
    brokerageId,
    createdAt: 1,
    email: "old@example.com",
    name: "Existing Contractor",
    normalizedEmail: "old@example.com",
    organizationId: "org-1",
    status: "active",
    trades: [],
    updatedAt: 1,
    ...overrides,
  };
}

describe("contractor profile application", () => {
  test("constructs one organization-scoped canonical profile shape", () => {
    expect(
      buildCanonicalContractorProfileInsert({
        brokerageId,
        fields: {
          email: "  Builder@Example.COM ",
          name: "  Northern Concrete  ",
        },
        now: 42,
        organizationId: " org-1 ",
      })
    ).toEqual({
      brokerageId,
      createdAt: 42,
      email: "Builder@Example.COM",
      name: "Northern Concrete",
      normalizedEmail: "builder@example.com",
      organizationId: "org-1",
      status: "active",
      trades: [],
      updatedAt: 42,
    });
  });

  test("rejects an adapter-supplied normalized email that disagrees", () => {
    expect(() =>
      buildCanonicalContractorProfileInsert({
        brokerageId,
        fields: {
          email: "builder@example.com",
          name: "Builder",
          normalizedEmail: "different@example.com",
        },
        now: 42,
        organizationId: "org-1",
      })
    ).toThrow("normalized email is inconsistent");
  });

  test("keeps email normalization and update timestamp local to profile patches", () => {
    expect(
      buildCanonicalContractorProfilePatch(
        contractor(),
        { email: " NEW@Example.com ", name: " Updated Builder " },
        99
      )
    ).toEqual({
      email: "NEW@Example.com",
      name: "Updated Builder",
      normalizedEmail: "new@example.com",
      updatedAt: 99,
    });
  });
});
