import { describe, expect, test } from "vitest";

import {
  canExcludeCollaborationRole,
  canCreateCustomCollaborationAudience,
  collaborationRoleTier,
  resolveCollaborationAudience,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";

describe("Build collaboration role hierarchy", () => {
  test("uses the highest active Build role and only permits downward audience restriction", () => {
    expect(
      resolveEffectiveCollaborationRole(["contractor", "builder-staff"]),
    ).toEqual({ role: "builder-staff", tier: 2 });
    expect(resolveEffectiveCollaborationRole(["builder", "admin"])).toEqual({
      role: "admin",
      tier: 5,
    });
    expect(collaborationRoleTier("homeowner")).toBe(
      collaborationRoleTier("builder-staff"),
    );

    expect(canExcludeCollaborationRole(["contractor"], "broker")).toBe(false);
    expect(canExcludeCollaborationRole(["contractor"], "contractor")).toBe(
      false,
    );
    expect(canExcludeCollaborationRole(["builder-staff"], "contractor")).toBe(
      true,
    );
    expect(canExcludeCollaborationRole(["builder-staff"], "homeowner")).toBe(
      false,
    );
    expect(canExcludeCollaborationRole(["builder"], "builder-staff")).toBe(true);
    expect(canExcludeCollaborationRole(["builder"], "broker")).toBe(false);
    expect(canExcludeCollaborationRole(["principle-broker"], "builder")).toBe(
      true,
    );
    expect(canExcludeCollaborationRole(["admin"], "principle-broker")).toBe(
      true,
    );
  });

  test("preserves mandatory peer and higher-tier readers when resolving a custom audience", () => {
    const participants = [
      { id: "principal", roles: ["principle-broker"] },
      { id: "broker", roles: ["broker"] },
      { id: "author", roles: ["builder-staff"] },
      { id: "homeowner", roles: ["homeowner"] },
      { id: "contractor", roles: ["contractor"] },
    ];

    expect(canCreateCustomCollaborationAudience(["builder-staff"])).toBe(true);
    expect(canCreateCustomCollaborationAudience(["homeowner"])).toBe(false);
    expect(canCreateCustomCollaborationAudience(["contractor"])).toBe(false);

    expect(
      resolveCollaborationAudience({
        authorId: "author",
        authorRoles: ["builder-staff"],
        participants,
        requestedReaderIds: ["contractor"],
      }),
    ).toEqual({
      excludedParticipantIds: [],
      mandatoryReaderIds: ["author", "broker", "homeowner", "principal"],
      readerIds: ["author", "broker", "contractor", "homeowner", "principal"],
      status: "allowed",
    });

    expect(
      resolveCollaborationAudience({
        authorId: "author",
        authorRoles: ["builder-staff"],
        entityAllowedParticipantIds: [
          "author",
          "homeowner",
          "contractor",
          "principal",
        ],
        participants,
        requestedReaderIds: ["contractor"],
      }),
    ).toEqual({
      conflictingMandatoryReaderIds: ["broker"],
      status: "blocked",
    });
  });
});
