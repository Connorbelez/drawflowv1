import { v } from "convex/values";

import {
  type AuthorizedViewer,
  contractorMutation,
  contractorQuery,
} from "./authz";
import { requireContractorLinkedProfile } from "./contractorAuth";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

/**
 * Contractor Workspace production Convex module.
 *
 * Every function here returns a contractor-safe, denormalized, redacted view
 * model (PRD §12, §72). Contractors never receive generic proposal/build
 * documents — only the explicitly-scoped fields they are permitted to see:
 *   - build/proposal name, location, high-level scope,
 *   - permit metadata and permit documents (visible by default, PRD §3.17),
 *   - their own assigned milestone/submilestone scope + schedule dates,
 *   - builder/backoffice coordination contacts,
 *   - assignment-specific agreed rate where present.
 *
 * Explicitly excluded (PRD §8.4, §15, §18, §3.18): full proposal package,
 * borrower financing/draw economics, lender review notes, other contractors'
 * scopes, full budgets outside scope, and raw/internal quality ratings.
 *
 * Authorization is enforced through contractor-specific fluent builders
 * (contractor role + linked canonical profile), not generic proposal/build
 * read permissions (PRD §11.2).
 */

const contractorRoleQuery = contractorQuery.use(requireContractorLinkedProfile);
const contractorRoleMutation = contractorMutation.use(
  requireContractorLinkedProfile
);

// ---------------------------------------------------------------------------
// Email normalization (PRD §6.2 canonical email rules)
// ---------------------------------------------------------------------------

/**
 * Builds a contractor can see in their workspace. Active execution and
 * confirmed-but-not-yet-started builds both count as "assigned work" — a
 * contractor linked to a future-start build still needs to coordinate labor
 * and materials ahead of the start date (PRD §8.5 active build detail). This
 * matches the summary rollup's build filter so the work list, schedule, and
 * dashboard counts never disagree.
 */
function isContractorVisibleBuild(
  build: Doc<"activeBuilds"> | null
): build is Doc<"activeBuilds"> {
  return Boolean(
    build && (build.status === "active" || build.status === "future_start")
  );
}

/**
 * Normalize an email for canonical matching inside FairLendBrokerage.
 * Lowercased + trimmed; returns empty string for structurally invalid input.
 * Mirrors the normalizeEmail used by brokerage provisioning.
 */
export function normalizeContractorEmail(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return "";
  }
  if (!trimmed.slice(at + 1).includes(".")) {
    return "";
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Shared hydration helpers (brokerage-scoped, contractor-safe redaction)
// ---------------------------------------------------------------------------

interface ContractorAssignmentContext {
  proposalAssignments: Doc<"proposalMilestoneContractorAssignments">[];
  buildAssignments: Doc<"milestoneContractorAssignments">[];
}

async function loadContractorAssignments(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">
): Promise<ContractorAssignmentContext> {
  const [proposalAssignments, buildAssignments] = await Promise.all([
    ctx.db
      .query("proposalMilestoneContractorAssignments")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect(),
    ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect(),
  ]);
  return { proposalAssignments, buildAssignments };
}

/**
 * Builder coordination contact derived from a proposal's builder profile.
 * Contractors see builder company + contact only — never internal lender
 * account links (PRD §8.4, §15).
 */
async function builderContactForProposal(
  ctx: QueryCtx,
  proposal: Doc<"buildProposals">
) {
  if (!proposal.builderProfileId) {
    return null;
  }
  const builder = await ctx.db.get(proposal.builderProfileId);
  if (!builder) {
    return null;
  }
  return {
    displayName: builder.displayName,
    legalName: builder.legalName ?? null,
  };
}

async function builderContactForBuild(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">
) {
  const builder = await ctx.db.get(build.builderProfileId);
  if (!builder) {
    return null;
  }
  return {
    displayName: builder.displayName,
    legalName: builder.legalName ?? null,
  };
}

/**
 * Contractor-visible documents for a proposal (PRD §3.17, §3.34, §15). Permits
 * are visible by default. Non-permit documents require an explicit
 * `contractorVisible` ACL flag; budgets, plans, contracts, and financing/legal
 * material without that flag never reach the contractor view.
 */
async function contractorVisibleDocumentsForProposal(
  ctx: QueryCtx,
  proposalId: Id<"buildProposals">
) {
  const allDocs = await ctx.db
    .query("proposalDocuments")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
    .collect();
  const visible = allDocs.filter((doc) => isContractorVisibleDocument(doc));
  return visible.map((doc) => redactDocument(doc));
}

async function contractorVisibleDocumentsForBuild(
  ctx: QueryCtx,
  buildId: Id<"activeBuilds">
) {
  const allDocs = await ctx.db
    .query("buildDocuments")
    .withIndex("by_build", (q) => q.eq("buildId", buildId))
    .collect();
  const visible = allDocs.filter((doc) => isContractorVisibleDocument(doc));
  return visible.map((doc) => redactDocument(doc));
}

/**
 * A document is contractor-visible when it is a permit (visible by default,
 * PRD §3.17) OR when it carries an explicit `contractorVisible` ACL flag
 * (PRD §3.34). Non-permit documents without the flag are private financing,
 * budget, or legal material (PRD §15).
 */
function isContractorVisibleDocument(doc: {
  documentType: string;
  contractorVisible?: boolean;
}): boolean {
  return doc.documentType === "permit" || doc.contractorVisible === true;
}

function redactDocument(doc: {
  _id: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  storageId?: string;
  createdAt: number;
}) {
  return {
    _id: doc._id,
    documentType: doc.documentType,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    storageId: doc.storageId ?? null,
    uploadedAt: doc.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Work item shape (PRD §8.3)
// ---------------------------------------------------------------------------

interface ContractorWorkItem {
  _id: string;
  assignmentId: string;
  objectType: "proposal" | "build";
  parentName: string;
  parentId: string;
  milestoneKey: string;
  milestoneName: string;
  submilestoneKey: string | null;
  submilestoneName: string | null;
  role: string;
  status: string;
  scheduleStatus: string;
  acknowledgementStatus: string;
  evidenceStatus: string;
  issueStatus: string;
  plannedStartDay: number | null;
  plannedEndDay: number | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  nextActionDueDay: number | null;
}

const workItemValidator = v.object({
  _id: v.string(),
  assignmentId: v.string(),
  objectType: v.union(v.literal("proposal"), v.literal("build")),
  parentName: v.string(),
  parentId: v.string(),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  submilestoneKey: v.union(v.string(), v.null()),
  submilestoneName: v.union(v.string(), v.null()),
  role: v.string(),
  status: v.string(),
  scheduleStatus: v.string(),
  acknowledgementStatus: v.string(),
  evidenceStatus: v.string(),
  issueStatus: v.string(),
  plannedStartDay: v.union(v.number(), v.null()),
  plannedEndDay: v.union(v.number(), v.null()),
  plannedStartDate: v.union(v.string(), v.null()),
  plannedEndDate: v.union(v.string(), v.null()),
  nextActionDueDay: v.union(v.number(), v.null()),
});

// ---------------------------------------------------------------------------
// getContractorWorkspaceSummary (PRD §8.2 dashboard rollup)
// ---------------------------------------------------------------------------

export const getContractorWorkspaceSummary = contractorRoleQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const contractor = ctx.contractorProfile;
    const { proposalAssignments, buildAssignments } =
      await loadContractorAssignments(ctx, contractor._id);

    const activeProposalIds = new Set<Id<"buildProposals">>();
    for (const assignment of proposalAssignments) {
      if (assignment.status === "removed") {
        continue;
      }
      activeProposalIds.add(assignment.proposalId);
    }
    const activeBuildIds = new Set<Id<"activeBuilds">>();
    for (const assignment of buildAssignments) {
      if (assignment.status === "removed") {
        continue;
      }
      activeBuildIds.add(assignment.buildId);
    }

    const proposals = await Promise.all(
      [...activeProposalIds].map((id) => ctx.db.get(id))
    );
    const builds = await Promise.all(
      [...activeBuildIds].map((id) => ctx.db.get(id))
    );

    const activeProposals = proposals.filter(
      (p): p is Doc<"buildProposals"> =>
        Boolean(p) && (p as Doc<"buildProposals">).status !== "closed"
    );
    const activeBuildsList = builds.filter((b): b is Doc<"activeBuilds"> =>
      isContractorVisibleBuild(b as Doc<"activeBuilds"> | null)
    );

    const today = new Date();
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 14);

    const upcomingScheduleEvents = await projectContractorSchedule(ctx, {
      contractorId: contractor._id,
      fromMs: today.getTime(),
      toMs: horizon.getTime(),
      buildAssignments,
      proposalAssignments,
    });

    const profileReadiness = computeProfileReadiness(contractor);

    return {
      contractor: redactContractorProfileSummary(contractor),
      counts: {
        activeBuildAssignments: activeBuildsList.length,
        activeProposalAssignments: activeProposals.length,
        upcomingScheduleEvents: upcomingScheduleEvents.length,
        // Evidence queue + pending clarifications are deferred to later slices.
        evidenceQueue: 0,
        pendingClarifications: 0,
      },
      profileReadiness,
      upcomingScheduleEvents: upcomingScheduleEvents.slice(0, 10),
    };
  })
  .public();

// ---------------------------------------------------------------------------
// listContractorWorkItems (PRD §8.3 unified work list, urgency-sorted)
// ---------------------------------------------------------------------------

export const listContractorWorkItems = contractorRoleQuery
  .returns(v.array(workItemValidator))
  .handler(async (ctx) => {
    const contractor = ctx.contractorProfile;
    const { proposalAssignments, buildAssignments } =
      await loadContractorAssignments(ctx, contractor._id);
    const acknowledgedAssignmentKeys = await loadAcknowledgedAssignmentKeys(
      ctx,
      contractor._id
    );

    const items: ContractorWorkItem[] = [];

    for (const assignment of proposalAssignments) {
      if (assignment.status === "removed") {
        continue;
      }
      const proposal = await ctx.db.get(assignment.proposalId);
      if (!proposal || proposal.status === "closed") {
        continue;
      }
      const milestone = await ctx.db.get(assignment.proposalMilestoneId);
      let submilestoneName: string | null = null;
      if (assignment.proposalSubmilestoneId) {
        const sub = await ctx.db.get(assignment.proposalSubmilestoneId);
        submilestoneName = sub?.name ?? null;
      }
      items.push(
        toProposalWorkItem(
          assignment,
          proposal,
          milestone,
          submilestoneName,
          acknowledgedAssignmentKeys.has(`proposal:${assignment._id}`)
        )
      );
    }

    for (const assignment of buildAssignments) {
      if (assignment.status === "removed") {
        continue;
      }
      const build = await ctx.db.get(assignment.buildId);
      if (!isContractorVisibleBuild(build)) {
        continue;
      }
      const milestone = await ctx.db.get(assignment.buildMilestoneId);
      let submilestoneName: string | null = null;
      if (assignment.buildSubmilestoneId) {
        const sub = await ctx.db.get(assignment.buildSubmilestoneId);
        submilestoneName = sub?.name ?? null;
      }
      items.push(
        toBuildWorkItem(
          assignment,
          build,
          milestone,
          submilestoneName,
          acknowledgedAssignmentKeys.has(`build:${assignment._id}`)
        )
      );
    }

    // Urgency sort: active/planned first, then by earliest planned start day.
    items.sort((a, b) => {
      const aRank = urgencyRank(a.status);
      const bRank = urgencyRank(b.status);
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      const aDay = a.plannedStartDay ?? Number.POSITIVE_INFINITY;
      const bDay = b.plannedStartDay ?? Number.POSITIVE_INFINITY;
      return aDay - bDay;
    });

    return items;
  })
  .public();

function urgencyRank(status: string): number {
  if (status === "active") {
    return 0;
  }
  if (status === "planned") {
    return 1;
  }
  if (status === "completed") {
    return 2;
  }
  return 3;
}

async function loadAcknowledgedAssignmentKeys(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">
): Promise<Set<string>> {
  const acknowledgements = await ctx.db
    .query("contractorAcknowledgements")
    .withIndex("by_contractor_kind_state", (q) =>
      q
        .eq("contractorId", contractorId)
        .eq("kind", "assignment")
        .eq("state", "acknowledged")
    )
    .collect();
  const keys = new Set<string>();
  for (const acknowledgement of acknowledgements) {
    if (
      acknowledgement.assignmentType === "proposal" &&
      acknowledgement.proposalAssignmentId
    ) {
      keys.add(`proposal:${acknowledgement.proposalAssignmentId}`);
    }
    if (
      acknowledgement.assignmentType === "build" &&
      acknowledgement.buildAssignmentId
    ) {
      keys.add(`build:${acknowledgement.buildAssignmentId}`);
    }
  }
  return keys;
}

function toProposalWorkItem(
  assignment: Doc<"proposalMilestoneContractorAssignments">,
  proposal: Doc<"buildProposals">,
  milestone: Doc<"proposalMilestones"> | null,
  submilestoneName: string | null,
  acknowledged: boolean
): ContractorWorkItem {
  return {
    _id: `proposal:${assignment._id}`,
    assignmentId: assignment._id,
    objectType: "proposal",
    parentName: proposal.buildName,
    parentId: proposal._id,
    milestoneKey: assignment.milestoneKey,
    milestoneName: milestone?.name ?? assignment.milestoneKey,
    submilestoneKey: assignment.submilestoneKey ?? null,
    submilestoneName,
    role: assignment.role,
    status: assignment.status,
    scheduleStatus: milestone?.timelineStatus ?? "planned",
    acknowledgementStatus: acknowledged
      ? "acknowledged"
      : "pending_acknowledgement",
    evidenceStatus: "not_submitted",
    issueStatus: "none",
    plannedStartDay: milestone?.dayStart ?? null,
    plannedEndDay: milestone?.dayEnd ?? null,
    plannedStartDate: null,
    plannedEndDate: null,
    nextActionDueDay: milestone?.dayStart ?? null,
  };
}

function toBuildWorkItem(
  assignment: Doc<"milestoneContractorAssignments">,
  build: Doc<"activeBuilds">,
  milestone: Doc<"buildMilestones"> | null,
  submilestoneName: string | null,
  acknowledged: boolean
): ContractorWorkItem {
  return {
    _id: `build:${assignment._id}`,
    assignmentId: assignment._id,
    objectType: "build",
    parentName: build.buildName,
    parentId: build._id,
    milestoneKey: assignment.milestoneKey,
    milestoneName: milestone?.name ?? assignment.milestoneKey,
    submilestoneKey: assignment.submilestoneKey ?? null,
    submilestoneName,
    role: assignment.role,
    status: assignment.status,
    scheduleStatus: milestone?.status ?? "planned",
    acknowledgementStatus: acknowledged
      ? "acknowledged"
      : "pending_acknowledgement",
    evidenceStatus: "not_submitted",
    issueStatus: "none",
    plannedStartDay: milestone?.dayStart ?? null,
    plannedEndDay: milestone?.dayEnd ?? null,
    plannedStartDate: null,
    plannedEndDate: null,
    nextActionDueDay: milestone?.dayStart ?? null,
  };
}

// ---------------------------------------------------------------------------
// getContractorProposalDetail (PRD §8.4 scope-limited, redacted)
// ---------------------------------------------------------------------------

export const getContractorProposalDetail = contractorRoleQuery
  .input({ proposalId: v.id("buildProposals") })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      throw new Error("Proposal not found.");
    }
    if (proposal.brokerageId !== contractor.brokerageId) {
      throw new Error("Forbidden: brokerage scope");
    }

    const myAssignments = await ctx.db
      .query("proposalMilestoneContractorAssignments")
      .withIndex("by_contractor_proposal", (q) =>
        q.eq("contractorId", contractor._id).eq("proposalId", args.proposalId)
      )
      .filter((q: any) => q.neq(q.field("status"), "removed"))
      .collect();

    // Contractors only see scope they are assigned to (PRD §3.12, §8.4).
    if (myAssignments.length === 0) {
      throw new Error("Forbidden: not assigned to this proposal");
    }

    const assignedMilestoneIds = new Set(
      myAssignments.map((a) => a.proposalMilestoneId)
    );
    const assignedMilestones = await Promise.all(
      [...assignedMilestoneIds].map((id) => ctx.db.get(id))
    );

    const permitDocuments = await contractorVisibleDocumentsForProposal(
      ctx,
      args.proposalId
    );
    const builderContact = await builderContactForProposal(ctx, proposal);

    return {
      proposal: {
        _id: proposal._id,
        buildName: proposal.buildName,
        location: proposal.location,
        status: proposal.status,
        reviewOutcome: proposal.reviewOutcome,
        proposedStartDate: proposal.proposedStartDate ?? null,
      },
      assignedScope: myAssignments.map((assignment) => {
        const milestone = assignedMilestones.find(
          (m) => m?._id === assignment.proposalMilestoneId
        );
        return {
          assignmentId: assignment._id,
          milestoneKey: assignment.milestoneKey,
          milestoneName: milestone?.name ?? assignment.milestoneKey,
          submilestoneKey: assignment.submilestoneKey ?? null,
          role: assignment.role,
          status: assignment.status,
          agreedRateCents: assignment.agreedRateCents ?? null,
          agreedRateUnit: assignment.agreedRateUnit ?? null,
          estimatedHours: assignment.estimatedHours ?? null,
          note: assignment.note ?? null,
          plannedStartDay: milestone?.dayStart ?? null,
          plannedEndDay: milestone?.dayEnd ?? null,
        };
      }),
      permitDocuments,
      builderContact,
      // Explicit non-presence: no budgets, financing, lender notes, other
      // contractors, or ratings leak into the contractor view (PRD §8.4, §15).
    };
  })
  .public();

// ---------------------------------------------------------------------------
// getContractorBuildDetail (PRD §8.5 active build, redacted)
// ---------------------------------------------------------------------------

export const getContractorBuildDetail = contractorRoleQuery
  .input({ buildId: v.id("activeBuilds") })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error("Build not found.");
    }
    if (build.brokerageId !== contractor.brokerageId) {
      throw new Error("Forbidden: brokerage scope");
    }

    const myAssignments = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor_build", (q) =>
        q.eq("contractorId", contractor._id).eq("buildId", args.buildId)
      )
      .filter((q: any) => q.neq(q.field("status"), "removed"))
      .collect();

    if (myAssignments.length === 0) {
      return {
        assignedScope: [],
        availability: {
          message:
            "This assignment is no longer active. Return to your work list to review your current scope.",
          reference: `CTR-WORK-${String(args.buildId).slice(-8).toUpperCase()}`,
          state: "assignment_unavailable",
        },
        build: null,
        builderContact: null,
        permitDocuments: [],
      };
    }

    const assignedMilestoneIds = new Set(
      myAssignments.map((a) => a.buildMilestoneId)
    );
    const assignedMilestones = await Promise.all(
      [...assignedMilestoneIds].map((id) => ctx.db.get(id))
    );

    const permitDocuments = await contractorVisibleDocumentsForBuild(
      ctx,
      args.buildId
    );
    const builderContact = await builderContactForBuild(ctx, build);
    const acknowledgements = await ctx.db
      .query("contractorAcknowledgements")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
      .collect();
    const acknowledgementByAssignmentId = new Map(
      acknowledgements
        .filter(
          (acknowledgement) =>
            acknowledgement.kind === "assignment" &&
            acknowledgement.buildAssignmentId !== undefined
        )
        .map((acknowledgement) => [
          String(acknowledgement.buildAssignmentId),
          acknowledgement,
        ])
    );

    return {
      build: {
        _id: build._id,
        buildName: build.buildName,
        location: build.location,
        organizationId: build.organizationId,
        status: build.status,
        startDate: build.startDate,
      },
      assignedScope: myAssignments.map((assignment) => {
        const milestone = assignedMilestones.find(
          (m) => m?._id === assignment.buildMilestoneId
        );
        return {
          assignmentId: assignment._id,
          acknowledgement:
            acknowledgementByAssignmentId.get(String(assignment._id)) ?? null,
          milestoneKey: assignment.milestoneKey,
          milestoneName: milestone?.name ?? assignment.milestoneKey,
          submilestoneKey: assignment.submilestoneKey ?? null,
          role: assignment.role,
          status: assignment.status,
          agreedRateCents: assignment.agreedRateCents ?? null,
          agreedRateUnit: assignment.agreedRateUnit ?? null,
          estimatedHours: assignment.estimatedHours ?? null,
          estimatedCostCents: assignment.estimatedCostCents ?? null,
          actualHours: assignment.actualHours ?? null,
          actualCostCents: assignment.actualCostCents ?? null,
          note: assignment.note ?? null,
          plannedStartDay: milestone?.dayStart ?? null,
          plannedEndDay: milestone?.dayEnd ?? null,
        };
      }),
      permitDocuments,
      builderContact,
    };
  })
  .public();

// ---------------------------------------------------------------------------
// listContractorScheduleEvents (PRD §8.6 read projection)
// ---------------------------------------------------------------------------

const scheduleEventValidator = v.object({
  _id: v.string(),
  entityType: v.union(
    v.literal("milestone_start"),
    v.literal("milestone_end"),
    v.literal("submilestone"),
    v.literal("site_visit"),
    v.literal("reminder")
  ),
  title: v.string(),
  startsAt: v.string(),
  endsAt: v.union(v.string(), v.null()),
  parentName: v.string(),
  parentId: v.string(),
  milestoneKey: v.union(v.string(), v.null()),
});

export const listContractorScheduleEvents = contractorRoleQuery
  .returns(v.array(scheduleEventValidator))
  .handler(async (ctx) => {
    const contractor = ctx.contractorProfile;
    const { buildAssignments, proposalAssignments } =
      await loadContractorAssignments(ctx, contractor._id);
    const events = await projectContractorSchedule(ctx, {
      contractorId: contractor._id,
      fromMs: 0,
      toMs: Number.POSITIVE_INFINITY,
      buildAssignments,
      proposalAssignments,
    });
    return events.sort((a, b) => {
      const aT = Date.parse(a.startsAt) || 0;
      const bT = Date.parse(b.startsAt) || 0;
      return aT - bT;
    });
  })
  .public();

interface ContractorScheduleEvent {
  _id: string;
  entityType:
    | "milestone_start"
    | "milestone_end"
    | "submilestone"
    | "site_visit"
    | "reminder";
  title: string;
  startsAt: string;
  endsAt: string | null;
  parentName: string;
  parentId: string;
  milestoneKey: string | null;
}

async function projectContractorSchedule(
  ctx: QueryCtx,
  input: {
    contractorId: Id<"contractorProfiles">;
    fromMs: number;
    toMs: number;
    buildAssignments: Doc<"milestoneContractorAssignments">[];
    proposalAssignments: Doc<"proposalMilestoneContractorAssignments">[];
  }
): Promise<ContractorScheduleEvent[]> {
  const events: ContractorScheduleEvent[] = [];

  // Proposal milestone start/end windows.
  for (const assignment of input.proposalAssignments) {
    if (assignment.status === "removed") {
      continue;
    }
    const proposal = await ctx.db.get(assignment.proposalId);
    if (!proposal || proposal.status === "closed") {
      continue;
    }
    const milestone = await ctx.db.get(assignment.proposalMilestoneId);
    if (!milestone) {
      continue;
    }
    const startEvent = milestoneEvent(
      proposal._id,
      proposal.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayStart,
      "milestone_start"
    );
    if (startEvent && inWindow(startEvent, input.fromMs, input.toMs)) {
      events.push(startEvent);
    }
    const endEvent = milestoneEvent(
      proposal._id,
      proposal.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayEnd,
      "milestone_end"
    );
    if (endEvent && inWindow(endEvent, input.fromMs, input.toMs)) {
      events.push(endEvent);
    }
  }

  // Active build milestone start/end windows.
  for (const assignment of input.buildAssignments) {
    if (assignment.status === "removed") {
      continue;
    }
    const build = await ctx.db.get(assignment.buildId);
    if (!isContractorVisibleBuild(build)) {
      continue;
    }
    const milestone = await ctx.db.get(assignment.buildMilestoneId);
    if (!milestone) {
      continue;
    }
    const startEvent = milestoneEvent(
      build._id,
      build.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayStart,
      "milestone_start"
    );
    if (startEvent && inWindow(startEvent, input.fromMs, input.toMs)) {
      events.push(startEvent);
    }
    const endEvent = milestoneEvent(
      build._id,
      build.buildName,
      assignment.milestoneKey,
      milestone.name,
      milestone.dayEnd,
      "milestone_end"
    );
    if (endEvent && inWindow(endEvent, input.fromMs, input.toMs)) {
      events.push(endEvent);
    }
  }

  // Coordination reminders from the shared calendar projection, scoped to the
  // contractor's assigned proposals (PRD §8.6). ICS feed is deferred.
  const proposalIds = new Set(
    input.proposalAssignments.map((a) => a.proposalId)
  );
  for (const proposalId of proposalIds) {
    const reminders = await ctx.db
      .query("calendarReminderEvents")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .filter((q: any) => q.eq(q.field("status"), "active"))
      .collect();
    for (const reminder of reminders) {
      const involvesContractor = reminder.assignedParticipants?.some(
        (p: any) => p.participantType === "contractorProfile"
      );
      if (!involvesContractor) {
        continue;
      }
      const proposal = await ctx.db.get(proposalId);
      const event: ContractorScheduleEvent = {
        _id: `reminder:${reminder._id}`,
        entityType: "reminder",
        title: reminder.title,
        startsAt: reminder.startsAt,
        endsAt: reminder.endsAt ?? null,
        parentName: proposal?.buildName ?? "DrawFlow",
        parentId: proposalId,
        milestoneKey: null,
      };
      if (inWindow(event, input.fromMs, input.toMs)) {
        events.push(event);
      }
    }
  }

  return events;
}

function milestoneEvent(
  parentId: string,
  parentName: string,
  milestoneKey: string,
  milestoneName: string,
  dayOffset: number,
  kind: "milestone_start" | "milestone_end"
): ContractorScheduleEvent | null {
  if (typeof dayOffset !== "number") {
    return null;
  }
  // Project day offsets from a fixed epoch so events sort correctly; the real
  // calendar projection maps day offsets to absolute dates elsewhere. For the
  // contractor read view we emit ISO dates derived from the day offset.
  const date = new Date(Date.UTC(2026, 0, 1));
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return {
    _id: `${parentId}:${milestoneKey}:${kind}`,
    entityType: kind,
    title: `${milestoneName} ${kind === "milestone_start" ? "start" : "end"}`,
    startsAt: date.toISOString(),
    endsAt: null,
    parentName,
    parentId,
    milestoneKey,
  };
}

function inWindow(
  event: ContractorScheduleEvent,
  fromMs: number,
  toMs: number
): boolean {
  const t = Date.parse(event.startsAt) || 0;
  if (fromMs > 0 && t < fromMs) {
    return false;
  }
  if (toMs !== Number.POSITIVE_INFINITY && t > toMs) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// getContractorProfile (PRD §8.8 operational fields + readiness)
// ---------------------------------------------------------------------------

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

    await ctx.db.patch(contractor._id, {
      trades: args.trades.map((t) => t.trim()).filter(Boolean),
      website: normalizeOptionalString(args.website),
      description: normalizeOptionalString(args.description),
      phone: normalizeOptionalString(args.phone),
      serviceAreaPrimaryCity: normalizeOptionalString(
        args.serviceAreaPrimaryCity
      ),
      serviceAreaRadiusKm:
        args.serviceAreaRadiusKm === undefined
          ? undefined
          : Math.max(0, Math.round(args.serviceAreaRadiusKm)),
      serviceAreaPostalPrefixes: args.serviceAreaPostalPrefixes ?? undefined,
      serviceAreaNotes: normalizeOptionalString(args.serviceAreaNotes),
      complianceNotes: normalizeOptionalString(args.complianceNotes),
      updatedAt: now,
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
function redactContractorProfileSummary(contractor: Doc<"contractorProfiles">) {
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
function computeProfileReadiness(
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
