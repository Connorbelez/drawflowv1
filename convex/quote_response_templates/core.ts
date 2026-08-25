import { ConvexError } from "convex/values";

import { type AuthorizedViewer, type RoleSlug } from "../authz";
import { assertOrganizationRetentionWritable } from "../data_retention";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export type QuoteTemplateFieldInput = {
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

export function boundedText(value: string | undefined, label: string, max: number) {
  const normalized = value?.trim() ?? "";
  if (normalized.length > max) {
    throw new ConvexError(`${label} must be ${max} characters or fewer.`);
  }
  return normalized;
}

export function requiredText(value: string, label: string, max: number) {
  const normalized = boundedText(value, label, max);
  if (!normalized) {
    throw new ConvexError(`${label} is required.`);
  }
  return normalized;
}

export async function authorizeTemplateScope(
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

export function normalizedKey(value: string) {
  return value.trim().toLowerCase();
}

export function hasAnyValidationKey(
  validation: NonNullable<QuoteTemplateFieldInput["validation"]> | undefined,
  keys: readonly (keyof NonNullable<QuoteTemplateFieldInput["validation"]>)[]
) {
  return keys.some((key) => validation?.[key] !== undefined);
}

export function validateKindSpecificConfig(field: QuoteTemplateFieldInput, fieldKey: string) {
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

export function normalizeFieldInput(
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

export function normalizeValidation(
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

export function normalizeTax(value: { label: string; rateBps: number }, fieldKey: string) {
  const label = requiredText(value.label, "Tax label", 80);
  if (!Number.isInteger(value.rateBps) || value.rateBps < 0 || value.rateBps > 10_000) {
    throw new ConvexError(`${fieldKey} tax rate must be between 0 and 10000 basis points.`);
  }
  return { label, rateBps: value.rateBps };
}

export function normalizeFields(fields: QuoteTemplateFieldInput[]) {
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

export function defaultFields(): QuoteTemplateFieldInput[] {
  return PERMANENT_FIELDS.map((field, order) => ({
    ...field,
    order,
    richTextDefaultHtml:
      field.fieldKey === "additional_comments"
        ? "<p>Explain assumptions, alternates, exclusions, and anything else we should understand.</p>"
        : undefined,
  }));
}

export async function insertVersionFields(
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

export function requireTemplateVersionScope(
  template: Doc<"quoteResponseTemplates">,
  version: Doc<"quoteResponseTemplateVersions"> | null,
  context = "version"
) {
  if (
    !version ||
    version.templateId !== template._id ||
    version.organizationId !== template.organizationId ||
    version.brokerageId !== template.brokerageId
  ) {
    throw new ConvexError(
      `Template ${template._id} has an unavailable or cross-scope ${context}.`
    );
  }
  return version;
}

export function requireTemplateFieldScope(
  version: Doc<"quoteResponseTemplateVersions">,
  field: Doc<"quoteResponseTemplateFields">
) {
  if (
    field.versionId !== version._id ||
    field.templateId !== version.templateId ||
    field.organizationId !== version.organizationId ||
    field.brokerageId !== version.brokerageId
  ) {
    throw new ConvexError(
      `Template version ${version._id} has an unavailable or cross-scope field.`
    );
  }
  return field;
}

export async function readVersion(
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
    fields: fields.map((candidate) => {
      const field = requireTemplateFieldScope(version, candidate);
      return {
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
      };
    }),
    publishedAt: version.publishedAt,
    releaseNote: version.releaseNote,
    name: version.name,
    status: version.status,
    updatedAt: version.updatedAt,
    validationState: version.validationState,
    version: version.version,
  };
}

export function validateTemplateVersionPointer(
  template: Doc<"quoteResponseTemplates">,
  version: Doc<"quoteResponseTemplateVersions"> | null,
  pointer: "currentVersionId" | "selectedVersionId"
) {
  return requireTemplateVersionScope(template, version, `${pointer} pointer`);
}

export async function readTemplateVersionPointers(
  ctx: QueryCtx | MutationCtx,
  template: Doc<"quoteResponseTemplates">
) {
  const currentVersion = template.currentVersionId
    ? validateTemplateVersionPointer(
        template,
        await ctx.db.get(template.currentVersionId),
        "currentVersionId"
      )
    : null;
  const selectedVersion = template.selectedVersionId
    ? validateTemplateVersionPointer(
        template,
        await ctx.db.get(template.selectedVersionId),
        "selectedVersionId"
      )
    : null;
  return { currentVersion, selectedVersion };
}

export function readVersionSummary(version: Doc<"quoteResponseTemplateVersions">) {
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

export async function readTemplate(
  ctx: QueryCtx | MutationCtx,
  template: Doc<"quoteResponseTemplates">
) {
  const versions = await ctx.db
    .query("quoteResponseTemplateVersions")
    .withIndex("by_template_version", (query) => query.eq("templateId", template._id))
    .order("desc")
    .take(50);
  const scopedVersions = versions.map((version) =>
    requireTemplateVersionScope(template, version, "history version")
  );
  const { currentVersion, selectedVersion } = await readTemplateVersionPointers(ctx, template);
  const identityVersion = currentVersion ?? selectedVersion;
  return {
    _id: template._id,
    audience: identityVersion?.audience ?? template.audience,
    createdAt: template.createdAt,
    createdByWorkosUserId: template.createdByWorkosUserId,
    currentVersion: currentVersion ? await readVersion(ctx, currentVersion) : null,
    description: identityVersion ? identityVersion.description : template.description,
    name: identityVersion?.name ?? template.name,
    selectedVersion: selectedVersion ? await readVersion(ctx, selectedVersion) : null,
    status: template.status,
    templateKey: template.templateKey,
    updatedAt: template.updatedAt,
    versions: scopedVersions.map(readVersionSummary),
  };
}

export async function readTemplateSummary(
  ctx: QueryCtx | MutationCtx,
  template: Doc<"quoteResponseTemplates">
) {
  const { currentVersion, selectedVersion } = await readTemplateVersionPointers(ctx, template);
  const identityVersion = currentVersion ?? selectedVersion;
  return {
    _id: template._id,
    audience: identityVersion?.audience ?? template.audience,
    createdAt: template.createdAt,
    createdByWorkosUserId: template.createdByWorkosUserId,
    currentVersion: currentVersion ? readVersionSummary(currentVersion) : null,
    description: identityVersion ? identityVersion.description : template.description,
    name: identityVersion?.name ?? template.name,
    selectedVersion: selectedVersion ? readVersionSummary(selectedVersion) : null,
    status: template.status,
    templateKey: template.templateKey,
    updatedAt: template.updatedAt,
  };
}

export function validationIssues(fields: QuoteTemplateFieldInput[]) {
  const issues: string[] = [];
  try {
    normalizeFields(fields);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Template fields are invalid.");
  }
  return issues;
}

export function validatePaginationSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100) {
    throw new ConvexError("Pagination page size must be an integer between 1 and 100.");
  }
}

export async function auditTemplate(
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
