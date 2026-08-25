import type { Doc, Id } from "../_generated/dataModel";
import { operationalRequestFingerprint } from "../build_operational_idempotency";
import { validateCompleteProposalRevisionLenderSnapshot } from "../proposal_revision_lender_snapshot";
import type { MutationCtx, QueryCtx } from "../types";

const MAX_CANARY_RECIPIENTS = 100;
const MAX_RELEASE_READINESS_PROPOSALS = 100;
const CANDIDATE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const CONFIGURATION_HASH_PATTERN = /^[0-9a-f]{64}$/;
type ReleaseStatus = "disabled" | "canary" | "enabled" | "draining";
type ReleaseReadCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function requirePublishedLenderContentSnapshotReadiness(
  ctx: ReleaseReadCtx,
  organizationId: string,
  brokerageId: Id<"brokerages">
) {
  const proposals = await ctx.db
    .query("buildProposals")
    .withIndex("by_brokerage_and_organization", (query) =>
      query.eq("brokerageId", brokerageId).eq("organizationId", organizationId)
    )
    .take(MAX_RELEASE_READINESS_PROPOSALS + 1);
  if (proposals.length > MAX_RELEASE_READINESS_PROPOSALS) {
    throw new Error(
      `Lender portal snapshot readiness exceeds ${MAX_RELEASE_READINESS_PROPOSALS} proposals; complete the reviewed paginated Phase 9 release procedure before enablement.`
    );
  }

  let blockerCount = 0;
  for (const proposal of proposals) {
    const currentAssignments = await ctx.db
      .query("proposalLenderAssignments")
      .withIndex("by_proposal_status", (query) =>
        query.eq("proposalId", proposal._id).eq("status", "current")
      )
      .take(2);
    if (currentAssignments.length === 0) {
      continue;
    }
    if (
      currentAssignments.length !== 1 ||
      !proposal.currentProposalRevisionId
    ) {
      blockerCount += 1;
      continue;
    }

    const assignment = currentAssignments[0];
    const revision = await ctx.db.get(proposal.currentProposalRevisionId);
    if (!(assignment && revision)) {
      blockerCount += 1;
      continue;
    }
    const validation = await validateCompleteProposalRevisionLenderSnapshot(
      ctx,
      { assignment, brokerageId, organizationId, proposal, revision }
    );
    if (!validation.ok) {
      blockerCount += 1;
    }
  }

  if (blockerCount > 0) {
    throw new Error(
      `Lender portal release requires complete immutable lender-content snapshots for every current assignment; ${blockerCount} current proposal revision(s) must be republished through the canonical Back Office review workflow.`
    );
  }
}

export async function getScopedReleaseControl(
  ctx: ReleaseReadCtx,
  organizationId: string,
  brokerageId: Id<"brokerages">
) {
  const control = await ctx.db
    .query("lenderPortalTenantReleaseControls")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", organizationId)
    )
    .unique();
  if (control && control.brokerageId !== brokerageId) {
    throw new Error("Forbidden: lender portal release brokerage scope");
  }
  return control;
}

export function publicReleaseState(
  control: Doc<"lenderPortalTenantReleaseControls"> | null
) {
  return {
    accessRevision: control?.accessRevision ?? 0,
    available: control?.status === "enabled" || control?.status === "canary",
    candidateSha: control?.candidateSha,
    canaryRecipientCount: control?.canaryRecipientWorkosUserIds.length ?? 0,
    configurationHash: control?.configurationHash,
    status: control?.status ?? ("disabled" as const),
    updatedAt: control?.updatedAt,
  };
}

export function requireLegalReleaseTransition(
  currentStatus: ReleaseStatus,
  nextStatus: ReleaseStatus
) {
  const legal =
    (currentStatus === "disabled" &&
      (nextStatus === "disabled" ||
        nextStatus === "canary" ||
        nextStatus === "enabled")) ||
    (currentStatus === "canary" &&
      (nextStatus === "disabled" ||
        nextStatus === "enabled" ||
        nextStatus === "draining")) ||
    (currentStatus === "enabled" &&
      (nextStatus === "canary" ||
        nextStatus === "disabled" ||
        nextStatus === "draining")) ||
    (currentStatus === "draining" && nextStatus === "disabled");
  if (!legal) {
    throw new Error(
      `Illegal lender portal release transition: ${currentStatus} -> ${nextStatus}.`
    );
  }
}

export function requiredCandidateSha(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!CANDIDATE_SHA_PATTERN.test(normalized)) {
    throw new Error("Lender portal candidate SHA must be a full Git SHA.");
  }
  return normalized;
}

export function requiredConfigurationHash(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!CONFIGURATION_HASH_PATTERN.test(normalized)) {
    throw new Error(
      "Lender portal configuration hash must be a SHA-256 hex digest."
    );
  }
  return normalized;
}

export function requiredReason(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1000) {
    throw new Error(
      "Lender portal release reason must be 1 to 1000 characters."
    );
  }
  return normalized;
}

export function requiredIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Error(
      "Lender portal release idempotency key must be 1 to 200 characters."
    );
  }
  return normalized;
}

export function requireTrustedRuntimeReleaseProvenance(
  candidateSha: string,
  configurationHash: string
) {
  const runtimeCandidateSha =
    process.env.LENDER_PORTAL_RELEASE_CANDIDATE_SHA?.trim().toLowerCase();
  const runtimeConfigurationHash =
    process.env.LENDER_PORTAL_RELEASE_CONFIGURATION_HASH?.trim().toLowerCase();
  if (
    runtimeCandidateSha !== candidateSha ||
    runtimeConfigurationHash !== configurationHash
  ) {
    throw new Error(
      "Lender portal release cannot enable because the running deployment does not prove the configured candidate SHA and configuration hash."
    );
  }
}

export async function canaryScopeHash(recipientIds: string[]) {
  return await operationalRequestFingerprint({
    recipientWorkosUserIds: [...recipientIds].sort(),
  });
}

export async function reconcileActiveLenderPortalProviderReservations(
  ctx: MutationCtx,
  organizationId: string,
  now: number
) {
  const kinds = [
    "lender_portal_approval_required",
    "lender_portal_proposal_updated_after_decline",
    "lender_portal_withdrawal",
    "lender_portal_approval_outcome",
  ] as const;
  const samples = await Promise.all(
    [...kinds, undefined].flatMap((kind) =>
      (["active", "expired"] as const).map((state) =>
        ctx.db
          .query("communicationProviderReservations")
          .withIndex("by_org_kind_state_lease", (query) =>
            query
              .eq("organizationId", organizationId)
              .eq("communicationKind", kind)
              .eq("state", state)
          )
          .take(101)
      )
    )
  );
  if (
    samples.some((sample) => sample.length > 100) ||
    samples.reduce((total, sample) => total + sample.length, 0) > 100
  ) {
    throw new Error(
      "Lender portal provider reservation inventory exceeded its safe boundary."
    );
  }
  const direct = samples.slice(0, kinds.length * 2).flat();
  const legacy = samples.slice(kinds.length * 2).flat();
  const legacyIntents = await Promise.all(
    legacy.map((reservation) => ctx.db.get(reservation.communicationIntentId))
  );
  const reservations = [
    ...direct,
    ...legacy.filter((_reservation, index) =>
      legacyIntents[index]?.kind.startsWith("lender_portal_")
    ),
  ];
  const unresolved: Array<(typeof reservations)[number]> = [];
  for (const reservation of reservations) {
    if (reservation.state === "active" && reservation.leaseExpiresAt <= now) {
      await ctx.db.patch(reservation._id, {
        state: "expired",
        updatedAt: now,
      });
    }
    // Lease expiry is not evidence that the provider did not accept a request.
    // Keep both active and expired reservations blocking until a durable
    // provider outcome resolves the attempt.
    unresolved.push(reservation);
  }
  return unresolved;
}

export function normalizeCanaryRecipients(values: string[]) {
  const normalized = [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].sort();
  if (normalized.length > MAX_CANARY_RECIPIENTS) {
    throw new Error(
      `Lender portal canary allowlist exceeds ${MAX_CANARY_RECIPIENTS} recipients.`
    );
  }
  return normalized;
}

export function lenderPortalRecipientWorkosUserId(payloadSnapshot: string) {
  const payload = safeObject(payloadSnapshot);
  return typeof payload?.recipientWorkosUserId === "string" &&
    payload.recipientWorkosUserId.trim()
    ? payload.recipientWorkosUserId.trim()
    : null;
}

export function safeObject(
  value: string | undefined
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function isReleaseStatus(value: unknown): value is ReleaseStatus {
  return (
    value === "disabled" ||
    value === "canary" ||
    value === "enabled" ||
    value === "draining"
  );
}
