import { ConvexError, v } from "convex/values";

import { type ActiveBuildAuthorization } from "../activeBuildAccess";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_DRAFT_MATERIAL_LINES,
  MAX_DRAFT_RECIPIENTS,
  MAX_MATERIAL_ASSIGNMENTS_PER_ROW,
  MAX_TOTAL_MATERIAL_ASSIGNMENTS,
  MAX_DISTINCT_MATERIAL_SUBMILESTONES,
  MAX_CURRENT_PERMIT_CANDIDATES,
  MAX_TIPTAP_JSON_LENGTH,
  MATERIAL_ROW_KEY_PATTERN,
  type DraftMaterialRowInput,
  type NormalizedAdHocMaterialRow,
  type EffectiveQuoteScope,
  type DraftState,
  type QuoteScopeCache,
} from "./contracts";
import {
  requiredText,
  optionalText,
  requiredFiniteNumber,
  requiredInteger,
  normalizeTiptapJson,
  rowKey,
  normalizedAdHocMaterialRow,
  requireBuildCostItemSourceId,
  assertAdHocSourceInput,
  capabilityRequirement,
  profileCapabilities,
  validateMaterialAssignments,
  assertAggregateMaterialAssignments,
  assertDistinctMaterialSubmilestones,
  requireBuildSubmilestone,
  quoteScopeForBuildSubmilestoneCached,
  draftScopePinMatches,
  packageScopePinMatches,
} from "./access";

export async function requireBuildCostItem(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  id: Id<"buildCostItems">
) {
  const item = await ctx.db.get(id);
  if (
    !item ||
    item.buildId !== authorization.build._id ||
    item.proposalId !== authorization.proposal._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id ||
    item.itemType !== "material"
  ) {
    throw new ConvexError("Material Cost Item is unavailable for this Build.");
  }
  return item;
}

export function materialFieldsFromSource(input: {
  deliveryEndDay?: number;
  deliveryInstructions?: string;
  deliveryLocation?: string;
  deliveryStartDay?: number;
  description?: string;
  quantity?: number;
  specificationTiptapJson?: string;
  title?: string;
  unit?: string;
}) {
  const deliveryStartDay = requiredInteger(
    input.deliveryStartDay,
    "Delivery start day"
  );
  const deliveryEndDay = requiredInteger(
    input.deliveryEndDay,
    "Delivery end day"
  );
  if (deliveryEndDay < deliveryStartDay) {
    throw new ConvexError(
      "Delivery end day cannot precede delivery start day."
    );
  }
  return {
    deliveryEndDay,
    deliveryInstructions: requiredText(
      input.deliveryInstructions,
      "Delivery instructions",
      4000
    ),
    deliveryLocation: requiredText(
      input.deliveryLocation,
      "Delivery location",
      500
    ),
    deliveryStartDay,
    description: optionalText(input.description, "Material description", 4000),
    quantity: requiredFiniteNumber(input.quantity, "Material quantity"),
    specificationTiptapJson: normalizeTiptapJson(
      input.specificationTiptapJson,
      "Material specification"
    ),
    title: requiredText(input.title, "Material title", 240),
    unit: requiredText(input.unit, "Material unit", 80),
  };
}

export async function validateDraftMaterialRows(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  rows: DraftMaterialRowInput[]
) {
  if (rows.length > MAX_DRAFT_MATERIAL_LINES) {
    throw new ConvexError("A Quote Round supports at most 100 Material rows.");
  }
  assertAggregateMaterialAssignments(
    rows.reduce((total, row) => total + row.assignedSubmilestoneIds.length, 0)
  );
  const keys = new Set<string>();
  const materialAssignmentIds = new Set<Id<"buildSubmilestones">>();
  const sourceCostItemIds = new Set<Id<"buildCostItems">>();
  const normalized: Array<{
    assignments: Id<"buildSubmilestones">[];
    input: DraftMaterialRowInput;
    normalizedAdHoc?: NormalizedAdHocMaterialRow;
  }> = [];
  for (const candidate of rows) {
    const key = rowKey(candidate.rowKey);
    if (keys.has(key)) {
      throw new ConvexError("Material row keys must be unique.");
    }
    keys.add(key);
    const assignments = validateMaterialAssignments(
      candidate.assignedSubmilestoneIds
    );
    for (const assignmentId of assignments) {
      materialAssignmentIds.add(assignmentId);
    }
    if (candidate.source === "build_cost_item") {
      const sourceBuildCostItemId = requireBuildCostItemSourceId(candidate);
      sourceCostItemIds.add(sourceBuildCostItemId);
      normalized.push({ assignments, input: { ...candidate, rowKey: key } });
      continue;
    }
    assertAdHocSourceInput(candidate);
    normalized.push({
      assignments,
      input: { ...candidate, rowKey: key },
      normalizedAdHoc: normalizedAdHocMaterialRow({
        ...candidate,
        rowKey: key,
      }),
    });
  }
  assertDistinctMaterialSubmilestones(materialAssignmentIds.size);
  await Promise.all([
    ...[...materialAssignmentIds].map((id) =>
      requireBuildSubmilestone(ctx, authorization, id)
    ),
    ...[...sourceCostItemIds].map((id) =>
      requireBuildCostItem(ctx, authorization, id)
    ),
  ]);
  return normalized;
}

export async function validateRecipients(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  mode: Doc<"quoteRounds">["mode"],
  recipientProfileIds: Id<"contractorProfiles">[]
) {
  if (recipientProfileIds.length > MAX_DRAFT_RECIPIENTS) {
    throw new ConvexError("A Quote Round supports at most 100 recipients.");
  }
  if (
    new Set(recipientProfileIds.map(String)).size !== recipientProfileIds.length
  ) {
    throw new ConvexError("Quote Round recipients must be unique.");
  }
  const requiredCapabilities = capabilityRequirement(mode);
  return await Promise.all(
    recipientProfileIds.map(async (recipientProfileId) => {
      const profile = await ctx.db.get(recipientProfileId);
      if (
        !profile ||
        profile.status !== "active" ||
        profile.organizationId !== authorization.organizationId ||
        profile.brokerageId !== authorization.brokerage._id
      ) {
        throw new ConvexError(
          "Quote recipient is unavailable for this organization."
        );
      }
      const email = requiredText(
        profile.email,
        "Quote recipient email",
        320
      ).toLowerCase();
      const capabilities = profileCapabilities(profile);
      if (
        !requiredCapabilities.every((capability) =>
          capabilities.includes(capability)
        )
      ) {
        throw new ConvexError(
          "Quote recipient does not have the required capability for this Quote Round mode."
        );
      }
      return {
        capabilities,
        email,
        profile,
      };
    })
  );
}
