/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_build_collaboration";

function withIdentity(
  t: ReturnType<typeof convexTest>,
  {
    organizationId = ORGANIZATION_ID,
    roles,
    subject,
  }: {
    organizationId?: string;
    roles: string[];
    subject: string;
  },
) {
  return t.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
  } as never);
}

async function seedActiveBuild() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, {
    roles: ["admin", "principle-broker"],
    subject: "user_admin",
  });
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID },
  );
  const buildId = await admin.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 500_000_00,
      buildName: "147 Cedar Ridge",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 1_000_000_00,
      location: "147 Cedar Ridge Road",
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
      },
    );
    const activeBuildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "147 Cedar Ridge",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-07-28",
      status: "active",
      totalBudgetCents: 2_400_000_00,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, {
      activeBuildId,
      workflowRuleSnapshotId,
    });
    return activeBuildId;
  });

  return { admin, base, buildId };
}

async function addBuildParticipant(
  t: ReturnType<typeof convexTest>,
  {
    buildId,
    displayName,
    role,
    subject,
  }: {
    buildId: string;
    displayName: string;
    role:
      | "admin"
      | "principle-broker"
      | "broker"
      | "builder"
      | "broker-staff"
      | "builder-staff"
      | "homeowner"
      | "contractor";
    subject: string;
  },
) {
  await t.run(async (ctx) => {
    const normalizedBuildId = ctx.db.normalizeId("activeBuilds", buildId);
    if (!normalizedBuildId) {
      throw new Error("Active Build fixture is unavailable.");
    }
    const build = await ctx.db.get(normalizedBuildId);
    if (!build) {
      throw new Error("Active Build fixture is unavailable.");
    }
    const now = Date.now();
    await ctx.db.insert("buildParticipants", {
      brokerageId: build.brokerageId,
      buildId: normalizedBuildId,
      createdAt: now,
      displayNameSnapshot: displayName,
      joinedAt: now,
      organizationId: build.organizationId,
      participationPeriod: 1,
      role,
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: subject,
    });
  });
}

describe("Build collaboration publication and feed", () => {
  test("publishes only through the authenticated human and returns the visible post", async () => {
    const { admin, buildId } = await seedActiveBuild();

    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Footing inspection complete.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text: "Footing inspection complete.", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );

    const feed = await admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );

    expect(feed.page).toHaveLength(1);
    expect(feed.page[0]).toMatchObject({
      kind: "post",
      post: {
        _id: postId,
        agentDrafted: false,
        authorWorkosUserId: "user_admin",
        source: "human",
      },
      revision: {
        plainText: "Footing inspection complete.",
      },
    });
  });

  test("rejects an agent-authored publication attempt", async () => {
    const { base, buildId } = await seedActiveBuild();
    const agent = withIdentity(base, {
      roles: ["agent"],
      subject: "agent_build_collaboration",
    });

    await expect(
      agent.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "build_wide",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Publish this without a human.",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          tiptapJson: JSON.stringify({
            content: [],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow();
  });

  test("publishes an agent-prepared draft only after human approval and preserves the human author", async () => {
    const { admin, buildId } = await seedActiveBuild();
    const draftId = await admin.mutation(
      (api as any).build_collaboration_drafts
        .saveMyBuildCollaborationDraft,
      {
        acknowledgementRequired: false,
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Prepared by the Build agent for human review.",
        postType: "update",
        preparedByAgent: true,
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Prepared by the Build agent for human review.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );

    const postId = await admin.mutation(
      (api as any).build_collaboration_drafts
        .approveAndPublishBuildCollaborationDraft,
      { buildId, draftId, organizationId: ORGANIZATION_ID },
    );
    const result = await admin.run(async (ctx) => {
      const post = await ctx.db.get(postId);
      const approvals = await ctx.db
        .query("buildCollaborationPublicationApprovals")
        .collect();
      return {
        approvals: approvals.filter(
          (approval) => approval.draftId === draftId,
        ),
        post,
      };
    });

    expect(result.post).toMatchObject({
      agentDrafted: true,
      authorWorkosUserId: "user_admin",
      source: "human",
    });
    expect(result.approvals).toMatchObject([
      {
        approvingWorkosUserId: "user_admin",
        state: "published",
      },
    ]);
  });

  test("requires and records acknowledgement only for an authorized lower-tier participant", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Builder Staff",
      role: "builder-staff",
      subject: "user_builder_staff",
    });
    const postId = await admin.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        acknowledgementRequired: true,
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Acknowledge the revised site access policy.",
        postType: "announcement",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Acknowledge the revised site access policy.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    const builderStaff = withIdentity(base, {
      roles: ["builder-staff"],
      subject: "user_builder_staff",
    });

    const before = await builderStaff.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    expect(before.page[0].acknowledgement).toMatchObject({
      acknowledged: false,
      required: true,
    });

    await builderStaff.mutation(
      (api as any).build_collaboration_acknowledgements
        .acknowledgeBuildCollaborationPost,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );
    const after = await builderStaff.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    expect(after.page[0].acknowledgement).toMatchObject({
      acknowledged: true,
      required: true,
    });
  });

  test("returns a metadata-free placeholder when a lower-tier participant cannot read a post", async () => {
    const { base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Builder Staff",
      role: "builder-staff",
      subject: "user_builder_staff",
    });
    await addBuildParticipant(base, {
      buildId,
      displayName: "Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const builderStaff = withIdentity(base, {
      roles: ["builder-staff"],
      subject: "user_builder_staff",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    await builderStaff.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "author_tier_and_higher",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Lender and builder coordination only.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                { text: "Lender and builder coordination only.", type: "text" },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );

    const feed = await contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );

    expect(feed.page).toEqual([
      {
        kind: "restricted",
        placeholderKey: "restricted-djb2-e64cc199",
      },
    ]);
    expect(JSON.stringify(feed.page)).not.toContain("Lender");
    expect(JSON.stringify(feed.page)).not.toContain("user_builder_staff");
  });

  test("prevents a contractor from restricting a post away from higher roles", async () => {
    const { base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });

    await expect(
      contractor.mutation(
        (api as any).build_collaboration
          .approveAndPublishBuildCollaborationBundle,
        {
          actionItems: [],
          audienceMode: "custom",
          buildId,
          organizationId: ORGANIZATION_ID,
          plainText: "Hide this from the broker.",
          postType: "update",
          references: [],
          requestedReaderIds: ["user_contractor"],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [{ text: "Hide this from the broker.", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ),
    ).rejects.toThrow("Custom audiences are unavailable");
  });

  test("exposes timestamped seen markers only upward through the hierarchy", async () => {
    const { admin, base, buildId } = await seedActiveBuild();
    await addBuildParticipant(base, {
      buildId,
      displayName: "Contractor",
      role: "contractor",
      subject: "user_contractor",
    });
    const contractor = withIdentity(base, {
      roles: ["contractor"],
      subject: "user_contractor",
    });
    const postId = await contractor.mutation(
      (api as any).build_collaboration
        .approveAndPublishBuildCollaborationBundle,
      {
        actionItems: [],
        audienceMode: "build_wide",
        buildId,
        organizationId: ORGANIZATION_ID,
        plainText: "Forms stripped on the east elevation.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [
                {
                  text: "Forms stripped on the east elevation.",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    );
    await contractor.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );
    await admin.mutation(
      (api as any).build_collaboration_threads
        .markBuildCollaborationPostViewed,
      { buildId, organizationId: ORGANIZATION_ID, postId },
    );

    const adminFeed = await admin.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    const contractorFeed = await contractor.query(
      (api as any).build_collaboration.listBuildCollaborationFeed,
      {
        buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );

    expect(adminFeed.page[0].receipts).toMatchObject([
      {
        viewerRole: "contractor",
        workosUserId: "user_contractor",
      },
    ]);
    expect(contractorFeed.page[0].receipts).toEqual([]);
    expect(JSON.stringify(contractorFeed.page[0])).not.toContain("user_admin");
  });
});
