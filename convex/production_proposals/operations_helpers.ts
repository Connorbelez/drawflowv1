/**
 * Production proposals operations helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError } from "convex/values";
import { type AuthorizedViewer, type RoleSlug } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { authorizeBrokerage } from "./authorization_core.js";
import { requireAnyRole } from "./contractor_policy_helpers.js";
import { BACKOFFICE_ROLES } from "./contracts_foundation.js";
import { productionMilestoneNeedsBackofficeReview } from "./roster_projection_helpers.js";

export function operationsHandoffProjection(handoff: Doc<"operationsQueueHandoffs">) {
  return {
    _id: handoff._id,
    acknowledgementState: handoff.acknowledgementState,
    acknowledgedAt: handoff.acknowledgedAt,
    acknowledgedByWorkosUserId: handoff.acknowledgedByWorkosUserId,
    createdAt: handoff.createdAt,
    decisionPreview: handoff.decisionPreview,
    escalatedByWorkosUserId: handoff.escalatedByWorkosUserId,
    escalationReason: handoff.escalationReason,
    evidenceSummary: handoff.evidenceSummary,
    followUpAssignment: handoff.followUpAssignment,
    queueItemId: handoff.queueItemId,
    recommendation: handoff.recommendation,
    requiredAction: handoff.requiredAction,
    returnDecision: handoff.returnDecision,
    returnedAt: handoff.returnedAt,
    returnedByWorkosUserId: handoff.returnedByWorkosUserId,
    returnReason: handoff.returnReason,
    targetHref: handoff.targetHref,
    targetLabel: handoff.targetLabel,
    targetRecordId: handoff.targetRecordId,
    targetType: handoff.targetType,
    updatedAt: handoff.updatedAt,
    warnings: handoff.warnings,
  };
}

export async function authorizeOperationsQueueMutation(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  workosOrganizationId: string,
) {
  const auth = await authorizeBrokerage(ctx, workosOrganizationId);
  requireAnyRole(auth.roles, BACKOFFICE_ROLES);
  const elevated = auth.roles.some((role) =>
    ["admin", "principle-broker", "broker"].includes(role),
  );
  if (
    !(
      elevated ||
      (await hasPermission(
        ctx,
        auth.brokerage.workosOrganizationId,
        auth.roles,
        "proposals:read",
      ))
    )
  ) {
    throw new Error("Forbidden: permission");
  }
  return auth;
}

export async function getOperationsHandoffOrThrow(
  ctx: (QueryCtx | MutationCtx) & { viewer: AuthorizedViewer },
  handoffId: Id<"operationsQueueHandoffs">,
  workosOrganizationId: string,
) {
  const auth = await authorizeOperationsQueueMutation(
    ctx,
    workosOrganizationId,
  );
  const handoff = await ctx.db.get(handoffId);
  if (
    !handoff ||
    handoff.brokerageId !== auth.brokerage._id ||
    handoff.organizationId !== workosOrganizationId
  ) {
    throw new ConvexError("Operations escalation unavailable.");
  }
  return { auth, handoff };
}

export async function resolveOperationsQueueTarget(
  ctx: QueryCtx | MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages"> };
    queueItemId: string;
    workosOrganizationId: string;
  },
) {
  const separatorIndex = input.queueItemId.indexOf(":");
  if (separatorIndex <= 0) {
    throw new ConvexError("Operations queue item unavailable.");
  }
  const kind = input.queueItemId.slice(0, separatorIndex);
  const rawId = input.queueItemId.slice(separatorIndex + 1);

  if (kind === "proposal-review" || kind === "proposal-closing") {
    const proposalId = ctx.db.normalizeId("buildProposals", rawId);
    const proposal = proposalId ? await ctx.db.get(proposalId) : null;
    const isReviewable =
      kind === "proposal-review"
        ? proposal?.status === "submitted" &&
          proposal.reviewOutcome !== "rejected"
        : proposal?.status === "approved" && !proposal.activeBuildId;
    if (
      !(proposal && isReviewable) ||
      proposal.brokerageId !== input.auth.brokerage._id ||
      proposal.organizationId !== input.workosOrganizationId
    ) {
      throw new ConvexError("Operations queue item unavailable.");
    }
    return {
      href: `/backoffice/proposals/${proposal._id}`,
      label: proposal.buildName,
      recordId: String(proposal._id),
      type: "proposal",
    };
  }

  if (kind === "build-stale") {
    const buildId = ctx.db.normalizeId("activeBuilds", rawId);
    const build = buildId ? await ctx.db.get(buildId) : null;
    if (
      !build ||
      build.brokerageId !== input.auth.brokerage._id ||
      build.organizationId !== input.workosOrganizationId
    ) {
      throw new ConvexError("Operations queue item unavailable.");
    }
    return {
      href: `/backoffice/builds/${build._id}`,
      label: build.buildName,
      recordId: String(build._id),
      type: "activeBuild",
    };
  }

  if (kind === "draw-review") {
    const requestId = ctx.db.normalizeId("activeBuildDrawRequests", rawId);
    const request = requestId ? await ctx.db.get(requestId) : null;
    const build = request ? await ctx.db.get(request.buildId) : null;
    if (
      !request ||
      request.status !== "requested" ||
      !build ||
      build.brokerageId !== input.auth.brokerage._id ||
      build.organizationId !== input.workosOrganizationId
    ) {
      throw new ConvexError("Operations queue item unavailable.");
    }
    return {
      href: `/backoffice/draws?buildId=${build._id}&drawId=${request._id}`,
      label: `${build.buildName} · ${request.label}`,
      recordId: String(request._id),
      type: "drawRequest",
    };
  }

  if (kind === "milestone-review" || kind === "site-visit") {
    const milestoneId = ctx.db.normalizeId("buildMilestones", rawId);
    const milestone = milestoneId ? await ctx.db.get(milestoneId) : null;
    const build = milestone ? await ctx.db.get(milestone.buildId) : null;
    if (
      !(
        milestone &&
        productionMilestoneNeedsBackofficeReview(milestone) &&
        build
      ) ||
      build.brokerageId !== input.auth.brokerage._id ||
      build.organizationId !== input.workosOrganizationId
    ) {
      throw new ConvexError("Operations queue item unavailable.");
    }
    return {
      href:
        kind === "site-visit"
          ? `/backoffice/site-visits?buildId=${build._id}&milestone=${milestone.key}`
          : `/backoffice/builds/${build._id}?milestone=${milestone.key}`,
      label: `${build.buildName} · ${milestone.name}`,
      recordId: String(milestone._id),
      type: kind === "site-visit" ? "siteVisit" : "milestone",
    };
  }

  throw new ConvexError("Operations queue item unavailable.");
}

export function requireOperationsHandoffText(value: string, label: string) {
  const normalized = value.trim();
  if (normalized.length < 8) {
    throw new ConvexError(`${label} must contain at least 8 characters.`);
  }
  return normalized;
}

export function normalizeOperationsHandoffWarnings(warnings: string[]) {
  return [
    ...new Set(warnings.map((warning) => warning.trim()).filter(Boolean)),
  ].slice(0, 10);
}

export function operationsHandoffAuditState(handoff: Doc<"operationsQueueHandoffs">) {
  return JSON.stringify({
    acknowledgementState: handoff.acknowledgementState,
    decisionPreview: handoff.decisionPreview,
    followUpAssignment: handoff.followUpAssignment,
    queueItemId: handoff.queueItemId,
    recommendation: handoff.recommendation,
    requiredAction: handoff.requiredAction,
    returnDecision: handoff.returnDecision,
    returnReason: handoff.returnReason,
    targetHref: handoff.targetHref,
    targetLabel: handoff.targetLabel,
    warnings: handoff.warnings,
  });
}

export async function writeOperationsHandoffEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    eventType: string;
    handoff: Doc<"operationsQueueHandoffs">;
    newState: string;
    organizationId: string;
    priorState?: string;
    reason: string;
  },
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: Date.now(),
    entityId: String(input.handoff._id),
    entityType: "operationsQueueHandoff",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.handoff.warnings,
  });
}
