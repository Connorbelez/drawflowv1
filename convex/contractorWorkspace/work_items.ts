import { v } from "convex/values";

import {
  type AuthorizedViewer,
  contractorMutation,
  contractorQuery,
} from "../authz";
import {
  getContractorProfileByAccount,
  requireContractorLinkedProfile,
} from "../contractorAuth";
import {
  type MilestoneStartSource,
  recordMilestoneStart,
} from "../milestone_start";
import { resolveCanonicalMilestoneExecutionOwnership } from "../build_collaboration_system_event_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  contractorRoleQuery,
  contractorRoleMutation,
  isContractorVisibleBuild,
  normalizeContractorEmail,
  loadContractorAssignments,
  isCanonicalBuildAssignment,
  builderContactForProposal,
  builderContactForBuild,
  contractorVisibleDocumentsForProposal,
  contractorVisibleDocumentsForBuild,
  isContractorVisibleDocument,
  redactDocument,
  type ContractorWorkItem,
  workItemValidator,
  contractorBuildDetailValidator,
} from "./access";
import { projectContractorSchedule } from "./schedule";
import {
  computeProfileReadiness,
  redactContractorProfileSummary,
} from "./profile";
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
  .returns(contractorBuildDetailValidator)
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const build = await ctx.db.get(args.buildId);
    if (!build) {
      throw new Error("Build not found.");
    }
    if (build.brokerageId !== contractor.brokerageId) {
      throw new Error("Forbidden: brokerage scope");
    }

    const rawAssignments = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor_build", (q) =>
        q.eq("contractorId", contractor._id).eq("buildId", args.buildId)
      )
      .filter((q: any) => q.neq(q.field("status"), "removed"))
      .collect();
    const myAssignments: Doc<"milestoneContractorAssignments">[] = [];
    for (const assignment of rawAssignments) {
      if (await isCanonicalBuildAssignment(ctx, contractor._id, assignment)) {
        myAssignments.push(assignment);
      }
    }

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

    // The contractor workspace can continue to show completed assignment
    // history, but Cost Document capture may only be offered for a current
    // parent Build assignment. The Cost Document command boundary repeats the
    // complete graph check; this boolean is a conservative route projection,
    // never an authorization grant.
    const buildContractorAssignments = await ctx.db
      .query("buildContractorAssignments")
      .withIndex("by_build_contractor", (query) =>
        query.eq("buildId", build._id).eq("contractorId", contractor._id)
      )
      .take(201);
    const currentBuildContractorAssignmentIds = new Set(
      buildContractorAssignments.length > 200
        ? []
        : buildContractorAssignments
            .filter(
              (assignment) =>
                assignment.organizationId === build.organizationId &&
                assignment.brokerageId === build.brokerageId &&
                assignment.status !== "inactive"
            )
            .map((assignment) => assignment._id)
    );

    const assignedMilestoneIds = new Set(
      myAssignments.map((a) => a.buildMilestoneId)
    );
    const assignedMilestones = await Promise.all(
      [...assignedMilestoneIds].map((id) => ctx.db.get(id))
    );
    const buildMilestones = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (q) => q.eq("buildId", args.buildId))
      .collect();
    const assignedSubmilestones = await Promise.all(
      [
        ...new Set(
          myAssignments
            .map((assignment) => assignment.buildSubmilestoneId)
            .filter((id): id is Id<"buildSubmilestones"> => id !== undefined)
        ),
      ].map((id) => ctx.db.get(id))
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
        const submilestone = assignedSubmilestones.find(
          (candidate) => candidate?._id === assignment.buildSubmilestoneId
        );
        const dependencyBlockers = (milestone?.dependencyKeys ?? [])
          .map((dependencyKey) =>
            buildMilestones.find((candidate) => candidate.key === dependencyKey)
          )
          .filter((candidate) => candidate && candidate.status !== "complete")
          .map((candidate) => ({
            milestoneKey: candidate?.key,
            milestoneName: candidate?.name,
            status: candidate?.status,
          }));
        const costDocumentCaptureEligible = Boolean(
          contractor.status === "active" &&
            assignment.status === "active" &&
            assignment.buildSubmilestoneId &&
            currentBuildContractorAssignmentIds.has(
              assignment.buildContractorAssignmentId
            ) &&
            milestone &&
            submilestone &&
            milestone._id === submilestone.buildMilestoneId &&
            milestone.key === assignment.milestoneKey &&
            submilestone.organizationId === build.organizationId &&
            submilestone.brokerageId === build.brokerageId &&
            submilestone.buildId === build._id &&
            submilestone.milestoneKey === assignment.milestoneKey &&
            submilestone.key === assignment.submilestoneKey
        );
        return {
          assignmentId: assignment._id,
          acknowledgement:
            acknowledgementByAssignmentId.get(String(assignment._id)) ?? null,
          milestoneKey: assignment.milestoneKey,
          milestoneName: milestone?.name ?? assignment.milestoneKey,
          dependencyBlockers,
          actualStartedAt: submilestone?.actualStartedAt ?? null,
          startReportedAt: submilestone?.startReportedAt ?? null,
          buildSubmilestoneId: assignment.buildSubmilestoneId ?? null,
          costDocumentCaptureEligible,
          submilestoneKey: assignment.submilestoneKey ?? null,
          submilestoneName: submilestone?.name ?? null,
          workStatus: submilestone?.status ?? null,
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
          workflowRevision: submilestone
            ? (submilestone.workflowRevision ?? 0)
            : null,
        };
      }),
      permitDocuments,
      builderContact,
    };
  })
  .public();

export const startAssignedSubmilestone = contractorRoleMutation
  .input({
    actualStartedAt: v.number(),
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    source: v.union(
      v.literal("submilestone_ledger"),
      v.literal("submilestone_detail"),
      v.literal("guided_field_workflow")
    ),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const build = await ctx.db.get(args.buildId);
    if (
      !build ||
      ctx.viewer.organizationId !== args.workosOrganizationId ||
      build.organizationId !== args.workosOrganizationId ||
      build.brokerageId !== contractor.brokerageId ||
      contractor.organizationId !== build.organizationId
    ) {
      throw new Error("Forbidden: contractor build scope");
    }
    const milestone = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build_key", (query) =>
        query.eq("buildId", args.buildId).eq("key", args.milestoneKey)
      )
      .unique();
    const submilestone = milestone
      ? (
          await ctx.db
            .query("buildSubmilestones")
            .withIndex("by_milestone_and_key", (query) =>
              query
                .eq("buildMilestoneId", milestone._id)
                .eq("key", args.submilestoneKey)
            )
            .unique()
        )
      : undefined;
    if (
      !(milestone && submilestone) ||
      milestone.organizationId !== build.organizationId ||
      milestone.brokerageId !== build.brokerageId ||
      milestone.buildId !== build._id ||
      milestone.key !== args.milestoneKey ||
      submilestone.organizationId !== build.organizationId ||
      submilestone.brokerageId !== build.brokerageId ||
      submilestone.buildId !== build._id ||
      submilestone.buildMilestoneId !== milestone._id ||
      submilestone.key !== args.submilestoneKey
    ) {
      throw new Error("Forbidden: contractor assignment target mismatch.");
    }
    const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
      build,
      milestone,
      submilestone,
    });
    if (
      ownership.state !== "assigned" ||
      ownership.assignment?.contractorId !== contractor._id ||
      ownership.contractor?.accountWorkosUserId !== ctx.viewer.subject
    ) {
      throw new Error(
        "Forbidden: contractor assignment target mismatch. Assignment required."
      );
    }
    const milestones = await ctx.db
      .query("buildMilestones")
      .withIndex("by_build", (query) => query.eq("buildId", args.buildId))
      .take(500);
    return await recordMilestoneStart(ctx, {
      actor: {
        brokerageId: build.brokerageId,
        organizationId: build.organizationId,
        roles: ["contractor"],
        workosUserId: ctx.viewer.subject,
      },
      actualStartedAt: args.actualStartedAt,
      build,
      expectedRevision: args.expectedRevision,
      idempotencyKey: args.idempotencyKey,
      milestone,
      milestones,
      source: args.source as MilestoneStartSource,
      startParent: false,
      submilestone,
    });
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
