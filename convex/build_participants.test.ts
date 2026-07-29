/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type BuildCollaborationRole,
  buildCollaborationRoles,
} from "./build_collaboration_model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_participant_lifecycle";

function withIdentity(
  testInstance: ReturnType<typeof convexTest>,
  input: {
    organizationId?: string;
    role: BuildCollaborationRole;
    subject: string;
  }
) {
  return testInstance.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId: input.organizationId ?? ORGANIZATION_ID,
    role: input.role,
    roles: [input.role],
    subject: input.subject,
    tokenIdentifier: `https://api.workos.com/|${input.subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedParticipantLifecycleBuilds() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, {
    role: "admin",
    subject: "user_admin",
  });
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const buildIds = await admin.run(async (ctx) => {
    const now = Date.now();
    const createBuild = async (suffix: string) => {
      const proposalId = await ctx.db.insert("buildProposals", {
        assignedBrokerWorkosUserId: "user_broker",
        brokerageId: foundation.brokerageId,
        borrowerCoPayBps: 0,
        borrowerWorkingCapitalLimitCents: 500_000_00,
        buildName: `Participant Lifecycle Build ${suffix}`,
        builderProfileId: foundation.builderProfileId,
        createdAt: now,
        createdByWorkosUserId: "user_admin",
        lenderDrawPolicyLimitCents: 1_000_000_00,
        location: `${suffix} Cedar Ridge Road`,
        organizationId: ORGANIZATION_ID,
        reviewOutcome: "approved",
        status: "approved",
        templateId: foundation.templateId,
        totalBudgetCents: 2_400_000_00,
        updatedAt: now,
        updatedByWorkosUserId: "user_admin",
      });
      const workflowRuleSnapshotId = await ctx.db.insert(
        "workflowRuleSnapshots",
        {
          allowPermitWaiverByRoles: ["admin"],
          brokerageId: foundation.brokerageId,
          createdAt: now,
          organizationId: ORGANIZATION_ID,
          proposalId,
          proposalStates: ["draft", "submitted", "approved", "closed"],
          requirePermitForApproval: false,
          ruleKey: "default",
          settings: {},
          version: 1,
          workflowRuleId: foundation.workflowRuleId,
        }
      );
      const buildId = await ctx.db.insert("activeBuilds", {
        brokerageId: foundation.brokerageId,
        buildName: `Participant Lifecycle Build ${suffix}`,
        builderProfileId: foundation.builderProfileId,
        createdAt: now,
        location: `${suffix} Cedar Ridge Road`,
        organizationId: ORGANIZATION_ID,
        proposalId,
        startDate: "2026-07-29",
        status: "active",
        totalBudgetCents: 2_400_000_00,
        updatedAt: now,
        workflowRuleSnapshotId,
      });
      await ctx.db.patch(proposalId, {
        activeBuildId: buildId,
        workflowRuleSnapshotId,
      });
      return buildId;
    };
    const first = await createBuild("A");
    const second = await createBuild("B");
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "user_admin",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
    return [first, second] as const;
  });
  return {
    admin,
    base,
    buildId: buildIds[0],
    secondBuildId: buildIds[1],
  };
}

function publicationInput(
  buildId: Id<"activeBuilds">,
  input: {
    audienceMode?: "author_tier_and_higher" | "build_wide" | "custom";
    plainText: string;
    requestedReaderIds?: string[];
  }
) {
  return {
    actionItems: [],
    audienceMode: input.audienceMode ?? "build_wide",
    buildId,
    organizationId: ORGANIZATION_ID,
    plainText: input.plainText,
    postType: "update" as const,
    references: [],
    requestedReaderIds: input.requestedReaderIds ?? [],
    tiptapJson: JSON.stringify({
      content: [
        {
          content: [{ text: input.plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    }),
  };
}

async function readFeed(
  actor: ReturnType<typeof withIdentity>,
  buildId: Id<"activeBuilds">
) {
  return await actor.query(
    (api as any).build_collaboration.listBuildCollaborationFeed,
    {
      buildId,
      organizationId: ORGANIZATION_ID,
      paginationOpts: { cursor: null, numItems: 20 },
    }
  );
}

describe("Build participant lifecycle and role-complete access", () => {
  test("Admin and Principal Broker have organization-wide Build authority without per-Build grants", async () => {
    const fixture = await seedParticipantLifecycleBuilds();
    const principal = withIdentity(fixture.base, {
      role: "principle-broker",
      subject: "user_principal",
    });

    for (const actor of [fixture.admin, principal]) {
      for (const buildId of [fixture.buildId, fixture.secondBuildId]) {
        await expect(
          actor.query(
            (api as any).build_collaboration_rollout
              .getBuildCollaborationRolloutState,
            { buildId, organizationId: ORGANIZATION_ID }
          )
        ).resolves.toMatchObject({ available: true });
      }
    }

    const principalGrantCount = await fixture.base.run(async (ctx) => {
      const grants = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_principal")
        )
        .collect();
      return grants.length;
    });
    expect(principalGrantCount).toBe(0);
  });

  test("invite, acceptance, removal, and reinvitation preserve immutable periods and immediately revoke access", async () => {
    const fixture = await seedParticipantLifecycleBuilds();
    const homeowner = withIdentity(fixture.base, {
      organizationId: "external_homeowner_org",
      role: "homeowner",
      subject: "user_homeowner",
    });
    const builder = withIdentity(fixture.base, {
      role: "builder",
      subject: "user_builder_coordinator",
    });
    await fixture.admin.mutation(
      (api as any).build_participants.inviteBuildParticipant,
      {
        buildId: fixture.buildId,
        displayName: "Home Owner",
        organizationId: ORGANIZATION_ID,
        role: "homeowner",
        workosUserId: "user_homeowner",
      }
    );
    const builderParticipantId = await fixture.admin.mutation(
      (api as any).build_participants.inviteBuildParticipant,
      {
        buildId: fixture.buildId,
        displayName: "Builder Coordinator",
        organizationId: ORGANIZATION_ID,
        role: "builder",
        workosUserId: "user_builder_coordinator",
      }
    );
    await homeowner.mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    await builder.mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );

    const visiblePostId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      publicationInput(fixture.buildId, {
        plainText: "A Build-wide coordination update.",
      })
    );
    const authoredPostId = await homeowner.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      publicationInput(fixture.buildId, {
        audienceMode: "author_tier_and_higher",
        plainText: "Homeowner decision before removal.",
      })
    );
    await homeowner.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: visiblePostId,
      }
    );
    const actionItemId = await fixture.admin.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        assigneeWorkosUserId: "user_homeowner",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: visiblePostId,
        title: "Confirm the exterior finish",
      }
    );

    const firstPeriod = await fixture.admin.query(
      (api as any).build_participants.listBuildParticipantHistory,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    const homeownerPeriod = firstPeriod.find(
      (participant: any) =>
        participant.workosUserId === "user_homeowner"
    );
    await fixture.admin.mutation(
      (api as any).build_participants.removeBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        participantId: homeownerPeriod.participantId,
        reason: "Homeowner participation transferred.",
      }
    );

    await expect(readFeed(homeowner, fixture.buildId)).rejects.toThrow(
      "Forbidden: active build participation revoked"
    );
    await expect(
      homeowner.mutation(
        (api as any).build_collaboration_threads
          .markBuildCollaborationPostViewed,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: visiblePostId,
        }
      )
    ).rejects.toThrow("Forbidden: active build participation revoked");

    const afterRemoval = await fixture.base.run(async (ctx) => {
      const actionItem = await ctx.db.get(
        actionItemId as Id<"buildActionItems">
      );
      const authoredPost = await ctx.db.get(
        authoredPostId as Id<"buildCollaborationPosts">
      );
      const follows = await ctx.db
        .query("buildCollaborationFollows")
        .withIndex("by_buildId_and_workosUserId_and_active", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "user_homeowner")
            .eq("active", true)
        )
        .collect();
      const builderNotices = await ctx.db
        .query("recipientDeliveries")
        .filter((query) =>
          query.and(
            query.eq(
              query.field("recipientWorkosUserId"),
              "user_builder_coordinator"
            ),
            query.eq(query.field("entityType"), "buildParticipant")
          )
        )
        .collect();
      return { actionItem, authoredPost, builderNotices, follows };
    });
    expect(afterRemoval.actionItem).toMatchObject({
      assignmentState: "unassigned",
      requiresAcceptance: false,
      unassignmentReason: "participant_removed",
    });
    expect(afterRemoval.actionItem).not.toHaveProperty(
      "assigneeWorkosUserId"
    );
    expect(afterRemoval.authoredPost).toMatchObject({
      authorDisplayNameSnapshot: "Home Owner",
      authorRole: "homeowner",
      authorWorkosUserId: "user_homeowner",
    });
    expect(afterRemoval.follows).toEqual([]);
    expect(afterRemoval.builderNotices).toHaveLength(1);
    expect(afterRemoval.builderNotices[0]).toMatchObject({
      actionRequired: true,
      status: "unread",
    });

    const secondPeriodId = await fixture.admin.mutation(
      (api as any).build_participants.reinviteBuildParticipant,
      {
        buildId: fixture.buildId,
        displayName: "Home Owner",
        organizationId: ORGANIZATION_ID,
        role: "homeowner",
        workosUserId: "user_homeowner",
      }
    );
    await expect(readFeed(homeowner, fixture.buildId)).rejects.toThrow(
      "Forbidden:"
    );
    await homeowner.mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(readFeed(homeowner, fixture.buildId)).resolves.toBeDefined();

    const history = await fixture.admin.query(
      (api as any).build_participants.listBuildParticipantHistory,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    expect(
      history
        .filter(
          (participant: any) =>
            participant.workosUserId === "user_homeowner"
        )
        .map((participant: any) => ({
          id: participant.participantId,
          period: participant.participationPeriod,
          status: participant.status,
        }))
    ).toEqual([
      { id: secondPeriodId, period: 2, status: "active" },
      {
        id: homeownerPeriod.participantId,
        period: 1,
        status: "removed",
      },
    ]);

    const auditEventTypes = await fixture.base.run(async (ctx) =>
      (await ctx.db.query("auditEvents").collect())
        .filter((event) => event.entityType === "buildParticipant")
        .map((event) => event.eventType)
    );
    expect(auditEventTypes).toEqual(
      expect.arrayContaining([
        "build.participant.invited",
        "build.participant.accepted",
        "build.participant.removed",
        "build.participant.reinvited",
      ])
    );
    expect(builderParticipantId).toBeTruthy();
  });

  test("every approved persona receives the same feed contract with role-safe placeholders, actions, receipts, and tag references", async () => {
    const fixture = await seedParticipantLifecycleBuilds();
    const roleActors = new Map<
      BuildCollaborationRole,
      ReturnType<typeof withIdentity>
    >();
    roleActors.set("admin", fixture.admin);
    roleActors.set(
      "principle-broker",
      withIdentity(fixture.base, {
        role: "principle-broker",
        subject: "persona_principle_broker",
      })
    );

    for (const role of buildCollaborationRoles.filter(
      (candidate) =>
        candidate !== "admin" && candidate !== "principle-broker"
    )) {
      const subject = `persona_${role.replaceAll("-", "_")}`;
      const actor = withIdentity(fixture.base, { role, subject });
      roleActors.set(role, actor);
      await fixture.admin.mutation(
        (api as any).build_participants.inviteBuildParticipant,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          role,
          workosUserId: subject,
        }
      );
      await actor.mutation(
        (api as any).build_participants.acceptBuildParticipantInvitation,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      );
    }

    const visiblePostId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      publicationInput(fixture.buildId, {
        plainText: "Visible to every Build participant.",
      })
    );
    await fixture.admin.mutation(
      (api as any).build_action_items.createBuildActionItem,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        postId: visiblePostId,
        title: "Shared Build action",
      }
    );
    await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      publicationInput(fixture.buildId, {
        audienceMode: "custom",
        plainText: "Admin-only governance note.",
        requestedReaderIds: [],
      })
    );

    for (const [role, actor] of roleActors) {
      await actor.mutation(
        (api as any).build_collaboration_threads
          .markBuildCollaborationPostViewed,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          postId: visiblePostId,
        }
      );
      const feed = await readFeed(actor, fixture.buildId);
      const visible = feed.page.find(
        (item: any) => item.kind === "post" && item.post._id === visiblePostId
      );
      expect(visible?.actionItems).toHaveLength(1);
      if (role === "admin") {
        expect(feed.page.filter((item: any) => item.kind === "post")).toHaveLength(
          2
        );
      } else {
        expect(
          feed.page.some((item: any) => item.kind === "restricted")
        ).toBe(true);
      }
      const tagOptions = await actor.query(
        (api as any).build_collaboration_references
          .listBuildCollaborationTagOptions,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      );
      expect(
        tagOptions.some(
          (option: any) =>
            option.entityKind === "participant" ||
            option.entityKind === "actionItem"
        )
      ).toBe(true);
    }

    const adminFeed = await readFeed(fixture.admin, fixture.buildId);
    const visibleForAdmin = adminFeed.page.find(
      (item: any) => item.kind === "post" && item.post._id === visiblePostId
    );
    expect(visibleForAdmin.receipts).toEqual(
      expect.arrayContaining(
        buildCollaborationRoles
          .filter((role) => role !== "admin")
          .map((role) =>
            expect.objectContaining({
              viewerRole: role,
            })
          )
      )
    );

    const ungrantedContractor = withIdentity(fixture.base, {
      role: "contractor",
      subject: "persona_ungranted_contractor",
    });
    await expect(
      readFeed(ungrantedContractor, fixture.buildId)
    ).rejects.toThrow("Forbidden: active build participation");
  });

  test("participant managers cannot grant or remove peers above their hierarchy tier", async () => {
    const fixture = await seedParticipantLifecycleBuilds();
    const builder = withIdentity(fixture.base, {
      role: "builder",
      subject: "manager_builder",
    });
    await fixture.admin.mutation(
      (api as any).build_participants.inviteBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        role: "builder",
        workosUserId: "manager_builder",
      }
    );
    await builder.mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      }
    );

    await expect(
      builder.mutation(
        (api as any).build_participants.inviteBuildParticipant,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          role: "broker",
          workosUserId: "attempted_broker",
        }
      )
    ).rejects.toThrow(
      "Participant managers may manage only lower-tier Build roles."
    );
    await expect(
      builder.mutation(
        (api as any).build_participants.inviteBuildParticipant,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          role: "contractor",
          workosUserId: "managed_contractor",
        }
      )
    ).resolves.toBeTruthy();
  });
});
