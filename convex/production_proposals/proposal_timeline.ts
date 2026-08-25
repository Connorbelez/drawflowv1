/**
 * Production proposals proposal timeline bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { assertProposalCollaborationEditAllowed, pushProposalPlanningSnapshot } from "../proposal_collaboration_model";
import { type Doc } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { requireProposalAppPermission } from "./builder_staff_access.js";
import { requireBackofficeProposalWrite, requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES, submilestoneInput } from "./contracts_foundation.js";
import { productionTimelineMilestoneInput, productionCostItemCreateInput, productionCostItemUpdateInput } from "./contracts_workflow.js";
import { getProductionMilestoneOrThrow, writeProposalEvent } from "./proposal_copy_audit.js";
import { insertProductionMilestoneFromInput, replaceProductionSubmilestones, upsertProposalMilestoneDrawAvailability, deleteProductionMilestoneCascade, recalculateProposalBudget } from "./proposal_cost_persistence.js";
import { normalizeRequiredText, normalizeOptionalText, normalizeOptionalTiptapJson, validateCostItemDeliveryWindow, normalizeCostItemCost, normalizeCostItemQuantity, costItemTotalCents, normalizeCostItemBudgetTreatment, proposalCostItemAuditWarnings, validateProposalCostItemSubmilestones, validateProposalCostItemBudgetTarget, nextProposalCostItemKey, getProposalCostItemOrThrow, getProposalMilestoneByIdOrThrow, applyProposalCostItemBudgetChange } from "./proposal_cost_validation.js";
import { normalizeProductionMilestoneSchedule, assertValidProductionSubmilestones, sumProductionSubmilestoneBudgetCents } from "./proposal_draft_model.js";
import { requireReason, calculateDrawAvailability, ensureProposalApprovedAmountCoversDrawSchedule, requireProductionTimelineDraftStructureWrite, authorizeProposalCostItemWrite } from "./proposal_lender_approval.js";

export const updateSubmittedProposalDrawScheduleRow = authenticatedMutation
  .input({
    amountCents: v.optional(v.number()),
    drawKey: v.string(),
    label: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    reason: v.string(),
    timingDay: v.optional(v.number()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    requireAnyRole(auth.roles, BACKOFFICE_ROLES);
    requireBackofficeProposalWrite(auth, auth.proposal);
    await assertProposalCollaborationEditAllowed(ctx, auth);
    requireReason(args.reason);
    if (!["submitted", "approved"].includes(auth.proposal.status)) {
      throw new Error(
        "Only submitted or approved proposal draw schedules can be edited.",
      );
    }
    if (args.amountCents !== undefined && args.amountCents < 0) {
      throw new Error("Draw amount cannot be negative.");
    }
    if (args.timingDay !== undefined && args.timingDay < 0) {
      throw new Error("Draw timing day cannot be negative.");
    }

    const draw = await ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal_key", (q) =>
        q.eq("proposalId", args.proposalId).eq("drawKey", args.drawKey),
      )
      .unique();
    if (!draw) {
      throw new Error("Draw schedule row not found.");
    }

    const priorState = JSON.stringify({
      amountCents: draw.amountCents,
      label: draw.label,
      timingDay: draw.timingDay,
    });
    const now = Date.now();
    const patch = {
      amountCents: args.amountCents ?? draw.amountCents,
      label: args.label?.trim() || draw.label,
      timingDay: args.timingDay ?? draw.timingDay,
      updatedAt: now,
    };
    await ctx.db.patch(draw._id, patch);
    await ctx.db.patch(args.proposalId, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await ensureProposalApprovedAmountCoversDrawSchedule(ctx, auth.proposal, {
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "updateSubmittedProposalDrawScheduleRow",
      eventType: "proposal.draw_schedule.updated",
      newState: JSON.stringify({
        amountCents: patch.amountCents,
        label: patch.label,
        timingDay: patch.timingDay,
      }),
      priorState,
      proposalId: args.proposalId,
      reason: args.reason,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProductionTimelineMilestone = authenticatedMutation
  .input({
    milestone: productionTimelineMilestoneInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineDraftStructureWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "milestone", "create");
    if ((args.milestone.submilestones ?? []).length > 0) {
      await requireProposalAppPermission(ctx, auth, "submilestone", "create");
    }
    const milestoneId = await insertProductionMilestoneFromInput(
      ctx,
      auth,
      args.milestone,
    );
    const milestone = await ctx.db.get(milestoneId);
    if (milestone) {
      await upsertProposalMilestoneDrawAvailability(ctx, auth, {
        amountCents: milestone.drawAvailabilityCents,
        drawKey: args.milestone.drawKey,
        milestone,
        proposalId: args.proposalId,
        timingDay: Math.max(
          Math.round(args.milestone.dayEnd),
          Math.round(args.milestone.dayStart),
        ),
      });
    }
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "createProductionTimelineMilestone",
      eventType: "proposal.milestone.created",
      newState: JSON.stringify(args.milestone),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const updateProductionTimelineMilestone = authenticatedMutation
  .input({
    budgetCents: v.optional(v.number()),
    dayEnd: v.optional(v.number()),
    dayStart: v.optional(v.number()),
    dependencyKeys: v.optional(v.array(v.string())),
    drawAvailabilityCents: v.optional(v.number()),
    durationDays: v.optional(v.number()),
    evidenceState: v.optional(v.string()),
    icon: v.optional(v.string()),
    lane: v.optional(v.number()),
    markerLabel: v.optional(v.string()),
    milestoneKey: v.string(),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
    policyState: v.optional(v.string()),
    proposalId: v.id("buildProposals"),
    status: v.optional(v.string()),
    submilestones: v.optional(v.array(submilestoneInput)),
    tone: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineDraftStructureWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "milestone", "update");
    if (args.submilestones !== undefined) {
      await requireProposalAppPermission(ctx, auth, "submilestone", "update");
    }
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const nextDayStart = Math.round(args.dayStart ?? milestone.dayStart);
    if (nextDayStart < 0) {
      throw new Error("Milestone start day must be on or after T0.");
    }
    const existingDurationDays = Math.max(
      1,
      Math.round(
        milestone.durationDays ?? milestone.dayEnd - milestone.dayStart,
      ),
    );
    const nextRequestedDurationDays =
      args.durationDays ??
      (args.dayStart !== undefined && args.dayEnd === undefined
        ? existingDurationDays
        : undefined);
    const nextDayEnd = Math.round(
      args.dayEnd ??
        (nextRequestedDurationDays === undefined
          ? milestone.dayEnd
          : nextDayStart + nextRequestedDurationDays),
    );
    if (nextDayEnd < 0) {
      throw new Error("Milestone end day must be on or after T0.");
    }
    if (nextDayEnd < nextDayStart && nextRequestedDurationDays === undefined) {
      throw new Error("Milestone end day must be after start day.");
    }
    const dayStartDelta = nextDayStart - Math.round(milestone.dayStart);
    const existingSubmilestones = (await ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_milestone", (q) =>
        q.eq("proposalMilestoneId", milestone._id),
      )
      .collect()) as Doc<"proposalSubmilestones">[];
    const schedule = normalizeProductionMilestoneSchedule({
      dayEnd: nextDayEnd,
      dayStart: nextDayStart,
      durationDays: nextRequestedDurationDays,
      submilestones:
        args.submilestones === undefined
          ? existingSubmilestones.map((submilestone) => ({
              budgetCents: submilestone.budgetCents,
              durationDays: submilestone.durationDays,
              key: submilestone.key,
              name: submilestone.name,
              order: submilestone.order,
              startDay:
                submilestone.startDay === undefined
                  ? undefined
                  : Math.max(
                      0,
                      Math.round(submilestone.startDay + dayStartDelta),
                    ),
            }))
          : args.submilestones,
    });
    if (
      args.submilestones !== undefined &&
      schedule.submilestones.length > 0
    ) {
      assertValidProductionSubmilestones(
        schedule.submilestones,
        `Milestone ${milestone.key}`,
      );
    }
    const budgetDerivedFromSubmilestones =
      args.submilestones !== undefined && schedule.submilestones.length > 0;
    const unscopedAdditiveCostCents = budgetDerivedFromSubmilestones
      ? (
          await ctx.db
            .query("proposalCostItems")
            .withIndex("by_milestone", (q) =>
              q.eq("proposalMilestoneId", milestone._id),
            )
            .collect()
        ).reduce(
          (total, item) =>
            normalizeCostItemBudgetTreatment(item.budgetTreatment) === "add" &&
            !item.budgetSubmilestoneKey
              ? total + costItemTotalCents(item)
              : total,
          0,
        )
      : 0;
    const nextBudgetCents = budgetDerivedFromSubmilestones
      ? sumProductionSubmilestoneBudgetCents(schedule.submilestones) +
        unscopedAdditiveCostCents
      : args.budgetCents === undefined
        ? milestone.budgetCents
        : Math.max(0, Math.round(args.budgetCents));
    const now = Date.now();
    const nextDrawAvailabilityCents =
      args.drawAvailabilityCents === undefined
        ? calculateDrawAvailability(
            nextBudgetCents,
            auth.proposal.borrowerCoPayBps,
          )
        : Math.max(0, Math.round(args.drawAvailabilityCents));
    const patch = {
      ...(args.budgetCents === undefined && !budgetDerivedFromSubmilestones
        ? {}
        : { budgetCents: nextBudgetCents }),
      ...(args.dayEnd === undefined ? {} : { dayEnd: Math.round(args.dayEnd) }),
      ...(args.dayStart === undefined
        ? {}
        : { dayStart: Math.round(args.dayStart) }),
      ...(args.dependencyKeys === undefined
        ? {}
        : { dependencyKeys: args.dependencyKeys }),
      ...(args.drawAvailabilityCents === undefined &&
      args.budgetCents === undefined &&
      !budgetDerivedFromSubmilestones
        ? {}
        : { drawAvailabilityCents: nextDrawAvailabilityCents }),
      ...(args.durationDays === undefined
        ? {}
        : { durationDays: Math.max(1, Math.round(args.durationDays)) }),
      ...(args.evidenceState === undefined
        ? {}
        : { evidenceState: args.evidenceState }),
      ...(args.icon === undefined ? {} : { icon: args.icon }),
      ...(args.lane === undefined ? {} : { lane: args.lane }),
      ...(args.markerLabel === undefined
        ? {}
        : { markerLabel: args.markerLabel }),
      ...(args.name === undefined
        ? {}
        : { name: args.name.trim() || milestone.name }),
      ...(args.order === undefined
        ? {}
        : { order: Math.max(1, Math.round(args.order)) }),
      ...(args.policyState === undefined
        ? {}
        : { policyState: args.policyState }),
      ...(args.status === undefined ? {} : { timelineStatus: args.status }),
      ...(args.tone === undefined ? {} : { tone: args.tone }),
      updatedAt: now,
    };
    Object.assign(patch, {
      dayEnd: schedule.dayEnd,
      dayStart: schedule.dayStart,
      durationDays: schedule.durationDays,
    });
    await ctx.db.patch(milestone._id, patch);
    if (args.submilestones !== undefined || dayStartDelta !== 0) {
      await replaceProductionSubmilestones(ctx, auth, {
        milestone,
        proposalId: args.proposalId,
        rejectEmpty: args.submilestones !== undefined,
        rows: schedule.submilestones,
      });
    }
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProductionTimelineMilestone",
      eventType: "proposal.milestone.updated",
      newState: JSON.stringify(patch),
      priorState: JSON.stringify(milestone),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProductionTimelineMilestone = authenticatedMutation
  .input({
    milestoneKey: v.string(),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    await requireProductionTimelineDraftStructureWrite(ctx, auth);
    await requireProposalAppPermission(ctx, auth, "milestone", "delete");
    await requireProposalAppPermission(ctx, auth, "submilestone", "delete");
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    await deleteProductionMilestoneCascade(ctx, args.proposalId, milestone);
    await recalculateProposalBudget(ctx, auth, args.proposalId);
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProductionTimelineMilestone",
      eventType: "proposal.milestone.deleted",
      priorState: JSON.stringify(milestone),
      proposalId: args.proposalId,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const createProposalCostItem = authenticatedMutation
  .input({
    ...productionCostItemCreateInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("proposalCostItems"))
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalCostItemWrite(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      "create",
      args.reason,
    );
    const milestone = await getProductionMilestoneOrThrow(
      ctx,
      args.proposalId,
      args.milestoneKey,
    );
    const relevantSubmilestoneKeys =
      await validateProposalCostItemSubmilestones(
        ctx,
        milestone,
        args.relevantSubmilestoneKeys,
      );
    const budgetTreatment = normalizeCostItemBudgetTreatment(
      args.budgetTreatment,
    );
    const budgetSubmilestoneKey = await validateProposalCostItemBudgetTarget(
      ctx,
      milestone,
      args.budgetSubmilestoneKey,
      budgetTreatment,
      args.budgetTreatment !== undefined,
    );
    const now = Date.now();
    const costCents = normalizeCostItemCost(args.costCents);
    const quantity = normalizeCostItemQuantity(args.quantity);
    const delivery = validateCostItemDeliveryWindow(args);
    const item = {
      brokerageId: auth.brokerage._id,
      budgetSubmilestoneKey,
      budgetTreatment,
      costCents,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      deliveryEndDay: delivery.deliveryEndDay,
      deliveryInstructions: normalizeOptionalText(args.deliveryInstructions),
      deliveryLocation: normalizeOptionalText(args.deliveryLocation),
      deliveryStartDay: delivery.deliveryStartDay,
      description: normalizeOptionalText(args.description),
      itemKey: await nextProposalCostItemKey(
        ctx,
        args.proposalId,
        args.title,
        now,
      ),
      itemType: args.itemType,
      milestoneKey: milestone.key,
      organizationId: args.workosOrganizationId,
      proposalId: args.proposalId,
      proposalMilestoneId: milestone._id,
      quantity,
      relevantSubmilestoneKeys,
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
    const itemId = await ctx.db.insert("proposalCostItems", item);
    await applyProposalCostItemBudgetChange(ctx, auth, {
      nextItem: { ...item, _id: itemId },
      proposalId: args.proposalId,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "createProposalCostItem",
      eventType: "proposal.cost_item.created",
      newState: JSON.stringify({ ...item, _id: itemId }),
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: proposalCostItemAuditWarnings(auth.proposal),
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return itemId;
  })
  .public();

export const updateProposalCostItem = authenticatedMutation
  .input({
    ...productionCostItemUpdateInput,
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalCostItemWrite(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      "update",
      args.reason,
    );
    const item = await getProposalCostItemOrThrow(
      ctx,
      args.proposalId,
      args.itemId,
    );
    const milestone =
      args.milestoneKey === undefined || args.milestoneKey === item.milestoneKey
        ? await getProposalMilestoneByIdOrThrow(ctx, item.proposalMilestoneId)
        : await getProductionMilestoneOrThrow(
            ctx,
            args.proposalId,
            args.milestoneKey,
          );
    const milestoneChanged = milestone._id !== item.proposalMilestoneId;
    const relevantSubmilestoneKeys =
      args.relevantSubmilestoneKeys === undefined && !milestoneChanged
        ? item.relevantSubmilestoneKeys
        : await validateProposalCostItemSubmilestones(
            ctx,
            milestone,
            args.relevantSubmilestoneKeys ?? [],
          );
    const budgetTreatment = normalizeCostItemBudgetTreatment(
      args.budgetTreatment ?? item.budgetTreatment,
    );
    const requestedBudgetSubmilestoneKey =
      args.budgetSubmilestoneKey === undefined
        ? milestoneChanged
          ? undefined
          : item.budgetSubmilestoneKey
        : args.budgetSubmilestoneKey;
    const budgetSubmilestoneKey = await validateProposalCostItemBudgetTarget(
      ctx,
      milestone,
      requestedBudgetSubmilestoneKey,
      budgetTreatment,
      budgetTreatment === "add" &&
        (args.budgetTreatment !== undefined ||
          args.budgetSubmilestoneKey !== undefined ||
          item.budgetSubmilestoneKey !== undefined),
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
            milestoneKey: milestone.key,
            proposalMilestoneId: milestone._id,
          }
        : {}),
      ...(args.quantity === undefined
        ? {}
        : { quantity: normalizeCostItemQuantity(args.quantity) }),
      relevantSubmilestoneKeys,
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
    await applyProposalCostItemBudgetChange(ctx, auth, {
      nextItem,
      priorItem: item,
      proposalId: args.proposalId,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "updateProposalCostItem",
      eventType: "proposal.cost_item.updated",
      newState: JSON.stringify(nextItem),
      priorState: JSON.stringify(item),
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: proposalCostItemAuditWarnings(auth.proposal),
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();

export const deleteProposalCostItem = authenticatedMutation
  .input({
    itemId: v.id("proposalCostItems"),
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposalCostItemWrite(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      "delete",
      args.reason,
    );
    const item = await getProposalCostItemOrThrow(
      ctx,
      args.proposalId,
      args.itemId,
    );
    await ctx.db.delete(item._id);
    await applyProposalCostItemBudgetChange(ctx, auth, {
      priorItem: item,
      proposalId: args.proposalId,
    });
    await writeProposalEvent(ctx, {
      auth,
      command: "deleteProposalCostItem",
      eventType: "proposal.cost_item.deleted",
      priorState: JSON.stringify(item),
      proposalId: args.proposalId,
      reason: args.reason,
      warnings: proposalCostItemAuditWarnings(auth.proposal),
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    return null;
  })
  .public();
