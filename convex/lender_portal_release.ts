import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  authenticatedMutation,
  authenticatedQuery,
  requireActiveWorkosUser,
} from "./authz";
import { operationalRequestFingerprint } from "./build_operational_idempotency";
import type { MutationCtx, QueryCtx } from "./types";
import {
  canaryScopeHash,
  getScopedReleaseControl,
  isReleaseStatus,
  lenderPortalRecipientWorkosUserId,
  normalizeCanaryRecipients,
  publicReleaseState,
  reconcileActiveLenderPortalProviderReservations,
  requireLegalReleaseTransition,
  requirePublishedLenderContentSnapshotReadiness,
  requireTrustedRuntimeReleaseProvenance,
  requiredCandidateSha,
  requiredConfigurationHash,
  requiredIdempotencyKey,
  requiredReason,
  safeObject,
} from "./lender_portal_release/helpers";

export { requireTrustedRuntimeReleaseProvenance } from "./lender_portal_release/helpers";

export const LENDER_PORTAL_RELEASE_PAUSED_REASON =
  "Lender portal delivery is paused by tenant release control.";
export const LENDER_PORTAL_CANARY_BLOCKED_REASON =
  "Lender portal delivery is outside the tenant canary allowlist.";

const MAX_OPERATIONAL_ROWS = 500;
const MAX_RELEASE_AUDIT_PAGE_SIZE = 50;

export const LENDER_PORTAL_OPERATIONAL_THRESHOLDS = {
  actionRequired: 5,
  abandonedAttempts: 5,
  failedAttempts: 1,
  oldestQueuedAgeMs: 15 * 60 * 1000,
  queued: 100,
  retryScheduled: 25,
} as const;

const releaseStatusValidator = v.union(
  v.literal("disabled"),
  v.literal("canary"),
  v.literal("enabled"),
  v.literal("draining")
);

type ReleaseReadCtx = Pick<QueryCtx | MutationCtx, "db">;

const releaseStateValidator = v.object({
  accessRevision: v.number(),
  available: v.boolean(),
  candidateSha: v.optional(v.string()),
  canaryRecipientCount: v.number(),
  configurationHash: v.optional(v.string()),
  status: releaseStatusValidator,
  updatedAt: v.optional(v.number()),
});

const releaseAuditValidator = v.object({
  accessRevision: v.optional(v.number()),
  actorRoles: v.array(v.string()),
  actorWorkosUserId: v.string(),
  candidateSha: v.optional(v.string()),
  correlationId: v.optional(v.string()),
  createdAt: v.number(),
  eventType: v.string(),
  newState: v.optional(v.string()),
  priorState: v.optional(v.string()),
  reason: v.optional(v.string()),
  reconciliationKey: v.optional(v.string()),
  status: v.optional(releaseStatusValidator),
  warnings: v.array(v.string()),
});

export const getLenderPortalReleaseState = authenticatedQuery
  .input({ organizationId: v.string() })
  .returns(releaseStateValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const control = await getScopedReleaseControl(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    return publicReleaseState(control);
  })
  .public();

export const listLenderPortalReleaseAudit = authenticatedQuery
  .input({
    organizationId: v.string(),
    paginationOpts: paginationOptsValidator,
  })
  .returns(paginationResultValidator(releaseAuditValidator))
  .handler(async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > MAX_RELEASE_AUDIT_PAGE_SIZE
    ) {
      throw new Error(
        `Lender portal release audit page size must be 1 to ${MAX_RELEASE_AUDIT_PAGE_SIZE}.`
      );
    }
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    await getScopedReleaseControl(ctx, scope.organizationId, scope.brokerageId);
    const page = await ctx.db
      .query("auditEvents")
      .withIndex("by_organizationId_and_entityType_and_createdAt", (query) =>
        query
          .eq("organizationId", scope.organizationId)
          .eq("entityType", "lenderPortalTenantReleaseControls")
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((event) => {
        const parsed = safeObject(event.newState);
        const status = isReleaseStatus(parsed?.status)
          ? parsed.status
          : undefined;
        return {
          accessRevision:
            typeof parsed?.accessRevision === "number"
              ? parsed.accessRevision
              : undefined,
          actorRoles: event.actorRoles,
          actorWorkosUserId: event.actorWorkosUserId,
          candidateSha:
            typeof parsed?.candidateSha === "string"
              ? parsed.candidateSha
              : undefined,
          correlationId: event.drawFlowCorrelationId,
          createdAt: event.createdAt,
          eventType: event.eventType,
          newState: event.newState,
          priorState: event.priorState,
          reason: event.reason,
          reconciliationKey: event.reconciliationKey,
          status,
          warnings: event.warnings,
        };
      }),
    };
  })
  .public();

export const transitionLenderPortalRelease = authenticatedMutation
  .input({
    candidateSha: v.string(),
    canaryRecipientWorkosUserIds: v.array(v.string()),
    configurationHash: v.string(),
    expectedAccessRevision: v.number(),
    expectedStatus: releaseStatusValidator,
    idempotencyKey: v.string(),
    nextStatus: releaseStatusValidator,
    organizationId: v.string(),
    reason: v.string(),
  })
  .returns(releaseStateValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const candidateSha = requiredCandidateSha(args.candidateSha);
    const configurationHash = requiredConfigurationHash(args.configurationHash);
    const reason = requiredReason(args.reason);
    const idempotencyKey = requiredIdempotencyKey(args.idempotencyKey);
    const canaryRecipientWorkosUserIds = normalizeCanaryRecipients(
      args.canaryRecipientWorkosUserIds
    );
    if (
      args.nextStatus === "canary" &&
      canaryRecipientWorkosUserIds.length === 0
    ) {
      throw new Error("Canary release requires at least one recipient.");
    }
    if (
      args.nextStatus !== "canary" &&
      canaryRecipientWorkosUserIds.length > 0
    ) {
      throw new Error(
        "Only canary release state accepts recipient allowlisting."
      );
    }
    if (args.nextStatus === "canary" || args.nextStatus === "enabled") {
      requireTrustedRuntimeReleaseProvenance(candidateSha, configurationHash);
      const activeMigrationRun = await ctx.db
        .query("lenderPortalPhase9MigrationRuns")
        .withIndex("by_organizationId_and_active", (query) =>
          query.eq("organizationId", scope.organizationId).eq("active", true)
        )
        .unique();
      if (
        activeMigrationRun?.status === "authorized" ||
        activeMigrationRun?.status === "applying"
      ) {
        throw new Error(
          "Lender portal release cannot enable while an authorized Phase 9 migration is active."
        );
      }
      await requirePublishedLenderContentSnapshotReadiness(
        ctx,
        scope.organizationId,
        scope.brokerageId
      );
    }

    const fingerprint = await operationalRequestFingerprint({
      candidateSha,
      canaryRecipientWorkosUserIds,
      configurationHash,
      expectedAccessRevision: args.expectedAccessRevision,
      expectedStatus: args.expectedStatus,
      nextStatus: args.nextStatus,
      organizationId: scope.organizationId,
      reason,
    });
    const reconciliationKey = `lender-portal-release:${idempotencyKey}`;
    const replay = await ctx.db
      .query("auditEvents")
      .withIndex("by_organizationId_and_reconciliationKey", (query) =>
        query
          .eq("organizationId", scope.organizationId)
          .eq("reconciliationKey", reconciliationKey)
      )
      .unique();
    if (replay) {
      if (replay.drawFlowCorrelationId !== fingerprint) {
        throw new Error(
          "Lender portal release idempotency key was reused with different input."
        );
      }
      const replayed = await getScopedReleaseControl(
        ctx,
        scope.organizationId,
        scope.brokerageId
      );
      if (!replayed) {
        throw new Error("Lender portal release replay state is unavailable.");
      }
      return publicReleaseState(replayed);
    }

    const current = await getScopedReleaseControl(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    const currentStatus = current?.status ?? "disabled";
    const currentAccessRevision = current?.accessRevision ?? 0;
    if (
      currentStatus !== args.expectedStatus ||
      currentAccessRevision !== args.expectedAccessRevision
    ) {
      throw new Error(
        `Lender portal release changed concurrently; expected ${args.expectedStatus} at revision ${args.expectedAccessRevision}.`
      );
    }
    requireLegalReleaseTransition(currentStatus, args.nextStatus);
    if (
      currentStatus !== "disabled" &&
      current?.candidateSha !== candidateSha
    ) {
      throw new Error(
        "Disable the current lender portal candidate before changing its release SHA."
      );
    }
    if (
      currentStatus !== "disabled" &&
      current?.configurationHash !== configurationHash
    ) {
      throw new Error(
        "Disable the current lender portal candidate before changing its configuration."
      );
    }

    const now = Date.now();
    const activeProviderReservations =
      await reconcileActiveLenderPortalProviderReservations(
        ctx,
        scope.organizationId,
        now
      );
    if (
      args.nextStatus === "disabled" &&
      activeProviderReservations.length > 0
    ) {
      throw new Error(
        "Lender portal release cannot become disabled while provider reservations remain unresolved; enter draining and reconcile explicit provider outcomes first."
      );
    }
    const nextAccessRevision = currentAccessRevision + 1;
    const priorCanaryHash = await canaryScopeHash(
      current?.canaryRecipientWorkosUserIds ?? []
    );
    const nextCanaryHash = await canaryScopeHash(canaryRecipientWorkosUserIds);
    const patch = {
      accessRevision: nextAccessRevision,
      brokerageId: scope.brokerageId,
      candidateSha,
      canaryRecipientWorkosUserIds,
      configurationHash,
      ...(args.nextStatus === "disabled" ? { disabledAt: now } : {}),
      ...(args.nextStatus === "draining" ? { drainingAt: now } : {}),
      ...(args.nextStatus === "canary" || args.nextStatus === "enabled"
        ? { enabledAt: now }
        : {}),
      organizationId: scope.organizationId,
      reason,
      status: args.nextStatus,
      updatedAt: now,
      updatedByWorkosUserId: scope.workosUserId,
    } as const;
    const controlId: Id<"lenderPortalTenantReleaseControls"> = current
      ? current._id
      : await ctx.db.insert("lenderPortalTenantReleaseControls", {
          ...patch,
          createdAt: now,
        });
    if (current) {
      await ctx.db.patch(current._id, patch);
    }
    const newState = JSON.stringify({
      accessRevision: nextAccessRevision,
      activeProviderReservationCount: activeProviderReservations.length,
      candidateSha,
      canaryRecipientCount: canaryRecipientWorkosUserIds.length,
      canaryScopeHash: nextCanaryHash,
      configurationHash,
      status: args.nextStatus,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: scope.roles,
      actorWorkosUserId: scope.workosUserId,
      brokerageId: scope.brokerageId,
      command: "transitionLenderPortalRelease",
      createdAt: now,
      drawFlowCorrelationId: fingerprint,
      entityId: String(controlId),
      entityType: "lenderPortalTenantReleaseControls",
      eventType: "lender_portal.release.changed",
      newState,
      organizationId: scope.organizationId,
      priorState: JSON.stringify({
        accessRevision: currentAccessRevision,
        activeProviderReservationCount: activeProviderReservations.length,
        candidateSha: current?.candidateSha,
        canaryRecipientCount: current?.canaryRecipientWorkosUserIds.length ?? 0,
        canaryScopeHash: priorCanaryHash,
        configurationHash: current?.configurationHash,
        status: currentStatus,
      }),
      reason,
      reconciliationKey,
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: scope.brokerageId,
      createdAt: now,
      eventType: "lender_portal.release.changed",
      organizationId: scope.organizationId,
      payloadPreview: newState,
      relatedEntityId: String(controlId),
      relatedEntityType: "lenderPortalTenantReleaseControls",
      status: "pending",
    });
    const updated = await ctx.db.get(controlId);
    if (!updated) {
      throw new Error(
        "Lender portal release state is unavailable after update."
      );
    }
    return publicReleaseState(updated);
  })
  .public();

const operationalHealthValidator = v.object({
  alerts: v.array(v.string()),
  attempts: v.object({
    abandoned: v.number(),
    claimed: v.number(),
    failed: v.number(),
    terminal: v.number(),
  }),
  averageTerminalLatencyMs: v.optional(v.number()),
  incompleteSampling: v.boolean(),
  intents: v.object({
    actionRequired: v.number(),
    cancelled: v.number(),
    dispatching: v.number(),
    pending: v.number(),
    retryScheduled: v.number(),
    sentOrDelivered: v.number(),
    suppressed: v.number(),
  }),
  oldestQueuedAgeMs: v.optional(v.number()),
  providerReservations: v.object({
    active: v.number(),
    expiredLease: v.number(),
    reconciliationRequired: v.number(),
  }),
  release: releaseStateValidator,
  sampledIntentCount: v.number(),
  terminalHealthy: v.boolean(),
  thresholds: v.object({
    actionRequired: v.number(),
    abandonedAttempts: v.number(),
    failedAttempts: v.number(),
    oldestQueuedAgeMs: v.number(),
    queued: v.number(),
    retryScheduled: v.number(),
  }),
  truncated: v.boolean(),
});

export const getLenderPortalOperationalHealth = authenticatedQuery
  .input({ now: v.number(), organizationId: v.string() })
  .returns(operationalHealthValidator)
  .handler(async (ctx, args) => {
    const scope = await requireTenantReleaseOperator(ctx, args.organizationId);
    const control = await getScopedReleaseControl(
      ctx,
      scope.organizationId,
      scope.brokerageId
    );
    if (!Number.isSafeInteger(args.now) || args.now < 0) {
      throw new Error("Lender portal operational health time is invalid.");
    }
    const now = args.now;
    const kinds = [
      "lender_portal_approval_required",
      "lender_portal_proposal_updated_after_decline",
      "lender_portal_withdrawal",
      "lender_portal_approval_outcome",
    ] as const;
    const intentSamples = await Promise.all(
      kinds.map((kind) =>
        ctx.db
          .query("communicationIntents")
          .withIndex("by_organizationId_and_kind_and_createdAt", (query) =>
            query.eq("organizationId", scope.organizationId).eq("kind", kind)
          )
          .order("desc")
          .take(MAX_OPERATIONAL_ROWS + 1)
      )
    );
    const mergedIntents = intentSamples
      .flatMap((sample) => sample.slice(0, MAX_OPERATIONAL_ROWS))
      .sort((left, right) => right.createdAt - left.createdAt);
    const intentTruncated =
      intentSamples.some((sample) => sample.length > MAX_OPERATIONAL_ROWS) ||
      mergedIntents.length > MAX_OPERATIONAL_ROWS;
    const intents = mergedIntents.slice(0, MAX_OPERATIONAL_ROWS);
    const attemptSamples = await Promise.all(
      intents.map((intent) =>
        ctx.db
          .query("communicationAttempts")
          .withIndex("by_communicationIntentId_and_attemptNumber", (query) =>
            query.eq("communicationIntentId", intent._id)
          )
          .take(11)
      )
    );
    const attemptTruncated = attemptSamples.some(
      (sample) => sample.length > 10
    );
    const attempts = attemptSamples.flatMap((sample) => sample.slice(0, 10));
    const reservationSamples = await Promise.all(
      [...kinds, undefined].flatMap((kind) =>
        (["active", "expired"] as const).map((state) =>
          ctx.db
            .query("communicationProviderReservations")
            .withIndex("by_org_kind_state_lease", (query) =>
              query
                .eq("organizationId", scope.organizationId)
                .eq("communicationKind", kind)
                .eq("state", state)
            )
            .take(MAX_OPERATIONAL_ROWS + 1)
        )
      )
    );
    const directLenderReservations = reservationSamples
      .slice(0, kinds.length * 2)
      .flatMap((sample) => sample.slice(0, MAX_OPERATIONAL_ROWS));
    const legacyReservations = reservationSamples
      .slice(kinds.length * 2)
      .flatMap((sample) => sample.slice(0, MAX_OPERATIONAL_ROWS));
    const legacyReservationIntents = await Promise.all(
      legacyReservations.map((reservation) =>
        ctx.db.get(reservation.communicationIntentId)
      )
    );
    const lenderReservations = [
      ...directLenderReservations,
      ...legacyReservations.filter((_reservation, index) =>
        legacyReservationIntents[index]?.kind.startsWith("lender_portal_")
      ),
    ].slice(0, MAX_OPERATIONAL_ROWS);
    const reservationTruncated =
      reservationSamples.some(
        (sample) => sample.length > MAX_OPERATIONAL_ROWS
      ) ||
      directLenderReservations.length + legacyReservations.length >
        MAX_OPERATIONAL_ROWS;
    const incompleteSampling =
      intentTruncated || attemptTruncated || reservationTruncated;
    const truncated = incompleteSampling;
    const counts = {
      actionRequired: intents.filter((row) => row.status === "action_required")
        .length,
      cancelled: intents.filter((row) => row.status === "cancelled").length,
      dispatching: intents.filter((row) => row.status === "dispatching").length,
      pending: intents.filter((row) => row.status === "pending").length,
      retryScheduled: intents.filter((row) => row.status === "retry_scheduled")
        .length,
      sentOrDelivered: intents.filter(
        (row) => row.status === "sent" || row.status === "delivered"
      ).length,
      suppressed: intents.filter((row) => row.status === "suppressed").length,
    };
    const queued = intents.filter(
      (row) => row.status === "pending" || row.status === "retry_scheduled"
    );
    const oldestQueuedAt = queued.reduce<number | undefined>(
      (oldest, row) =>
        oldest === undefined ? row.createdAt : Math.min(oldest, row.createdAt),
      undefined
    );
    const oldestQueuedAgeMs =
      oldestQueuedAt === undefined
        ? undefined
        : Math.max(0, now - oldestQueuedAt);
    const terminalAttempts = attempts.filter(
      (attempt) => attempt.finishedAt !== undefined
    );
    const averageTerminalLatencyMs = terminalAttempts.length
      ? Math.round(
          terminalAttempts.reduce(
            (total, attempt) =>
              total + Math.max(0, attempt.finishedAt! - attempt.startedAt),
            0
          ) / terminalAttempts.length
        )
      : undefined;
    const alerts = [
      ...(counts.pending + counts.retryScheduled >
      LENDER_PORTAL_OPERATIONAL_THRESHOLDS.queued
        ? ["lender_portal_backlog_threshold_exceeded"]
        : []),
      ...(counts.retryScheduled >
      LENDER_PORTAL_OPERATIONAL_THRESHOLDS.retryScheduled
        ? ["lender_portal_retry_threshold_exceeded"]
        : []),
      ...(counts.actionRequired >
      LENDER_PORTAL_OPERATIONAL_THRESHOLDS.actionRequired
        ? ["lender_portal_action_required_threshold_exceeded"]
        : []),
      ...(attempts.filter((row) => row.state === "failed").length >=
      LENDER_PORTAL_OPERATIONAL_THRESHOLDS.failedAttempts
        ? ["lender_portal_failed_attempt_threshold_exceeded"]
        : []),
      ...(attempts.filter((row) => row.state === "abandoned").length >
      LENDER_PORTAL_OPERATIONAL_THRESHOLDS.abandonedAttempts
        ? ["lender_portal_abandoned_attempt_threshold_exceeded"]
        : []),
      ...(oldestQueuedAgeMs !== undefined &&
      oldestQueuedAgeMs > LENDER_PORTAL_OPERATIONAL_THRESHOLDS.oldestQueuedAgeMs
        ? ["lender_portal_queue_age_threshold_exceeded"]
        : []),
      ...(incompleteSampling
        ? ["lender_portal_operational_sample_incomplete"]
        : []),
    ];
    return {
      alerts,
      attempts: {
        abandoned: attempts.filter((row) => row.state === "abandoned").length,
        claimed: attempts.filter((row) => row.state === "claimed").length,
        failed: attempts.filter((row) => row.state === "failed").length,
        terminal: terminalAttempts.length,
      },
      averageTerminalLatencyMs,
      incompleteSampling,
      intents: counts,
      oldestQueuedAgeMs,
      providerReservations: {
        active: lenderReservations.filter(
          (reservation) =>
            reservation.state === "active" && reservation.leaseExpiresAt > now
        ).length,
        expiredLease: lenderReservations.filter(
          (reservation) =>
            reservation.state === "expired" || reservation.leaseExpiresAt <= now
        ).length,
        reconciliationRequired: lenderReservations.filter(
          (reservation) =>
            reservation.state === "expired" || reservation.leaseExpiresAt <= now
        ).length,
      },
      release: publicReleaseState(control),
      sampledIntentCount: intents.length,
      terminalHealthy: alerts.length === 0 && !incompleteSampling,
      thresholds: LENDER_PORTAL_OPERATIONAL_THRESHOLDS,
      truncated,
    };
  })
  .public();

/**
 * Delivery-time release gate used by the existing communication worker. It is
 * intentionally identity-free and fail-safe because worker execution has no
 * user token. Current recipient/resource authorization remains a separate,
 * mandatory check immediately before provider submission.
 */
export async function lenderPortalDeliveryReleaseReason(
  ctx: ReleaseReadCtx,
  intent: Doc<"communicationIntents">
): Promise<string | null> {
  return (
    (await lenderPortalDeliveryReleaseDecision(ctx, intent))?.reason ?? null
  );
}

export async function lenderPortalDeliveryReleaseDecision(
  ctx: ReleaseReadCtx,
  intent: Doc<"communicationIntents">
): Promise<{ accessRevision: number; reason: string } | null> {
  if (!intent.kind.startsWith("lender_portal_")) {
    return null;
  }
  const control = await ctx.db
    .query("lenderPortalTenantReleaseControls")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", intent.organizationId)
    )
    .unique();
  if (
    !control ||
    control.brokerageId !== intent.brokerageId ||
    control.status === "disabled" ||
    control.status === "draining"
  ) {
    return {
      accessRevision: control?.accessRevision ?? 0,
      reason: LENDER_PORTAL_RELEASE_PAUSED_REASON,
    };
  }
  if (control.status === "enabled") {
    return null;
  }
  const recipientWorkosUserId = lenderPortalRecipientWorkosUserId(
    intent.payloadSnapshot
  );
  return recipientWorkosUserId &&
    control.canaryRecipientWorkosUserIds.includes(recipientWorkosUserId)
    ? null
    : {
        accessRevision: control.accessRevision,
        reason: LENDER_PORTAL_CANARY_BLOCKED_REASON,
      };
}

export async function lenderPortalDeliveryReleaseAccessRevision(
  ctx: ReleaseReadCtx,
  intent: Doc<"communicationIntents">
): Promise<number | undefined> {
  if (!intent.kind.startsWith("lender_portal_")) return undefined;
  const control = await ctx.db
    .query("lenderPortalTenantReleaseControls")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", intent.organizationId)
    )
    .unique();
  if (!control || control.brokerageId !== intent.brokerageId) return undefined;
  return control.accessRevision;
}

export async function requireTenantReleaseOperator(
  ctx: (QueryCtx | MutationCtx) & {
    viewer: { organizationId?: string; roles: string[]; subject: string };
  },
  organizationId: string
) {
  const normalizedOrganizationId = organizationId.trim();
  if (!normalizedOrganizationId) {
    throw new Error("Lender portal release organization is required.");
  }
  if (ctx.viewer.organizationId !== normalizedOrganizationId) {
    throw new Error("Forbidden: lender portal release tenant context");
  }
  await requireActiveWorkosUser(ctx, ctx.viewer.subject);
  const [organization, memberships, brokerage] = await Promise.all([
    ctx.db
      .query("workosOrganizations")
      .withIndex("by_workos_organization_id", (query) =>
        query.eq("workosOrganizationId", normalizedOrganizationId)
      )
      .unique(),
    ctx.db
      .query("workosOrganizationMemberships")
      .withIndex("by_user_and_organization", (query) =>
        query
          .eq("workosUserId", ctx.viewer.subject)
          .eq("workosOrganizationId", normalizedOrganizationId)
      )
      .take(20),
    ctx.db
      .query("brokerages")
      .withIndex("by_workos_organization", (query) =>
        query.eq("workosOrganizationId", normalizedOrganizationId)
      )
      .unique(),
  ]);
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active"
  );
  const projectedRoles = new Set(
    activeMemberships.flatMap((membership) => [
      membership.roleSlug,
      ...membership.roleSlugs,
    ])
  );
  const operatorRoles = ctx.viewer.roles.filter(
    (role) => role === "admin" || role === "principle-broker"
  );
  if (
    !organization ||
    organization.status !== "active" ||
    !brokerage ||
    brokerage.status !== "active" ||
    activeMemberships.length === 0 ||
    operatorRoles.length === 0 ||
    !operatorRoles.some((role) => projectedRoles.has(role))
  ) {
    throw new Error(
      "Forbidden: active administrator or principal broker membership required"
    );
  }
  return {
    brokerageId: brokerage._id,
    organizationId: normalizedOrganizationId,
    roles: operatorRoles,
    workosUserId: ctx.viewer.subject,
  };
}
