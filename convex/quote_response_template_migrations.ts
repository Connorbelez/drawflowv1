import { internal } from "./_generated/api.js";
import { migrations } from "./migrations";

type QuoteTemplateAudience = "contractor" | "supplier" | "either";

export type QuoteResponseTemplateVersionIdentitySource = {
  _id: string;
  organizationId: string;
  brokerageId: string;
  name?: string;
  audience?: QuoteTemplateAudience;
};

export type QuoteResponseTemplateIdentitySource = {
  organizationId: string;
  brokerageId: string;
  name: string;
  audience: QuoteTemplateAudience;
};

/**
 * Resolves a legacy version identity only after proving that its parent is in
 * the same organization and brokerage. Kept pure so the compatibility
 * contract remains regression-testable after the schema is narrowed.
 */
export function resolveQuoteResponseTemplateVersionIdentity(
  version: QuoteResponseTemplateVersionIdentitySource,
  template: QuoteResponseTemplateIdentitySource
) {
  if (
    template.organizationId !== version.organizationId ||
    template.brokerageId !== version.brokerageId
  ) {
    throw new Error(
      `Quote response template version ${version._id} crosses organization or brokerage scope.`
    );
  }
  return {
    audience: version.audience ?? template.audience,
    name: version.name ?? template.name,
  };
}

/**
 * Copies the template identity onto legacy version rows that predate
 * immutable version snapshots. The organization and brokerage checks are
 * intentional: a malformed cross-tenant pointer must fail the migration
 * rather than borrowing identity from another tenant.
 */
export const backfillQuoteResponseTemplateVersionIdentity = migrations.define({
  batchSize: 25,
  table: "quoteResponseTemplateVersions",
  migrateOne: async (ctx, version) => {
    const template = await ctx.db.get(version.templateId);
    if (!template) {
      throw new Error(
        `Quote response template version ${version._id} references a missing template.`
      );
    }
    const identity = resolveQuoteResponseTemplateVersionIdentity(version, template);
    if (version.name !== undefined && version.audience !== undefined) {
      return;
    }
    return {
      ...(version.audience === undefined ? { audience: identity.audience } : {}),
      ...(version.name === undefined ? { name: identity.name } : {}),
    };
  },
});

export const runQuoteResponseTemplateVersionIdentityBackfill = migrations.runner([
  internal.quote_response_template_migrations
    .backfillQuoteResponseTemplateVersionIdentity,
]);
