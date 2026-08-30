import { ConvexError } from "convex/values";

import { hasActiveBuildRetentionHold } from "./access";
import {
  BASELINE_RETENTION_YEARS,
  BACKUP_RPO_MS,
  DAY_MS,
  baselineRetentionDeadline,
} from "./contracts";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

export async function tenantSetting(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  return await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", organizationId)
    )
    .unique();
}

export async function activeTenantPolicy(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  brokerageId: Id<"brokerages">
) {
  const policy = await ctx.db
    .query("dataRetentionTenantPolicies")
    .withIndex("by_organizationId_and_state", (query) =>
      query.eq("organizationId", organizationId).eq("state", "active")
    )
    .unique();
  if (policy && policy.brokerageId !== brokerageId) {
    throw new ConvexError("Retention policy tenancy is invalid.");
  }
  return policy;
}

export async function ensureTenantPolicy(
  ctx: MutationCtx,
  build: Doc<"activeBuilds">,
  now: number
) {
  const current = await activeTenantPolicy(
    ctx,
    build.organizationId,
    build.brokerageId
  );
  if (current) {
    return current;
  }
  const id = await ctx.db.insert("dataRetentionTenantPolicies", {
    baselineYears: BASELINE_RETENTION_YEARS,
    brokerageId: build.brokerageId,
    createdAt: now,
    createdByWorkosUserId: "system:retention-policy-default",
    extensionDays: 0,
    organizationId: build.organizationId,
    reason: "Platform baseline retention policy.",
    state: "active",
    version: 1,
  });
  const policy = await ctx.db.get(id);
  if (!policy) {
    throw new ConvexError("Default retention policy could not be created.");
  }
  return policy;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The schedule derivation deliberately keeps closure, policy, archive, hold, and persisted-projection decisions in one atomic reconciliation path.
export async function deriveBuildSchedule(
  ctx: MutationCtx,
  buildId: Id<"activeBuilds">,
  asOf: number
) {
  const build = await ctx.db.get(buildId);
  if (!build) {
    return null;
  }
  const policy = await ensureTenantPolicy(ctx, build, asOf);
  const lifecycle = await ctx.db
    .query("buildCollaborationBuildStates")
    .withIndex("by_buildId", (query) => query.eq("buildId", build._id))
    .unique();
  const facilities = await ctx.db
    .query("loanFacilities")
    .withIndex("by_build", (query) => query.eq("buildId", build._id))
    .take(21);
  if (facilities.length > 20) {
    throw new ConvexError(
      "Retention schedule derivation exceeded the bounded loan facility limit."
    );
  }
  const allFacilitiesClosed = facilities.every(
    (facility) => facility.status === "closed"
  );
  const allFacilityClosuresExplicit = facilities.every(
    (facility) => facility.closedAt !== undefined
  );
  const loanClosedAt =
    facilities.length > 0 && allFacilitiesClosed && allFacilityClosuresExplicit
      ? facilities
          .map((facility) => facility.closedAt)
          .reduce<number | undefined>(
            (latest, value) =>
              value !== undefined && (latest === undefined || value > latest)
                ? value
                : latest,
            undefined
          )
      : undefined;
  const buildClosedAt = lifecycle?.closedAt;
  const laterClosureAt =
    buildClosedAt !== undefined &&
    (facilities.length === 0 || loanClosedAt !== undefined)
      ? Math.max(buildClosedAt, loanClosedAt ?? buildClosedAt)
      : undefined;
  const baselineRetainUntil = laterClosureAt
    ? baselineRetentionDeadline(laterClosureAt)
    : undefined;
  const retainUntil = baselineRetainUntil
    ? baselineRetainUntil + policy.extensionDays * DAY_MS
    : undefined;
  const setting = await tenantSetting(ctx, build.organizationId);
  const held = await hasActiveBuildRetentionHold(ctx, {
    buildId: build._id,
    organizationId: build.organizationId,
  });
  const current = await ctx.db
    .query("dataRetentionSchedules")
    .withIndex("by_buildId", (query) => query.eq("buildId", build._id))
    .unique();
  const state =
    current?.state === "purged"
      ? "purged"
      : setting?.serviceLifecycle === "restricted_archive"
        ? "restricted_archive"
        : held
          ? "held"
          : retainUntil && retainUntil <= asOf
            ? "eligible"
            : "active";
  const changed = Boolean(
    !current ||
      current.policyVersion !== policy.version ||
      current.buildClosedAt !== buildClosedAt ||
      current.loanClosedAt !== loanClosedAt ||
      current.laterClosureAt !== laterClosureAt ||
      current.baselineRetainUntil !== baselineRetainUntil ||
      current.retainUntil !== retainUntil ||
      current.state !== state
  );
  const values = {
    baselineRetainUntil,
    buildClosedAt,
    derivedAt: asOf,
    lastReconciledAt: asOf,
    loanClosedAt,
    laterClosureAt,
    policyId: policy._id,
    policyVersion: policy.version,
    retainUntil,
    revision: (current?.revision ?? 0) + (changed ? 1 : 0),
    state,
  } as const;
  if (!current) {
    const id = await ctx.db.insert("dataRetentionSchedules", {
      brokerageId: build.brokerageId,
      buildId: build._id,
      organizationId: build.organizationId,
      ...values,
    });
    const schedule = await ctx.db.get(id);
    return schedule ? { priorState: undefined, schedule } : null;
  }
  await ctx.db.patch(current._id, values);
  const schedule = await ctx.db.get(current._id);
  return schedule ? { priorState: current.state, schedule } : null;
}

export function projectSchedule(schedule: Doc<"dataRetentionSchedules">) {
  return {
    _id: schedule._id,
    baselineRetainUntil: schedule.baselineRetainUntil,
    baselineRetentionYears: BASELINE_RETENTION_YEARS,
    buildClosedAt: schedule.buildClosedAt,
    buildId: schedule.buildId,
    lastReconciledAt: schedule.lastReconciledAt,
    loanClosedAt: schedule.loanClosedAt,
    laterClosureAt: schedule.laterClosureAt,
    organizationId: schedule.organizationId,
    policyVersion: schedule.policyVersion,
    retainUntil: schedule.retainUntil,
    revision: schedule.revision,
    state: schedule.state,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The bounded retention pass intentionally coordinates independent disposal windows atomically per Build.

export async function latestBackupManifest(
  ctx: QueryCtx | MutationCtx,
  organizationId: string
) {
  const rows = await ctx.db
    .query("dataRetentionBackupManifests")
    .withIndex("by_organizationId_and_state_and_capturedAt", (query) =>
      query.eq("organizationId", organizationId).eq("state", "verified")
    )
    .order("desc")
    .take(1);
  return rows[0] ?? null;
}
