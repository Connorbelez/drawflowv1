/**
 * Production proposals lender detail bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { authenticatedQuery, lenderOrganizationQuery, type RoleSlug } from "../authz";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import { projectProposalLifecycle } from "../production_proposal_lifecycle";
import { loadFrozenLenderAssignmentSnapshot, requireSealedLenderAssignmentManifest } from "../lender_assignment_manifest";
import { historicalLenderProposalDetailValidator, lenderProposalLifecycleProjectionValidator, lenderProposalSnapshotDecisionValidator, lenderProposalSnapshotDocumentValidator, lenderProposalSnapshotRevisionValidator, proposalRevisionMilestoneValidator } from "../lender_portal_phase3";
import { LENDER_PROPOSAL_DECISION_ROLES, lenderProposalConfirmationProjectionValidator } from "../lender_portal_phase4";
import { nullableProductionProposalDetailValidator, productionProposalDetailValidator } from "../production_proposal_detail";
import { validateCompleteProposalRevisionLenderSnapshot } from "../proposal_revision_lender_snapshot";
import { type Doc, type QueryCtx } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { type BuilderStaffPermissionSnapshot, proposalAppPermissionProjection, canUseAppPermission, lenderProposalReviewPermissionProjection } from "./builder_staff_access.js";
import { projectProposalConfirmationCycle, paginateProposalConfirmationCycles, projectLenderSnapshotRevision, projectLenderSnapshotDecision, projectLenderSnapshotDocuments } from "./confirmation_history_helpers.js";
import { PROPOSAL_LENDER_ASSIGNMENT_HISTORY_LIMIT } from "./contracts_workflow.js";
import { getCurrentProposalLenderAssignment, requireLenderVisibleAssignment, authorizeLenderProposalLifecycleActor, getLenderApprovalForCurrentProposalRevision, evaluateProposalClosingEligibility, projectProposalLenderAssignment, projectProposalLenderApproval } from "./lender_assignment_auth.js";
import { buildProposalIdentityProjection, isBackoffice } from "./proposal_claim.js";
import { projectProposalDetailProposal, projectProposalDetailMilestone, projectProposalDetailSubmilestone, projectProposalDetailCostItem, projectProposalDetailDraw, projectProposalDetailPlannedDraw, projectProposalDetailDocuments, projectProposalDetailAssignment, projectProposalDetailPermitWaiver, projectProposalDetailActiveBuild } from "./proposal_detail_projection.js";
import { getCurrentProposalRevision } from "./review_lifecycle_helpers.js";
import { getPermitWaiver, collectByIndex } from "./storage_helpers.js";

type ProposalDetailProjectionAuth = {
  brokerage: Doc<"brokerages">;
  email?: string;
  proposal: Doc<"buildProposals">;
  roles: RoleSlug[];
  subject: string;
};

async function buildProposalDetailByStringProjection(
  ctx: QueryCtx,
  auth: ProposalDetailProjectionAuth,
  appPermissionsOverride?: BuilderStaffPermissionSnapshot,
) {
  const proposalId = auth.proposal._id;
  const [
    documents,
    milestones,
    submilestones,
    costItems,
    draws,
    permitWaiver,
  ] = await Promise.all([
    collectByIndex(ctx, "proposalDocuments", "by_proposal", proposalId),
    collectByIndex(ctx, "proposalMilestones", "by_proposal", proposalId),
    collectByIndex(ctx, "proposalSubmilestones", "by_proposal", proposalId),
    collectByIndex(ctx, "proposalCostItems", "by_proposal", proposalId),
    collectByIndex(
      ctx,
      "proposalDrawScheduleRows",
      "by_proposal",
      proposalId,
    ),
    getPermitWaiver(ctx, proposalId),
  ]);
  const activeBuild = auth.proposal.activeBuildId
    ? await ctx.db.get(auth.proposal.activeBuildId)
    : null;
  const plannedDraws = activeBuild
    ? await collectByIndex(
        ctx,
        "plannedDrawScheduleRows",
        "by_build",
        activeBuild._id,
      )
    : [];
  const currentLenderAssignment = await getCurrentProposalLenderAssignment(
    ctx,
    proposalId,
  );
  const currentLenderApproval = currentLenderAssignment
    ? await getLenderApprovalForCurrentProposalRevision(
        ctx,
        auth.proposal,
        currentLenderAssignment,
      )
    : null;
  const latestLenderAssignment = await ctx.db
    .query("proposalLenderAssignments")
    .withIndex("by_proposal", (query) => query.eq("proposalId", proposalId))
    .order("desc")
    .take(1);
  const lenderAssignmentHistory = isBackoffice(auth.roles)
    ? await ctx.db
        .query("proposalLenderAssignments")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", proposalId),
        )
        .order("desc")
        .take(PROPOSAL_LENDER_ASSIGNMENT_HISTORY_LIMIT)
    : [];
  const lenderAssignmentState =
    currentLenderAssignment !== null
      ? {
          state: "assigned" as const,
          lenderConfirmation: currentLenderApproval
            ? ("approved" as const)
            : ("pending" as const),
        }
      : latestLenderAssignment[0]?.status !== undefined &&
          latestLenderAssignment[0].status !== "current"
        ? {
            state: "withdrawn" as const,
            lenderConfirmation: "pending" as const,
          }
        : {
            state: "unassigned" as const,
            lenderConfirmation: "pending" as const,
          };

  const includeInternal = isBackoffice(auth.roles);
  const appPermissions =
    appPermissionsOverride ??
    (await proposalAppPermissionProjection(ctx, auth));
  const assignmentProjection = await buildProposalIdentityProjection(
    ctx,
    auth.proposal,
    auth.brokerage,
  );
  return {
    activeBuild: projectProposalDetailActiveBuild(activeBuild),
    appPermissions,
    assignment: projectProposalDetailAssignment(
      assignmentProjection,
      includeInternal,
    ),
    costItems: canUseAppPermission(appPermissions, "material", "view")
      ? costItems.map((item: Doc<"proposalCostItems">) =>
          projectProposalDetailCostItem(item, includeInternal),
        )
      : [],
    documents: await projectProposalDetailDocuments(
      ctx,
      documents,
      includeInternal,
    ),
    draws: canUseAppPermission(appPermissions, "draw", "view")
      ? draws.map((draw: Doc<"proposalDrawScheduleRows">) =>
          projectProposalDetailDraw(draw, includeInternal),
        )
      : [],
    lifecycle: projectProposalLifecycle(auth.proposal, lenderAssignmentState),
    lenderApproval: currentLenderApproval
      ? projectProposalLenderApproval(currentLenderApproval)
      : null,
    lenderAssignment:
      isBackoffice(auth.roles) && latestLenderAssignment[0]
        ? projectProposalLenderAssignment(latestLenderAssignment[0])
        : null,
    lenderAssignmentHistory: isBackoffice(auth.roles)
      ? lenderAssignmentHistory.map(projectProposalLenderAssignment)
      : [],
    milestones: canUseAppPermission(appPermissions, "milestone", "view")
      ? milestones.map(projectProposalDetailMilestone)
      : [],
    permitWaiver: projectProposalDetailPermitWaiver(
      permitWaiver,
      includeInternal,
    ),
    plannedDraws: canUseAppPermission(appPermissions, "draw", "view")
      ? plannedDraws.map(projectProposalDetailPlannedDraw)
      : [],
    proposal: projectProposalDetailProposal(auth.proposal, includeInternal),
    submilestones: canUseAppPermission(appPermissions, "submilestone", "view")
      ? submilestones.map(projectProposalDetailSubmilestone)
      : [],
  };
}

export const getProposalDetailByString = authenticatedQuery
  .input({
    proposalId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(nullableProductionProposalDetailValidator)
  .handler(async (ctx, args) => {
    const proposalId = ctx.db.normalizeId("buildProposals", args.proposalId);
    if (!proposalId) {
      return null;
    }
    const auth = await authorizeProposal(
      ctx,
      proposalId,
      args.workosOrganizationId,
    );
    return await buildProposalDetailByStringProjection(ctx, auth);
  })
  .public();

export const getCurrentLenderProposalDetail = lenderOrganizationQuery
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    proposalId: v.id("buildProposals"),
  })
  .returns(productionProposalDetailValidator)
  .handler(async (ctx, args) => {
    const auth = await authorizeLenderProposalLifecycleActor(
      ctx,
      args.proposalId,
      FAIRLEND_WORKOS_ORGANIZATION_ID,
    );
    if (
      !auth.isCurrentLenderActor ||
      !auth.currentLenderAssignment ||
      auth.currentLenderAssignment?._id !== args.assignmentId
    ) {
      throw new Error("Forbidden: current lender assignment");
    }
    const revision = await getCurrentProposalRevision(ctx, auth.proposal);
    if (!revision || revision.assignmentId !== args.assignmentId) {
      throw new Error("Current lender proposal revision is unavailable.");
    }
    const currentApproval = await getLenderApprovalForCurrentProposalRevision(
      ctx,
      auth.proposal,
      auth.currentLenderAssignment,
    );
    const validation = await validateCompleteProposalRevisionLenderSnapshot(
      ctx,
      {
        assignment: auth.currentLenderAssignment,
        brokerageId: auth.proposal.brokerageId,
        organizationId: auth.proposal.organizationId,
        proposal: auth.proposal,
        revision,
      },
    );
    if (!validation.ok) {
      throw new Error(
        "Current lender proposal revision content snapshot is unavailable.",
      );
    }
    const {
      costItems: snapshotCostItems,
      documents: snapshotDocuments,
      draws: snapshotDraws,
      milestones: snapshotMilestones,
      root: contentSnapshot,
      submilestones: snapshotSubmilestones,
    } = validation.snapshot;
    const documents = await Promise.all(
      snapshotDocuments.map(async (snapshot) => {
        const {
          _creationTime: _snapshotCreationTime,
          _id: _snapshotId,
          brokerageId: _brokerageId,
          organizationId: _organizationId,
          proposalId: _proposalId,
          revisionId: _revisionId,
          sourceDocumentId,
          ...document
        } = snapshot;
        return {
          ...document,
          _id: sourceDocumentId,
          storageUrl: document.storageId
            ? await ctx.storage.getUrl(document.storageId)
            : null,
        };
      }),
    );
    const milestones = snapshotMilestones.map((snapshot) => {
      const {
        _creationTime: _snapshotCreationTime,
        _id: _snapshotId,
        brokerageId: _brokerageId,
        organizationId: _organizationId,
        proposalId: _proposalId,
        revisionId: _revisionId,
        sourceMilestoneId,
        ...milestone
      } = snapshot;
      return { ...milestone, _id: sourceMilestoneId };
    });
    const submilestones = snapshotSubmilestones.map((snapshot) => {
      const {
        _creationTime: _snapshotCreationTime,
        _id: _snapshotId,
        brokerageId: _brokerageId,
        organizationId: _organizationId,
        proposalId: _proposalId,
        revisionId: _revisionId,
        sourceSubmilestoneId,
        ...submilestone
      } = snapshot;
      return { ...submilestone, _id: sourceSubmilestoneId };
    });
    const costItems = snapshotCostItems.map((snapshot) => {
      const {
        _creationTime: _snapshotCreationTime,
        _id: _snapshotId,
        brokerageId: _brokerageId,
        organizationId: _organizationId,
        proposalId: _proposalId,
        revisionId: _revisionId,
        sourceCostItemId,
        ...costItem
      } = snapshot;
      return { ...costItem, _id: sourceCostItemId };
    });
    const draws = snapshotDraws.map((snapshot) => {
      const {
        _creationTime: _snapshotCreationTime,
        _id: _snapshotId,
        brokerageId: _brokerageId,
        organizationId: _organizationId,
        proposalId: _proposalId,
        revisionId: _revisionId,
        sourceDrawId,
        ...draw
      } = snapshot;
      return { ...draw, _id: sourceDrawId };
    });
    const {
      activeBuild,
      _creationTime: _snapshotCreationTime,
      _id: _snapshotId,
      brokerageId: _brokerageId,
      organizationId: _organizationId,
      proposalId: _proposalId,
      revisionId: _revisionId,
      counts: _counts,
      ...publishedContent
    } = contentSnapshot;
    return {
      activeBuild: activeBuild ?? null,
      appPermissions: lenderProposalReviewPermissionProjection(),
      assignment: publishedContent.assignment,
      costItems,
      documents,
      draws,
      lifecycle: projectProposalLifecycle(publishedContent.proposal, {
        lenderConfirmation: currentApproval?.status ?? "pending",
        state: "assigned",
      }),
      lenderApproval: null,
      lenderAssignment: null,
      lenderAssignmentHistory: [],
      milestones,
      permitWaiver: publishedContent.permitWaiver,
      plannedDraws: [],
      proposal: publishedContent.proposal,
      submilestones,
    };
  })
  .public();

export const getLenderProposalLifecycleProjection = lenderOrganizationQuery
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    proposalId: v.id("buildProposals"),
  })
  .returns(lenderProposalLifecycleProjectionValidator)
  .handler(async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      throw new Error("Forbidden: lender proposal scope");
    }
    const brokerage = await ctx.db.get(proposal.brokerageId);
    if (!brokerage || brokerage.status !== "active") {
      throw new Error("Forbidden: lender proposal brokerage");
    }
    const visibleAssignment = await ctx.db.get(args.assignmentId);
    if (
      !visibleAssignment ||
      visibleAssignment.proposalId !== proposal._id ||
      visibleAssignment.lenderOrganizationId !== ctx.activeOrganization.lenderOrganizationId
    ) {
      throw new Error("Forbidden: lender proposal assignment");
    }
    if (visibleAssignment.status === "archiving") {
      throw new Error("Lender assignment archive is still sealing.");
    }
    if (visibleAssignment.lenderBrokerageId !== ctx.activeOrganization.brokerageId) {
      throw new Error("Forbidden: lender proposal tenant");
    }
    const currentAssignment = visibleAssignment.status === "current" ? visibleAssignment : null;
    const currentApproval = currentAssignment
      ? await getLenderApprovalForCurrentProposalRevision(
          ctx,
          proposal,
          currentAssignment,
        )
      : null;
    const canMakeLenderProposalDecision =
      ctx.activeOrganization.permissions.proposalReview &&
      ctx.activeOrganization.roles.some((role) =>
        LENDER_PROPOSAL_DECISION_ROLES.includes(
          role as (typeof LENDER_PROPOSAL_DECISION_ROLES)[number],
        ),
      );
    let snapshot;
    if (currentAssignment) {
      const revision = await getCurrentProposalRevision(ctx, proposal);
      if (!revision) {
        throw new Error("Current lender proposal revision is unavailable.");
      }
      const validation = await validateCompleteProposalRevisionLenderSnapshot(
        ctx,
        {
          assignment: currentAssignment,
          brokerageId: proposal.brokerageId,
          organizationId: proposal.organizationId,
          proposal,
          revision,
        },
      );
      if (!validation.ok) {
        throw new Error(
          "Current lender proposal revision content snapshot is unavailable.",
        );
      }
      const publishedProposal = validation.snapshot.root.proposal;
      const lifecycle = projectProposalLifecycle(publishedProposal, {
        lenderConfirmation: currentApproval?.status ?? "pending",
        state: "assigned",
      });
      snapshot = {
        assignmentId: currentAssignment._id,
        capturedAt: revision.createdAt,
        lifecycle,
        proposal: {
          buildName: publishedProposal.buildName,
          location: publishedProposal.location,
          status: publishedProposal.status,
        },
      };
    } else {
      snapshot = await loadFrozenLenderAssignmentSnapshot(
        ctx,
        visibleAssignment,
      );
    }

    const closingEligibility =
      currentAssignment &&
      canMakeLenderProposalDecision &&
      proposal.status === "approved"
        ? await evaluateProposalClosingEligibility(
            ctx,
            proposal,
            currentAssignment,
          )
        : null;
    let canActivateClosedProposal = false;
    if (
      currentAssignment &&
      canMakeLenderProposalDecision &&
      proposal.status === "closed" &&
      !proposal.activeBuildId &&
      proposal.builderProfileId &&
      proposal.workflowRuleSnapshotId
    ) {
      const closings = await ctx.db
        .query("proposalClosings")
        .withIndex("by_proposal", (query) =>
          query.eq("proposalId", proposal._id),
        )
        .take(2);
      const closing = closings.length === 1 ? closings[0] : null;
      const reviewPolicyLock = closing?.reviewPolicyLockId
        ? await ctx.db.get(closing.reviewPolicyLockId)
        : null;
      canActivateClosedProposal = Boolean(
        closing &&
          closing.brokerageId === proposal.brokerageId &&
          closing.organizationId === proposal.organizationId &&
          reviewPolicyLock &&
          reviewPolicyLock.proposalId === proposal._id &&
          reviewPolicyLock.organizationId === proposal.organizationId &&
          reviewPolicyLock.brokerageId === proposal.brokerageId,
      );
    }

    return {
      assignment: {
        assignmentId: visibleAssignment._id,
        readOnly: !currentAssignment,
        status: visibleAssignment.status,
      },
      canApproveClosing: Boolean(
        currentAssignment &&
          !currentApproval &&
          canMakeLenderProposalDecision &&
          snapshot.proposal.status === "approved",
      ),
      lifecycleActions: {
        canActivateClosedProposal,
        canRecordClosing: Boolean(closingEligibility?.eligible),
      },
      lifecycle: snapshot.lifecycle,
      proposal: snapshot.proposal,
      snapshot,
    };
  })
  .public();

export const getHistoricalLenderProposalDetail = lenderOrganizationQuery
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    paginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
  })
  .returns(historicalLenderProposalDetailValidator)
  .handler(async (ctx, args) => {
    const assignment = await requireLenderVisibleAssignment(
      ctx,
      args.proposalId,
      args.assignmentId,
    );
    if (assignment.status !== "withdrawn") {
      throw new Error("Historical lender proposal detail requires a withdrawn assignment.");
    }
    const manifest = await requireSealedLenderAssignmentManifest(ctx, assignment);
    const [documentPage, revisionPage, decisionPage] = await Promise.all([
      ctx.db
        .query("proposalLenderAssignmentManifestDocuments")
        .withIndex("by_manifest", (query) => query.eq("manifestId", manifest._id))
        .order("asc")
        .paginate(args.paginationOpts),
      ctx.db
        .query("proposalLenderAssignmentManifestRevisions")
        .withIndex("by_manifest", (query) => query.eq("manifestId", manifest._id))
        .order("asc")
        .paginate(args.paginationOpts),
      ctx.db
        .query("proposalLenderAssignmentManifestDecisions")
        .withIndex("by_manifest", (query) => query.eq("manifestId", manifest._id))
        .order("asc")
        .paginate(args.paginationOpts),
    ]);
    return {
      assignmentId: assignment._id,
      capturedAt: manifest.capturedAt,
      decisions: {
        ...decisionPage,
        page: decisionPage.page.map(
          ({ manifestId: _manifestId, _id: _id, _creationTime: _creationTime, ...decision }) =>
            decision,
        ),
      },
      documents: {
        ...documentPage,
        page: await projectLenderSnapshotDocuments(
          ctx,
          documentPage.page.map(
            ({ documentId, manifestId: _manifestId, _id: _id, _creationTime: _creationTime, ...document }) => ({
              _id: documentId,
              ...document,
            }),
          ),
        ),
      },
      lifecycle: manifest.lifecycleSnapshot,
      proposal: manifest.proposalSnapshot,
      readOnly: true as const,
      revisions: {
        ...revisionPage,
        page: revisionPage.page.map(
          ({ manifestId: _manifestId, _id: _id, _creationTime: _creationTime, ...revision }) =>
            revision,
        ),
      },
    };
  })
  .public();

export const getHistoricalLenderProposalConfirmation = lenderOrganizationQuery
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    paginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
  })
  .returns(lenderProposalConfirmationProjectionValidator)
  .handler(async (ctx, args) => {
    const assignment = await requireLenderVisibleAssignment(
      ctx,
      args.proposalId,
      args.assignmentId,
    );
    if (assignment.status !== "withdrawn") {
      throw new Error(
        "Historical lender proposal confirmation requires a withdrawn assignment.",
      );
    }
    await requireSealedLenderAssignmentManifest(ctx, assignment);
    const cycles = await paginateProposalConfirmationCycles(
      ctx,
      args.proposalId,
      args.paginationOpts,
      assignment._id,
    );
    const history = await Promise.all(
      cycles.page.map((cycle) =>
        projectProposalConfirmationCycle(ctx, cycle, {
          includePrivateActors: false,
          includePrivateReason: false,
        }),
      ),
    );
    return {
      canAcknowledge: false,
      canDecide: false,
      closingGateSatisfied: false,
      currentCycle: null,
      decisionAuthorized: false,
      history: { ...cycles, page: history },
      lenderNeedsAction: false,
    };
  })
  .public();

export const listLenderProposalAssignmentDocuments = lenderOrganizationQuery
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    paginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
  })
  .returns(paginationResultValidator(lenderProposalSnapshotDocumentValidator))
  .handler(async (ctx, args) => {
    const assignment = await requireLenderVisibleAssignment(ctx, args.proposalId, args.assignmentId);
    if (assignment.status === "current") {
      const page = await ctx.db.query("proposalDocuments")
        .withIndex("by_proposal", (query) => query.eq("proposalId", args.proposalId))
        .paginate(args.paginationOpts);
      return { ...page, page: await projectLenderSnapshotDocuments(ctx, page.page) };
    }
    const manifest = await requireSealedLenderAssignmentManifest(ctx, assignment);
    const page = await ctx.db.query("proposalLenderAssignmentManifestDocuments")
      .withIndex("by_manifest", (query) => query.eq("manifestId", manifest._id))
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await projectLenderSnapshotDocuments(ctx, page.page.map(({ documentId, manifestId: _manifestId, _id: _id, _creationTime: _creationTime, ...document }) => ({ _id: documentId, ...document }))),
    };
  })
  .public();

export const listLenderProposalAssignmentRevisions = lenderOrganizationQuery
  .input({ assignmentId: v.id("proposalLenderAssignments"), paginationOpts: paginationOptsValidator, proposalId: v.id("buildProposals") })
  .returns(paginationResultValidator(lenderProposalSnapshotRevisionValidator))
  .handler(async (ctx, args) => {
    const assignment = await requireLenderVisibleAssignment(ctx, args.proposalId, args.assignmentId);
    if (assignment.status === "current") {
      const page = await ctx.db.query("proposalRevisions")
        .withIndex("by_assignment_and_revision_number", (query) => query.eq("assignmentId", assignment._id))
        .order("asc").paginate(args.paginationOpts);
      return { ...page, page: page.page.map(projectLenderSnapshotRevision) };
    }
    const manifest = await requireSealedLenderAssignmentManifest(ctx, assignment);
    const page = await ctx.db.query("proposalLenderAssignmentManifestRevisions")
      .withIndex("by_manifest", (query) => query.eq("manifestId", manifest._id))
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(({ manifestId: _manifestId, _id: _id, _creationTime: _creationTime, ...revision }) => revision) };
  })
  .public();

export const listLenderProposalAssignmentDecisions = lenderOrganizationQuery
  .input({ assignmentId: v.id("proposalLenderAssignments"), paginationOpts: paginationOptsValidator, proposalId: v.id("buildProposals") })
  .returns(paginationResultValidator(lenderProposalSnapshotDecisionValidator))
  .handler(async (ctx, args) => {
    const assignment = await requireLenderVisibleAssignment(ctx, args.proposalId, args.assignmentId);
    if (assignment.status === "current") {
      const page = await ctx.db.query("proposalLenderApprovals")
        .withIndex("by_assignment", (query) => query.eq("assignmentId", assignment._id))
        .order("asc").paginate(args.paginationOpts);
      return { ...page, page: page.page.map(projectLenderSnapshotDecision) };
    }
    const manifest = await requireSealedLenderAssignmentManifest(ctx, assignment);
    const page = await ctx.db.query("proposalLenderAssignmentManifestDecisions")
      .withIndex("by_manifest", (query) => query.eq("manifestId", manifest._id))
      .paginate(args.paginationOpts);
    return { ...page, page: page.page.map(({ manifestId: _manifestId, _id: _id, _creationTime: _creationTime, ...decision }) => decision) };
  })
  .public();

export const listLenderProposalRevisionMilestones = lenderOrganizationQuery
  .input({
    assignmentId: v.id("proposalLenderAssignments"),
    paginationOpts: paginationOptsValidator,
    proposalId: v.id("buildProposals"),
    revisionId: v.id("proposalRevisions"),
  })
  .returns(paginationResultValidator(proposalRevisionMilestoneValidator))
  .handler(async (ctx, args) => {
    const assignment = await requireLenderVisibleAssignment(ctx, args.proposalId, args.assignmentId);
    if (assignment.status === "current") {
      const revision = await ctx.db.get(args.revisionId);
      if (!revision || revision.proposalId !== args.proposalId || revision.assignmentId !== assignment._id) {
        throw new Error("Forbidden: lender proposal revision");
      }
    } else {
      const manifest = await requireSealedLenderAssignmentManifest(ctx, assignment);
      const revision = await ctx.db.query("proposalLenderAssignmentManifestRevisions")
        .withIndex("by_manifest_and_revision", (query) => query.eq("manifestId", manifest._id).eq("revisionId", args.revisionId)).unique();
      if (!revision) throw new Error("Forbidden: lender proposal revision");
    }
    const page = await ctx.db.query("proposalRevisionMilestones")
      .withIndex("by_revision_and_order", (query) => query.eq("revisionId", args.revisionId))
      .order("asc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(({ brokerageId: _brokerageId, organizationId: _organizationId, proposalId: _proposalId, revisionId: _revisionId, _id: _id, _creationTime: _creationTime, ...milestone }) => milestone) };
  })
  .public();
