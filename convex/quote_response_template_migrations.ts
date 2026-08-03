import { internal } from "./_generated/api.js";
import { migrations } from "./migrations";

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
    if (
      version.name !== undefined &&
      version.audience !== undefined
    ) {
      return;
    }

    const template = await ctx.db.get(version.templateId);
    if (!template) {
      throw new Error(
        `Quote response template version ${version._id} references a missing template.`
      );
    }
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
      description: version.description ?? template.description,
      name: version.name ?? template.name,
    };
  },
});

export const runQuoteResponseTemplateVersionIdentityBackfill = migrations.runner([
  internal.quote_response_template_migrations
    .backfillQuoteResponseTemplateVersionIdentity,
]);
