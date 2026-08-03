/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_quote_rounds";

function withIdentity(
  base: ReturnType<typeof convexTest>,
  roles: string[],
  subject: string,
  organizationId = ORGANIZATION_ID
) {
  return base.withIdentity({
    email: `${subject}@example.com`,
    name: subject,
    organizationId,
    role: roles[0],
    roles,
    subject,
    tokenIdentifier: `https://api.workos.com/|${subject}`,
    "https://fairlend.ca/actor_kind": "human",
  } as never);
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

async function seedQuoteFixture(
  linkedVisibility: "recipient_shareable" | "unclassified" | "internal" =
    "recipient_shareable"
) {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, ["admin", "principle-broker"], "user_admin");
  const builder = withIdentity(base, ["builder"], "user_builder");
  const foundation = await admin.mutation(
    (api as any).production_proposals.dev_seedProductionFoundation,
    { workosOrganizationId: ORGANIZATION_ID }
  );
  const seeded = await base.run(async (ctx) => {
    const now = Date.now();
    const proposalId = await ctx.db.insert("buildProposals", {
      assignedBrokerWorkosUserId: "user_broker",
      borrowerCoPayBps: 0,
      borrowerWorkingCapitalLimitCents: 50_000_000,
      brokerageId: foundation.brokerageId,
      buildName: "Quote Round Fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      lenderDrawPolicyLimitCents: 100_000_000,
      location: "147 Cedar Ridge Road, Toronto, ON",
      locationLatitude: 43.654,
      locationLongitude: -79.383,
      locationPlaceId: "place_quote_fixture",
      organizationId: ORGANIZATION_ID,
      reviewOutcome: "approved",
      status: "approved",
      templateId: foundation.templateId,
      timelineCurrentDay: 12,
      timelineRangeMax: 180,
      timelineRangeMin: 0,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      updatedByWorkosUserId: "user_admin",
    });
    const workflowRuleSnapshotId = await ctx.db.insert("workflowRuleSnapshots", {
      allowPermitWaiverByRoles: ["admin"],
      brokerageId: foundation.brokerageId,
      createdAt: now,
      organizationId: ORGANIZATION_ID,
      proposalId,
      proposalStates: ["draft", "submitted", "approved", "closed"],
      requirePermitForApproval: false,
      ruleKey: "quote-round-fixture",
      settings: {},
      version: 1,
      workflowRuleId: foundation.workflowRuleId,
    });
    const buildId = await ctx.db.insert("activeBuilds", {
      brokerageId: foundation.brokerageId,
      buildName: "Quote Round Fixture",
      builderProfileId: foundation.builderProfileId,
      createdAt: now,
      location: "147 Cedar Ridge Road, Toronto, ON",
      locationLatitude: 43.654,
      locationLongitude: -79.383,
      locationPlaceId: "place_quote_fixture",
      organizationId: ORGANIZATION_ID,
      proposalId,
      startDate: "2026-08-01",
      status: "active",
      timelineCurrentDay: 12,
      timelineRangeMax: 180,
      timelineRangeMin: 0,
      totalBudgetCents: 240_000_000,
      updatedAt: now,
      workflowRuleSnapshotId,
    });
    await ctx.db.patch(proposalId, { activeBuildId: buildId, workflowRuleSnapshotId });
    await ctx.db.insert("buildParticipants", {
      brokerageId: foundation.brokerageId,
      buildId,
      createdAt: now,
      displayNameSnapshot: "Builder Author",
      joinedAt: now,
      organizationId: ORGANIZATION_ID,
      participationPeriod: 1,
      role: "builder",
      status: "active",
      updatedAt: now,
      validFrom: now,
      workosUserId: "user_builder",
    });
    const proposalMilestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      createdAt: now,
      dayEnd: 30,
      dayStart: 10,
      dependencyKeys: [],
      drawAvailabilityCents: 75_000_000,
      durationDays: 20,
      key: "framing",
      name: "Framing",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      updatedAt: now,
    });
    const buildMilestoneId = await ctx.db.insert("buildMilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      buildId,
      createdAt: now,
      dayEnd: 30,
      dayStart: 10,
      dependencyKeys: [],
      drawAvailabilityCents: 75_000_000,
      durationDays: 20,
      key: "framing",
      name: "Framing",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalMilestoneId,
      status: "planned",
      updatedAt: now,
    });
    const proposalSubmilestoneId = await ctx.db.insert("proposalSubmilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      createdAt: now,
      durationDays: 20,
      key: "frame-walls",
      milestoneKey: "framing",
      name: "Frame exterior walls",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalId,
      proposalMilestoneId,
      scopeOfWorkTiptapJson: tiptap("Install engineered wall system exactly."),
      startDay: 10,
      updatedAt: now,
    });
    const submilestoneId = await ctx.db.insert("buildSubmilestones", {
      brokerageId: foundation.brokerageId,
      budgetCents: 75_000_000,
      buildId,
      buildMilestoneId,
      createdAt: now,
      durationDays: 20,
      key: "frame-walls",
      milestoneKey: "framing",
      name: "Frame exterior walls",
      order: 1,
      organizationId: ORGANIZATION_ID,
      proposalSubmilestoneId,
      scopeOfWorkTiptapJson: tiptap("Install engineered wall system exactly."),
      startDay: 10,
      status: "planned",
      updatedAt: now,
    });
    const costItemId = await ctx.db.insert("buildCostItems", {
      brokerageId: foundation.brokerageId,
      budgetTreatment: "add",
      buildId,
      buildMilestoneId,
      costCents: 12_500_00,
      createdAt: now,
      createdByWorkosUserId: "user_builder",
      deliveryEndDay: 15,
      deliveryInstructions: "Stage inside the locked west gate.",
      deliveryLocation: "West gate laydown area",
      deliveryStartDay: 14,
      description: "Pressure-treated lumber package",
      itemKey: "lumber-package",
      itemType: "material",
      milestoneKey: "framing",
      organizationId: ORGANIZATION_ID,
      proposalId,
      quantity: 120,
      relevantSubmilestoneKeys: ["frame-walls"],
      specificationTiptapJson: tiptap("SPF #2, kiln dried, 2x6.") ,
      supplier: "Existing Materials Co.",
      title: "Framing lumber",
      unit: "pieces",
      updatedAt: now,
      updatedByWorkosUserId: "user_builder",
    });
    const makeGovernedDocument = async (
      documentType: "permit" | "supporting",
      fileName: string,
      contentHashSha256: string
    ) => {
      const storageId = await ctx.storage.store(
        new Blob([fileName], { type: "application/pdf" })
      );
      const assetId = await ctx.db.insert("buildCollaborationAssets", {
        brokerageId: foundation.brokerageId,
        buildId,
        contentHashSha256,
        createdAt: now,
        fileName,
        maximumAudienceMode: "build_wide",
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        scanCompletedAt: now,
        scanState: "clean",
        sizeBytes: fileName.length,
        state: "available",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
      const documentId = await ctx.db.insert("buildDocuments", {
        brokerageId: foundation.brokerageId,
        buildId,
        createdAt: now,
        documentType,
        fileName,
        governedAssetId: assetId,
        mimeType: "application/pdf",
        organizationId: ORGANIZATION_ID,
        proposalId,
        sizeBytes: fileName.length,
        status: "uploaded",
        storageId,
        updatedAt: now,
        uploadedByWorkosUserId: "user_admin",
        version: 1,
      });
      return { assetId, documentId };
    };
    const permit = await makeGovernedDocument("permit", "permit.pdf", "a".repeat(64));
    const supporting = await makeGovernedDocument(
      "supporting",
      "framing-plan.pdf",
      "b".repeat(64)
    );
    await ctx.db.insert("buildSubmilestoneDocumentLinks", {
      brokerageId: foundation.brokerageId,
      buildDocumentId: supporting.documentId,
      buildId,
      buildSubmilestoneId: submilestoneId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      organizationId: ORGANIZATION_ID,
      updatedAt: now,
      visibility: linkedVisibility,
    });
    const recipientId = await ctx.db.insert("contractorProfiles", {
      brokerageId: foundation.brokerageId,
      createdAt: now,
      email: "quote-recipient@example.com",
      name: "Existing Trade and Supply Co.",
      organizationId: ORGANIZATION_ID,
      quoteRecipientCapabilities: ["contractor", "supplier"],
      status: "active",
      trades: ["framing", "materials"],
      updatedAt: now,
    });
    const contractorOnlyRecipientId = await ctx.db.insert("contractorProfiles", {
      brokerageId: foundation.brokerageId,
      createdAt: now,
      email: "contractor-only@example.com",
      name: "Existing Contractor Only Co.",
      organizationId: ORGANIZATION_ID,
      quoteRecipientCapabilities: ["contractor"],
      status: "active",
      trades: ["framing"],
      updatedAt: now,
    });
    const templateId = await ctx.db.insert("quoteResponseTemplates", {
      audience: "either",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      name: "Pinned quote response",
      organizationId: ORGANIZATION_ID,
      status: "active",
      templateKey: "pinned-quote-response",
      updatedAt: now,
    });
    const templateVersionId = await ctx.db.insert("quoteResponseTemplateVersions", {
      audience: "either",
      brokerageId: foundation.brokerageId,
      createdAt: now,
      createdByWorkosUserId: "user_admin",
      name: "Pinned quote response",
      organizationId: ORGANIZATION_ID,
      publishedAt: now,
      publishedByWorkosUserId: "user_admin",
      status: "published",
      templateId,
      updatedAt: now,
      validationState: "valid",
      version: 1,
    });
    await ctx.db.patch(templateId, {
      currentVersionId: templateVersionId,
      selectedVersionId: templateVersionId,
    });
    await ctx.db.insert("quoteResponseTemplateFields", {
      allowAlternates: false,
      allowExclusions: false,
      brokerageId: foundation.brokerageId,
      createdAt: now,
      fieldKey: "approach",
      isPermanent: true,
      kind: "long_text",
      label: "Approach",
      organizationId: ORGANIZATION_ID,
      order: 0,
      renderer: "tiptap",
      repeatable: false,
      required: true,
      richTextDefaultHtml: "<p>Describe the approach.</p>",
      scope: "whole_quote",
      supportsTax: false,
      templateId,
      updatedAt: now,
      versionId: templateVersionId,
    });
    return {
      buildId,
      contractorOnlyRecipientId,
      costItemId,
      permit,
      recipientId,
      submilestoneId,
      supporting,
      templateVersionId,
    };
  });
  return { admin, base, builder, ...seeded };
}

async function configureRound(
  fixture: Awaited<ReturnType<typeof seedQuoteFixture>>,
  mode: "labour" | "material" | "combined",
  input: {
    materialRows?: unknown[];
    recipientProfileIds?: Id<"contractorProfiles">[];
  } = {}
) {
  const created = await fixture.builder.mutation(
    (api as any).quote_rounds.createQuoteRoundDraft,
    {
      buildId: fixture.buildId,
      mode,
      title: `${mode} quote`,
      workosOrganizationId: ORGANIZATION_ID,
    }
  );
  await fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
    buildId: fixture.buildId,
    expectedRevision: created.revision,
    ...(mode !== "material" ? { labourSubmilestoneIds: [fixture.submilestoneId] } : {}),
    ...(mode !== "labour"
      ? {
          materialRows:
            input.materialRows ??
            [
              {
                assignedSubmilestoneIds: [fixture.submilestoneId],
                rowKey: "canonical-lumber",
                source: "build_cost_item",
                sourceBuildCostItemId: fixture.costItemId,
              },
            ],
        }
      : {}),
    recipientProfileIds: input.recipientProfileIds ?? [fixture.recipientId],
    responseDeadline: Date.now() + 86_400_000,
    templateVersionId: fixture.templateVersionId,
    quoteRoundId: created.quoteRoundId,
    workosOrganizationId: ORGANIZATION_ID,
  });
  return created;
}

describe("Quote Round draft-to-open aggregate", () => {
  test("opens a combined round atomically with immutable rich scope, hashed attachments, credentials, and idempotency", async () => {
    const fixture = await seedQuoteFixture();
    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(composer.materialCostItems[0]).toMatchObject({
      _id: fixture.costItemId,
      deliveryInstructions: "Stage inside the locked west gate.",
      unit: "pieces",
    });
    expect(composer.labourSubmilestones[0]?.scopeOfWorkTiptapJson).toBe(
      tiptap("Install engineered wall system exactly.")
    );
    expect(composer.responseTemplates[0]?._id).toBe(fixture.templateVersionId);

    const created = await configureRound(fixture, "combined", {
      materialRows: [
        {
          assignedSubmilestoneIds: [fixture.submilestoneId],
          rowKey: "canonical-lumber",
          source: "build_cost_item",
          sourceBuildCostItemId: fixture.costItemId,
        },
        {
          assignedSubmilestoneIds: [fixture.submilestoneId],
          deliveryEndDay: 22,
          deliveryInstructions: "Call the superintendent before unloading.",
          deliveryLocation: "Driveway staging bay",
          deliveryStartDay: 21,
          description: "Custom brackets",
          quantity: 14,
          rowKey: "ad-hoc-brackets",
          source: "ad_hoc",
          specificationTiptapJson: tiptap("Powder-coated galvanized brackets."),
          title: "Custom brackets",
          unit: "each",
        },
      ],
    });
    const updated = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRound,
      {
        buildId: fixture.buildId,
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(updated).toMatchObject({ revision: 1, state: "draft" });
    const published = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-combined-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(published).toMatchObject({
      idempotentReplay: false,
      invitationCount: 1,
      packageRevisionNumber: 1,
      state: "open",
    });
    const replay = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-combined-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(replay).toEqual({ ...published, idempotentReplay: true });

    const quoteRoundId = created.quoteRoundId as Id<"quoteRounds">;
    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      if (!round?.currentPackageRevisionId) throw new Error("Package was not published.");
      const packageRevision = await ctx.db.get(round.currentPackageRevisionId);
      const attachments = await ctx.db
        .query("quotePackageRevisionAttachments")
        .withIndex("by_quotePackageRevisionId_and_order", (q) =>
          q.eq("quotePackageRevisionId", round.currentPackageRevisionId!)
        )
        .collect();
      const invitations = await ctx.db
        .query("quoteRoundInvitations")
        .withIndex("by_quoteRoundId_and_participationState", (q) =>
          q.eq("quoteRoundId", quoteRoundId).eq("participationState", "active")
        )
        .collect();
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (q) =>
          q.eq("quoteRoundInvitationId", invitations[0]!._id).eq("state", "active")
        )
        .collect();
      const fields = await ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_order", (q) =>
          q.eq("quotePackageRevisionId", round.currentPackageRevisionId!)
        )
        .collect();
      return { attachments, credentials, fields, packageRevision, round };
    });
    expect(persisted.round).toMatchObject({ revision: 2, state: "open" });
    expect(persisted.packageRevision).toMatchObject({
      permitDocumentId: fixture.permit.documentId,
      siteAddressSnapshot: "147 Cedar Ridge Road, Toronto, ON",
      siteMapUrlSnapshot: expect.stringContaining("43.654%2C-79.383"),
      templateVersionId: fixture.templateVersionId,
      timelineCurrentDaySnapshot: 12,
    });
    expect(persisted.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentHashSha256Snapshot: "a".repeat(64),
          kind: "permit",
          sourceBuildDocumentId: fixture.permit.documentId,
        }),
        expect.objectContaining({
          contentHashSha256Snapshot: "b".repeat(64),
          kind: "inherited",
          sourceBuildDocumentId: fixture.supporting.documentId,
        }),
      ])
    );
    expect(persisted.fields).toHaveLength(1);
    expect(persisted.credentials).toHaveLength(1);
    expect(persisted.credentials[0]).toMatchObject({
      credentialVersion: 1,
      state: "active",
    });
    expect(persisted.credentials[0]?.credentialVerifier).toMatch(/^[a-f0-9]{64}$/);

    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.submilestoneId, {
        scopeOfWorkTiptapJson: tiptap("Mutated after publication."),
      });
      await ctx.db.patch(fixture.costItemId, {
        deliveryInstructions: "Mutated after publication.",
        title: "Mutated material",
      });
    });
    const opened = await fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
      buildId: fixture.buildId,
      quoteRoundId: created.quoteRoundId,
      workosOrganizationId: ORGANIZATION_ID,
    });
    expect(opened.packageRevision.labourLines[0]?.scopeOfWorkTiptapJson).toBe(
      tiptap("Install engineered wall system exactly.")
    );
    expect(opened.packageRevision.materialLines[0]).toMatchObject({
      deliveryInstructions: "Stage inside the locked west gate.",
      title: "Framing lumber",
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 2,
        quoteRoundId: created.quoteRoundId,
        title: "Illegal post-open edit",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/immutable/);
  });

  test("publishes Labour and Material independently and enforces canonical source and recipient capability", async () => {
    const fixture = await seedQuoteFixture();
    const labour = await configureRound(fixture, "labour");
    const labourPublished = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-labour-001",
        quoteRoundId: labour.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const material = await configureRound(fixture, "material");
    const materialPublished = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "publish-material-001",
        quoteRoundId: material.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const [labourRead, materialRead] = await Promise.all([
      fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
        buildId: fixture.buildId,
        quoteRoundId: labourPublished.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }),
      fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
        buildId: fixture.buildId,
        quoteRoundId: materialPublished.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }),
    ]);
    expect(labourRead.packageRevision.labourLines).toHaveLength(1);
    expect(labourRead.packageRevision.materialLines).toHaveLength(0);
    expect(materialRead.packageRevision.labourLines).toHaveLength(0);
    expect(materialRead.packageRevision.materialLines).toHaveLength(1);

    const invalid = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Invalid source round",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: [
          {
            assignedSubmilestoneIds: [fixture.submilestoneId],
            rowKey: "forged-canonical",
            source: "build_cost_item",
            sourceBuildCostItemId: fixture.costItemId,
            title: "Client override is forbidden",
          },
        ],
        quoteRoundId: invalid.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/server-derived/);
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        quoteRoundId: invalid.quoteRoundId,
        recipientProfileIds: [fixture.contractorOnlyRecipientId],
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/required capability/);
  });

  test("caps aggregate Material assignments at a publication-safe boundary", async () => {
    const fixture = await seedQuoteFixture();
    const assignmentIds = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.submilestoneId);
      if (!original) {
        throw new Error("Fixture Sub-milestone is unavailable.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...source
      } = original;
      const extraIds: Id<"buildSubmilestones">[] = [];
      for (let index = 1; index < 100; index += 1) {
        extraIds.push(
          await ctx.db.insert("buildSubmilestones", {
            ...source,
            createdAt: source.createdAt + index,
            key: `assignment-${index}`,
            name: `Assignment Sub-milestone ${index}`,
            order: source.order + index,
            updatedAt: source.updatedAt + index,
          })
        );
      }
      return [fixture.submilestoneId, ...extraIds];
    });
    const materialRows = Array.from({ length: 30 }, (_, index) => ({
      assignedSubmilestoneIds: assignmentIds,
      rowKey: `bounded-${index}`,
      source: "build_cost_item" as const,
      sourceBuildCostItemId: fixture.costItemId,
    }));
    const accepted = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Bounded Material assignments",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows,
        quoteRoundId: accepted.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toMatchObject({ revision: 1, state: "draft" });
    await fixture.builder.mutation(
      (api as any).quote_rounds.updateQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        quoteRoundId: accepted.quoteRoundId,
        recipientProfileIds: [fixture.recipientId],
        responseDeadline: Date.now() + 86_400_000,
        templateVersionId: fixture.templateVersionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation(
        (api as any).quote_rounds.publishQuoteRoundDraft,
        {
        buildId: fixture.buildId,
        expectedRevision: 2,
        idempotencyKey: "publish-max-material-assignments",
        quoteRoundId: accepted.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).resolves.toMatchObject({
      packageRevisionNumber: 1,
      state: "open",
    });

    const rejected = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Over-limit Material assignments",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: [
          ...materialRows,
          {
            assignedSubmilestoneIds: [assignmentIds[0]],
            rowKey: "over-limit",
            source: "build_cost_item",
            sourceBuildCostItemId: fixture.costItemId,
          },
        ],
        quoteRoundId: rejected.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/at most 3,000 Material Sub-milestone assignments/);

    const distinctAssignmentIds = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.submilestoneId);
      if (!original) {
        throw new Error("Fixture Sub-milestone is unavailable.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...source
      } = original;
      const ids = [...assignmentIds];
      for (let index = 100; index <= 500; index += 1) {
        ids.push(
          await ctx.db.insert("buildSubmilestones", {
            ...source,
            createdAt: source.createdAt + index,
            key: `distinct-assignment-${index}`,
            name: `Distinct Assignment Sub-milestone ${index}`,
            order: source.order + index,
            updatedAt: source.updatedAt + index,
          })
        );
      }
      return ids;
    });
    const highCardinality = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "High-cardinality Material assignments",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: Array.from({ length: 6 }, (_, index) => ({
          assignedSubmilestoneIds: distinctAssignmentIds.slice(
            index * 100,
            Math.min((index + 1) * 100, distinctAssignmentIds.length)
          ),
          rowKey: `distinct-${index}`,
          source: "build_cost_item" as const,
          sourceBuildCostItemId: fixture.costItemId,
        })),
        quoteRoundId: highCardinality.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/at most 500 distinct Material Sub-milestones/);
  });

  test("rejects negative ad-hoc delivery days before replacing a draft", async () => {
    const fixture = await seedQuoteFixture();
    const created = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "material",
        title: "Negative delivery days",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 0,
        materialRows: [
          {
            assignedSubmilestoneIds: [fixture.submilestoneId],
            deliveryEndDay: 2,
            deliveryInstructions: "Keep clear of the lane.",
            deliveryLocation: "North staging area",
            deliveryStartDay: -1,
            quantity: 1,
            rowKey: "negative-delivery-day",
            source: "ad_hoc",
            specificationTiptapJson: tiptap("Temporary weather protection."),
            title: "Weather protection",
            unit: "bundle",
          },
        ],
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Delivery start day must be on or after T0/);
  });

  test("bounds inherited link discovery across every scoped Sub-milestone", async () => {
    const fixture = await seedQuoteFixture();
    const scopedIds = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.submilestoneId);
      if (!original) {
        throw new Error("Fixture Sub-milestone is unavailable.");
      }
      const {
        _creationTime: _ignoredCreationTime,
        _id: _ignoredId,
        ...source
      } = original;
      const ids = [fixture.submilestoneId];
      for (let index = 1; index < 6; index += 1) {
        ids.push(
          await ctx.db.insert("buildSubmilestones", {
            ...source,
            createdAt: source.createdAt + index,
            key: `link-scan-${index}`,
            name: `Link scan Sub-milestone ${index}`,
            order: source.order + index,
            updatedAt: source.updatedAt + index,
          })
        );
      }
      for (let index = 0; index < 1001; index += 1) {
        await ctx.db.insert("buildSubmilestoneDocumentLinks", {
          brokerageId: original.brokerageId,
          buildDocumentId: fixture.supporting.documentId,
          buildId: fixture.buildId,
          buildSubmilestoneId: ids[index % ids.length]!,
          createdAt: source.createdAt + index,
          createdByWorkosUserId: "user_admin",
          organizationId: ORGANIZATION_ID,
          updatedAt: source.updatedAt + index,
          visibility: "internal",
        });
      }
      return ids;
    });
    const round = await configureRound(fixture, "material", {
      materialRows: [
        {
          assignedSubmilestoneIds: scopedIds,
          rowKey: "bounded-link-scan",
          source: "build_cost_item",
          sourceBuildCostItemId: fixture.costItemId,
        },
      ],
    });
    await expect(
      fixture.builder.mutation(
        (api as any).quote_rounds.publishQuoteRoundDraft,
        {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "bounded-inherited-link-scan",
        quoteRoundId: round.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/linked-document discovery exceeded its safe scan limit/);
  });

  test("freezes attachment metadata to its clean governed asset", async () => {
    const fixture = await seedQuoteFixture();
    const created = await configureRound(fixture, "labour");
    await fixture.base.run(async (ctx) => {
      await ctx.db.patch(fixture.permit.documentId, {
        fileName: "forged-permit-name.pdf",
      });
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "reject-mismatched-permit-metadata-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/metadata does not match its clean governed Build asset/);
  });

  test("resolves the current Permit newest-first across 26-plus historical rows", async () => {
    const fixture = await seedQuoteFixture();
    const currentPermit = await fixture.base.run(async (ctx) => {
      const original = await ctx.db.get(fixture.permit.documentId);
      if (!original) {
        throw new Error("Fixture Permit is unavailable.");
      }
      let newestPermitId = fixture.permit.documentId;
      for (let index = 1; index <= 26; index += 1) {
        const fileName = `permit-history-${index}.pdf`;
        const storageId = await ctx.storage.store(
          new Blob([fileName], { type: "application/pdf" })
        );
        const assetId = await ctx.db.insert("buildCollaborationAssets", {
          brokerageId: original.brokerageId,
          buildId: original.buildId,
          contentHashSha256: `${index}`.padStart(64, "0"),
          createdAt: original.createdAt + index,
          fileName,
          maximumAudienceMode: "build_wide",
          mimeType: "application/pdf",
          organizationId: original.organizationId,
          scanCompletedAt: original.createdAt + index,
          scanState: "clean",
          sizeBytes: fileName.length,
          state: "available",
          storageId,
          updatedAt: original.updatedAt + index,
          uploadedByWorkosUserId: original.uploadedByWorkosUserId,
          version: index + 1,
        });
        newestPermitId = await ctx.db.insert("buildDocuments", {
          brokerageId: original.brokerageId,
          buildId: original.buildId,
          createdAt: original.createdAt + index,
          documentType: "permit",
          fileName,
          governedAssetId: assetId,
          mimeType: "application/pdf",
          organizationId: original.organizationId,
          proposalId: original.proposalId,
          sizeBytes: fileName.length,
          status: index === 26 ? "uploaded" : "superseded",
          storageId,
          updatedAt: original.updatedAt + index,
          uploadedByWorkosUserId: original.uploadedByWorkosUserId,
          version: index + 1,
        });
      }
      return newestPermitId;
    });
    const composer = await fixture.builder.query(
      (api as any).quote_rounds.getQuoteRoundComposer,
      { buildId: fixture.buildId, workosOrganizationId: ORGANIZATION_ID }
    );
    expect(composer.permit).toMatchObject({
      _id: currentPermit,
      fileName: "permit-history-26.pdf",
      version: 27,
    });
    const created = await configureRound(fixture, "labour");
    const published = await fixture.builder.mutation(
      (api as any).quote_rounds.publishQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "newest-permit-26-history-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const packageRevision = await fixture.base.run(async (ctx) => {
      const packageRevisionId = ctx.db.normalizeId(
        "quotePackageRevisions",
        published.packageRevisionId
      );
      return packageRevisionId ? await ctx.db.get(packageRevisionId) : null;
    });
    expect(packageRevision?.permitDocumentId).toBe(currentPermit);
  });

  test("treats malformed route IDs as an unavailable Quote Round", async () => {
    const fixture = await seedQuoteFixture();
    await expect(
      fixture.builder.query((api as any).quote_rounds.getQuoteRound, {
        buildId: fixture.buildId,
        quoteRoundId: "not-a-convex-id",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
    await expect(
      fixture.builder.query((api as any).quote_rounds.getQuoteRoundComposer, {
        buildId: "not-a-convex-id",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).resolves.toBeNull();
  });

  test("blocks unclassified documents before any publish writes and excludes non-builder callers", async () => {
    const fixture = await seedQuoteFixture("unclassified");
    await expect(
      fixture.admin.mutation((api as any).quote_rounds.createQuoteRoundDraft, {
        buildId: fixture.buildId,
        mode: "labour",
        title: "Admin must not author",
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/Builder or Builder Staff/);
    const inaccessibleBuilder = withIdentity(fixture.base, ["builder"], "unassigned_builder");
    await expect(
      inaccessibleBuilder.query((api as any).quote_rounds.getQuoteRoundComposer, {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/active build participation/);
    const otherTenantBuilder = withIdentity(
      fixture.base,
      ["builder"],
      "other_tenant_builder",
      "org_other_quote_rounds"
    );
    await expect(
      otherTenantBuilder.query((api as any).quote_rounds.getQuoteRoundComposer, {
        buildId: fixture.buildId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/WorkOS membership|organization scope/);
    const created = await configureRound(fixture, "labour");
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "blocked-unclassified-001",
        quoteRoundId: created.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/classified/);
    const quoteRoundId = created.quoteRoundId as Id<"quoteRounds">;
    const persisted = await fixture.base.run(async (ctx) => {
      const round = await ctx.db.get(quoteRoundId);
      const packages = await ctx.db.query("quotePackageRevisions").collect();
      const invitations = await ctx.db.query("quoteRoundInvitations").collect();
      return { invitations, packages, round };
    });
    expect(persisted.round).toMatchObject({ state: "draft" });
    expect(persisted.round?.currentPackageRevisionId).toBeUndefined();
    expect(persisted.packages).toHaveLength(0);
    expect(persisted.invitations).toHaveLength(0);

    const noRecipient = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "labour",
        title: "No recipient",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
      buildId: fixture.buildId,
      expectedRevision: 0,
      labourSubmilestoneIds: [fixture.submilestoneId],
      quoteRoundId: noRecipient.quoteRoundId,
      responseDeadline: Date.now() + 86_400_000,
      templateVersionId: fixture.templateVersionId,
      workosOrganizationId: ORGANIZATION_ID,
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "blocked-no-recipient-001",
        quoteRoundId: noRecipient.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/At least one compatible Quote recipient/);

    const expiredDeadline = await fixture.builder.mutation(
      (api as any).quote_rounds.createQuoteRoundDraft,
      {
        buildId: fixture.buildId,
        mode: "labour",
        title: "Expired deadline",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await fixture.builder.mutation((api as any).quote_rounds.updateQuoteRoundDraft, {
      buildId: fixture.buildId,
      expectedRevision: 0,
      labourSubmilestoneIds: [fixture.submilestoneId],
      quoteRoundId: expiredDeadline.quoteRoundId,
      recipientProfileIds: [fixture.recipientId],
      responseDeadline: Date.now() - 1,
      templateVersionId: fixture.templateVersionId,
      workosOrganizationId: ORGANIZATION_ID,
    });
    await expect(
      fixture.builder.mutation((api as any).quote_rounds.publishQuoteRoundDraft, {
        buildId: fixture.buildId,
        expectedRevision: 1,
        idempotencyKey: "blocked-expired-deadline-001",
        quoteRoundId: expiredDeadline.quoteRoundId,
        workosOrganizationId: ORGANIZATION_ID,
      })
    ).rejects.toThrow(/must be in the future/);
  });
});
