/**
 * Production proposals contractor policy helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { normalizeRequiredText } from "./proposal_cost_validation.js";
import { collectByIndex } from "./storage_helpers.js";

export async function assertBackofficeProposalRead(
  ctx: QueryCtx | MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    roles: RoleSlug[];
    subject: string;
  },
  proposal: Doc<"buildProposals">,
) {
  if (canReadBackofficeProposal(auth, proposal)) {
    return;
  }
  if (
    auth.roles.includes("broker-staff") &&
    (await hasPermission(
      ctx,
      auth.brokerage.workosOrganizationId,
      auth.roles,
      "proposals:read",
    ))
  ) {
    return;
  }

  throw new Error("Forbidden: proposal scope");
}

export function canReadBackofficeProposal(
  auth: {
    roles: RoleSlug[];
  },
  _proposal: Doc<"buildProposals">,
) {
  if (
    auth.roles.includes("admin") ||
    auth.roles.includes("principle-broker") ||
    auth.roles.includes("broker")
  ) {
    return true;
  }
  return false;
}

function canWriteBackofficeProposal(
  auth: { roles: RoleSlug[]; subject: string },
  proposal: Doc<"buildProposals">,
) {
  if (auth.roles.includes("admin") || auth.roles.includes("principle-broker")) {
    return true;
  }
  return (
    auth.roles.includes("broker") &&
    proposal.assignedBrokerWorkosUserId === auth.subject
  );
}

export function requireBackofficeProposalWrite(
  auth: { roles: RoleSlug[]; subject: string },
  proposal: Doc<"buildProposals">,
) {
  if (canWriteBackofficeProposal(auth, proposal)) {
    return;
  }
  throw new Error("Forbidden: proposal write");
}

export function requireAnyRole(
  actual: readonly RoleSlug[],
  allowed: readonly RoleSlug[] | readonly string[],
) {
  const allowedRoles: readonly string[] = allowed;
  if (!actual.some((role) => allowedRoles.includes(role))) {
    throw new Error("Forbidden: role");
  }
}

export function normalizeOptionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function activeBuildCompletionReviewRecord(
  review: unknown,
): Record<string, unknown> {
  return review && typeof review === "object" && !Array.isArray(review)
    ? (review as Record<string, unknown>)
    : {};
}

export function activeBuildCompletionReviewNote(review: unknown) {
  const value = activeBuildCompletionReviewRecord(review).note;
  return typeof value === "string" ? normalizeOptionalString(value) : undefined;
}

export function activeBuildPendingCompletionReview(review: unknown) {
  const record = activeBuildCompletionReviewRecord(review);
  if (record.status === "approved" || record.status === "rejected") {
    return record;
  }
  const { note: _obsoleteRequestedChange, ...withoutRequestedChange } = record;
  return {
    ...withoutRequestedChange,
    status: "pending",
  };
}

export function activeBuildCompletionReviewWithSiteVisit(
  review: unknown,
  siteVisit: Record<string, unknown>,
  reviewedAt: string,
) {
  const record = activeBuildCompletionReviewRecord(review);
  const hasExplicitRevisionRequest =
    record.status === "revisionRequested" &&
    Boolean(activeBuildCompletionReviewNote(record));
  const status =
    record.status === "approved" || record.status === "rejected"
      ? record.status
      : hasExplicitRevisionRequest
        ? "revisionRequested"
        : "pending";
  return {
    ...record,
    reviewedAt: record.reviewedAt ?? reviewedAt,
    siteVisit,
    status,
  };
}

export function normalizeIsoDateOnly(value: string, label: string) {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
  return trimmed;
}

export function normalizeOptionalMoneyCents(value?: number) {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Contractor cost value must be a finite number.");
  }
  return Math.max(0, Math.round(value));
}

export function normalizeOptionalHours(value?: number) {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Contractor hours value must be a finite number.");
  }
  return Math.max(0, Math.round(value * 100) / 100);
}

export function deriveContractorAssignmentCost(input: {
  hours?: number;
  rateCents?: number;
  rateUnit?: "hour" | "day" | "fixed";
}) {
  if (input.rateCents === undefined) {
    return;
  }
  if (input.rateUnit === "fixed") {
    return input.rateCents;
  }
  if (input.rateUnit === "hour" && input.hours !== undefined) {
    return Math.round(input.rateCents * input.hours);
  }
  return;
}

export function normalizeQualityRating(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Contractor quality rating must be a finite number.");
  }
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) {
    throw new Error("Contractor quality rating must be between 1 and 5.");
  }
  return rounded;
}

export async function getScopedContractorOrThrow(
  ctx: QueryCtx | MutationCtx,
  contractorId: Id<"contractorProfiles">,
  brokerageId: Id<"brokerages">,
) {
  const contractor = await ctx.db.get(contractorId);
  if (!contractor || contractor.brokerageId !== brokerageId) {
    throw new Error("Production contractor not found.");
  }
  return contractor;
}

export async function resolveDraftProposalContractorProfile(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      roles: RoleSlug[];
      subject: string;
    };
    contractorId?: Id<"contractorProfiles">;
    contractorName: string;
    now: number;
    role: string;
    workosOrganizationId: string;
  },
) {
  if (input.contractorId) {
    const contractor = await getScopedContractorOrThrow(
      ctx,
      input.contractorId,
      input.auth.brokerage._id,
    );
    if (contractor.status !== "active") {
      throw new Error("Production contractor is inactive.");
    }
    return input.contractorId;
  }

  const contractorName = normalizeRequiredText(
    input.contractorName,
    "Contractor name",
  );
  const existing = (
    await ctx.db
      .query("contractorProfiles")
      .withIndex("by_brokerage", (q) =>
        q.eq("brokerageId", input.auth.brokerage._id),
      )
      .collect()
  ).find(
    (contractor) =>
      contractor.status === "active" &&
      contractor.name.trim().toLowerCase() === contractorName.toLowerCase(),
  );
  if (existing) {
    return existing._id;
  }

  const contractorId = await ctx.db.insert("contractorProfiles", {
    brokerageId: input.auth.brokerage._id,
    createdAt: input.now,
    kind: "company",
    name: contractorName,
    onboardingStatus: "profile_only",
    organizationId: input.workosOrganizationId,
    status: "active",
    trades: input.role.trim() ? [input.role.trim()] : [],
    updatedAt: input.now,
  });
  await writeContractorProfileEvent(ctx, {
    auth: input.auth,
    command: "saveDraftProposalPackage",
    contractorId,
    eventType: "contractor.profile.created",
    newState: JSON.stringify({
      createdFromDraftPlanning: true,
      name: contractorName,
      trades: input.role.trim() ? [input.role.trim()] : [],
    }),
    organizationId: input.workosOrganizationId,
  });
  return contractorId;
}

export async function replaceContractorOperatingRows(
  ctx: MutationCtx,
  input: {
    availabilityWindows: Array<{
      dayOfWeek: number;
      effectiveEndDate?: string;
      effectiveStartDate?: string;
      endMinute: number;
      startMinute: number;
      timezone: string;
    }>;
    brokerageId: Id<"brokerages">;
    capabilities: Array<{
      capabilityKey: string;
      label: string;
      milestoneArchetypeKey?: string;
      notes?: string;
      trade?: string;
    }>;
    contractorId: Id<"contractorProfiles">;
    equipment: Array<{
      equipmentKey: string;
      name: string;
      notes?: string;
      quantity: number;
    }>;
    now: number;
    organizationId: string;
  },
) {
  const [capabilities, equipment, windows] = await Promise.all([
    collectByIndex(
      ctx,
      "contractorCapabilities",
      "by_contractor",
      input.contractorId,
    ),
    collectByIndex(
      ctx,
      "contractorEquipment",
      "by_contractor",
      input.contractorId,
    ),
    collectByIndex(
      ctx,
      "contractorAvailabilityWindows",
      "by_contractor",
      input.contractorId,
    ),
  ]);
  for (const row of capabilities) {
    await ctx.db.delete(row._id);
  }
  for (const row of equipment) {
    await ctx.db.delete(row._id);
  }
  for (const row of windows) {
    await ctx.db.delete(row._id);
  }

  for (const capability of input.capabilities) {
    const key = capability.capabilityKey.trim();
    const label = capability.label.trim();
    if (!(key && label)) {
      continue;
    }
    await ctx.db.insert("contractorCapabilities", {
      brokerageId: input.brokerageId,
      capabilityKey: key,
      contractorId: input.contractorId,
      createdAt: input.now,
      label,
      milestoneArchetypeKey: normalizeOptionalString(
        capability.milestoneArchetypeKey,
      ),
      notes: normalizeOptionalString(capability.notes),
      organizationId: input.organizationId,
      trade: normalizeOptionalString(capability.trade),
      updatedAt: input.now,
    });
  }

  for (const row of input.equipment) {
    const key = row.equipmentKey.trim();
    const name = row.name.trim();
    if (!(key && name)) {
      continue;
    }
    await ctx.db.insert("contractorEquipment", {
      brokerageId: input.brokerageId,
      contractorId: input.contractorId,
      createdAt: input.now,
      equipmentKey: key,
      name,
      notes: normalizeOptionalString(row.notes),
      organizationId: input.organizationId,
      quantity: Math.max(0, Math.round(row.quantity)),
      updatedAt: input.now,
    });
  }

  for (const window of input.availabilityWindows) {
    await ctx.db.insert("contractorAvailabilityWindows", {
      brokerageId: input.brokerageId,
      contractorId: input.contractorId,
      createdAt: input.now,
      dayOfWeek: Math.max(0, Math.min(6, Math.round(window.dayOfWeek))),
      effectiveEndDate: normalizeOptionalString(window.effectiveEndDate),
      effectiveStartDate: normalizeOptionalString(window.effectiveStartDate),
      endMinute: Math.max(0, Math.min(24 * 60, Math.round(window.endMinute))),
      organizationId: input.organizationId,
      startMinute: Math.max(
        0,
        Math.min(24 * 60, Math.round(window.startMinute)),
      ),
      timezone: window.timezone.trim() || "UTC",
      updatedAt: input.now,
    });
  }
}

export async function hydrateContractorProfiles(
  ctx: QueryCtx | MutationCtx,
  profiles: Doc<"contractorProfiles">[],
) {
  return await Promise.all(
    profiles.map(async (profile) => {
      const [capabilities, equipment, availabilityWindows] = await Promise.all([
        collectByIndex(
          ctx,
          "contractorCapabilities",
          "by_contractor",
          profile._id,
        ),
        collectByIndex(
          ctx,
          "contractorEquipment",
          "by_contractor",
          profile._id,
        ),
        collectByIndex(
          ctx,
          "contractorAvailabilityWindows",
          "by_contractor",
          profile._id,
        ),
      ]);
      return {
        ...profile,
        availabilityWindows: availabilityWindows.sort(
          (a: any, b: any) =>
            a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
        ),
        capabilities: capabilities.sort((a: any, b: any) =>
          a.capabilityKey.localeCompare(b.capabilityKey),
        ),
        defaultPayRateUnit: profile.defaultPayRateUnit ?? "hour",
        equipment: equipment.sort((a: any, b: any) =>
          a.equipmentKey.localeCompare(b.equipmentKey),
        ),
        kind: profile.kind ?? "company",
        onboardingStatus:
          profile.onboardingStatus ??
          (profile.accountWorkosUserId ? "account_linked" : "profile_only"),
      };
    }),
  );
}

export async function addContractorRoleToExistingMembership(
  ctx: MutationCtx,
  input: {
    now: number;
    workosOrganizationId: string;
    workosUserId: string;
  },
) {
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.workosUserId))
    .filter((q) =>
      q.eq(q.field("workosOrganizationId"), input.workosOrganizationId),
    )
    .first();
  if (!membership) {
    return;
  }
  const roleSlugs = [...new Set([...membership.roleSlugs, "contractor"])];
  await ctx.db.patch(membership._id, {
    roleSlug: membership.roleSlug ?? "contractor",
    roleSlugs,
    updatedAt: input.now,
  });
}

export async function writeContractorProfileEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    contractorId: Id<"contractorProfiles">;
    eventType: string;
    newState?: string;
    organizationId: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: String(input.contractorId),
    entityType: "contractorProfile",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      contractorId: input.contractorId,
      newState: input.newState,
    }),
    relatedEntityId: input.contractorId,
    relatedEntityType: "contractorProfile",
    status: "pending",
  });
}
