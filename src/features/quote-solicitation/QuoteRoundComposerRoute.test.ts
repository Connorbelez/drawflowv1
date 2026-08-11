import { describe, expect, test } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import {
  normalizeQuoteRoundComposerData,
  normalizeQuoteRoundDetail,
  normalizeQuoteRoundOrganizationId,
  toUpdateQuoteRoundDraftArgs,
} from "./QuoteRoundComposerRoute.tsx";

function generatedComposerSource(): Parameters<
  typeof toUpdateQuoteRoundDraftArgs
>[0]["source"] {
  return {
    build: {
      _id: "build-1",
      buildName: "Quote fixture",
      location: "147 Cedar Ridge Road",
      startDate: "2026-08-01",
    },
    eligibleRecipients: [
      {
        _id: "recipient-1",
        email: "recipient@example.com",
        name: "Recipient One",
        quoteRecipientCapabilities: ["contractor", "supplier"],
      },
    ],
    labourSubmilestones: [
      {
        _id: "submilestone-1",
        buildMilestoneId: "milestone-1",
        milestoneKey: "framing",
        milestoneName: "Framing",
        name: "Frame walls",
        order: 1,
        sourceScopeChangeReason: "Clarified framing quantities.",
        sourceScopeRevisionId: "scope-revision-2",
        sourceScopeVersion: 2,
        scopeOfWorkTiptapJson: '{"type":"doc","content":[]}',
      },
    ],
    materialCostItems: [
      {
        _id: "cost-item-1",
        quantity: 1,
        title: "Framing lumber",
      },
    ],
    permit: null,
    responseTemplates: [
      {
        _id: "template-version-1",
        audience: "either",
        fields: [],
        name: "Quote template",
        templateId: "template-1",
        version: 1,
      },
    ],
  } as unknown as Parameters<typeof toUpdateQuoteRoundDraftArgs>[0]["source"];
}

describe("toUpdateQuoteRoundDraftArgs", () => {
  const quoteRoundId = "quote-round-1" as Id<"quoteRounds">;

  test("sends canonical Build Cost Item rows without client-side source overrides", () => {
    const args = toUpdateQuoteRoundDraftArgs({
      draft: {
        expectedRevision: 7,
        labourSubmilestoneIds: ["submilestone-1"],
        materialRows: [
          {
            assignedSubmilestoneIds: ["submilestone-1"],
            deliveryLocation: "Must not be sent for a canonical source",
            description: "Must not be sent for a canonical source",
            quantity: 99,
            rowKey: "build-cost:cost-item-1",
            source: "build_cost_item",
            sourceBuildCostItemId: "cost-item-1",
            title: "Must not be sent for a canonical source",
            unit: "each",
          },
          {
            assignedSubmilestoneIds: ["submilestone-1"],
            deliveryEndDay: 14,
            deliveryInstructions: "Call the site lead.",
            deliveryLocation: "South staging area",
            deliveryStartDay: 12,
            description: "Temporary protection while the envelope is open.",
            quantity: 12,
            rowKey: "ad-hoc:weather-cover",
            source: "ad_hoc",
            specificationTiptapJson:
              '{"type":"doc","content":[{"type":"paragraph"}]}',
            title: "Temporary weather cover",
            unit: "sheet",
          },
        ],
        recipients: [
          {
            contractorProfileId: "recipient-1",
            recipientKey: "recipient-1",
          },
        ],
        responseDeadline: "2026-09-14T14:30",
        templateVersionId: "template-version-1",
        title: "Envelope completion pricing",
      },
      organizationId: "org-1",
      quoteRoundId,
      source: generatedComposerSource(),
    });

    expect(args.materialRows?.[0]).toEqual({
      assignedSubmilestoneIds: ["submilestone-1"],
      rowKey: "build-cost:cost-item-1",
      source: "build_cost_item",
      sourceBuildCostItemId: "cost-item-1",
    });
    expect(args.materialRows?.[1]).toMatchObject({
      assignedSubmilestoneIds: ["submilestone-1"],
      deliveryEndDay: 14,
      deliveryInstructions: "Call the site lead.",
      deliveryLocation: "South staging area",
      deliveryStartDay: 12,
      quantity: 12,
      source: "ad_hoc",
      specificationTiptapJson:
        '{"type":"doc","content":[{"type":"paragraph"}]}',
      title: "Temporary weather cover",
      unit: "sheet",
    });
    expect(args.recipientProfileIds).toEqual(["recipient-1"]);
    expect(args.responseDeadline).toBe(Date.parse("2026-09-14T14:30"));
  });

  test("rejects a client Build Cost Item row that lost its canonical source identity", () => {
    expect(() =>
      toUpdateQuoteRoundDraftArgs({
        draft: {
          expectedRevision: 7,
          labourSubmilestoneIds: [],
          materialRows: [
            {
              assignedSubmilestoneIds: ["submilestone-1"],
              rowKey: "build-cost:missing-source",
              source: "build_cost_item",
            },
          ],
          recipients: [],
          title: "Broken source row",
        },
        organizationId: "org-1",
        quoteRoundId,
        source: generatedComposerSource(),
      })
    ).toThrow("canonical source ID");
  });

  test("normalizes a missing route organization into the unavailable state input", () => {
    expect(normalizeQuoteRoundOrganizationId(undefined)).toBeUndefined();
    expect(normalizeQuoteRoundOrganizationId("   ")).toBeUndefined();
    expect(normalizeQuoteRoundOrganizationId(" org-1 ")).toBe("org-1");
  });

  test("preserves canonical Scope source identity and pinned draft lines in the display model", () => {
    expect(
      normalizeQuoteRoundComposerData(generatedComposerSource())
        .labourSubmilestones[0]
    ).toMatchObject({
      sourceScopeChangeReason: "Clarified framing quantities.",
      sourceScopeRevisionId: "scope-revision-2",
      sourceScopeVersion: 2,
    });

    const detail = normalizeQuoteRoundDetail({
      _id: "quote-round-1",
      draft: {
        labourLines: [
          {
            buildSubmilestoneId: "submilestone-1",
            scopeOfWorkTiptapJson: '{"type":"doc","content":[]}',
            sourceScopeRevisionId: "scope-revision-1",
            sourceScopeVersion: 1,
          },
        ],
        labourSubmilestoneIds: ["submilestone-1"],
        materialRows: [],
        recipientProfileIds: [],
        scopeUpdateAvailable: true,
      },
      invitations: [],
      mode: "labour",
      packageRevision: null,
      packageRevisionHistory: [],
      revision: 5,
      scopeUpdateAvailable: true,
      state: "draft",
      title: "Framing bid",
      updatedAt: 1,
    } as unknown as Parameters<typeof normalizeQuoteRoundDetail>[0]);

    expect(detail).toMatchObject({
      draft: {
        labourLines: [
          {
            buildSubmilestoneId: "submilestone-1",
            sourceScopeRevisionId: "scope-revision-1",
            sourceScopeVersion: 1,
          },
        ],
        scopeUpdateAvailable: true,
      },
      packageRevisionHistory: [],
      revision: 5,
      scopeUpdateAvailable: true,
    });
  });
});
