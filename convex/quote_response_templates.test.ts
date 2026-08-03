/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ORGANIZATION_ID = "org_quote_templates";

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

async function fixture() {
  const base = convexTest(schema, modules);
  const admin = withIdentity(base, ["admin", "principle-broker"], "admin");
  const builder = withIdentity(base, ["builder"], "builder_owner");
  await admin.mutation((api as any).production_proposals.dev_seedProductionFoundation, {
    workosOrganizationId: ORGANIZATION_ID,
  });
  return { admin, base, builder };
}

function allFields() {
  return [
    {
      allowAlternates: true,
      allowExclusions: true,
      fieldKey: "labour_line_items",
      kind: "priced_line" as const,
      label: "Labour",
      order: 0,
      repeatable: true,
      required: false,
      scope: "labour" as const,
      supportsTax: true,
      tax: { label: "GST", rateBps: 500 },
    },
    {
      allowAlternates: true,
      allowExclusions: true,
      fieldKey: "materials_line_items",
      kind: "priced_line" as const,
      label: "Materials",
      order: 1,
      repeatable: true,
      required: false,
      scope: "materials" as const,
      supportsTax: true,
    },
    {
      fieldKey: "additional_comments",
      kind: "long_text" as const,
      label: "Additional comments",
      order: 2,
      renderer: "tiptap" as const,
      required: false,
      richTextDefaultHtml: "<p>Call out assumptions and exclusions.</p>",
      scope: "whole_quote" as const,
    },
    {
      fieldKey: "earliest_start",
      kind: "date" as const,
      label: "Earliest available start",
      order: 3,
      required: true,
      scope: "whole_quote" as const,
    },
    {
      fieldKey: "crew_size",
      kind: "short_text" as const,
      label: "Estimated crew size",
      order: 4,
      required: false,
      scope: "labour" as const,
      validation: { maxLength: 24, minLength: 1 },
    },
    {
      fieldKey: "approach",
      kind: "long_text" as const,
      label: "Approach and assumptions",
      order: 5,
      required: false,
      scope: "whole_quote" as const,
      validation: { maxLength: 2_000 },
    },
    {
      choiceOptions: ["Included", "Excluded", "Allowance"],
      fieldKey: "warranty",
      kind: "choice" as const,
      label: "Warranty included?",
      order: 6,
      required: true,
      scope: "whole_quote" as const,
    },
    {
      fieldKey: "insurance_certificate",
      kind: "attachment" as const,
      label: "Insurance certificate",
      order: 7,
      required: true,
      scope: "whole_quote" as const,
      validation: {
        allowedMimeTypes: ["application/pdf"],
        maxFiles: 2,
        minFiles: 1,
      },
    },
    {
      allowAlternates: true,
      allowExclusions: true,
      fieldKey: "equipment_line",
      kind: "priced_line" as const,
      label: "Equipment allowance",
      order: 8,
      repeatable: true,
      required: false,
      scope: "materials" as const,
      supportsTax: true,
    },
  ];
}

describe("Quote Response Template public contract", () => {
  test("authors a draft, publishes immutable versions, and selects history", async () => {
    const { base, builder } = await fixture();
    const created = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "either",
        description: "Reusable mixed trade response contract.",
        name: "Standard trade quote",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const saved = await builder.mutation(
      (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
      {
        audience: "either",
        description: "Reusable mixed trade response contract.",
        fields: allFields(),
        name: "Standard trade quote",
        templateId: created.templateId,
        versionId: created.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(saved).toEqual({ issues: [], valid: true });
    expect(
      await builder.query(
        (api as any).quote_response_templates.validateQuoteResponseTemplateDraft,
        {
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).toEqual({ issues: [], valid: true });

    const published = await builder.mutation(
      (api as any).quote_response_templates.publishQuoteResponseTemplate,
      {
        releaseNote: "Initial response contract.",
        templateId: created.templateId,
        versionId: created.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(published.version).toBe(1);

    const first = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplate,
      {
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(first?.currentVersion).toMatchObject({
      _id: created.versionId,
      status: "published",
      version: 1,
    });
    expect(first?.currentVersion?.fields).toHaveLength(9);
    expect(first?.currentVersion?.fields.filter((field: any) => field.isPermanent)).toHaveLength(3);
    expect(first?.currentVersion?.fields.find((field: any) => field.fieldKey === "additional_comments")).toMatchObject({
      renderer: "tiptap",
      isPermanent: true,
    });
    const summaryPage = await builder.query(
      (api as any).quote_response_templates.listQuoteResponseTemplates,
      {
        paginationOpts: { cursor: null, numItems: 10 },
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(summaryPage.page[0]?.currentVersion?.fields).toBeUndefined();
    const hydratedVersion = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplateVersion,
      {
        templateId: created.templateId,
        versionId: created.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(hydratedVersion?.fields).toHaveLength(9);

    const secondDraft = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "supplier",
        description: "Supplier-specific response contract.",
        name: "Standard supplier quote",
        sourceTemplateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const duplicateSecondDraft = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "supplier",
        description: "Supplier-specific response contract.",
        name: "Standard supplier quote",
        sourceTemplateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(duplicateSecondDraft).toEqual(secondDraft);
    const beforePublish = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplate,
      {
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(beforePublish).toMatchObject({
      audience: "supplier",
      description: "Supplier-specific response contract.",
      name: "Standard supplier quote",
      currentVersion: {
        audience: "supplier",
        description: "Supplier-specific response contract.",
        name: "Standard supplier quote",
        status: "draft",
      },
      selectedVersion: {
        audience: "either",
        description: "Reusable mixed trade response contract.",
        name: "Standard trade quote",
      },
    });
    const templateProjectionBeforePublish = await base.run(async (ctx) =>
      await ctx.db.get(created.templateId)
    );
    expect(templateProjectionBeforePublish).toMatchObject({
      audience: "either",
      description: "Reusable mixed trade response contract.",
      name: "Standard trade quote",
    });
    const secondFields = allFields().map((field) =>
      field.fieldKey === "crew_size"
        ? { ...field, label: "Estimated crew size and shift" }
        : { ...field, order: field.order }
    );
    await builder.mutation(
      (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
      {
        audience: "supplier",
        description: "Supplier-specific response contract.",
        fields: secondFields,
        name: "Standard supplier quote",
        templateId: secondDraft.templateId,
        versionId: secondDraft.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await builder.mutation(
      (api as any).quote_response_templates.publishQuoteResponseTemplate,
      {
        releaseNote: "Clarify crew response.",
        templateId: secondDraft.templateId,
        versionId: secondDraft.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const history = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplate,
      {
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(history?.versions.map((version: any) => version.version)).toEqual([2, 1]);
    expect(history?.currentVersion?.version).toBe(2);
    expect(history).toMatchObject({
      audience: "supplier",
      description: "Supplier-specific response contract.",
      name: "Standard supplier quote",
      currentVersion: {
        audience: "supplier",
        description: "Supplier-specific response contract.",
        name: "Standard supplier quote",
      },
    });
    expect(history?.versions.find((version: any) => version.version === 1)).toMatchObject({
      audience: "either",
      description: "Reusable mixed trade response contract.",
      name: "Standard trade quote",
    });
    expect(history?.versions.every((version: any) => version.status === "published")).toBe(true);
    const oldVersion = history?.versions.find((version: any) => version.version === 1);
    expect(oldVersion).toBeTruthy();
    await builder.mutation(
      (api as any).quote_response_templates.selectQuoteResponseTemplateVersion,
      {
        templateId: created.templateId,
        versionId: created.versionId as Id<"quoteResponseTemplateVersions">,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const selected = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplate,
      {
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(selected?.currentVersion?.version).toBe(2);
    expect(selected?.selectedVersion?.version).toBe(1);
    expect(selected?.selectedVersion?.fields.find((field: any) => field.fieldKey === "crew_size")?.label).toBe("Estimated crew size");

    const events = await base.run(async (ctx) =>
      await ctx.db
        .query("auditEvents")
        .withIndex("by_entity", (query) =>
          query.eq("entityType", "quoteResponseTemplate").eq("entityId", String(created.templateId))
        )
        .collect()
    );
    expect(events.map((event) => event.eventType)).toEqual([
      "quote_response_template.draft_created",
      "quote_response_template.draft_updated",
      "quote_response_template.published",
      "quote_response_template.draft_created",
      "quote_response_template.draft_updated",
      "quote_response_template.published",
      "quote_response_template.version_selected",
    ].slice(0, events.length));
    expect(events.find((event) => event.eventType === "quote_response_template.version_selected")).toMatchObject({
      newState: "selected:v1",
      priorState: "selected:v2",
    });
  });

  test("rejects invalid permanent/configuration changes and cross-tenant access", async () => {
    const { builder } = await fixture();
    const created = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        name: "Mechanical quote",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
        {
          audience: "contractor",
          fields: [
            {
              fieldKey: "warranty",
              kind: "choice",
              choiceOptions: ["yes"],
              label: "Warranty",
              order: 0,
              required: true,
              scope: "whole_quote",
            },
          ],
          name: "Mechanical quote",
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/permanent|at least two/);

    const expectInvalidFields = async (field: Record<string, unknown>, pattern: RegExp) => {
      await expect(
        builder.mutation(
          (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
          {
            audience: "contractor",
            fields: [...allFields(), { ...field, order: 9 }],
            name: "Mechanical quote",
            templateId: created.templateId,
            versionId: created.versionId,
            workosOrganizationId: ORGANIZATION_ID,
          }
        )
      ).rejects.toThrow(pattern);
    };

    await expectInvalidFields(
      {
        allowAlternates: true,
        fieldKey: "bad_alternates",
        kind: "short_text",
        label: "Bad alternates",
        required: false,
        scope: "whole_quote",
      },
      /alternates|exclusions/
    );
    await expectInvalidFields(
      {
        fieldKey: "bad_repeatable",
        kind: "date",
        label: "Bad repeatable",
        repeatable: true,
        required: false,
        scope: "whole_quote",
      },
      /repeatable/
    );
    await expectInvalidFields(
      {
        fieldKey: "bad_tax",
        kind: "short_text",
        label: "Bad tax",
        required: false,
        scope: "whole_quote",
        supportsTax: true,
      },
      /tax/
    );
    await expectInvalidFields(
      {
        fieldKey: "bad_line_validation",
        kind: "priced_line",
        label: "Bad line validation",
        required: false,
        scope: "materials",
        validation: { maxLength: 4 },
      },
      /priced lines/
    );
    await expectInvalidFields(
      {
        fieldKey: "bad_attachment_validation",
        kind: "attachment",
        label: "Bad attachment validation",
        required: false,
        scope: "whole_quote",
        validation: { maxLength: 4 },
      },
      /attachments/
    );
    await expectInvalidFields(
      {
        fieldKey: "bad_choice_validation",
        kind: "choice",
        label: "Bad choice validation",
        required: false,
        scope: "whole_quote",
        choiceOptions: ["Yes", "No"],
        validation: { minValueCents: 1 },
      },
      /does not support validation/
    );
    await expectInvalidFields(
      {
        fieldKey: "bad_rich_text",
        kind: "long_text",
        label: "Bad rich text",
        required: false,
        richTextDefaultHtml: "<p>Not Additional Comments</p>",
        scope: "whole_quote",
      },
      /rich text defaults/
    );
    await expectInvalidFields(
      {
        fieldKey: "bad_mime_count",
        kind: "attachment",
        label: "Bad MIME count",
        required: false,
        scope: "whole_quote",
        validation: { allowedMimeTypes: Array.from({ length: 26 }, (_, index) => `application/x-${index}`) },
      },
      /at most 25/
    );
    await expectInvalidFields(
      {
        choiceOptions: Array.from({ length: 101 }, (_, index) => `Option ${index}`),
        fieldKey: "bad_choice_count",
        kind: "choice",
        label: "Bad choice count",
        required: false,
        scope: "whole_quote",
      },
      /at most 100/
    );
    const oversizedRichText = allFields().map((field) =>
      field.fieldKey === "additional_comments"
        ? { ...field, richTextDefaultHtml: "<p>" + "x".repeat(20_001) + "</p>" }
        : field
    );
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
        {
          audience: "contractor",
          fields: oversizedRichText,
          name: "Mechanical quote",
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/20000/);

    const otherTenant = withIdentity(
      convexTest(schema, modules),
      ["builder"],
      "other_builder",
      "org_other"
    );
    await expect(
      otherTenant.query(
        (api as any).quote_response_templates.getQuoteResponseTemplate,
        { templateId: created.templateId, workosOrganizationId: ORGANIZATION_ID }
      )
    ).rejects.toThrow("organization scope");
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.publishQuoteResponseTemplate,
        {
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: "org_other",
        }
      )
    ).rejects.toThrow("organization scope");
  });

  test("reads and backfills legacy version identity without crossing tenant scope", async () => {
    const { admin, base, builder } = await fixture();
    const created = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        description: "Legacy-compatible contract.",
        name: "Legacy trade quote",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const legacyVersionId = await base.run(async (ctx) => {
      const brokerage = await ctx.db
        .query("brokerages")
        .withIndex("by_workos_organization", (query) =>
          query.eq("workosOrganizationId", ORGANIZATION_ID)
        )
        .first();
      if (!brokerage) throw new Error("Missing brokerage fixture.");
      const versionId = await ctx.db.insert("quoteResponseTemplateVersions", {
        brokerageId: brokerage._id,
        createdAt: Date.now(),
        createdByWorkosUserId: "legacy-author",
        organizationId: ORGANIZATION_ID,
        status: "published",
        templateId: created.templateId,
        updatedAt: Date.now(),
        validationState: "valid",
        version: 2,
      });
      await ctx.db.patch(created.templateId, { currentVersionId: versionId });
      return versionId;
    });

    const legacyRead = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplateVersion,
      {
        templateId: created.templateId,
        versionId: legacyVersionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(legacyRead).toMatchObject({
      audience: "contractor",
      description: "Legacy-compatible contract.",
      name: "Legacy trade quote",
      version: 2,
    });

    await admin.mutation(
      (internal as any).quote_response_template_migrations
        .backfillQuoteResponseTemplateVersionIdentity,
      { cursor: null, dryRun: false, oneBatchOnly: true }
    );
    await expect(base.run((ctx) => ctx.db.get(legacyVersionId))).resolves.toMatchObject({
      audience: "contractor",
      description: "Legacy-compatible contract.",
      name: "Legacy trade quote",
    });
  });

  test("paginates version history with the Convex cursor contract", async () => {
    const { base, builder } = await fixture();
    const created = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "either",
        name: "Long history quote",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const templateId = created.templateId as Id<"quoteResponseTemplates">;
    const versionIds = await base.run(async (ctx) => {
      const template = await ctx.db.get(templateId);
      if (!template) throw new Error("Missing template fixture.");
      const ids = [];
      for (let version = 2; version <= 52; version += 1) {
        ids.push(await ctx.db.insert("quoteResponseTemplateVersions", {
          brokerageId: template.brokerageId,
          createdAt: Date.now() + version,
          createdByWorkosUserId: "history-author",
          description: `Version ${version}`,
          name: `History v${version}`,
          audience: "either",
          organizationId: ORGANIZATION_ID,
          publishedAt: Date.now() + version,
          status: "published",
          templateId,
          updatedAt: Date.now() + version,
          validationState: "valid",
          version,
        }));
      }
      return ids;
    });
    expect(versionIds).toHaveLength(51);

    const firstPage = await builder.query(
      (api as any).quote_response_templates.listQuoteResponseTemplateVersions,
      {
        paginationOpts: { cursor: null, numItems: 50 },
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(firstPage.page).toHaveLength(50);
    expect(firstPage.isDone).toBe(false);
    const secondPage = await builder.query(
      (api as any).quote_response_templates.listQuoteResponseTemplateVersions,
      {
        paginationOpts: { cursor: firstPage.continueCursor, numItems: 50 },
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(secondPage.page).toHaveLength(2);
    expect(secondPage.isDone).toBe(true);
    expect(new Set(firstPage.page.map((version: any) => version._id)).size).toBe(50);
    expect(new Set(secondPage.page.map((version: any) => version._id)).size).toBe(2);
  });
});
