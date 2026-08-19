/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
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
  const workosRole = input.role === "homeowner" ? "member" : input.role;
  return testInstance.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId: input.organizationId ?? ORGANIZATION_ID,
    role: workosRole,
    roles: [workosRole],
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
    (internal as any).production_proposals.dev_seedProductionFoundation,
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

    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const now = Date.now();
      for (const participant of [
        { role: "admin" as const, subject: "user_admin" },
        {
          role: "principle-broker" as const,
          subject: "user_principal",
        },
      ]) {
        await ctx.db.insert("buildParticipants", {
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now,
          displayNameSnapshot: participant.subject,
          organizationId: ORGANIZATION_ID,
          participationPeriod: 1,
          removedAt: now,
          role: participant.role,
          status: "removed",
          updatedAt: now,
          validFrom: now,
          validUntil: now,
          workosUserId: participant.subject,
        });
      }
    });
    for (const actor of [fixture.admin, principal]) {
      await expect(readFeed(actor, fixture.buildId)).resolves.toBeDefined();
    }
  });

  test("resolves an exact broker assignment beyond large Build assignment sets", async () => {
    const fixture = await seedParticipantLifecycleBuilds();
    const supportBroker = withIdentity(fixture.base, {
      role: "broker",
      subject: "user_support_broker",
    });
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const now = Date.now();
      for (let index = 0; index < 60; index += 1) {
        await ctx.db.insert("buildBrokerAssignments", {
          assignedBrokerWorkosUserId: `decoy_broker_${index}`,
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now + index,
          organizationId: ORGANIZATION_ID,
          role: "support",
        });
      }
      await ctx.db.insert("buildBrokerAssignments", {
        assignedBrokerWorkosUserId: "user_support_broker",
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now + 60,
        organizationId: ORGANIZATION_ID,
        role: "support",
      });
    });

    await expect(readFeed(supportBroker, fixture.buildId)).resolves.toBeDefined();
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
    await expect(
      homeowner.query(
        (api as any).build_participants.getMyBuildParticipationScope,
        { buildId: fixture.buildId }
      )
    ).resolves.toMatchObject({
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      role: "homeowner",
    });
    await expect(
      homeowner.query(
        (api as any).build_participants.getMyBuildParticipationScope,
        { buildId: fixture.buildId, workspaceRole: "contractor" }
      )
    ).resolves.toBeNull();
    await expect(
      homeowner.query(
        (api as any).build_participants.listMyActiveBuildParticipations,
        {}
      )
    ).resolves.toEqual([
      expect.objectContaining({
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        role: "homeowner",
      }),
    ]);
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
    for (const source of [
      "static",
      "participants",
      "builder-links",
      "broker-assignments",
      "tenant-memberships",
    ] as const) {
      await fixture.base.mutation(
        (internal as any).build_participant_revocation_notifications
          .continueParticipantRevocationNotifications,
        {
          actionItemCount: 1,
          batchKey: actionItemId,
          cursor: null,
          participantId: homeownerPeriod.participantId,
          source,
        }
      );
    }

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
      const assignedBrokerNotices = await ctx.db
        .query("recipientDeliveries")
        .filter((query) =>
          query.and(
            query.eq(query.field("recipientWorkosUserId"), "user_broker"),
            query.eq(query.field("entityType"), "buildParticipant")
          )
        )
        .collect();
      return {
        actionItem,
        assignedBrokerNotices,
        authoredPost,
        builderNotices,
        follows,
      };
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
    expect(afterRemoval.assignedBrokerNotices).toHaveLength(1);
    expect(afterRemoval.assignedBrokerNotices[0]).toMatchObject({
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
      ungrantedContractor.query(
        (api as any).build_participants.getMyBuildParticipationScope,
        { buildId: fixture.buildId, workspaceRole: "contractor" }
      )
    ).resolves.toBeNull();
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

  test("newest participation lookup remains correct beyond one hundred immutable periods", async () => {
    const fixture = await seedParticipantLifecycleBuilds();
    const subject = "user_many_periods";
    const invitedPeriodId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const now = Date.now();
      for (let period = 1; period <= 100; period += 1) {
        await ctx.db.insert("buildParticipants", {
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now + period,
          displayNameSnapshot: "Long-running participant",
          organizationId: ORGANIZATION_ID,
          participationPeriod: period,
          removedAt: now + period,
          role: "contractor",
          status: "removed",
          updatedAt: now + period,
          validFrom: now + period,
          validUntil: now + period,
          workosUserId: subject,
        });
      }
      return await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now + 101,
        displayNameSnapshot: "Long-running participant",
        organizationId: ORGANIZATION_ID,
        participationPeriod: 101,
        role: "contractor",
        status: "invited",
        updatedAt: now + 101,
        validFrom: now + 101,
        workosUserId: subject,
      });
    });
    const contractor = withIdentity(fixture.base, {
      role: "contractor",
      subject,
    });

    await expect(
      contractor.mutation(
        (api as any).build_participants.acceptBuildParticipantInvitation,
        { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
      )
    ).resolves.toBe(invitedPeriodId);
    await expect(
      contractor.query(
        (api as any).build_participants.getMyBuildParticipationScope,
        { buildId: fixture.buildId }
      )
    ).resolves.toMatchObject({
      participantId: invitedPeriodId,
      role: "contractor",
    });
    await expect(
      contractor.query(
        (api as any).build_participants.getMyBuildParticipationScope,
        { buildId: fixture.buildId, workspaceRole: "homeowner" }
      )
    ).resolves.toBeNull();
  });

  test("large revocations are resumable and certified only after every follow and assignment is cleaned", async () => {
    const fixture = await seedParticipantLifecycleBuilds();
    const subject = "user_revocation_batch";
    const contractor = withIdentity(fixture.base, {
      role: "contractor",
      subject,
    });
    const participantId = await fixture.admin.mutation(
      (api as any).build_participants.inviteBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        role: "contractor",
        workosUserId: subject,
      }
    );
    await contractor.mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    const postId = await fixture.admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      publicationInput(fixture.buildId, {
        plainText: "Revocation cleanup parent.",
      })
    );
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const now = Date.now();
      for (let index = 0; index < 45; index += 1) {
        await ctx.db.insert("buildCollaborationFollows", {
          active: true,
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now + index,
          organizationId: ORGANIZATION_ID,
          postId,
          reason: "manual",
          updatedAt: now + index,
          workosUserId: subject,
        });
        await ctx.db.insert("buildActionItems", {
          assigneeWorkosUserId: subject,
          assignedByWorkosUserId: "user_admin",
          assignmentState: "assigned",
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now + index,
          creatorRole: "admin",
          creatorWorkosUserId: "user_admin",
          currentRevision: 1,
          descriptionPlainText: "",
          descriptionTiptapJson: JSON.stringify({
            content: [],
            type: "doc",
          }),
          originatingPostId: postId,
          organizationId: ORGANIZATION_ID,
          priority: "none",
          requiresAcceptance: false,
          status: "todo",
          title: `Batch assignment ${index + 1}`,
          updatedAt: now + index,
        });
      }
    });

    await fixture.admin.mutation(
      (api as any).build_participants.removeBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        participantId,
        reason: "Contractor removed from the Build.",
      }
    );
    const pending = await fixture.base.run(
      async (ctx) => await ctx.db.get(participantId)
    );
    expect(pending).toMatchObject({
      revocationCleanupStatus: "pending",
      status: "removed",
    });
    await expect(
      fixture.admin.mutation(
        (api as any).build_participants.reinviteBuildParticipant,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          role: "contractor",
          workosUserId: subject,
        }
      )
    ).rejects.toThrow("revocation cleanup is still pending");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await fixture.base.mutation(
        (internal as any).build_participant_revocation
          .continueBuildParticipantRevocationCleanup,
        {
          actorRole: "admin",
          actorWorkosUserId: "user_admin",
          participantId,
          reason: "Contractor removed from the Build.",
        }
      );
    }

    const cleaned = await fixture.base.run(async (ctx) => {
      const participant = await ctx.db.get(participantId);
      const follows = await ctx.db
        .query("buildCollaborationFollows")
        .withIndex("by_buildId_and_workosUserId_and_active", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", subject)
            .eq("active", true)
        )
        .collect();
      const assignments = await ctx.db
        .query("buildActionItems")
        .withIndex(
          "by_buildId_and_assigneeWorkosUserId_and_status",
          (query) =>
            query
              .eq("buildId", fixture.buildId)
              .eq("assigneeWorkosUserId", subject)
        )
        .collect();
      return { assignments, follows, participant };
    });
    expect(cleaned.follows).toEqual([]);
    expect(cleaned.assignments).toEqual([]);
    expect(cleaned.participant).toMatchObject({
      revocationCleanupCompletedAt: expect.any(Number),
      revocationCleanupStatus: "completed",
      status: "removed",
    });
    const reinvitedParticipantId = await fixture.admin.mutation(
      (api as any).build_participants.reinviteBuildParticipant,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        role: "contractor",
        workosUserId: subject,
      }
    );
    expect(reinvitedParticipantId).toBeTruthy();
    await contractor.mutation(
      (api as any).build_participants.acceptBuildParticipantInvitation,
      { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
    );
    const newPeriodWork = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Build fixture is unavailable.");
      }
      const now = Date.now();
      const followId = await ctx.db.insert("buildCollaborationFollows", {
        active: true,
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        postId,
        reason: "manual",
        updatedAt: now,
        workosUserId: subject,
      });
      const actionItemId = await ctx.db.insert("buildActionItems", {
        assigneeWorkosUserId: subject,
        assignedByWorkosUserId: "user_admin",
        assignmentState: "assigned",
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        creatorRole: "admin",
        creatorWorkosUserId: "user_admin",
        currentRevision: 1,
        descriptionPlainText: "",
        descriptionTiptapJson: JSON.stringify({
          content: [],
          type: "doc",
        }),
        originatingPostId: postId,
        organizationId: ORGANIZATION_ID,
        priority: "none",
        requiresAcceptance: false,
        status: "todo",
        title: "New participation period assignment",
        updatedAt: now,
      });
      return { actionItemId, followId };
    });
    await fixture.base.mutation(
      (internal as any).build_participant_revocation
        .continueBuildParticipantRevocationCleanup,
      {
        actorRole: "admin",
        actorWorkosUserId: "user_admin",
        participantId,
        reason: "Stale scheduled retry.",
      }
    );
    await expect(
      fixture.base.run(async (ctx) => ({
        actionItem: await ctx.db.get(newPeriodWork.actionItemId),
        follow: await ctx.db.get(newPeriodWork.followId),
      }))
    ).resolves.toMatchObject({
      actionItem: {
        assigneeWorkosUserId: subject,
        assignmentState: "assigned",
      },
      follow: { active: true, workosUserId: subject },
    });
  });
});
