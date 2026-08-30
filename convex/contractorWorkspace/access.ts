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

export const contractorRoleQuery = contractorQuery.use(requireContractorLinkedProfile);
export const contractorRoleMutation = contractorMutation.use(
  requireContractorLinkedProfile
);

/**
 * Resolve the profile-link prerequisite without invoking linked-profile
 * middleware. The Contractor route uses this gate before mounting any child
 * workspace query, so an unlinked but correctly authenticated role reaches the
 * canonical onboarding recovery surface instead of a route error boundary.
 */
export const getContractorWorkspaceAccess = contractorQuery
  .returns(v.object({ profileLinked: v.boolean() }))
  .handler(async (ctx) => ({
    profileLinked: Boolean(
      await getContractorProfileByAccount(ctx, ctx.viewer.subject)
    ),
  }))
  .public();

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
export function isContractorVisibleBuild(
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

export interface ContractorAssignmentContext {
  buildAssignments: Doc<"milestoneContractorAssignments">[];
  proposalAssignments: Doc<"proposalMilestoneContractorAssignments">[];
}

export async function loadContractorAssignments(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">
): Promise<ContractorAssignmentContext> {
  const [proposalAssignments, rawBuildAssignments] = await Promise.all([
    ctx.db
      .query("proposalMilestoneContractorAssignments")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect(),
    ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
      .collect(),
  ]);
  const buildAssignments: Doc<"milestoneContractorAssignments">[] = [];
  for (const assignment of rawBuildAssignments) {
    if (await isCanonicalBuildAssignment(ctx, contractorId, assignment)) {
      buildAssignments.push(assignment);
    }
  }
  return { proposalAssignments, buildAssignments };
}

/**
 * Build work cards are projections of the tenant-scoped Work Allocation
 * aggregate.  Do not project dangling, cross-tenant, or partially-linked rows
 * merely because they happen to point at this contractor profile.
 */
export async function isCanonicalBuildAssignment(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  assignment: Doc<"milestoneContractorAssignments">
) {
  if (
    assignment.contractorId !== contractorId ||
    assignment.status === "removed" ||
    (assignment.buildSubmilestoneId === undefined) !==
      (assignment.submilestoneKey === undefined)
  ) {
    return false;
  }
  const [build, rootAssignment, milestone] = await Promise.all([
    ctx.db.get(assignment.buildId),
    ctx.db.get(assignment.buildContractorAssignmentId),
    ctx.db.get(assignment.buildMilestoneId),
  ]);
  if (
    !build ||
    !rootAssignment ||
    !milestone ||
    assignment.organizationId !== build.organizationId ||
    assignment.brokerageId !== build.brokerageId ||
    assignment.buildId !== build._id ||
    assignment.buildMilestoneId !== milestone._id ||
    assignment.milestoneKey !== milestone.key ||
    rootAssignment.organizationId !== build.organizationId ||
    rootAssignment.brokerageId !== build.brokerageId ||
    rootAssignment.buildId !== build._id ||
    rootAssignment.contractorId !== contractorId ||
    rootAssignment.status === "inactive"
  ) {
    return false;
  }
  if (!assignment.buildSubmilestoneId || !assignment.submilestoneKey) {
    return true;
  }
  const submilestone = await ctx.db.get(assignment.buildSubmilestoneId);
  return Boolean(
    submilestone &&
      submilestone.buildId === build._id &&
      submilestone.organizationId === build.organizationId &&
      submilestone.brokerageId === build.brokerageId &&
      submilestone.buildMilestoneId === milestone._id &&
      submilestone.milestoneKey === milestone.key &&
      submilestone.key === assignment.submilestoneKey
  );
}

/**
 * Builder coordination contact derived from a proposal's builder profile.
 * Contractors see builder company + contact only — never internal lender
 * account links (PRD §8.4, §15).
 */
export async function builderContactForProposal(
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

export async function builderContactForBuild(
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
export async function contractorVisibleDocumentsForProposal(
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

export async function contractorVisibleDocumentsForBuild(
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
export function isContractorVisibleDocument(doc: {
  documentType: string;
  contractorVisible?: boolean;
}): boolean {
  return doc.documentType === "permit" || doc.contractorVisible === true;
}

export function redactDocument(doc: {
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

export interface ContractorWorkItem {
  _id: string;
  acknowledgementStatus: string;
  assignmentId: string;
  evidenceStatus: string;
  issueStatus: string;
  milestoneKey: string;
  milestoneName: string;
  nextActionDueDay: number | null;
  objectType: "proposal" | "build";
  parentId: string;
  parentName: string;
  plannedEndDate: string | null;
  plannedEndDay: number | null;
  plannedStartDate: string | null;
  plannedStartDay: number | null;
  role: string;
  scheduleStatus: string;
  status: string;
  submilestoneKey: string | null;
  submilestoneName: string | null;
}

export const workItemValidator = v.object({
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

export const contractorBuildDetailAssignmentValidator = v.object({
  acknowledgement: v.any(),
  actualCostCents: v.union(v.number(), v.null()),
  actualHours: v.union(v.number(), v.null()),
  actualStartedAt: v.union(v.number(), v.null()),
  agreedRateCents: v.union(v.number(), v.null()),
  agreedRateUnit: v.union(v.string(), v.null()),
  assignmentId: v.id("milestoneContractorAssignments"),
  buildSubmilestoneId: v.union(v.id("buildSubmilestones"), v.null()),
  costDocumentCaptureEligible: v.boolean(),
  dependencyBlockers: v.array(
    v.object({
      milestoneKey: v.optional(v.string()),
      milestoneName: v.optional(v.string()),
      status: v.optional(v.string()),
    }),
  ),
  estimatedCostCents: v.union(v.number(), v.null()),
  estimatedHours: v.union(v.number(), v.null()),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  note: v.union(v.string(), v.null()),
  plannedEndDay: v.union(v.number(), v.null()),
  plannedStartDay: v.union(v.number(), v.null()),
  role: v.string(),
  startReportedAt: v.union(v.number(), v.null()),
  status: v.string(),
  submilestoneKey: v.union(v.string(), v.null()),
  submilestoneName: v.union(v.string(), v.null()),
  workflowRevision: v.union(v.number(), v.null()),
  workStatus: v.union(v.string(), v.null()),
});

export const contractorBuildDetailValidator = v.object({
  assignedScope: v.array(contractorBuildDetailAssignmentValidator),
  availability: v.optional(
    v.object({
      message: v.string(),
      reference: v.string(),
      state: v.literal("assignment_unavailable"),
    }),
  ),
  build: v.union(
    v.object({
      _id: v.id("activeBuilds"),
      buildName: v.string(),
      location: v.string(),
      organizationId: v.string(),
      startDate: v.string(),
      status: v.string(),
    }),
    v.null(),
  ),
  builderContact: v.any(),
  permitDocuments: v.array(v.any()),
});

// ---------------------------------------------------------------------------
// getContractorWorkspaceSummary (PRD §8.2 dashboard rollup)
// ---------------------------------------------------------------------------
