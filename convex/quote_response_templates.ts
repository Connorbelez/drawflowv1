import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import {
  builderMutation,
  builderQuery,
  type RoleSlug,
} from "./authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const quoteTemplateAudienceValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier"),
  v.literal("either")
);

const quoteTemplateFieldKindValidator = v.union(
  v.literal("priced_line"),
  v.literal("short_text"),
  v.literal("long_text"),
  v.literal("date"),
  v.literal("choice"),
  v.literal("attachment")
);

const quoteTemplateFieldScopeValidator = v.union(
  v.literal("whole_quote"),
  v.literal("labour"),
  v.literal("materials")
);

const quoteTemplateFieldRendererValidator = v.union(
  v.literal("input"),
  v.literal("tiptap")
);

const quoteTemplateValidationValidator = v.object({
  allowedMimeTypes: v.optional(v.array(v.string())),
  maxFiles: v.optional(v.number()),
  maxLength: v.optional(v.number()),
  maxValueCents: v.optional(v.number()),
  minFiles: v.optional(v.number()),
  minLength: v.optional(v.number()),
  minValueCents: v.optional(v.number()),
  pattern: v.optional(v.string()),
});

const quoteTemplateTaxValidator = v.object({
  label: v.string(),
  rateBps: v.number(),
});

const quoteTemplateFieldValidator = v.object({
  allowAlternates: v.optional(v.boolean()),
  allowExclusions: v.optional(v.boolean()),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  label: v.string(),
  kind: quoteTemplateFieldKindValidator,
  order: v.number(),
  renderer: v.optional(quoteTemplateFieldRendererValidator),
  required: v.boolean(),
  repeatable: v.optional(v.boolean()),
  richTextDefaultHtml: v.optional(v.string()),
  scope: quoteTemplateFieldScopeValidator,
  supportsTax: v.optional(v.boolean()),
  tax: v.optional(quoteTemplateTaxValidator),
  validation: v.optional(quoteTemplateValidationValidator),
});

const quoteTemplateVersionSummaryValidator = v.object({
  _id: v.id("quoteResponseTemplateVersions"),
  audience: quoteTemplateAudienceValidator,
  createdAt: v.number(),
  description: v.optional(v.string()),
  name: v.string(),
  publishedAt: v.optional(v.number()),
  releaseNote: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published")),
  updatedAt: v.number(),
  validationState: v.union(v.literal("invalid"), v.literal("valid")),
  version: v.number(),
});

const quoteTemplateFieldResultValidator = v.object({
  _id: v.id("quoteResponseTemplateFields"),
  allowAlternates: v.boolean(),
  allowExclusions: v.boolean(),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  isPermanent: v.boolean(),
  kind: quoteTemplateFieldKindValidator,
  label: v.string(),
  order: v.number(),
  renderer: quoteTemplateFieldRendererValidator,
  required: v.boolean(),
  repeatable: v.boolean(),
  richTextDefaultHtml: v.optional(v.string()),
  scope: quoteTemplateFieldScopeValidator,
  supportsTax: v.boolean(),
  tax: v.optional(quoteTemplateTaxValidator),
  validation: v.optional(quoteTemplateValidationValidator),
});

const quoteTemplateVersionResultValidator = v.object({
  _id: v.id("quoteResponseTemplateVersions"),
  audience: quoteTemplateAudienceValidator,
  createdAt: v.number(),
  description: v.optional(v.string()),
  fields: v.array(quoteTemplateFieldResultValidator),
  name: v.string(),
  publishedAt: v.optional(v.number()),
  releaseNote: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published")),
  updatedAt: v.number(),
  validationState: v.union(v.literal("invalid"), v.literal("valid")),
  version: v.number(),
});

const quoteTemplateResultValidator = v.object({
  _id: v.id("quoteResponseTemplates"),
  audience: quoteTemplateAudienceValidator,
  createdAt: v.number(),
  createdByWorkosUserId: v.string(),
  currentVersion: v.union(quoteTemplateVersionResultValidator, v.null()),
  description: v.optional(v.string()),
  name: v.string(),
  selectedVersion: v.union(quoteTemplateVersionResultValidator, v.null()),
  status: v.union(v.literal("active"), v.literal("archived")),
  templateKey: v.string(),
  updatedAt: v.number(),
  versions: v.array(quoteTemplateVersionSummaryValidator),
});

const quoteTemplateSummaryResultValidator = v.object({
  _id: v.id("quoteResponseTemplates"),
  audience: quoteTemplateAudienceValidator,
  createdAt: v.number(),
  createdByWorkosUserId: v.string(),
  currentVersion: v.union(quoteTemplateVersionSummaryValidator, v.null()),
  description: v.optional(v.string()),
  name: v.string(),
  selectedVersion: v.union(quoteTemplateVersionSummaryValidator, v.null()),
  status: v.union(v.literal("active"), v.literal("archived")),
  templateKey: v.string(),
  updatedAt: v.number(),
});

const registryResultValidator = paginationResultValidator(quoteTemplateSummaryResultValidator);

const validationResultValidator = v.object({
  issues: v.array(v.string()),
  valid: v.boolean(),
});

type QuoteTemplateFieldInput = {
  allowAlternates?: boolean;
  allowExclusions?: boolean;
  choiceOptions?: string[];
  fieldKey: string;
  label: string;
  kind:
    | "priced_line"
    | "short_text"
    | "long_text"
    | "date"
    | "choice"
    | "attachment";
  order: number;
  renderer?: "input" | "tiptap";
  required: boolean;
  repeatable?: boolean;
  richTextDefaultHtml?: string;
  scope: "whole_quote" | "labour" | "materials";
  supportsTax?: boolean;
  tax?: { label: string; rateBps: number };
  validation?: {
    allowedMimeTypes?: string[];
    maxFiles?: number;
    maxLength?: number;
    maxValueCents?: number;
    minFiles?: number;
    minLength?: number;
    minValueCents?: number;
    pattern?: string;
  };
};

type TemplateAuthorization = {
  brokerage: Doc<"brokerages">;
  organizationId: string;
  roles: RoleSlug[];
  subject: string;
};

type AuthorizedTemplateCtx = (QueryCtx | MutationCtx) & {
  viewer: {
    organizationId?: string;
    roles: RoleSlug[];
    subject: string;
  };
};

const PERMANENT_FIELDS: Array<{
  allowAlternates: boolean;
  allowExclusions: boolean;
  fieldKey: string;
  kind: QuoteTemplateFieldInput["kind"];
  label: string;
  renderer: "input" | "tiptap";
  repeatable: boolean;
  required: boolean;
  scope: QuoteTemplateFieldInput["scope"];
  supportsTax: boolean;
}> = [
  {
    allowAlternates: true,
    allowExclusions: true,
    fieldKey: "labour_line_items",
    kind: "priced_line",
    label: "Labour",
    renderer: "input",
    repeatable: true,
    required: false,
    scope: "labour",
    supportsTax: true,
  },
  {
    allowAlternates: true,
    allowExclusions: true,
    fieldKey: "materials_line_items",
    kind: "priced_line",
    label: "Materials",
    renderer: "input",
    repeatable: true,
    required: false,
    scope: "materials",
    supportsTax: true,
  },
  {
    allowAlternates: false,
    allowExclusions: false,
    fieldKey: "additional_comments",
    kind: "long_text",
    label: "Additional comments",
    renderer: "tiptap",
    repeatable: false,
    required: false,
    scope: "whole_quote",
    supportsTax: false,
  },
];

function boundedText(value: string | undefined, label: string, max: number) {
  const normalized = value?.trim() ?? "";
  if (normalized.length > max) {
    throw new ConvexError(`${label} must be ${max} characters or fewer.`);
  }
  return normalized;
}

function requiredText(value: string, label: string, max: number) {
  const normalized = boundedText(value, label, max);
  if (!normalized) {
    throw new ConvexError(`${label} is required.`);
  }
  return normalized;
}

async function authorizeTemplateScope(
  ctx: AuthorizedTemplateCtx,
  workosOrganizationId: string
): Promise<TemplateAuthorization> {
  const organizationId = workosOrganizationId.trim();
  if (!organizationId || ctx.viewer.organizationId?.trim() !== organizationId) {
    throw new ConvexError("Forbidden: organization scope.");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (query) =>
      query.eq("workosOrganizationId", organizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new ConvexError("Forbidden: brokerage scope.");
  }
  return {
    brokerage,
    organizationId,
    roles: ctx.viewer.roles,
    subject: ctx.viewer.subject,
  };
}

function normalizedKey(value: string) {
  return value.trim().toLowerCase();
}

function hasAnyValidationKey(
  validation: NonNullable<QuoteTemplateFieldInput["validation"]> | undefined,
  keys: readonly (keyof NonNullable<QuoteTemplateFieldInput["validation"]>)[]
) {
  return keys.some((key) => validation?.[key] !== undefined);
}

function validateKindSpecificConfig(field: QuoteTemplateFieldInput, fieldKey: string) {
  if (field.allowAlternates === true || field.allowExclusions === true) {
    if (field.kind !== "priced_line") {
      throw new ConvexError(`${fieldKey} alternates and exclusions are only supported for priced lines.`);
    }
  }
  if (field.repeatable === true && field.kind !== "priced_line") {
    throw new ConvexError(`${fieldKey} repeatable rows are only supported for priced lines.`);
  }
  if (field.kind !== "priced_line" && (field.supportsTax === true || field.tax !== undefined)) {
    throw new ConvexError(`${fieldKey} tax configuration is only supported for priced lines.`);
  }

  const validation = field.validation;
  if (field.kind === "priced_line") {
    if (hasAnyValidationKey(validation, ["allowedMimeTypes", "maxFiles", "minFiles", "maxLength", "minLength", "pattern"])) {
      throw new ConvexError(`${fieldKey} priced lines only support minimum and maximum amount validation.`);
    }
  } else if (field.kind === "attachment") {
    if (hasAnyValidationKey(validation, ["maxLength", "minLength", "maxValueCents", "minValueCents", "pattern"])) {
      throw new ConvexError(`${fieldKey} attachments only support file-count and MIME validation.`);
    }
  } else if (field.kind === "short_text" || field.kind === "long_text") {
    if (hasAnyValidationKey(validation, ["allowedMimeTypes", "maxFiles", "minFiles", "maxValueCents", "minValueCents"])) {
      throw new ConvexError(`${fieldKey} text fields only support length and pattern validation.`);
    }
  } else if (validation !== undefined) {
    throw new ConvexError(`${fieldKey} does not support validation configuration.`);
  }

  if (field.kind !== "choice" && field.choiceOptions !== undefined) {
    throw new ConvexError(`${fieldKey} choice options are only supported for choice fields.`);
  }
  if (field.richTextDefaultHtml !== undefined && (field.kind !== "long_text" || field.fieldKey !== "additional_comments")) {
    throw new ConvexError(`${fieldKey} rich text defaults are reserved for Additional Comments.`);
  }
  if (field.renderer === "tiptap" && field.fieldKey !== "additional_comments") {
    throw new ConvexError(`${fieldKey} TipTap rendering is reserved for Additional Comments.`);
  }
}

function normalizeFieldInput(
  field: QuoteTemplateFieldInput,
  index: number
): QuoteTemplateFieldInput {
  const fieldKey = requiredText(field.fieldKey, "Field key", 64);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(fieldKey)) {
    throw new ConvexError(
      `Field key ${fieldKey} must use lowercase letters, numbers, dots, dashes, or underscores.`
    );
  }
  const label = requiredText(field.label, "Field label", 120);
  if (!Number.isInteger(field.order) || field.order !== index) {
    throw new ConvexError("Fields must have contiguous order values starting at zero.");
  }
  validateKindSpecificConfig(field, fieldKey);
  if (field.richTextDefaultHtml !== undefined && field.richTextDefaultHtml.length > 20_000) {
    throw new ConvexError(`${fieldKey} rich text default must be 20000 characters or fewer.`);
  }
  const choiceOptions = field.choiceOptions
    ?.map((option) => requiredText(option, "Choice option", 120))
    .filter(Boolean);
  if (field.kind === "choice") {
    if (!choiceOptions || choiceOptions.length < 2) {
      throw new ConvexError(`${fieldKey} needs at least two choice options.`);
    }
    if (choiceOptions.length > 100) {
      throw new ConvexError(`${fieldKey} supports at most 100 choice options.`);
    }
    if (new Set(choiceOptions.map(normalizedKey)).size !== choiceOptions.length) {
      throw new ConvexError(`${fieldKey} choice options must be unique.`);
    }
  } else if (choiceOptions?.length) {
    throw new ConvexError(`${fieldKey} only choice fields may define options.`);
  }
  const validation = field.validation
    ? normalizeValidation(field.validation, fieldKey)
    : undefined;
  const tax = field.tax
    ? normalizeTax(field.tax, fieldKey)
    : undefined;
  if (tax && field.supportsTax === false) {
    throw new ConvexError(`${fieldKey} does not support tax configuration.`);
  }
  if (field.renderer === "tiptap" && field.kind !== "long_text") {
    throw new ConvexError("TipTap rendering is only supported for long text fields.");
  }
  if (field.kind === "attachment" && field.renderer === "tiptap") {
    throw new ConvexError("Attachments cannot use the TipTap renderer.");
  }
  return {
    allowAlternates: field.allowAlternates ?? false,
    allowExclusions: field.allowExclusions ?? false,
    choiceOptions,
    fieldKey,
    kind: field.kind,
    label,
    order: index,
    renderer: field.renderer ?? "input",
    required: field.required,
    repeatable: field.repeatable ?? false,
    richTextDefaultHtml: field.richTextDefaultHtml,
    scope: field.scope,
    supportsTax: field.supportsTax ?? Boolean(tax),
    tax,
    validation,
  };
}

function normalizeValidation(
  value: NonNullable<QuoteTemplateFieldInput["validation"]>,
  fieldKey: string
) {
  const numericKeys = [
    "maxFiles",
    "maxLength",
    "maxValueCents",
    "minFiles",
    "minLength",
    "minValueCents",
  ] as const;
  for (const key of numericKeys) {
    const current = value[key];
    if (current !== undefined && (!Number.isInteger(current) || current < 0)) {
      throw new ConvexError(`${fieldKey} ${key} must be a non-negative integer.`);
    }
  }
  if (
    value.minLength !== undefined &&
    value.maxLength !== undefined &&
    value.minLength > value.maxLength
  ) {
    throw new ConvexError(`${fieldKey} minimum length cannot exceed maximum length.`);
  }
  if (
    value.minFiles !== undefined &&
    value.maxFiles !== undefined &&
    value.minFiles > value.maxFiles
  ) {
    throw new ConvexError(`${fieldKey} minimum files cannot exceed maximum files.`);
  }
  if (
    value.minValueCents !== undefined &&
    value.maxValueCents !== undefined &&
    value.minValueCents > value.maxValueCents
  ) {
    throw new ConvexError(`${fieldKey} minimum value cannot exceed maximum value.`);
  }
  if (value.pattern !== undefined && value.pattern.length > 300) {
    throw new ConvexError(`${fieldKey} validation pattern is too long.`);
  }
  if (value.allowedMimeTypes !== undefined && value.allowedMimeTypes.length > 25) {
    throw new ConvexError(`${fieldKey} supports at most 25 allowed MIME types.`);
  }
  return {
    allowedMimeTypes: value.allowedMimeTypes
      ?.map((mimeType) => requiredText(mimeType, "Allowed MIME type", 120)),
    maxFiles: value.maxFiles,
    maxLength: value.maxLength,
    maxValueCents: value.maxValueCents,
    minFiles: value.minFiles,
    minLength: value.minLength,
    minValueCents: value.minValueCents,
    pattern: value.pattern?.trim() || undefined,
  };
}

function normalizeTax(value: { label: string; rateBps: number }, fieldKey: string) {
  const label = requiredText(value.label, "Tax label", 80);
  if (!Number.isInteger(value.rateBps) || value.rateBps < 0 || value.rateBps > 10_000) {
    throw new ConvexError(`${fieldKey} tax rate must be between 0 and 10000 basis points.`);
  }
  return { label, rateBps: value.rateBps };
}

function normalizeFields(fields: QuoteTemplateFieldInput[]) {
  if (fields.length > 100) {
    throw new ConvexError("A template may contain at most 100 fields.");
  }
  const normalized = fields.map(normalizeFieldInput);
  const keys = normalized.map((field) => field.fieldKey);
  if (new Set(keys).size !== keys.length) {
    throw new ConvexError("Field keys must be unique within a template version.");
  }
  for (const permanent of PERMANENT_FIELDS) {
    const field = normalized.find((candidate) => candidate.fieldKey === permanent.fieldKey);
    if (!field) {
      throw new ConvexError(`${permanent.label} is a permanent response region and cannot be removed.`);
    }
    if (
      field.kind !== permanent.kind ||
      field.scope !== permanent.scope ||
      field.renderer !== permanent.renderer ||
      field.repeatable !== permanent.repeatable
    ) {
      throw new ConvexError(`${permanent.label} permanent response region cannot be reconfigured.`);
    }
  }
  return normalized;
}

function defaultFields(): QuoteTemplateFieldInput[] {
  return PERMANENT_FIELDS.map((field, order) => ({
    ...field,
    order,
    richTextDefaultHtml:
      field.fieldKey === "additional_comments"
        ? "<p>Explain assumptions, alternates, exclusions, and anything else we should understand.</p>"
        : undefined,
  }));
}

async function insertVersionFields(
  ctx: MutationCtx,
  authorization: TemplateAuthorization,
  templateId: Id<"quoteResponseTemplates">,
  versionId: Id<"quoteResponseTemplateVersions">,
  fields: QuoteTemplateFieldInput[],
  now: number
) {
  for (const field of fields) {
    await ctx.db.insert("quoteResponseTemplateFields", {
      allowAlternates: field.allowAlternates ?? false,
      allowExclusions: field.allowExclusions ?? false,
      brokerageId: authorization.brokerage._id,
      choiceOptions: field.choiceOptions,
      createdAt: now,
      fieldKey: field.fieldKey,
      isPermanent: PERMANENT_FIELDS.some((item) => item.fieldKey === field.fieldKey),
      kind: field.kind,
      label: field.label,
      order: field.order,
      organizationId: authorization.organizationId,
      renderer: field.renderer ?? "input",
      repeatable: field.repeatable ?? false,
      required: field.required,
      richTextDefaultHtml: field.richTextDefaultHtml,
      scope: field.scope,
      supportsTax: field.supportsTax ?? Boolean(field.tax),
      tax: field.tax,
      templateId,
      updatedAt: now,
      validation: field.validation,
      versionId,
    });
  }
}

async function readVersion(
  ctx: QueryCtx | MutationCtx,
  version: Doc<"quoteResponseTemplateVersions">
) {
  const fields = await ctx.db
    .query("quoteResponseTemplateFields")
    .withIndex("by_version_order", (query) => query.eq("versionId", version._id))
    .collect();
  return {
    _id: version._id,
    audience: version.audience,
    createdAt: version.createdAt,
    description: version.description,
    fields: fields.map((field) => ({
      _id: field._id,
      allowAlternates: field.allowAlternates,
      allowExclusions: field.allowExclusions,
      choiceOptions: field.choiceOptions,
      fieldKey: field.fieldKey,
      isPermanent: field.isPermanent,
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
    })),
    publishedAt: version.publishedAt,
    releaseNote: version.releaseNote,
    name: version.name,
    status: version.status,
    updatedAt: version.updatedAt,
    validationState: version.validationState,
    version: version.version,
  };
}

function readVersionSummary(version: Doc<"quoteResponseTemplateVersions">) {
  return {
    _id: version._id,
    audience: version.audience,
    createdAt: version.createdAt,
    description: version.description,
    name: version.name,
    publishedAt: version.publishedAt,
    releaseNote: version.releaseNote,
    status: version.status,
    updatedAt: version.updatedAt,
    validationState: version.validationState,
    version: version.version,
  };
}

async function readTemplate(
  ctx: QueryCtx | MutationCtx,
  template: Doc<"quoteResponseTemplates">
) {
  const versions = await ctx.db
    .query("quoteResponseTemplateVersions")
    .withIndex("by_template_version", (query) => query.eq("templateId", template._id))
    .order("desc")
    .take(50);
  const currentVersion = template.currentVersionId
    ? await ctx.db.get(template.currentVersionId)
    : null;
  const selectedVersion = template.selectedVersionId
    ? await ctx.db.get(template.selectedVersionId)
    : currentVersion;
  const identityVersion = currentVersion ?? selectedVersion;
  return {
    _id: template._id,
    audience: identityVersion?.audience ?? template.audience,
    createdAt: template.createdAt,
    createdByWorkosUserId: template.createdByWorkosUserId,
    currentVersion: currentVersion ? await readVersion(ctx, currentVersion) : null,
    description: identityVersion?.description ?? template.description,
    name: identityVersion?.name ?? template.name,
    selectedVersion: selectedVersion ? await readVersion(ctx, selectedVersion) : null,
    status: template.status,
    templateKey: template.templateKey,
    updatedAt: template.updatedAt,
    versions: versions.map(readVersionSummary),
  };
}

async function readTemplateSummary(
  ctx: QueryCtx | MutationCtx,
  template: Doc<"quoteResponseTemplates">
) {
  const currentVersion = template.currentVersionId
    ? await ctx.db.get(template.currentVersionId)
    : null;
  const selectedVersion = template.selectedVersionId
    ? await ctx.db.get(template.selectedVersionId)
    : currentVersion;
  const identityVersion = currentVersion ?? selectedVersion;
  return {
    _id: template._id,
    audience: identityVersion?.audience ?? template.audience,
    createdAt: template.createdAt,
    createdByWorkosUserId: template.createdByWorkosUserId,
    currentVersion: currentVersion ? readVersionSummary(currentVersion) : null,
    description: identityVersion?.description ?? template.description,
    name: identityVersion?.name ?? template.name,
    selectedVersion: selectedVersion ? readVersionSummary(selectedVersion) : null,
    status: template.status,
    templateKey: template.templateKey,
    updatedAt: template.updatedAt,
  };
}

function validationIssues(fields: QuoteTemplateFieldInput[]) {
  const issues: string[] = [];
  try {
    normalizeFields(fields);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Template fields are invalid.");
  }
  return issues;
}

async function auditTemplate(
  ctx: MutationCtx,
  authorization: TemplateAuthorization,
  input: {
    command: string;
    entityId: string;
    eventType: string;
    newState?: string;
    priorState?: string;
    reason?: string;
  },
  now: number
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.subject,
    brokerageId: authorization.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: input.entityId,
    entityType: "quoteResponseTemplate",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({ entityId: input.entityId }),
    relatedEntityId: input.entityId,
    relatedEntityType: "quoteResponseTemplate",
    status: "pending",
  });
}

export const listQuoteResponseTemplates = builderQuery
  .input({
    paginationOpts: paginationOptsValidator,
    workosOrganizationId: v.string(),
  })
  .returns(registryResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const templates = await ctx.db
      .query("quoteResponseTemplates")
      .withIndex("by_organization_status", (query) =>
        query.eq("organizationId", authorization.organizationId).eq("status", "active")
      )
      .order("desc")
      .paginate({
        cursor: args.paginationOpts.cursor,
        numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)),
      });
    return {
      ...templates,
      page: await Promise.all(templates.page.map((template) => readTemplateSummary(ctx, template))),
    };
  })
  .public();

export const getQuoteResponseTemplate = builderQuery
  .input({ templateId: v.id("quoteResponseTemplates"), workosOrganizationId: v.string() })
  .returns(v.union(quoteTemplateResultValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id) {
      return null;
    }
    return await readTemplate(ctx, template);
  })
  .public();

export const getQuoteResponseTemplateVersion = builderQuery
  .input({
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(quoteTemplateVersionResultValidator, v.null()))
  .handler(async (ctx, args) => {
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
  })
  .public();

export const createQuoteResponseTemplateDraft = builderMutation
  .input({
    audience: quoteTemplateAudienceValidator,
    description: v.optional(v.string()),
    name: v.string(),
    sourceTemplateId: v.optional(v.id("quoteResponseTemplates")),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ templateId: v.id("quoteResponseTemplates"), versionId: v.id("quoteResponseTemplateVersions") }))
  .handler(async (ctx, args) => {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
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
        return { templateId: sourceTemplateId, versionId: activeDraft._id };
      }
      const sourceVersionId = sourceTemplate.currentVersionId ?? sourceTemplate.selectedVersionId;
      if (sourceVersionId) {
        const sourceVersion = await ctx.db.get(sourceVersionId);
        if (sourceVersion && sourceVersion.brokerageId === authorization.brokerage._id && sourceVersion.organizationId === authorization.organizationId && sourceVersion.templateId === sourceTemplate._id) {
          const sourceFields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version_order", (query) => query.eq("versionId", sourceVersion._id)).collect();
          fields = sourceFields.map((field, order) => ({
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
          }));
        }
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
      versionNumber = (latestVersion?.version ?? 0) + 1;
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
  })
  .public();

// Explicit name for the versioning workflow. Passing sourceTemplateId to this
// contract creates the next draft on that existing template rather than a new
// registry entry; the published version rows remain immutable.
export const createNextQuoteResponseTemplateDraft =
  createQuoteResponseTemplateDraft;

export const updateQuoteResponseTemplateDraft = builderMutation
  .input({
    audience: quoteTemplateAudienceValidator,
    description: v.optional(v.string()),
    fields: v.array(quoteTemplateFieldValidator),
    name: v.string(),
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    workosOrganizationId: v.string(),
  })
  .returns(validationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || !version || template.brokerageId !== authorization.brokerage._id || template.organizationId !== authorization.organizationId || version.brokerageId !== authorization.brokerage._id || version.templateId !== template._id || version.organizationId !== authorization.organizationId || version.status !== "draft") {
      throw new ConvexError("Only an organization-owned draft version can be edited.");
    }
    const normalizedFields = normalizeFields(args.fields);
    const name = requiredText(args.name, "Template name", 120);
    const description = boundedText(args.description, "Template description", 500) || undefined;
    const oldFields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version", (query) => query.eq("versionId", version._id)).collect();
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
  })
  .public();

export const validateQuoteResponseTemplateDraft = builderQuery
  .input({ templateId: v.id("quoteResponseTemplates"), versionId: v.id("quoteResponseTemplateVersions"), workosOrganizationId: v.string() })
  .returns(validationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || !version || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id || version.brokerageId !== authorization.brokerage._id || version.templateId !== template._id || version.status !== "draft") {
      throw new ConvexError("Draft template version is unavailable.");
    }
    const fields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version_order", (query) => query.eq("versionId", version._id)).collect();
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
  })
  .public();

export const publishQuoteResponseTemplate = builderMutation
  .input({
    releaseNote: v.optional(v.string()),
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ templateId: v.id("quoteResponseTemplates"), versionId: v.id("quoteResponseTemplateVersions"), version: v.number() }))
  .handler(async (ctx, args) => {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || !version || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id || version.brokerageId !== authorization.brokerage._id || version.templateId !== template._id || version.status !== "draft") {
      throw new ConvexError("Only an organization-owned draft version can be published.");
    }
    const fields = await ctx.db.query("quoteResponseTemplateFields").withIndex("by_version_order", (query) => query.eq("versionId", version._id)).collect();
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
    await ctx.db.patch(version._id, {
      publishedAt: now,
      publishedByWorkosUserId: authorization.subject,
      releaseNote: boundedText(args.releaseNote, "Release note", 500) || undefined,
      status: "published",
      updatedAt: now,
      validationState: "valid",
    });
    await ctx.db.patch(template._id, {
      audience: version.audience,
      currentVersionId: version._id,
      description: version.description,
      name: version.name,
      selectedVersionId: version._id,
      updatedAt: now,
    });
    await auditTemplate(ctx, authorization, {
      command: "publishQuoteResponseTemplate",
      entityId: String(template._id),
      eventType: "quote_response_template.published",
      newState: `published:v${version.version}`,
      priorState: "draft",
      reason: args.releaseNote,
    }, now);
    return { templateId: template._id, versionId: version._id, version: version.version };
  })
  .public();

export const selectQuoteResponseTemplateVersion = builderMutation
  .input({ templateId: v.id("quoteResponseTemplates"), versionId: v.id("quoteResponseTemplateVersions"), workosOrganizationId: v.string() })
  .returns(v.object({ templateId: v.id("quoteResponseTemplates"), versionId: v.id("quoteResponseTemplateVersions") }))
  .handler(async (ctx, args) => {
    const authorization = await authorizeTemplateScope(ctx, args.workosOrganizationId);
    const template = await ctx.db.get(args.templateId);
    const version = await ctx.db.get(args.versionId);
    if (!template || !version || template.organizationId !== authorization.organizationId || template.brokerageId !== authorization.brokerage._id || version.brokerageId !== authorization.brokerage._id || version.templateId !== template._id || version.status !== "published") {
      throw new ConvexError("Only a published version in this organization may be selected.");
    }
    const now = Date.now();
    const priorSelectedVersion = template.selectedVersionId
      ? await ctx.db.get(template.selectedVersionId)
      : null;
    await ctx.db.patch(template._id, { selectedVersionId: version._id, updatedAt: now });
    await auditTemplate(ctx, authorization, {
      command: "selectQuoteResponseTemplateVersion",
      entityId: String(template._id),
      eventType: "quote_response_template.version_selected",
      newState: `selected:v${version.version}`,
      priorState: priorSelectedVersion ? `selected:v${priorSelectedVersion.version}` : "unselected",
    }, now);
    return { templateId: template._id, versionId: version._id };
  })
  .public();
