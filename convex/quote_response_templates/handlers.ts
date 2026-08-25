import { ConvexError } from "convex/values";

import type { AuthorizedViewer } from "../authz";
import { assertOrganizationRetentionWritable } from "../data_retention";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  auditTemplate,
  authorizeTemplateScope,
  boundedText,
  defaultFields,
  insertVersionFields,
  normalizeFields,
  readTemplate,
  readTemplateSummary,
  readTemplateVersionPointers,
  readVersion,
  readVersionSummary,
  requireTemplateFieldScope,
  requireTemplateVersionScope,
  requiredText,
  validatePaginationSize,
  validationIssues,
} from "./core";
import type { QuoteTemplateFieldInput } from "./core";

export type QuoteTemplateAudience = "contractor" | "supplier" | "either";

export async function listTemplates(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { paginationOpts: { cursor: string | null; numItems: number }; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    validatePaginationSize(args.paginationOpts.numItems);
    const templates = await ctx.db
      .query("quoteResponseTemplates")
      .withIndex("by_organization_status", (query) =>
        query.eq("organizationId", authorization.organizationId).eq("status", "active")
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...templates,
      page: await Promise.all(templates.page.map((template) => readTemplateSummary(ctx, template))),
    };
}

export async function listTemplateVersions(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { paginationOpts: { cursor: string | null; numItems: number }; templateId: Id<"quoteResponseTemplates">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    validatePaginationSize(args.paginationOpts.numItems);
    const template = await ctx.db.get(args.templateId);
    if (
      !template ||
      template.organizationId !== authorization.organizationId ||
      template.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Template is unavailable.");
    }
    const versions = await ctx.db
      .query("quoteResponseTemplateVersions")
      .withIndex("by_template_version", (query) =>
        query.eq("templateId", template._id)
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...versions,
      page: versions.page.map((version) =>
        readVersionSummary(
          requireTemplateVersionScope(template, version, "history version")
        )
      ),
    };
}

export async function getTemplate(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { templateId: Id<"quoteResponseTemplates">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id) {
      return null;
    }
    return await readTemplate(ctx, template);
}

export async function getTemplateVersion(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { templateId: Id<"quoteResponseTemplates">; versionId: Id<"quoteResponseTemplateVersions">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (
      !template ||
      !version ||
      template.organizationId !== authorization.organizationId ||
      template.brokerageId !== authorization.brokerage._id ||
      version.organizationId !== authorization.organizationId ||
      version.brokerageId !== authorization.brokerage._id ||
      version.templateId !== template._id
    ) {
      return null;
    }
    return await readVersion(ctx, version);
}

export async function createTemplateDraft(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { audience: QuoteTemplateAudience; description?: string; name: string; sourceTemplateId?: Id<"quoteResponseTemplates">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    await assertOrganizationRetentionWritable(ctx, authorization.organizationId);
    const name = requiredText(args.name, "Template name", 120);
    const description = boundedText(args.description, "Template description", 500) || undefined;
    let sourceTemplate: Doc<"quoteResponseTemplates"> | null = null;
    let fields = defaultFields();
    if (args.sourceTemplateId) {
      sourceTemplate = await ctx.db.get(args.sourceTemplateId);
      if (!sourceTemplate || sourceTemplate.brokerageId !== authorization.brokerage._id || sourceTemplate.organizationId !== authorization.organizationId || sourceTemplate.status !== "active") {
        throw new ConvexError("Source template is unavailable.");
      }
      const sourceTemplateId = sourceTemplate._id;
      const activeDraft = await ctx.db
        .query("quoteResponseTemplateVersions")
        .withIndex("by_template_status", (query) =>
          query.eq("templateId", sourceTemplateId).eq("status", "draft")
        )
        .first();
      if (activeDraft) {
        const scopedDraft = requireTemplateVersionScope(
          sourceTemplate,
          activeDraft,
          "active draft"
        );
        return { templateId: sourceTemplateId, versionId: scopedDraft._id };
      }
      const { currentVersion, selectedVersion } = await readTemplateVersionPointers(
        ctx,
        sourceTemplate
      );
      const sourceVersion = currentVersion ?? selectedVersion;
      if (sourceVersion) {
          const sourceFields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version_order", (query) => query.eq("versionId", sourceVersion._id)).collect();
          fields = sourceFields.map((candidate, order) => {
            const field = requireTemplateFieldScope(sourceVersion, candidate);
            return {
            allowAlternates: field.allowAlternates,
            allowExclusions: field.allowExclusions,
            choiceOptions: field.choiceOptions,
            fieldKey: field.fieldKey,
            kind: field.kind,
            label: field.label,
            order,
            renderer: field.renderer,
            required: field.required,
            repeatable: field.repeatable,
            richTextDefaultHtml: field.richTextDefaultHtml,
            scope: field.scope,
            supportsTax: field.supportsTax,
            tax: field.tax,
              validation: field.validation,
            };
          });
      }
    }
    const normalizedFields = normalizeFields(fields);
    const now = Date.now();
    let templateId: Id<"quoteResponseTemplates">;
    let versionNumber = 1;
    if (sourceTemplate) {
      templateId = sourceTemplate._id;
      const latestVersion = await ctx.db
        .query("quoteResponseTemplateVersions")
        .withIndex("by_template_version", (query) => query.eq("templateId", templateId))
        .order("desc")
        .first();
      versionNumber = latestVersion
        ? requireTemplateVersionScope(
            sourceTemplate,
            latestVersion,
            "latest version"
          ).version + 1
        : 1;
    } else {
      const templateKey = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "quote-template"}-${now.toString(36)}`;
      templateId = await ctx.db.insert("quoteResponseTemplates", {
        audience: args.audience,
        brokerageId: authorization.brokerage._id,
        createdAt: now,
        createdByWorkosUserId: authorization.subject,
        description,
        name,
        organizationId: authorization.organizationId,
        status: "active",
        templateKey,
        updatedAt: now,
      });
    }
    const versionId = await ctx.db.insert("quoteResponseTemplateVersions", {
      audience: args.audience,
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: authorization.subject,
      description,
      name,
      organizationId: authorization.organizationId,
      status: "draft",
      templateId,
      updatedAt: now,
      validationState: "invalid",
      version: versionNumber,
    });
    await insertVersionFields(ctx, authorization, templateId, versionId, normalizedFields, now);
    await ctx.db.patch(templateId, { currentVersionId: versionId, updatedAt: now });
    await auditTemplate(ctx, authorization, {
      command: "createQuoteResponseTemplateDraft",
      entityId: templateId,
      eventType: "quote_response_template.draft_created",
      newState: "draft",
    }, now);
    return { templateId, versionId };
}

export async function updateTemplateDraft(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { audience: QuoteTemplateAudience; description?: string; fields: QuoteTemplateFieldInput[]; name: string; templateId: Id<"quoteResponseTemplates">; versionId: Id<"quoteResponseTemplateVersions">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    await assertOrganizationRetentionWritable(ctx, authorization.organizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || !version || template.brokerageId !== authorization.brokerage._id || template.organizationId !== authorization.organizationId || version.brokerageId !== authorization.brokerage._id || version.templateId !== template._id || version.organizationId !== authorization.organizationId || version.status !== "draft") {
      throw new ConvexError("Only an organization-owned draft version can be edited.");
    }
    const normalizedFields = normalizeFields(args.fields);
    const name = requiredText(args.name, "Template name", 120);
    const description = boundedText(args.description, "Template description", 500) || undefined;
    const oldFields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version", (query) => query.eq("versionId", version._id)).collect();
    oldFields.forEach((field) => requireTemplateFieldScope(version, field));
    const now = Date.now();
    for (const oldField of oldFields) {
      await ctx.db.delete(oldField._id);
    }
    await insertVersionFields(ctx, authorization, template._id, version._id, normalizedFields, now);
    await ctx.db.patch(version._id, {
      audience: args.audience,
      description,
      name,
      updatedAt: now,
      validationState: "valid",
    });
    await ctx.db.patch(template._id, { updatedAt: now });
    await auditTemplate(ctx, authorization, {
      command: "updateQuoteResponseTemplateDraft",
      entityId: String(template._id),
      eventType: "quote_response_template.draft_updated",
      newState: "draft",
    }, now);
    return { issues: [], valid: true };
}

export async function validateTemplateDraft(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: { templateId: Id<"quoteResponseTemplates">; versionId: Id<"quoteResponseTemplateVersions">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id) {
      throw new ConvexError("Draft template version is unavailable.");
    }
    const scopedVersion = requireTemplateVersionScope(template, version, "draft version");
    if (scopedVersion.status !== "draft") {
      throw new ConvexError("Draft template version is unavailable.");
    }
    const fields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version_order", (query) => query.eq("versionId", scopedVersion._id)).collect();
    fields.forEach((field) => requireTemplateFieldScope(scopedVersion, field));
    const issues = validationIssues(fields.map((field) => ({
      allowAlternates: field.allowAlternates,
      allowExclusions: field.allowExclusions,
      choiceOptions: field.choiceOptions,
      fieldKey: field.fieldKey,
      kind: field.kind,
      label: field.label,
      order: field.order,
      renderer: field.renderer,
      required: field.required,
      repeatable: field.repeatable,
      richTextDefaultHtml: field.richTextDefaultHtml,
      scope: field.scope,
      supportsTax: field.supportsTax,
      tax: field.tax,
      validation: field.validation,
    })));
    return { issues, valid: issues.length === 0 };
}

export async function publishTemplate(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { releaseNote?: string; templateId: Id<"quoteResponseTemplates">; versionId: Id<"quoteResponseTemplateVersions">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    await assertOrganizationRetentionWritable(ctx, authorization.organizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id) {
      throw new ConvexError("Only an organization-owned draft version can be published.");
    }
    const scopedVersion = requireTemplateVersionScope(template, version, "draft version");
    if (scopedVersion.status !== "draft") {
      throw new ConvexError("Only an organization-owned draft version can be published.");
    }
    const fields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version_order", (query) => query.eq("versionId", scopedVersion._id)).collect();
    fields.forEach((field) => requireTemplateFieldScope(scopedVersion, field));
    const issues = validationIssues(fields.map((field) => ({
      allowAlternates: field.allowAlternates,
      allowExclusions: field.allowExclusions,
      choiceOptions: field.choiceOptions,
      fieldKey: field.fieldKey,
      kind: field.kind,
      label: field.label,
      order: field.order,
      renderer: field.renderer,
      required: field.required,
      repeatable: field.repeatable,
      richTextDefaultHtml: field.richTextDefaultHtml,
      scope: field.scope,
      supportsTax: field.supportsTax,
      tax: field.tax,
      validation: field.validation,
    })));
    if (issues.length) {
      throw new ConvexError(`Template cannot be published: ${issues.join(" ")}`);
    }
    const now = Date.now();
    await ctx.db.patch(scopedVersion._id, {
      publishedAt: now,
      publishedByWorkosUserId: authorization.subject,
      releaseNote: boundedText(args.releaseNote, "Release note", 500) || undefined,
      status: "published",
      updatedAt: now,
      validationState: "valid",
    });
    await ctx.db.patch(template._id, {
      audience: scopedVersion.audience,
      currentVersionId: scopedVersion._id,
      description: scopedVersion.description,
      name: scopedVersion.name,
      selectedVersionId: scopedVersion._id,
      updatedAt: now,
    });
    await auditTemplate(ctx, authorization, {
      command: "publishQuoteResponseTemplate",
      entityId: String(template._id),
      eventType: "quote_response_template.published",
      newState: `published:v${scopedVersion.version}`,
      priorState: "draft",
      reason: args.releaseNote,
    }, now);
    return { templateId: template._id, versionId: scopedVersion._id, version: scopedVersion.version };
}

export async function selectTemplateVersion(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { templateId: Id<"quoteResponseTemplates">; versionId: Id<"quoteResponseTemplateVersions">; workosOrganizationId: string }
) {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    await assertOrganizationRetentionWritable(ctx, authorization.organizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id) {
      throw new ConvexError("Only a published version in this organization may be selected.");
    }
    const scopedVersion = requireTemplateVersionScope(template, version, "published version");
    if (scopedVersion.status !== "published") {
      throw new ConvexError("Only a published version in this organization may be selected.");
    }
    const now = Date.now();
    const { selectedVersion: priorSelectedVersion } =
      await readTemplateVersionPointers(ctx, template);
    await ctx.db.patch(template._id, { selectedVersionId: scopedVersion._id, updatedAt: now });
    await auditTemplate(ctx, authorization, {
      command: "selectQuoteResponseTemplateVersion",
      entityId: String(template._id),
      eventType: "quote_response_template.version_selected",
      newState: `selected:v${scopedVersion.version}`,
      priorState: priorSelectedVersion ? `selected:v${priorSelectedVersion.version}` : "unselected",
  }, now);
  return { templateId: template._id, versionId: scopedVersion._id };
}
