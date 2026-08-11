/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_submilestone_scope_contract";
const OTHER_ORG = "org_other_scope";
const ADMIN_USER = `scope_admin_${ORG}`;
const PRINCIPLE_BROKER_USER = "scope_principle_broker";
const BUILDER_USER = "scope_builder_owner";
const BUILDER_STAFF_USER = "scope_builder_staff";
const BUILDER_MANY_LINKS_USER = "scope_builder_many_links";
const BROKER_STAFF_USER = "scope_broker_staff";

function withIdentity(
  t: any,
  organizationId = ORG,
  roles = ["admin"],
  subject = roles.includes("admin")
    ? `scope_admin_${organizationId}`
    : `scope_${roles[0]}_${organizationId}`,
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as any);
}

function tiptap(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

function tiptapImage(src = "https://example.com/scope.png") {
  return JSON.stringify({
    content: [{ attrs: { src }, type: "image" }],
    type: "doc",
  });
}

async function seedScopeFixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base);
  const fixture = await base.run(async (ctx: any) => {
    const now = Date.now();
    const brokerageId = await ctx.db.insert("brokerages", {
      createdAt: now,
      displayName: "Scope Contract Brokerage",
      legalName: "Scope Contract Brokerage Inc.",
      status: "active",
      updatedAt: now,
      workosOrganizationId: ORG,
    });
    const builderProfileId = await ctx.db.insert("builderProfiles", {
      brokerageId,
      createdAt: now,
      displayName: "Scope Contract Builder",
      legalName: "Scope Contract Builder Inc.",
      organizationId: ORG,
      status: "active",
      updatedAt: now,
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: ADMIN_USER,
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 35_000_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      brokerageId,
      buildName: "Scope contract fixture",
      builderProfileId,
      createdAt: now,
      createdByWorkosUserId: ADMIN_USER,
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 55_000_000,
      location: "10 Scope Contract Lane",
      organizationId: ORG,
      reviewOutcome: "none",
      status: "draft",
      totalBudgetCents: 25_000_000,
      updatedAt: now,
      updatedByWorkosUserId: ADMIN_USER,
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId,
      budgetCents: 25_000_000,
      createdAt: now,
      dayEnd: 10,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 20_000_000,
      durationDays: 10,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORG,
      proposalId,
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId,
        budgetCents: 25_000_000,
        createdAt: now,
        durationDays: 10,
        key: "excavation",
        milestoneKey: "foundation",
        name: "Excavation",
        order: 1,
        organizationId: ORG,
        proposalId,
        proposalMilestoneId,
        startDay: 0,
        updatedAt: now,
      },
    );
    await ctx.db.insert("builderAccountLinks", {
      brokerageId,
      builderProfileId,
      createdAt: now,
      role: "owner",
      status: "active",
      updatedAt: now,
      workosUserId: BUILDER_USER,
    });
    await ctx.db.insert("builderAccountLinks", {
      brokerageId,
      builderProfileId,
      createdAt: now,
      role: "staff",
      status: "active",
      updatedAt: now,
      workosUserId: BUILDER_STAFF_USER,
    });
    const proposalSubmilestone = await ctx.db.get(proposalSubmilestoneId);
    if (!proposalSubmilestone) {
      throw new Error("Expected one proposal Sub-milestone fixture.");
    }
    return { builderProfileId, proposalId, proposalSubmilestone };
  });
  return {
    admin,
    base,
    builder: withIdentity(base, ORG, ["builder"], BUILDER_USER),
    builderStaff: withIdentity(
      base,
      ORG,
      ["builder-staff"],
      BUILDER_STAFF_USER,
    ),
    lenderAdmin: withIdentity(
      base,
      ORG,
      ["principle-broker"],
      PRINCIPLE_BROKER_USER,
    ),
    brokerStaff: withIdentity(
      base,
      ORG,
      ["broker-staff"],
      BROKER_STAFF_USER,
    ),
    ...fixture,
  };
}

const scopeApi = (api as any).submilestone_scope_contracts;

async function publishRevision(
  admin: any,
  proposalSubmilestoneId: any,
  text: string,
  changeReason = "Scope change for decision test.",
) {
  const revisionId = await admin.mutation(
    scopeApi.createSubmilestoneScopeDraft,
    { proposalSubmilestoneId, workosOrganizationId: ORG },
  );
  await admin.mutation(scopeApi.saveSubmilestoneScopeDraft, {
    revisionId,
    scopeOfWorkTiptapJson: tiptap(text),
    workosOrganizationId: ORG,
  });
  await admin.mutation(scopeApi.publishSubmilestoneScopeRevision, {
    changeReason,
    revisionId,
    workosOrganizationId: ORG,
  });
  return revisionId;
}

describe("Sub-milestone Scope contract", () => {
  test("rejects semantically empty drafts and publishes text or image content", async () => {
    const { admin, proposalSubmilestone } = await seedScopeFixture();
    const args = {
      proposalSubmilestoneId: proposalSubmilestone._id,
      workosOrganizationId: ORG,
    };
    const revisionId = await admin.mutation(
      (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
      args,
    );

    await expect(
      admin.mutation(
        (api as any).submilestone_scope_contracts
          .publishSubmilestoneScopeRevision,
        { revisionId, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/non-empty content/i);

    for (const emptyDocument of [
      { content: [], type: "doc" },
      { content: [{ type: "paragraph" }], type: "doc" },
      {
        content: [
          {
            content: [{ text: "   ", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      },
    ]) {
      await admin.mutation(
        (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
        {
          revisionId,
          scopeOfWorkTiptapJson: JSON.stringify(emptyDocument),
          workosOrganizationId: ORG,
        },
      );
      await expect(
        admin.mutation(
          (api as any).submilestone_scope_contracts
            .publishSubmilestoneScopeRevision,
          { revisionId, workosOrganizationId: ORG },
        ),
      ).rejects.toThrow(/non-empty content/i);
    }

    await admin.mutation(
      (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
      {
        revisionId,
        scopeOfWorkTiptapJson: tiptap("Scope content is ready."),
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).submilestone_scope_contracts.publishSubmilestoneScopeRevision,
      { revisionId, workosOrganizationId: ORG },
    );

    const successorRevisionId = await admin.mutation(
      (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
      args,
    );
    await admin.mutation(
      (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
      {
        revisionId: successorRevisionId,
        scopeOfWorkTiptapJson: tiptapImage(),
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).submilestone_scope_contracts.publishSubmilestoneScopeRevision,
      {
        changeReason: "Add a visual scope reference.",
        revisionId: successorRevisionId,
        workosOrganizationId: ORG,
      },
    );

    const history = await admin.query(
      (api as any).submilestone_scope_contracts.getSubmilestoneScopeHistory,
      args,
    );
    expect(history?.revisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: revisionId,
          status: "published",
          version: 1,
        }),
        expect.objectContaining({
          _id: successorRevisionId,
          status: "published",
          version: 2,
        }),
      ]),
    );
  });

  test("updates one v1 draft, publishes it effective, and sequences one successor", async () => {
    const { admin, proposalSubmilestone } = await seedScopeFixture();
    const args = {
      proposalSubmilestoneId: proposalSubmilestone._id,
      workosOrganizationId: ORG,
    };

    const v1 = await admin.mutation(
      (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
      args,
    );
    expect(
      await admin.mutation(
        (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
        args,
      ),
    ).toBe(v1);

    const initialHistory = await admin.query(
      (api as any).submilestone_scope_contracts.getSubmilestoneScopeHistory,
      args,
    );
    expect(initialHistory).toMatchObject({
      latestVersion: 1,
      revisions: [
        expect.objectContaining({
          _id: v1,
          isActiveDraft: true,
          isEffective: false,
          status: "draft",
        }),
      ],
    });
    expect(initialHistory?.revisions[0]).not.toHaveProperty(
      "scopeOfWorkTiptapJson",
    );
    expect(
      await admin.query(
        (api as any).submilestone_scope_contracts
          .getSubmilestoneScopeRevisionContent,
        { revisionId: v1, workosOrganizationId: ORG },
      ),
    ).toMatchObject({
      _id: v1,
      scopeOfWorkTiptapJson: JSON.stringify({
        content: [{ type: "paragraph" }],
        type: "doc",
      }),
      status: "draft",
      version: 1,
    });

    const savedV1 = tiptap("Excavate and form foundations to issued drawings.");
    await admin.mutation(
      (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
      {
        revisionId: v1,
        scopeOfWorkTiptapJson: savedV1,
        workosOrganizationId: ORG,
      },
    );
    await admin.mutation(
      (api as any).submilestone_scope_contracts.publishSubmilestoneScopeRevision,
      { revisionId: v1, workosOrganizationId: ORG },
    );

    let history = await admin.query(
      (api as any).submilestone_scope_contracts.getSubmilestoneScopeHistory,
      args,
    );
    expect(history).toMatchObject({
      effectiveRevisionId: v1,
      latestVersion: 1,
      revisions: [
        expect.objectContaining({
          _id: v1,
          isActiveDraft: false,
          isEffective: true,
          status: "published",
          version: 1,
        }),
      ],
    });
    expect(history?.revisions[0]).not.toHaveProperty(
      "scopeOfWorkTiptapJson",
    );
    expect(
      await admin.query(
        (api as any).submilestone_scope_contracts
          .getSubmilestoneScopeRevisionContent,
        { revisionId: v1, workosOrganizationId: ORG },
      ),
    ).toMatchObject({
      _id: v1,
      scopeOfWorkTiptapJson: savedV1,
      status: "published",
      version: 1,
    });

    const v2 = await admin.mutation(
      (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
      args,
    );
    expect(
      await admin.mutation(
        (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
        args,
      ),
    ).toBe(v2);
    expect(v2).not.toBe(v1);

    const savedV2 = tiptap("Add underpinning at the north wall.");
    await admin.mutation(
      (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
      {
        revisionId: v2,
        scopeOfWorkTiptapJson: savedV2,
        workosOrganizationId: ORG,
      },
    );
    await expect(
      admin.mutation(
        (api as any).submilestone_scope_contracts.publishSubmilestoneScopeRevision,
        { revisionId: v2, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow(/change reason/i);
    await admin.mutation(
      (api as any).submilestone_scope_contracts.publishSubmilestoneScopeRevision,
      {
        changeReason: "North wall condition discovered during review.",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );

    history = await admin.query(
      (api as any).submilestone_scope_contracts.getSubmilestoneScopeHistory,
      args,
    );
    expect(history).toMatchObject({
      effectiveRevisionId: v1,
      latestVersion: 2,
      revisions: [
        expect.objectContaining({ _id: v1, isEffective: true, version: 1 }),
        expect.objectContaining({
          _id: v2,
          changeReason: "North wall condition discovered during review.",
          isEffective: false,
          status: "published",
          version: 2,
        }),
      ],
    });
    expect(history?.revisions.every((revision: Record<string, unknown>) =>
      !Object.prototype.hasOwnProperty.call(
        revision,
        "scopeOfWorkTiptapJson",
      ),
    )).toBe(true);
    expect(
      await admin.query(
        (api as any).submilestone_scope_contracts
          .getSubmilestoneScopeRevisionContent,
        { revisionId: v2, workosOrganizationId: ORG },
      ),
    ).toMatchObject({
      _id: v2,
      scopeOfWorkTiptapJson: savedV2,
      status: "published",
      version: 2,
    });
    await expect(
      admin.mutation(
        (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
        {
          revisionId: v1,
          scopeOfWorkTiptapJson: tiptap("Attempted overwrite"),
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow(/cannot be changed/i);

    const publicationAudits = await admin.run(async (ctx: any) => {
      const rows = await ctx.db.query("auditEvents").collect();
      return rows.filter(
        (row: any) =>
          row.eventType === "submilestone_scope_revision.published",
      );
    });
    expect(publicationAudits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorRoles: ["admin"],
          actorWorkosUserId: `scope_admin_${ORG}`,
          createdAt: expect.any(Number),
          entityId: String(v1),
          entityType: "submilestoneScopeRevision",
          newState: expect.any(String),
          priorState: expect.any(String),
          warnings: [],
        }),
        expect.objectContaining({
          actorRoles: ["admin"],
          actorWorkosUserId: `scope_admin_${ORG}`,
          createdAt: expect.any(Number),
          entityId: String(v2),
          entityType: "submilestoneScopeRevision",
          newState: expect.any(String),
          priorState: expect.any(String),
          reason: "North wall condition discovered during review.",
          warnings: [],
        }),
      ]),
    );
    expect(
      publicationAudits.find(
        (row: any) => row.entityId === String(v1),
      )?.reason,
    ).toBeUndefined();

    const storedSubmilestone = await admin.run((ctx: any) =>
      ctx.db.get(proposalSubmilestone._id),
    );
    expect(storedSubmilestone).toEqual(proposalSubmilestone);

    const overflowRevisionId = await admin.run(async (ctx: any) => {
      const contract = await ctx.db.get(history.contractId);
      const sourceRevision = await ctx.db.get(v2);
      if (!contract || !sourceRevision) {
        throw new Error("Expected Scope revision overflow fixture rows.");
      }
      const now = Date.now();
      const revisionId = await ctx.db.insert("submilestoneScopeRevisions", {
        authoredByWorkosUserId: sourceRevision.authoredByWorkosUserId,
        basedOnRevisionId: sourceRevision._id,
        brokerageId: sourceRevision.brokerageId,
        changeReason: "History metadata overflow fixture.",
        contractId: contract._id,
        createdAt: now,
        organizationId: sourceRevision.organizationId,
        proposalId: sourceRevision.proposalId,
        proposalSubmilestoneId: sourceRevision.proposalSubmilestoneId,
        publishedAt: now,
        publishedByWorkosUserId: sourceRevision.publishedByWorkosUserId,
        savedAt: now,
        scopeOfWorkTiptapJson: sourceRevision.scopeOfWorkTiptapJson,
        status: "published",
        version: 501,
      });
      await ctx.db.patch(contract._id, { latestVersion: 501 });
      return revisionId;
    });
    const overflowHistory = await admin.query(
      (api as any).submilestone_scope_contracts.getSubmilestoneScopeHistory,
      args,
    );
    expect(overflowHistory?.revisions).toHaveLength(3);
    expect(overflowHistory?.revisions.at(-1)).toMatchObject({
      _id: overflowRevisionId,
      version: 501,
      status: "published",
    });
    expect(overflowHistory?.revisions.at(-1)).not.toHaveProperty(
      "scopeOfWorkTiptapJson",
    );

    await admin.run(async (ctx: any) => {
      await ctx.db.patch(history.contractId, { latestVersion: 500 });
    });
    await expect(
      admin.mutation(
        (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
        args,
      ),
    ).rejects.toThrow(/supported limit/i);
  });

  test("rejects cross-organization history and mutation access", async () => {
    const { admin, base, proposalSubmilestone } = await seedScopeFixture();
    const proposalSubmilestoneArgs = {
      proposalSubmilestoneId: proposalSubmilestone._id,
      workosOrganizationId: ORG,
    };
    const revisionId = await admin.mutation(
      (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
      proposalSubmilestoneArgs,
    );
    const otherOrganizationAdmin = withIdentity(base, OTHER_ORG);
    const otherOrganizationArgs = {
      proposalSubmilestoneId: proposalSubmilestone._id,
      workosOrganizationId: OTHER_ORG,
    };

    await expect(
      otherOrganizationAdmin.query(
        (api as any).submilestone_scope_contracts.getSubmilestoneScopeHistory,
        proposalSubmilestoneArgs,
      ),
    ).rejects.toThrow("Forbidden: organization scope");
    await expect(
      otherOrganizationAdmin.query(
        (api as any).submilestone_scope_contracts
          .getSubmilestoneScopeRevisionContent,
        { revisionId, workosOrganizationId: ORG },
      ),
    ).rejects.toThrow("Forbidden: organization scope");
    await expect(
      otherOrganizationAdmin.mutation(
        (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
        proposalSubmilestoneArgs,
      ),
    ).rejects.toThrow("Forbidden: organization scope");
    await expect(
      otherOrganizationAdmin.mutation(
        (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
        {
          revisionId,
          scopeOfWorkTiptapJson: tiptap("Unauthorized scope update"),
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: organization scope");
    await expect(
      otherOrganizationAdmin.mutation(
        (api as any).submilestone_scope_contracts.publishSubmilestoneScopeRevision,
        {
          changeReason: "Unauthorized publish attempt.",
          revisionId,
          workosOrganizationId: ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: organization scope");

    await expect(
      otherOrganizationAdmin.query(
        (api as any).submilestone_scope_contracts.getSubmilestoneScopeHistory,
        otherOrganizationArgs,
      ),
    ).rejects.toThrow("Forbidden: organization scope");
    await expect(
      otherOrganizationAdmin.mutation(
        (api as any).submilestone_scope_contracts.createSubmilestoneScopeDraft,
        otherOrganizationArgs,
      ),
    ).rejects.toThrow("Forbidden: organization scope");
    await expect(
      otherOrganizationAdmin.mutation(
        (api as any).submilestone_scope_contracts.saveSubmilestoneScopeDraft,
        {
          revisionId,
          scopeOfWorkTiptapJson: tiptap("Unauthorized scope update"),
          workosOrganizationId: OTHER_ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: organization scope");
    await expect(
      otherOrganizationAdmin.mutation(
        (api as any).submilestone_scope_contracts.publishSubmilestoneScopeRevision,
        {
          changeReason: "Unauthorized publish attempt.",
          revisionId,
          workosOrganizationId: OTHER_ORG,
        },
      ),
    ).rejects.toThrow("Forbidden: organization scope");
  });

  test("records borrower acknowledgement per revision and is idempotent", async () => {
    const { admin, base, builder, builderStaff, proposalSubmilestone } =
      await seedScopeFixture();
    const builderRolesA = withIdentity(
      base,
      ORG,
      ["builder", "builder-staff"],
      BUILDER_USER,
    );
    const builderRolesB = withIdentity(
      base,
      ORG,
      ["builder-staff", "builder"],
      BUILDER_USER,
    );
    const v1 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Initial contractual scope.",
    );
    const v2 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Updated contractual scope before approval.",
    );
    await expect(
      admin.mutation(scopeApi.acknowledgeSubmilestoneScopeRevision, {
        idempotencyKey: "scope-admin-impersonation-ack-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/borrower Scope decision authority/i);

    const first = await builderRolesA.mutation(
      scopeApi.acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-ack-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(first).toMatchObject({
      effectiveRevisionId: v2,
      replayed: false,
    });
    const replay = await builderRolesB.mutation(
      scopeApi.acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-ack-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toMatchObject({
      decisionId: first.decisionId,
      effectiveRevisionId: v2,
      replayed: true,
    });
    await expect(
      builderRolesB.mutation(scopeApi.acknowledgeSubmilestoneScopeRevision, {
        idempotencyKey: "scope-ack-v2-002",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/borrower_acknowledged.*already recorded.*duplicate/i);

    const v3 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Third contractual scope before approval.",
    );
    await builderStaff.mutation(
      scopeApi.acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-ack-v3-001",
        revisionId: v3,
        workosOrganizationId: ORG,
      },
    );
    const history = await admin.query(scopeApi.getSubmilestoneScopeHistory, {
      proposalSubmilestoneId: proposalSubmilestone._id,
      workosOrganizationId: ORG,
    });
    expect(history).toMatchObject({ effectiveRevisionId: v3 });
    expect(
      await base.run(async (ctx: any) =>
        ctx.db
          .query("submilestoneScopeDecisions")
          .withIndex("by_contractId_and_idempotencyKey", (query: any) =>
            query.eq("contractId", history.contractId),
          )
          .collect(),
      ),
    ).toHaveLength(2);
    expect(v1).not.toBe(v2);
  });

  test("authorizes a bounded lookup when more than twenty matching links include a valid active link", async () => {
    const { admin, base, builderProfileId, proposalSubmilestone } =
      await seedScopeFixture();
    await base.run(async (ctx: any) => {
      const builderProfile = await ctx.db.get(builderProfileId);
      if (!builderProfile) {
        throw new Error("Expected builder profile fixture row.");
      }
      const now = Date.now();
      for (let index = 0; index < 20; index += 1) {
        await ctx.db.insert("builderAccountLinks", {
          brokerageId: builderProfile.brokerageId,
          builderProfileId,
          createdAt: now + index,
          role: "owner",
          status: "inactive",
          updatedAt: now + index,
          workosUserId: BUILDER_MANY_LINKS_USER,
        });
      }
      await ctx.db.insert("builderAccountLinks", {
        brokerageId: builderProfile.brokerageId,
        builderProfileId,
        createdAt: now + 20,
        role: "owner",
        status: "active",
        updatedAt: now + 20,
        workosUserId: BUILDER_MANY_LINKS_USER,
      });
    });
    const manyLinksBuilder = withIdentity(
      base,
      ORG,
      ["builder"],
      BUILDER_MANY_LINKS_USER,
    );
    const matchingLinkCount = await base.run(async (ctx: any) =>
      ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder_user", (query: any) =>
          query
            .eq("builderProfileId", builderProfileId)
            .eq("workosUserId", BUILDER_MANY_LINKS_USER),
        )
        .collect()
        .then((links: unknown[]) => links.length),
    );
    expect(matchingLinkCount).toBe(21);

    const revisionId = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Scope for bounded matching-link authorization.",
    );
    await expect(
      manyLinksBuilder.mutation(scopeApi.acknowledgeSubmilestoneScopeRevision, {
        idempotencyKey: "scope-ack-many-links-001",
        revisionId,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      effectiveRevisionId: revisionId,
      replayed: false,
    });
  });

  test("requires a trimmed borrower rejection reason and keeps the revision ineffective", async () => {
    const { admin, base, builder, proposalSubmilestone } =
      await seedScopeFixture();
    await publishRevision(admin, proposalSubmilestone._id, "Initial scope.");
    const v2 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Rejected scope revision.",
    );

    for (const reason of ["", "   "]) {
      await expect(
        builder.mutation(scopeApi.rejectSubmilestoneScopeRevision, {
          idempotencyKey: `scope-reject-invalid-${reason.length}`,
          reason,
          revisionId: v2,
          workosOrganizationId: ORG,
        }),
      ).rejects.toThrow(/reason/i);
    }

    await builder.mutation(scopeApi.rejectSubmilestoneScopeRevision, {
      idempotencyKey: "scope-reject-v2-001",
      reason: "  Does not match the agreed borrower scope.  ",
      revisionId: v2,
      workosOrganizationId: ORG,
    });
    const history = await admin.query(scopeApi.getSubmilestoneScopeHistory, {
      proposalSubmilestoneId: proposalSubmilestone._id,
      workosOrganizationId: ORG,
    });
    expect(history?.effectiveRevisionId).not.toBe(v2);
    expect(
      await base.run(async (ctx: any) =>
        ctx.db
          .query("submilestoneScopeDecisions")
          .withIndex("by_revisionId_and_kind", (query: any) =>
            query.eq("revisionId", v2).eq("kind", "borrower_rejected"),
          )
          .unique(),
      ),
    ).toMatchObject({ reason: "Does not match the agreed borrower scope." });

    const replay = await builder.mutation(
      scopeApi.rejectSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-reject-v2-001",
        reason: "Does not match the agreed borrower scope.",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toMatchObject({ replayed: true });
    await expect(
      builder.mutation(scopeApi.rejectSubmilestoneScopeRevision, {
        idempotencyKey: "scope-reject-v2-002",
        reason: "Does not match the agreed borrower scope.",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/borrower_rejected.*already recorded.*duplicate/i);
    await expect(
      builder.mutation(scopeApi.acknowledgeSubmilestoneScopeRevision, {
        idempotencyKey: "scope-ack-rejected-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/conflicts.*borrower_rejected/i);

    const stillRejected = await admin.query(
      scopeApi.getSubmilestoneScopeHistory,
      {
        proposalSubmilestoneId: proposalSubmilestone._id,
        workosOrganizationId: ORG,
      },
    );
    expect(stillRejected?.effectiveRevisionId).not.toBe(v2);
  });

  test("rejects a borrower rejection after acknowledgement on the same revision", async () => {
    const { admin, builder, proposalSubmilestone } = await seedScopeFixture();
    await publishRevision(admin, proposalSubmilestone._id, "Initial scope.");
    const v2 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Acknowledged scope revision.",
    );

    const acknowledgement = await builder.mutation(
      scopeApi.acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-ack-before-reject-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    const acknowledgementReplay = await builder.mutation(
      scopeApi.acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-ack-before-reject-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(acknowledgementReplay).toMatchObject({
      decisionId: acknowledgement.decisionId,
      replayed: true,
    });

    await expect(
      builder.mutation(scopeApi.rejectSubmilestoneScopeRevision, {
        idempotencyKey: "scope-reject-after-ack-v2-001",
        reason: "The borrower changed the requested scope.",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/conflicts.*borrower_acknowledged/i);
  });

  test("requires borrower acknowledgement and lender-admin approval after Proposal approval in either order", async () => {
    const { admin, base, builder, lenderAdmin, proposalId, proposalSubmilestone } =
      await seedScopeFixture();
    const v1 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Initial scope.",
    );
    await base.run((ctx: any) => ctx.db.patch(proposalId, { status: "approved" }));
    const v2 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Approved Proposal scope revision.",
    );

    const approvalFirst = await lenderAdmin.mutation(
      scopeApi.approveSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-approve-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(approvalFirst).toMatchObject({
      effectiveRevisionId: v1,
      replayed: false,
    });
    const approvalReplay = await lenderAdmin.mutation(
      scopeApi.approveSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-approve-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(approvalReplay).toMatchObject({
      decisionId: approvalFirst.decisionId,
      effectiveRevisionId: v1,
      replayed: true,
    });
    await expect(
      lenderAdmin.mutation(scopeApi.approveSubmilestoneScopeRevision, {
        idempotencyKey: "scope-approve-v2-002",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/lender_admin_approved.*already recorded.*duplicate/i);
    const acknowledgementSecond = await builder.mutation(
      scopeApi.acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-ack-approved-v2-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(acknowledgementSecond).toMatchObject({
      effectiveRevisionId: v2,
      replayed: false,
    });

    const v3 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Second approved Proposal scope revision.",
    );
    const acknowledgementFirst = await builder.mutation(
      scopeApi.acknowledgeSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-ack-approved-v3-001",
        revisionId: v3,
        workosOrganizationId: ORG,
      },
    );
    expect(acknowledgementFirst).toMatchObject({
      effectiveRevisionId: v2,
      replayed: false,
    });
    const approvalSecond = await lenderAdmin.mutation(
      scopeApi.approveSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-approve-v3-001",
        revisionId: v3,
        workosOrganizationId: ORG,
      },
    );
    expect(approvalSecond).toMatchObject({
      effectiveRevisionId: v3,
      replayed: false,
    });
    const decisionCount = await base.run(async (ctx: any) => {
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", proposalSubmilestone._id),
        )
        .unique();
      if (!contract) {
        throw new Error("Expected Scope contract fixture row.");
      }
      return await ctx.db
        .query("submilestoneScopeDecisions")
        .withIndex("by_contractId", (query: any) =>
          query.eq("contractId", contract._id),
        )
        .collect();
    });
    expect(decisionCount).toHaveLength(4);
  });

  test("denies broker-staff rejection, approval, and override commands", async () => {
    const { admin, brokerStaff, proposalSubmilestone } =
      await seedScopeFixture();
    await publishRevision(admin, proposalSubmilestone._id, "Initial scope.");
    const v2 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Broker-staff cannot decide.",
    );
    await expect(
      brokerStaff.mutation(scopeApi.rejectSubmilestoneScopeRevision, {
        idempotencyKey: "scope-broker-staff-reject-001",
        reason: "Not authorized.",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Forbidden/i);
    await expect(
      brokerStaff.mutation(scopeApi.approveSubmilestoneScopeRevision, {
        idempotencyKey: "scope-broker-staff-approve-001",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Forbidden/i);
    await expect(
      brokerStaff.mutation(scopeApi.overrideSubmilestoneScopeRevision, {
        idempotencyKey: "scope-broker-staff-override-001",
        reason: "Not authorized.",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/Forbidden/i);
  });

  test("requires an audited lender-admin override reason and records bypasses and effective pointers", async () => {
    const { admin, base, builder, lenderAdmin, proposalSubmilestone } =
      await seedScopeFixture();
    await publishRevision(admin, proposalSubmilestone._id, "Initial scope.");
    const v2 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Borrower-rejected scope.",
    );
    await builder.mutation(scopeApi.rejectSubmilestoneScopeRevision, {
      idempotencyKey: "scope-reject-for-override-001",
      reason: "Borrower requested a correction.",
      revisionId: v2,
      workosOrganizationId: ORG,
    });
    await expect(
      lenderAdmin.mutation(scopeApi.overrideSubmilestoneScopeRevision, {
        idempotencyKey: "scope-override-invalid-001",
        reason: "   ",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/reason/i);

    const result = await lenderAdmin.mutation(
      scopeApi.overrideSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-override-v2-001",
        reason: "  Final authority accepts the documented exception. ",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(result).toMatchObject({
      bypassedDecisionKinds: ["borrower_rejected"],
      effectiveRevisionId: v2,
      replayed: false,
    });
    const replay = await lenderAdmin.mutation(
      scopeApi.overrideSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-override-v2-001",
        reason: "  Final authority accepts the documented exception. ",
        revisionId: v2,
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toMatchObject({ decisionId: result.decisionId, replayed: true });

    const state = await base.run(async (ctx: any) => {
      const decision = await ctx.db.get(result.decisionId);
      const auditRows = await ctx.db.query("auditEvents").collect();
      const contract = await ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (query: any) =>
          query.eq("proposalSubmilestoneId", proposalSubmilestone._id),
        )
        .unique();
      return {
        audit: auditRows.find(
          (row: any) => row.eventType === "submilestone_scope_revision.admin_override",
        ),
        contract,
        decision,
      };
    });
    expect(state.contract?.effectiveRevisionId).toBe(v2);
    expect(state.decision).toMatchObject({
      actorRoles: ["principle-broker"],
      bypassedDecisionKinds: ["borrower_rejected"],
      newEffectiveRevisionId: v2,
      priorEffectiveRevisionId: expect.any(String),
      reason: "Final authority accepts the documented exception.",
    });
    expect(state.audit).toMatchObject({
      actorRoles: ["principle-broker"],
      actorWorkosUserId: PRINCIPLE_BROKER_USER,
      command: "overrideSubmilestoneScopeRevision",
      entityId: String(v2),
      eventType: "submilestone_scope_revision.admin_override",
      newState: expect.stringContaining(String(v2)),
      priorState: expect.stringContaining("effectiveRevisionId"),
      reason: "Final authority accepts the documented exception.",
      warnings: ["bypassed:borrower_rejected"],
      createdAt: expect.any(Number),
    });

    await expect(
      builder.mutation(scopeApi.rejectSubmilestoneScopeRevision, {
        idempotencyKey: "scope-override-v2-001",
        reason: "Different payload.",
        revisionId: v2,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/idempotency key/i);
  });

  test("does not claim a new effective revision when an override targets a stale revision", async () => {
    const { admin, base, lenderAdmin, proposalSubmilestone } =
      await seedScopeFixture();
    const v1 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Initial scope for stale override.",
    );
    const v2 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Current effective scope for stale override.",
    );

    await lenderAdmin.mutation(scopeApi.overrideSubmilestoneScopeRevision, {
      idempotencyKey: "scope-override-current-001",
      reason: "Accept the current documented exception.",
      revisionId: v2,
      workosOrganizationId: ORG,
    });
    const staleOverride = await lenderAdmin.mutation(
      scopeApi.overrideSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-override-stale-001",
        reason: "Record the stale revision review outcome.",
        revisionId: v1,
        workosOrganizationId: ORG,
      },
    );
    expect(staleOverride).toMatchObject({
      effectiveRevisionId: v2,
      replayed: false,
    });

    const replay = await lenderAdmin.mutation(
      scopeApi.overrideSubmilestoneScopeRevision,
      {
        idempotencyKey: "scope-override-stale-001",
        reason: "Record the stale revision review outcome.",
        revisionId: v1,
        workosOrganizationId: ORG,
      },
    );
    expect(replay).toMatchObject({
      decisionId: staleOverride.decisionId,
      effectiveRevisionId: v2,
      replayed: true,
    });

    const state = await base.run(async (ctx: any) => {
      const decision = await ctx.db.get(staleOverride.decisionId);
      const audit = (await ctx.db.query("auditEvents").collect()).find(
        (row: any) =>
          row.entityId === String(v1) &&
          row.eventType === "submilestone_scope_revision.admin_override",
      );
      return { audit, decision };
    });
    expect(state.decision).toMatchObject({
      priorEffectiveRevisionId: v2,
    });
    expect(state.decision).not.toHaveProperty("newEffectiveRevisionId");
    const auditNewState = JSON.parse(state.audit?.newState ?? "{}");
    expect(auditNewState).toMatchObject({
      effectiveRevisionId: String(v2),
    });
    expect(auditNewState).not.toHaveProperty("newEffectiveRevisionId");
  });

  test("builder published Scope reads enforce lineage and omit successor drafts", async () => {
    const {
      admin,
      base,
      builder,
      builderStaff,
      proposalSubmilestone,
    } = await seedScopeFixture();
    const args = {
      proposalSubmilestoneId: proposalSubmilestone._id,
      workosOrganizationId: ORG,
    };

    const v1 = await publishRevision(
      admin,
      proposalSubmilestone._id,
      "Initial published Scope for builder history.",
    );

    const builderHistory = await builder.query(
      scopeApi.getBuilderSubmilestoneScopeHistory,
      args,
    );
    expect(builderHistory).toMatchObject({
      effectiveRevisionId: v1,
      revisions: [
        expect.objectContaining({
          _id: v1,
          // WorkOS users are projected by the webhook sync.  This fixture
          // deliberately leaves that projection empty and verifies the safe
          // raw-ID fallback used for the builder-facing author label.
          authoredByDisplayName: ADMIN_USER,
          status: "published",
          version: 1,
          isEffective: true,
        }),
      ],
    });
    expect(builderHistory).not.toHaveProperty("activeDraftRevisionId");
    expect(builderHistory).not.toHaveProperty("latestVersion");
    expect(builderHistory).not.toHaveProperty("contractId");
    expect(
      builderHistory?.revisions.every(
        (revision: Record<string, unknown>) =>
          revision.status === "published" &&
          !Object.prototype.hasOwnProperty.call(revision, "isActiveDraft"),
      ),
    ).toBe(true);

    const v1Content = await builder.query(
      scopeApi.getBuilderSubmilestoneScopeRevisionContent,
      { revisionId: v1, workosOrganizationId: ORG },
    );
    expect(v1Content).toMatchObject({
      _id: v1,
      scopeOfWorkTiptapJson: tiptap(
        "Initial published Scope for builder history.",
      ),
      status: "published",
      version: 1,
    });
    expect(v1Content).not.toHaveProperty("activeDraftRevisionId");

    // Builder staff follows the same active builder-account link lineage.
    await expect(
      builderStaff.query(scopeApi.getBuilderSubmilestoneScopeHistory, args),
    ).resolves.toMatchObject({ effectiveRevisionId: v1 });

    const v2Draft = await admin.mutation(
      scopeApi.createSubmilestoneScopeDraft,
      args,
    );
    const historyWithDraft = await builder.query(
      scopeApi.getBuilderSubmilestoneScopeHistory,
      args,
    );
    expect(historyWithDraft).toMatchObject({
      effectiveRevisionId: v1,
      revisions: [expect.objectContaining({ _id: v1, version: 1 })],
    });
    expect(historyWithDraft?.revisions).toHaveLength(1);
    expect(historyWithDraft?.revisions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ _id: v2Draft })]),
    );
    expect(historyWithDraft).not.toHaveProperty("activeDraftRevisionId");
    expect(historyWithDraft).not.toHaveProperty("latestVersion");
    await expect(
      builder.query(scopeApi.getBuilderSubmilestoneScopeRevisionContent, {
        revisionId: v2Draft,
        workosOrganizationId: ORG,
      }),
    ).rejects.toThrow(/published Scope unavailable/i);

    const v2Content = tiptap("Published successor Scope for builder history.");
    await admin.mutation(scopeApi.saveSubmilestoneScopeDraft, {
      revisionId: v2Draft,
      scopeOfWorkTiptapJson: v2Content,
      workosOrganizationId: ORG,
    });
    await admin.mutation(scopeApi.publishSubmilestoneScopeRevision, {
      changeReason: "Document the revised builder-visible Scope.",
      revisionId: v2Draft,
      workosOrganizationId: ORG,
    });

    const publishedHistory = await builder.query(
      scopeApi.getBuilderSubmilestoneScopeHistory,
      args,
    );
    expect(publishedHistory?.revisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: v1, status: "published", version: 1 }),
        expect.objectContaining({
          _id: v2Draft,
          changeReason: "Document the revised builder-visible Scope.",
          status: "published",
          version: 2,
        }),
      ]),
    );
    await expect(
      builder.query(scopeApi.getBuilderSubmilestoneScopeRevisionContent, {
        revisionId: v2Draft,
        workosOrganizationId: ORG,
      }),
    ).resolves.toMatchObject({
      _id: v2Draft,
      scopeOfWorkTiptapJson: v2Content,
      status: "published",
      version: 2,
    });

    // `builderQuery` admits admin for shared capability wiring, but the
    // lineage helper still requires a real builder owner/staff account link.
    await expect(
      admin.query(scopeApi.getBuilderSubmilestoneScopeHistory, args),
    ).rejects.toThrow(/published Scope unavailable/i);

    const crossOrganizationBuilder = withIdentity(
      base,
      OTHER_ORG,
      ["builder"],
      BUILDER_USER,
    );
    await expect(
      crossOrganizationBuilder.query(
        scopeApi.getBuilderSubmilestoneScopeHistory,
        args,
      ),
    ).rejects.toThrow(/organization scope/i);

    const assignedContractor = withIdentity(
      base,
      ORG,
      ["contractor"],
      "scope_assigned_contractor",
    );
    await expect(
      assignedContractor.query(
        scopeApi.getBuilderSubmilestoneScopeHistory,
        args,
      ),
    ).rejects.toThrow(/Forbidden: builder/i);
  });
});
