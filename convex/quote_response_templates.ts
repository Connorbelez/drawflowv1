import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { builderMutation, builderQuery } from "./authz";
import {
  createTemplateDraft,
  getTemplate,
  getTemplateVersion,
  listTemplateVersions,
  listTemplates,
  publishTemplate,
  selectTemplateVersion,
  updateTemplateDraft,
  validateTemplateDraft,
} from "./quote_response_templates/handlers";

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


export const listQuoteResponseTemplates = builderQuery
  .input({
    paginationOpts: paginationOptsValidator,
    workosOrganizationId: v.string(),
  })
  .returns(registryResultValidator)
  .handler(listTemplates)
  .public();

export const listQuoteResponseTemplateVersions = builderQuery
  .input({
    paginationOpts: paginationOptsValidator,
    templateId: v.id("quoteResponseTemplates"),
    workosOrganizationId: v.string(),
  })
  .returns(paginationResultValidator(quoteTemplateVersionSummaryValidator))
  .handler(listTemplateVersions)
  .public();

export const getQuoteResponseTemplate = builderQuery
  .input({ templateId: v.id("quoteResponseTemplates"), workosOrganizationId: v.string() })
  .returns(v.union(quoteTemplateResultValidator, v.null()))
  .handler(getTemplate)
  .public();

export const getQuoteResponseTemplateVersion = builderQuery
  .input({
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(quoteTemplateVersionResultValidator, v.null()))
  .handler(getTemplateVersion)
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
  .handler(createTemplateDraft)
  .public();

export const createNextQuoteResponseTemplateDraft = createQuoteResponseTemplateDraft;

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
  .handler(updateTemplateDraft)
  .public();

export const validateQuoteResponseTemplateDraft = builderQuery
  .input({
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    workosOrganizationId: v.string(),
  })
  .returns(validationResultValidator)
  .handler(validateTemplateDraft)
  .public();

export const publishQuoteResponseTemplate = builderMutation
  .input({
    releaseNote: v.optional(v.string()),
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ templateId: v.id("quoteResponseTemplates"), versionId: v.id("quoteResponseTemplateVersions"), version: v.number() }))
  .handler(publishTemplate)
  .public();

export const selectQuoteResponseTemplateVersion = builderMutation
  .input({
    templateId: v.id("quoteResponseTemplates"),
    versionId: v.id("quoteResponseTemplateVersions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.object({ templateId: v.id("quoteResponseTemplates"), versionId: v.id("quoteResponseTemplateVersions") }))
  .handler(selectTemplateVersion)
  .public();
