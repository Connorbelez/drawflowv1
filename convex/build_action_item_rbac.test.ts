import { describe, expect, test } from "vitest";

import {
  type BuildActionItemRbacActor,
  type BuildActionItemRbacItem,
  authorizeBuildActionItemOperation,
} from "./build_action_item_rbac";
import {
  type BuildCollaborationRole,
  buildCollaborationRoles,
  collaborationRoleTier,
} from "./build_collaboration_model";

const baseItem: BuildActionItemRbacItem = {
  assignedByWorkosUserId: "assigner",
  assigneeWorkosUserId: "assignee",
  assignmentState: "assigned",
  creatorRole: "builder",
  creatorWorkosUserId: "creator",
  requiresAcceptance: false,
  status: "in_progress",
};

function actor(
  role: BuildCollaborationRole,
  workosUserId = `reader-${role}`
): BuildActionItemRbacActor {
  return { role, workosUserId };
}

describe("Build Action Item operation RBAC", () => {
  test.each(buildCollaborationRoles)(
    "%s may create from a readable post but read access grants no existing-item mutation authority",
    (role) => {
      const existingItem = { ...baseItem, creatorRole: "admin" as const };
      expect(
        authorizeBuildActionItemOperation({
          actor: actor(role),
          item: existingItem,
          operation: "create",
        }).allowed
      ).toBe(true);
      const mayCoordinateAdminWork = role === "admin";
      for (const operation of [
        "edit_fields",
        "add_checklist",
        "toggle_checklist",
        "link_relation",
      ] as const) {
        expect(
          authorizeBuildActionItemOperation({
            actor: actor(role),
            item: existingItem,
            operation,
          }).allowed
        ).toBe(mayCoordinateAdminWork);
      }
      expect(
        authorizeBuildActionItemOperation({
          actor: actor(role),
          item: existingItem,
          operation: "transition",
        }).allowed
      ).toBe(false);
      expect(
        authorizeBuildActionItemOperation({
          actor: actor(role),
          item: existingItem,
          operation: "complete",
        }).allowed
      ).toBe(false);
    }
  );

  test.each(buildCollaborationRoles)(
    "%s receives creator, assignee, and assigning-authority capabilities independently",
    (role) => {
      const creator = actor(role, "creator");
      const assignee = actor(role, "assignee");
      const assigner = actor(role, "assigner");

      expect(
        authorizeBuildActionItemOperation({
          actor: creator,
          item: baseItem,
          operation: "edit_fields",
        })
      ).toMatchObject({ allowed: true, authority: "creator" });
      expect(
        authorizeBuildActionItemOperation({
          actor: assignee,
          item: baseItem,
          operation: "complete",
        })
      ).toMatchObject({ allowed: true, authority: "assignee" });
      expect(
        authorizeBuildActionItemOperation({
          actor: assignee,
          item: baseItem,
          operation: "edit_fields",
        }).allowed
      ).toBe(false);
      expect(
        authorizeBuildActionItemOperation({
          actor: assigner,
          item: { ...baseItem, requiresAcceptance: true, status: "in_review" },
          operation: "complete",
        })
      ).toMatchObject({ allowed: true, authority: "assigning_authority" });
    }
  );

  test.each(buildCollaborationRoles)(
    "%s can self-assign unassigned work and creator assignments respect hierarchy",
    (role) => {
      const currentActor = actor(role, "creator");
      const unassigned = {
        ...baseItem,
        assigneeWorkosUserId: undefined,
        assignedByWorkosUserId: undefined,
        assignmentState: "unassigned" as const,
        creatorRole: role,
        creatorWorkosUserId: "someone-else",
      };
      expect(
        authorizeBuildActionItemOperation({
          actor: currentActor,
          item: unassigned,
          operation: "assign",
          targetAssignee: {
            role,
            workosUserId: currentActor.workosUserId,
          },
        })
      ).toMatchObject({ allowed: true, authority: "reader" });

      const creatorOwned = {
        ...unassigned,
        creatorWorkosUserId: currentActor.workosUserId,
      };
      const upwardRole = buildCollaborationRoles.find(
        (candidate) =>
          collaborationRoleTier(candidate) > collaborationRoleTier(role)
      );
      if (upwardRole) {
        expect(
          authorizeBuildActionItemOperation({
            actor: currentActor,
            item: creatorOwned,
            operation: "assign",
            targetAssignee: {
              role: upwardRole,
              workosUserId: "upward-target",
            },
          })
        ).toMatchObject({
          allowed: true,
          authority: "creator",
          warning: "assignment_requested",
        });
      }
      const lateralRole = buildCollaborationRoles.find(
        (candidate) =>
          collaborationRoleTier(candidate) === collaborationRoleTier(role)
      );
      expect(
        authorizeBuildActionItemOperation({
          actor: currentActor,
          item: creatorOwned,
          operation: "assign",
          targetAssignee: {
            role: lateralRole ?? role,
            workosUserId: "lateral-target",
          },
        })
      ).toMatchObject({ allowed: true, authority: "creator" });
    }
  );

  test("only the requested assignee accepts, and governed completion remains with the assigner or responsible coordinator", () => {
    const requested = {
      ...baseItem,
      assignmentState: "requested" as const,
      requiresAcceptance: true,
      status: "in_review" as const,
    };
    expect(
      authorizeBuildActionItemOperation({
        actor: actor("contractor", "assignee"),
        item: requested,
        operation: "accept_assignment",
      })
    ).toMatchObject({ allowed: true, authority: "assignee" });
    expect(
      authorizeBuildActionItemOperation({
        actor: actor("contractor", "creator"),
        item: requested,
        operation: "accept_assignment",
      }).allowed
    ).toBe(false);
    expect(
      authorizeBuildActionItemOperation({
        actor: actor("builder", "assigner"),
        item: requested,
        operation: "complete",
      })
    ).toMatchObject({ allowed: true, authority: "assigning_authority" });
  });

  test("reopen authority is limited to the creator or a strictly higher-tier coordinator", () => {
    const done = { ...baseItem, status: "done" as const };
    expect(
      authorizeBuildActionItemOperation({
        actor: actor("builder", "creator"),
        item: done,
        operation: "reopen",
      }).allowed
    ).toBe(true);
    expect(
      authorizeBuildActionItemOperation({
        actor: actor("broker", "other-broker"),
        item: done,
        operation: "reopen",
      }).allowed
    ).toBe(false);
    expect(
      authorizeBuildActionItemOperation({
        actor: actor("principle-broker", "principal"),
        item: done,
        operation: "reopen",
      }).allowed
    ).toBe(true);
  });

  test("legacy items with no creator role fail closed for every coordinator below Admin", () => {
    const legacyItem = {
      ...baseItem,
      creatorRole: undefined,
      creatorWorkosUserId: "removed-legacy-creator",
    };
    for (const role of [
      "principle-broker",
      "broker",
      "builder",
      "broker-staff",
      "builder-staff",
    ] as const) {
      expect(
        authorizeBuildActionItemOperation({
          actor: actor(role),
          item: legacyItem,
          operation: "edit_fields",
        }).allowed
      ).toBe(false);
    }
    expect(
      authorizeBuildActionItemOperation({
        actor: actor("admin"),
        item: legacyItem,
        operation: "edit_fields",
      }).allowed
    ).toBe(true);
  });
});
