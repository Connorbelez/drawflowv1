import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
  requiredAdministrativeReason,
} from "../administrative_override_policy";
import { authenticatedMutation, authenticatedQuery } from "../authz";
import {
  BASELINE_RETENTION_YEARS,
  MAX_PROVIDER_RESERVATIONS_PER_ORGANIZATION,
  scheduleValidator,
} from "./contracts";
import { isOrganizationInRestrictedArchive } from "./access";
import { activeTenantPolicy, projectSchedule } from "./schedule";
import { recordAudit } from "./operations";
import {
  assertExtensionDays,
  requireRetentionAdmin,
} from "./support";

export const getDataRetentionSchedule = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.union(scheduleValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const schedule = await ctx.db
      .query("dataRetentionSchedules")
      .withIndex("by_buildId", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .unique();
    if (!schedule) {
      return null;
    }
    return projectSchedule(schedule);
  })
  .public();

export const configureDataRetentionPolicy = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    extensionDays: v.number(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(v.id("dataRetentionTenantPolicies"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    requireRetentionAdmin(authorization);
    const reason = requiredAdministrativeReason(
      args.reason,
      "A retention policy reason"
    );
    assertExtensionDays(args.extensionDays);
    const current = await activeTenantPolicy(
      ctx,
      authorization.organizationId,
      authorization.brokerage._id
    );
    if (current && args.extensionDays < current.extensionDays) {
      throw new ConvexError(
        "Tenant retention may extend the baseline only; it cannot shorten it."
      );
    }
    if (current && args.extensionDays === current.extensionDays) {
      return current._id;
    }
    const now = Date.now();
    if (current) {
      await ctx.db.patch(current._id, {
        state: "superseded",
        supersededAt: now,
      });
    }
    const policyId = await ctx.db.insert("dataRetentionTenantPolicies", {
      baselineYears: BASELINE_RETENTION_YEARS,
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      createdByWorkosUserId: authorization.viewer.subject,
      extensionDays: args.extensionDays,
      organizationId: authorization.organizationId,
      reason,
      state: "active",
      version: (current?.version ?? 0) + 1,
    });
    await recordAudit(ctx, {
      actorKind: authorization.viewer.actorKind ?? "human",
      actorRole: authorization.effectiveRole.role,
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      command: "configureDataRetentionPolicy",
      entityId: policyId,
      entityType: "dataRetentionTenantPolicy",
      eventType: "data_retention.policy.changed",
      newState: {
        baselineYears: BASELINE_RETENTION_YEARS,
        extensionDays: args.extensionDays,
        version: (current?.version ?? 0) + 1,
      },
      organizationId: authorization.organizationId,
      priorState: current
        ? {
            baselineYears: current.baselineYears,
            extensionDays: current.extensionDays,
            version: current.version,
          }
        : undefined,
      reason,
      now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.data_retention.fanOutDataRetentionWork,
      {
        mode: "reconcile",
        organizationId: authorization.organizationId,
        runKey: `policy:${authorization.organizationId}:${policyId}:${now}`,
      }
    );
    return policyId;
  })
  .public();

export const transitionOrganizationToRestrictedArchive = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(
    v.object({
      archiveRunKey: v.string(),
      settingId: v.id("buildCollaborationTenantSettings"),
    })
  )
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError(
        "Explicit confirmation is required to place an organization in restricted archive."
      );
    }
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    requireRetentionAdmin(authorization);
    const reason = requiredAdministrativeReason(
      args.reason,
      "An organization archive reason"
    );
    const setting = await ctx.db
      .query("buildCollaborationTenantSettings")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", authorization.organizationId)
      )
      .unique();
    const now = Date.now();
    if (setting?.serviceLifecycle === "restricted_archive") {
      return {
        archiveRunKey: `archive:${authorization.organizationId}:${setting.serviceLifecycleChangedAt ?? setting.updatedAt}`,
        settingId: setting._id,
      };
    }
    const reservations = await ctx.db
      .query("communicationProviderReservations")
      .withIndex("by_organizationId_and_state_and_leaseExpiresAt", (query) =>
        query
          .eq("organizationId", authorization.organizationId)
          .eq("state", "active")
      )
      .take(MAX_PROVIDER_RESERVATIONS_PER_ORGANIZATION + 1);
    if (reservations.length > MAX_PROVIDER_RESERVATIONS_PER_ORGANIZATION) {
      throw new ConvexError(
        "Organization archive is blocked by an unbounded provider reservation set."
      );
    }
    for (const reservation of reservations) {
      if (reservation.leaseExpiresAt > now) {
        throw new ConvexError(
          "Organization archive is deferred while a provider submission is active."
        );
      }
      await ctx.db.patch(reservation._id, {
        releasedAt: now,
        state: "expired",
        updatedAt: now,
      });
    }
    const settingId = setting
      ? setting._id
      : await ctx.db.insert("buildCollaborationTenantSettings", {
          brokerageId: authorization.brokerage._id,
          createdAt: now,
          generousRateLimitMultiplier: 1,
          organizationId: authorization.organizationId,
          status: "disabled",
          updatedAt: now,
        });
    await ctx.db.patch(settingId, {
      serviceLifecycle: "restricted_archive",
      serviceLifecycleChangedAt: now,
      serviceLifecycleChangedByWorkosUserId: authorization.viewer.subject,
      serviceLifecycleReason: reason,
      updatedAt: now,
    });
    const archiveRunKey = `archive:${authorization.organizationId}:${now}`;
    await ctx.scheduler.runAfter(
      0,
      internal.data_retention.fanOutDataRetentionWork,
      {
        mode: "archive",
        organizationId: authorization.organizationId,
        runKey: archiveRunKey,
      }
    );
    await recordAudit(ctx, {
      actorKind: authorization.viewer.actorKind ?? "human",
      actorRole: authorization.effectiveRole.role,
      actorRoles: authorization.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      command: "transitionOrganizationToRestrictedArchive",
      entityId: settingId,
      entityType: "buildCollaborationTenantSettings",
      eventType: "data_retention.organization.restricted_archive",
      newState: { serviceLifecycle: "restricted_archive" },
      organizationId: authorization.organizationId,
      priorState: {
        serviceLifecycle: setting?.serviceLifecycle ?? "active",
      },
      reason,
      now,
    });
    return { archiveRunKey, settingId };
  })
  .public();
