/// <reference types="vite/client" />

import resendTest from "@convex-dev/resend/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_cost_documents";

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
      receipt: {
        recipientEmail: "builder_owner@example.com",
        status: "queued",
      },
      state: "submitted",
      supportingContextDisclosure:
        "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.",
      title: "Foundation invoice",
      uploaderWorkosUserId: "builder_owner",
      vendorName: "Cedar Forming Ltd.",
    });

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
        { ...valid, documentDate: "2026-02-31" }
      )
    ).rejects.toThrow("valid YYYY-MM-DD date");
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
    ).resolves.toBeNull();
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
      fixture.builder.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        { assetId, draftId }
      )
    ).resolves.toEqual({ order: 1 });
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
      fixture.builder.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        { assetId, draftId }
      )
    ).resolves.toEqual({ order: 1 });

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
    ).resolves.toBeNull();
  });

  test("accepts only fresh finalized or consumed sessions for bound Cost Document pages", async () => {
    const fixture = await seedFixture();
    const batchId = await createBatch(fixture, "bound-page-session-states");
    const draftId = await addDraft(fixture, batchId);
    const assetId = await stageDraftAsset(fixture, draftId, "bound-state.pdf");
    await fixture.builder.mutation(
      (api as any).cost_documents.bindCostDocumentDraftPageAsset,
      { assetId, draftId }
    );
    const stagingSessionId = await fixture.base.run(async (ctx) => {
      const asset = await ctx.db.get(assetId);
      if (!asset?.stagingSessionId) {
        throw new Error("Missing Cost Document page staging session");
      }
      return asset.stagingSessionId;
    });
    const retryBoundPage = () =>
      fixture.builder.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        { assetId, draftId }
      );

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
    await expect(retryBoundPage()).resolves.toEqual({ order: 1 });
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
    ).rejects.toThrow("Forbidden: Cost Document Builder access");
    const boundAssetId = await stageDraftAsset(fixture, draftId, "capture.pdf");
    await fixture.builder.mutation(
      (api as any).cost_documents.bindCostDocumentDraftPageAsset,
      { assetId: boundAssetId, draftId }
    );
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
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "balance_allocate" }
    );
    await expect(
      stageDraftAsset(fixture, draftId, "outside-capture.pdf")
    ).rejects.toThrow("unavailable");
    await expect(
      saveDraft(fixture, draftId, { pageAssetIds: [boundAssetId, laterAssetId] })
    ).rejects.toThrow("only during Capture & confirm");
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        { assetId: laterAssetId, draftId }
      )
    ).rejects.toThrow("only during Capture & confirm");

    await completeDraft(fixture, draftId);
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.setCostDocumentDraftStep,
        { draftId, step: "capture_confirm" }
      )
    ).rejects.toThrow("only from Freeze to Share");
    await expect(
      saveDraft(fixture, draftId, { pageAssetIds: [boundAssetId] })
    ).rejects.toThrow("no longer editable");
    await expect(
      stageDraftAsset(fixture, draftId, "after-complete.pdf")
    ).rejects.toThrow("unavailable");

    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "share" }
    );
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "balance_allocate" }
    );
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "capture_confirm" }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        { assetId: laterAssetId, draftId }
      )
    ).resolves.toEqual({ order: 2 });
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
      fixture.builder.mutation(
        (api as any).cost_documents.setCostDocumentDraftStep,
        { draftId, step: "share" }
      )
    ).rejects.toThrow("only to an adjacent workflow step");
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.setCostDocumentDraftStep,
        { complete: true, draftId, step: "freeze" }
      )
    ).rejects.toThrow("only from an open draft at Freeze");

    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "balance_allocate" }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.setCostDocumentDraftStep,
        { draftId, step: "freeze" }
      )
    ).rejects.toThrow("only to an adjacent workflow step");
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "share" }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.setCostDocumentDraftStep,
        { draftId, step: "capture_confirm" }
      )
    ).rejects.toThrow("only to an adjacent workflow step");
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "freeze" }
    );
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { complete: true, draftId, step: "freeze" }
    );

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
    expect(JSON.parse(completed.shareAudit?.priorState ?? "{}")).toEqual({
      activeStep: "balance_allocate",
      completedAt: null,
      lifecycle: "draft",
    });
    expect(JSON.parse(completed.shareAudit?.newState ?? "{}")).toEqual({
      activeStep: "share",
      completedAt: null,
      lifecycle: "draft",
    });
    expect(JSON.parse(completed.completedAudit?.priorState ?? "{}")).toEqual({
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
      fixture.builder.mutation(
        (api as any).cost_documents.setCostDocumentDraftStep,
        { draftId, step: "capture_confirm" }
      )
    ).rejects.toThrow("only from Freeze to Share");
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step: "share" }
    );
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
    expect(JSON.parse(reopenedAudit?.newState ?? "{}")).toEqual({
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
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId: firstDraftId, step: "share" }
    );
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
        { batchId, idempotencyKey: "atomic-invalid-submit" }
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
      { batchId, idempotencyKey: "atomic-success-submit" }
    );
    expect(submitted.replayed).toBe(false);
    expect(submitted.costDocumentIds).toHaveLength(1);
    expect(await downstreamSnapshot(fixture)).toEqual(before);
    const replay = await fixture.builder.mutation(
      (api as any).cost_documents.submitCostDocumentBatch,
      { batchId, idempotencyKey: "atomic-success-submit" }
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
        { batchId, idempotencyKey: "atomic-success-submit" }
      )
    ).toEqual({ ...submitted, replayed: true });
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        { batchId, idempotencyKey: "different-submit-key" }
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
        { batchId, idempotencyKey }
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

    const replay = (submission: Awaited<ReturnType<typeof submitFixtureBatch>>) =>
      fixture.builder.mutation(
        (api as any).cost_documents.submitCostDocumentBatch,
        {
          batchId: submission.batchId,
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
            { batchId, idempotencyKey: "corruption-submit" }
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
      fixture.builder.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        replaceArgs
      )
    ).resolves.toEqual({ order: 25 });
    // The exact retry must be idempotent even though the draft remains at its
    // 50-page maximum and the original active row is now historical.
    await expect(
      fixture.builder.mutation(
        (api as any).cost_documents.bindCostDocumentDraftPageAsset,
        replaceArgs
      )
    ).resolves.toEqual({ order: 25 });

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
    return {
      buildId,
      builderProfileId: foundation.builderProfileId,
      buildSubmilestoneId,
    };
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
  scanClean: boolean,
  context: {
    contextKind?: "composer" | "costDocumentDraft";
    contextRecordId?: string;
  } = {}
) {
  const staged = await fixture.builder.mutation(
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

async function createBatch(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  idempotencyKey: string
) {
  return await fixture.builder.mutation(
    (api as any).cost_documents.createCostDocumentBatch,
    {
      buildId: fixture.buildId,
      idempotencyKey,
      organizationId: ORGANIZATION_ID,
    }
  );
}

async function addDraft(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  batchId: Id<"costDocumentBatches">,
  kind: "invoice" | "receipt" = "invoice",
  category: "labour" | "materials" = "materials"
) {
  return await fixture.builder.mutation(
    (api as any).cost_documents.addCostDocumentDraft,
    { batchId, category, kind }
  );
}

async function stageDraftAsset(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  draftId: Id<"costDocumentDrafts">,
  fileName: string
) {
  return await stageAsset(fixture, fileName, true, {
    contextKind: "costDocumentDraft",
    contextRecordId: String(draftId),
  });
}

async function saveDraft(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  draftId: Id<"costDocumentDrafts">,
  input: {
    allocations?: {
      amountCents: number;
      buildSubmilestoneId: Id<"buildSubmilestones">;
    }[];
    documentDate?: string;
    financialComponents?: {
      amountCents: number;
      kind: "subtotal" | "tax" | "fee" | "discount";
      label?: string;
    }[];
    grossTotalCents?: number;
    pageAssetIds?: Id<"buildCollaborationAssets">[];
    title?: string;
    vendorName?: string;
    workingStateJson?: string;
  }
) {
  return await fixture.builder.mutation(
    (api as any).cost_documents.saveCostDocumentDraft,
    { draftId, ...input }
  );
}

async function completeDraft(
  fixture: Awaited<ReturnType<typeof seedFixture>>,
  draftId: Id<"costDocumentDrafts">
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
    await fixture.builder.mutation(
      (api as any).cost_documents.setCostDocumentDraftStep,
      { draftId, step }
    );
  }
  return await fixture.builder.mutation(
    (api as any).cost_documents.setCostDocumentDraftStep,
    { complete: true, draftId, step: "freeze" }
  );
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
