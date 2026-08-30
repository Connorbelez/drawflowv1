import { ConvexError, v } from "convex/values";

import {
  authorizeActiveBuildAccess,
  type ActiveBuildAuthorization,
} from "../activeBuildAccess";
import { normalizeRoleSlugs, type AuthorizedViewer } from "../authz";
import {
  ensureMilestoneSystemPost,
  synchronizeMilestoneSystemPostLifecycle,
} from "../build_collaboration_system_posts";
import { resolveActiveSubmilestoneEvidencePackageReadiness } from "../build_submilestone_evidence";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";



type ReviewAuth = ActiveBuildAuthorization;
type ReviewCtx = QueryCtx | MutationCtx;
type SiteVisitRequirement = Doc<"buildSubmilestoneSiteVisitRequirements">;

const LENDER_STAFF_ROLES = [
  "admin",
  "principle-broker",
  "broker",
  "broker-staff",
] as const;

const RISK_POLICY_STATES = new Set([
  "admin_review_required",
  "attention_required",
  "exception",
  "flagged",
  "risk",
  "risk_flagged",
  "review_required",
  "site_visit_required",
]);

export function requireLenderStaff(auth: ReviewAuth) {
  const normalizedRoles = normalizeRoleSlugs(auth.roles);
  if (!normalizedRoles.some((role) => LENDER_STAFF_ROLES.some((allowed) => allowed === role))) {
    throw new ConvexError({
      code: "REVIEW_ROLE_REQUIRED",
      message: "Only Lender Staff or Lender Admin may review completion work.",
    });
  }
}

export function requireLenderAdmin(auth: ReviewAuth) {
  const normalizedRoles = normalizeRoleSlugs(auth.roles);
  if (!normalizedRoles.includes("admin")) {
    throw new ConvexError({
      code: "LENDER_ADMIN_REQUIRED",
      message: "Only Lender Admin may grant, waive, or retract final approval.",
    });
  }
}

export function nonBlank(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new ConvexError({ code: "REASON_REQUIRED", message: `${label} is required.` });
  }
  return normalized;
}

export function assertExpectedRevision(
  submilestone: Doc<"buildSubmilestones">,
  expectedRevision: number | undefined,
) {
  if (
    expectedRevision !== undefined &&
    expectedRevision !== (submilestone.reviewRevision ?? 0)
  ) {
    throw new ConvexError({
      code: "STALE_SUBMILESTONE_REVIEW_REVISION",
      actualRevision: submilestone.reviewRevision ?? 0,
      expectedRevision,
      message: "Sub-milestone changed; refresh before retrying this review command.",
    });
  }
}

export function assertExpectedMilestoneRevision(
  milestone: Doc<"buildMilestones">,
  expectedRevision: number | undefined,
) {
  if (
    expectedRevision !== undefined &&
    expectedRevision !== (milestone.reviewRevision ?? 0)
  ) {
    throw new ConvexError({
      code: "STALE_MILESTONE_REVIEW_REVISION",
      actualRevision: milestone.reviewRevision ?? 0,
      expectedRevision,
      message: "Milestone approval changed; refresh before retrying this command.",
    });
  }
}

export async function authorizeReview(
  ctx: ReviewCtx & { viewer: AuthorizedViewer },
  buildId: Id<"activeBuilds">,
  organizationId: string,
) {
  return await authorizeActiveBuildAccess(ctx, {
    buildId,
    organizationId,
  });
}

export async function getTarget(
  ctx: ReviewCtx,
  auth: ReviewAuth,
  milestoneKey: string,
  submilestoneKey: string,
) {
  const milestone = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_key", (query) =>
      query.eq("buildId", auth.build._id).eq("key", milestoneKey),
    )
    .unique();
  if (!milestone) {
    throw new ConvexError({ code: "MILESTONE_NOT_FOUND", message: "Milestone is unavailable." });
  }
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_milestone", (query) => query.eq("buildMilestoneId", milestone._id))
    .take(500);
  const submilestone =
    submilestones.find(
      (candidate) =>
        candidate.key === submilestoneKey &&
        candidate.planningState !== "superseded",
    ) ?? submilestones.find((candidate) => candidate.key === submilestoneKey);
  if (!submilestone) {
    throw new ConvexError({
      code: "SUBMILESTONE_NOT_FOUND",
      message: "Sub-milestone is unavailable.",
      submilestoneKey,
    });
  }
  return { milestone, submilestone, submilestones };
}

export function recordSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function boolSetting(settings: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (settings[key] === true) return true;
    if (settings[key] === false) return false;
  }
  return false;
}

export function settingMatchesTarget(
  value: unknown,
  milestoneKey: string,
  submilestoneKey: string,
): boolean {
  if (typeof value === "string") {
    return value === milestoneKey || value === submilestoneKey;
  }
  if (Array.isArray(value)) {
    return value.some((candidate) =>
      settingMatchesTarget(candidate, milestoneKey, submilestoneKey),
    );
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return (
      candidate[milestoneKey] === true ||
      candidate[submilestoneKey] === true
    );
  }
  return false;
}

export async function policySettings(ctx: ReviewCtx, auth: ReviewAuth) {
  const snapshot = auth.proposal.workflowRuleSnapshotId
    ? await ctx.db.get(auth.proposal.workflowRuleSnapshotId)
    : null;
  return recordSettings(snapshot?.settings);
}

export async function latestRecommendation(
  ctx: ReviewCtx,
  submilestoneId: Id<"buildSubmilestones">,
  reviewRound: number,
) {
  const decisions = await ctx.db
    .query("buildSubmilestoneReviewDecisions")
    .withIndex("by_submilestone_round", (query) =>
      query.eq("buildSubmilestoneId", submilestoneId).eq("reviewRound", reviewRound),
    )
    .take(100);
  return decisions
    .filter((decision) => decision.kind === "recommendation")
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

export async function reviewRoundEnteredAt(
  ctx: ReviewCtx,
  submilestoneId: Id<"buildSubmilestones">,
  reviewRound: number,
) {
  if (reviewRound <= 0) return undefined;
  const round = await ctx.db
    .query("buildSubmilestoneReviewRounds")
    .withIndex("by_submilestone_round", (query) =>
      query.eq("buildSubmilestoneId", submilestoneId).eq("round", reviewRound),
    )
    .unique();
  return round?.enteredAt;
}

export async function matchingSiteVisit(
  ctx: ReviewCtx,
  submilestone: Doc<"buildSubmilestones">,
  reviewRound?: number,
) {
  const enteredAt =
    reviewRound === undefined
      ? undefined
      : await reviewRoundEnteredAt(ctx, submilestone._id, reviewRound);
  const visits = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_build_milestone", (query) =>
      query
        .eq("buildId", submilestone.buildId)
        .eq("milestoneKey", submilestone.milestoneKey),
    )
    .take(500);
  return visits
    .filter(
      (visit) =>
        visit.status !== "cancelled" &&
        (enteredAt === undefined ||
          (visit.scopeBoundAt ?? visit.createdAt) >= enteredAt) &&
        (!visit.submilestoneKeys || visit.submilestoneKeys.includes(submilestone.key)),
    )
    .sort(
      (left, right) =>
        Number(right.status === "complete") - Number(left.status === "complete") ||
        right.updatedAt - left.updatedAt,
    )[0];
}

export async function currentRequirementVisit(
  ctx: ReviewCtx,
  submilestone: Doc<"buildSubmilestones">,
  requirement: SiteVisitRequirement,
) {
  if (requirement.siteVisitId) {
    const referenced = await ctx.db.get(requirement.siteVisitId);
    const enteredAt = await reviewRoundEnteredAt(
      ctx,
      submilestone._id,
      requirement.reviewRound,
    );
    if (
      referenced &&
      referenced.status !== "cancelled" &&
      (enteredAt === undefined ||
        (referenced.scopeBoundAt ?? referenced.createdAt) >= enteredAt)
    ) {
      return referenced;
    }
  }
  return await matchingSiteVisit(ctx, submilestone, requirement.reviewRound);
}

export async function evaluateSiteVisitRequirement(
  ctx: ReviewCtx,
  auth: ReviewAuth,
  milestone: Doc<"buildMilestones">,
  submilestone: Doc<"buildSubmilestones">,
  reviewRound: number,
  manualRequiredOverride?: boolean,
) {
  const settings = await policySettings(ctx, auth);
  const policySignals: string[] = [];
  const policyRequired =
    boolSetting(settings, ["requireSiteVisit", "siteVisitRequired"]) ||
    settingMatchesTarget(settings.siteVisitRequirements, milestone.key, submilestone.key) ||
    settingMatchesTarget(settings.siteVisitRequirement, milestone.key, submilestone.key);
  if (policyRequired) policySignals.push("lender_policy");

  const configuredRequirements = await ctx.db
    .query("buildSubmilestoneEvidenceRequirements")
    .withIndex("by_submilestone", (query) =>
      query.eq("buildSubmilestoneId", submilestone._id).eq("active", true),
    )
    .take(200);
  const evidencePolicyRequired = configuredRequirements.some(
    (requirement) => requirement.required && requirement.kind === "site_visit",
  );
  if (evidencePolicyRequired) policySignals.push("site_visit_evidence_requirement");

  const riskSignals: string[] = [];
  const packageReadiness =
    await resolveActiveSubmilestoneEvidencePackageReadiness(ctx, {
      build: auth.build,
      milestone,
      submilestone,
      includeFrozenRequirement: false,
    });
  const locationRequiredKeys = new Set(
    packageReadiness.requirements
      .filter((requirement) => requirement.required && requirement.locationRequired)
      .map((requirement) => requirement.requirementKey),
  );
  if (
    packageReadiness.packageItems.some(
      (item) =>
        locationRequiredKeys.has(item.requirementKey) && !item.locationVerified,
    )
  ) {
    riskSignals.push("location_unverified_evidence");
  }
  const normalizedPolicyState =
    typeof milestone.policyState === "string"
      ? milestone.policyState.trim().toLowerCase().replace(/\s+/g, "_")
      : "";
  if (RISK_POLICY_STATES.has(normalizedPolicyState)) {
    riskSignals.push(`milestone_policy:${milestone.policyState}`);
  }
  const recommendation = await latestRecommendation(ctx, submilestone._id, reviewRound);
  const manualRequired = manualRequiredOverride ?? recommendation?.siteVisitRequired === true;
  const manualSignals = manualRequired ? ["lender_staff_recommendation"] : [];
  const required = policyRequired || evidencePolicyRequired || riskSignals.length > 0 || manualRequired;
  const visit = await matchingSiteVisit(ctx, submilestone, reviewRound);
  return {
    manualRequired,
    manualSignals,
    policyRequired: policyRequired || evidencePolicyRequired,
    policySignals,
    required,
    riskRequired: riskSignals.length > 0,
    riskSignals,
    siteVisitId: visit?._id,
    visit,
  };
}

export async function ensureSiteVisitRequirement(
  ctx: MutationCtx,
  auth: ReviewAuth,
  milestone: Doc<"buildMilestones">,
  submilestone: Doc<"buildSubmilestones">,
  reviewRound: number,
  manualRequiredOverride?: boolean,
) {
  const existing = await ctx.db
    .query("buildSubmilestoneSiteVisitRequirements")
    .withIndex("by_submilestone_round", (query) =>
      query.eq("buildSubmilestoneId", submilestone._id).eq("reviewRound", reviewRound),
    )
    .unique();
  if (existing) {
    if (
      manualRequiredOverride === true &&
      (!existing.manualRequired || existing.status === "waived")
    ) {
      const now = Date.now();
      const waiverReopened = existing.status === "waived";
      const manualSignals = existing.manualSignals.includes(
        "lender_staff_recommendation",
      )
        ? existing.manualSignals
        : [...existing.manualSignals, "lender_staff_recommendation"];
      await ctx.db.patch(existing._id, {
        manualRequired: true,
        manualSignals,
        required: true,
        status:
          existing.status === "not_required" || waiverReopened
            ? "required"
            : existing.status,
        ...(waiverReopened
          ? {
              waivedAt: undefined,
              waivedByRole: undefined,
              waivedByWorkosUserId: undefined,
              waiverReason: undefined,
            }
          : {}),
        updatedAt: now,
      });
      if (waiverReopened) {
        await recordReviewAudit(ctx, auth, {
          command: "recommendActiveBuildSubmilestoneReview",
          entityId: String(submilestone._id),
          entityType: "buildSubmilestone",
          eventType: "active_build.submilestone.site_visit.requirement_reopened",
          newState: JSON.stringify({
            manualRequired: true,
            requirementId: existing._id,
            required: true,
            status: "required",
            waivedAt: null,
            waivedByRole: null,
            waivedByWorkosUserId: null,
            waiverReason: null,
          }),
          priorState: JSON.stringify({
            manualRequired: existing.manualRequired,
            requirementId: existing._id,
            required: existing.required,
            status: existing.status,
            waivedAt: existing.waivedAt ?? null,
            waivedByRole: existing.waivedByRole ?? null,
            waivedByWorkosUserId: existing.waivedByWorkosUserId ?? null,
            waiverReason: existing.waiverReason ?? null,
          }),
          warnings: existing.riskSignals,
        });
      }
      return (await ctx.db.get(existing._id))!;
    }
    return existing;
  }
  const evaluation = await evaluateSiteVisitRequirement(
    ctx,
    auth,
    milestone,
    submilestone,
    reviewRound,
    manualRequiredOverride,
  );
  const now = Date.now();
  const id = await ctx.db.insert("buildSubmilestoneSiteVisitRequirements", {
    brokerageId: auth.brokerage._id,
    buildId: auth.build._id,
    buildMilestoneId: milestone._id,
    buildSubmilestoneId: submilestone._id,
    createdAt: now,
    evaluatedAt: now,
    manualRequired: evaluation.manualRequired,
    manualSignals: evaluation.manualSignals,
    milestoneKey: milestone.key,
    organizationId: auth.organizationId,
    policyRequired: evaluation.policyRequired,
    policySignals: evaluation.policySignals,
    required: evaluation.required,
    reviewRound,
    riskRequired: evaluation.riskRequired,
    riskSignals: evaluation.riskSignals,
    siteVisitId: evaluation.siteVisitId,
    status: evaluation.required ? "required" : "not_required",
    submilestoneKey: submilestone.key,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

export async function existingChildDecision(
  ctx: ReviewCtx,
  submilestoneId: Id<"buildSubmilestones">,
  idempotencyKey: string,
  kind: Doc<"buildSubmilestoneReviewDecisions">["kind"],
) {
  const existing = await ctx.db
    .query("buildSubmilestoneReviewDecisions")
    .withIndex("by_submilestone_idempotency", (query) =>
      query.eq("buildSubmilestoneId", submilestoneId).eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  if (existing && existing.kind !== kind) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This idempotency key was already used for a different review command.",
    });
  }
  return existing;
}

export async function existingParentDecision(
  ctx: ReviewCtx,
  milestoneId: Id<"buildMilestones">,
  idempotencyKey: string,
  kind: Doc<"buildMilestoneReviewDecisions">["kind"],
) {
  const existing = await ctx.db
    .query("buildMilestoneReviewDecisions")
    .withIndex("by_milestone_idempotency", (query) =>
      query.eq("buildMilestoneId", milestoneId).eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  if (existing && existing.kind !== kind) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "This idempotency key was already used for a different review command.",
    });
  }
  return existing;
}

export async function recordReviewAudit(
  ctx: MutationCtx,
  auth: ReviewAuth,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    priorState: string;
    newState: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  const warnings = input.warnings ?? [];
  await ctx.db.insert("auditEvents", {
    actorRoles: normalizeRoleSlugs(auth.roles),
    actorWorkosUserId: auth.viewer.subject,
    brokerageId: auth.brokerage._id,
    buildId: auth.build._id,
    command: input.command,
    createdAt: now,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    resourceType: input.eventType.includes("site_visit")
      ? "evidence"
      : "submilestone",
    newState: input.newState,
    organizationId: auth.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: auth.organizationId,
    payloadPreview: JSON.stringify({
      entityId: input.entityId,
      newState: input.newState,
      priorState: input.priorState,
      warnings,
    }),
    relatedEntityId: input.entityId,
    relatedEntityType: input.entityType,
    status: "pending",
  });
}

export async function syncSystemPost(
  ctx: MutationCtx,
  auth: ReviewAuth,
  milestone: Doc<"buildMilestones">,
  lifecycle: "open" | "resolved",
  reason?: string,
) {
  const ensured = await ensureMilestoneSystemPost(ctx, {
    activationReason: "recovery",
    actor: {
      roles: normalizeRoleSlugs(auth.roles),
      workosUserId: auth.viewer.subject,
    },
    build: auth.build,
    milestone,
  });
  if (!ensured) return;
  await synchronizeMilestoneSystemPostLifecycle(ctx, {
    actorRole: auth.effectiveRole.role,
    actorWorkosUserId: auth.viewer.subject,
    buildId: auth.build._id,
    lifecycle,
    organizationId: auth.organizationId,
    postId: ensured.postId,
    reason,
  });
}

export async function parentReadiness(
  submilestones: Doc<"buildSubmilestones">[],
) {
  const requiredChildren = submilestones.filter(
    (child) => child.planningState !== "superseded",
  );
  const approvedChildren = requiredChildren.filter(
    (child) => child.reviewDecisionState === "approved",
  );
  // Empty/all-superseded Milestones are legacy recovery states, not an
  // approval gate. New and revised Milestones must persist a child, so keep
  // the parent command fail-closed until one is active and approved.
  return {
    approvedChildCount: approvedChildren.length,
    childCount: requiredChildren.length,
    readyForApproval:
      requiredChildren.length > 0 && approvedChildren.length === requiredChildren.length,
  };
}
