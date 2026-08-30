/// <reference types="vite/client" />

import resendTest from "@convex-dev/resend/test";
import workpoolTest from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_cost_documents";
type CostDocumentFixture = Awaited<ReturnType<typeof seedFixture>>;
type CostDocumentActor = ReturnType<typeof withIdentity>;

if (false) {
  // @ts-expect-error The storage authorizer is intentionally HTTP-internal only.
  void api.cost_documents.authorizeCostDocumentPageDownload;
}

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
    const batchId = await createBatch(fixture, "multi-page-submission");
    const draftId = await addDraft(fixture, batchId, "invoice", "labour");
    const firstPageId = await stageDraftAsset(
      fixture,
      draftId,
      "invoice-page-1.pdf"
    );
    const secondPageId = await stageDraftAsset(
      fixture,
      draftId,
      "invoice-page-2.pdf"
    );
    const before = await downstreamSnapshot(fixture);
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 12_345,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      description: "Concrete forming and labour.",
      documentDate: "2026-08-01",
      grossTotalCents: 12_345,
      pageAssetIds: [firstPageId, secondPageId],
      title: "Foundation invoice",
      vendorName: "Cedar Forming Ltd.",
    });
    await completeDraft(fixture, draftId);
    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "multi-page-submission-submit",
      }
    );
    const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    expect(costDocumentId).toBeDefined();

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
      activity: [{ eventType: "cost_document.submitted" }],
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
      vendorName: "Cedar Forming Ltd.",
    });
    expect(result?.vendor).toEqual({
      displayName: "Cedar Forming Ltd.",
      partyType: "vendor",
      resolution: "unresolved_legacy",
    });
    expect(result).not.toHaveProperty("receipt");
    expect(result).not.toHaveProperty("uploaderEmailSnapshot");
    expect(result).not.toHaveProperty("uploaderWorkosUserId");
    await expect(
      fixture.builder.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: "not-an-id",
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      fixture.builder.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();

    const pagePath = `/api/cost-documents/page?${new URLSearchParams({
      assetId: firstPageId,
      buildId: fixture.buildId,
      costDocumentId,
      organizationId: ORGANIZATION_ID,
    }).toString()}`;
    expect(pagePath).not.toContain("/api/storage/");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("private invoice page", {
        headers: { "Content-Type": "application/pdf" },
        status: 200,
      })
    );
    const pageResponse = await fixture.builder.fetch(pagePath, {
      headers: {
        Authorization: "Bearer test-auth-token",
        Origin: "http://localhost:3000",
      },
    });
    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get("Cache-Control")).toContain("no-store");
    expect(pageResponse.headers.get("Content-Disposition")).toContain(
      "invoice-page-1.pdf"
    );
    expect(await pageResponse.text()).toBe("private invoice page");

    const afterDownload = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(
      afterDownload.activity.map(
        (event: { eventType: string }) => event.eventType
      )
    ).toEqual([
      "cost_document.page_download_authorized",
      "cost_document.submitted",
    ]);
    expect(await downstreamSnapshot(fixture)).toEqual(before);

    await fixture.base.run(async (ctx) => {
      const link = await ctx.db
        .query("builderAccountLinks")
        .withIndex("by_builder_user", (query) =>
          query
            .eq("builderProfileId", fixture.builderProfileId)
            .eq("workosUserId", "builder_owner")
        )
        .first();
      if (link) {
        await ctx.db.patch(link._id, { status: "inactive", updatedAt: Date.now() });
      }
    });
    const revokedResponse = await fixture.builder.fetch(pagePath, {
      headers: {
        Authorization: "Bearer test-auth-token",
        Origin: "http://localhost:3000",
      },
    });
    expect(revokedResponse.status).toBe(403);
  });

  test("links vendor identity and lists linked history across Builds", async () => {
    const fixture = await seedFixture();
    const vendorOptions = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentVendorOptions,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        search: "Cedar Forming",
      }
    );
    expect(vendorOptions).toEqual([
      expect.objectContaining({
        name: "Cedar Forming Ltd.",
        partyType: "contractor",
        profileId: fixture.vendorProfileId,
      }),
    ]);

    const batchId = await createBatch(fixture, "linked-vendor-history");
    const draftId = await addDraft(fixture, batchId, "invoice", "labour");
    const assetId = await stageDraftAsset(fixture, draftId, "linked-vendor.pdf");
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 12_000,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-01",
      grossTotalCents: 12_000,
      pageAssetIds: [assetId],
      title: "Linked vendor invoice",
      vendorName: "Stale free-text value",
      vendorProfileId: fixture.vendorProfileId,
    });
    await completeDraft(fixture, draftId);
    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "linked-vendor-history-submit",
      }
    );
    const linkedCostDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    const linkedDocument = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId: linkedCostDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(linkedDocument).toMatchObject({
      vendor: {
        displayName: "Cedar Forming Ltd.",
        partyType: "contractor",
        profileId: fixture.vendorProfileId,
        resolution: "linked",
      },
      vendorName: "Cedar Forming Ltd.",
    });

    const secondBuildId = await addSecondAccessibleBuild(fixture);
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(secondBuildId);
      if (!build) {
        throw new Error("Missing second Cost Document history build");
      }
      const now = Date.now();
      await ctx.db.insert("costDocuments", {
        brokerageId: build.brokerageId,
        buildId: secondBuildId,
        category: "materials",
        createdAt: now,
        currency: "CAD",
        documentDate: "2026-08-02",
        grossTotalCents: 3_210,
        kind: "receipt",
        organizationId: ORGANIZATION_ID,
        state: "submitted",
        submittedAt: now,
        title: "Linked vendor receipt",
        uploaderEmailSnapshot: "builder_owner@example.com",
        uploaderWorkosUserId: "builder_owner",
        vendorName: "Cedar Forming Ltd. snapshot",
        vendorProfileId: fixture.vendorProfileId,
      });
    });

    const history = await fixture.admin.query(
      (api as any).cost_documents.listCostDocumentsByVendor,
      {
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
        vendorProfileId: fixture.vendorProfileId,
      }
    );
    expect(history.page).toHaveLength(2);
    expect(history.page.map((document: { buildName: string }) => document.buildName)).toEqual(
      expect.arrayContaining(["147 Cedar Ridge", "148 Cedar Ridge"])
    );
    expect(history.page.every((document: { vendor: { profileId?: string } }) =>
      document.vendor.profileId === fixture.vendorProfileId
    )).toBe(true);
  });

  test("creates an organization-scoped party and returns it for immediate selection", async () => {
    const fixture = await seedFixture();
    const result = await fixture.builder.mutation(
      (api as any).cost_documents.createCostDocumentVendorProfile,
      {
        buildId: fixture.buildId,
        city: "Toronto",
        email: "accounts@northstar.example",
        name: "Northstar Supply",
        organizationId: ORGANIZATION_ID,
        partyType: "supplier",
      }
    );

    expect(result).toMatchObject({
      created: true,
      duplicateOptions: [],
      option: {
        city: "Toronto",
        email: "accounts@northstar.example",
        name: "Northstar Supply",
        partyType: "supplier",
      },
    });
    const option = result.option as { profileId: Id<"contractorProfiles"> };
    expect(option.profileId).toBeDefined();

    const options = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentVendorOptions,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        search: "Northstar",
      }
    );
    expect(options).toEqual([
      expect.objectContaining({
        name: "Northstar Supply",
        partyType: "supplier",
        profileId: option.profileId,
      }),
    ]);

    await fixture.base.run(async (ctx) => {
      const profile = await ctx.db.get(option.profileId);
      expect(profile).toMatchObject({
        brokerageId: fixture.brokerageId,
        costDocumentPartyType: "supplier",
        organizationId: ORGANIZATION_ID,
        quoteRecipientCapabilities: ["supplier"],
        status: "active",
      });
    });

    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.createCostDocumentVendorProfile,
        {
          buildId: fixture.buildId,
          email: "accounts@northstar.example",
          name: "Northstar Supply (duplicate email)",
          organizationId: ORGANIZATION_ID,
          partyType: "supplier",
        }
      )
    ).resolves.toMatchObject({
      created: false,
      option: { profileId: option.profileId },
    });
    const matchingProfiles = await fixture.base.run(async (ctx) =>
      ctx.db
        .query("contractorProfiles")
        .withIndex("by_brokerage_normalized_email", (query) =>
          query
            .eq("brokerageId", fixture.brokerageId)
            .eq("normalizedEmail", "accounts@northstar.example")
        )
        .filter((query) =>
          query.and(
            query.eq(query.field("organizationId"), ORGANIZATION_ID),
            query.eq(query.field("status"), "active")
          )
        )
        .collect()
    );
    expect(matchingProfiles).toHaveLength(1);
    expect(matchingProfiles[0]?._id).toBe(option.profileId);
  });

  test("reports and enforces no inline party permission for a read-only Broker", async () => {
    const fixture = await seedFixture();
    const broker = withIdentity(fixture.base, {
      roles: ["broker"],
      subject: "read_only_broker",
    });
    await addActiveBuildParticipant(fixture, {
      role: "broker",
      subject: "read_only_broker",
    });

    await expect(
      broker.query((api as any).cost_documents.getCostDocumentVendorCreateAccess, {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toEqual({ canCreate: false });
    await expect(
      broker.mutation(
        (api as any).cost_documents.createCostDocumentVendorProfile,
        {
          buildId: fixture.buildId,
          name: "Blocked Party",
          organizationId: ORGANIZATION_ID,
          partyType: "vendor",
        }
      )
    ).rejects.toThrow(/permission to create a party/i);
  });

  test("detects an exact-email duplicate outside the capped typeahead window", async () => {
    const fixture = await seedFixture();
    const lateProfileId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 301; index += 1) {
        await ctx.db.insert("contractorProfiles", {
          brokerageId: fixture.brokerageId,
          createdAt: now + index,
          name: `Party ${String(index).padStart(3, "0")}`,
          organizationId: ORGANIZATION_ID,
          quoteRecipientCapabilities: ["supplier"],
          status: "active",
          trades: [],
          updatedAt: now + index,
        });
      }
      return await ctx.db.insert("contractorProfiles", {
        brokerageId: fixture.brokerageId,
        createdAt: now + 302,
        email: "late@example.com",
        name: "Zebra Supply",
        normalizedEmail: "late@example.com",
        organizationId: ORGANIZATION_ID,
        quoteRecipientCapabilities: ["supplier"],
        status: "active",
        trades: [],
        updatedAt: now + 302,
      });
    });

    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.createCostDocumentVendorProfile,
        {
          buildId: fixture.buildId,
          email: "LATE@example.com",
          name: "A different name",
          organizationId: ORGANIZATION_ID,
          partyType: "supplier",
        }
      )
    ).resolves.toMatchObject({
      created: false,
      option: { profileId: lateProfileId },
    });
  });

  test("creates one immutable Receipt communication intent atomically and replays without duplicating it", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "receipt-email-atomic");
    const draftId = await addDraft(fixture, batchId, "receipt", "materials");
    const assetId = await stageDraftAsset(fixture, draftId, "receipt.pdf");
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 7_500,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 7_500,
      pageAssetIds: [assetId],
      title: "Foundation receipt",
      vendorName: "Cedar Supply Ltd.",
    });
    await completeDraft(fixture, draftId);

    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "receipt-email-atomic-submit",
      }
    );
    const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    const intents = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex("by_relatedEntityType_and_relatedEntityId_and_createdAt", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(costDocumentId))
        )
        .collect()
    );
    expect(intents).toEqual([
      expect.objectContaining({
        idempotencyKey: `cost-document:${costDocumentId}:submitted-receipt`,
        kind: "cost_document_receipt",
        recipientEmailSnapshot: "builder_owner@example.com",
        relatedEntityId: String(costDocumentId),
        relatedEntityType: "costDocument",
        status: "pending",
        templateKey: "cost_document_upload_receipt_v1",
      }),
    ]);
    expect(
      await fixture.base.run(async (ctx) =>
        await ctx.db
          .query("emailMessages")
          .withIndex("by_entity_and_createdAt", (query) =>
            query
              .eq("relatedEntityType", "costDocument")
              .eq("relatedEntityId", String(costDocumentId))
          )
          .collect()
      )
    ).toEqual([]);

    const replay = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "receipt-email-atomic-submit",
      }
    );
    expect(replay).toEqual({ ...submitted, replayed: true });
    const intentsAfterReplay = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex("by_relatedEntityType_and_relatedEntityId_and_createdAt", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(costDocumentId))
        )
        .collect()
    );
    expect(intentsAfterReplay).toHaveLength(1);
  });

  test("submits with the uniquely projected verified WorkOS email when the token omits email", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "projected-receipt-email");
    const draftId = await addDraft(fixture, batchId, "receipt", "materials");
    const assetId = await stageDraftAsset(
      fixture,
      draftId,
      "projected-receipt-email.pdf"
    );
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 7_500,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 7_500,
      pageAssetIds: [assetId],
      title: "Projected email receipt",
      vendorName: "Cedar Supply Ltd.",
    });
    await completeDraft(fixture, draftId);
    const builderWithoutEmail = fixture.base.withIdentity({
      name: "builder_owner",
      organizationId: ORGANIZATION_ID,
      role: "builder",
      roles: ["builder"],
      subject: "builder_owner",
      tokenIdentifier: "https://api.workos.com/|builder_owner",
      "https://fairlend.ca/actor_kind": "human",
    } as never);

    const submitted = await builderWithoutEmail.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "projected-receipt-email-submit",
      }
    );
    const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    const intents = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("communicationIntents")
        .withIndex(
          "by_relatedEntityType_and_relatedEntityId_and_createdAt",
          (query) =>
            query
              .eq("relatedEntityType", "costDocument")
              .eq("relatedEntityId", String(costDocumentId))
        )
        .collect()
    );
    expect(intents).toEqual([
      expect.objectContaining({
        recipientEmailSnapshot: "builder_owner@example.com",
      }),
    ]);
  });

  test("submits with the signed-in session email when the projected WorkOS email is unverified", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "unverified-receipt-email");
    const draftId = await addDraft(fixture, batchId, "receipt", "materials");
    const assetId = await stageDraftAsset(
      fixture,
      draftId,
      "unverified-receipt-email.pdf"
    );
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 7_500,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 7_500,
      pageAssetIds: [assetId],
      title: "Unverified email receipt",
      vendorName: "Cedar Supply Ltd.",
    });
    await completeDraft(fixture, draftId);
    await fixture.base.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_workos_user_id", (query) =>
          query.eq("workosUserId", "builder_owner")
        )
        .unique();
      if (!user) {
        throw new Error("Missing builder owner identity fixture");
      }
      await ctx.db.patch(user._id, { emailVerified: false });
    });

    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "unverified-receipt-email-submit",
      }
    );
    const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    const intents = await fixture.base.run(
      async (ctx) =>
        await ctx.db
          .query("communicationIntents")
          .withIndex(
            "by_relatedEntityType_and_relatedEntityId_and_createdAt",
            (query) =>
              query
                .eq("relatedEntityType", "costDocument")
                .eq("relatedEntityId", String(costDocumentId))
          )
          .collect()
    );
    expect(intents).toEqual([
      expect.objectContaining({
        recipientEmailSnapshot: "builder_owner@example.com",
      }),
    ]);
  });

  test("rejects a signed-in email that disagrees with the projected WorkOS email", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "mismatched-receipt-email");
    const draftId = await addDraft(fixture, batchId, "receipt", "materials");
    const assetId = await stageDraftAsset(
      fixture,
      draftId,
      "mismatched-receipt-email.pdf"
    );
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 7_500,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 7_500,
      pageAssetIds: [assetId],
      title: "Mismatched email receipt",
      vendorName: "Cedar Supply Ltd.",
    });
    await completeDraft(fixture, draftId);
    const mismatchedBuilder = fixture.base.withIdentity({
      email: "other-identity@example.com",
      name: "builder_owner",
      organizationId: ORGANIZATION_ID,
      role: "builder",
      roles: ["builder"],
      subject: "builder_owner",
      tokenIdentifier: "https://api.workos.com/|builder_owner",
      "https://fairlend.ca/actor_kind": "human",
    } as never);

    await expect(
      mismatchedBuilder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId,
          expectedRevision: await batchRevision(fixture, batchId),
          idempotencyKey: "mismatched-receipt-email-submit",
        }
      )
    ).rejects.toThrow("WorkOS identity email verification is inconsistent.");
  });

  test("keeps Receipt publication durable when provider configuration is unavailable", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "receipt-email-rollback");
    const draftId = await addDraft(fixture, batchId, "receipt", "materials");
    const assetId = await stageDraftAsset(fixture, draftId, "receipt-rollback.pdf");
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 8_500,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 8_500,
      pageAssetIds: [assetId],
      title: "Receipt transport rollback",
      vendorName: "Cedar Supply Ltd.",
    });
    await completeDraft(fixture, draftId);
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "receipt-email-rollback-submit",
      }
    );
    const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;

    const state = await fixture.base.run(async (ctx) => ({
      audits: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) => query.eq("entityType", "costDocument"))
        .collect(),
      batch: await ctx.db.get(batchId),
      documents: await ctx.db
        .query("costDocuments")
        .withIndex("by_buildId_and_submittedAt", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .collect(),
      emails: await ctx.db
        .query("emailMessages")
        .withIndex("by_entity_and_createdAt", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(costDocumentId))
        )
        .collect(),
      intents: await ctx.db
        .query("communicationIntents")
        .withIndex("by_relatedEntityType_and_relatedEntityId_and_createdAt", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(costDocumentId))
        )
        .collect(),
      outbox: await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query.eq("relatedEntityType", "costDocument")
        )
        .collect(),
    }));
    expect(state.batch).toMatchObject({ state: "submitted" });
    expect(state.documents).toEqual([
      expect.objectContaining({ _id: costDocumentId, state: "submitted" }),
    ]);
    expect(state.audits).toEqual([
      expect.objectContaining({ eventType: "cost_document.submitted" }),
    ]);
    expect(state.emails).toEqual([]);
    expect(state.outbox).toEqual([
      expect.objectContaining({ eventType: "cost_document.submitted" }),
    ]);
    expect(state.intents).toEqual([
      expect.objectContaining({
        idempotencyKey: `cost-document:${costDocumentId}:submitted-receipt`,
        kind: "cost_document_receipt",
        status: "pending",
        templateKey: "cost_document_upload_receipt_v1",
      }),
    ]);
  });

  test("rejects forged Cost Document page and asset child graphs before authorizing a download", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "page-download-child-graph");
    const draftId = await addDraft(fixture, batchId);
    const assetId = await stageDraftAsset(
      fixture,
      draftId,
      "page-download-child-graph.pdf"
    );
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 1_000,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 1_000,
      pageAssetIds: [assetId],
      title: "Page download scope",
      vendorName: "Vendor",
    });
    await completeDraft(fixture, draftId);
    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "page-download-child-graph-submit",
      }
    );
    const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    const graph = await fixture.base.run(async (ctx) => {
      const [asset, document, page] = await Promise.all([
        ctx.db.get(assetId),
        ctx.db.get(costDocumentId),
        ctx.db
          .query("costDocumentPages")
          .withIndex("by_costDocumentId_and_assetId", (query) =>
            query.eq("costDocumentId", costDocumentId).eq("assetId", assetId)
          )
          .unique(),
      ]);
      if (!(asset && document && page)) {
        throw new Error("Missing Cost Document page-download graph fixture");
      }
      return { asset, document, page };
    });
    const otherBuildId = await addSecondAccessibleBuild(fixture);
    const otherBrokerageId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("brokerages", {
        createdAt: now,
        displayName: "Forged child brokerage",
        legalName: "Forged child brokerage Ltd.",
        status: "active",
        updatedAt: now,
        workosOrganizationId: "org_forged_child_brokerage",
      });
    });
    const otherCostDocumentId = await fixture.base.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("costDocuments", {
        brokerageId: graph.document.brokerageId,
        buildId: graph.document.buildId,
        category: "materials",
        createdAt: now,
        currency: "CAD",
        documentDate: "2026-08-03",
        grossTotalCents: 1,
        kind: "receipt",
        organizationId: graph.document.organizationId,
        state: "submitted",
        submittedAt: now,
        title: "Other submitted document",
        uploaderEmailSnapshot: "builder_owner@example.com",
        uploaderWorkosUserId: "builder_owner",
        vendorName: "Other vendor",
      });
    });
    const pagePath = `/api/cost-documents/page?${new URLSearchParams({
      assetId,
      buildId: fixture.buildId,
      costDocumentId,
      organizationId: ORGANIZATION_ID,
    }).toString()}`;
    const assertDenied = async (
      apply: () => Promise<void>,
      restore: () => Promise<void>
    ) => {
      await apply();
      try {
        const response = await fixture.builder.fetch(pagePath, {
          headers: {
            Authorization: "Bearer test-auth-token",
            Origin: "http://localhost:3000",
          },
        });
        expect(response.status).toBe(403);
        expect(response.headers.get("Cache-Control")).toContain("no-store");
      } finally {
        await restore();
      }
    };
    const corruptions = [
      {
        apply: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, { organizationId: "org_corrupt" })
          ),
        restore: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, {
              organizationId: graph.page.organizationId,
            })
          ),
      },
      {
        apply: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, { brokerageId: otherBrokerageId })
          ),
        restore: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, {
              brokerageId: graph.page.brokerageId,
            })
          ),
      },
      {
        apply: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, { buildId: otherBuildId })
          ),
        restore: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, { buildId: graph.page.buildId })
          ),
      },
      {
        apply: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, {
              costDocumentId: otherCostDocumentId,
            })
          ),
        restore: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.page._id, {
              costDocumentId: graph.page.costDocumentId,
            })
          ),
      },
      {
        apply: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.asset._id, { organizationId: "org_corrupt" })
          ),
        restore: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.asset._id, {
              organizationId: graph.asset.organizationId,
            })
          ),
      },
      {
        apply: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.asset._id, { brokerageId: otherBrokerageId })
          ),
        restore: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.asset._id, {
              brokerageId: graph.asset.brokerageId,
            })
          ),
      },
      {
        apply: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.asset._id, { buildId: otherBuildId })
          ),
        restore: () =>
          fixture.base.run((ctx) =>
            ctx.db.patch(graph.asset._id, { buildId: graph.asset.buildId })
          ),
      },
    ];
    for (const corruption of corruptions) {
      await assertDenied(corruption.apply, corruption.restore);
    }
  });

  test("rejects the legacy direct-submit bypass without creating documents or receipts", async () => {
    const fixture = await seedFixture();
    await expect(
      fixture.builder.mutation((api as any).cost_documents.submitCostDocument, {
        allocations: [
          {
            amountCents: 12_345,
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          },
        ],
        buildId: fixture.buildId,
        category: "labour",
        currency: "CAD",
        documentDate: "2026-08-01",
        grossTotalCents: 12_345,
        kind: "invoice",
        organizationId: ORGANIZATION_ID,
        pageAssetIds: [],
        title: "Blocked direct submission",
        vendorName: "Cedar Forming Ltd.",
      })
    ).rejects.toThrow("Direct Cost Document submission is unavailable");

    const visibleDocuments = await fixture.builder.query(
      (api as any).cost_documents.listCostDocuments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 10 },
      }
    );
    expect(visibleDocuments.page).toEqual([]);
  });

  test("recovers an exact batch only for its requested Build, tenant, and owner", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "exact-batch-scope");

    expect(await getBatch(fixture, batchId)).toMatchObject({
      _id: batchId,
      state: "active",
    });
    expect(await getActiveBatch(fixture)).toMatchObject({ _id: batchId });
    expect(
      await fixture.builder.query(
        (api as any).cost_documents.getCostDocumentBatch,
        {
          batchId: "not-a-cost-document-batch-id",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).toBeNull();

    const peer = withIdentity(fixture.base, {
      roles: ["builder"],
      subject: "builder_peer",
    });
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) throw new Error("Missing fixture build");
      const now = Date.now();
      await ctx.db.insert("builderAccountLinks", {
        assignedEmail: "builder_peer@example.com",
        brokerageId: build.brokerageId,
        builderProfileId: build.builderProfileId,
        createdAt: now,
        role: "owner",
        status: "active",
        updatedAt: now,
        workosUserId: "builder_peer",
      });
    });
    expect(
      await peer.query((api as any).cost_documents.getCostDocumentBatch, {
        batchId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      })
    ).toBeNull();

    const otherBuildId = await addSecondAccessibleBuild(fixture);
    expect(
      await fixture.builder.query(
        (api as any).cost_documents.getCostDocumentBatch,
        {
          batchId,
          buildId: otherBuildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).toBeNull();

    const otherTenantBuilder = withIdentity(
      fixture.base,
      { roles: ["builder"], subject: "cross_tenant_builder" },
      "org_other"
    );
    await expect(
      otherTenantBuilder.query(
        (api as any).cost_documents.getCostDocumentBatch,
        {
          batchId,
          buildId: fixture.buildId,
          organizationId: "org_other",
        }
      )
    ).rejects.toThrow("Forbidden");

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(batchId, { organizationId: "org_corrupt" });
    });
    expect(await getBatch(fixture, batchId)).toBeNull();
  });

  test("does not recover a Contractor batch through a replacement linked profile", async () => {
    const fixture = await seedFixture();
    const original = await addQualifyingContractor(
      fixture,
      "contractor_profile_replacement"
    );
    const batchId = await createBatch(
      fixture,
      "contractor-profile-replacement",
      original.contractor
    );
    await addDraft(
      fixture,
      batchId,
      "invoice",
      "labour",
      original.contractor
    );
    await fixture.base.run((ctx) =>
      ctx.db.patch(original.contractorId, {
        accountWorkosUserId: undefined,
        updatedAt: Date.now(),
      })
    );
    const replacement = await addQualifyingContractor(
      fixture,
      "contractor_profile_replacement"
    );
    expect(replacement.contractorId).not.toBe(original.contractorId);

    await expect(
      replacement.contractor.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toBeNull();
    await expect(
      replacement.contractor.query(
        (api as any).cost_documents.getCostDocumentBatch,
        {
          batchId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toBeNull();
  });

  test("refuses to reuse a corrupted active batch when creating", async () => {
    const wrongOrganizationFixture = await seedFixture();
    const wrongOrganizationBatchId = await createBatch(
      wrongOrganizationFixture,
      "create-corrupt-organization"
    );
    await wrongOrganizationFixture.base.run(async (ctx) => {
      await ctx.db.patch(wrongOrganizationBatchId, {
        organizationId: "org_corrupt",
      });
    });
    await expect(
      createBatch(wrongOrganizationFixture, "create-corrupt-organization-retry")
    ).rejects.toThrow("Cost Document batch is unavailable");

    const wrongBrokerageFixture = await seedFixture();
    const wrongBrokerageBatchId = await createBatch(
      wrongBrokerageFixture,
      "create-corrupt-brokerage"
    );
    await wrongBrokerageFixture.base.run(async (ctx) => {
      const wrongBrokerageId = await ctx.db.insert("brokerages", {
        createdAt: Date.now(),
        displayName: "Corrupt brokerage",
        legalName: "Corrupt brokerage Ltd.",
        status: "active",
        updatedAt: Date.now(),
        workosOrganizationId: "org_corrupt_brokerage",
      });
      await ctx.db.patch(wrongBrokerageBatchId, {
        brokerageId: wrongBrokerageId,
      });
    });
    await expect(
      createBatch(wrongBrokerageFixture, "create-corrupt-brokerage-retry")
    ).rejects.toThrow("Cost Document batch is unavailable");

    await expect(
      wrongBrokerageFixture.builder.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "homeowner",
          buildId: wrongBrokerageFixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("The Cost Document is unavailable.");
  });

  test("round-trips canonical owner-private working state and rejects malformed snapshots", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "working-state-round-trip");
    const draftId = await addDraft(fixture, batchId);
    const rawWorkingState = JSON.stringify({
      version: 1,
      grossTotal: "1,250.",
      financialComponents: [
        {
          id: "component-1",
          label: "HST draft",
          kind: "tax",
          amount: "",
        },
      ],
      allocations: [
        {
          id: "allocation-1",
          buildSubmilestoneId: String(fixture.buildSubmilestoneId),
          amount: "125.",
        },
      ],
    });

    await expect(
      saveDraft(fixture, draftId, { workingStateJson: rawWorkingState })
    ).resolves.toEqual({ revision: 2 });
    const recovered = await getBatch(fixture, batchId);
    const recoveredDraft = recovered?.drafts.find(
      (draft: { _id: Id<"costDocumentDrafts"> }) => draft._id === draftId
    );
    expect(recoveredDraft?.workingStateJson).toBe(
      JSON.stringify({
        allocations: [
          {
            amount: "125.",
            buildSubmilestoneId: String(fixture.buildSubmilestoneId),
            id: "allocation-1",
          },
        ],
        financialComponents: [
          {
            amount: "",
            id: "component-1",
            kind: "tax",
            label: "HST draft",
          },
        ],
        grossTotal: "1,250.",
        version: 1,
      })
    );
    await expect(
      saveDraft(fixture, draftId, { workingStateJson: "not-json" })
    ).rejects.toThrow("Cost Document working state is invalid");
    expect(
      (
        await getBatch(fixture, batchId)
      )?.drafts.find(
        (draft: { _id: Id<"costDocumentDrafts"> }) => draft._id === draftId
      )?.workingStateJson
    ).toBe(recoveredDraft?.workingStateJson);
  });

  test("binds a clean finalized draft page immediately and survives interrupted form recovery", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "immediate-page-binding");
    const draftId = await addDraft(fixture, batchId);
    const assetId = await stageDraftAsset(fixture, draftId, "immediate.pdf");

    await expect(
      bindDraftPage(fixture, { assetId, draftId })
    ).resolves.toMatchObject({ order: 1, revision: 2 });
    await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(assetId);
      if (!asset?.stagingSessionId) {
        throw new Error("Missing Cost Document draft staging session");
      }
      // Simulate the historical interruption window: the page row is already
      // durable, but its finalized session was never converged to consumed.
      await ctx.db.patch(asset.stagingSessionId, {
        expiresAt: Date.now() + 60_000,
        state: "finalized",
      });
    });
    await expect(
      bindDraftPage(fixture, { assetId, draftId })
    ).resolves.toMatchObject({ order: 1, revision: 2 });

    const bound = await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(assetId);
      const page = await ctx.db
        .query("costDocumentDraftPages")
        .withIndex("by_draftId_and_state_and_order", (query) =>
          query.eq("draftId", draftId).eq("state", "active")
        )
        .first();
      const session = asset?.stagingSessionId
        ? await ctx.db.get(asset.stagingSessionId)
        : null;
      if (asset?.stagingSessionId) {
        await ctx.db.patch(asset.stagingSessionId, {
          expiresAt: Date.now() - 1,
        });
      }
      return { page, session };
    });
    expect(bound.page).toMatchObject({ assetId, draftId, order: 1 });
    expect(bound.session?.state).toBe("consumed");

    expect((await getBatch(fixture, batchId))?.drafts).toMatchObject([
      { _id: draftId, pages: [{ assetId, order: 1 }] },
    ]);
    await expect(
      saveDraft(fixture, draftId, { pageAssetIds: [assetId] })
    ).resolves.toEqual({ revision: 3 });
  });

  test("accepts only fresh finalized or consumed sessions for bound Cost Document pages", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "bound-page-session-states");
    const draftId = await addDraft(fixture, batchId);
    const assetId = await stageDraftAsset(fixture, draftId, "bound-state.pdf");
    await bindDraftPage(fixture, { assetId, draftId });
    const stagingSessionId = await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(assetId);
      if (!asset?.stagingSessionId) {
        throw new Error("Missing Cost Document page staging session");
      }
      return asset.stagingSessionId;
    });
    const retryBoundPage = () => bindDraftPage(fixture, { assetId, draftId });

    for (const state of ["open", "abandoned"] as const) {
      await fixture.base.run(async (ctx) => {
        await ctx.db.patch(stagingSessionId, {
          expiresAt: Date.now() + 60_000,
          state,
        });
      });
      await expect(retryBoundPage()).rejects.toThrow("source page must be available");
    }
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(stagingSessionId, {
        expiresAt: Date.now() - 1,
        state: "finalized",
      });
    });
    await expect(retryBoundPage()).rejects.toThrow("source page must be available");

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(stagingSessionId, {
        expiresAt: Date.now() - 1,
        state: "consumed",
      });
    });
    await expect(retryBoundPage()).resolves.toMatchObject({ order: 1 });
  });

  test("allows source-page mutations only during Capture & confirm on an open draft", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "page-step-gate");
    const draftId = await addDraft(fixture, batchId);
    const sameSubjectAdmin = withIdentity(fixture.base, {
      roles: ["admin"],
      subject: "builder_owner",
    });
    await expect(
      sameSubjectAdmin.mutation(
        (api as any).build_collaboration_assets
          .beginBuildCollaborationAssetUpload,
        {
          buildId: fixture.buildId,
          contextKind: "costDocumentDraft",
          contextRecordId: String(draftId),
          fileName: "admin-cannot-stage.pdf",
          mimeType: "application/pdf",
          organizationId: ORGANIZATION_ID,
          sizeBytes: 1,
        }
      )
    ).rejects.toThrow("The Cost Document draft is unavailable");
    const boundAssetId = await stageDraftAsset(fixture, draftId, "capture.pdf");
    await bindDraftPage(fixture, { assetId: boundAssetId, draftId });
    await saveDraft(fixture, draftId, {
      allocations: [
        { amountCents: 1_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
      ],
      documentDate: "2026-08-01",
      grossTotalCents: 1_000,
      title: "Capture gate",
      vendorName: "Vendor",
    });
    const laterAssetId = await stageDraftAsset(fixture, draftId, "later.pdf");
    await setDraftStep(fixture, { draftId, step: "balance_allocate" });
    await expect(
      stageDraftAsset(fixture, draftId, "outside-capture.pdf")
    ).rejects.toThrow("unavailable");
    await expect(
      saveDraft(fixture, draftId, { pageAssetIds: [boundAssetId, laterAssetId] })
    ).rejects.toThrow("only during Capture & confirm");
    await expect(
      bindDraftPage(fixture, { assetId: laterAssetId, draftId })
    ).rejects.toThrow("only during Capture & confirm");

    await completeDraft(fixture, draftId);
    await expect(
      setDraftStep(fixture, { draftId, step: "capture_confirm" })
    ).rejects.toThrow("only from Freeze to Share");
    await expect(
      saveDraft(fixture, draftId, { pageAssetIds: [boundAssetId] })
    ).rejects.toThrow("no longer editable");
    await expect(
      stageDraftAsset(fixture, draftId, "after-complete.pdf")
    ).rejects.toThrow("unavailable");

    await setDraftStep(fixture, { draftId, step: "share" });
    await setDraftStep(fixture, { draftId, step: "balance_allocate" });
    await setDraftStep(fixture, { draftId, step: "capture_confirm" });
    await expect(
      bindDraftPage(fixture, { assetId: laterAssetId, draftId })
    ).resolves.toMatchObject({ order: 2 });
  });

  test("enforces sequential Cost Document steps and only audits reopening through Back", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "step-state-machine");
    const draftId = await addDraft(fixture, batchId);
    const assetId = await stageDraftAsset(fixture, draftId, "state-machine.pdf");
    await saveDraft(fixture, draftId, {
      allocations: [
        { amountCents: 1_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
      ],
      documentDate: "2026-08-01",
      financialComponents: [
        { amountCents: 1_000, kind: "subtotal", label: "Subtotal" },
      ],
      grossTotalCents: 1_000,
      pageAssetIds: [assetId],
      title: "State machine",
      vendorName: "Vendor",
    });

    await expect(
      setDraftStep(fixture, { draftId, step: "share" })
    ).rejects.toThrow("only to an adjacent workflow step");
    await expect(
      setDraftStep(fixture, { complete: true, draftId, step: "freeze" })
    ).rejects.toThrow("only from an open draft at Freeze");

    await setDraftStep(fixture, { draftId, step: "balance_allocate" });
    await expect(
      setDraftStep(fixture, { draftId, step: "freeze" })
    ).rejects.toThrow("only to an adjacent workflow step");
    await setDraftStep(fixture, { draftId, step: "share" });
    await expect(
      setDraftStep(fixture, { draftId, step: "capture_confirm" })
    ).rejects.toThrow("only to an adjacent workflow step");
    await setDraftStep(fixture, { draftId, step: "freeze" });
    await setDraftStep(fixture, { complete: true, draftId, step: "freeze" });

    const completed = await fixture.base.run(async (ctx) => {
      const draft = (await ctx.db.get(draftId)) as Doc<"costDocumentDrafts"> | null;
      const reopenedAudits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "costDocumentDraft")
            .eq("entityId", String(draftId))
        )
        .filter((query) =>
          query.eq(query.field("eventType"), "cost_document.draft_reopened")
        )
        .collect();
      const stepAudits = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "costDocumentDraft")
            .eq("entityId", String(draftId))
        )
        .collect();
      return {
        completedAudit: stepAudits.find(
          (event) => event.eventType === "cost_document.draft_completed"
        ),
        completedAt: draft?.completedAt,
        lifecycle: draft?.lifecycle,
        reopenedAuditCount: reopenedAudits.length,
        shareAudit: stepAudits.find(
          (event) =>
            event.eventType === "cost_document.draft_step_changed" &&
            JSON.parse(event.newState ?? "{}").activeStep === "share"
        ),
        title: draft?.title,
      };
    });
    expect(completed).toMatchObject({
      completedAt: expect.any(Number),
      lifecycle: "complete",
      reopenedAuditCount: 0,
      title: "State machine",
    });
    expect(JSON.parse(completed.shareAudit?.priorState ?? "{}")).toMatchObject({
      activeStep: "balance_allocate",
      completedAt: null,
      lifecycle: "draft",
    });
    expect(JSON.parse(completed.shareAudit?.newState ?? "{}")).toMatchObject({
      activeStep: "share",
      completedAt: null,
      lifecycle: "draft",
    });
    expect(JSON.parse(completed.completedAudit?.priorState ?? "{}")).toMatchObject({
      activeStep: "freeze",
      completedAt: null,
      lifecycle: "draft",
    });
    expect(JSON.parse(completed.completedAudit?.newState ?? "{}")).toMatchObject({
      activeStep: "freeze",
      completedAt: expect.any(Number),
      lifecycle: "complete",
    });

    await expect(
      saveDraft(fixture, draftId, { title: "Silent reopen attempt" })
    ).rejects.toThrow("no longer editable");
    expect(
      await fixture.base.run(async (ctx) => {
        const draft = (await ctx.db.get(draftId)) as
          | Doc<"costDocumentDrafts">
          | null;
        const reopenedAudits = await ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "costDocumentDraft")
              .eq("entityId", String(draftId))
          )
          .filter((query) =>
            query.eq(query.field("eventType"), "cost_document.draft_reopened")
          )
          .collect();
        return {
          completedAt: draft?.completedAt,
          lifecycle: draft?.lifecycle,
          reopenedAuditCount: reopenedAudits.length,
          title: draft?.title,
        };
      })
    ).toMatchObject({
      completedAt: completed.completedAt,
      lifecycle: completed.lifecycle,
      reopenedAuditCount: completed.reopenedAuditCount,
      title: completed.title,
    });

    await expect(
      setDraftStep(fixture, { draftId, step: "capture_confirm" })
    ).rejects.toThrow("only from Freeze to Share");
    await setDraftStep(fixture, { draftId, step: "share" });
    expect(await getBatch(fixture, batchId)).toMatchObject({
      drafts: [
        expect.objectContaining({
          _id: draftId,
          activeStep: "share",
          lifecycle: "draft",
        }),
      ],
    });
    const reopenedAudit = await fixture.base.run(async (ctx) => {
      const event = await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "costDocumentDraft")
            .eq("entityId", String(draftId))
        )
        .filter((query) =>
          query.eq(query.field("eventType"), "cost_document.draft_reopened")
        )
        .first();
      return event;
    });
    expect(JSON.parse(reopenedAudit?.priorState ?? "{}")).toMatchObject({
      activeStep: "freeze",
      completedAt: expect.any(Number),
      lifecycle: "complete",
    });
    expect(JSON.parse(reopenedAudit?.newState ?? "{}")).toMatchObject({
      activeStep: "share",
      completedAt: null,
      lifecycle: "draft",
    });
  });

  test("persists independent draft recovery, exact allocations/components, and reopens only the selected draft", async () => {
    const fixture = await seedFixture();
    const secondSubmilestoneId = await addSecondSubmilestone(fixture);
    const batchId = await createBatch(fixture, "recovery-batch");
    const firstDraftId = await addDraft(fixture, batchId, "invoice", "materials");
    const secondDraftId = await addDraft(fixture, batchId, "receipt", "labour");
    const firstAssetId = await stageDraftAsset(fixture, firstDraftId, "first.pdf");
    const secondAssetId = await stageDraftAsset(fixture, secondDraftId, "second.pdf");

    await saveDraft(fixture, firstDraftId, {
      pageAssetIds: [firstAssetId],
      title: "First durable draft",
      vendorName: "Northline",
      documentDate: "2026-08-01",
      grossTotalCents: 10_000,
      allocations: [
        { amountCents: 6_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
        { amountCents: 4_000, buildSubmilestoneId: secondSubmilestoneId },
      ],
      financialComponents: [
        { amountCents: 10_000, kind: "subtotal", label: "Subtotal" },
      ],
    });
    await saveDraft(fixture, secondDraftId, {
      pageAssetIds: [secondAssetId],
      title: "Second durable draft",
      vendorName: "Electrical",
      documentDate: "2026-08-02",
      grossTotalCents: 4_000,
      allocations: [
        { amountCents: 4_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
      ],
    });

    const projection = await getBatch(fixture, batchId);
    expect(projection?.drafts).toHaveLength(2);
    expect(projection?.drafts[0]).toMatchObject({
      _id: firstDraftId,
      allocations: [
        { amountCents: 6_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
        { amountCents: 4_000, buildSubmilestoneId: secondSubmilestoneId },
      ],
      financialComponents: [{ kind: "subtotal", amountCents: 10_000 }],
      pages: [{ assetId: firstAssetId, order: 1 }],
    });
    expect(projection?.drafts[1]).toMatchObject({
      _id: secondDraftId,
      pages: [{ assetId: secondAssetId, order: 1 }],
      lifecycle: "draft",
    });

    await completeDraft(fixture, firstDraftId);
    await completeDraft(fixture, secondDraftId);
    await setDraftStep(fixture, { draftId: firstDraftId, step: "share" });
    const reopened = await getBatch(fixture, batchId);
    expect(reopened?.drafts[0]).toMatchObject({
      _id: firstDraftId,
      activeStep: "share",
      lifecycle: "draft",
    });
    expect(reopened?.drafts[1]).toMatchObject({
      _id: secondDraftId,
      activeStep: "freeze",
      lifecycle: "complete",
    });
  });

  test("prevalidates every member and publishes no documents or assets when one member is invalid", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "atomic-invalid");
    const validDraftId = await addDraft(fixture, batchId);
    const invalidDraftId = await addDraft(fixture, batchId, "receipt", "labour");
    const validAssetId = await stageDraftAsset(fixture, validDraftId, "valid.pdf");
    await saveDraft(fixture, validDraftId, {
      pageAssetIds: [validAssetId],
      title: "Valid member",
      vendorName: "Vendor",
      documentDate: "2026-08-01",
      grossTotalCents: 2_000,
      allocations: [
        { amountCents: 2_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
      ],
    });
    await completeDraft(fixture, validDraftId);

    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId,
          expectedRevision: await batchRevision(fixture, batchId),
          idempotencyKey: "atomic-invalid-submit",
        }
      )
    ).rejects.toThrow("Every Cost Document must be complete");
    const state = await fixture.base.run(async (ctx) => ({
      assets: await ctx.db
        .query("buildCollaborationAssets")
        .withIndex("by_buildId", (query) => query.eq("buildId", fixture.buildId))
        .collect(),
      batch: await ctx.db.get(batchId),
      documents: await ctx.db
        .query("costDocuments")
        .withIndex("by_buildId_and_submittedAt", (query) =>
          query.eq("buildId", fixture.buildId)
        )
        .collect(),
      submittedAudits: await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) => query.eq("entityType", "costDocument"))
        .filter((query) => query.eq(query.field("eventType"), "cost_document.submitted"))
        .collect(),
      submittedOutbox: await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) => query.eq("relatedEntityType", "costDocument"))
        .collect(),
      submittedEmails: await ctx.db
        .query("emailMessages")
        .withIndex("by_entity_and_createdAt", (query) =>
          query.eq("relatedEntityType", "costDocument")
        )
        .collect(),
    }));
    expect((state.batch as { state?: string } | null)?.state).toBe("active");
    expect(state.documents).toEqual([]);
    expect(state.submittedAudits).toEqual([]);
    expect(state.submittedOutbox).toEqual([]);
    expect(state.submittedEmails).toEqual([]);
    expect(state.assets.find((asset) => asset._id === validAssetId)?.publishedAt).toBeUndefined();
    expect(
      (await getBatch(fixture, batchId))?.drafts.find(
        (draft: { _id: Id<"costDocumentDrafts">; lifecycle: string }) =>
          draft._id === invalidDraftId
      )?.lifecycle
    ).toBe("draft");
  });

  test("consumes draft staging sessions, survives expiry, replaces prior pages safely, and replays batch submit idempotently", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "atomic-success");
    const draftId = await addDraft(fixture, batchId);
    const firstAssetId = await stageDraftAsset(fixture, draftId, "replace-me.pdf");
    await saveDraft(fixture, draftId, {
      pageAssetIds: [firstAssetId],
      title: "Replacement draft",
      vendorName: "Vendor",
      documentDate: "2026-08-01",
      grossTotalCents: 3_000,
      allocations: [
        { amountCents: 3_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
      ],
    });
    const firstSession = await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(firstAssetId);
      return asset?.stagingSessionId ? await ctx.db.get(asset.stagingSessionId) : null;
    });
    expect(firstSession?.state).toBe("consumed");

    const secondAssetId = await stageDraftAsset(fixture, draftId, "replacement.pdf");
    await saveDraft(fixture, draftId, { pageAssetIds: [secondAssetId] });
    const replaced = await fixture.base.run(async (ctx) => {
      const firstAsset = await ctx.db.get(firstAssetId);
      const secondAsset = await ctx.db.get(secondAssetId);
      const firstSession = firstAsset?.stagingSessionId
        ? await ctx.db.get(firstAsset.stagingSessionId)
        : null;
      return { firstAsset, firstSession, secondAsset };
    });
    expect(replaced.firstAsset?.scanState).toBe("rejected");
    expect(replaced.firstAsset?.storageDeletedAt).toBeDefined();
    expect(replaced.firstSession?.state).toBe("abandoned");
    expect(replaced.secondAsset?.publishedAt).toBeUndefined();

    await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(secondAssetId);
      if (!asset?.stagingSessionId) throw new Error("Missing draft session");
      await ctx.db.patch(asset.stagingSessionId, { expiresAt: Date.now() - 1 });
    });
    await completeDraft(fixture, draftId);
    const before = await downstreamSnapshot(fixture);
    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "atomic-success-submit",
      }
    );
    expect(submitted.replayed).toBe(false);
    expect(submitted.costDocumentIds).toHaveLength(1);
    expect(await downstreamSnapshot(fixture)).toEqual(before);
    const replay = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "atomic-success-submit",
      }
    );
    expect(replay).toEqual({ ...submitted, replayed: true });
    const genericReplacementName = "generic-replacement.pdf";
    const genericReplacementSession = await fixture.builder.mutation(
      (api as any).build_collaboration_assets
        .beginBuildCollaborationAssetUpload,
      {
        buildId: fixture.buildId,
        contextKind: "composer",
        fileName: genericReplacementName,
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        sizeBytes: genericReplacementName.length,
      }
    );
    const genericReplacementStorageId = await fixture.base.run((ctx) =>
      ctx.storage.store(
        new Blob([genericReplacementName], { type: "application/pdf" })
      )
    );
    await expect(
      fixture.builder.mutation(
        (api as any).build_collaboration_assets
          .finalizeBuildCollaborationAssetUpload,
        {
          buildId: fixture.buildId,
          contentHashSha256: "c".repeat(64),
          fileName: genericReplacementName,
          mimeType: "application/pdf",
          organizationId: ORGANIZATION_ID,
          stagingSessionId: genericReplacementSession.stagingSessionId,
          storageId: genericReplacementStorageId,
          supersedesAssetId: secondAssetId,
        }
      )
    ).rejects.toThrow("prior asset version is unavailable");
    const immutableSourceAsset = await fixture.base.run(
      async (ctx) => await ctx.db.get(secondAssetId)
    );
    expect(immutableSourceAsset).toMatchObject({
      scanState: "clean",
      state: "available",
    });
    expect(
      await fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId,
          expectedRevision: await batchRevision(fixture, batchId),
          idempotencyKey: "atomic-success-submit",
        }
      )
    ).toEqual({ ...submitted, replayed: true });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId,
          expectedRevision: await batchRevision(fixture, batchId),
          idempotencyKey: "different-submit-key",
        }
      )
    ).rejects.toThrow("submit key does not match");
  });

  test("fails closed when a submitted batch replay has a missing, corrupt, or foreign durable graph", async () => {
    const fixture = await seedFixture();
    const submitFixtureBatch = async (key: string) => {
      const batchId = await createBatch(fixture, `replay-${key}`);
      const draftId = await addDraft(fixture, batchId);
      const assetId = await stageDraftAsset(fixture, draftId, `${key}.pdf`);
      await saveDraft(fixture, draftId, {
        allocations: [
          {
            amountCents: 1_000,
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          },
        ],
        documentDate: "2026-08-01",
        financialComponents: [
          { amountCents: 1_000, kind: "subtotal", label: "Subtotal" },
        ],
        grossTotalCents: 1_000,
        pageAssetIds: [assetId],
        title: `Replay ${key}`,
        vendorName: "Vendor",
      });
      await completeDraft(fixture, draftId);
      const idempotencyKey = `replay-submit-${key}`;
      const submitted = await fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId,
          duplicateOverrideReason: "Independent replay-integrity fixture.",
          expectedRevision: await batchRevision(fixture, batchId),
          idempotencyKey,
        }
      );
      const graph = await fixture.base.run(async (ctx) => {
        const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
        const [submittedPage, submittedAllocation, submittedComponent, draftPage] =
          await Promise.all([
            ctx.db
              .query("costDocumentPages")
              .withIndex("by_costDocumentId_and_order", (query) =>
                query.eq("costDocumentId", costDocumentId)
              )
              .first(),
            ctx.db
              .query("costDocumentAllocations")
              .withIndex("by_costDocumentId_and_order", (query) =>
                query.eq("costDocumentId", costDocumentId)
              )
              .first(),
            ctx.db
              .query("costDocumentFinancialComponents")
              .withIndex("by_costDocumentId_and_order", (query) =>
                query.eq("costDocumentId", costDocumentId)
              )
              .first(),
            ctx.db
              .query("costDocumentDraftPages")
              .withIndex("by_draftId_and_state_and_order", (query) =>
                query.eq("draftId", draftId).eq("state", "active")
              )
              .first(),
          ]);
        if (
          !submittedPage ||
          !submittedAllocation ||
          !submittedComponent ||
          !draftPage
        ) {
          throw new Error("Missing submitted replay graph fixture");
        }
        return {
          assetId: submittedPage.assetId,
          draftPageId: draftPage._id,
          submittedAllocationId: submittedAllocation._id,
          submittedComponentId: submittedComponent._id,
          submittedPageId: submittedPage._id,
        };
      });
      return {
        batchId,
        costDocumentId: submitted.costDocumentIds[0] as Id<"costDocuments">,
        draftId,
        idempotencyKey,
        ...graph,
      };
    };

    const replay = async (
      submission: Awaited<ReturnType<typeof submitFixtureBatch>>
    ) =>
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId: submission.batchId,
          expectedRevision: await batchRevision(fixture, submission.batchId),
          idempotencyKey: submission.idempotencyKey,
        }
      );

    const missingParent = await submitFixtureBatch("missing-parent");
    await fixture.base.run(async (ctx) => {
      await ctx.db.delete(missingParent.costDocumentId);
    });
    await expect(replay(missingParent)).rejects.toThrow("batch is incomplete");

    const missingAllocation = await submitFixtureBatch("missing-allocation");
    await fixture.base.run(async (ctx) => {
      await ctx.db.delete(missingAllocation.submittedAllocationId);
    });
    await expect(replay(missingAllocation)).rejects.toThrow("batch is incomplete");

    const corruptDocument = await submitFixtureBatch("corrupt-document");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(corruptDocument.costDocumentId, {
        organizationId: "org_corrupt",
      });
    });
    await expect(replay(corruptDocument)).rejects.toThrow("batch is incomplete");

    const foreignPage = await submitFixtureBatch("foreign-page");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(foreignPage.submittedPageId, {
        organizationId: "org_corrupt",
      });
    });
    await expect(replay(foreignPage)).rejects.toThrow("batch is incomplete");

    const wrongPageOrder = await submitFixtureBatch("wrong-page-order");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(wrongPageOrder.submittedPageId, {
        order: 2,
      });
    });
    await expect(replay(wrongPageOrder)).rejects.toThrow("batch is incomplete");

    const corruptComponent = await submitFixtureBatch("corrupt-component");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(corruptComponent.submittedComponentId, {
        amountCents: 999,
      });
    });
    await expect(replay(corruptComponent)).rejects.toThrow("batch is incomplete");

    const foreignDraftPage = await submitFixtureBatch("foreign-draft-page");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(foreignDraftPage.draftPageId, {
        organizationId: "org_corrupt",
      });
    });
    await expect(replay(foreignDraftPage)).rejects.toThrow("batch is incomplete");

    const foreignAsset = await submitFixtureBatch("foreign-asset");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(foreignAsset.assetId, { organizationId: "org_corrupt" });
    });
    await expect(replay(foreignAsset)).rejects.toThrow("batch is incomplete");
  });

  test("fails closed for corrupted batch, draft, page, allocation, and component scope", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "corruption-regression");
    const draftId = await addDraft(fixture, batchId);
    const assetId = await stageDraftAsset(fixture, draftId, "corruption.pdf");
    await saveDraft(fixture, draftId, {
      pageAssetIds: [assetId],
      title: "Corruption guard",
      vendorName: "Vendor",
      documentDate: "2026-08-01",
      grossTotalCents: 1_000,
      allocations: [
        { amountCents: 1_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
      ],
      financialComponents: [
        { amountCents: 1_000, kind: "subtotal" },
      ],
    });
    const ids = await fixture.base.run(async (ctx) => ({
      allocation: await ctx.db
        .query("costDocumentDraftAllocations")
        .withIndex("by_draftId_and_order", (query) => query.eq("draftId", draftId))
        .first(),
      component: await ctx.db
        .query("costDocumentDraftFinancialComponents")
        .withIndex("by_draftId_and_order", (query) => query.eq("draftId", draftId))
        .first(),
      page: await ctx.db
        .query("costDocumentDraftPages")
        .withIndex("by_draftId_and_state_and_order", (query) =>
          query.eq("draftId", draftId).eq("state", "active")
        )
        .first(),
    }));
    if (!ids.allocation || !ids.component || !ids.page) {
      throw new Error("Missing corruption fixture children");
    }
    const corruptAndReject = async (
      id:
        | Id<"costDocumentBatches">
        | Id<"costDocumentDrafts">
        | Id<"costDocumentDraftPages">
        | Id<"costDocumentDraftAllocations">
        | Id<"costDocumentDraftFinancialComponents">,
      operation: "projection" | "submit"
    ) => {
      await fixture.base.run(async (ctx) => {
        await ctx.db.patch(id as never, { organizationId: "org_corrupt" });
      });
      if (operation === "projection") {
        await expect(getActiveBatch(fixture)).rejects.toThrow();
      } else {
        await expect(
          fixture.builder.mutation(
            (api as any).cost_documents.submitCostDocumentBatch,
            {
              batchId,
              expectedRevision: await batchRevision(fixture, batchId),
              idempotencyKey: "corruption-submit",
            }
          )
        ).rejects.toThrow();
      }
      await fixture.base.run(async (ctx) => {
        await ctx.db.patch(id as never, { organizationId: ORGANIZATION_ID });
      });
    };
    await corruptAndReject(batchId, "projection");
    await corruptAndReject(draftId, "projection");
    await corruptAndReject(ids.page._id, "projection");
    await corruptAndReject(ids.allocation._id, "projection");
    await corruptAndReject(ids.component._id, "submit");
  });

  test("atomically replaces a page at the 50-page cap without generic asset supersession", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "draft-session-capacity");
    const draftId = await addDraft(fixture, batchId);
    const assetIds = [] as Id<"buildCollaborationAssets">[];
    for (let index = 0; index < 50; index += 1) {
      assetIds.push(
        await stageDraftAsset(fixture, draftId, `page-${index + 1}.pdf`)
      );
    }
    await saveDraft(fixture, draftId, {
      pageAssetIds: assetIds,
      title: "Fifty-page capacity",
      vendorName: "Vendor",
      documentDate: "2026-08-01",
      grossTotalCents: 1_000,
      allocations: [
        { amountCents: 1_000, buildSubmilestoneId: fixture.buildSubmilestoneId },
      ],
    });
    const sessionStates = await fixture.base.run(async (ctx) => {
      const assets = await Promise.all(assetIds.map((assetId) => ctx.db.get(assetId)));
      return await Promise.all(
        assets.map(async (asset) =>
          asset?.stagingSessionId ? (await ctx.db.get(asset.stagingSessionId))?.state : null
        )
      );
    });
    expect(sessionStates.every((state) => state === "consumed")).toBe(true);

    const originalAssetId = assetIds[24];
    if (!originalAssetId) {
      throw new Error("Missing the twenty-fifth Cost Document source page.");
    }
    const replacementAssetId = await stageDraftAsset(
      fixture,
      draftId,
      "page-25-replacement.pdf"
    );
    const replaceArgs = {
      assetId: replacementAssetId,
      draftId,
      replaceAssetId: originalAssetId,
    };
    await expect(
      bindDraftPage(fixture, replaceArgs)
    ).resolves.toMatchObject({ order: 25 });
    // The exact retry must be idempotent even though the draft remains at its
    // 50-page maximum and the original active row is now historical.
    await expect(
      bindDraftPage(fixture, replaceArgs)
    ).resolves.toMatchObject({ order: 25 });

    const replacementState = await fixture.base.run(async (ctx) => {
      const pages = await ctx.db
        .query("costDocumentDraftPages")
        .withIndex("by_draftId_and_order", (query) =>
          query.eq("draftId", draftId)
        )
        .collect();
      const originalAsset = await ctx.db.get(originalAssetId);
      const replacementAsset = await ctx.db.get(replacementAssetId);
      const originalSession = originalAsset?.stagingSessionId
        ? await ctx.db.get(originalAsset.stagingSessionId)
        : null;
      const replacementSession = replacementAsset?.stagingSessionId
        ? await ctx.db.get(replacementAsset.stagingSessionId)
        : null;
      return {
        activePages: pages.filter((page) => page.state === "active"),
        originalAsset,
        originalPage: pages.find(
          (page) => page.assetId === originalAssetId && page.state === "replaced"
        ),
        originalSession,
        replacementAsset,
        replacementPage: pages.find(
          (page) =>
            page.assetId === replacementAssetId && page.state === "active"
        ),
        replacementSession,
      };
    });
    const expectedActiveAssetIds = [...assetIds];
    expectedActiveAssetIds[24] = replacementAssetId;
    expect(replacementState.activePages).toHaveLength(50);
    expect(replacementState.activePages.map((page) => page.assetId)).toEqual(
      expectedActiveAssetIds
    );
    expect(replacementState.replacementPage).toMatchObject({
      assetId: replacementAssetId,
      order: 25,
      priorAssetId: originalAssetId,
      state: "active",
    });
    expect(replacementState.originalPage).toMatchObject({
      assetId: originalAssetId,
      order: 25,
      state: "replaced",
    });
    expect(replacementState.originalPage?.replacedAt).toEqual(
      expect.any(Number)
    );
    expect(replacementState.originalAsset?.scanState).toBe("rejected");
    expect(replacementState.originalSession?.state).toBe("abandoned");
    expect(replacementState.replacementAsset?.supersedesAssetId).toBeUndefined();
    expect(replacementState.replacementSession?.state).toBe("consumed");
  });

  test("grants one exact Draft to an eligible Builder Staff collaborator without exposing the creator batch", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "exact-draft-collaboration");
    const grantedDraftId = await addDraft(fixture, batchId);
    await addDraft(fixture, batchId, "receipt", "labour");
    const staff = await addEligibleBuilderStaff(fixture, "builder_staff");

    await fixture.builder.mutation(
      (api as any).cost_documents.grantCostDocumentDraftCollaborator,
      {
        collaboratorWorkosUserId: "builder_staff",
        draftId: grantedDraftId,
        expectedRevision: 1,
      }
    );

    const sharedDraft = await staff.query(
      (api as any).cost_documents.getCostDocumentDraft,
      {
        buildId: fixture.buildId,
        draftId: grantedDraftId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(sharedDraft).toMatchObject({
      _id: grantedDraftId,
      capabilities: {
        canDiscardBatch: false,
        canEditDraft: true,
        canManageDraftCollaboration: false,
        canManageSourcePages: true,
        canReadDraft: true,
        canSubmitBatch: false,
      },
      creator: { workosUserId: "builder_owner" },
      revision: 2,
      self: { workosUserId: "builder_staff" },
    });
    expect(sharedDraft).not.toHaveProperty("batchId");
    expect(sharedDraft).not.toHaveProperty("order");
    expect(
      await staff.query((api as any).cost_documents.getCostDocumentBatch, {
        batchId,
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
      })
    ).toBeNull();
  });

  test("allows an exact Draft collaborator to edit as themselves with optimistic revision protection", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "collaborator-edit-provenance");
    const draftId = await addDraft(fixture, batchId);
    const staff = await addEligibleBuilderStaff(fixture, "builder_staff_editor");
    await fixture.builder.mutation(
      (api as any).cost_documents.grantCostDocumentDraftCollaborator,
      {
        collaboratorWorkosUserId: "builder_staff_editor",
        draftId,
        expectedRevision: 1,
      }
    );

    await expect(
      staff.mutation((api as any).cost_documents.saveCostDocumentDraft, {
        draftId,
        expectedRevision: 2,
        title: "Staff-entered receipt",
      })
    ).resolves.toEqual({ revision: 3 });
    await expect(
      staff.mutation((api as any).cost_documents.saveCostDocumentDraft, {
        draftId,
        expectedRevision: 2,
        title: "Stale overwrite",
      })
    ).rejects.toThrow("Draft revision conflict");

    expect(
      await staff.query((api as any).cost_documents.getCostDocumentDraft, {
        buildId: fixture.buildId,
        draftId,
        organizationId: ORGANIZATION_ID,
      })
    ).toMatchObject({
      revision: 3,
      title: "Staff-entered receipt",
    });
    const audit = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query
            .eq("entityType", "costDocumentDraft")
            .eq("entityId", String(draftId))
        )
        .order("desc")
        .first()
    );
    expect(audit).toMatchObject({
      actorWorkosUserId: "builder_staff_editor",
      eventType: "cost_document.draft_edited",
      newState: JSON.stringify({ revision: 3 }),
      priorState: JSON.stringify({ revision: 2 }),
    });
  });

  test("lets an exact Draft collaborator retain, reorder, and remove consumed creator pages while rejecting foreign Draft and tenant assets", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "mixed-page-manifest");
    const draftId = await addDraft(fixture, batchId);
    const otherDraftId = await addDraft(fixture, batchId, "receipt", "labour");
    const creatorAssetId = await stageDraftAsset(
      fixture,
      draftId,
      "creator-page.pdf"
    );
    await saveDraft(fixture, draftId, {
      allocations: [
        {
          amountCents: 1_000,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 1_000,
      pageAssetIds: [creatorAssetId],
      title: "Mixed page manifest",
      vendorName: "Creator vendor",
    });
    const staff = await addEligibleBuilderStaff(
      fixture,
      "builder_staff_mixed_pages"
    );
    await fixture.builder.mutation(
      (api as any).cost_documents.grantCostDocumentDraftCollaborator,
      {
        collaboratorWorkosUserId: "builder_staff_mixed_pages",
        draftId,
        expectedRevision: 2,
      }
    );

    const staffAssetId = await stageDraftAsset(
      fixture,
      draftId,
      "staff-page.pdf",
      staff
    );
    await expect(
      saveDraft(
        fixture,
        draftId,
        { pageAssetIds: [creatorAssetId, staffAssetId] },
        staff
      )
    ).resolves.toEqual({ revision: 4 });
    await expect(
      staff.query((api as any).cost_documents.getCostDocumentDraft, {
        buildId: fixture.buildId,
        draftId: String(draftId),
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({
      pages: [
        { assetId: creatorAssetId, order: 1 },
        { assetId: staffAssetId, order: 2 },
      ],
      revision: 4,
    });

    await expect(
      saveDraft(
        fixture,
        draftId,
        { pageAssetIds: [staffAssetId, creatorAssetId] },
        staff
      )
    ).resolves.toEqual({ revision: 5 });
    await expect(
      staff.query((api as any).cost_documents.getCostDocumentDraft, {
        buildId: fixture.buildId,
        draftId: String(draftId),
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({
      pages: [
        { assetId: staffAssetId, order: 1 },
        { assetId: creatorAssetId, order: 2 },
      ],
      revision: 5,
    });

    await expect(
      saveDraft(
        fixture,
        draftId,
        { pageAssetIds: [staffAssetId] },
        staff
      )
    ).resolves.toEqual({ revision: 6 });
    await expect(
      staff.query((api as any).cost_documents.getCostDocumentDraft, {
        buildId: fixture.buildId,
        draftId: String(draftId),
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({
      pages: [{ assetId: staffAssetId, order: 1 }],
      revision: 6,
    });

    const otherDraftAssetId = await stageDraftAsset(
      fixture,
      otherDraftId,
      "other-draft-page.pdf"
    );
    await expect(
      saveDraft(
        fixture,
        draftId,
        { pageAssetIds: [staffAssetId, otherDraftAssetId] },
        staff
      )
    ).rejects.toThrow("Every Cost Document draft source page must be available");

    const crossTenantAssetId = await stageDraftAsset(
      fixture,
      draftId,
      "cross-tenant-page.pdf",
      staff
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(crossTenantAssetId, { organizationId: "org_corrupt" });
    });
    await expect(
      saveDraft(
        fixture,
        draftId,
        { pageAssetIds: [staffAssetId, crossTenantAssetId] },
        staff
      )
    ).rejects.toThrow("Every Cost Document draft source page must be available");

    await expect(completeDraft(fixture, draftId)).resolves.toEqual({
      revision: 10,
    });
  });

  test("keeps grant administration creator-only and revokes exact Draft, asset status, and download access immediately", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "grant-revocation-boundary");
    const draftId = await addDraft(fixture, batchId);
    const staff = await addEligibleBuilderStaff(fixture, "builder_staff_revoked");
    await fixture.builder.mutation(
      (api as any).cost_documents.grantCostDocumentDraftCollaborator,
      {
        collaboratorWorkosUserId: "builder_staff_revoked",
        draftId,
        expectedRevision: 1,
      }
    );

    await expect(
      staff.mutation(
        (api as any).cost_documents.grantCostDocumentDraftCollaborator,
        {
          collaboratorWorkosUserId: "builder_owner",
          draftId,
          expectedRevision: 2,
        }
      )
    ).rejects.toThrow("unavailable");
    await expect(
      staff.mutation((api as any).cost_documents.submitCostDocumentBatch, {
        batchId,
        expectedRevision: 2,
        idempotencyKey: "forged-collaborator-submit",
      })
    ).rejects.toThrow("unavailable");

    const staffAssetId = await stageDraftAsset(
      fixture,
      draftId,
      "staff-private-source.pdf",
      staff
    );
    await expect(
      staff.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        {
          assetId: staffAssetId,
          draftId,
          expectedRevision: 2,
        }
      )
    ).resolves.toEqual({ order: 1, revision: 3 });
    for (const actor of [fixture.builder, staff]) {
      await expect(
        actor.query(
          (api as any).build_collaboration_assets
            .listBuildCollaborationAssetStatuses,
          {
            assetIds: [staffAssetId],
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
          }
        )
      ).resolves.toEqual([
        expect.objectContaining({
          _id: staffAssetId,
          fileName: "staff-private-source.pdf",
          scanState: "clean",
        }),
      ]);
      await expect(
        actor.mutation(
          (api as any).build_collaboration_assets
            .authorizeBuildCollaborationAssetDownload,
          {
            assetId: staffAssetId,
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
          }
        )
      ).resolves.toContain("http");
    }

    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.revokeCostDocumentDraftCollaborator,
        {
          collaboratorWorkosUserId: "builder_staff_revoked",
          draftId,
          expectedRevision: 3,
          reason: "No longer assisting this document.",
        }
      )
    ).resolves.toEqual({ draftId, revision: 4 });
    await expect(
      staff.query((api as any).cost_documents.getCostDocumentDraft, {
        buildId: fixture.buildId,
        draftId: String(draftId),
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      staff.query(
        (api as any).build_collaboration_assets
          .listBuildCollaborationAssetStatuses,
        {
          assetIds: [staffAssetId],
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([]);
    await expect(
      staff.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: staffAssetId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("collaboration asset is unavailable");
    await expect(
      staff.mutation((api as any).cost_documents.saveCostDocumentDraft, {
        draftId,
        expectedRevision: 4,
        title: "Revoked collaborator overwrite",
      })
    ).rejects.toThrow("unavailable");
    const events = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("costDocumentDraftCollaborationEvents")
        .withIndex("by_draftId_and_draftRevision", (query) =>
          query.eq("draftId", draftId)
        )
        .order("asc")
        .collect()
    );
    expect(events.map((event) => event.eventType)).toEqual([
      "granted",
      "revoked",
    ]);
  });

  test.each(["admin", "principle-broker"] as const)(
    "lets a %s create, upload, and reconcile a private Cost Document draft",
    async (actorCapacity) => {
      const fixture = await seedFixture();
      const batchId = await fixture.admin.mutation(
        (api as any).cost_documents.createCostDocumentBatch,
        {
          actorCapacity,
          buildId: fixture.buildId,
          idempotencyKey: `${actorCapacity}-cost-capture`,
          organizationId: ORGANIZATION_ID,
        }
      );
      const draftId = await fixture.admin.mutation(
        (api as any).cost_documents.addCostDocumentDraft,
        {
          actorCapacity,
          batchId,
          category: "materials",
          kind: "invoice",
        }
      );
      const assetId = await stageDraftAsset(
        fixture,
        draftId,
        `${actorCapacity}-invoice.pdf`,
        fixture.admin
      );

      await fixture.admin.mutation(
        (api as any).cost_documents.saveCostDocumentDraft,
        {
          actorCapacity,
          allocations: [
            {
              amountCents: 12_345,
              buildSubmilestoneId: fixture.buildSubmilestoneId,
            },
          ],
          documentDate: "2026-08-04",
          draftId,
          expectedRevision: 1,
          grossTotalCents: 12_345,
          pageAssetIds: [assetId],
          title: "Foundation materials",
          vendorName: "Northline Supply",
        }
      );

      await expect(
        fixture.admin.query(
          (api as any).cost_documents.getActiveCostDocumentBatch,
          {
            actorCapacity,
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
          }
        )
      ).resolves.toMatchObject({
        _id: batchId,
        drafts: [
          {
            _id: draftId,
            allocations: [
              {
                amountCents: 12_345,
                buildSubmilestoneId: fixture.buildSubmilestoneId,
              },
            ],
            grossTotalCents: 12_345,
            pages: [{ assetId }],
          },
        ],
      });
      await expect(
        fixture.base.run(async (ctx) => await ctx.db.get(batchId))
      ).resolves.toMatchObject({ creatorCapacity: actorCapacity });
    }
  );

  test("keeps explicit Homeowner Cost work separate from an implicit Admin batch", async () => {
    const fixture = await seedFixture();
    await addActiveBuildParticipant(fixture, {
      role: "homeowner",
      subject: "admin",
    });

    await expect(
      fixture.admin.query(
        (api as any).cost_documents.listCostDocumentSubmilestoneOptions,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([
      {
        id: fixture.buildSubmilestoneId,
        label: "Foundation · Footings",
        milestoneActualCostCents: 0,
        milestoneBudgetCents: 50_000_000,
        milestoneDayEnd: 20,
        milestoneDayStart: 0,
        milestoneKey: "foundation",
        milestoneName: "Foundation",
        milestoneOrder: 1,
        milestoneStatus: "in_progress",
      },
    ]);
    await expect(
      fixture.admin.query(
        (api as any).cost_documents.listCostDocumentSubmilestoneOptions,
        {
          actorCapacity: "contractor",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("The Cost Document is unavailable.");
    const adminBatchId = await fixture.admin.mutation(
      (api as any).cost_documents.createCostDocumentBatch,
      {
        buildId: fixture.buildId,
        idempotencyKey: "shared-identity-without-capacity",
        organizationId: ORGANIZATION_ID,
      }
    );
    const batchId = await fixture.admin.mutation(
      (api as any).cost_documents.createCostDocumentBatch,
      {
        actorCapacity: "homeowner",
        buildId: fixture.buildId,
        idempotencyKey: "shared-identity-homeowner-capacity",
        organizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.admin.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ _id: batchId, state: "active" });
    await expect(
      fixture.admin.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "admin",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ _id: adminBatchId, state: "active" });
    expect(adminBatchId).not.toBe(batchId);
  });

  test("prefers an active Builder owner link over an active staff link", async () => {
    const fixture = await seedFixture();
    const subject = "dual_builder_capacity";
    const actor = withIdentity(fixture.base, {
      roles: ["builder", "builder-staff"],
      subject,
    });
    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Missing dual-link Cost Document Build fixture");
      }
      const now = Date.now();
      await ctx.db.insert("builderAccountLinks", {
        assignedEmail: `${subject}@example.com`,
        brokerageId: build.brokerageId,
        builderProfileId: build.builderProfileId,
        createdAt: now,
        role: "staff",
        status: "active",
        updatedAt: now,
        workosUserId: subject,
      });
      await ctx.db.insert("builderAccountLinks", {
        assignedEmail: `${subject}@example.com`,
        brokerageId: build.brokerageId,
        builderProfileId: build.builderProfileId,
        createdAt: now + 1,
        role: "owner",
        status: "active",
        updatedAt: now + 1,
        workosUserId: subject,
      });
    });

    await expect(
      actor.query(
        (api as any).cost_documents.listCostDocumentSubmilestoneOptions,
        {
          actorCapacity: "builder",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([
      {
        id: fixture.buildSubmilestoneId,
        label: "Foundation · Footings",
        milestoneActualCostCents: 0,
        milestoneBudgetCents: 50_000_000,
        milestoneDayEnd: 20,
        milestoneDayStart: 0,
        milestoneKey: "foundation",
        milestoneName: "Foundation",
        milestoneOrder: 1,
        milestoneStatus: "in_progress",
      },
    ]);
  });

  test("keeps active Cost batches independent across a shared Homeowner and Contractor identity", async () => {
    const fixture = await seedFixture();
    await addActiveBuildParticipant(fixture, {
      role: "homeowner",
      subject: "admin",
    });
    const contractorScope = await addQualifyingContractor(fixture, "admin");
    const sharedActor = withIdentity(fixture.base, {
      roles: ["admin", "principle-broker", "contractor"],
      subject: "admin",
    });

    const contractorBatchId = (await sharedActor.mutation(
      (api as any).cost_documents.createCostDocumentBatch,
      {
        actorCapacity: "contractor",
        buildId: fixture.buildId,
        idempotencyKey: "shared-contractor-capacity-batch",
        organizationId: ORGANIZATION_ID,
      }
    )) as Id<"costDocumentBatches">;
    const homeownerBatchId = (await sharedActor.mutation(
      (api as any).cost_documents.createCostDocumentBatch,
      {
        actorCapacity: "homeowner",
        buildId: fixture.buildId,
        idempotencyKey: "shared-homeowner-capacity-batch",
        organizationId: ORGANIZATION_ID,
      }
    )) as Id<"costDocumentBatches">;

    expect(homeownerBatchId).not.toBe(contractorBatchId);
    await expect(
      sharedActor.mutation(
        (api as any).cost_documents.createCostDocumentBatch,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          idempotencyKey: "shared-contractor-capacity-batch",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("batch is unavailable");
    await expect(
      sharedActor.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "contractor",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ _id: contractorBatchId });
    await expect(
      sharedActor.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ _id: homeownerBatchId });
    const [contractorBatch, homeownerBatch] = await fixture.base.run(
      async (ctx) =>
        await Promise.all([
          ctx.db.get(contractorBatchId),
          ctx.db.get(homeownerBatchId),
        ])
    );
    expect(contractorBatch).toMatchObject({
      contractorProfileId: contractorScope.contractorId,
      creatorCapacity: "contractor",
    });
    expect(homeownerBatch).toMatchObject({
      creatorCapacity: "homeowner",
    });
    expect(homeownerBatch?.contractorProfileId).toBeUndefined();
    const capacityAuditRoles = await fixture.base.run(async (ctx) => {
      const [contractorEvents, homeownerEvents] = await Promise.all([
        ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "costDocumentBatch")
              .eq("entityId", String(contractorBatchId))
          )
          .collect(),
        ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "costDocumentBatch")
              .eq("entityId", String(homeownerBatchId))
          )
          .collect(),
      ]);
      return [contractorEvents[0]?.actorRole, homeownerEvents[0]?.actorRole];
    });
    expect(capacityAuditRoles).toEqual(["contractor", "homeowner"]);
    const homeownerDraftId = (await sharedActor.mutation(
      (api as any).cost_documents.addCostDocumentDraft,
      {
        actorCapacity: "homeowner",
        batchId: homeownerBatchId,
        category: "materials",
        kind: "receipt",
      }
    )) as Id<"costDocumentDrafts">;
    const homeownerAssetId = await stageDraftAsset(
      fixture,
      homeownerDraftId,
      "homeowner-shared-capacity-receipt.pdf",
      sharedActor,
      true
    );
    await sharedActor.mutation(
      (api as any).build_collaboration_assets
        .abandonMyBuildCollaborationAssets,
      {
        assetIds: [homeownerAssetId],
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        reason: "Legacy-session capacity audit regression",
      }
    );
    const sourceAssetAuditRoles = await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(homeownerAssetId);
      if (!asset?.stagingSessionId) {
        throw new Error("Missing Homeowner source staging provenance");
      }
      const [sessionEvents, assetEvents] = await Promise.all([
        ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "buildCollaborationAssetStagingSession")
              .eq("entityId", String(asset.stagingSessionId))
          )
          .collect(),
        ctx.db
          .query("auditEvents")
          .withIndex("by_entity", (query) =>
            query
              .eq("entityType", "buildCollaborationAsset")
              .eq("entityId", String(homeownerAssetId))
          )
          .collect(),
      ]);
      return {
        assetRoles: assetEvents.flatMap((event) =>
          event.actorRole ? [event.actorRole] : []
        ),
        sessionRoles: sessionEvents.flatMap((event) =>
          event.actorRole ? [event.actorRole] : []
        ),
      };
    });
    expect(sourceAssetAuditRoles).toEqual({
      assetRoles: ["homeowner", "homeowner"],
      sessionRoles: ["homeowner"],
    });
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(contractorBatchId, {
        contractorProfileId: undefined,
      });
    });
    await expect(
      sharedActor.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "contractor",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toBeNull();
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(contractorScope.contractorId, {
        status: "inactive",
        updatedAt: Date.now(),
      });
    });
    await expect(
      sharedActor.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ _id: homeownerBatchId });
    await expect(
      sharedActor.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "contractor",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow();
  });

  test("recovers a pre-capacity active batch without creating a duplicate", async () => {
    const fixture = await seedFixture();
    const legacyBatchId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Missing legacy Cost Document Build fixture");
      }
      const now = Date.now();
      const legacyBatchId = await ctx.db.insert("costDocumentBatches", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        ownerWorkosUserId: "builder_owner",
        revision: 1,
        state: "active",
        updatedAt: now,
      });
      for (let index = 1; index <= 6; index += 1) {
        await ctx.db.insert("costDocumentBatches", {
          brokerageId: build.brokerageId,
          buildId: build._id,
          createdAt: now + index,
          creatorCapacity: "homeowner",
          organizationId: ORGANIZATION_ID,
          ownerWorkosUserId: "builder_owner",
          revision: 1,
          state: "active",
          updatedAt: now + index,
        });
      }
      return legacyBatchId;
    });

    await expect(
      fixture.builder.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ _id: legacyBatchId });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.createCostDocumentBatch,
        {
          buildId: fixture.buildId,
          idempotencyKey: "recover-legacy-capacity-batch",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toBe(legacyBatchId);
    const activeBatches = await fixture.base.run(async (ctx) =>
      await ctx.db
        .query("costDocumentBatches")
        .withIndex("by_buildId_and_ownerWorkosUserId_and_state", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("ownerWorkosUserId", "builder_owner")
            .eq("state", "active")
        )
        .collect()
    );
    expect(
      activeBatches.filter((batch) => batch.creatorCapacity === undefined)
    ).toHaveLength(1);
  });

  test("recovers a pre-capacity Homeowner batch without widening or duplicating it", async () => {
    const fixture = await seedFixture();
    const homeowner = withIdentity(fixture.base, {
      roles: ["homeowner"],
      subject: "legacy_homeowner",
    });
    await addActiveBuildParticipant(fixture, {
      role: "homeowner",
      subject: "legacy_homeowner",
    });
    const legacyBatchId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Missing legacy Homeowner Cost Document Build fixture");
      }
      const now = Date.now();
      return await ctx.db.insert("costDocumentBatches", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        ownerWorkosUserId: "legacy_homeowner",
        revision: 1,
        state: "active",
        updatedAt: now,
      });
    });

    await expect(
      homeowner.query(
        (api as any).cost_documents.getActiveCostDocumentBatch,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ _id: legacyBatchId });
    await expect(
      homeowner.mutation(
        (api as any).cost_documents.createCostDocumentBatch,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          idempotencyKey: "recover-legacy-homeowner-capacity-batch",
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toBe(legacyBatchId);
  });

  test("preserves valid shared derived capacities after an unrelated role is removed", async () => {
    const fixture = await seedFixture();
    await addQualifyingContractor(fixture, "builder_owner");
    const sharedBuilderContractor = withIdentity(fixture.base, {
      roles: ["builder", "contractor"],
      subject: "builder_owner",
    });

    await expect(
      sharedBuilderContractor.query(
        (api as any).cost_documents.listCostDocumentSubmilestoneOptions,
        {
          actorCapacity: "contractor",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([
      expect.objectContaining({ id: fixture.buildSubmilestoneId }),
    ]);
    await expect(
      sharedBuilderContractor.query(
        (api as any).build_participants.getMyBuildParticipationScope,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          workspaceRole: "contractor",
        }
      )
    ).resolves.toMatchObject({ role: "contractor" });

    await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      if (!build) {
        throw new Error("Missing Cost Document fixture build");
      }
      const now = Date.now();
      await ctx.db.insert("buildParticipants", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        createdAt: now,
        displayNameSnapshot: "Former homeowner capacity",
        organizationId: ORGANIZATION_ID,
        participationPeriod: 1,
        removedAt: now,
        role: "homeowner",
        status: "removed",
        updatedAt: now,
        validFrom: now,
        validUntil: now,
        workosUserId: "builder_owner",
      });
    });

    await expect(
      sharedBuilderContractor.query(
        (api as any).cost_documents.listCostDocumentSubmilestoneOptions,
        {
          actorCapacity: "builder",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toHaveLength(1);
    await expect(
      sharedBuilderContractor.query(
        (api as any).cost_documents.listCostDocumentSubmilestoneOptions,
        {
          actorCapacity: "homeowner",
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("The Cost Document is unavailable.");
  });

  test("applies the live Backoffice proposal-read policy to the canonical Cost ledger", async () => {
    const fixture = await seedFixture();
    const unassignedBroker = withIdentity(fixture.base, {
      roles: ["broker"],
      subject: "policy_cost_broker",
    });
    const brokerStaff = withIdentity(fixture.base, {
      roles: ["broker-staff"],
      subject: "policy_cost_staff",
    });
    const input = {
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      paginationOpts: { cursor: null, numItems: 5 },
    };

    await expect(
      brokerStaff.query(
        (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
        input
      )
    ).rejects.toThrow("Forbidden");
    await expect(
      unassignedBroker.query(
        (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
        input
      )
    ).rejects.toThrow("Forbidden");

    const roleId = await fixture.base.run(async (ctx) =>
      ctx.db.insert("workosOrganizationRoles", {
        name: "Broker Staff",
        permissionSlugs: ["proposals:read"],
        resourceTypeSlug: "organization",
        slug: "broker-staff",
        sourceEventId: "eng-395-cost-policy",
        sourceEventType: "test.seed",
        status: "active",
        workosOrganizationId: ORGANIZATION_ID,
      })
    );
    await expect(
      brokerStaff.query(
        (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
        input
      )
    ).resolves.toMatchObject({ isDone: true, page: [] });

    const brokerRoleId = await fixture.base.run(async (ctx) =>
      ctx.db.insert("workosOrganizationRoles", {
        name: "Broker",
        permissionSlugs: ["proposals:read"],
        resourceTypeSlug: "organization",
        slug: "broker",
        sourceEventId: "eng-395-broker-cost-policy",
        sourceEventType: "test.seed",
        status: "active",
        workosOrganizationId: ORGANIZATION_ID,
      })
    );
    await expect(
      unassignedBroker.query(
        (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
        input
      )
    ).resolves.toMatchObject({ isDone: true, page: [] });

    await fixture.base.run(async (ctx) => {
      await Promise.all([
        ctx.db.patch(roleId, { status: "deleted" }),
        ctx.db.patch(brokerRoleId, { status: "deleted" }),
      ]);
    });
    await expect(
      brokerStaff.query(
        (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
        input
      )
    ).rejects.toThrow("Forbidden");
    await expect(
      unassignedBroker.query(
        (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
        input
      )
    ).rejects.toThrow("Forbidden");
  });

  test("enforces the active-role submitted-document and asset matrix, including homeowner ownership and contractor uploader isolation", async () => {
    const fixture = await seedFixture();
    const builderStaff = await addEligibleBuilderStaff(
      fixture,
      "builder_staff_matrix"
    );
    const homeowner = withIdentity(fixture.base, {
      roles: ["homeowner"],
      subject: "homeowner_matrix",
    });
    const broker = withIdentity(fixture.base, {
      roles: ["broker"],
      subject: "broker_matrix",
    });
    const brokerStaff = withIdentity(fixture.base, {
      roles: ["broker-staff"],
      subject: "broker_staff_matrix",
    });
    const principleBroker = withIdentity(fixture.base, {
      roles: ["principle-broker"],
      subject: "principle_broker_matrix",
    });
    const contractorScope = await addQualifyingContractor(
      fixture,
      "contractor_matrix"
    );
    const contractor = contractorScope.contractor;
    await Promise.all([
      addActiveBuildParticipant(fixture, {
        role: "homeowner",
        subject: "homeowner_matrix",
      }),
      addActiveBuildParticipant(fixture, {
        role: "broker",
        subject: "broker_matrix",
      }),
      addActiveBuildParticipant(fixture, {
        role: "broker-staff",
        subject: "broker_staff_matrix",
      }),
      addActiveBuildParticipant(fixture, {
        role: "principle-broker",
        subject: "principle_broker_matrix",
      }),
      addActiveBuildParticipant(fixture, {
        role: "contractor",
        subject: "contractor_matrix",
      }),
    ]);

    const homeownerBatchId = await createBatch(
      fixture,
      "homeowner-owned-batch",
      homeowner
    );
    const homeownerDraftId = await addDraft(
      fixture,
      homeownerBatchId,
      "receipt",
      "materials",
      homeowner
    );
    const homeownerAssetId = await stageDraftAsset(
      fixture,
      homeownerDraftId,
      "homeowner-source.pdf",
      homeowner
    );
    await saveDraft(
      fixture,
      homeownerDraftId,
      {
        allocations: [
          {
            amountCents: 1_100,
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          },
        ],
        documentDate: "2026-08-03",
        grossTotalCents: 1_100,
        pageAssetIds: [homeownerAssetId],
        title: "Homeowner receipt",
        vendorName: "Homeowner supplier",
      },
      homeowner
    );
    await expect(
      homeowner.mutation(
        (api as any).cost_documents.grantCostDocumentDraftCollaborator,
        {
          actorCapacity: "homeowner",
          collaboratorWorkosUserId: "builder_staff_matrix",
          draftId: homeownerDraftId,
          expectedRevision: await draftRevision(fixture, homeownerDraftId),
        }
      )
    ).resolves.toMatchObject({
      draftId: homeownerDraftId,
      revision: expect.any(Number),
    });
    await expect(
      builderStaff.query((api as any).cost_documents.getCostDocumentDraft, {
        actorCapacity: "builder-staff",
        buildId: fixture.buildId,
        draftId: homeownerDraftId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({ _id: homeownerDraftId });
    await completeDraft(fixture, homeownerDraftId, homeowner);
    await expect(
      builderStaff.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId: homeownerBatchId,
          expectedRevision: await batchRevision(fixture, homeownerBatchId),
          idempotencyKey: "forged-homeowner-submit",
        }
      )
    ).rejects.toThrow("unavailable");
    const homeownerSubmission = await homeowner.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId: homeownerBatchId,
        expectedRevision: await batchRevision(fixture, homeownerBatchId),
        idempotencyKey: "homeowner-owned-submit",
      }
    );
    expect(homeownerSubmission).toMatchObject({
      batchId: homeownerBatchId,
      costDocumentIds: [expect.any(String)],
      replayed: false,
    });
    const homeownerCostDocumentId = homeownerSubmission
      .costDocumentIds[0] as Id<"costDocuments">;
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentReviewAnnotation,
      {
        annotation: "Internal Builder review must stay private.",
        buildId: fixture.buildId,
        costDocumentId: homeownerCostDocumentId,
        organizationId: ORGANIZATION_ID,
        outcome: "needs_correction",
        reviewType: "builder",
      }
    );
    await fixture.admin.mutation(
      (api as any).cost_documents.setCostDocumentReviewAnnotation,
      {
        annotation: "Internal Brokerage review must stay private.",
        buildId: fixture.buildId,
        costDocumentId: homeownerCostDocumentId,
        organizationId: ORGANIZATION_ID,
        outcome: "accepted",
        reviewType: "brokerage",
      }
    );
    await fixture.base.run(async (ctx) => {
      const [document, page] = await Promise.all([
        ctx.db.get(homeownerCostDocumentId),
        ctx.db
          .query("costDocumentPages")
          .withIndex("by_costDocumentId_and_order", (query) =>
            query.eq("costDocumentId", homeownerCostDocumentId)
          )
          .first(),
      ]);
      if (!(document && page)) {
        throw new Error("Missing Homeowner submitted projection fixture");
      }
      const now = Date.now();
      await ctx.db.patch(document._id, {
        duplicateOverrideReason: "Internal duplicate adjudication",
      });
      await ctx.db.insert("costDocumentIntegrityExceptions", {
        actionRequired: true,
        assetId: page.assetId,
        brokerageId: document.brokerageId,
        buildId: document.buildId,
        costDocumentId: document._id,
        createdAt: now,
        expectedHashSha256: page.contentHashSha256Snapshot,
        kind: "quarantined",
        organizationId: document.organizationId,
        pageId: page._id,
      });
      for (let index = 0; index < 60; index += 1) {
        await ctx.db.insert("auditEvents", {
          actorRole: "broker",
          actorRoles: ["broker"],
          actorWorkosUserId: "internal_reviewer",
          brokerageId: document.brokerageId,
          command: "internalCostReview",
          createdAt: now + index,
          entityId: String(document._id),
          entityType: "costDocument",
          eventType: "cost_document.internal_reviewed",
          organizationId: document.organizationId,
          warnings: [],
        });
      }
    });
    const homeownerDocument = await homeowner.query(
      (api as any).cost_documents.getCostDocument,
      {
        actorCapacity: "homeowner",
        buildId: fixture.buildId,
        costDocumentId: homeownerCostDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(homeownerDocument).toMatchObject({
      activity: [expect.objectContaining({ eventType: "cost_document.submitted" })],
      capabilities: {
        canRecordBrokerageReview: false,
        canRecordBuilderReview: false,
        canStartCorrection: false,
        canVoid: false,
      },
    });
    expect(homeownerDocument).not.toHaveProperty("duplicateWarning");
    expect(homeownerDocument).not.toHaveProperty("integrity");
    expect(homeownerDocument).not.toHaveProperty("reviews");
    expect(
      homeownerDocument.activity.map((event: { eventType: string }) =>
        event.eventType
      )
    ).toEqual(["cost_document.submitted"]);
    await expect(
      homeowner.mutation(
        (api as any).cost_documents.setCostDocumentReviewAnnotation,
        {
          actorCapacity: "homeowner",
          annotation: "Homeowner must not author an authoritative review.",
          buildId: fixture.buildId,
          costDocumentId: homeownerCostDocumentId,
          organizationId: ORGANIZATION_ID,
          outcome: "accepted",
          reviewType: "builder",
        }
      )
    ).rejects.toThrow("review is unavailable");
    await expect(
      homeowner.mutation((api as any).cost_documents.voidCostDocument, {
        actorCapacity: "homeowner",
        buildId: fixture.buildId,
        costDocumentId: homeownerCostDocumentId,
        organizationId: ORGANIZATION_ID,
        reason: "Homeowner submitted history stays immutable.",
      })
    ).rejects.toThrow("cannot perform administrative recovery");

    const builderBatchId = await createBatch(fixture, "submitted-role-matrix");
    const builderDraftId = await addDraft(fixture, builderBatchId);
    const builderAssetId = await stageDraftAsset(
      fixture,
      builderDraftId,
      "submitted-role-matrix.pdf"
    );
    await saveDraft(fixture, builderDraftId, {
      allocations: [
        {
          amountCents: 2_200,
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-03",
      grossTotalCents: 2_200,
      pageAssetIds: [builderAssetId],
      title: "Builder submitted invoice",
      vendorName: "Builder vendor",
    });
    await completeDraft(fixture, builderDraftId);
    const builderSubmission = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId: builderBatchId,
        expectedRevision: await batchRevision(fixture, builderBatchId),
        idempotencyKey: "submitted-role-matrix-submit",
      }
    );
    const builderCostDocumentId = builderSubmission.costDocumentIds[0] as Id<"costDocuments">;
    expect(builderCostDocumentId).toBeDefined();

    const fullReaders = [
      fixture.admin,
      fixture.builder,
      builderStaff,
      principleBroker,
      broker,
      brokerStaff,
    ];
    for (const actor of fullReaders) {
      const document = await actor.query(
        (api as any).cost_documents.getCostDocument,
        {
          buildId: fixture.buildId,
          costDocumentId: builderCostDocumentId,
          organizationId: ORGANIZATION_ID,
        }
      );
      expect(document).toMatchObject({ _id: builderCostDocumentId });
      expect(document).not.toHaveProperty("uploaderEmailSnapshot");
      expect(document).not.toHaveProperty("uploaderWorkosUserId");

      const listed = await actor.query(
        (api as any).cost_documents.listCostDocuments,
        {
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
          paginationOpts: { cursor: null, numItems: 20 },
        }
      );
      expect(
        listed.page.map((item: { _id: Id<"costDocuments"> }) => item._id)
      ).toContain(builderCostDocumentId);

      await expect(
        actor.query(
          (api as any).build_collaboration_assets
            .listBuildCollaborationAssetStatuses,
          {
            assetIds: [builderAssetId],
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
          }
        )
      ).resolves.toEqual([
        expect.objectContaining({
          _id: builderAssetId,
          scanState: "clean",
        }),
      ]);
      await expect(
        actor.mutation(
          (api as any).build_collaboration_assets
            .authorizeBuildCollaborationAssetDownload,
          {
            assetId: builderAssetId,
            buildId: fixture.buildId,
            organizationId: ORGANIZATION_ID,
          }
        )
      ).resolves.toContain("http");
    }

    await expect(
      homeowner.query((api as any).cost_documents.getCostDocument, {
        actorCapacity: "homeowner",
        buildId: fixture.buildId,
        costDocumentId: builderCostDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      homeowner.query((api as any).cost_documents.listCostDocuments, {
        actorCapacity: "homeowner",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ _id: homeownerCostDocumentId })],
    });
    const homeownerList = await homeowner.query(
      (api as any).cost_documents.listCostDocuments,
      {
        actorCapacity: "homeowner",
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    expect(
      homeownerList.page.map(
        (item: { _id: Id<"costDocuments"> }) => item._id
      )
    ).not.toContain(builderCostDocumentId);
    await expect(
      homeowner.query(
        (api as any).build_collaboration_assets
          .listBuildCollaborationAssetStatuses,
        {
          assetIds: [builderAssetId],
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([]);
    await expect(
      homeowner.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: builderAssetId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("asset is unavailable");

    await expect(
      contractor.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: builderCostDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      contractor.query((api as any).cost_documents.listCostDocuments, {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).resolves.toMatchObject({ page: [] });
    await expect(
      contractor.query(
        (api as any).build_collaboration_assets
          .listBuildCollaborationAssetStatuses,
        {
          assetIds: [builderAssetId],
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([]);
    await expect(
      contractor.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: builderAssetId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("collaboration asset is unavailable");

    const contractorCostDocumentId = await fixture.base.run(async (ctx) => {
      const build = await ctx.db.get(fixture.buildId);
      const asset = await ctx.db.get(builderAssetId);
      if (!(build && asset?.contentHashSha256)) {
        throw new Error("Missing submitted Cost Document matrix fixture data");
      }
      const now = Date.now();
      const costDocumentId = await ctx.db.insert("costDocuments", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        category: "materials",
        contractorProfileId: contractorScope.contractorId,
        createdAt: now,
        currency: "CAD",
        documentDate: "2026-08-03",
        grossTotalCents: 3_300,
        kind: "receipt",
        organizationId: ORGANIZATION_ID,
        state: "submitted",
        submittedAt: now,
        title: "Contractor submitted receipt",
        uploaderEmailSnapshot: "contractor_matrix@example.com",
        uploaderWorkosUserId: "contractor_matrix",
        vendorName: "Contractor vendor",
      });
      await ctx.db.insert("costDocumentPages", {
        assetId: builderAssetId,
        brokerageId: build.brokerageId,
        buildId: build._id,
        contentHashSha256Snapshot: asset.contentHashSha256,
        costDocumentId,
        createdAt: now,
        fileNameSnapshot: asset.fileName,
        mimeTypeSnapshot: asset.mimeType,
        order: 1,
        organizationId: ORGANIZATION_ID,
      });
      await ctx.db.insert("costDocumentAllocations", {
        amountCents: 3_300,
        brokerageId: build.brokerageId,
        buildId: build._id,
        buildSubmilestoneId: fixture.buildSubmilestoneId,
        costDocumentId,
        createdAt: now,
        order: 1,
        organizationId: ORGANIZATION_ID,
        submilestoneKeySnapshot: "foundation",
        submilestoneNameSnapshot: "Footings",
      });
      return costDocumentId;
    });
    await expect(
      contractor.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: contractorCostDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({ _id: contractorCostDocumentId });
    await expect(
      contractor.query((api as any).cost_documents.listCostDocuments, {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ _id: contractorCostDocumentId })],
    });
    await expect(
      contractor.query(
        (api as any).build_collaboration_assets
          .listBuildCollaborationAssetStatuses,
        {
          assetIds: [builderAssetId],
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([
      expect.objectContaining({ _id: builderAssetId, scanState: "clean" }),
    ]);
    await expect(
      contractor.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId: builderAssetId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toContain("http");
  });

  // ENG-392 owns submitted correction/revision creation and its supersedes
  // lineage. There is no correction endpoint in this public contract yet; the
  // existing Draft paths below prove the exported qualification seam that a
  // future correction endpoint must reuse.
  test("rechecks Contractor scope on every existing Draft mutation, reopen, submission, and governed asset path", async () => {
    const fixture = await seedFixture();
    const contractorScope = await addQualifyingContractor(
      fixture,
      "contractor_draft_scope"
    );
    const contractor = contractorScope.contractor;
    const builderStaff = await addEligibleBuilderStaff(
      fixture,
      "builder_staff_contractor_scope"
    );
    const batchId = await createBatch(
      fixture,
      "contractor-draft-scope",
      contractor
    );
    const draftId = await addDraft(
      fixture,
      batchId,
      "invoice",
      "labour",
      contractor
    );
    const assetId = await stageDraftAsset(
      fixture,
      draftId,
      "contractor-draft-scope.pdf",
      contractor
    );
    await saveDraft(
      fixture,
      draftId,
      {
        allocations: [
          {
            amountCents: 4_200,
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          },
        ],
        documentDate: "2026-08-03",
        grossTotalCents: 4_200,
        pageAssetIds: [assetId],
        title: "Contractor scope invoice",
        vendorName: "Scope Concrete Ltd.",
      },
      contractor
    );
    await contractor.mutation(
      (api as any).cost_documents.grantCostDocumentDraftCollaborator,
      {
        collaboratorWorkosUserId: "builder_staff_contractor_scope",
        draftId,
        expectedRevision: await draftRevision(fixture, draftId),
      }
    );
    await expect(
      contractor.mutation(
        (api as any).cost_documents.grantCostDocumentDraftCollaborator,
        {
          collaboratorWorkosUserId: "unassigned_contractor",
          draftId,
          expectedRevision: await draftRevision(fixture, draftId),
        }
      )
    ).rejects.toThrow("collaborator is unavailable");
    await expect(
      saveDraft(
        fixture,
        draftId,
        { title: "Builder-side scoped collaboration" },
        builderStaff
      )
    ).resolves.toMatchObject({ revision: expect.any(Number) });

    const unassignedSubmilestoneId = await addSecondSubmilestone(fixture);
    await expect(
      saveDraft(
        fixture,
        draftId,
        {
          allocations: [
            {
              amountCents: 4_200,
              buildSubmilestoneId: unassignedSubmilestoneId,
            },
          ],
        },
        builderStaff
      )
    ).rejects.toThrow("contractor assignment is unavailable");

    // An exact collaborator grant and active Build participation cannot keep
    // a Contractor-owned Draft alive after its immutable profile provenance
    // is unlinked.
    await addActiveBuildParticipant(fixture, {
      role: "contractor",
      subject: "contractor_draft_scope",
    });
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.contractorId, {
        accountWorkosUserId: undefined,
        updatedAt: Date.now(),
      })
    );
    await expect(
      saveDraft(
        fixture,
        draftId,
        { title: "Unlinked profile collaborator overwrite" },
        builderStaff
      )
    ).rejects.toThrow("contractor assignment is unavailable");
    await expect(
      contractor.query((api as any).cost_documents.getCostDocumentDraft, {
        buildId: fixture.buildId,
        draftId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.contractorId, {
        accountWorkosUserId: "contractor_draft_scope",
        updatedAt: Date.now(),
      })
    );

    await completeDraft(fixture, draftId, contractor);
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.milestoneContractorAssignmentId, {
        status: "completed",
        updatedAt: Date.now(),
      })
    );

    await expect(
      createBatch(fixture, "contractor-completed-no-new-batch", contractor)
    ).rejects.toThrow("contractor assignment is unavailable");
    await expect(
      addDraft(fixture, batchId, "receipt", "materials", contractor)
    ).rejects.toThrow("contractor assignment is unavailable");
    await expect(
      saveDraft(
        fixture,
        draftId,
        { title: "Stale Contractor draft overwrite" },
        contractor
      )
    ).rejects.toThrow("contractor assignment is unavailable");
    await expect(
      setDraftStep(
        fixture,
        { draftId, step: "share" },
        contractor
      )
    ).rejects.toThrow("contractor assignment is unavailable");
    await expect(
      contractor.mutation((api as any).cost_documents.submitCostDocumentBatch, {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "contractor-completed-submit",
      })
    ).rejects.toThrow("contractor assignment is unavailable");
    await expect(
      stageDraftAsset(
        fixture,
        draftId,
        "contractor-completed-new-page.pdf",
        contractor
      )
    ).rejects.toThrow("unavailable");
    await expect(
      builderStaff.mutation((api as any).cost_documents.saveCostDocumentDraft, {
        draftId,
        expectedRevision: await draftRevision(fixture, draftId),
        title: "Collaborator stale overwrite",
      })
    ).rejects.toThrow("contractor assignment is unavailable");
    await expect(
      contractor.query((api as any).cost_documents.getCostDocumentDraft, {
        buildId: fixture.buildId,
        draftId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      contractor.query(
        (api as any).build_collaboration_assets
          .listBuildCollaborationAssetStatuses,
        {
          assetIds: [assetId],
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual([]);
  });

  test("fails closed for Contractor allocation, assignment-child, and tenant forgeries", async () => {
    const fixture = await seedFixture();
    const contractorScope = await addQualifyingContractor(
      fixture,
      "contractor_forged_scope"
    );
    const contractor = contractorScope.contractor;
    const batchId = await createBatch(
      fixture,
      "contractor-forged-scope",
      contractor
    );
    const draftId = await addDraft(fixture, batchId, "invoice", "labour", contractor);
    const foreignScope = await addCrossBuildSubmilestone(fixture);
    await expect(
      saveDraft(
        fixture,
        draftId,
        {
          allocations: [
            {
              amountCents: 7_000,
              buildSubmilestoneId: foreignScope.buildSubmilestoneId,
            },
          ],
        },
        contractor
      )
    ).rejects.toThrow("Cost Allocation Sub-milestone is unavailable");

    const currentAssignment = await fixture.base.run((ctx) =>
      ctx.db.get(contractorScope.milestoneContractorAssignmentId)
    );
    if (!currentAssignment) {
      throw new Error("Missing Contractor assignment forgery fixture");
    }
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.milestoneContractorAssignmentId, {
        buildMilestoneId: foreignScope.buildMilestoneId,
        buildSubmilestoneId: foreignScope.buildSubmilestoneId,
        updatedAt: Date.now(),
      })
    );
    await expect(
      saveDraft(
        fixture,
        draftId,
        { title: "Forged cross-Build assignment child" },
        contractor
      )
    ).rejects.toThrow("contractor assignment is unavailable");

    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.milestoneContractorAssignmentId, {
        buildMilestoneId: currentAssignment.buildMilestoneId,
        buildSubmilestoneId: currentAssignment.buildSubmilestoneId,
        organizationId: "org_forged_contractors",
        updatedAt: Date.now(),
      })
    );
    await expect(
      saveDraft(
        fixture,
        draftId,
        { title: "Forged cross-tenant assignment child" },
        contractor
      )
    ).rejects.toThrow("contractor assignment is unavailable");
  });

  test("filter-aware pagination reaches more than 20 normally completed records past removed Contractor scope", async () => {
    const fixture = await seedFixture();
    const contractorScope = await addQualifyingContractor(
      fixture,
      "contractor_paginated_submitted_scope"
    );
    const removedSubmilestoneId = await addSecondSubmilestone(fixture);
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.milestoneContractorAssignmentId, {
        status: "completed",
        updatedAt: Date.now(),
      })
    );
    await addContractorCostDocumentAssignment(fixture, {
      buildSubmilestoneId: removedSubmilestoneId,
      contractorId: contractorScope.contractorId,
      status: "removed",
      subject: "contractor_paginated_submitted_scope",
    });

    const retainedIds = await seedSubmittedContractorCostDocuments(fixture, {
      buildSubmilestoneId: fixture.buildSubmilestoneId,
      contractorProfileId: contractorScope.contractorId,
      count: 23,
      submittedAtStart: 10_000,
      subject: "contractor_paginated_submitted_scope",
      titlePrefix: "Retained completed scope",
    });
    const removedIds = await seedSubmittedContractorCostDocuments(fixture, {
      buildSubmilestoneId: removedSubmilestoneId,
      contractorProfileId: contractorScope.contractorId,
      count: 8,
      submittedAtStart: 20_000,
      subject: "contractor_paginated_submitted_scope",
      titlePrefix: "Removed assignment scope",
    });

    const firstPage = await contractorScope.contractor.query(
      (api as any).cost_documents.listCostDocuments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      }
    );
    const firstPageIds = firstPage.page.map(
      (document: { _id: Id<"costDocuments"> }) => document._id
    );
    // One native Convex page is authorized in memory. Removed-scope rows may
    // therefore make an authorized page sparse, but the native cursor remains
    // valid and the caller can continue draining it without a second
    // `.paginate()` call inside one function execution.
    expect(firstPageIds).toHaveLength(12);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.continueCursor).toEqual(expect.any(String));
    expect(firstPageIds.every((id: Id<"costDocuments">) => retainedIds.includes(id))).toBe(
      true
    );
    expect(firstPageIds.some((id: Id<"costDocuments">) => removedIds.includes(id))).toBe(
      false
    );

    // An explicit endCursor is how Convex replays/splits reactive page
    // intervals. Even though numItems is one here, the native page can
    // contain the whole interval, so every candidate must be authorized
    // before the returned continuation advances past it.
    const reactiveInterval = await contractorScope.contractor.query(
      (api as any).cost_documents.listCostDocuments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: {
          cursor: null,
          endCursor: firstPage.continueCursor,
          numItems: 1,
        },
      }
    );
    const reactiveIntervalIds = reactiveInterval.page.map(
      (document: { _id: Id<"costDocuments"> }) => document._id
    );
    expect(reactiveInterval.continueCursor).toBe(firstPage.continueCursor);
    expect(reactiveIntervalIds).toEqual(firstPageIds);
    expect(
      reactiveIntervalIds.some((id: Id<"costDocuments">) =>
        removedIds.includes(id)
      )
    ).toBe(false);

    const rowBoundedInterval = await contractorScope.contractor.query(
      (api as any).cost_documents.listCostDocuments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: {
          cursor: null,
          maximumRowsRead: 2,
          numItems: 20,
        },
      }
    );
    expect(rowBoundedInterval.page.length).toBeLessThanOrEqual(2);
    expect(["SplitRequired", "SplitRecommended"]).toContain(
      rowBoundedInterval.pageStatus
    );
    expect(rowBoundedInterval.splitCursor).toEqual(expect.any(String));

    const byteBoundedInterval = await contractorScope.contractor.query(
      (api as any).cost_documents.listCostDocuments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: {
          cursor: null,
          maximumBytesRead: 1,
          numItems: 20,
        },
      }
    );
    expect(byteBoundedInterval.page).toEqual([]);
    expect(["SplitRequired", "SplitRecommended"]).toContain(
      byteBoundedInterval.pageStatus
    );
    expect(byteBoundedInterval).toHaveProperty("splitCursor", null);

    const secondPage = await contractorScope.contractor.query(
      (api as any).cost_documents.listCostDocuments,
      {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 20 },
      }
    );
    const allListedIds = [
      ...firstPageIds,
      ...secondPage.page.map(
        (document: { _id: Id<"costDocuments"> }) => document._id
      ),
    ];
    expect(secondPage.isDone).toBe(true);
    expect(allListedIds).toHaveLength(retainedIds.length);
    expect(new Set(allListedIds)).toEqual(new Set(retainedIds));
  });

  test("preserves only a normally completed Contractor's own submitted read and download, then removes all future access on scope or security removal", async () => {
    const fixture = await seedFixture();
    const contractorScope = await addQualifyingContractor(
      fixture,
      "contractor_submitted_scope"
    );
    const contractor = contractorScope.contractor;
    const batchId = await createBatch(
      fixture,
      "contractor-submitted-scope",
      contractor
    );
    const draftId = await addDraft(fixture, batchId, "receipt", "materials", contractor);
    const assetId = await stageDraftAsset(
      fixture,
      draftId,
      "contractor-submitted-scope.pdf",
      contractor
    );
    await saveDraft(
      fixture,
      draftId,
      {
        allocations: [
          {
            amountCents: 5_100,
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          },
        ],
        documentDate: "2026-08-03",
        grossTotalCents: 5_100,
        pageAssetIds: [assetId],
        title: "Contractor submitted receipt",
        vendorName: "Completed scope vendor",
      },
      contractor
    );
    await completeDraft(fixture, draftId, contractor);
    const submitted = await contractor.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId,
        expectedRevision: await batchRevision(fixture, batchId),
        idempotencyKey: "contractor-submitted-scope-submit",
      }
    );
    const costDocumentId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.milestoneContractorAssignmentId, {
        status: "completed",
        updatedAt: Date.now(),
      })
    );

    await expect(
      contractor.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({ _id: costDocumentId });
    await expect(
      contractor.query((api as any).cost_documents.listCostDocuments, {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).resolves.toMatchObject({
      page: [expect.objectContaining({ _id: costDocumentId })],
    });
    await expect(
      contractor.mutation(
        (api as any).cost_documents.authorizeCostDocumentPageDownload,
        {
          assetId,
          buildId: fixture.buildId,
          costDocumentId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({ storageId: expect.any(String) });
    await expect(
      contractor.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toContain("http");

    await addActiveBuildParticipant(fixture, {
      role: "contractor",
      subject: "contractor_submitted_scope",
    });
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.contractorId, {
        accountWorkosUserId: undefined,
        updatedAt: Date.now(),
      })
    );
    await expect(
      contractor.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      contractor.mutation(
        (api as any).cost_documents.authorizeCostDocumentPageDownload,
        {
          assetId,
          buildId: fixture.buildId,
          costDocumentId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Cost Document is unavailable");
    await expect(
      contractor.mutation(
        (api as any).build_collaboration_assets
          .authorizeBuildCollaborationAssetDownload,
        {
          assetId,
          buildId: fixture.buildId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("collaboration asset is unavailable");
    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.contractorId, {
        accountWorkosUserId: "contractor_submitted_scope",
        updatedAt: Date.now(),
      })
    );

    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.milestoneContractorAssignmentId, {
        status: "removed",
        updatedAt: Date.now(),
      })
    );
    await expect(
      contractor.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      contractor.query((api as any).cost_documents.listCostDocuments, {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).resolves.toMatchObject({ page: [] });
    await expect(
      contractor.mutation(
        (api as any).cost_documents.authorizeCostDocumentPageDownload,
        {
          assetId,
          buildId: fixture.buildId,
          costDocumentId,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow("Cost Document is unavailable");

    await fixture.base.run((ctx) =>
      ctx.db.patch(contractorScope.milestoneContractorAssignmentId, {
        status: "completed",
        updatedAt: Date.now(),
      })
    );
    await addActiveBuildParticipant(fixture, {
      role: "contractor",
      subject: "contractor_submitted_scope",
    });
    await fixture.base.run(async (ctx) => {
      const participation = await ctx.db
        .query("buildParticipants")
        .withIndex("by_buildId_and_workosUserId_and_participationPeriod", (query) =>
          query
            .eq("buildId", fixture.buildId)
            .eq("workosUserId", "contractor_submitted_scope")
        )
        .order("desc")
        .first();
      if (!participation) {
        throw new Error("Missing Contractor security-removal fixture");
      }
      await ctx.db.patch(participation._id, {
        status: "removed",
        updatedAt: Date.now(),
      });
    });
    await expect(
      contractor.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow("active build participation revoked");
  });

  test("blocks exact source duplicates while requiring an audited override for likely same-Build duplicates", async () => {
    const fixture = await seedFixture();
    const original = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "exact-duplicate-source.pdf",
      key: "integrity-original",
    });
    await fixture.base.run(async (ctx) => {
      const source = await ctx.db.get(original.costDocumentId);
      if (!source) throw new Error("Missing duplicate-scope source fixture");
      const { _creationTime, _id, ...fields } = source;
      await ctx.db.insert("costDocuments", {
        ...fields,
        organizationId: "org_duplicate_scope_forgery",
        submittedAt: source.submittedAt + 1,
      });
    });

    const exact = await prepareIntegrityFixtureDraft(fixture, {
      assetFileName: "exact-duplicate-source.pdf",
      key: "integrity-exact-copy",
    });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId: exact.batchId,
          expectedRevision: await batchRevision(fixture, exact.batchId),
          idempotencyKey: "integrity-exact-copy-submit",
        }
      )
    ).rejects.toThrow("exact duplicate");
    await fixture.builder.mutation(
      (api as any).cost_documents.abandonCostDocumentBatch,
      {
        batchId: exact.batchId,
        expectedRevision: await batchRevision(fixture, exact.batchId),
        reason: "Exact duplicate correctly rejected.",
      }
    );

    const likely = await prepareIntegrityFixtureDraft(fixture, {
      assetFileName: "different-source.pdf",
      key: "integrity-likely-copy",
    });
    const assessment = await fixture.builder.query(
      (api as any).cost_documents.getCostDocumentDuplicateAssessment,
      { draftId: likely.draftId }
    );
    expect(assessment).toMatchObject({
      likelyDuplicateCostDocumentIds: [original.costDocumentId],
      requiresOverride: true,
    });
    expect(assessment).not.toHaveProperty("exactDuplicateCostDocumentId");
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId: likely.batchId,
          expectedRevision: await batchRevision(fixture, likely.batchId),
          idempotencyKey: "integrity-likely-copy-submit",
        }
      )
    ).rejects.toThrow("likely duplicate");
    const submitted = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId: likely.batchId,
        duplicateOverrideReason: "Separate supplier invoice for the same amount.",
        expectedRevision: await batchRevision(fixture, likely.batchId),
        idempotencyKey: "integrity-likely-copy-submit",
      }
    );
    const acceptedId = submitted.costDocumentIds[0] as Id<"costDocuments">;
    const accepted = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId: acceptedId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(accepted.duplicateWarning).toMatchObject({
      overridden: true,
      reason: "Separate supplier invoice for the same amount.",
    });
  });

  test("serializes concurrent exact-duplicate submissions so only one independent record wins", async () => {
    const fixture = await seedFixture();
    const staff = await addEligibleBuilderStaff(fixture, "duplicate_race_staff");
    const builderDraft = await prepareIntegrityFixtureDraft(fixture, {
      assetFileName: "duplicate-race-source.pdf",
      key: "duplicate-race-builder",
    });
    const staffDraft = await prepareIntegrityFixtureDraft(fixture, {
      actor: staff,
      assetFileName: "duplicate-race-source.pdf",
      key: "duplicate-race-staff",
    });

    const results = await Promise.allSettled([
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId: builderDraft.batchId,
          expectedRevision: await batchRevision(
            fixture,
            builderDraft.batchId
          ),
          idempotencyKey: "duplicate-race-builder-submit",
        }
      ),
      staff.mutation((api as any).cost_documents.submitCostDocumentBatch, {
        batchId: staffDraft.batchId,
        expectedRevision: await batchRevision(fixture, staffDraft.batchId),
        idempotencyKey: "duplicate-race-staff-submit",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1
    );
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1
    );
    const rejected = results.find((result) => result.status === "rejected");
    expect(String(rejected && "reason" in rejected ? rejected.reason : "")).toContain(
      "exact duplicate"
    );
  });

  test("rejects exact-source sibling drafts inside one atomic batch", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "duplicate-sibling-batch");
    for (const suffix of ["first", "second"] as const) {
      const draftId = await addDraft(fixture, batchId, "invoice", "labour");
      const assetId = await stageDraftAsset(
        fixture,
        draftId,
        "same-sibling-source.pdf"
      );
      await saveDraft(fixture, draftId, {
        allocations: [
          {
            amountCents: 12_345,
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          },
        ],
        documentDate: "2026-08-01",
        grossTotalCents: 12_345,
        pageAssetIds: [assetId],
        title: `Sibling ${suffix}`,
        vendorName: "Cedar Forming Ltd.",
      });
      await completeDraft(fixture, draftId);
    }

    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId,
          duplicateOverrideReason: "This must not bypass exact-source checks.",
          expectedRevision: await batchRevision(fixture, batchId),
          idempotencyKey: "duplicate-sibling-batch-submit",
        }
      )
    ).rejects.toThrow("exact duplicate");
    await expect(
      fixture.base.run(async (ctx) =>
        await ctx.db
          .query("costDocuments")
          .withIndex("by_batchId", (query) => query.eq("batchId", batchId))
          .collect()
      )
    ).resolves.toEqual([]);
  });

  test.each(["voided", "superseded"] as const)(
    "keeps legacy %s records in the exact-source invariant",
    async (lifecycle) => {
      const fixture = await seedFixture();
      const original = await submitIntegrityFixtureDocument(fixture, {
        assetFileName: `legacy-${lifecycle}-source.pdf`,
        key: `legacy-${lifecycle}-source`,
      });
      await fixture.base.run(async (ctx) => {
        const source = await ctx.db.get(original.costDocumentId);
        if (!source) throw new Error("Missing legacy duplicate fixture");
        if (lifecycle === "voided") {
          await ctx.db.patch(source._id, {
            sourceHashDigest: undefined,
            voidReason: "Legacy void fixture.",
            voidedAt: Date.now(),
            voidedByWorkosUserId: "admin",
          });
          return;
        }
        const { _creationTime, _id, ...fields } = source;
        const successorId = await ctx.db.insert("costDocuments", {
          ...fields,
          createdAt: source.createdAt + 1,
          sourceHashDigest: "f".repeat(64),
          submittedAt: source.submittedAt + 1,
          title: "Legacy successor fixture",
        });
        await ctx.db.patch(source._id, {
          sourceHashDigest: undefined,
          supersededAt: Date.now(),
          supersededByCostDocumentId: successorId,
        });
      });

      const duplicate = await prepareIntegrityFixtureDraft(fixture, {
        assetFileName: `legacy-${lifecycle}-source.pdf`,
        key: `legacy-${lifecycle}-copy`,
      });
      await expect(
        fixture.builder.mutation(
          (api as any).cost_documents.submitCostDocumentBatch,
          {
            batchId: duplicate.batchId,
            expectedRevision: await batchRevision(fixture, duplicate.batchId),
            idempotencyKey: `legacy-${lifecycle}-copy-submit`,
          }
        )
      ).rejects.toThrow("exact duplicate");
    }
  );

  test("backfills bounded legacy source digests without changing submitted facts", async () => {
    const fixture = await seedFixture();
    const submitted = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "legacy-backfill-source.pdf",
      key: "legacy-backfill",
    });
    const before = await fixture.base.run(async (ctx) => {
      const document = await ctx.db.get(submitted.costDocumentId);
      if (!document) throw new Error("Missing backfill fixture");
      await ctx.db.patch(document._id, { sourceHashDigest: undefined });
      return document;
    });
    await expect(
      fixture.admin.mutation(
        (api as any).cost_documents.backfillCostDocumentSourceHashDigests,
        {
          buildId: fixture.buildId,
          limit: 1,
          organizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toEqual({ hasMore: false, processed: 1 });
    const after = await fixture.base.run(
      async (ctx) => await ctx.db.get(submitted.costDocumentId)
    );
    expect(after).toMatchObject({
      documentDate: before.documentDate,
      grossTotalCents: before.grossTotalCents,
      sourceHashDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      title: before.title,
      vendorName: before.vendorName,
    });
  });

  test("fails closed on foreign or oversized submitted child projections", async () => {
    const fixture = await seedFixture();
    const submitted = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "projection-graph-source.pdf",
      key: "projection-graph",
    });
    const read = () =>
      fixture.builder.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      });
    const graph = await fixture.base.run(async (ctx) => {
      const document = await ctx.db.get(submitted.costDocumentId);
      const page = await ctx.db
        .query("costDocumentPages")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .first();
      const allocation = await ctx.db
        .query("costDocumentAllocations")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .first();
      if (!(document && page && allocation)) {
        throw new Error("Missing submitted projection graph fixture");
      }
      return { allocation, document, page };
    });

    const foreignPageId = await fixture.base.run(async (ctx) => {
      const { _creationTime, _id, ...fields } = graph.page;
      return await ctx.db.insert("costDocumentPages", {
        ...fields,
        order: 1,
        organizationId: "org_foreign_projection",
      });
    });
    await expect(read()).rejects.toThrow("durable graph is unavailable");
    await fixture.base.run(async (ctx) => await ctx.db.delete(foreignPageId));

    const foreignAllocationId = await fixture.base.run(async (ctx) => {
      const { _creationTime, _id, ...fields } = graph.allocation;
      return await ctx.db.insert("costDocumentAllocations", {
        ...fields,
        order: 1,
        organizationId: "org_foreign_projection",
      });
    });
    await expect(read()).rejects.toThrow("durable graph is unavailable");
    await fixture.base.run(
      async (ctx) => await ctx.db.delete(foreignAllocationId)
    );

    const foreignComponentId = await fixture.base.run(async (ctx) =>
      await ctx.db.insert("costDocumentFinancialComponents", {
        amountCents: 1,
        brokerageId: graph.document.brokerageId,
        buildId: graph.document.buildId,
        costDocumentId: graph.document._id,
        createdAt: Date.now(),
        kind: "fee",
        label: "Forged foreign fee",
        order: 0,
        organizationId: "org_foreign_projection",
      })
    );
    await expect(read()).rejects.toThrow("durable graph is unavailable");
    await fixture.base.run(
      async (ctx) => await ctx.db.delete(foreignComponentId)
    );

    const overflowPageIds = await fixture.base.run(async (ctx) => {
      const ids: Id<"costDocumentPages">[] = [];
      const { _creationTime, _id, ...fields } = graph.page;
      for (let order = 1; order <= 500; order += 1) {
        ids.push(
          await ctx.db.insert("costDocumentPages", { ...fields, order })
        );
      }
      return ids;
    });
    await expect(read()).rejects.toThrow("durable graph is unavailable");
    await fixture.base.run(async (ctx) => {
      for (const pageId of overflowPageIds) await ctx.db.delete(pageId);
    });
  });

  test("keeps Builder and Brokerage review annotations independent and voids without deleting lineage", async () => {
    const fixture = await seedFixture();
    const submitted = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "review-source.pdf",
      key: "integrity-review",
    });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.setCostDocumentReviewAnnotation,
        {
          annotation: "Builder cannot author Brokerage Review.",
          buildId: fixture.buildId,
          costDocumentId: submitted.costDocumentId,
          organizationId: ORGANIZATION_ID,
          outcome: "accepted",
          reviewType: "brokerage",
        }
      )
    ).rejects.toThrow("brokerage Cost Document review is unavailable");
    await expect(
      fixture.admin.mutation(
        (api as any).cost_documents.setCostDocumentReviewAnnotation,
        {
          annotation: "Brokerage cannot author Builder Review.",
          buildId: fixture.buildId,
          costDocumentId: submitted.costDocumentId,
          organizationId: ORGANIZATION_ID,
          outcome: "accepted",
          reviewType: "builder",
        }
      )
    ).rejects.toThrow("builder Cost Document review is unavailable");
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentReviewAnnotation,
      {
        annotation: "Matches the concrete delivery docket.",
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
        outcome: "accepted",
        reviewType: "builder",
      }
    );
    await fixture.admin.mutation(
      (api as any).cost_documents.setCostDocumentReviewAnnotation,
      {
        annotation: "Awaiting lender allocation confirmation.",
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
        outcome: "needs_correction",
        reviewType: "brokerage",
      }
    );
    let document = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(document.reviews).toMatchObject({
      brokerage: {
        annotation: "Awaiting lender allocation confirmation.",
        outcome: "needs_correction",
      },
      builder: {
        annotation: "Matches the concrete delivery docket.",
        outcome: "accepted",
      },
    });

    await expect(
      fixture.admin.mutation((api as any).cost_documents.voidCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
        reason: "An ordinary Backoffice session cannot silently override.",
      })
    ).rejects.toThrow("break-glass confirmation");
    await fixture.admin.mutation(
      (api as any).cost_documents.voidCostDocument,
      {
        administrativeCapacity: "admin",
        breakGlassConfirmed: true,
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
        reason: "Uploaded against the wrong purchase order.",
      }
    );
    document = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(document.lifecycle).toMatchObject({
      state: "voided",
      voidReason: "Uploaded against the wrong purchase order.",
    });
    await expect(
      fixture.builder.query((api as any).cost_documents.listCostDocuments, {
        buildId: fixture.buildId,
        organizationId: ORGANIZATION_ID,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).resolves.toMatchObject({ page: [] });
    const retained = await fixture.base.run(async (ctx) => ({
      allocations: await ctx.db
        .query("costDocumentAllocations")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .collect(),
      document: await ctx.db.get(submitted.costDocumentId),
      pages: await ctx.db
        .query("costDocumentPages")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .collect(),
    }));
    expect(retained.document).not.toBeNull();
    expect(retained.allocations).toHaveLength(1);
    expect(retained.pages).toHaveLength(1);
    await expect(
      fixture.builder.mutation((api as any).cost_documents.voidCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
        reason: "Attempted second void.",
      })
    ).rejects.toThrow("already voided");
  });

  test("projects an auditable, tenant-scoped Roadmap Reconciliation without exposing uploader identity", async () => {
    const fixture = await seedFixture();
    const submitted = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "roadmap-reconciliation-source.pdf",
      key: "roadmap-reconciliation",
    });
    await fixture.base.run(async (ctx) => {
      const document = await ctx.db.get(submitted.costDocumentId);
      const page = await ctx.db
        .query("costDocumentPages")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .first();
      if (!document || !page) {
        throw new Error("Roadmap reconciliation fixture graph is incomplete.");
      }
      await ctx.db.insert("costDocumentIntegrityExceptions", {
        actionRequired: true,
        assetId: page.assetId,
        brokerageId: document.brokerageId,
        buildId: document.buildId,
        costDocumentId: document._id,
        createdAt: 1_600_000_000_000,
        expectedHashSha256: page.contentHashSha256Snapshot,
        kind: "missing",
        organizationId: document.organizationId,
        pageId: page._id,
      });
      for (let index = 0; index < 51; index += 1) {
        await ctx.db.insert("costDocumentIntegrityExceptions", {
          actionRequired: false,
          assetId: page.assetId,
          brokerageId: document.brokerageId,
          buildId: document.buildId,
          costDocumentId: document._id,
          createdAt: 1_700_000_000_000 + index,
          expectedHashSha256: page.contentHashSha256Snapshot,
          kind: "unavailable",
          organizationId: document.organizationId,
          pageId: page._id,
          resolvedAt: 1_700_000_100_000 + index,
        });
      }
    });
    const args = {
      buildId: fixture.buildId,
      organizationId: ORGANIZATION_ID,
      paginationOpts: { cursor: null, numItems: 50 },
    };
    const beforeVoid = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
      args
    );
    expect(beforeVoid.page).toEqual([
      expect.objectContaining({
        _id: submitted.costDocumentId,
        allocations: [
          expect.objectContaining({
            buildSubmilestoneId: fixture.buildSubmilestoneId,
          }),
        ],
        category: "labour",
        duplicateWarning: false,
        financialComponents: [
          expect.objectContaining({ kind: "subtotal", amountCents: 11_000 }),
          expect.objectContaining({ kind: "tax", amountCents: 1_345 }),
        ],
        integrity: { healthy: false, openExceptionKinds: ["missing"] },
        lifecycle: { state: "current" },
        pages: [
          expect.objectContaining({
            fileName: "roadmap-reconciliation-source.pdf",
          }),
        ],
        reviewAttention: "unreviewed",
        uploaderScope: "self",
      }),
    ]);
    expect(beforeVoid.page[0]).not.toHaveProperty("uploaderWorkosUserId");

    const detail = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(detail).toMatchObject({
      capabilities: {
        canRecordBrokerageReview: false,
        canRecordBuilderReview: true,
        canStartCorrection: true,
        canVoid: true,
      },
      integrity: {
        healthy: false,
        openExceptions: [expect.objectContaining({ kind: "missing" })],
      },
      uploaderScope: "self",
    });
    expect(detail).not.toHaveProperty("uploaderWorkosUserId");
    const otherViewerDetail = await fixture.admin.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(otherViewerDetail).toMatchObject({ uploaderScope: "other" });
    expect(JSON.stringify(otherViewerDetail)).not.toContain("builder_owner");

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(submitted.assetId, { state: "quarantined" });
    });
    await fixture.builder.mutation(
      (api as any).cost_documents.reconcileCostDocumentIntegrity,
      {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      }
    );
    const withIntegrityAttention = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
      args
    );
    expect(withIntegrityAttention.page).toEqual([
      expect.objectContaining({
        _id: submitted.costDocumentId,
        integrity: { healthy: false, openExceptionKinds: ["quarantined"] },
      }),
    ]);

    await fixture.builder.mutation((api as any).cost_documents.voidCostDocument, {
      buildId: fixture.buildId,
      costDocumentId: submitted.costDocumentId,
      organizationId: ORGANIZATION_ID,
      reason: "Duplicate uploaded during reconciliation test.",
    });
    const afterVoid = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
      args
    );
    expect(afterVoid.page).toEqual([
      expect.objectContaining({
        _id: submitted.costDocumentId,
        lifecycle: { state: "voided" },
      }),
    ]);

    for (let index = 0; index < 10; index += 1) {
      await submitIntegrityFixtureDocument(fixture, {
        assetFileName: `roadmap-page-boundary-${index}.pdf`,
        key: `roadmap-page-boundary-${index}`,
        sequence: index + 1,
      });
    }
    const boundedFirstPage = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
      args
    );
    expect(boundedFirstPage.page).toHaveLength(5);
    expect(boundedFirstPage.isDone).toBe(false);
    const boundedSecondPage = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
      {
        ...args,
        paginationOpts: {
          cursor: boundedFirstPage.continueCursor,
          numItems: 50,
        },
      }
    );
    expect(boundedSecondPage.page).toHaveLength(5);
    expect(boundedSecondPage.isDone).toBe(false);
    const boundedThirdPage = await fixture.builder.query(
      (api as any).cost_documents.listCostDocumentRoadmapReconciliation,
      {
        ...args,
        paginationOpts: {
          cursor: boundedSecondPage.continueCursor,
          numItems: 50,
        },
      }
    );
    expect(boundedThirdPage.page).toHaveLength(1);
    expect(boundedThirdPage.isDone).toBe(true);
  });

  test("creates linear corrected revisions and records durable action-required integrity exceptions", async () => {
    const fixture = await seedFixture();
    const original = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "correction-source.pdf",
      key: "integrity-correction-original",
    });
    const correction = await fixture.builder.mutation(
      (api as any).cost_documents.startCostDocumentCorrection,
      {
        buildId: fixture.buildId,
        costDocumentId: original.costDocumentId,
        idempotencyKey: "integrity-correction-v2",
        organizationId: ORGANIZATION_ID,
        reason: "Correct the immutable source details and allocation.",
        reuseSourcePages: true,
      }
    );
    await saveDraft(fixture, correction.draftId, {
      title: "Corrected foundation invoice",
    });
    await completeDraft(fixture, correction.draftId);
    const corrected = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      {
        batchId: correction.batchId,
        expectedRevision: await batchRevision(fixture, correction.batchId),
        idempotencyKey: "integrity-correction-v2-submit",
      }
    );
    const correctedId = corrected.costDocumentIds[0] as Id<"costDocuments">;
    const projected = await fixture.builder.query(
      (api as any).cost_documents.getCostDocument,
      {
        buildId: fixture.buildId,
        costDocumentId: correctedId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(projected.revision).toMatchObject({
      number: 2,
      supersedesCostDocumentId: original.costDocumentId,
    });
    await expect(
      fixture.builder.query((api as any).cost_documents.getCostDocument, {
        buildId: fixture.buildId,
        costDocumentId: original.costDocumentId,
        organizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({
      lifecycle: { state: "superseded" },
      pages: [expect.objectContaining({ assetId: original.assetId })],
      revision: { number: 1, supersededByCostDocumentId: correctedId },
    });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.startCostDocumentCorrection,
        {
          buildId: fixture.buildId,
          costDocumentId: original.costDocumentId,
          idempotencyKey: "integrity-correction-fork",
          organizationId: ORGANIZATION_ID,
          reason: "This fork must remain forbidden.",
          reuseSourcePages: true,
        }
      )
    ).rejects.toThrow("newest revision");

    await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(original.assetId);
      if (!asset) throw new Error("Missing integrity asset fixture");
      await ctx.db.patch(asset._id, { state: "quarantined" });
    });
    const quarantinedResponse = await fixture.builder.fetch(
      `/api/cost-documents/page?${new URLSearchParams({
        assetId: original.assetId,
        buildId: fixture.buildId,
        costDocumentId: correctedId,
        organizationId: ORGANIZATION_ID,
      }).toString()}`,
      {
        headers: {
          Authorization: "Bearer test-auth-token",
          Origin: "http://localhost:3000",
        },
      }
    );
    expect(quarantinedResponse.status).toBe(409);
    expect(quarantinedResponse.headers.get("Cache-Control")).toContain(
      "no-store"
    );
    const integrity = await fixture.builder.mutation(
      (api as any).cost_documents.reconcileCostDocumentIntegrity,
      {
        buildId: fixture.buildId,
        costDocumentId: correctedId,
        organizationId: ORGANIZATION_ID,
      }
    );
    expect(integrity).toMatchObject({
      healthy: false,
      exceptions: [
        expect.objectContaining({
          actionRequired: true,
          kind: "quarantined",
        }),
      ],
    });
    const durable = await fixture.base.run(async (ctx) => ({
      exceptions: await ctx.db
        .query("costDocumentIntegrityExceptions")
        .withIndex("by_costDocumentId_and_createdAt", (query) =>
          query.eq("costDocumentId", correctedId)
        )
        .collect(),
      outbox: await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(correctedId))
        )
        .collect(),
    }));
    expect(durable.exceptions).toHaveLength(1);
    expect(
      durable.outbox.some(
        (event) => event.eventType === "cost_document.integrity_exception"
      )
    ).toBe(true);
  });

  test.each([
    ["missing", "delete"],
    ["corrupt", "hash"],
  ] as const)(
    "records and deduplicates %s source integrity failures without deleting the submitted record",
    async (expectedKind, corruption) => {
      const fixture = await seedFixture();
      const submitted = await submitIntegrityFixtureDocument(fixture, {
        assetFileName: `integrity-${expectedKind}.pdf`,
        key: `integrity-${expectedKind}`,
      });
      await fixture.base.run(async (ctx) => {
        const asset = await ctx.db.get(submitted.assetId);
        if (!asset) throw new Error("Missing integrity failure asset");
        if (corruption === "delete") {
          await ctx.db.delete(asset._id);
        } else {
          await ctx.db.patch(asset._id, {
            contentHashSha256: "f".repeat(64),
          });
        }
      });
      const args = {
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      };
      await expect(
        fixture.builder.mutation(
          (api as any).cost_documents.reconcileCostDocumentIntegrity,
          args
        )
      ).resolves.toMatchObject({
        exceptions: [expect.objectContaining({ kind: expectedKind })],
        healthy: false,
      });
      await fixture.builder.mutation(
        (api as any).cost_documents.reconcileCostDocumentIntegrity,
        args
      );
      const retained = await fixture.base.run(async (ctx) => ({
        document: await ctx.db.get(submitted.costDocumentId),
        exceptions: await ctx.db
          .query("costDocumentIntegrityExceptions")
          .withIndex("by_costDocumentId_and_createdAt", (query) =>
            query.eq("costDocumentId", submitted.costDocumentId)
          )
          .collect(),
      }));
      expect(retained.document).not.toBeNull();
      expect(retained.exceptions).toHaveLength(1);
    }
  );

  test("records a durable unavailable exception when delivery fails after authorization", async () => {
    const fixture = await seedFixture();
    const submitted = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "delivery-failure-source.pdf",
      key: "delivery-failure",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 503 })
    );

    const response = await fixture.builder.fetch(
      `/api/cost-documents/page?${new URLSearchParams({
        assetId: submitted.assetId,
        buildId: fixture.buildId,
        costDocumentId: submitted.costDocumentId,
        organizationId: ORGANIZATION_ID,
      }).toString()}`,
      {
        headers: {
          Authorization: "Bearer test-auth-token",
          Origin: "http://localhost:3000",
        },
      }
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const durable = await fixture.base.run(async (ctx) => ({
      intents: await ctx.db
        .query("communicationIntents")
        .withIndex(
          "by_relatedEntityType_and_relatedEntityId_and_createdAt",
          (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(submitted.costDocumentId))
        )
        .collect()
        .then((intents) =>
          intents.filter(
            (intent) =>
              intent.kind === "cost_document_integrity_action_required"
          )
        ),
      exceptions: await ctx.db
        .query("costDocumentIntegrityExceptions")
        .withIndex("by_costDocumentId_and_createdAt", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .collect(),
      outbox: await ctx.db
        .query("eventOutbox")
        .withIndex("by_entity", (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(submitted.costDocumentId))
        )
        .collect(),
    }));
    expect(durable.exceptions).toEqual([
      expect.objectContaining({ kind: "unavailable" }),
    ]);
    expect(durable.exceptions[0]).not.toHaveProperty("resolvedAt");
    expect(durable.intents).toEqual([
      expect.objectContaining({
        kind: "cost_document_integrity_action_required",
        status: "pending",
        templateKey: "cost_document_integrity_action_required_v1",
      }),
    ]);
    expect(
      durable.outbox.filter(
        (event) => event.eventType === "cost_document.integrity_exception"
      )
    ).toHaveLength(1);
  });

  test("resolves stale integrity kinds and notifies again after a resolved recurrence", async () => {
    const fixture = await seedFixture();
    const submitted = await submitIntegrityFixtureDocument(fixture, {
      assetFileName: "integrity-transition-source.pdf",
      key: "integrity-transition",
    });
    const args = {
      buildId: fixture.buildId,
      costDocumentId: submitted.costDocumentId,
      organizationId: ORGANIZATION_ID,
    };
    const expectedHash = await fixture.base.run(async (ctx) => {
      const page = await ctx.db
        .query("costDocumentPages")
        .withIndex("by_costDocumentId_and_order", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .first();
      if (!page) throw new Error("Missing integrity transition page");
      return page.contentHashSha256Snapshot;
    });

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(submitted.assetId, { state: "quarantined" });
    });
    await fixture.builder.mutation(
      (api as any).cost_documents.reconcileCostDocumentIntegrity,
      args
    );
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(submitted.assetId, {
        contentHashSha256: "f".repeat(64),
        state: "available",
      });
    });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.reconcileCostDocumentIntegrity,
        args
      )
    ).resolves.toMatchObject({
      exceptions: [expect.objectContaining({ kind: "corrupt" })],
      healthy: false,
    });
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(submitted.assetId, {
        contentHashSha256: expectedHash,
      });
    });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.reconcileCostDocumentIntegrity,
        args
      )
    ).resolves.toMatchObject({ exceptions: [], healthy: true });
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(submitted.assetId, {
        contentHashSha256: "e".repeat(64),
      });
    });
    await fixture.builder.mutation(
      (api as any).cost_documents.reconcileCostDocumentIntegrity,
      args
    );

    const durable = await fixture.base.run(async (ctx) => ({
      intents: await ctx.db
        .query("communicationIntents")
        .withIndex(
          "by_relatedEntityType_and_relatedEntityId_and_createdAt",
          (query) =>
          query
            .eq("relatedEntityType", "costDocument")
            .eq("relatedEntityId", String(submitted.costDocumentId))
        )
        .collect()
        .then((intents) =>
          intents.filter(
            (intent) =>
              intent.kind === "cost_document_integrity_action_required"
          )
        ),
      exceptions: await ctx.db
        .query("costDocumentIntegrityExceptions")
        .withIndex("by_costDocumentId_and_createdAt", (query) =>
          query.eq("costDocumentId", submitted.costDocumentId)
        )
        .collect(),
    }));
    expect(durable.exceptions).toHaveLength(3);
    expect(
      durable.exceptions.filter((exception) => exception.resolvedAt === undefined)
    ).toEqual([expect.objectContaining({ kind: "corrupt" })]);
    expect(durable.intents).toHaveLength(3);
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
  workpoolTest.register(base, "buildCollaborationSearchWorkpool");
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
    (internal as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const seeded = await base.run(async (ctx) => {
    const now = Date.now();
    await Promise.all(
      [
        ["admin", "admin@example.com"],
        ["builder_owner", "builder_owner@example.com"],
      ].map(([workosUserId, email]) =>
        ctx.db.insert("users", {
          authId: workosUserId,
          email,
          emailVerified: true,
          name: workosUserId,
          status: "active",
          workosUserId,
        })
      )
    );
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
    const vendorProfileId = await ctx.db.insert("contractorProfiles", {
      brokerageId: foundation.brokerageId,
      createdAt: now,
      email: "accounts@cedar.example",
      name: "Cedar Forming Ltd.",
      organizationId: ORGANIZATION_ID,
      quoteRecipientCapabilities: ["contractor"],
      status: "active",
      trades: ["concrete"],
      updatedAt: now,
    });
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
    return {
      buildId,
      builderProfileId: foundation.builderProfileId,
      buildSubmilestoneId,
      brokerageId: foundation.brokerageId,
      vendorProfileId,
    };
  });
  return { admin, base, builder, ...seeded };
}

async function addEligibleBuilderStaff(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  subject: string
) {
  const staff = withIdentity(fixture.base, {
    roles: ["builder-staff"],
    subject,
  });
  await fixture.base.run(async (ctx) => {
    const build = await ctx.db.get(fixture.buildId);
    if (!build) {
      throw new Error("Missing Cost Document fixture build");
    }
    const now = Date.now();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", subject)
      )
      .take(1);
    if (existingUser.length === 0) {
      await ctx.db.insert("users", {
        authId: subject,
        email: `${subject}@example.com`,
        emailVerified: true,
        name: subject,
        status: "active",
        workosUserId: subject,
      });
    }
    const builderAccountLinkId = await ctx.db.insert("builderAccountLinks", {
      assignedEmail: `${subject}@example.com`,
      brokerageId: build.brokerageId,
      builderProfileId: build.builderProfileId,
      createdAt: now,
      role: "staff",
      status: "active",
      updatedAt: now,
      workosUserId: subject,
    });
    await ctx.db.insert("builderStaffPermissionGrants", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      builderAccountLinkId,
      builderProfileId: build.builderProfileId,
      canCreate: true,
      canDelete: false,
      canUpdate: true,
      canView: true,
      createdAt: now,
      createdByWorkosUserId: "builder_owner",
      organizationId: ORGANIZATION_ID,
      resourceType: "evidence",
      scope: "activeBuild",
      updatedAt: now,
      updatedByWorkosUserId: "builder_owner",
      workosUserId: subject,
    });
  });
  return staff;
}

async function addQualifyingContractor(
  fixture: CostDocumentFixture,
  subject: string,
  input: { buildSubmilestoneId?: Id<"buildSubmilestones"> } = {}
) {
  const contractor = withIdentity(fixture.base, {
    roles: ["contractor"],
    subject,
  });
  const assignment = await fixture.base.run(async (ctx) => {
    const [build, submilestone] = await Promise.all([
      ctx.db.get(fixture.buildId),
      ctx.db.get(input.buildSubmilestoneId ?? fixture.buildSubmilestoneId),
    ]);
    if (!(build && submilestone)) {
      throw new Error("Missing Contractor Cost Document fixture scope");
    }
    const milestone = await ctx.db.get(submilestone.buildMilestoneId);
    if (!milestone) {
      throw new Error("Missing Contractor Cost Document fixture milestone");
    }
    const now = Date.now();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", subject)
      )
      .take(1);
    if (existingUser.length === 0) {
      await ctx.db.insert("users", {
        authId: subject,
        email: `${subject}@example.com`,
        emailVerified: true,
        name: subject,
        status: "active",
        workosUserId: subject,
      });
    }
    const contractorId = await ctx.db.insert("contractorProfiles", {
      accountWorkosUserId: subject,
      brokerageId: build.brokerageId,
      createdAt: now,
      name: `${subject} contractor`,
      organizationId: ORGANIZATION_ID,
      status: "active",
      trades: ["concrete"],
      updatedAt: now,
    });
    const buildContractorAssignmentId = await ctx.db.insert(
      "buildContractorAssignments",
      {
        brokerageId: build.brokerageId,
        buildId: build._id,
        contractorId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        role: "Concrete contractor",
        status: "active",
        updatedAt: now,
      }
    );
    const milestoneContractorAssignmentId = await ctx.db.insert(
      "milestoneContractorAssignments",
      {
        assignedAt: now,
        assignedByWorkosUserId: "builder_owner",
        brokerageId: build.brokerageId,
        buildContractorAssignmentId,
        buildId: build._id,
        buildMilestoneId: milestone._id,
        buildSubmilestoneId: submilestone._id,
        contractorId,
        createdAt: now,
        milestoneKey: milestone.key,
        note: "Cost Document Contractor fixture",
        organizationId: ORGANIZATION_ID,
        postHoc: false,
        role: "Concrete contractor",
        status: "active",
        submilestoneKey: submilestone.key,
        updatedAt: now,
      }
    );
    return {
      buildContractorAssignmentId,
      contractorId,
      milestoneContractorAssignmentId,
    };
  });
  return { contractor, ...assignment };
}

async function addContractorCostDocumentAssignment(
  fixture: CostDocumentFixture,
  input: {
    buildSubmilestoneId: Id<"buildSubmilestones">;
    contractorId: Id<"contractorProfiles">;
    status: Doc<"milestoneContractorAssignments">["status"];
    subject: string;
  }
) {
  return await fixture.base.run(async (ctx) => {
    const [build, submilestone] = await Promise.all([
      ctx.db.get(fixture.buildId),
      ctx.db.get(input.buildSubmilestoneId),
    ]);
    if (!(build && submilestone)) {
      throw new Error("Missing additional Contractor Cost Document scope");
    }
    const milestone = await ctx.db.get(submilestone.buildMilestoneId);
    if (!milestone) {
      throw new Error("Missing additional Contractor Cost Document milestone");
    }
    const now = Date.now();
    const buildContractorAssignmentId = await ctx.db.insert(
      "buildContractorAssignments",
      {
        brokerageId: build.brokerageId,
        buildId: build._id,
        contractorId: input.contractorId,
        createdAt: now,
        organizationId: ORGANIZATION_ID,
        role: "Concrete contractor",
        status: "active",
        updatedAt: now,
      }
    );
    return await ctx.db.insert("milestoneContractorAssignments", {
      assignedAt: now,
      assignedByWorkosUserId: "builder_owner",
      brokerageId: build.brokerageId,
      buildContractorAssignmentId,
      buildId: build._id,
      buildMilestoneId: milestone._id,
      buildSubmilestoneId: submilestone._id,
      contractorId: input.contractorId,
      createdAt: now,
      milestoneKey: milestone.key,
      note: "Additional Cost Document Contractor fixture",
      organizationId: ORGANIZATION_ID,
      postHoc: false,
      role: "Concrete contractor",
      status: input.status,
      submilestoneKey: submilestone.key,
      updatedAt: now,
    });
  });
}

async function seedSubmittedContractorCostDocuments(
  fixture: CostDocumentFixture,
  input: {
    buildSubmilestoneId: Id<"buildSubmilestones">;
    contractorProfileId: Id<"contractorProfiles">;
    count: number;
    submittedAtStart: number;
    subject: string;
    titlePrefix: string;
  }
) {
  return await fixture.base.run(async (ctx) => {
    const [build, submilestone] = await Promise.all([
      ctx.db.get(fixture.buildId),
      ctx.db.get(input.buildSubmilestoneId),
    ]);
    if (!(build && submilestone)) {
      throw new Error("Missing submitted Contractor Cost Document scope");
    }
    const costDocumentIds: Id<"costDocuments">[] = [];
    for (let index = 0; index < input.count; index += 1) {
      const submittedAt = input.submittedAtStart + index;
      const costDocumentId = await ctx.db.insert("costDocuments", {
        brokerageId: build.brokerageId,
        buildId: build._id,
        category: "materials",
        contractorProfileId: input.contractorProfileId,
        createdAt: submittedAt,
        currency: "CAD",
        documentDate: "2026-08-03",
        grossTotalCents: 1_000 + index,
        kind: "receipt",
        organizationId: ORGANIZATION_ID,
        state: "submitted",
        submittedAt,
        title: `${input.titlePrefix} ${index + 1}`,
        uploaderEmailSnapshot: `${input.subject}@example.com`,
        uploaderWorkosUserId: input.subject,
        vendorName: "Completed scope vendor",
      });
      await ctx.db.insert("costDocumentAllocations", {
        amountCents: 1_000 + index,
        brokerageId: build.brokerageId,
        buildId: build._id,
        buildSubmilestoneId: submilestone._id,
        costDocumentId,
        createdAt: submittedAt,
        order: 1,
        organizationId: ORGANIZATION_ID,
        submilestoneKeySnapshot: submilestone.key,
        submilestoneNameSnapshot: submilestone.name,
      });
      costDocumentIds.push(costDocumentId);
    }
    return costDocumentIds;
  });
}

async function addActiveBuildParticipant(
  fixture: CostDocumentFixture,
  input: {
    role: Doc<"buildParticipants">["role"];
    subject: string;
  }
) {
  await fixture.base.run(async (ctx) => {
    const build = await ctx.db.get(fixture.buildId);
    if (!build) {
      throw new Error("Missing Cost Document fixture build");
    }
    const now = Date.now();
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_workos_user_id", (query) =>
        query.eq("workosUserId", input.subject)
      )
      .take(1);
    if (existingUser.length === 0) {
      await ctx.db.insert("users", {
        authId: input.subject,
        email: `${input.subject}@example.com`,
        emailVerified: true,
        name: input.subject,
        status: "active",
        workosUserId: input.subject,
      });
    }
    await ctx.db.insert("buildParticipants", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      createdAt: now,
      displayNameSnapshot: input.subject,
      emailSnapshot: `${input.subject}@example.com`,
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: input.role,
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: input.subject,
    });
  });
}

async function stageAvailableAsset(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  fileName: string
) {
  return await stageAsset(fixture, fileName, true);
}

async function stageAsset(
  fixture: CostDocumentFixture,
  fileName: string,
  scanClean: boolean,
  context: {
    contextKind?: "composer" | "costDocumentDraft";
    contextRecordId?: string;
    legacySessionWithoutCapacity?: boolean;
  } = {},
  actor: CostDocumentActor = fixture.builder
) {
  const staged = await actor.mutation(
    (api as any).build_collaboration_assets.beginBuildCollaborationAssetUpload,
    {
      buildId: fixture.buildId,
      contextKind: context.contextKind ?? "composer",
      contextRecordId: context.contextRecordId,
      fileName,
      mimeType: "application/pdf",
      organizationId: ORGANIZATION_ID,
      sizeBytes: fileName.length,
    }
  );
  if (context.legacySessionWithoutCapacity) {
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(staged.stagingSessionId, {
        actorCapacity: undefined,
      });
    });
  }
  const storageId = await fixture.base.run((ctx) =>
    ctx.storage.store(new Blob([fileName], { type: "application/pdf" }))
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fileName)
  );
  const contentHashSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const assetId: Id<"buildCollaborationAssets"> =
    await actor.mutation(
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

async function createBatch(
  fixture: CostDocumentFixture,
  idempotencyKey: string,
  actor: CostDocumentActor = fixture.builder
) {
  return await actor.mutation(
    (api as any).cost_documents.createCostDocumentBatch,
    {
      buildId: fixture.buildId,
      idempotencyKey,
      organizationId: ORGANIZATION_ID,
    }
  );
}

async function addDraft(
  fixture: CostDocumentFixture,
  batchId: Id<"costDocumentBatches">,
  kind: "invoice" | "receipt" = "invoice",
  category: "labour" | "materials" = "materials",
  actor: CostDocumentActor = fixture.builder
) {
  return await actor.mutation(
    (api as any).cost_documents.addCostDocumentDraft,
    { batchId, category, kind }
  );
}

async function stageDraftAsset(
  fixture: CostDocumentFixture,
  draftId: Id<"costDocumentDrafts">,
  fileName: string,
  actor: CostDocumentActor = fixture.builder,
  legacySessionWithoutCapacity = false
) {
  return await stageAsset(
    fixture,
    fileName,
    true,
    {
      contextKind: "costDocumentDraft",
      contextRecordId: String(draftId),
      legacySessionWithoutCapacity,
    },
    actor
  );
}

async function saveDraft(
  fixture: CostDocumentFixture,
  draftId: Id<"costDocumentDrafts">,
  input: {
    allocations?: {
      amountCents: number;
      buildSubmilestoneId: Id<"buildSubmilestones">;
    }[];
    description?: string;
    documentDate?: string;
    financialComponents?: {
      amountCents: number;
      kind: "subtotal" | "tax" | "fee" | "discount";
      label?: string;
    }[];
    grossTotalCents?: number;
    pageAssetIds?: Id<"buildCollaborationAssets">[];
    title?: string;
    vendorProfileId?: Id<"contractorProfiles">;
    vendorName?: string;
    workingStateJson?: string;
  },
  actor: CostDocumentActor = fixture.builder
) {
  const draft = await fixture.base.run(async (ctx) => await ctx.db.get(draftId));
  if (!draft) {
    throw new Error("Missing Cost Document draft fixture");
  }
  return await actor.mutation(
    (api as any).cost_documents.saveCostDocumentDraft,
    { draftId, expectedRevision: draft.revision ?? 1, ...input }
  );
}

async function bindDraftPage(
  fixture: CostDocumentFixture,
  input: {
    assetId: Id<"buildCollaborationAssets">;
    draftId: Id<"costDocumentDrafts">;
    replaceAssetId?: Id<"buildCollaborationAssets">;
  },
  actor: CostDocumentActor = fixture.builder
) {
  return await actor.mutation(
    (api as any).cost_documents.bindCostDocumentDraftPageAsset,
    {
      ...input,
      expectedRevision: await draftRevision(fixture, input.draftId),
    }
  );
}

async function setDraftStep(
  fixture: CostDocumentFixture,
  input: {
    complete?: boolean;
    draftId: Id<"costDocumentDrafts">;
    step: "capture_confirm" | "balance_allocate" | "share" | "freeze";
  },
  actor: CostDocumentActor = fixture.builder
) {
  return await actor.mutation(
    (api as any).cost_documents.setCostDocumentDraftStep,
    {
      ...input,
      expectedRevision: await draftRevision(fixture, input.draftId),
    }
  );
}

async function completeDraft(
  fixture: CostDocumentFixture,
  draftId: Id<"costDocumentDrafts">,
  actor: CostDocumentActor = fixture.builder
) {
  const draft = await fixture.base.run(async (ctx) => await ctx.db.get(draftId));
  if (!draft) {
    throw new Error("Missing Cost Document draft fixture");
  }
  const steps = [
    "capture_confirm",
    "balance_allocate",
    "share",
    "freeze",
  ] as const;
  const currentIndex = steps.indexOf(draft.activeStep);
  if (currentIndex < 0 || draft.lifecycle !== "draft") {
    throw new Error("Cost Document draft fixture is not open for completion");
  }
  for (const step of steps.slice(currentIndex + 1)) {
    await setDraftStep(fixture, { draftId, step }, actor);
  }
  return await setDraftStep(fixture, {
    complete: true,
    draftId,
    step: "freeze",
  }, actor);
}

async function prepareIntegrityFixtureDraft(
  fixture: CostDocumentFixture,
  input: {
    actor?: CostDocumentActor;
    assetFileName: string;
    key: string;
    sequence?: number;
  }
) {
  const actor = input.actor ?? fixture.builder;
  const batchId = await createBatch(fixture, input.key, actor);
  const draftId = await addDraft(
    fixture,
    batchId,
    "invoice",
    "labour",
    actor
  );
  const assetId = await stageDraftAsset(
    fixture,
    draftId,
    input.assetFileName,
    actor
  );
  await saveDraft(
    fixture,
    draftId,
    {
      allocations: [
        {
          amountCents: 12_345 + (input.sequence ?? 0),
          buildSubmilestoneId: fixture.buildSubmilestoneId,
        },
      ],
      documentDate: "2026-08-01",
      financialComponents: [
        { amountCents: 11_000, kind: "subtotal" },
        {
          amountCents: 1_345 + (input.sequence ?? 0),
          kind: "tax",
        },
      ],
      grossTotalCents: 12_345 + (input.sequence ?? 0),
      pageAssetIds: [assetId],
      title: input.sequence
        ? `Foundation invoice ${input.sequence}`
        : "Foundation invoice",
      vendorName: input.sequence
        ? `Cedar Forming ${input.sequence} Ltd.`
        : "Cedar Forming Ltd.",
    },
    actor
  );
  await completeDraft(fixture, draftId, actor);
  return { assetId, batchId, draftId };
}

async function submitIntegrityFixtureDocument(
  fixture: CostDocumentFixture,
  input: { assetFileName: string; key: string; sequence?: number }
) {
  const prepared = await prepareIntegrityFixtureDraft(fixture, input);
  const submitted = await fixture.builder.mutation(
    (api as any).cost_documents.submitCostDocumentBatch,
    {
      batchId: prepared.batchId,
      expectedRevision: await batchRevision(fixture, prepared.batchId),
      idempotencyKey: `${input.key}-submit`,
    }
  );
  return {
    ...prepared,
    costDocumentId: submitted.costDocumentIds[0] as Id<"costDocuments">,
  };
}

async function getBatch(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  batchId: Id<"costDocumentBatches">
) {
  return await fixture.builder.query(
    (api as any).cost_documents.getCostDocumentBatch,
    { batchId, buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
  );
}

async function getActiveBatch(
  fixture: Awaited<ReturnType<typeof seedFixture>>
) {
  return await fixture.builder.query(
    (api as any).cost_documents.getActiveCostDocumentBatch,
    { buildId: fixture.buildId, organizationId: ORGANIZATION_ID }
  );
}

async function batchRevision(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  batchId: Id<"costDocumentBatches">
) {
  const batch = await fixture.base.run(async (ctx) => await ctx.db.get(batchId));
  if (!batch) {
    throw new Error("Missing Cost Document batch fixture");
  }
  return batch.revision ?? 1;
}

async function draftRevision(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  draftId: Id<"costDocumentDrafts">
) {
  const draft = await fixture.base.run(async (ctx) => await ctx.db.get(draftId));
  if (!draft) {
    throw new Error("Missing Cost Document draft fixture");
  }
  return draft.revision ?? 1;
}

async function addSecondAccessibleBuild(
  fixture: Awaited<ReturnType<typeof seedFixture>>
) {
  return await fixture.base.run(async (ctx) => {
    const build = await ctx.db.get(fixture.buildId);
    if (!build) throw new Error("Missing fixture build");
    const { _creationTime, _id, ...buildFields } = build;
    const now = Date.now();
    return await ctx.db.insert("activeBuilds", {
      ...buildFields,
      buildName: "148 Cedar Ridge",
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function addSecondSubmilestone(
  fixture: Awaited<ReturnType<typeof seedFixture>>
) {
  return await fixture.base.run(async (ctx) => {
    const build = await ctx.db.get(fixture.buildId);
    if (!build) throw new Error("Missing build");
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
      .first();
    if (!milestone) throw new Error("Missing milestone");
    const proposalSubmilestone = await ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_proposal", (query) => query.eq("proposalId", build.proposalId))
      .first();
    if (!proposalSubmilestone) throw new Error("Missing proposal submilestone");
    const now = Date.now();
    return await ctx.db.insert("buildSubmilestones", {
      brokerageId: build.brokerageId,
      buildId: fixture.buildId,
      buildMilestoneId: milestone._id,
      createdAt: now,
      key: "waterproofing",
      milestoneKey: milestone.key,
      name: "Waterproofing",
      order: 2,
      organizationId: ORGANIZATION_ID,
      proposalSubmilestoneId: proposalSubmilestone._id,
      status: "planned",
      updatedAt: now,
    });
  });
}

async function addCrossBuildSubmilestone(
  fixture: Awaited<ReturnType<typeof seedFixture>>
) {
  const otherBuildId = await addSecondAccessibleBuild(fixture);
  return await fixture.base.run(async (ctx) => {
    const [milestone, submilestone] = await Promise.all([
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", fixture.buildId))
        .first(),
      ctx.db.get(fixture.buildSubmilestoneId),
    ]);
    if (!(milestone && submilestone)) {
      throw new Error("Missing cross-Build Cost Document fixture scope");
    }
    const { _creationTime: _milestoneCreationTime, _id: _milestoneId, ...milestoneFields } =
      milestone;
    const {
      _creationTime: _submilestoneCreationTime,
      _id: _submilestoneId,
      ...submilestoneFields
    } = submilestone;
    const now = Date.now();
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      ...milestoneFields,
      buildId: otherBuildId,
      createdAt: now,
      updatedAt: now,
    });
    const buildSubmilestoneId = await ctx.db.insert("buildSubmilestones", {
      ...submilestoneFields,
      buildId: otherBuildId,
      buildMilestoneId,
      createdAt: now,
      updatedAt: now,
    });
    return { buildMilestoneId, buildSubmilestoneId };
  });
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
