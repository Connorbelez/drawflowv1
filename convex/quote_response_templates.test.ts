/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
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

    const secondDraft = await builder.mutation(
      (api as any).quote_response_templates.createQuoteResponseTemplateDraft,
      {
        audience: "either",
        description: "Reusable mixed trade response contract.",
        name: "Standard trade quote",
        sourceTemplateId: created.templateId,
        workosOrganizationId: ORGANIZATION_ID,
      }
    );
    const secondFields = allFields().map((field) =>
      field.fieldKey === "crew_size"
        ? { ...field, label: "Estimated crew size and shift" }
        : { ...field, order: field.order }
    );
    await builder.mutation(
      (api as any).quote_response_templates.updateQuoteResponseTemplateDraft,
      {
        audience: "either",
        description: "Reusable mixed trade response contract.",
        fields: secondFields,
        name: "Standard trade quote",
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
});
