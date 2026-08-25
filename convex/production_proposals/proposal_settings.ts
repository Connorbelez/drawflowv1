/**
 * Production proposals proposal settings bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import { resolveBrokerageScope } from "./authorization_core.js";
import { requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES } from "./contracts_foundation.js";
import { productionSettingsMilestoneInput, productionSettingsScenarioInput } from "./contracts_workflow.js";
import { writeProductionSettingsEvent } from "./proposal_copy_audit.js";
import { normalizeProductionTemplateKey, authorizeProductionSettingsMutation } from "./seed_default_builders.js";
import { seedProductionDefaultTemplates, ensureProductionDefaultTemplate, replaceProductionDefaultMilestones, ensureDrawScheduleScenario } from "./seed_template_writer.js";
import { getProductionSettingsTemplate, getProductionSettingsScenario, upsertProductionSettingsTemplate, replaceProductionSettingsMilestones, replaceProductionSettingsScenarios, replaceProductionScenarioDraws, deleteProductionScenarioDraws, validateProductionTemplateRows, validateProductionScenarios, requiredProductionDefaultTemplate } from "./settings_helpers.js";
import { buildProductionSettingsProjection, collectProposalTemplateDetails } from "./storage_helpers.js";

export const getProductionProposalSettings = authenticatedQuery
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScope(ctx, args.workosOrganizationId);
    requireAnyRole(scope.roles, BACKOFFICE_ROLES);

    if (!scope.brokerage) {
      return {
        archetypes: [],
        brokerage: null,
        provisioningRequired: true,
        templates: [],
        workflowRules: [],
      };
    }

    return await buildProductionSettingsProjection(ctx, scope.brokerage);
  })
  .public();

export const saveProductionProposalTemplateConfiguration = authenticatedMutation
  .input({
    milestones: v.array(productionSettingsMilestoneInput),
    scenarios: v.array(productionSettingsScenarioInput),
    template: v.object({
      description: v.string(),
      isDefault: v.boolean(),
      summary: v.string(),
      templateKey: v.string(),
      title: v.string(),
    }),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    validateProductionTemplateRows(args.milestones);
    validateProductionScenarios(args.scenarios, args.milestones);

    const priorState = JSON.stringify(
      await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    );
    const now = Date.now();
    const templateId = await upsertProductionSettingsTemplate(ctx, {
      brokerageId: auth.brokerage._id,
      description: args.template.description,
      isDefault: args.template.isDefault,
      now,
      organizationId: args.workosOrganizationId,
      summary: args.template.summary,
      templateKey: args.template.templateKey,
      title: args.template.title,
    });
    await replaceProductionSettingsMilestones(ctx, {
      brokerageId: auth.brokerage._id,
      milestones: args.milestones,
      now,
      organizationId: args.workosOrganizationId,
      templateId,
    });
    await replaceProductionSettingsScenarios(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      scenarios: args.scenarios,
      templateId,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "saveProductionProposalTemplateConfiguration",
      entityId: args.template.templateKey,
      eventType: "production_settings.template_configuration_saved",
      newState: JSON.stringify({
        milestoneCount: args.milestones.filter((row) => row.included).length,
        scenarioCount: args.scenarios.length,
      }),
      organizationId: args.workosOrganizationId,
      priorState,
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const createProductionProposalTemplate = authenticatedMutation
  .input({
    milestones: v.array(productionSettingsMilestoneInput),
    scenarios: v.array(productionSettingsScenarioInput),
    template: v.object({
      description: v.string(),
      isDefault: v.boolean(),
      summary: v.string(),
      templateKey: v.string(),
      title: v.string(),
    }),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const templateKey = normalizeProductionTemplateKey(
      args.template.templateKey,
    );
    if (templateKey !== args.template.templateKey.trim()) {
      throw new Error(
        "Template key must be a lowercase slug using letters, numbers, and hyphens.",
      );
    }
    if (!args.template.title.trim()) {
      throw new Error("Template title is required.");
    }
    validateProductionTemplateRows(args.milestones);
    validateProductionScenarios(args.scenarios, args.milestones);

    const existing = await getProductionSettingsTemplate(
      ctx,
      auth.brokerage._id,
      templateKey,
    );
    if (existing) {
      throw new Error("Production template key already exists.");
    }

    const priorState = JSON.stringify({
      templateCount: (
        await collectProposalTemplateDetails(ctx, auth.brokerage._id)
      ).length,
    });
    const now = Date.now();
    const templateId = await upsertProductionSettingsTemplate(ctx, {
      brokerageId: auth.brokerage._id,
      description: args.template.description,
      isDefault: args.template.isDefault,
      now,
      organizationId: args.workosOrganizationId,
      summary: args.template.summary,
      templateKey,
      title: args.template.title,
    });
    await replaceProductionSettingsMilestones(ctx, {
      brokerageId: auth.brokerage._id,
      milestones: args.milestones,
      now,
      organizationId: args.workosOrganizationId,
      templateId,
    });
    await replaceProductionSettingsScenarios(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      scenarios: args.scenarios,
      templateId,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "createProductionProposalTemplate",
      entityId: templateKey,
      eventType: "production_settings.template_created",
      newState: JSON.stringify({
        milestoneCount: args.milestones.filter((row) => row.included).length,
        scenarioCount: args.scenarios.length,
        templateKey,
        title: args.template.title.trim(),
      }),
      organizationId: args.workosOrganizationId,
      priorState,
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const deleteProductionDrawScenario = authenticatedMutation
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const template = await getProductionSettingsTemplate(
      ctx,
      auth.brokerage._id,
      args.templateKey,
    );
    if (!template) {
      return await buildProductionSettingsProjection(ctx, auth.brokerage);
    }
    const scenario = await getProductionSettingsScenario(
      ctx,
      template._id,
      args.scenarioKey,
    );
    if (!scenario) {
      return await buildProductionSettingsProjection(ctx, auth.brokerage);
    }
    if (scenario.isActive) {
      throw new Error("Active scenario cannot be deleted.");
    }
    await deleteProductionScenarioDraws(ctx, template._id, args.scenarioKey);
    await ctx.db.patch(scenario._id, {
      status: "inactive",
      updatedAt: Date.now(),
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "deleteProductionDrawScenario",
      entityId: args.templateKey,
      eventType: "production_settings.scenario_deleted",
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify(scenario),
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const backfillProductionDefaultTemplates = authenticatedMutation
  .input({ workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const priorTemplates = await collectProposalTemplateDetails(
      ctx,
      auth.brokerage._id,
    );
    const result = await seedProductionDefaultTemplates(ctx, {
      brokerageId: auth.brokerage._id,
      now: Date.now(),
      organizationId: args.workosOrganizationId,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "backfillProductionDefaultTemplates",
      entityId: auth.brokerage._id,
      eventType: "production_settings.defaults_backfilled",
      newState: JSON.stringify(result),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({
        templateKeys: priorTemplates.map((template) => template.templateKey),
      }),
    });
    return {
      ...result,
      settings: await buildProductionSettingsProjection(ctx, auth.brokerage),
    };
  })
  .public();

export const resetProductionTemplateToDefaults = authenticatedMutation
  .input({ templateKey: v.string(), workosOrganizationId: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const seed = requiredProductionDefaultTemplate(args.templateKey);
    const priorState = JSON.stringify(
      await collectProposalTemplateDetails(ctx, auth.brokerage._id),
    );
    const now = Date.now();
    const templateId = await ensureProductionDefaultTemplate(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      template: seed,
    });
    await replaceProductionDefaultMilestones(ctx, {
      brokerageId: auth.brokerage._id,
      now,
      organizationId: args.workosOrganizationId,
      template: seed,
      templateId,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "resetProductionTemplateToDefaults",
      entityId: args.templateKey,
      eventType: "production_settings.template_reset",
      organizationId: args.workosOrganizationId,
      priorState,
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();

export const resetProductionDrawScenarioToDefaults = authenticatedMutation
  .input({
    scenarioKey: v.string(),
    templateKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProductionSettingsMutation(
      ctx,
      args.workosOrganizationId,
    );
    const seed = requiredProductionDefaultTemplate(args.templateKey);
    const scenario = seed.scenarios.find(
      (row) => row.scenarioKey === args.scenarioKey,
    );
    if (!scenario) {
      throw new Error("No default scenario exists for reset.");
    }
    const template = await getProductionSettingsTemplate(
      ctx,
      auth.brokerage._id,
      args.templateKey,
    );
    if (!template) {
      throw new Error("Production template is not provisioned.");
    }
    const now = Date.now();
    await ensureDrawScheduleScenario(ctx, {
      brokerageId: auth.brokerage._id,
      description: scenario.description,
      isActive: scenario.isActive,
      isDefault: scenario.isDefault,
      name: scenario.name,
      now,
      organizationId: args.workosOrganizationId,
      scenarioKey: scenario.scenarioKey,
      sortOrder: seed.scenarios.indexOf(scenario),
      templateId: template._id,
    });
    await replaceProductionScenarioDraws(ctx, {
      brokerageId: auth.brokerage._id,
      draws: scenario.draws,
      now,
      organizationId: args.workosOrganizationId,
      scenarioKey: scenario.scenarioKey,
      templateId: template._id,
    });
    await writeProductionSettingsEvent(ctx, {
      auth,
      command: "resetProductionDrawScenarioToDefaults",
      entityId: args.templateKey,
      eventType: "production_settings.scenario_reset",
      organizationId: args.workosOrganizationId,
      newState: JSON.stringify({ scenarioKey: scenario.scenarioKey }),
    });
    return await buildProductionSettingsProjection(ctx, auth.brokerage);
  })
  .public();
