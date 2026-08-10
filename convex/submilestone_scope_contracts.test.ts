/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORG = "org_submilestone_scope_contract";
const OTHER_ORG = "org_other_scope";

function withIdentity(t: any, organizationId = ORG) {
  return t.withIdentity({
    email: "scope-admin@example.com",
    name: "Scope Admin",
    organizationId,
    role: "admin",
    roles: ["admin"],
    subject: `scope_admin_${organizationId}`,
    tokenIdentifier: `https://api.workos.com/|scope_admin_${organizationId}`,
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
      assignedBrokerWorkosUserId: `scope_admin_${ORG}`,
      borrowerCoPayBps: 2_000,
      borrowerStartingCashCents: 35_000_000,
      borrowerWorkingCapitalLimitCents: 35_000_000,
      brokerageId,
      buildName: "Scope contract fixture",
      builderProfileId,
      createdAt: now,
      createdByWorkosUserId: `scope_admin_${ORG}`,
      interestAnnualBps: 925,
      lenderDrawPolicyLimitCents: 55_000_000,
      location: "10 Scope Contract Lane",
      organizationId: ORG,
      reviewOutcome: "none",
      status: "draft",
      totalBudgetCents: 25_000_000,
      updatedAt: now,
      updatedByWorkosUserId: `scope_admin_${ORG}`,
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
    const proposalSubmilestone = await ctx.db.get(proposalSubmilestoneId);
    if (!proposalSubmilestone) {
      throw new Error("Expected one proposal Sub-milestone fixture.");
    }
    return { proposalId, proposalSubmilestone };
  });
  return { admin, base, ...fixture };
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

  // SFG-05 owns the decision commands and their behavioral coverage. Keep
  // these scenarios explicit until the command implementation is delivered.
  test.todo(
    "SFG-05: borrower acknowledgement records a decision per revision and allows the acknowledged revision to become effective",
  );
  test.todo(
    "SFG-05: borrower rejection requires a non-empty reason, records it per revision, and prevents that revision from becoming effective",
  );
  test.todo(
    "SFG-05: a revision published after Proposal approval or Build activation requires both borrower acknowledgement and lender-admin approval, in either order",
  );
  test.todo(
    "SFG-05: broker-staff cannot reject, approve, or override a Scope revision",
  );
  test.todo(
    "SFG-05: lender-admin rejection override requires a non-empty reason and records an audited outcome with actor, roles, bypassed gates, prior revision, and new revision",
  );
});
