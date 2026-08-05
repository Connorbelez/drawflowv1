/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveQuoteResponseTemplateVersionIdentity } from "./quote_response_template_migrations";
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

async function seedMigrationRows(base: ReturnType<typeof convexTest>, count: number) {
  return await base.run(async (ctx: any) => {
    const brokerage = await ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (query: any) =>
        query.eq("workosOrganizationId", ORGANIZATION_ID)
      )
      .unique();
    if (!brokerage) throw new Error("Missing brokerage fixture.");
    const now = Date.now();
    const templateId = await ctx.db.insert("quoteResponseTemplates", {
      audience: "either",
      brokerageId: brokerage._id,
      createdAt: now,
      createdByWorkosUserId: "migration-author",
      description: "Migration fixture",
      name: "Migration fixture",
      organizationId: ORGANIZATION_ID,
      status: "active",
      templateKey: `migration-fixture-${now.toString(36)}-${count}`,
      updatedAt: now,
    });
    const versionIds = [];
    for (let version = 1; version <= count; version += 1) {
      versionIds.push(
        await ctx.db.insert("quoteResponseTemplateVersions", {
          audience: "either",
          brokerageId: brokerage._id,
          createdAt: now + version,
          createdByWorkosUserId: "migration-author",
          description: undefined,
          name: `Migration fixture v${version}`,
          organizationId: ORGANIZATION_ID,
          status: "published",
          templateId,
          updatedAt: now + version,
          validationState: "valid",
          version,
        })
      );
    }
    return { brokerageId: brokerage._id, templateId, versionIds };
  });
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

    const prePublication = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplate,
      {
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(prePublication?.currentVersion).toMatchObject({
      _id: created.versionId,
      status: "draft",
    });
    expect(prePublication?.selectedVersion).toBeNull();

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

  test("preserves an intentionally cleared description instead of inheriting the parent", async () => {
    const { builder } = await fixture();
    const created = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        description: "Initial description",
        name: "Description contract",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await builder.mutation(
      (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        description: "",
        fields: allFields(),
        name: "Description contract",
        templateId: created.templateId,
        versionId: created.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await builder.mutation(
      (api as any).quote_response_templates.publishQuoteResponseTemplate,
      {
        templateId: created.templateId,
        versionId: created.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const saved = await builder.query(
      (api as any).quote_response_templates.getQuoteResponseTemplate,
      {
        templateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    expect(saved?.description).toBeUndefined();
    expect(saved?.currentVersion?.description).toBeUndefined();
    expect(saved?.selectedVersion?.description).toBeUndefined();
  });

  test("fails closed when current or selected version pointers cross template scope", async () => {
    const { base, builder } = await fixture();
    const first = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        name: "First pointer contract",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const second = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "supplier",
        name: "Second pointer contract",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await base.run(async (ctx) => {
      await ctx.db.patch(first.versionId, { status: "published" });
      await ctx.db.patch(second.versionId, { status: "published" });
      await ctx.db.patch(first.templateId, { currentVersionId: second.versionId });
    });
    await expect(
      builder.query(
        (api as any).quote_response_templates.getQuoteResponseTemplate,
        { templateId: first.templateId, workosOrganizationId: ORGANIZATION_ID }
      )
    ).rejects.toThrow(/currentVersionId|cross-scope/);
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
        {
          audience: "contractor",
          name: "Pointer clone",
          sourceTemplateId: first.templateId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/currentVersionId|cross-scope/);

    await base.run(async (ctx) => {
      await ctx.db.patch(first.templateId, { currentVersionId: first.versionId, selectedVersionId: second.versionId });
    });
    await expect(
      builder.query(
        (api as any).quote_response_templates.getQuoteResponseTemplate,
        { templateId: first.templateId, workosOrganizationId: ORGANIZATION_ID }
      )
    ).rejects.toThrow(/selectedVersionId|cross-scope/);
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.selectQuoteResponseTemplateVersion,
        {
          templateId: first.templateId,
          versionId: first.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/selectedVersionId|cross-scope/);
    await expect(
      builder.query(
        (api as any).quote_response_templates.listQuoteResponseTemplates,
        {
          paginationOpts: { cursor: null, numItems: 10 },
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/selectedVersionId|cross-scope/);
  });

  test("fails closed on denormalized version and field scope corruption", async () => {
    const { base, builder } = await fixture();
    const created = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        name: "Child scope contract",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );

    await base.run(async (ctx) => {
      await ctx.db.patch(created.versionId, {
        organizationId: "org_other",
        status: "published",
      });
      const fields = await ctx.db
        .query("quoteResponseTemplateFields")
        .withIndex("by_version", (query) => query.eq("versionId", created.versionId))
        .collect();
      for (const field of fields) {
        await ctx.db.patch(field._id, { organizationId: "org_other" });
      }
    });
    await expect(
      builder.query(
        (api as any).quote_response_templates.getQuoteResponseTemplate,
        { templateId: created.templateId, workosOrganizationId: ORGANIZATION_ID }
      )
    ).rejects.toThrow(/cross-scope/);
    await expect(
      builder.query(
        (api as any).quote_response_templates.validateQuoteResponseTemplateDraft,
        {
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope/);
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.publishQuoteResponseTemplate,
        {
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope/);
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.selectQuoteResponseTemplateVersion,
        {
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope/);
    await expect(
      builder.query(
        (api as any).quote_response_templates.listQuoteResponseTemplateVersions,
        {
          paginationOpts: { cursor: null, numItems: 10 },
          templateId: created.templateId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope/);
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
        {
          audience: "contractor",
          name: "Child scope clone",
          sourceTemplateId: created.templateId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope/);

    const fieldId = await base.run(async (ctx) => {
      await ctx.db.patch(created.versionId, {
        organizationId: ORGANIZATION_ID,
        status: "draft",
      });
      const field = await ctx.db
        .query("quoteResponseTemplateFields")
        .withIndex("by_version", (query) => query.eq("versionId", created.versionId))
        .first();
      if (!field) throw new Error("Missing quote template field fixture.");
      const fields = await ctx.db
        .query("quoteResponseTemplateFields")
        .withIndex("by_version", (query) => query.eq("versionId", created.versionId))
        .collect();
      for (const candidate of fields) {
        await ctx.db.patch(candidate._id, { organizationId: ORGANIZATION_ID });
      }
      await ctx.db.patch(field._id, { organizationId: "org_other" });
      return field._id;
    });
    expect(fieldId).toBeTruthy();
    await expect(
      builder.query(
        (api as any).quote_response_templates.getQuoteResponseTemplate,
        { templateId: created.templateId, workosOrganizationId: ORGANIZATION_ID }
      )
    ).rejects.toThrow(/cross-scope field/);
    await expect(
      builder.query(
        (api as any).quote_response_templates.validateQuoteResponseTemplateDraft,
        {
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope field/);
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
        {
          audience: "contractor",
          fields: allFields(),
          name: "Child scope contract",
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope field/);
    await expect(
      builder.mutation(
        (api as any).quote_response_templates.publishQuoteResponseTemplate,
        {
          templateId: created.templateId,
          versionId: created.versionId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/cross-scope field/);
  });

  test("fails closed when the latest historical version crosses scope", async () => {
    const { base, builder } = await fixture();
    const first = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        name: "Latest version scope contract",
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await builder.mutation(
      (api as any).quote_response_templates.publishQuoteResponseTemplate,
      {
        templateId: first.templateId,
        versionId: first.versionId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const second = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "contractor",
        name: "Latest version scope contract",
        sourceTemplateId: first.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    await base.run(async (ctx) => {
      await ctx.db.patch(second.versionId, {
        organizationId: "org_other",
        status: "published",
      });
      await ctx.db.patch(first.templateId, {
        currentVersionId: first.versionId,
        selectedVersionId: first.versionId,
      });
    });

    await expect(
      builder.mutation(
        (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
        {
          audience: "contractor",
          name: "Rejected next version",
          sourceTemplateId: first.templateId,
          workosOrganizationId: ORGANIZATION_ID,
        }
      )
    ).rejects.toThrow(/latest version|cross-scope/);
  });

  test("dry-runs without writes, replays idempotently, and processes migration batches", async () => {
    const { admin, base } = await fixture();
    const seeded = await seedMigrationRows(base, 51);
    const before = await base.run(async (ctx) =>
      Promise.all(seeded.versionIds.map((versionId) => ctx.db.get(versionId)))
    );
    let dryRunError: unknown;
    try {
      await admin.mutation(
        (internal as any).quote_response_template_migrations
          .backfillQuoteResponseTemplateVersionIdentity,
        { batchSize: 25, cursor: null, dryRun: true, oneBatchOnly: true }
      );
    } catch (error) {
      dryRunError = error;
    }
    expect(dryRunError).toBeDefined();
    await expect(
      base.run(async (ctx) =>
        Promise.all(seeded.versionIds.map((versionId) => ctx.db.get(versionId)))
      )
    ).resolves.toEqual(before);

    let cursor: string | null = null;
    let processed = 0;
    let isDone = false;
    let batches = 0;
    while (!isDone) {
      const result: { continueCursor: string; isDone: boolean; processed: number } = await admin.mutation(
        (internal as any).quote_response_template_migrations
          .backfillQuoteResponseTemplateVersionIdentity,
        { batchSize: 25, cursor, dryRun: false, oneBatchOnly: true }
      );
      processed += result.processed;
      isDone = result.isDone;
      cursor = result.continueCursor;
      batches += 1;
    }
    expect({ batches, processed }).toEqual({ batches: 3, processed: 51 });

    const replay = await admin.mutation(
      (internal as any).quote_response_template_migrations
        .backfillQuoteResponseTemplateVersionIdentity,
      { batchSize: 25, cursor: null, dryRun: false, oneBatchOnly: true }
    );
    expect(replay).toMatchObject({ isDone: false, processed: 25 });
    await expect(
      base.run(async (ctx) =>
        Promise.all(seeded.versionIds.map((versionId) => ctx.db.get(versionId)))
      )
    ).resolves.toEqual(before);
  });

  test("fails the identity migration for missing parents and cross-scope rows", async () => {
    const missingParent = await fixture();
    const orphan = await seedMigrationRows(missingParent.base, 1);
    await missingParent.base.run(async (ctx) => {
      await ctx.db.delete(orphan.templateId);
    });
    await expect(
      missingParent.admin.mutation(
        (internal as any).quote_response_template_migrations
          .backfillQuoteResponseTemplateVersionIdentity,
        { cursor: null, dryRun: false, oneBatchOnly: true }
      )
    ).rejects.toThrow(/missing template/);

    const crossScope = await fixture();
    const mismatched = await seedMigrationRows(crossScope.base, 1);
    await crossScope.base.run(async (ctx) => {
      await ctx.db.patch(mismatched.versionIds[0]!, { organizationId: "org_other" });
    });
    await expect(
      crossScope.admin.mutation(
        (internal as any).quote_response_template_migrations
          .backfillQuoteResponseTemplateVersionIdentity,
        { cursor: null, dryRun: false, oneBatchOnly: true }
      )
    ).rejects.toThrow(/crosses organization or brokerage scope/);
  });

  test("keeps the legacy identity resolver tenant-safe for the strict cutover", async () => {
    const legacyVersion = {
      _id: "legacy-version",
      audience: undefined,
      brokerageId: "brokerage-1",
      description: undefined,
      name: undefined,
      organizationId: ORGANIZATION_ID,
    };
    const template = {
      audience: "contractor" as const,
      brokerageId: "brokerage-1",
      description: "Legacy-compatible contract.",
      name: "Legacy trade quote",
      organizationId: ORGANIZATION_ID,
    };
    expect(resolveQuoteResponseTemplateVersionIdentity(legacyVersion, template)).toEqual({
      audience: "contractor",
      name: "Legacy trade quote",
    });
    expect(() =>
      resolveQuoteResponseTemplateVersionIdentity(
        { ...legacyVersion, organizationId: "org_other" },
        template
      )
    ).toThrow(/crosses organization or brokerage scope/);
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

    for (const numItems of [0, 101]) {
      await expect(
        builder.query(
          (api as any).quote_response_templates.listQuoteResponseTemplates,
          {
            paginationOpts: { cursor: null, numItems },
            workosOrganizationId: ORGANIZATION_ID,
          }
        )
      ).rejects.toThrow(/between 1 and 100/);
      await expect(
        builder.query(
          (api as any).quote_response_templates.listQuoteResponseTemplateVersions,
          {
            paginationOpts: { cursor: null, numItems },
            templateId: created.templateId,
            workosOrganizationId: ORGANIZATION_ID,
          }
        )
      ).rejects.toThrow(/between 1 and 100/);
    }

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
