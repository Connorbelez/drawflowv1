/**
 * Production proposals active build staff bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { authenticatedAction, authenticatedMutation, authenticatedQuery } from "../authz";
import { internalMutation } from "../fluent";
import { type Doc } from "../types";
import { authorizeActiveBuildForViewer, authorizeActiveBuildOrThrow } from "./authorization_core.js";
import { type BuilderStaffPermissionResource, viewerFromBuilderStaffProvisionActor, normalizeBuilderStaffEmail, requireBuilderStaffManagementAllowed } from "./builder_staff_access.js";
import { buildStaffPermissionDirectory, saveBuilderStaffPermissionScope, removeBuilderStaffMember } from "./builder_staff_persistence.js";
import { type BuilderStaffProvisionResult, ACTIVE_BUILD_AUDIT_RESOURCE_TYPES } from "./contracts_foundation.js";
import { builderStaffPermissionGrantInput, builderStaffProvisionActorInput, builderStaffProvisionResult } from "./contracts_workflow.js";

export function resolveAuditCanonicalSubmilestone(
  event: Pick<
    Doc<"auditEvents">,
    "entityType" | "entityId" | "newState" | "priorState"
  >,
  submilestoneById: Map<string, Doc<"buildSubmilestones">>,
) {
  if (
    (event.entityType === "buildSubmilestone" ||
      event.entityType === "submilestone") &&
    submilestoneById.has(event.entityId)
  ) {
    return submilestoneById.get(event.entityId);
  }
  if (event.entityType !== "buildSiteVisit" && event.entityType !== "siteVisit") {
    return undefined;
  }
  for (const state of [event.newState, event.priorState]) {
    if (!state) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(state);
      if (!parsed || typeof parsed !== "object") {
        continue;
      }
      const candidate =
        (parsed as Record<string, unknown>).submilestoneId ??
        (parsed as Record<string, unknown>).buildSubmilestoneId;
      if (typeof candidate === "string" && submilestoneById.has(candidate)) {
        return submilestoneById.get(candidate);
      }
    } catch {
      // Legacy audit payloads without valid JSON remain parent-scoped.
    }
  }
  return undefined;
}

export function auditEventHasSubmilestoneScope(
  event: Pick<Doc<"auditEvents">, "newState" | "priorState">,
) {
  for (const state of [event.newState, event.priorState]) {
    if (!state) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(state);
      if (!parsed || typeof parsed !== "object") {
        continue;
      }
      const submilestoneKeys = (parsed as Record<string, unknown>)
        .submilestoneKeys;
      if (Array.isArray(submilestoneKeys) && submilestoneKeys.length > 0) {
        return true;
      }
      const submilestoneIds = (parsed as Record<string, unknown>)
        .submilestoneIds;
      if (Array.isArray(submilestoneIds) && submilestoneIds.length > 0) {
        return true;
      }
    } catch {
      // Legacy audit payloads without valid JSON remain parent-scoped.
    }
  }
  return false;
}

export function productionSubmilestoneAuditTab(event: {
  command?: string;
  eventType: string;
}) {
  const signal = `${event.command ?? ""} ${event.eventType}`.toLowerCase();
  if (signal.includes("evidence") || signal.includes("photo")) {
    return "evidence" as const;
  }
  if (
    signal.includes("review") ||
    signal.includes("site_visit") ||
    signal.includes("approval")
  ) {
    return "review" as const;
  }
  if (signal.includes("assign") || signal.includes("contractor")) {
    return "people" as const;
  }
  if (signal.includes("material") || signal.includes("cost")) {
    return "materials" as const;
  }
  if (signal.includes("collaboration") || signal.includes("comment")) {
    return "collaboration" as const;
  }
  return "overview" as const;
}

export type ActiveBuildAuditResourceType =
  (typeof ACTIVE_BUILD_AUDIT_RESOURCE_TYPES)[number];

export function activeBuildAuditPermissionResource(
  resourceType: string,
): BuilderStaffPermissionResource | undefined {
  switch (resourceType) {
    case "activeBuild":
    case "buildMilestone":
    case "milestone":
      return "milestone";
    case "buildSubmilestone":
    case "submilestone":
      return "submilestone";
    case "activeBuildDrawRequest":
    case "draw":
    case "plannedDrawScheduleRow":
      return "draw";
    case "buildEvidenceAsset":
    case "evidence":
    case "evidencePackage":
    case "buildSiteVisit":
    case "siteVisit":
      return "evidence";
    case "material":
    case "buildCostItem":
      return "material";
    case "contractor":
      return "contractor";
    case "capitalEvent":
      return "capitalEvent";
    case "reminder":
      return "reminder";
    default:
      return undefined;
  }
}

export function activeBuildAuditResourceType(
  resourceType: string | undefined,
): BuilderStaffPermissionResource | undefined {
  if (!resourceType) {
    return undefined;
  }
  return activeBuildAuditPermissionResource(resourceType);
}

export function deriveActiveBuildAuditResourceType(input: {
  entityType?: string;
  eventType: string;
  command: string;
}): ActiveBuildAuditResourceType {
  const entityType = input.entityType;
  if (
    entityType === "buildSubmilestone" ||
    entityType === "submilestone"
  ) {
    return "submilestone";
  }
  if (
    entityType === "activeBuildDrawRequest" ||
    entityType === "draw" ||
    entityType === "plannedDrawScheduleRow"
  ) {
    return "draw";
  }
  if (
    entityType === "buildEvidenceAsset" ||
    entityType === "evidence" ||
    entityType === "evidencePackage"
  ) {
    return "evidence";
  }
  if (
    entityType === "buildSiteVisit" ||
    entityType === "siteVisit"
  ) {
    return "siteVisit";
  }
  if (entityType === "buildCostItem" || entityType === "material") {
    return "material";
  }
  if (entityType === "contractor") {
    return "contractor";
  }
  if (entityType === "capitalEvent") {
    return "capitalEvent";
  }
  if (entityType === "reminder") {
    return "reminder";
  }
  const signal = `${input.eventType} ${input.command}`.toLowerCase();
  if (signal.includes("site_visit") || signal.includes("site visit")) {
    return "siteVisit";
  }
  if (signal.includes("draw")) {
    return "draw";
  }
  if (signal.includes("evidence") || signal.includes("photo")) {
    return "evidence";
  }
  if (signal.includes("material") || signal.includes("cost_item")) {
    return "material";
  }
  if (signal.includes("assign") || signal.includes("contractor")) {
    return "contractor";
  }
  if (signal.includes("capital")) {
    return "capitalEvent";
  }
  if (signal.includes("reminder")) {
    return "reminder";
  }
  return "milestone";
}

export const listActiveBuildBuilderStaffPermissions = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireBuilderStaffManagementAllowed(
      ctx,
      auth,
      auth.build.builderProfileId,
    );
    return await buildStaffPermissionDirectory(ctx, {
      auth,
      buildId: args.buildId,
      builderProfileId: auth.build.builderProfileId,
      proposalId: auth.proposal._id,
      scope: "activeBuild",
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .public();

export const saveActiveBuildBuilderStaffPermissions = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    permissions: v.array(builderStaffPermissionGrantInput),
    staffEmail: v.optional(v.string()),
    staffWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireBuilderStaffManagementAllowed(
      ctx,
      auth,
      auth.build.builderProfileId,
    );
    await saveBuilderStaffPermissionScope(ctx, {
      auth,
      buildId: args.buildId,
      builderProfileId: auth.build.builderProfileId,
      permissions: args.permissions,
      proposalId: auth.proposal._id,
      scope: "activeBuild",
      staffEmail: args.staffEmail,
      staffWorkosUserId: args.staffWorkosUserId,
      workosOrganizationId: args.workosOrganizationId,
    });
    return null;
  })
  .public();

export const provisionActiveBuildBuilderStaffPermissions = authenticatedAction
  .input({
    buildId: v.id("activeBuilds"),
    permissions: v.array(builderStaffPermissionGrantInput),
    staffEmail: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(builderStaffProvisionResult)
  .handler(async (ctx, args): Promise<BuilderStaffProvisionResult> => {
    const staffEmail = normalizeBuilderStaffEmail(args.staffEmail);
    if (!staffEmail) {
      throw new Error("A valid staff email is required.");
    }
    const provisioning: {
      adapter: string;
      invitationId?: string;
      membershipId: string;
      operation: "provisionBuilderStaffUser";
      status: string;
      sync: string;
      userId: string;
    } = await ctx.runAction(
      internal.workosManagement.provisionBuilderStaffUser,
      {
        email: staffEmail,
        organizationId: args.workosOrganizationId,
      },
    );
    const staffWorkosUserId: string = await ctx.runMutation(
      internal.production_proposals.finalizeActiveBuildBuilderStaffProvisioning,
      {
        actor: {
          organizationId: ctx.viewer.organizationId,
          roles: ctx.viewer.roles,
          subject: ctx.viewer.subject,
        },
        buildId: args.buildId,
        permissions: args.permissions,
        staffEmail,
        staffWorkosUserId: provisioning.userId,
        workosMembershipId: provisioning.membershipId,
        workosOrganizationId: args.workosOrganizationId,
      },
    );
    return {
      provisioning,
      staffWorkosUserId,
      workosMembershipId: provisioning.membershipId,
    };
  })
  .public();

export const finalizeActiveBuildBuilderStaffProvisioning = internalMutation
  .input({
    actor: builderStaffProvisionActorInput,
    buildId: v.id("activeBuilds"),
    permissions: v.array(builderStaffPermissionGrantInput),
    staffEmail: v.string(),
    staffWorkosUserId: v.string(),
    workosMembershipId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const actor = viewerFromBuilderStaffProvisionActor(args.actor);
    const auth = await authorizeActiveBuildForViewer(
      ctx,
      actor,
      args.buildId,
      args.workosOrganizationId,
    );
    if (!auth) {
      throw new Error("Forbidden: active build scope");
    }
    await requireBuilderStaffManagementAllowed(
      ctx,
      auth,
      auth.build.builderProfileId,
    );
    return await saveBuilderStaffPermissionScope(ctx, {
      allowPendingEmail: true,
      auth,
      buildId: args.buildId,
      builderProfileId: auth.build.builderProfileId,
      permissions: args.permissions,
      proposalId: auth.proposal._id,
      scope: "activeBuild",
      staffEmail: args.staffEmail,
      staffWorkosUserId: args.staffWorkosUserId,
      workosMembershipId: args.workosMembershipId,
      workosOrganizationId: args.workosOrganizationId,
    });
  })
  .internal();

export const removeActiveBuildBuilderStaffMember = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    staffWorkosUserId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireBuilderStaffManagementAllowed(
      ctx,
      auth,
      auth.build.builderProfileId,
    );
    await removeBuilderStaffMember(ctx, {
      auth,
      builderProfileId: auth.build.builderProfileId,
      staffWorkosUserId: args.staffWorkosUserId,
    });
    return null;
  })
  .public();
