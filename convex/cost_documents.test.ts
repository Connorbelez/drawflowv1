/// <reference types="vite/client" />

import resendTest from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_cost_documents";

describe("Cost Document public contract", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv(
      "RESEND_FROM_EMAIL",
      "DrawFlow <notifications@updates.fairlend.ca>"
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("submits, reads, and privately downloads one immutable multi-page Invoice", async () => {
    const fixture = await seedFixture();
    const firstPageId = await stageAvailableAsset(fixture, "invoice-page-1.pdf");
    const secondPageId = await stageAvailableAsset(
      fixture,
      "invoice-page-2.pdf"
    );
    const before = await downstreamSnapshot(fixture);

    const costDocumentId: Id<"costDocuments"> = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocument,
      {
        allocations: [
          {
            amountCents: 12_345,
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          },
        ],
        buildId: fixture.buildId,
        category: "labour",
        currency: "CAD",
        description: "Concrete forming and labour.",
        documentDate: "2026-08-01",
        grossTotalCents: 12_345,
        kind: "invoice",
        organizationId: ORGANIZATION_ID,
        pageAssetIds: [firstPageId, secondPageId],
        title: "Foundation invoice",
        vendorName: "Cedar Forming Ltd.",
      }
    );

    const result = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(result).toMatchObject({
      _id: costDocumentId,
      allocations: [
        {
          amountCents: 12_345,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
          order: 1,
        },
      ],
      category: "labour",
      currency: "CAD",
      grossTotalCents: 12_345,
      kind: "invoice",
      pages: [
        { assetId: firstPageId, order: 1 },
        { assetId: secondPageId, order: 2 },
      ],
      state: "submitted",
      supportingContextDisclosure:
        "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.",
      title: "Foundation invoice",
      uploaderWorkosUserId: "builder_owner",
      vendorName: "Cedar Forming Ltd.",
    });

    const pageUrl = await fixture.builder.mutation(
      (api as any).cost_documents.authorizeCostDocumentPageDownload,
      {
        assetId: firstPageId,
        buildId: fixture.buildId,
        costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(pageUrl).toContain("http");

    const persisted = await fixture.base.run(async (ctx) => ({
      activities: await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(costDocumentId))
        )
        .collect(),
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "costDocument")
            .eq("entityId", String(costDocumentId))
        )
        .collect(),
      receipts: await ctx.db
        .query("emailMessages")
        .withIndex("by_entity_and_createdAt", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(costDocumentId))
        )
        .collect(),
    }));
    expect(persisted.audits.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "cost_document.submitted",
        "cost_document.page_download_authorized",
      ])
    );
    expect(persisted.activities).toHaveLength(1);
    expect(persisted.receipts).toHaveLength(1);
    expect(persisted.receipts[0]).toMatchObject({
      recipientEmail: "builder_owner@example.com",
      status: "queued",
    });
    expect(await downstreamSnapshot(fixture)).toEqual(before);
  });

  test("rejects incomplete, invalid, mismatched, unavailable, and cross-tenant submissions without receipts", async () => {
    const fixture = await seedFixture();
    const availableAssetId = await stageAvailableAsset(
      fixture,
      "valid-invoice.pdf"
    );
    const unavailableAssetId = await stageAsset(
      fixture,
      "unscanned-invoice.pdf",
      false
    );
    const valid = submissionArgs(fixture, availableAssetId);

    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocument,
        { ...valid, title: "" }
      )
    ).rejects.toThrow("Title is required");
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocument,
        { ...valid, grossTotalCents: 0 }
      )
    ).rejects.toThrow("positive integer");
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocument,
        {
          ...valid,
          allocations: [
            {
              amountCents: 12_344,
              buildSubmilestoneId: fixture.buildSubmilestoneId,
            },
          ],
        }
      )
    ).rejects.toThrow("equal the Gross Document Total exactly");
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocument,
        { ...valid, pageAssetIds: [unavailableAssetId] }
      )
    ).rejects.toThrow("source page must be available");
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocument,
        { ...valid, currency: "USD" }
      )
    ).rejects.toThrow();
    const otherTenantBuilder = withIdentity(
      fixture.base,
      { roles: ["builder"], subject: "cross_tenant_builder" },
      "org_other"
    );
    await expect(
      otherTenantBuilder.mutation(
        (api as any).cost_documents.submitCostDocument,
        valid
      )
    ).rejects.toThrow("Forbidden");

    const rejectedState = await fixture.base.run(async (ctx) => ({
      documents: await ctx.db.query("costDocuments").collect(),
      receipts: await ctx.db.query("emailMessages").collect(),
    }));
    expect(rejectedState).toEqual({ documents: [], receipts: [] });
  });
});

function withIdentity(
  t: ReturnType<typeof convexTest>,
  input: { roles: string[]; subject: string },
  organizationId = ORGANIZATION_ID
) {
  return t.withIdentity({
    email: `${input.subject}@example.com`,
    name: input.subject,
    organizationId,
    role: input.roles[0],
    roles: input.roles,
    subject: input.subject,
    tokenIdentifier: `https://api.workos.com/|${input.subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
}

async function seedFixture() {
  const base = convexTest(schema, modules);
  resendTest.register(base);
  const admin = withIdentity(base, {
    roles: ["admin", "principle-broker"],
    subject: "admin",
  });
  const builder = withIdentity(base, {
    roles: ["builder"],
    subject: "builder_owner",
  });
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const seeded = await base.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("builderAccountLinks", {
      assignedEmail: "builder_owner@example.com",
      brokerageId: foundation.brokerageId,
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      role: "owner",
      status: "active",
      updatedAt: now,
      workosUserId: "builder_owner",
    });
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "admin",
      brokerageId: foundation.brokerageId,
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      buildName: "147 Cedar Ridge",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "admin",
    });
    const workflowRuleSnapshotId = await ctx.db.insert(
      "workflowRuleSnapshots",
      {
        allowPermitWaiverByRoles: ["admin"],
        brokerageId: foundation.brokerageId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalStates: ["approved"],
        requirePermitForApproval: false,
        ruleKey: "default",
        settings: {},
        version: 1,
        workflowRuleId: foundation.workflowRuleId,
      }
    );
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "147 Cedar Ridge",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-07-28",
      status: "active",
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId });
    await ctx.db.insert("buildCollaborationTenantSettings", {
      activatedAt: now,
      activatedByWorkosUserId: "admin",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      generousRateLimitMultiplier: 1,
      migrationCompletedAt: now,
      organizationId: ORGANIZATION_ID,
      status: "active",
      updatedAt: now,
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 50_000_000,
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 40_000_000,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert(
      "proposalSubmilestones",
      {
        brokerageId: foundation.brokerageId,
        createdAt: now,
        key: "footings",
        milestoneKey: "foundation",
        name: "Footings",
        order: 1,
        organizationId: ORGANIZATION_ID,
        proposalId,
        proposalMilestoneId,
        updatedAt: now,
      }
    );
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 50_000_000,
      buildId,
      createdAt: now,
      dayEnd: 20,
      dayStart: 0,
      dependencyKeys: [],
      drawAvailabilityCents: 40_000_000,
      durationDays: 20,
      key: "foundation",
      name: "Foundation",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalMilestoneId,
      status: "in_progress",
      updatedAt: now,
    });
    const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: foundation.brokerageId,
      buildId,
      buildMilestoneId,
      createdAt: now,
      key: "footings",
      milestoneKey: "foundation",
      name: "Footings",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalSubmilestoneId,
      status: "planned",
      updatedAt: now,
    });
    return { buildId, buildSubmilestoneId };
  });
  return { admin, base, builder, ...seeded };
}

async function stageAvailableAsset(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  fileName: string
) {
  return await stageAsset(fixture, fileName, true);
}

async function stageAsset(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  fileName: string,
  scanClean: boolean
) {
  const staged = await fixture.builder.mutation(
    (api as any).build_collaboration_assets.beginBuildCollaborationAssetUpload,
    {
      buildId: fixture.buildId,
      contextKind: "composer",
      fileName,
      mimeType: "application/pdf",
      organizationId: ORGANIZATION_ID,
      sizeBytes: fileName.length,
    }
  );
  const storageId = await fixture.base.run((ctx) =>
    ctx.storage.store(new Blob([fileName], { type: "application/pdf" }))
  );
  const contentHashSha256 = fileName.startsWith("invoice-page-1")
    ? "a".repeat(64)
    : "b".repeat(64);
  const assetId: Id<"buildCollaborationAssets"> =
    await fixture.builder.mutation(
      (api as any).build_collaboration_assets
        .finalizeBuildCollaborationAssetUpload,
      {
        buildId: fixture.buildId,
        contentHashSha256,
        fileName,
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        stagingSessionId: staged.stagingSessionId,
        storageId,
      }
    );
  if (scanClean) {
    await fixture.base.mutation(
      (internal as any).build_collaboration_asset_maintenance
        .recordBuildCollaborationAssetScanResult,
      {
        assetId,
        computedHashSha256: contentHashSha256,
        outcome: "clean",
        provider: "test-scanner",
      }
    );
  }
  return assetId;
}

function submissionArgs(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  assetId: Id<"buildCollaborationAssets">
) {
  return {
    allocations: [
      {
        amountCents: 12_345,
        buildSubmilestoneId: fixture.buildSubmilestoneId,
      },
    ],
    buildId: fixture.buildId,
    category: "labour" as const,
    currency: "CAD" as const,
    description: "Concrete forming and labour.",
    documentDate: "2026-08-01",
    grossTotalCents: 12_345,
    kind: "invoice" as const,
    organizationId: ORGANIZATION_ID,
    pageAssetIds: [assetId],
    title: "Foundation invoice",
    vendorName: "Cedar Forming Ltd.",
  };
}

async function downstreamSnapshot(
  fixture: Awaited<ReturnType<typeof seedFixture>>
) {
  return await fixture.base.run(async (ctx) => ({
    build: await ctx.db.get(fixture.buildId),
    draws: await ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
      .collect(),
    milestone: await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
      .first(),
    submilestone: await ctx.db.get(fixture.buildSubmilestoneId),
  }));
}
