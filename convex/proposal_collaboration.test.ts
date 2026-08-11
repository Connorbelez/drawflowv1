/// <reference types="vite/client" />

import presenceComponent from "@convex-dev/presence/test";
import timelineComponent from "convex-timeline/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import {
  captureProposalPlanningSnapshot,
  restoreProposalPlanningSnapshot,
} from "./proposal_collaboration_model";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ORG = "org_proposal_collaboration";
const OTHER_ORG = "org_proposal_collaboration_other";

function identity(roles: readonly string[], subject: string, organizationId = ORG) {
  return {
    email: `${subject}@example.com`,
    name: subject
      .replace(/^user_/, "")
      .split("_")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any;
}

function testConvex() {
  const t = convexTest(schema, modules);
  presenceComponent.register(t);
  timelineComponent.register(t);
  return t;
}

function asRole(
  base: ReturnType<typeof testConvex>,
  roles: readonly string[],
  subject: string,
) {
  return base.withIdentity(identity(roles, subject));
}

async function seeded() {
  const base = testConvex();
  const admin = asRole(base, ["admin"], "user_admin");
  const seed = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORG },
  );

  // WorkOS projection tables are webhook-owned.  Seed the additional
  // collaboration identities through the same internal webhook entrypoint
  // used by WorkOS projection tests instead of writing users or memberships
  // directly from this product-flow fixture.
  const now = new Date().toISOString();
  for (const row of [
    { roles: ["builder-staff"], subject: "user_builder_staff" },
    { roles: ["broker-staff"], subject: "user_broker_staff" },
    { roles: ["principle-broker"], subject: "user_principle_broker" },
    { roles: ["contractor"], subject: "user_contractor" },
    { roles: ["member"], subject: "user_member" },
    { roles: ["builder"], subject: "user_inactive_builder", status: "inactive" },
    { roles: ["builder"], subject: "user_other_org_builder", org: OTHER_ORG },
    { roles: ["builder"], subject: "user_assignee_builder" },
  ]) {
    await base.mutation(internal.auth.authKitEvent, {
      data: {
        createdAt: now,
        email: `${row.subject}@example.com`,
        emailVerified: true,
        firstName: row.subject,
        id: row.subject,
        profilePictureUrl: null,
        updatedAt: now,
      },
      event: "user.created",
    });
    await base.mutation(internal.auth.authKitEvent, {
      data: {
        createdAt: now,
        directoryManaged: false,
        id: `membership_${row.subject}`,
        object: "organization_membership",
        organizationId: row.org ?? ORG,
        role: { slug: row.roles[0] },
        roles: row.roles.map((slug) => ({ slug })),
        status: row.status ?? "active",
        updatedAt: now,
        userId: row.subject,
      },
      event: "organization_membership.created",
    });
  }

  await admin.run(async (ctx: any) => {
    const now = Date.now();
    const assigneeProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId: seed.brokerageId,
      createdAt: now,
      displayName: "Assignee Builder",
      legalName: "Assignee Builder LLC",
      organizationId: ORG,
      status: "active",
      updatedAt: now,
    });
    await ctx.db.insert("builderAccountLinks", {
      brokerageId: seed.brokerageId,
      builderProfileId: assigneeProfileId,
      createdAt: now,
      role: "owner",
      status: "active",
      updatedAt: now,
      workosUserId: "user_assignee_builder",
    });
  });
  return { admin, base, seed };
}

async function createDraftProposal(admin: any, seed: any) {
  const proposalId = await admin.mutation(
    (api as any).production_proposals.createDraftProposal,
    {
      brokerageId: seed.brokerageId,
      builderProfileId: seed.builderProfileId,
      buildName: "Collaborative proposal",
      location: "42 Collaboration Ave",
      workosOrganizationId: ORG,
    },
  );
  await admin.mutation((api as any).production_proposals.saveDraftProposalPackage, {
    borrowerCoPayBps: 2_000,
    borrowerWorkingCapitalLimitCents: 40_000_000,
    lenderDrawPolicyLimitCents: 55_000_000,
    milestones: [
      {
        budgetCents: 50_000_000,
        dayEnd: 30,
        dayStart: 0,
        dependencyKeys: [],
        durationDays: 30,
        key: "foundation",
        name: "Foundation",
        order: 1,
        submilestones: [
          {
            budgetCents: 50_000_000,
            durationDays: 12,
            key: "forms",
            name: "Forms and pour",
            order: 1,
          },
        ],
      },
    ],
    proposalId,
    workosOrganizationId: ORG,
  });
  await admin.run(async (ctx: any) => {
    await ctx.db.patch(proposalId, { assignedBrokerWorkosUserId: "user_broker" });
  });
  return proposalId;
}

describe("proposal collaboration", () => {
  test("accepts only active same-org collaboration roles and rejects denied roles", async () => {
    const { admin, base, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );

    await expect(
      asRole(base, ["builder"], "user_builder").mutation(
        (api as any).proposal_collaboration.joinSession,
        { shareToken: session.shareToken, workosOrganizationId: ORG },
      ),
    ).resolves.toMatchObject({ permission: "edit" });
    await expect(
      asRole(base, ["builder-staff"], "user_builder_staff").mutation(
        (api as any).proposal_collaboration.joinSession,
        { shareToken: session.shareToken, workosOrganizationId: ORG },
      ),
    ).resolves.toMatchObject({ permission: "view" });
    await expect(
      asRole(base, ["admin"], "user_admin").mutation(
        (api as any).proposal_collaboration.joinSession,
        { shareToken: session.shareToken, workosOrganizationId: ORG },
      ),
    ).resolves.toMatchObject({ permission: "edit" });

    for (const [roles, subject, message] of [
      [["contractor"], "user_contractor", /role/],
      [["member"], "user_member", /role/],
      [["builder"], "user_inactive_builder", /membership/],
    ] as const) {
      await expect(
        asRole(base, roles, subject).mutation(
          (api as any).proposal_collaboration.joinSession,
          { shareToken: session.shareToken, workosOrganizationId: ORG },
        ),
      ).rejects.toThrow(message);
    }

    await expect(
      base
        .withIdentity(identity(["builder"], "user_other_org_builder", OTHER_ORG))
        .mutation((api as any).proposal_collaboration.joinSession, {
          shareToken: session.shareToken,
          workosOrganizationId: OTHER_ORG,
        }),
    ).rejects.toThrow(/scope|organization|brokerage|membership/i);
    await expect(
      base.mutation((api as any).proposal_collaboration.joinSession, {
        shareToken: session.shareToken,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Unauthorized/);
  });

  test("enforces view/edit/manage access and writes permission audit events", async () => {
    const { admin, base, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const builder = asRole(base, ["builder"], "user_builder");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    await broker.mutation((api as any).proposal_collaboration.setParticipantPermission, {
      permission: "view",
      reason: "Builder should review before editing.",
      sessionId: session.sessionId,
      targetWorkosUserId: "user_builder",
      workosOrganizationId: ORG,
    });
    await builder.mutation((api as any).proposal_collaboration.joinSession, {
      shareToken: session.shareToken,
      workosOrganizationId: ORG,
    });
    await expect(
      builder.mutation((api as any).proposal_collaboration.startSession, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/manage|permission|Forbidden/i);

    await expect(
      builder.mutation((api as any).production_proposals.updateProductionTimelineMilestone, {
        budgetCents: 51_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/view-only|permission/i);
    await expect(
      builder.mutation((api as any).proposal_collaboration.setParticipantPermission, {
        permission: "edit",
        sessionId: session.sessionId,
        targetWorkosUserId: "user_builder_staff",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/manage|permission|Forbidden/i);

    await broker.mutation((api as any).proposal_collaboration.setParticipantPermission, {
      permission: "edit",
      reason: "Builder can make budget corrections.",
      sessionId: session.sessionId,
      targetWorkosUserId: "user_builder",
      workosOrganizationId: ORG,
    });
    await expect(
      builder.mutation((api as any).production_proposals.updateProductionTimelineMilestone, {
        budgetCents: 51_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toBeNull();

    const detail = await admin.query((api as any).production_proposals.getProposalDetail, {
      proposalId,
      workosOrganizationId: ORG,
    });
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.collaboration.permission_changed",
        "proposal.milestone.updated",
      ]),
    );
    expect(
      detail.auditEvents.find(
        (event: any) => event.eventType === "proposal.collaboration.permission_changed",
      ),
    ).toMatchObject({
      actorWorkosUserId: "user_broker",
      reason: "Builder should review before editing.",
    });
  });

  test("binds email invites on join and preserves invited permission", async () => {
    const { admin, base, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const assignee = asRole(base, ["builder"], "user_assignee_builder");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    await broker.mutation((api as any).proposal_collaboration.inviteParticipant, {
      inviteEmail: "USER_ASSIGNEE_BUILDER@example.com",
      permission: "view",
      sessionId: session.sessionId,
      workosOrganizationId: ORG,
    });

    await expect(
      assignee.mutation((api as any).proposal_collaboration.joinSession, {
        shareToken: session.shareToken,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ permission: "view" });
    await expect(
      assignee.mutation((api as any).production_proposals.updateProductionTimelineMilestone, {
        budgetCents: 51_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/view-only|permission/i);

    const sessionState = await broker.query((api as any).proposal_collaboration.getSession, {
      proposalId,
      workosOrganizationId: ORG,
    });
    const assigneeRows = sessionState.participants.filter(
      (participant: any) =>
        participant.workosUserId === "user_assignee_builder" ||
        participant.inviteEmail === "user_assignee_builder@example.com",
    );
    expect(assigneeRows).toHaveLength(1);
    expect(assigneeRows[0]).toMatchObject({
      permission: "view",
      source: "invite",
      status: "joined",
      workosUserId: "user_assignee_builder",
    });
  });

  test("updates view/edit permissions for email invites before join", async () => {
    const { admin, base, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const assignee = asRole(base, ["builder"], "user_assignee_builder");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    const participantId = await broker.mutation(
      (api as any).proposal_collaboration.inviteParticipant,
      {
        inviteEmail: "USER_ASSIGNEE_BUILDER@example.com",
        permission: "view",
        sessionId: session.sessionId,
        workosOrganizationId: ORG,
      },
    );

    await broker.mutation(
      (api as any).proposal_collaboration.setParticipantPermission,
      {
        participantId,
        permission: "edit",
        reason: "Email invite should be able to edit once accepted.",
        sessionId: session.sessionId,
        workosOrganizationId: ORG,
      },
    );
    await expect(
      assignee.mutation((api as any).proposal_collaboration.joinSession, {
        shareToken: session.shareToken,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ permission: "edit" });
    await expect(
      assignee.mutation(
        (api as any).production_proposals.updateProductionTimelinePlanState,
        {
          currentDay: 3,
          progressValue: 3,
          proposalId,
          rangeMax: 90,
          rangeMin: 0,
          routeState: { selectedPanelOpen: true, straightLine: false },
          startingCashCents: 25_000_000,
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toBeNull();

    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    const permissionEvent = detail.auditEvents.find(
      (event: any) =>
        event.eventType === "proposal.collaboration.permission_changed",
    );
    expect(permissionEvent).toMatchObject({
      actorWorkosUserId: "user_broker",
      reason: "Email invite should be able to edit once accepted.",
    });
    expect(JSON.parse(permissionEvent.newState)).toMatchObject({
      inviteEmail: "user_assignee_builder@example.com",
      permission: "edit",
    });
  });

  test("rejects proposal edits from non-participants while collaboration is active", async () => {
    const { admin, base, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    await broker.mutation((api as any).proposal_collaboration.startSession, {
      proposalId,
      workosOrganizationId: ORG,
    });

    await expect(
      admin.mutation((api as any).production_proposals.updateProductionTimelineMilestone, {
        budgetCents: 51_000_000,
        milestoneKey: "foundation",
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/participant|collaboration|permission/i);
  });

  test("toggle off keeps assigned builder draft access", async () => {
    const { base, admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const assignee = asRole(base, ["builder"], "user_assignee_builder");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    await broker.mutation((api as any).proposal_collaboration.inviteParticipant, {
      permission: "edit",
      sessionId: session.sessionId,
      targetWorkosUserId: "user_assignee_builder",
      workosOrganizationId: ORG,
    });
    await broker.mutation((api as any).proposal_collaboration.assignSessionToBuilder, {
      reason: "Builder accepted draft ownership.",
      sessionId: session.sessionId,
      targetWorkosUserId: "user_assignee_builder",
      workosOrganizationId: ORG,
    });
    await broker.mutation((api as any).proposal_collaboration.stopSession, {
      reason: "Live review complete.",
      sessionId: session.sessionId,
      workosOrganizationId: ORG,
    });

    const status = await broker.query((api as any).proposal_collaboration.getSession, {
      proposalId,
      workosOrganizationId: ORG,
    });
    expect(status.activeSession).toBeNull();
    const workspace = await assignee.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(workspace.proposal.buildName).toBe("Collaborative proposal");
  });

  test("assign-to-builder is limited to eligible active builder owners", async () => {
    const { base, admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    await broker.mutation((api as any).proposal_collaboration.inviteParticipant, {
      permission: "edit",
      sessionId: session.sessionId,
      targetWorkosUserId: "user_builder_staff",
      workosOrganizationId: ORG,
    });
    await expect(
      broker.mutation((api as any).proposal_collaboration.assignSessionToBuilder, {
        sessionId: session.sessionId,
        targetWorkosUserId: "user_builder_staff",
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/eligible|builder/i);

    await broker.mutation((api as any).proposal_collaboration.inviteParticipant, {
      permission: "edit",
      sessionId: session.sessionId,
      targetWorkosUserId: "user_assignee_builder",
      workosOrganizationId: ORG,
    });
    const assigned = await broker.mutation(
      (api as any).proposal_collaboration.assignSessionToBuilder,
      {
        reason: "Assigning draft to eligible builder owner.",
        sessionId: session.sessionId,
        targetWorkosUserId: "user_assignee_builder",
        workosOrganizationId: ORG,
      },
    );
    expect(assigned).toMatchObject({ assigned: true });
    const detail = await admin.query((api as any).production_proposals.getProposalDetail, {
      proposalId,
      workosOrganizationId: ORG,
    });
    expect(detail.proposal.builderProfileId).toBe(assigned.builderProfileId);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.collaboration.assigned_to_builder",
    );
  });

  test("broker unassigned drafts can be assigned to an eligible builder", async () => {
    const { base, admin } = await seeded();
    const broker = asRole(base, ["broker"], "user_broker");
    const assignee = asRole(base, ["builder"], "user_assignee_builder");
    const proposalId = await broker.mutation(
      (api as any).production_proposals.createBrokerDraftProposal,
      { workosOrganizationId: ORG },
    );
    const unassigned = await broker.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(unassigned.proposal.builderProfileId).toBeUndefined();

    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    await broker.mutation((api as any).proposal_collaboration.inviteParticipant, {
      permission: "edit",
      sessionId: session.sessionId,
      targetWorkosUserId: "user_assignee_builder",
      workosOrganizationId: ORG,
    });
    const sessionState = await broker.query(
      (api as any).proposal_collaboration.getSession,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(
      sessionState.participants.find(
        (participant: any) =>
          participant.workosUserId === "user_assignee_builder",
      )?.assignableBuilderProfileId,
    ).toBeTruthy();
    await expect(
      assignee.mutation((api as any).proposal_collaboration.joinSession, {
        shareToken: session.shareToken,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ permission: "edit" });
    await expect(
      assignee.query((api as any).proposal_collaboration.getSession, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      currentPermission: "edit",
      currentWorkosUserId: "user_assignee_builder",
    });
    await expect(
      assignee.mutation(
        (api as any).production_proposals.updateProductionTimelinePlanState,
        {
          currentDay: 3,
          progressValue: 3,
          proposalId,
          rangeMax: 90,
          rangeMin: 0,
          routeState: { selectedPanelOpen: true, straightLine: false },
          startingCashCents: 25_000_000,
          workosOrganizationId: ORG,
        },
      ),
    ).resolves.toBeNull();

    const assigned = await broker.mutation(
      (api as any).proposal_collaboration.assignSessionToBuilder,
      {
        reason: "Assigning broker draft to builder owner.",
        sessionId: session.sessionId,
        targetWorkosUserId: "user_assignee_builder",
        workosOrganizationId: ORG,
      },
    );
    const detail = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(detail.proposal.builderProfileId).toBe(assigned.builderProfileId);
    expect(detail.auditEvents.map((event: any) => event.eventType)).toContain(
      "proposal.collaboration.assigned_to_builder",
    );
    await expect(
      assignee.query((api as any).production_proposals.getProductionTimelineWorkspace, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      proposal: { buildName: "Unassigned broker draft" },
    });
  });

  test("undo and redo restore deterministic planning snapshots and append audit events", async () => {
    const { base, admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const canonicalScope = JSON.stringify({
      content: [
        {
          content: [{ text: "Preserved collaboration Scope.", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const canonicalGuidance = JSON.stringify({
      content: [
        {
          content: [
            { text: "Preserved collaboration Guidance.", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    await admin.run(async (ctx: any) => {
      const submilestone = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .first();
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      const guidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      await ctx.db.patch(contract.activeDraftRevisionId, {
        scopeOfWorkTiptapJson: canonicalScope,
      });
      await ctx.db.patch(guidance._id, {
        cameraAnglesTiptapJson: canonicalGuidance,
        whatToVerifyTiptapJson: canonicalGuidance,
      });
    });
    const broker = asRole(base, ["broker"], "user_broker");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    await broker.mutation((api as any).production_proposals.updateProductionTimelineMilestone, {
      budgetCents: 52_000_000,
      dayEnd: 35,
      milestoneKey: "foundation",
      proposalId,
      workosOrganizationId: ORG,
    });
    await broker.mutation((api as any).production_proposals.createProductionTimelineCapitalEvent, {
      amountCents: 1_500_000,
      capitalEventKey: "weather-delay",
      eventKind: "cost",
      label: "Weather delay",
      proposalId,
      workosOrganizationId: ORG,
      x: 12,
    });

    const edited = await admin.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(edited.milestones[0].budgetCents).toBe(52_000_000);
    expect(edited.capitalEvents.some((event: any) => event.capitalEventKey === "weather-delay")).toBe(
      true,
    );

    await broker.mutation((api as any).proposal_collaboration.undoProposalTimeline, {
      proposalId,
      reason: "Undo accidental weather adjustment.",
      sessionId: session.sessionId,
      workosOrganizationId: ORG,
    });
    const undone = await admin.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(undone.milestones[0].budgetCents).toBe(52_000_000);
    expect(undone.capitalEvents.some((event: any) => event.capitalEventKey === "weather-delay")).toBe(
      false,
    );

    await broker.mutation((api as any).proposal_collaboration.undoProposalTimeline, {
      proposalId,
      reason: "Undo budget adjustment.",
      sessionId: session.sessionId,
      workosOrganizationId: ORG,
    });
    const baseline = await admin.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(baseline.milestones[0].budgetCents).toBe(50_000_000);

    await broker.mutation((api as any).proposal_collaboration.redoProposalTimeline, {
      proposalId,
      reason: "Redo budget adjustment.",
      sessionId: session.sessionId,
      workosOrganizationId: ORG,
    });
    const redone = await admin.query(
      (api as any).production_proposals.getProductionTimelineWorkspace,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(redone.milestones[0].budgetCents).toBe(52_000_000);
    const canonicalState = await admin.run(async (ctx: any) => {
      const submilestones = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .collect();
      const contracts = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_organizationId_and_proposalId", (query: any) =>
          query.eq("organizationId", ORG).eq("proposalId", proposalId),
        )
        .collect();
      const guidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_organizationId_and_proposalId", (query: any) =>
          query.eq("organizationId", ORG).eq("proposalId", proposalId),
        )
        .collect();
      const revisions = await ctx.db
        .query("submilestoneScopeRevisions")
        .collect();
      return { contracts, guidance, revisions, submilestones };
    });
    const submilestoneIds = new Set(
      canonicalState.submilestones.map((row: any) => row._id),
    );
    expect(canonicalState.contracts).toHaveLength(
      canonicalState.submilestones.length,
    );
    expect(canonicalState.guidance).toHaveLength(
      canonicalState.submilestones.length,
    );
    expect(
      canonicalState.contracts.every((row: any) =>
        submilestoneIds.has(row.proposalSubmilestoneId),
      ),
    ).toBe(true);
    expect(
      canonicalState.guidance.every((row: any) =>
        submilestoneIds.has(row.proposalSubmilestoneId),
      ),
    ).toBe(true);
    expect(canonicalState.revisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeOfWorkTiptapJson: canonicalScope }),
      ]),
    );
    expect(canonicalState.guidance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cameraAnglesTiptapJson: canonicalGuidance,
          whatToVerifyTiptapJson: canonicalGuidance,
        }),
      ]),
    );

    const historyStatus = await broker.query(
      (api as any).proposal_collaboration.getTimelineHistoryStatus,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(historyStatus).toMatchObject({ canUndo: true, canRedo: true });
    const detail = await admin.query((api as any).production_proposals.getProposalDetail, {
      proposalId,
      workosOrganizationId: ORG,
    });
    expect(detail.auditEvents.map((event: any) => event.eventType)).toEqual(
      expect.arrayContaining([
        "proposal.timeline.undo",
        "proposal.timeline.redo",
      ]),
    );
  });

  test("captures a detached v1 Scope draft and fails closed on corrupt content", async () => {
    const { admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const canonicalScope = JSON.stringify({
      content: [
        {
          content: [{ text: "Detached Scope content.", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const detached = await admin.run(async (ctx: any) => {
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_organizationId_and_proposalId", (query: any) =>
          query.eq("organizationId", ORG).eq("proposalId", proposalId),
        )
        .unique();
      if (!contract?.activeDraftRevisionId) {
        throw new Error("Missing seeded v1 Scope draft.");
      }
      const revisionId = contract.activeDraftRevisionId;
      await ctx.db.patch(revisionId, {
        scopeOfWorkTiptapJson: canonicalScope,
      });
      await ctx.db.patch(contract._id, { activeDraftRevisionId: undefined });
      return { revisionId };
    });

    const captured = await admin.run((ctx: any) =>
      captureProposalPlanningSnapshot(ctx, proposalId),
    );
    expect(captured.milestones[0]?.submilestones[0]?.scopeOfWorkTiptapJson).toBe(
      canonicalScope,
    );

    await admin.run(async (ctx: any) => {
      await ctx.db.patch(detached.revisionId, {
        scopeOfWorkTiptapJson: "not-valid-tiptap-json",
      });
    });
    await expect(
      admin.run((ctx: any) => captureProposalPlanningSnapshot(ctx, proposalId)),
    ).rejects.toThrow(/Scope content|lineage/i);

    await admin.run(async (ctx: any) => {
      await ctx.db.delete(detached.revisionId);
    });
    await expect(
      admin.run((ctx: any) => captureProposalPlanningSnapshot(ctx, proposalId)),
    ).rejects.toThrow(/Scope content|lineage/i);
  });

  test("omits absent canonical Sub-milestone fields from snapshots", async () => {
    const { admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const canonical = await admin.run(async (ctx: any) => {
      const submilestone = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .unique();
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      const revision = contract.activeDraftRevisionId
        ? await ctx.db.get(contract.activeDraftRevisionId)
        : null;
      const guidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      if (!revision || !guidance) {
        throw new Error("Missing canonical Sub-milestone fixture.");
      }
      return {
        contractId: contract._id,
        fieldGuidance: {
          cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
          whatToVerifyTiptapJson: guidance.whatToVerifyTiptapJson,
        },
        guidanceId: guidance._id,
        revisionId: revision._id,
        scopeOfWorkTiptapJson: revision.scopeOfWorkTiptapJson,
      };
    });

    const populated = await admin.run((ctx: any) =>
      captureProposalPlanningSnapshot(ctx, proposalId),
    );
    const populatedSubmilestone = populated.milestones[0]?.submilestones[0];
    expect(populatedSubmilestone).toBeDefined();
    expect(populatedSubmilestone?.fieldGuidance).toEqual(
      canonical.fieldGuidance,
    );
    expect(populatedSubmilestone?.scopeOfWorkTiptapJson).toBe(
      canonical.scopeOfWorkTiptapJson,
    );

    await admin.run(async (ctx: any) => {
      await ctx.db.delete(canonical.revisionId);
      await ctx.db.delete(canonical.contractId);
      await ctx.db.delete(canonical.guidanceId);
    });

    const absent = await admin.run((ctx: any) =>
      captureProposalPlanningSnapshot(ctx, proposalId),
    );
    const absentSubmilestone = absent.milestones[0]?.submilestones[0];
    expect(absentSubmilestone).toBeDefined();
    expect(
      Object.prototype.hasOwnProperty.call(absentSubmilestone, "fieldGuidance"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        absentSubmilestone,
        "scopeOfWorkTiptapJson",
      ),
    ).toBe(false);
  });

  test("rejects duplicate Field Guidance owners before snapshot map construction", async () => {
    const { admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);

    await admin.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      const submilestone = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .unique();
      const guidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      if (!proposal || !submilestone || !guidance) {
        throw new Error("Missing duplicate Field Guidance test fixture.");
      }

      await ctx.db.insert("submilestoneFieldGuidance", {
        brokerageId: proposal.brokerageId,
        cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
        createdAt: Date.now(),
        organizationId: proposal.organizationId,
        proposalId,
        proposalSubmilestoneId: submilestone._id,
        updatedAt: Date.now(),
        updatedByWorkosUserId: "user_admin",
        whatToVerifyTiptapJson: guidance.whatToVerifyTiptapJson,
      });
    });

    await expect(
      admin.run((ctx: any) =>
        captureProposalPlanningSnapshot(ctx, proposalId),
      ),
    ).rejects.toThrow("Proposal draft Field Guidance lineage is unavailable.");
  });

  test("disables and rejects undo/redo after proposal submission", async () => {
    const { base, admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    await admin.mutation((api as any).production_proposals.submitProposal, {
      proposalId,
      workosOrganizationId: ORG,
    });

    await expect(
      broker.query((api as any).proposal_collaboration.getTimelineHistoryStatus, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ canRedo: false, canUndo: false });
    for (const command of ["undoProposalTimeline", "redoProposalTimeline"] as const) {
      await expect(
        broker.mutation((api as any).proposal_collaboration[command], {
          proposalId,
          reason: `Reject ${command} after submission.`,
          sessionId: session.sessionId,
          workosOrganizationId: ORG,
        }),
      ).rejects.toThrow(/only available for proposal planning edits/i);
    }

    await admin.run(async (ctx: any) => {
      await ctx.db.patch(proposalId, { status: "draft" });
    });
    await expect(
      broker.query((api as any).proposal_collaboration.getTimelineHistoryStatus, {
        proposalId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({ canRedo: false, canUndo: false });
    for (const command of ["undoProposalTimeline", "redoProposalTimeline"] as const) {
      await expect(
        broker.mutation((api as any).proposal_collaboration[command], {
          proposalId,
          reason: `Reject ${command} after a requested-changes transition.`,
          sessionId: session.sessionId,
          workosOrganizationId: ORG,
        }),
      ).rejects.toThrow(/only available for proposal planning edits/i);
    }
  });

  test("legacy planning snapshots preserve cost items during restore", async () => {
    const { admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const itemId = await admin.mutation(
      (api as any).production_proposals.createProposalCostItem,
      {
        budgetTreatment: "logOnly",
        costCents: 2_500_000,
        itemType: "material",
        milestoneKey: "foundation",
        proposalId,
        quantity: 1,
        relevantSubmilestoneKeys: ["forms"],
        title: "Preserved concrete quote",
        workosOrganizationId: ORG,
      },
    );

    await admin.run(async (ctx: any) => {
      const proposal = await ctx.db.get(proposalId);
      const brokerage = await ctx.db.get(seed.brokerageId);
      if (!proposal || !brokerage) {
        throw new Error("Missing proposal restore test fixture.");
      }
      const snapshot = await captureProposalPlanningSnapshot(ctx, proposalId);
      delete snapshot.costItems;
      await restoreProposalPlanningSnapshot(
        ctx,
        { brokerage, proposal, subject: "user_admin" },
        snapshot,
      );
    });

    const restored = await admin.query(
      (api as any).production_proposals.getProposalDetail,
      { proposalId, workosOrganizationId: ORG },
    );
    expect(restored.costItems).toHaveLength(1);
    expect(restored.costItems[0]).toMatchObject({
      itemKey: expect.any(String),
      title: "Preserved concrete quote",
    });
    expect(restored.costItems[0]._id).not.toBe(itemId);
    expect(
      restored.milestones.some(
        (milestone: any) =>
          milestone._id === restored.costItems[0].proposalMilestoneId,
      ),
    ).toBe(true);
  });

  test("legacy planning snapshots preserve canonical bytes by stable keys", async () => {
    const { admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const scopeBytes = `{
  "type": "doc",
  "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "  Scope bytes  " }] }]
}`;
    const cameraAnglesBytes = `{
  "type": "doc",
  "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Camera bytes" }] }]
}`;
    const whatToVerifyBytes = `{
  "type": "doc",
  "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Verify bytes" }] }]
}`;
    const readCanonicalBytes = () =>
      admin.run(async (ctx: any) => {
        const submilestone = await ctx.db
          .query("proposalSubmilestones")
          .withIndex("by_proposal", (query: any) =>
            query.eq("proposalId", proposalId),
          )
          .unique();
        const contract = await ctx.db
          .query("submilestoneScopeContracts")
          .withIndex("by_proposalSubmilestoneId", (query: any) =>
            query.eq("proposalSubmilestoneId", submilestone._id),
          )
          .unique();
        const revision = await ctx.db.get(contract.activeDraftRevisionId);
        const guidance = await ctx.db
          .query("submilestoneFieldGuidance")
          .withIndex("by_proposalSubmilestoneId", (query: any) =>
            query.eq("proposalSubmilestoneId", submilestone._id),
          )
          .unique();
        return {
          cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
          scopeOfWorkTiptapJson: revision.scopeOfWorkTiptapJson,
          whatToVerifyTiptapJson: guidance.whatToVerifyTiptapJson,
        };
      });
    const restore = (snapshot: any) =>
      admin.run(async (ctx: any) => {
        const proposal = await ctx.db.get(proposalId);
        const brokerage = await ctx.db.get(seed.brokerageId);
        if (!proposal || !brokerage) {
          throw new Error("Missing legacy restore proposal fixture.");
        }
        await restoreProposalPlanningSnapshot(
          ctx,
          { brokerage, proposal, subject: "user_admin" },
          snapshot,
        );
      });
    await admin.run(async (ctx: any) => {
      const submilestone = await ctx.db
        .query("proposalSubmilestones")
        .withIndex("by_proposal", (query: any) =>
          query.eq("proposalId", proposalId),
        )
        .unique();
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      const guidance = await ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", submilestone._id),
        )
        .unique();
      await ctx.db.patch(contract.activeDraftRevisionId, {
        scopeOfWorkTiptapJson: scopeBytes,
      });
      await ctx.db.patch(guidance._id, {
        cameraAnglesTiptapJson: cameraAnglesBytes,
        whatToVerifyTiptapJson: whatToVerifyBytes,
      });
    });

    const captured = await admin.run((ctx: any) =>
      captureProposalPlanningSnapshot(ctx, proposalId),
    );
    const legacySnapshot = JSON.parse(JSON.stringify(captured)) as typeof captured;
    const legacySubmilestone = legacySnapshot.milestones[0]?.submilestones[0];
    if (!legacySubmilestone) {
      throw new Error("Missing legacy restore Sub-milestone fixture.");
    }
    delete legacySubmilestone.scopeOfWorkTiptapJson;
    delete legacySubmilestone.fieldGuidance;
    await restore(legacySnapshot);
    await expect(readCanonicalBytes()).resolves.toEqual({
      cameraAnglesTiptapJson: cameraAnglesBytes,
      scopeOfWorkTiptapJson: scopeBytes,
      whatToVerifyTiptapJson: whatToVerifyBytes,
    });

    const explicitEmptySnapshot = await admin.run((ctx: any) =>
      captureProposalPlanningSnapshot(ctx, proposalId),
    );
    const explicitEmptySubmilestone =
      explicitEmptySnapshot.milestones[0]?.submilestones[0];
    if (!explicitEmptySubmilestone) {
      throw new Error("Missing explicit empty restore fixture.");
    }
    const emptyDocument = JSON.stringify({
      content: [{ type: "paragraph" }],
      type: "doc",
    });
    explicitEmptySubmilestone.scopeOfWorkTiptapJson = emptyDocument;
    explicitEmptySubmilestone.fieldGuidance = {
      cameraAnglesTiptapJson: emptyDocument,
      whatToVerifyTiptapJson: emptyDocument,
    };
    await restore(explicitEmptySnapshot);
    await expect(readCanonicalBytes()).resolves.toEqual({
      cameraAnglesTiptapJson: emptyDocument,
      scopeOfWorkTiptapJson: emptyDocument,
      whatToVerifyTiptapJson: emptyDocument,
    });
  });

  test("presence data carries collaborator cursor payloads and disconnects cleanly", async () => {
    const { base, admin, seed } = await seeded();
    const proposalId = await createDraftProposal(admin, seed);
    const broker = asRole(base, ["broker"], "user_broker");
    const builder = asRole(base, ["builder"], "user_builder");
    const session = await broker.mutation(
      (api as any).proposal_collaboration.startSession,
      { proposalId, workosOrganizationId: ORG },
    );
    const joined = await builder.mutation((api as any).proposal_collaboration.joinSession, {
      shareToken: session.shareToken,
      workosOrganizationId: ORG,
    });
    const heartbeat = await builder.mutation(
      (api as any).proposal_collaboration.presenceHeartbeat,
      {
        interval: 10_000,
        roomId: joined.roomId,
        sessionId: "builder-tab-1",
        userId: "spoofed-user",
      },
    );
    await builder.mutation((api as any).proposal_collaboration.updatePresenceData, {
      cursor: { x: 0.42, y: 0.64 },
      roomId: joined.roomId,
      sessionId: session.sessionId,
      workosOrganizationId: ORG,
    });
    const presence = await builder.query(
      (api as any).proposal_collaboration.listPresence,
      { roomToken: heartbeat.roomToken },
    );
    expect(presence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Builder",
          online: true,
          userId: "user_builder",
          data: expect.objectContaining({ cursor: { x: 0.42, y: 0.64 } }),
        }),
      ]),
    );
    await builder.mutation((api as any).proposal_collaboration.presenceDisconnect, {
      sessionToken: heartbeat.sessionToken,
    });
    const disconnected = await builder.query(
      (api as any).proposal_collaboration.listPresence,
      { roomToken: heartbeat.roomToken },
    );
    expect(disconnected.find((row: any) => row.userId === "user_builder")?.online).toBe(
      false,
    );
  });
});
