/**
 * Production proposals contractor proposal helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { normalizeOptionalString, normalizeOptionalMoneyCents, hydrateContractorProfiles } from "./contractor_policy_helpers.js";
import { collectByIndex } from "./storage_helpers.js";

export async function ensureProposalContractorAssignment(
  ctx: MutationCtx,
  input: {
    agreedRateCents?: number;
    agreedRateUnit?: "hour" | "day" | "fixed";
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
    };
    contractorId: Id<"contractorProfiles">;
    endDay?: number;
    notes?: string;
    proposalId: Id<"buildProposals">;
    preserveExistingRole?: boolean;
    role: string;
    startDay?: number;
    workosOrganizationId: string;
  },
) {
  const existing = await ctx.db
    .query("proposalContractorAssignments")
    .withIndex("by_proposal_contractor", (q) =>
      q
        .eq("proposalId", input.proposalId)
        .eq("contractorId", input.contractorId),
    )
    .unique();
  const now = Date.now();
  const patch = {
    agreedRateCents: normalizeOptionalMoneyCents(input.agreedRateCents),
    agreedRateUnit: input.agreedRateUnit,
    endDay:
      input.endDay === undefined
        ? undefined
        : Math.max(0, Math.round(input.endDay)),
    notes: normalizeOptionalString(input.notes),
    role: input.role.trim() || "Contractor",
    startDay:
      input.startDay === undefined
        ? undefined
        : Math.max(0, Math.round(input.startDay)),
    status: "active" as const,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    if (input.preserveExistingRole) {
      await ctx.db.patch(existing._id, { role: existing.role });
    }
    return existing._id;
  }
  return await ctx.db.insert("proposalContractorAssignments", {
    ...patch,
    brokerageId: input.auth.brokerage._id,
    contractorId: input.contractorId,
    createdAt: now,
    organizationId: input.workosOrganizationId,
    proposalId: input.proposalId,
  });
}

export async function resolveProposalAssignmentSubmilestones(
  ctx: QueryCtx | MutationCtx,
  input: {
    milestoneKey: string;
    proposalId: Id<"buildProposals">;
    submilestoneKeys: string[];
  },
) {
  if (input.submilestoneKeys.length === 0) {
    return [];
  }
  const submilestones = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_proposal", (q) => q.eq("proposalId", input.proposalId))
    .filter((q) => q.eq(q.field("milestoneKey"), input.milestoneKey))
    .collect();
  return input.submilestoneKeys.map((key) => {
    const submilestone = submilestones.find((row) => row.key === key);
    if (!submilestone) {
      throw new Error(`Proposal submilestone not found: ${key}`);
    }
    return { id: submilestone._id, key: submilestone.key };
  });
}

export async function findProposalMilestoneContractorAssignment(
  ctx: QueryCtx | MutationCtx,
  input: {
    contractorId: Id<"contractorProfiles">;
    milestoneKey: string;
    proposalId: Id<"buildProposals">;
    submilestoneKey?: string;
  },
) {
  const assignments = await ctx.db
    .query("proposalMilestoneContractorAssignments")
    .withIndex("by_contractor_proposal", (q) =>
      q
        .eq("contractorId", input.contractorId)
        .eq("proposalId", input.proposalId),
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

export async function proposalContractorPlanningProjection(
  ctx: QueryCtx | MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    documents: Doc<"proposalDocuments">[];
    milestones: Doc<"proposalMilestones">[];
    proposalId: Id<"buildProposals">;
    submilestones: Doc<"proposalSubmilestones">[];
  },
) {
  const [proposalContractors, milestoneAssignments, contractorProfiles] =
    await Promise.all([
      collectByIndex(
        ctx,
        "proposalContractorAssignments",
        "by_proposal",
        input.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalMilestoneContractorAssignments",
        "by_proposal",
        input.proposalId,
      ),
      ctx.db
        .query("contractorProfiles")
        .withIndex("by_brokerage", (q) =>
          q.eq("brokerageId", input.auth.brokerage._id),
        )
        .collect(),
    ]);
  const proposalContractorRows =
    proposalContractors as Doc<"proposalContractorAssignments">[];
  const milestoneAssignmentRows =
    milestoneAssignments as Doc<"proposalMilestoneContractorAssignments">[];
  const hydrated = await hydrateContractorProfiles(ctx, contractorProfiles);
  const contractorById = new Map(
    hydrated.map((contractor: any) => [String(contractor._id), contractor]),
  );
  const attachedIds = new Set(
    proposalContractorRows.map((assignment) => String(assignment.contractorId)),
  );
  const milestoneByKey = new Map(
    input.milestones.map((milestone) => [milestone.key, milestone]),
  );
  const submilestoneByComposite = new Map(
    input.submilestones.map((submilestone) => [
      `${submilestone.milestoneKey}:${submilestone.key}`,
      submilestone,
    ]),
  );
  const permitSignals = extractPermitMaterialSignals({
    documents: input.documents,
    milestones: input.milestones,
    submilestones: input.submilestones,
  });
  const assignmentViews = milestoneAssignmentRows
    .map((assignment) => {
      const contractor = contractorById.get(String(assignment.contractorId));
      const milestone = milestoneByKey.get(assignment.milestoneKey);
      if (!(contractor && milestone)) {
        return null;
      }
      const submilestone = assignment.submilestoneKey
        ? submilestoneByComposite.get(
            `${assignment.milestoneKey}:${assignment.submilestoneKey}`,
          )
        : null;
      return {
        _id: assignment._id,
        contractorId: assignment.contractorId,
        contractorName: contractor.name,
        dayEnd: milestone.dayEnd,
        dayStart: milestone.dayStart,
        estimatedCostCents: assignment.estimatedCostCents,
        estimatedHours: assignment.estimatedHours,
        milestoneKey: assignment.milestoneKey,
        milestoneName: milestone.name,
        role: assignment.role,
        status: assignment.status,
        submilestoneKey: assignment.submilestoneKey,
        submilestoneName: submilestone?.name,
      };
    })
    .filter(Boolean);
  const allocationCalendar = assignmentViews.map((assignment: any) => ({
    assignmentId: assignment._id,
    contractorId: assignment.contractorId,
    contractorName: assignment.contractorName,
    dayEnd: assignment.dayEnd,
    dayStart: assignment.dayStart,
    label: `${assignment.milestoneName} / ${assignment.role}`,
    milestoneKey: assignment.milestoneKey,
  }));
  const equipmentSchedule = assignmentViews.flatMap((assignment: any) => {
    const contractor = contractorById.get(String(assignment.contractorId));
    return (contractor?.equipment ?? []).map((equipment: any) => ({
      assignmentId: assignment._id,
      contractorId: assignment.contractorId,
      contractorName: assignment.contractorName,
      dayEnd: assignment.dayEnd,
      dayStart: assignment.dayStart,
      equipmentKey: equipment.equipmentKey,
      name: equipment.name,
      quantity: equipment.quantity,
    }));
  });
  const conflicts = detectAssignmentWindowConflicts(allocationCalendar);
  return {
    allocationCalendar,
    availableContractors: hydrated
      .filter(
        (contractor: any) =>
          contractor.status === "active" &&
          !attachedIds.has(String(contractor._id)),
      )
      .map(contractorOptionView),
    conflicts,
    equipmentSchedule,
    materialSignals: permitSignals,
    milestoneAssignments: assignmentViews,
    proposalContractors: proposalContractorRows
      .map((assignment) => {
        const contractor = contractorById.get(String(assignment.contractorId));
        if (!contractor) {
          return null;
        }
        return {
          _id: assignment._id,
          agreedRateCents:
            assignment.agreedRateCents ?? contractor.defaultPayRateCents,
          agreedRateUnit:
            assignment.agreedRateUnit ??
            contractor.defaultPayRateUnit ??
            "hour",
          city: contractor.city,
          contractorId: assignment.contractorId,
          defaultPayRateCents: contractor.defaultPayRateCents,
          defaultPayRateUnit: contractor.defaultPayRateUnit ?? "hour",
          endDay: assignment.endDay,
          email: contractor.email,
          name: contractor.name,
          onboardingStatus:
            contractor.onboardingStatus ??
            (contractor.accountWorkosUserId
              ? "account_linked"
              : "profile_only"),
          role: assignment.role,
          startDay: assignment.startDay,
          status: assignment.status,
          trades: contractor.trades,
        };
      })
      .filter(Boolean),
    recommendations: rankContractorsForPermitSignals({
      contractors: hydrated.filter(
        (contractor: any) => contractor.status === "active",
      ),
      conflicts,
      permitSignals,
    }),
    utilization: contractorUtilizationSummary({
      assignments: assignmentViews as any[],
      contractorProfiles: hydrated,
      proposalContractors: proposalContractorRows,
    }),
  };
}

function contractorOptionView(contractor: any) {
  return {
    _id: contractor._id,
    contractorId: String(contractor._id),
    city: contractor.city,
    defaultPayRateCents: contractor.defaultPayRateCents,
    defaultPayRateUnit: contractor.defaultPayRateUnit ?? "hour",
    email: contractor.email,
    name: contractor.name,
    onboardingStatus:
      contractor.onboardingStatus ??
      (contractor.accountWorkosUserId ? "account_linked" : "profile_only"),
    trades: contractor.trades,
  };
}

export async function listAvailableContractorOptions(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
) {
  const contractors = await ctx.db
    .query("contractorProfiles")
    .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
    .collect();

  return contractors
    .filter((contractor) => contractor.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(contractorOptionView);
}

function extractPermitMaterialSignals(input: {
  documents: Array<{ fileName: string; documentType?: string }>;
  milestones: Array<{ key: string; name: string }>;
  submilestones: Array<{ key: string; name: string }>;
}) {
  const haystack = [
    ...input.documents
      .filter((document) => document.documentType === "permit")
      .map((document) => document.fileName),
    ...input.milestones.flatMap((milestone) => [milestone.key, milestone.name]),
    ...input.submilestones.flatMap((submilestone) => [
      submilestone.key,
      submilestone.name,
    ]),
  ]
    .join(" ")
    .toLowerCase();
  const keywords = [
    ["brick", "Brick siding"],
    ["masonry", "Masonry"],
    ["siding", "Siding"],
    ["stone", "Stone veneer"],
    ["stucco", "Stucco"],
    ["roof", "Roofing"],
    ["frame", "Framing"],
    ["foundation", "Foundation"],
    ["concrete", "Concrete"],
    ["plumbing", "Plumbing"],
    ["electrical", "Electrical"],
  ] as const;
  return keywords
    .filter(([key]) => haystack.includes(key))
    .map(([key, label]) => ({ key, label, source: "permit_and_roadmap" }));
}

function rankContractorsForPermitSignals(input: {
  contractors: any[];
  conflicts: Array<{ contractorId: unknown }>;
  permitSignals: Array<{ key: string; label: string }>;
}) {
  const conflictIds = new Set(
    input.conflicts.map((conflict) => String(conflict.contractorId)),
  );
  return input.contractors
    .map((contractor) => {
      const searchable = [
        contractor.name,
        ...(contractor.trades ?? []),
        ...(contractor.capabilities ?? []).flatMap((capability: any) => [
          capability.capabilityKey,
          capability.label,
          capability.trade,
          capability.milestoneArchetypeKey,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matches = input.permitSignals.filter((signal) =>
        searchable.includes(signal.key),
      );
      const score =
        matches.length * 35 +
        (contractor.defaultPayRateCents ? 10 : 0) -
        (conflictIds.has(String(contractor._id)) ? 30 : 0);
      return {
        contractorId: contractor._id,
        matchedSignals: matches,
        name: contractor.name,
        rateCents: contractor.defaultPayRateCents,
        score,
        trades: contractor.trades ?? [],
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 6);
}

function contractorUtilizationSummary(input: {
  assignments: Array<{
    contractorId: unknown;
    dayEnd?: number;
    dayStart?: number;
    estimatedHours?: number;
  }>;
  contractorProfiles: any[];
  proposalContractors: Array<{ contractorId: unknown }>;
}) {
  const profileById = new Map(
    input.contractorProfiles.map((profile) => [String(profile._id), profile]),
  );
  return input.proposalContractors.map((proposalContractor) => {
    const contractorId = String(proposalContractor.contractorId);
    const profile = profileById.get(contractorId);
    const assignments = input.assignments.filter(
      (assignment) => String(assignment.contractorId) === contractorId,
    );
    const assignedDays = assignments.reduce(
      (sum, assignment) =>
        sum +
        Math.max(
          1,
          Math.round((assignment.dayEnd ?? 0) - (assignment.dayStart ?? 0)),
        ),
      0,
    );
    const scheduledHours = assignments.reduce(
      (sum, assignment) => sum + (assignment.estimatedHours ?? 0),
      0,
    );
    const weeklyWindowHours = (profile?.availabilityWindows ?? []).reduce(
      (sum: number, window: any) =>
        sum + Math.max(0, window.endMinute - window.startMinute) / 60,
      0,
    );
    const capacityHours = Math.max(weeklyWindowHours, 1) * 4;
    return {
      assignedDays,
      contractorId: proposalContractor.contractorId,
      name: profile?.name ?? "Contractor",
      scheduledHours,
      utilizationPercent: Math.min(
        100,
        Math.round((scheduledHours / capacityHours) * 100),
      ),
      weeklyWindowHours,
    };
  });
}

function detectAssignmentWindowConflicts(
  assignments: Array<{
    assignmentId: unknown;
    contractorId: unknown;
    contractorName: string;
    dayEnd: number;
    dayStart: number;
    label: string;
  }>,
) {
  const conflicts = [];
  for (let i = 0; i < assignments.length; i += 1) {
    for (let j = i + 1; j < assignments.length; j += 1) {
      const left = assignments[i];
      const right = assignments[j];
      if (String(left.contractorId) !== String(right.contractorId)) {
        continue;
      }
      if (left.dayStart <= right.dayEnd && right.dayStart <= left.dayEnd) {
        conflicts.push({
          contractorId: left.contractorId,
          contractorName: left.contractorName,
          leftAssignmentId: left.assignmentId,
          leftLabel: left.label,
          overlapEndDay: Math.min(left.dayEnd, right.dayEnd),
          overlapStartDay: Math.max(left.dayStart, right.dayStart),
          rightAssignmentId: right.assignmentId,
          rightLabel: right.label,
          severity: "conflict" as const,
        });
      }
    }
  }
  return conflicts;
}

export async function contractorIdentityLinkViews(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    contractorId: Id<"contractorProfiles">;
  },
) {
  const [primaryLinks, linkedLinks] = await Promise.all([
    ctx.db
      .query("contractorIdentityLinks")
      .withIndex("by_primary", (q) =>
        q.eq("primaryContractorId", input.contractorId),
      )
      .collect(),
    ctx.db
      .query("contractorIdentityLinks")
      .withIndex("by_linked", (q) =>
        q.eq("linkedContractorId", input.contractorId),
      )
      .collect(),
  ]);
  const rows = [...primaryLinks, ...linkedLinks].filter(
    (row, index, all) =>
      all.findIndex((candidate) => candidate._id === row._id) === index,
  );
  return await Promise.all(
    rows.map(async (row) => {
      const isPrimary = row.primaryContractorId === input.contractorId;
      const peerId = isPrimary
        ? row.linkedContractorId
        : row.primaryContractorId;
      const peer = (await ctx.db.get(
        peerId,
      )) as Doc<"contractorProfiles"> | null;
      return {
        _id: row._id,
        confidence: row.confidence,
        direction: isPrimary ? "primary" : "linked",
        peerBrokerageId: isPrimary
          ? row.linkedBrokerageId
          : row.primaryBrokerageId,
        peerContractorId: peerId,
        peerName: peer?.name ?? "Linked contractor",
        reason: row.reason,
        status: row.status,
        updatedAt: row.updatedAt,
      };
    }),
  );
}
