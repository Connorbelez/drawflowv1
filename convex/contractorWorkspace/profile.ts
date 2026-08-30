import { v } from "convex/values";

import type { AuthorizedViewer } from "../authz";
import { patchCanonicalContractorProfile } from "../contractor_profile_application";
import type { Doc, Id, MutationCtx } from "../types";
import { contractorRoleMutation, contractorRoleQuery } from "./access";
export const getContractorProfile = contractorRoleQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const contractor = ctx.contractorProfile;
    const [capabilities, equipment, availabilityWindows] = await Promise.all([
      ctx.db
        .query("contractorCapabilities")
        .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
        .collect(),
      ctx.db
        .query("contractorEquipment")
        .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
        .collect(),
      ctx.db
        .query("contractorAvailabilityWindows")
        .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
        .collect(),
    ]);

    return {
      profile: redactContractorProfileSummary(contractor),
      operational: {
        trades: contractor.trades,
        capabilities: capabilities.map((c) => ({
          _id: c._id,
          capabilityKey: c.capabilityKey,
          label: c.label,
          trade: c.trade ?? null,
          milestoneArchetypeKey: c.milestoneArchetypeKey ?? null,
          notes: c.notes ?? null,
        })),
        equipment: equipment.map((e) => ({
          _id: e._id,
          equipmentKey: e.equipmentKey,
          name: e.name,
          quantity: e.quantity,
          notes: e.notes ?? null,
        })),
        availabilityWindows: availabilityWindows.map((w) => ({
          _id: w._id,
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          timezone: w.timezone,
          effectiveStartDate: w.effectiveStartDate ?? null,
          effectiveEndDate: w.effectiveEndDate ?? null,
        })),
        website: contractor.website ?? null,
        description: contractor.description ?? null,
        phone: contractor.phone ?? null,
        city: contractor.city ?? null,
        serviceArea: {
          primaryCity: contractor.serviceAreaPrimaryCity ?? null,
          radiusKm: contractor.serviceAreaRadiusKm ?? null,
          postalPrefixes: contractor.serviceAreaPostalPrefixes ?? [],
          notes: contractor.serviceAreaNotes ?? null,
        },
        rates: {
          defaultPayRateCents: contractor.defaultPayRateCents ?? null,
          defaultPayRateUnit: contractor.defaultPayRateUnit ?? null,
        },
        complianceNotes: contractor.complianceNotes ?? null,
      },
      readiness: computeProfileReadiness(contractor),
      // Raw/internal ratings are never exposed to contractors (PRD §3.18, §18).
    };
  })
  .public();

// ---------------------------------------------------------------------------
// updateContractorOperationalProfile (PRD §8.8 operational edits)
// ---------------------------------------------------------------------------

const contractorCapabilityInput = v.object({
  capabilityKey: v.string(),
  label: v.string(),
  trade: v.optional(v.string()),
  milestoneArchetypeKey: v.optional(v.string()),
  notes: v.optional(v.string()),
});

const contractorEquipmentInput = v.object({
  equipmentKey: v.string(),
  name: v.string(),
  quantity: v.number(),
  notes: v.optional(v.string()),
});

const contractorAvailabilityWindowInput = v.object({
  dayOfWeek: v.number(),
  startMinute: v.number(),
  endMinute: v.number(),
  timezone: v.string(),
  effectiveStartDate: v.optional(v.string()),
  effectiveEndDate: v.optional(v.string()),
});

export const updateContractorOperationalProfile = contractorRoleMutation
  .input({
    trades: v.array(v.string()),
    capabilities: v.array(contractorCapabilityInput),
    equipment: v.array(contractorEquipmentInput),
    availabilityWindows: v.array(contractorAvailabilityWindowInput),
    website: v.optional(v.string()),
    description: v.optional(v.string()),
    phone: v.optional(v.string()),
    serviceAreaPrimaryCity: v.optional(v.string()),
    serviceAreaRadiusKm: v.optional(v.number()),
    serviceAreaPostalPrefixes: v.optional(v.array(v.string())),
    serviceAreaNotes: v.optional(v.string()),
    complianceNotes: v.optional(v.string()),
  })
  .returns(v.object({ contractorId: v.id("contractorProfiles") }))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const now = Date.now();
    const viewer = (ctx as { viewer: AuthorizedViewer }).viewer;

    const priorState = {
      trades: contractor.trades,
      website: contractor.website,
      description: contractor.description,
      phone: contractor.phone,
      serviceAreaPrimaryCity: contractor.serviceAreaPrimaryCity,
      serviceAreaRadiusKm: contractor.serviceAreaRadiusKm,
      serviceAreaNotes: contractor.serviceAreaNotes,
      complianceNotes: contractor.complianceNotes,
    };

    await patchCanonicalContractorProfile(ctx, {
      brokerageId: contractor.brokerageId,
      contractorId: contractor._id,
      now,
      organizationId: contractor.organizationId,
      patch: {
        complianceNotes: normalizeOptionalString(args.complianceNotes),
        description: normalizeOptionalString(args.description),
        phone: normalizeOptionalString(args.phone),
        serviceAreaNotes: normalizeOptionalString(args.serviceAreaNotes),
        serviceAreaPostalPrefixes: args.serviceAreaPostalPrefixes ?? undefined,
        serviceAreaPrimaryCity: normalizeOptionalString(
          args.serviceAreaPrimaryCity
        ),
        serviceAreaRadiusKm:
          args.serviceAreaRadiusKm === undefined
            ? undefined
            : Math.max(0, Math.round(args.serviceAreaRadiusKm)),
        trades: args.trades.map((t) => t.trim()).filter(Boolean),
        website: normalizeOptionalString(args.website),
      },
    });

    await replaceContractorOperatingRows(ctx, {
      contractorId: contractor._id,
      brokerageId: contractor.brokerageId,
      organizationId: contractor.organizationId,
      capabilities: args.capabilities,
      equipment: args.equipment,
      availabilityWindows: args.availabilityWindows,
      now,
    });

    await ctx.db.insert("auditEvents", {
      brokerageId: contractor.brokerageId,
      organizationId: contractor.organizationId,
      entityType: "contractorProfile",
      entityId: contractor._id,
      eventType: "contractor.profile.operational_updated",
      command: "updateContractorOperationalProfile",
      actorWorkosUserId: viewer.subject,
      actorRoles: viewer.roles,
      priorState: JSON.stringify(priorState),
      newState: JSON.stringify({
        trades: args.trades,
        capabilities: args.capabilities.length,
        equipment: args.equipment.length,
      }),
      warnings: [],
      createdAt: now,
    });

    return { contractorId: contractor._id };
  })
  .public();

/**
 * Submit an identity-sensitive change for review. These edits are NOT applied
 * directly (PRD §8.8): legal/company name when builder/backoffice-created,
 * primary email, tax/compliance docs, deactivation, merge/split, account
 * unlink. They create a review request + audit event for backoffice action.
 */
export const requestContractorProfileReview = contractorRoleMutation
  .input({
    reviewType: v.union(
      v.literal("legal_name_change"),
      v.literal("primary_email_change"),
      v.literal("compliance_docs"),
      v.literal("deactivation"),
      v.literal("merge"),
      v.literal("split"),
      v.literal("account_unlink")
    ),
    requestedFields: v.any(),
    reason: v.optional(v.string()),
  })
  .returns(v.id("contractorProfileReviewRequests"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const now = Date.now();
    const viewer = (ctx as { viewer: AuthorizedViewer }).viewer;

    const requestId = await ctx.db.insert("contractorProfileReviewRequests", {
      brokerageId: contractor.brokerageId,
      organizationId: contractor.organizationId,
      contractorId: contractor._id,
      reviewType: args.reviewType,
      status: "pending",
      requestedFields: args.requestedFields,
      priorState: JSON.stringify({
        email: contractor.email,
        name: contractor.name,
        source: contractor.source,
      }),
      reason: normalizeOptionalString(args.reason),
      requestedByWorkosUserId: viewer.subject,
      requestedByRole: "contractor",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditEvents", {
      brokerageId: contractor.brokerageId,
      organizationId: contractor.organizationId,
      entityType: "contractorProfile",
      entityId: contractor._id,
      eventType: "contractor.profile.review_requested",
      command: "requestContractorProfileReview",
      actorWorkosUserId: viewer.subject,
      actorRoles: viewer.roles,
      newState: JSON.stringify({ reviewType: args.reviewType, requestId }),
      reason: args.reason,
      warnings: [],
      createdAt: now,
    });

    return requestId;
  })
  .public();

// ---------------------------------------------------------------------------
// Redaction + readiness helpers
// ---------------------------------------------------------------------------

/**
 * Contractor-facing profile summary. Never includes account/membership
 * internals or any risk/audit fields beyond what the contractor owns.
 */
export function redactContractorProfileSummary(
  contractor: Doc<"contractorProfiles">
) {
  return {
    _id: contractor._id,
    name: contractor.name,
    kind: contractor.kind ?? "company",
    city: contractor.city ?? null,
    email: contractor.email ?? null,
    phone: contractor.phone ?? null,
    trades: contractor.trades,
    onboardingStatus: contractor.onboardingStatus ?? null,
    source: contractor.source ?? null,
    status: contractor.status,
  };
}

interface ProfileReadiness {
  completenessPercent: number;
  missingFields: string[];
}

/**
 * Operational completeness guidance (PRD §42). Rates are optional; missing
 * rates are surfaced as guidance, never as a blocker (PRD §3.20, §8.8).
 */
export function computeProfileReadiness(
  contractor: Doc<"contractorProfiles">
): ProfileReadiness {
  const missingFields: string[] = [];
  if (contractor.trades.length === 0) {
    missingFields.push("trades");
  }
  if (!(contractor.city || contractor.serviceAreaPrimaryCity)) {
    missingFields.push("service area");
  }
  if (!contractor.phone) {
    missingFields.push("phone");
  }
  if (contractor.defaultPayRateCents === undefined) {
    missingFields.push("default rate (optional)");
  }
  if (!contractor.description) {
    missingFields.push("description");
  }

  const total = 5;
  const completed = total - missingFields.length;
  const completenessPercent = Math.round((completed / total) * 100);
  return { completenessPercent, missingFields };
}

function normalizeOptionalString(value?: string): string | undefined {
  if (value === undefined) {
    return;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function replaceContractorOperatingRows(
  ctx: MutationCtx,
  input: {
    contractorId: Id<"contractorProfiles">;
    brokerageId: Id<"brokerages">;
    organizationId: string;
    capabilities: Array<{
      capabilityKey: string;
      label: string;
      trade?: string;
      milestoneArchetypeKey?: string;
      notes?: string;
    }>;
    equipment: Array<{
      equipmentKey: string;
      name: string;
      quantity: number;
      notes?: string;
    }>;
    availabilityWindows: Array<{
      dayOfWeek: number;
      startMinute: number;
      endMinute: number;
      timezone: string;
      effectiveStartDate?: string;
      effectiveEndDate?: string;
    }>;
    now: number;
  }
) {
  const [existingCapabilities, existingEquipment, existingWindows] =
    await Promise.all([
      ctx.db
        .query("contractorCapabilities")
        .withIndex("by_contractor", (q) =>
          q.eq("contractorId", input.contractorId)
        )
        .collect(),
      ctx.db
        .query("contractorEquipment")
        .withIndex("by_contractor", (q) =>
          q.eq("contractorId", input.contractorId)
        )
        .collect(),
      ctx.db
        .query("contractorAvailabilityWindows")
        .withIndex("by_contractor", (q) =>
          q.eq("contractorId", input.contractorId)
        )
        .collect(),
    ]);

  for (const row of [
    ...existingCapabilities,
    ...existingEquipment,
    ...existingWindows,
  ]) {
    await ctx.db.delete(row._id);
  }

  for (const capability of input.capabilities) {
    await ctx.db.insert("contractorCapabilities", {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      contractorId: input.contractorId,
      capabilityKey: capability.capabilityKey,
      label: capability.label,
      trade: capability.trade,
      milestoneArchetypeKey: capability.milestoneArchetypeKey,
      notes: capability.notes,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  for (const equipment of input.equipment) {
    await ctx.db.insert("contractorEquipment", {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      contractorId: input.contractorId,
      equipmentKey: equipment.equipmentKey,
      name: equipment.name,
      quantity: equipment.quantity,
      notes: equipment.notes,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  for (const window of input.availabilityWindows) {
    await ctx.db.insert("contractorAvailabilityWindows", {
      brokerageId: input.brokerageId,
      organizationId: input.organizationId,
      contractorId: input.contractorId,
      dayOfWeek: window.dayOfWeek,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
      timezone: window.timezone,
      effectiveStartDate: window.effectiveStartDate,
      effectiveEndDate: window.effectiveEndDate,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
}
