/**
 * Production proposals contractor active helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError } from "convex/values";
import { type RoleSlug } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { getActiveBuildMilestoneOrThrow } from "./active_planning.js";
import { normalizeOptionalString, normalizeOptionalMoneyCents, normalizeQualityRating, getScopedContractorOrThrow } from "./contractor_policy_helpers.js";
import { type ActiveBuildDeliveryAuth } from "./notification_delivery_helpers.js";

export function contractorDetailIntelligence(input: {
  assignments: Doc<"milestoneContractorAssignments">[];
  profile: any;
  proposalAssignments: Doc<"proposalMilestoneContractorAssignments">[];
  ratings: Doc<"contractorQualityRatings">[];
}) {
  const activeBuildAssignmentCount = input.assignments.filter(
    (assignment) => assignment.status !== "removed",
  ).length;
  const plannedAssignmentCount = input.proposalAssignments.filter(
    (assignment) => assignment.status === "planned",
  ).length;
  const scheduledHours =
    input.assignments.reduce(
      (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
      0,
    ) +
    input.proposalAssignments.reduce(
      (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
      0,
    );
  const weeklyWindowHours = (input.profile.availabilityWindows ?? []).reduce(
    (sum: number, window: any) =>
      sum + Math.max(0, window.endMinute - window.startMinute) / 60,
    0,
  );
  const capabilityPerformance = (input.profile.capabilities ?? []).map(
    (capability: any) => {
      const searchable = [
        capability.capabilityKey,
        capability.label,
        capability.trade,
        capability.milestoneArchetypeKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchingAssignments = input.assignments.filter((assignment) =>
        searchable.includes(assignment.milestoneKey.toLowerCase()),
      );
      const matchingRatings = input.ratings.filter((rating) =>
        matchingAssignments.some(
          (assignment) =>
            assignment.buildId === rating.buildId &&
            assignment.milestoneKey === rating.milestoneKey,
        ),
      );
      return {
        averageRating:
          matchingRatings.length === 0
            ? null
            : Math.round(
                (matchingRatings.reduce(
                  (sum, rating) => sum + rating.rating,
                  0,
                ) /
                  matchingRatings.length) *
                  10,
              ) / 10,
        capabilityKey: capability.capabilityKey,
        label: capability.label,
        ratingCount: matchingRatings.length,
        totalActualCostCents: matchingAssignments.reduce(
          (sum, assignment) => sum + (assignment.actualCostCents ?? 0),
          0,
        ),
        totalEstimatedCostCents: matchingAssignments.reduce(
          (sum, assignment) => sum + (assignment.estimatedCostCents ?? 0),
          0,
        ),
      };
    },
  );
  return {
    activeBuildAssignmentCount,
    capabilityPerformance,
    plannedAssignmentCount,
    scheduledHours: Math.round(scheduledHours * 100) / 100,
    utilizationPercent:
      weeklyWindowHours > 0
        ? Math.min(
            100,
            Math.round((scheduledHours / (weeklyWindowHours * 4)) * 100),
          )
        : null,
    weeklyWindowHours,
  };
}

export async function ensureBuildContractorAssignment(
  ctx: MutationCtx,
  input: {
    agreedRateCents?: number;
    agreedRateUnit?: "hour" | "day" | "fixed";
    auth: {
      brokerage: Doc<"brokerages">;
      build: Doc<"activeBuilds">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId: Id<"activeBuilds">;
    contractorId: Id<"contractorProfiles">;
    role: string;
    workosOrganizationId: string;
  },
) {
  const existing = await ctx.db
    .query("buildContractorAssignments")
    .withIndex("by_build_contractor", (q) =>
      q.eq("buildId", input.buildId).eq("contractorId", input.contractorId),
    )
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      agreedRateCents:
        normalizeOptionalMoneyCents(input.agreedRateCents) ??
        existing.agreedRateCents,
      agreedRateUnit: input.agreedRateUnit ?? existing.agreedRateUnit,
      role: input.role.trim() || existing.role,
      status: "active",
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("buildContractorAssignments", {
    brokerageId: input.auth.brokerage._id,
    buildId: input.buildId,
    contractorId: input.contractorId,
    createdAt: now,
    agreedRateCents: normalizeOptionalMoneyCents(input.agreedRateCents),
    agreedRateUnit: input.agreedRateUnit,
    organizationId: input.workosOrganizationId,
    role: input.role.trim() || "Contractor",
    status: "active",
    updatedAt: now,
  });
}

export async function resolveAssignmentSubmilestones(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    milestoneKey: string;
    submilestoneKeys: string[];
  },
) {
  if (input.submilestoneKeys.length === 0) {
    return [];
  }
  const submilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_build", (q) => q.eq("buildId", input.buildId))
    .filter((q) => q.eq(q.field("milestoneKey"), input.milestoneKey))
    .collect();
  return input.submilestoneKeys.map((key) => {
    const submilestone = submilestones.find((row) => row.key === key);
    if (!submilestone) {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_FOUND",
        message: "Submilestone is unavailable for this milestone.",
        submilestoneKey: key,
      });
    }
    return { id: submilestone._id, key: submilestone.key };
  });
}

export async function findMilestoneContractorAssignment(
  ctx: QueryCtx | MutationCtx,
  input: {
    buildId: Id<"activeBuilds">;
    contractorId: Id<"contractorProfiles">;
    milestoneKey: string;
    submilestoneKey?: string;
  },
) {
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_contractor_build", (q) =>
      q.eq("contractorId", input.contractorId).eq("buildId", input.buildId),
    )
    .collect();
  return (
    assignments.find(
      (assignment) =>
        assignment.milestoneKey === input.milestoneKey &&
        assignment.submilestoneKey === input.submilestoneKey,
    ) ?? null
  );
}

export async function ensurePendingBuildAssignmentAcknowledgement(
  ctx: MutationCtx,
  input: {
    assignmentId: Id<"milestoneContractorAssignments">;
    brokerageId: Id<"brokerages">;
    contractorId: Id<"contractorProfiles">;
    now: number;
    organizationId: string;
  },
) {
  const acknowledgements = await ctx.db
    .query("contractorAcknowledgements")
    .withIndex("by_build_assignment", (q) =>
      q.eq("buildAssignmentId", input.assignmentId),
    )
    .collect();
  const existing = acknowledgements.find(
    (acknowledgement) => acknowledgement.kind === "assignment",
  );
  if (existing) {
    await ctx.db.patch(existing._id, {
      acknowledgedAt: undefined,
      state: "pending_acknowledgement",
      updatedAt: input.now,
    });
    return existing._id;
  }
  return await ctx.db.insert("contractorAcknowledgements", {
    assignmentType: "build",
    brokerageId: input.brokerageId,
    buildAssignmentId: input.assignmentId,
    contractorId: input.contractorId,
    kind: "assignment",
    organizationId: input.organizationId,
    state: "pending_acknowledgement",
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export async function resolveBuildAssignmentAcknowledgement(
  ctx: MutationCtx,
  assignmentId: Id<"milestoneContractorAssignments">,
  now: number,
) {
  const acknowledgements = await ctx.db
    .query("contractorAcknowledgements")
    .withIndex("by_build_assignment", (q) =>
      q.eq("buildAssignmentId", assignmentId),
    )
    .collect();
  for (const acknowledgement of acknowledgements) {
    if (
      acknowledgement.kind === "assignment" &&
      acknowledgement.state !== "resolved"
    ) {
      await ctx.db.patch(acknowledgement._id, {
        state: "resolved",
        updatedAt: now,
      });
    }
  }
}

export async function upsertContractorAssignmentDelivery(
  ctx: MutationCtx,
  input: {
    assignmentId: Id<"milestoneContractorAssignments">;
    auth: ActiveBuildDeliveryAuth;
    contractor: Doc<"contractorProfiles">;
    milestone: Doc<"buildMilestones">;
    operation: "created" | "updated" | "removed";
  },
) {
  const recipientWorkosUserId = input.contractor.accountWorkosUserId;
  if (!recipientWorkosUserId) {
    return;
  }
  const now = Date.now();
  const activeKeys = [
    `contractor-assignment:${input.assignmentId}:created`,
    `contractor-assignment:${input.assignmentId}:updated`,
  ];
  if (input.operation !== "created") {
    for (const priorDedupeKey of activeKeys) {
      const priorDelivery = await ctx.db
        .query("recipientDeliveries")
        .withIndex("by_recipient_dedupe", (q) =>
          q
            .eq("organizationId", input.auth.build.organizationId)
            .eq("recipientWorkosUserId", recipientWorkosUserId)
            .eq("dedupeKey", priorDedupeKey),
        )
        .first();
      if (priorDelivery && priorDelivery.status !== "resolved") {
        await ctx.db.patch(priorDelivery._id, {
          status: "resolved",
          updatedAt: now,
        });
      }
    }
  }
  const dedupeKey = `contractor-assignment:${input.assignmentId}:${input.operation}`;
  const existing = await ctx.db
    .query("recipientDeliveries")
    .withIndex("by_recipient_dedupe", (q) =>
      q
        .eq("organizationId", input.auth.build.organizationId)
        .eq("recipientWorkosUserId", recipientWorkosUserId)
        .eq("dedupeKey", dedupeKey),
    )
    .first();
  const removed = input.operation === "removed";
  const delivery = {
    actionLabel: removed ? "View current work" : "Review assignment",
    actionRequired: !removed,
    body: removed
      ? `Your ${input.milestone.name} assignment is no longer active.`
      : `Review the ${input.milestone.name} scope and acknowledge it or request clarification.`,
    createdAt: now,
    entityId: String(input.assignmentId),
    entityLabel: `${input.auth.build.buildName} · ${input.milestone.name}`,
    entityType: "contractorAssignment",
    href: removed
      ? "/contractor/work"
      : `/contractor/builds/${input.auth.build._id}?assignmentId=${input.assignmentId}`,
    resolutionMode: "domain" as const,
    sourceLabel: "Builder",
    status: "unread" as const,
    title: removed
      ? `${input.milestone.name} assignment removed`
      : input.operation === "updated"
        ? `${input.milestone.name} assignment updated`
        : `${input.milestone.name} assignment ready`,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, delivery);
  } else {
    await ctx.db.insert("recipientDeliveries", {
      ...delivery,
      brokerageId: input.auth.brokerage._id,
      dedupeKey,
      organizationId: input.auth.build.organizationId,
      recipientWorkosUserId,
    });
  }
}

export async function insertContractorQualityRating(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Pick<Doc<"brokerages">, "_id">;
      build: Doc<"activeBuilds">;
      proposal: Pick<Doc<"buildProposals">, "_id">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId: Id<"activeBuilds">;
    contractorId: Id<"contractorProfiles">;
    milestoneKey: string;
    note?: string;
    rating: number;
    source: "builder_evidence" | "site_visit" | "backoffice";
    sourceEvidenceKey?: string;
    sourceVisitId?: string;
    submilestoneKey?: string;
    workosOrganizationId: string;
  },
) {
  const contractor = await getScopedContractorOrThrow(
    ctx,
    input.contractorId,
    input.auth.brokerage._id as Id<"brokerages">,
  );
  if (contractor.status !== "active") {
    throw new Error("Production contractor is inactive.");
  }
  const milestone = await getActiveBuildMilestoneOrThrow(
    ctx,
    input.buildId,
    input.milestoneKey,
  );
  const submilestone = input.submilestoneKey
    ? (
        await resolveAssignmentSubmilestones(ctx, {
          buildId: input.buildId,
          milestoneKey: input.milestoneKey,
          submilestoneKeys: [input.submilestoneKey],
        })
      )[0]
    : undefined;
  const assignment = await findMilestoneContractorAssignment(ctx, {
    buildId: input.buildId,
    contractorId: input.contractorId,
    milestoneKey: input.milestoneKey,
    submilestoneKey: input.submilestoneKey,
  });
  if (!assignment) {
    throw new Error("Contractor must be assigned before quality is rated.");
  }
  return await ctx.db.insert("contractorQualityRatings", {
    brokerageId: input.auth.brokerage._id as Id<"brokerages">,
    buildId: input.buildId,
    buildMilestoneId: milestone._id,
    buildSubmilestoneId: submilestone?.id,
    contractorId: input.contractorId,
    createdAt: Date.now(),
    createdByWorkosUserId: input.auth.subject,
    milestoneKey: input.milestoneKey,
    note: normalizeOptionalString(input.note),
    organizationId: input.workosOrganizationId,
    rating: normalizeQualityRating(input.rating),
    source: input.source,
    sourceEvidenceKey: normalizeOptionalString(input.sourceEvidenceKey),
    sourceVisitId: normalizeOptionalString(input.sourceVisitId),
    submilestoneKey: normalizeOptionalString(input.submilestoneKey),
  });
}

export async function recordQualityRatingForMilestoneAssignments(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      build: Doc<"activeBuilds">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    buildId: Id<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    note?: string;
    rating: number;
    source: "builder_evidence" | "site_visit" | "backoffice";
    workosOrganizationId: string;
  },
) {
  const assignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_build_milestone", (q) =>
      q.eq("buildId", input.buildId).eq("milestoneKey", input.milestone.key),
    )
    .collect();
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const key = `${assignment.contractorId}:${assignment.submilestoneKey ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    await insertContractorQualityRating(ctx, {
      auth: input.auth,
      buildId: input.buildId,
      contractorId: assignment.contractorId,
      milestoneKey: input.milestone.key,
      note: input.note,
      rating: input.rating,
      source: input.source,
      submilestoneKey: assignment.submilestoneKey,
      workosOrganizationId: input.workosOrganizationId,
    });
  }
}
