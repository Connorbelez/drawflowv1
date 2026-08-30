/**
 * Production proposals proposal build cost bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { authorizeActiveBuildCostItemWrite, validateBuildCostItemSubmilestones, validateBuildCostItemBudgetTarget, nextBuildCostItemKey, getBuildCostItemOrThrow, activeBuildMaterialTarget, applyActiveBuildCostItemBudgetDelta, validateBuildMaintainedCostCoverage } from "./active_cost.js";
import { getActiveBuildMilestoneOrThrow } from "./active_planning.js";
import { productionCostItemCreateInput, productionBuildCostItemUpdateInput, activeBuildCostItemScopedMutationResult } from "./contracts_workflow.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { normalizeRequiredText, normalizeOptionalText, normalizeOptionalTiptapJson, validateCostItemDeliveryWindow, normalizeCostItemCost, normalizeCostItemQuantity, costItemTotalCents, normalizeCostItemBudgetTreatment, normalizeCostItemBudgetSubmilestoneKey } from "./proposal_cost_validation.js";
import { assertExpectedSubmilestoneRevision, requireScopedMaterialCommandInput, canonicalStringKeyList, canonicalOptionalSubmilestoneKey, materialScopedMutationReplay, canonicalCommandFingerprint, findSubmilestoneIdempotentAudit, insertSubmilestoneCommandReceipt } from "./submilestone_commands.js";

export const createActiveBuildCostItem = authenticatedMutation
  .input({
    ...productionCostItemCreateInput,
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(v.id("buildCostItems"), activeBuildCostItemScopedMutationResult))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildCostItemWrite(
      ctx,
      args.buildId,
      args.workosOrganizationId,
      "create",
      args.reason,
      { requireReason: false },
    );
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    const canonicalSubmilestoneKey = canonicalOptionalSubmilestoneKey(
      args.submilestoneKey,
    );
    const scopedSubmilestone = canonicalSubmilestoneKey !== undefined
      ? await activeBuildMaterialTarget(ctx, {
          buildId: args.buildId,
          milestone,
          submilestoneKey: canonicalSubmilestoneKey,
        })
      : undefined;
    const scopedMaterialCommand = scopedSubmilestone !== undefined;
    const scopedIdempotencyKey = scopedMaterialCommand
      ? requireScopedMaterialCommandInput(args)
      : undefined;
    const command = "createActiveBuildCostItem";
    const fingerprint = scopedMaterialCommand
      ? await canonicalCommandFingerprint(command, {
          ...args,
          relevantSubmilestoneKeys: canonicalStringKeyList(
            args.relevantSubmilestoneKeys,
          ),
          submilestoneKey: scopedSubmilestone.key,
        })
      : undefined;
    if (scopedMaterialCommand) {
      const existing = await findSubmilestoneIdempotentAudit(ctx, {
        command,
        fingerprint: fingerprint!,
        idempotencyKey: scopedIdempotencyKey!,
        submilestoneId: scopedSubmilestone._id,
      });
      if (existing) {
        return materialScopedMutationReplay(existing);
      }
      assertExpectedSubmilestoneRevision(
        scopedSubmilestone,
        args.expectedRevision!,
      );
    }
    const relevantSubmilestoneKeys = await validateBuildCostItemSubmilestones(
      ctx,
      milestone,
      args.relevantSubmilestoneKeys,
    );
    const scopedRelevantSubmilestoneKeys = scopedSubmilestone
      ? canonicalStringKeyList([
          ...relevantSubmilestoneKeys,
          scopedSubmilestone.key,
        ])
      : relevantSubmilestoneKeys;
    if (
      (args.budgetTreatment !== undefined && args.budgetTreatment !== "add") ||
      normalizeCostItemBudgetSubmilestoneKey(args.budgetSubmilestoneKey)
    ) {
      throw new Error(
        "Budget treatment and target can only be selected during proposal planning.",
      );
    }
    // Active-build cost items retain the historical additive behavior. Budget
    // treatment is selected during proposal planning and copied at closing.
    const budgetTreatment = "add" as const;
    const budgetSubmilestoneKey = undefined;
    const now = Date.now();
    const costCents = normalizeCostItemCost(args.costCents);
    const quantity = normalizeCostItemQuantity(args.quantity);
    const delivery = validateCostItemDeliveryWindow(args);
    const item = {
      brokerageId: auth.brokerage._id,
      budgetSubmilestoneKey,
      budgetTreatment,
      buildId: args.buildId,
      buildMilestoneId: milestone._id,
      costCents,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      deliveryEndDay: delivery.deliveryEndDay,
      deliveryInstructions: normalizeOptionalText(args.deliveryInstructions),
      deliveryLocation: normalizeOptionalText(args.deliveryLocation),
      deliveryStartDay: delivery.deliveryStartDay,
      description: normalizeOptionalText(args.description),
      itemKey: await nextBuildCostItemKey(ctx, args.buildId, args.title, now),
      itemType: args.itemType,
      milestoneKey: milestone.key,
      organizationId: args.workosOrganizationId,
      proposalId: auth.proposal._id,
      quantity,
      relevantSubmilestoneKeys: scopedRelevantSubmilestoneKeys,
      specificationTiptapJson: normalizeOptionalTiptapJson(
        args.specificationTiptapJson,
        "Material specification",
      ),
      supplier: normalizeOptionalText(args.supplier),
      title: normalizeRequiredText(args.title, "Cost item title"),
      unit: normalizeOptionalText(args.unit),
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    };
    const itemId = await ctx.db.insert("buildCostItems", item);
    const nextRevision = scopedSubmilestone
      ? (scopedSubmilestone.workflowRevision ?? 0) + 1
      : undefined;
    if (scopedSubmilestone && nextRevision !== undefined) {
      await ctx.db.patch(scopedSubmilestone._id, {
        updatedAt: now,
        workflowRevision: nextRevision,
      });
    }
    await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
      buildId: args.buildId,
      deltaCents: budgetTreatment === "add" ? costItemTotalCents(item) : 0,
      milestone,
      submilestoneKey: budgetSubmilestoneKey,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command,
      ...(scopedSubmilestone
        ? {
            entityId: String(scopedSubmilestone._id),
            entityType: "buildSubmilestone",
          }
        : {}),
      eventType: "active_build.cost_item.created",
      resourceType: "material",
      newState: JSON.stringify({
        ...item,
        _id: itemId,
        ...(nextRevision === undefined
          ? {}
          : {
              submilestoneKey: scopedSubmilestone?.key,
              workflowRevision: nextRevision,
            }),
      }),
      reason: args.reason,
    });
    if (scopedSubmilestone && nextRevision !== undefined) {
      const result = {
        itemId,
        replayed: false,
        revision: nextRevision,
      };
      await insertSubmilestoneCommandReceipt(ctx, {
        buildId: args.buildId,
        command,
        fingerprint: fingerprint!,
        idempotencyKey: scopedIdempotencyKey!,
        organizationId: auth.build.organizationId,
        result,
        submilestoneId: scopedSubmilestone._id,
      });
      return result;
    }
    return itemId;
  })
  .public();

export const updateActiveBuildCostItem = authenticatedMutation
  .input({
    ...productionBuildCostItemUpdateInput,
    buildId: v.id("activeBuilds"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(v.null(), activeBuildCostItemScopedMutationResult))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildCostItemWrite(
      ctx,
      args.buildId,
      args.workosOrganizationId,
      "update",
      args.reason,
    );
    const item = await getBuildCostItemOrThrow(ctx, args.buildId, args.itemId);
    const milestone =
      args.milestoneKey === undefined || args.milestoneKey === item.milestoneKey
        ? await ctx.db.get(item.buildMilestoneId)
        : await getActiveBuildMilestoneOrThrow(
            ctx,
            args.buildId,
            args.milestoneKey,
          );
    if (!milestone) {
      throw new Error("Production active-build milestone not found.");
    }
    const milestoneChanged = milestone._id !== item.buildMilestoneId;
    const canonicalSubmilestoneKey = canonicalOptionalSubmilestoneKey(
      args.submilestoneKey,
    );
    const scopedSubmilestone = canonicalSubmilestoneKey !== undefined
      ? await activeBuildMaterialTarget(ctx, {
          buildId: args.buildId,
          milestone,
          submilestoneKey: canonicalSubmilestoneKey,
        })
      : undefined;
    if (scopedSubmilestone && item && item.milestoneKey !== milestone.key) {
      throw new ConvexError({
        code: "MATERIAL_SCOPE_MISMATCH",
        message:
          "The material does not belong to the requested canonical Milestone scope.",
      });
    }
    const scopedMaterialCommand = scopedSubmilestone !== undefined;
    const scopedIdempotencyKey = scopedMaterialCommand
      ? requireScopedMaterialCommandInput(args)
      : undefined;
    const command = "updateActiveBuildCostItem";
    const fingerprint = scopedMaterialCommand
      ? await canonicalCommandFingerprint(command, {
          ...args,
          relevantSubmilestoneKeys:
            args.relevantSubmilestoneKeys === undefined
              ? undefined
              : canonicalStringKeyList(args.relevantSubmilestoneKeys),
          submilestoneKey: scopedSubmilestone.key,
        })
      : undefined;
    if (scopedMaterialCommand) {
      const existing = await findSubmilestoneIdempotentAudit(ctx, {
        command,
        fingerprint: fingerprint!,
        idempotencyKey: scopedIdempotencyKey!,
        submilestoneId: scopedSubmilestone._id,
      });
      if (existing) {
        return materialScopedMutationReplay(existing);
      }
      assertExpectedSubmilestoneRevision(
        scopedSubmilestone,
        args.expectedRevision!,
      );
    }
    const relevantSubmilestoneKeys =
      args.relevantSubmilestoneKeys === undefined && !milestoneChanged
        ? item.relevantSubmilestoneKeys
        : await validateBuildCostItemSubmilestones(
            ctx,
            milestone,
            args.relevantSubmilestoneKeys ?? [],
          );
    const scopedRelevantSubmilestoneKeys = scopedSubmilestone
      ? canonicalStringKeyList([
          ...relevantSubmilestoneKeys,
          scopedSubmilestone.key,
        ])
      : relevantSubmilestoneKeys;
    const budgetTreatment = normalizeCostItemBudgetTreatment(
      item.budgetTreatment,
    );
    const requestedBudgetSubmilestoneKey = item.budgetSubmilestoneKey;
    if (
      args.budgetTreatment !== undefined &&
      args.budgetTreatment !== budgetTreatment
    ) {
      throw new Error(
        "Budget treatment can only be changed during proposal planning.",
      );
    }
    if (
      args.budgetSubmilestoneKey !== undefined &&
      normalizeCostItemBudgetSubmilestoneKey(args.budgetSubmilestoneKey) !==
        normalizeCostItemBudgetSubmilestoneKey(requestedBudgetSubmilestoneKey)
    ) {
      throw new Error(
        "Budget sub-milestone target can only be changed during proposal planning.",
      );
    }
    const budgetSubmilestoneKey = await validateBuildCostItemBudgetTarget(
      ctx,
      milestone,
      requestedBudgetSubmilestoneKey,
      budgetTreatment,
    );
    const now = Date.now();
    const delivery = validateCostItemDeliveryWindow({
      deliveryEndDay:
        args.deliveryEndDay === undefined
          ? item.deliveryEndDay
          : args.deliveryEndDay,
      deliveryStartDay:
        args.deliveryStartDay === undefined
          ? item.deliveryStartDay
          : args.deliveryStartDay,
    });
    const patch = {
      budgetSubmilestoneKey,
      budgetTreatment,
      ...(args.costCents === undefined
        ? {}
        : { costCents: normalizeCostItemCost(args.costCents) }),
      ...(args.description === undefined
        ? {}
        : { description: normalizeOptionalText(args.description) }),
      ...(args.deliveryEndDay === undefined
        ? {}
        : { deliveryEndDay: delivery.deliveryEndDay }),
      ...(args.deliveryInstructions === undefined
        ? {}
        : {
            deliveryInstructions: normalizeOptionalText(
              args.deliveryInstructions,
            ),
          }),
      ...(args.deliveryLocation === undefined
        ? {}
        : { deliveryLocation: normalizeOptionalText(args.deliveryLocation) }),
      ...(args.deliveryStartDay === undefined
        ? {}
        : { deliveryStartDay: delivery.deliveryStartDay }),
      ...(args.itemType === undefined ? {} : { itemType: args.itemType }),
      ...(milestoneChanged
        ? {
            buildMilestoneId: milestone._id,
            milestoneKey: milestone.key,
          }
        : {}),
      ...(args.quantity === undefined
        ? {}
        : { quantity: normalizeCostItemQuantity(args.quantity) }),
      relevantSubmilestoneKeys: scopedRelevantSubmilestoneKeys,
      ...(args.supplier === undefined
        ? {}
        : { supplier: normalizeOptionalText(args.supplier) }),
      ...(args.specificationTiptapJson === undefined
        ? {}
        : {
            specificationTiptapJson: normalizeOptionalTiptapJson(
              args.specificationTiptapJson,
              "Material specification",
            ),
          }),
      ...(args.title === undefined
        ? {}
        : { title: normalizeRequiredText(args.title, "Cost item title") }),
      ...(args.unit === undefined
        ? {}
        : { unit: normalizeOptionalText(args.unit) }),
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    };
    const nextItem = { ...item, ...patch };
    await ctx.db.patch(item._id, patch);
    const priorTotal =
      normalizeCostItemBudgetTreatment(item.budgetTreatment) === "add"
        ? costItemTotalCents(item)
        : 0;
    const nextTotal =
      budgetTreatment === "add" ? costItemTotalCents(nextItem) : 0;
    let priorMilestoneForValidation = milestone;
    if (milestoneChanged) {
      const priorMilestone = await ctx.db.get(item.buildMilestoneId);
      if (!priorMilestone) {
        throw new Error("Production active-build milestone not found.");
      }
      priorMilestoneForValidation = priorMilestone;
      await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
        buildId: args.buildId,
        deltaCents: -priorTotal,
        milestone: priorMilestone,
        submilestoneKey: item.budgetSubmilestoneKey,
      });
      await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
        buildId: args.buildId,
        deltaCents: nextTotal,
        milestone,
        submilestoneKey: budgetSubmilestoneKey,
      });
    } else {
      if (item.budgetSubmilestoneKey === budgetSubmilestoneKey) {
        await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
          buildId: args.buildId,
          deltaCents: nextTotal - priorTotal,
          milestone,
          submilestoneKey: budgetSubmilestoneKey,
        });
      } else {
        await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
          buildId: args.buildId,
          deltaCents: -priorTotal,
          milestone,
          submilestoneKey: item.budgetSubmilestoneKey,
        });
        await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
          buildId: args.buildId,
          deltaCents: nextTotal,
          milestone,
          submilestoneKey: budgetSubmilestoneKey,
        });
      }
    }
    if (item.budgetSubmilestoneKey) {
      await validateBuildMaintainedCostCoverage(ctx, {
        buildId: args.buildId,
        milestoneId: priorMilestoneForValidation._id,
        submilestoneKey: item.budgetSubmilestoneKey,
      });
    }
    if (budgetSubmilestoneKey) {
      await validateBuildMaintainedCostCoverage(ctx, {
        buildId: args.buildId,
        milestoneId: milestone._id,
        submilestoneKey: budgetSubmilestoneKey,
      });
    }
    const nextRevision = scopedSubmilestone
      ? (scopedSubmilestone.workflowRevision ?? 0) + 1
      : undefined;
    if (scopedSubmilestone && nextRevision !== undefined) {
      await ctx.db.patch(scopedSubmilestone._id, {
        updatedAt: now,
        workflowRevision: nextRevision,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command,
      ...(scopedSubmilestone
        ? {
            entityId: String(scopedSubmilestone._id),
            entityType: "buildSubmilestone",
          }
        : {}),
      eventType: "active_build.cost_item.updated",
      resourceType: "material",
      newState: JSON.stringify({
        ...nextItem,
        ...(nextRevision === undefined
          ? {}
          : {
              submilestoneKey: scopedSubmilestone?.key,
              workflowRevision: nextRevision,
            }),
      }),
      priorState: JSON.stringify(item),
      reason: args.reason,
    });
    if (scopedSubmilestone && nextRevision !== undefined) {
      const result = {
        itemId: item._id,
        replayed: false,
        revision: nextRevision,
      };
      await insertSubmilestoneCommandReceipt(ctx, {
        buildId: args.buildId,
        command,
        fingerprint: fingerprint!,
        idempotencyKey: scopedIdempotencyKey!,
        organizationId: auth.build.organizationId,
        result,
        submilestoneId: scopedSubmilestone._id,
      });
      return result;
    }
    return null;
  })
  .public();

export const deleteActiveBuildCostItem = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    itemId: v.id("buildCostItems"),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    milestoneKey: v.optional(v.string()),
    reason: v.optional(v.string()),
    submilestoneKey: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(v.null(), activeBuildCostItemScopedMutationResult))
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildCostItemWrite(
      ctx,
      args.buildId,
      args.workosOrganizationId,
      "delete",
      args.reason,
    );
    const canonicalSubmilestoneKey = canonicalOptionalSubmilestoneKey(
      args.submilestoneKey,
    );
    const scopedMilestoneKey = args.milestoneKey?.trim();
    if (canonicalSubmilestoneKey !== undefined && !scopedMilestoneKey) {
      throw new ConvexError({
        code: "MILESTONE_KEY_REQUIRED",
        message:
          "A non-empty Milestone key is required for a scoped material command.",
      });
    }
    let item =
      canonicalSubmilestoneKey !== undefined
        ? undefined
        : await getBuildCostItemOrThrow(ctx, args.buildId, args.itemId);
    const milestone = item
      ? await ctx.db.get(item.buildMilestoneId)
      : await getActiveBuildMilestoneOrThrow(
          ctx,
          args.buildId,
          scopedMilestoneKey ?? args.milestoneKey!,
        );
    if (!milestone) {
      throw new Error("Production active-build milestone not found.");
    }
    const scopedSubmilestone = canonicalSubmilestoneKey !== undefined
      ? await activeBuildMaterialTarget(ctx, {
          buildId: args.buildId,
          milestone,
          submilestoneKey: canonicalSubmilestoneKey,
        })
      : undefined;
    if (scopedSubmilestone && item && item.milestoneKey !== milestone.key) {
      throw new ConvexError({
        code: "MATERIAL_SCOPE_MISMATCH",
        message:
          "The material does not belong to the requested canonical Milestone scope.",
      });
    }
    const scopedMaterialCommand = scopedSubmilestone !== undefined;
    const scopedIdempotencyKey = scopedMaterialCommand
      ? requireScopedMaterialCommandInput(args)
      : undefined;
    const command = "deleteActiveBuildCostItem";
    const fingerprint = scopedMaterialCommand
      ? await canonicalCommandFingerprint(command, {
          ...args,
          milestoneKey: milestone.key,
          submilestoneKey: scopedSubmilestone.key,
        })
      : undefined;
    if (scopedMaterialCommand) {
      const existing = await findSubmilestoneIdempotentAudit(ctx, {
        command,
        fingerprint: fingerprint!,
        idempotencyKey: scopedIdempotencyKey!,
        submilestoneId: scopedSubmilestone._id,
      });
      if (existing) {
        return materialScopedMutationReplay(existing);
      }
      assertExpectedSubmilestoneRevision(
        scopedSubmilestone,
        args.expectedRevision!,
      );
    }
    if (!item) {
      item = await getBuildCostItemOrThrow(ctx, args.buildId, args.itemId);
    }
    if (item.milestoneKey !== milestone.key) {
      throw new ConvexError({
        code: "MATERIAL_SCOPE_MISMATCH",
        message:
          "The material does not belong to the requested canonical Milestone scope.",
      });
    }
    await ctx.db.delete(item._id);
    await applyActiveBuildCostItemBudgetDelta(ctx, auth, {
      buildId: args.buildId,
      deltaCents:
        normalizeCostItemBudgetTreatment(item.budgetTreatment) === "add"
          ? -costItemTotalCents(item)
        : 0,
      milestone,
      submilestoneKey: item.budgetSubmilestoneKey,
    });
    const nextRevision = scopedSubmilestone
      ? (scopedSubmilestone.workflowRevision ?? 0) + 1
      : undefined;
    if (scopedSubmilestone && nextRevision !== undefined) {
      await ctx.db.patch(scopedSubmilestone._id, {
        updatedAt: Date.now(),
        workflowRevision: nextRevision,
      });
    }
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command,
      ...(scopedSubmilestone
        ? {
            entityId: String(scopedSubmilestone._id),
            entityType: "buildSubmilestone",
          }
        : {}),
      eventType: "active_build.cost_item.deleted",
      resourceType: "material",
      newState: JSON.stringify({
        itemId: item._id,
        ...(scopedSubmilestone === undefined
          ? {}
          : {
              submilestoneKey: scopedSubmilestone.key,
              workflowRevision: nextRevision,
            }),
      }),
      priorState: JSON.stringify({
        ...item,
        ...(scopedSubmilestone === undefined
          ? {}
          : { submilestoneKey: scopedSubmilestone.key }),
      }),
      reason: args.reason,
    });
    if (scopedSubmilestone && nextRevision !== undefined) {
      const result = {
        itemId: item._id,
        replayed: false,
        revision: nextRevision,
      };
      await insertSubmilestoneCommandReceipt(ctx, {
        buildId: args.buildId,
        command,
        fingerprint: fingerprint!,
        idempotencyKey: scopedIdempotencyKey!,
        organizationId: auth.build.organizationId,
        result,
        submilestoneId: scopedSubmilestone._id,
      });
      return result;
    }
    return null;
  })
  .public();
