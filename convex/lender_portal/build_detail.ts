import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { lenderOrganizationQuery } from "../authz";
import { drawSystemOccurrenceKey } from "../build_collaboration_system_posts";
import {
  type LenderPortalQueryCtx,
  latestLenderAssignments,
  listAccessibleLenderBuilds,
} from "../lender_portal_access";
import {
  currentLenderApproverMaps,
  projectCurrentMilestoneReviewEvidence,
  reviewerQueueRow,
} from "../lender_portal_phase5";
import { activeBuildDrawFundingSnapshotFromRows } from "../production_proposals";
import type { QueryCtx } from "../types";
import {
  assertLenderBuildScopedRows,
  isCurrentBuildDrawRequest,
  isCurrentBuildMilestone,
  LENDER_PORTAL_RESULT_LIMIT,
  lenderBuildDetailData,
  lenderBuildListRow,
  lenderDrawQueueReviewCycle,
  lenderMilestoneQueueReviewCycle,
} from "./shared.js";
import { projectLenderActiveBuilds } from "./proposals.js";

async function requireAccessibleLenderBuild(
  ctx: LenderPortalQueryCtx,
  buildId: Doc<"activeBuilds">["_id"]
) {
  const accessibleBuild = (await listAccessibleLenderBuilds(ctx)).find(
    (row) => row.build._id === buildId
  );
  if (!accessibleBuild) {
    throw new Error("Forbidden: lender Build access");
  }
  return accessibleBuild.build;
}


export const listLenderActiveBuilds = lenderOrganizationQuery
  .input({})
  .returns(v.array(lenderBuildListRow))
  .handler(async (ctx) => {
    const assignments = await latestLenderAssignments({
      db: ctx.db,
      scope: {
        brokerageId: ctx.activeOrganization.brokerageId,
        lenderOrganizationId: ctx.activeOrganization.lenderOrganizationId,
      },
    });
    return projectLenderActiveBuilds(ctx, assignments);
  })
  .public();

export const getLenderBuildDetail = lenderOrganizationQuery
  .input({ buildId: v.id("activeBuilds") })
  .returns(lenderBuildDetailData)
  .handler(async (ctx, args) => {
    const build = await requireAccessibleLenderBuild(ctx, args.buildId);
    const [
      eligibleLenderWorkosUserIds,
      builder,
      facilities,
      capitalEvents,
      milestones,
      drawRequests,
      submilestones,
      drawAllocations,
      plannedDraws,
    ] = await Promise.all([
      currentLenderApproverMaps(ctx),
      ctx.db.get(build.builderProfileId),
      ctx.db
        .query("loanFacilities")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(50),
      ctx.db
        .query("capitalEvents")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_order", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("activeBuildDrawRequests")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("activeBuildDrawRequestAllocations")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
      ctx.db
        .query("plannedDrawScheduleRows")
        .withIndex("by_build", (query) => query.eq("buildId", build._id))
        .take(501),
    ]);
    if (
      !builder ||
      builder.organizationId !== build.organizationId ||
      builder.brokerageId !== build.brokerageId ||
      capitalEvents.length > 500 ||
      milestones.length > 500 ||
      drawRequests.length > 500 ||
      submilestones.length > 500 ||
      drawAllocations.length > 500 ||
      plannedDraws.length > 500
    ) {
      throw new Error("Lender Build record limit exceeded");
    }

    assertLenderBuildScopedRows(build, [
      ...facilities,
      ...capitalEvents,
      ...milestones,
      ...drawRequests,
      ...submilestones,
      ...drawAllocations,
      ...plannedDraws,
    ]);

    const visibleMilestones = milestones.filter(isCurrentBuildMilestone);
    const visibleDraws = drawRequests.filter(isCurrentBuildDrawRequest);
    const drawReviewStates = new Map(
      await Promise.all(
        visibleDraws.map(async (drawRequest) => {
          const cycle = await lenderDrawQueueReviewCycle(
            ctx,
            build,
            drawRequest
          );
          return [
            drawRequest._id,
            cycle
              ? await reviewerQueueRow(ctx, {
                  build,
                  cycle,
                  eligibleLenderIds: eligibleLenderWorkosUserIds.draw,
                  group: "lender",
                  viewerWorkosUserId: ctx.activeOrganization.workosUserId,
                })
              : null,
          ] as const;
        })
      )
    );
    const milestoneReviewStates = new Map(
      await Promise.all(
        visibleMilestones.map(async (milestone) => {
          const cycle = await lenderMilestoneQueueReviewCycle(
            ctx,
            build,
            milestone
          );
          return [
            milestone._id,
            cycle
              ? await reviewerQueueRow(ctx, {
                  build,
                  cycle,
                  eligibleLenderIds: eligibleLenderWorkosUserIds.milestone,
                  group: "lender",
                  viewerWorkosUserId: ctx.activeOrganization.workosUserId,
                })
              : null,
          ] as const;
        })
      )
    );
    const actionRequiredDraws = [...drawReviewStates.values()].filter(
      (state) => state?.actionRequired
    ).length;
    const actionRequiredMilestones = [...milestoneReviewStates.values()].filter(
      (state) => state?.actionRequired
    ).length;
    const facility = [...facilities]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .find((candidate) => candidate.status === "active");
    const releasedCents = capitalEvents
      .filter((event) => event.eventType === "draw_release")
      .reduce((total, event) => total + event.amountCents, 0);
    const funding = activeBuildDrawFundingSnapshotFromRows({
      allocations: drawAllocations,
      allowLegacyUnattributedRequests: true,
      facilities,
      milestones,
      plannedDraws,
      requests: drawRequests,
    });
    const submilestonesByMilestone = new Map<
      string,
      Doc<"buildSubmilestones">[]
    >();
    for (const submilestone of submilestones) {
      if (submilestone.planningState === "superseded") {
        continue;
      }
      const key = String(submilestone.buildMilestoneId);
      const current = submilestonesByMilestone.get(key) ?? [];
      current.push(submilestone);
      submilestonesByMilestone.set(key, current);
    }
    const milestoneRows = await Promise.all(
      visibleMilestones.map((milestone) =>
        projectLenderBuildMilestone(ctx, {
          build,
          milestone,
          reviewState: milestoneReviewStates.get(milestone._id) ?? null,
          submilestones:
            submilestonesByMilestone.get(String(milestone._id)) ?? [],
        })
      )
    );
    const drawActionItems = new Map(
      await Promise.all(
        visibleDraws.map(
          async (drawRequest) =>
            [
              drawRequest._id,
              await projectLenderDrawActionItems(ctx, {
                build,
                drawRequest,
                plannedDraws,
              }),
            ] as const
        )
      )
    );

    return {
      build: {
        buildId: build._id,
        buildName: build.buildName,
        location: build.location,
        startDate: build.startDate,
        status: build.status,
        timezone: build.timezone ?? null,
        totalBudgetCents: build.totalBudgetCents,
        updatedAt: build.updatedAt,
      },
      builder: { displayName: builder.displayName },
      collaboration: await projectLenderBuildWideCollaboration(ctx, build),
      draws: visibleDraws.map((drawRequest) => {
        const beforeRequest = activeBuildDrawFundingSnapshotFromRows({
          allocations: drawAllocations,
          allowLegacyUnattributedRequests: true,
          facilities,
          ignoreUnattributedRequestIds: new Set([String(drawRequest._id)]),
          milestones,
          plannedDraws,
          requests: drawRequests,
        });
        const remainingAfterCents =
          beforeRequest.availableCents - drawRequest.amountCents;
        return {
          actionItems: drawActionItems.get(drawRequest._id) ?? [],
          actionRequired:
            drawReviewStates.get(drawRequest._id)?.actionRequired ?? false,
          amountCents: drawRequest.amountCents,
          currentReviewCycleId:
            drawRequest.currentLenderPortalReviewCycleId ?? null,
          currentReviewCycleNumber:
            drawRequest.currentLenderPortalReviewCycleNumber ?? null,
          displayId: drawRequest.displayId,
          drawRequestId: drawRequest._id,
          fundingPosition: {
            availableBeforeCents: beforeRequest.availableCents,
            reconciled: remainingAfterCents >= 0,
            remainingAfterCents,
          },
          label: drawRequest.label,
          lenderPortalReviewState: drawRequest.lenderPortalReviewState ?? null,
          note: drawRequest.note ?? null,
          requestedAt: drawRequest.requestedAt,
          status: drawRequest.status,
          updatedAt: drawRequest.updatedAt,
          workOrderKey: drawRequest.workOrderKey ?? null,
        };
      }),
      facility: facility
        ? {
            interestAnnualBps: facility.interestAnnualBps,
            interestStartsOn: facility.interestStartsOn,
            principalCents: facility.principalCents,
          }
        : null,
      funding: {
        approvedMilestoneCents: funding.approvedMilestoneCents,
        availableCents: funding.availableCents,
        facilityCents: funding.facilityCents,
        releasedCents,
        reservedCents: funding.reservedCents,
        unlockedCents: funding.unlockedCents,
      },
      milestones: milestoneRows,
      releasedCents,
      reviewSummary:
        actionRequiredDraws + actionRequiredMilestones > 0
          ? `${actionRequiredDraws + actionRequiredMilestones} lender review request${actionRequiredDraws + actionRequiredMilestones === 1 ? "" : "s"} require attention.`
          : "No current lender review requests.",
    };
  })
  .public();

function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function projectLenderDrawActionItems(
  ctx: QueryCtx,
  input: {
    build: Doc<"activeBuilds">;
    drawRequest: Doc<"activeBuildDrawRequests">;
    plannedDraws: Doc<"plannedDrawScheduleRows">[];
  }
) {
  const { build, drawRequest } = input;
  const plannedDraw = drawRequest.plannedDrawKey
    ? input.plannedDraws.find(
        (row) =>
          row.buildId === build._id &&
          row.drawKey === drawRequest.plannedDrawKey
      )
    : undefined;
  const occurrenceKey = plannedDraw
    ? drawSystemOccurrenceKey(build, plannedDraw)
    : `draw-system:${String(build._id)}:${String(build.proposalId)}:request:${String(drawRequest._id)}`;
  const post = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_systemPostKind_and_drawOccurrenceKey", (query) =>
      query
        .eq("buildId", build._id)
        .eq("systemPostKind", "draw")
        .eq("canonicalBuildDrawOccurrenceKey", occurrenceKey)
    )
    .unique();
  if (!post) {
    return [];
  }
  if (
    post.organizationId !== build.organizationId ||
    post.brokerageId !== build.brokerageId ||
    post.source !== "system" ||
    post.systemPostKind !== "draw" ||
    post.canonicalBuildDrawOccurrenceKey !== occurrenceKey ||
    post.primaryReferenceKind !== "draw" ||
    post.contentState !== "active" ||
    post.tombstonedAt !== undefined
  ) {
    throw new Error("Lender Draw Action Items are unavailable");
  }
  const actionItems = await ctx.db
    .query("buildActionItems")
    .withIndex("by_originatingPostId_and_createdAt", (query) =>
      query.eq("originatingPostId", post._id)
    )
    .take(2001);
  if (actionItems.length > 2000) {
    throw new Error("Lender Draw Action Item record limit exceeded");
  }
  for (const item of actionItems) {
    if (
      item.originatingPostId !== post._id ||
      item.buildId !== build._id ||
      item.organizationId !== build.organizationId ||
      item.brokerageId !== build.brokerageId
    ) {
      throw new Error("Lender Draw Action Items are unavailable");
    }
  }
  return actionItems
    .map((item) => ({
      actionItemId: item._id,
      status: item.status,
      title: item.title,
      updatedAt: item.updatedAt,
    }))
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        String(left.actionItemId).localeCompare(String(right.actionItemId))
    );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One fail-closed projection keeps exact review evidence, cost coverage, dates, and child scope consistent.
async function projectLenderBuildMilestone(
  ctx: QueryCtx,
  input: {
    build: Doc<"activeBuilds">;
    milestone: Doc<"buildMilestones">;
    reviewState: Awaited<ReturnType<typeof reviewerQueueRow>> | null;
    submilestones: Doc<"buildSubmilestones">[];
  }
) {
  const { build, milestone } = input;
  for (const submilestone of input.submilestones) {
    if (
      submilestone.buildId !== build._id ||
      submilestone.buildMilestoneId !== milestone._id ||
      submilestone.organizationId !== build.organizationId ||
      submilestone.brokerageId !== build.brokerageId ||
      submilestone.milestoneKey !== milestone.key
    ) {
      throw new Error("Lender Build Milestone detail is unavailable");
    }
  }
  const orderedSubmilestones = [...input.submilestones].sort(
    (left, right) =>
      left.order - right.order ||
      left.key.localeCompare(right.key) ||
      String(left._id).localeCompare(String(right._id))
  );
  const completedAtValues = orderedSubmilestones
    .map((submilestone) => submilestone.completedAt)
    .filter((value): value is number => typeof value === "number");
  const actualCompletedAt =
    orderedSubmilestones.length > 0 &&
    completedAtValues.length === orderedSubmilestones.length
      ? Math.max(...completedAtValues)
      : null;
  const currentReview = await projectCurrentMilestoneReviewEvidence(
    ctx,
    build,
    milestone
  );
  const references = currentReview?.evidence.evidenceReferences ?? [];
  const files = currentReview?.evidence.files ?? [];
  const contractorAssignments = await ctx.db
    .query("milestoneContractorAssignments")
    .withIndex("by_build_milestone", (query) =>
      query.eq("buildId", build._id).eq("milestoneKey", milestone.key)
    )
    .take(501);
  if (contractorAssignments.length > 500) {
    throw new Error("Lender Build Milestone contractor limit exceeded");
  }
  const contractors = await Promise.all(
    contractorAssignments.map(async (assignment) => {
      const contractor = await ctx.db.get(assignment.contractorId);
      if (
        !contractor ||
        assignment.buildId !== build._id ||
        assignment.buildMilestoneId !== milestone._id ||
        assignment.organizationId !== build.organizationId ||
        assignment.brokerageId !== build.brokerageId ||
        contractor.organizationId !== build.organizationId ||
        contractor.brokerageId !== build.brokerageId
      ) {
        throw new Error("Lender Build Milestone contractor is unavailable");
      }
      if (
        assignment.buildSubmilestoneId !== undefined &&
        !input.submilestones.some(
          (submilestone) =>
            submilestone._id === assignment.buildSubmilestoneId &&
            submilestone.key === assignment.submilestoneKey
        )
      ) {
        throw new Error("Lender Build Milestone contractor is unavailable");
      }
      return {
        contractorId: contractor._id,
        name: contractor.name,
        role: assignment.role,
        status: assignment.status,
        submilestoneId: assignment.buildSubmilestoneId ?? null,
      };
    })
  );
  const documents = await Promise.all(
    references
      .filter((reference) => reference.kind === "cost_document")
      .map(async (reference) => {
        const [allocations, components] = await Promise.all([
          ctx.db
            .query("costDocumentAllocations")
            .withIndex("by_costDocumentId_and_order", (query) =>
              query.eq("costDocumentId", reference.costDocumentId)
            )
            .take(501),
          ctx.db
            .query("costDocumentFinancialComponents")
            .withIndex("by_costDocumentId_and_order", (query) =>
              query.eq("costDocumentId", reference.costDocumentId)
            )
            .take(101),
        ]);
        if (allocations.length > 500 || components.length > 100) {
          throw new Error("Lender Build cost document detail limit exceeded");
        }
        for (const row of [...allocations, ...components]) {
          if (
            row.buildId !== build._id ||
            row.organizationId !== build.organizationId ||
            row.brokerageId !== build.brokerageId ||
            row.costDocumentId !== reference.costDocumentId
          ) {
            throw new Error("Lender Build cost document detail is unavailable");
          }
        }
        for (const allocation of allocations) {
          if (
            !input.submilestones.some(
              (submilestone) =>
                submilestone._id === allocation.buildSubmilestoneId &&
                submilestone.key === allocation.submilestoneKeySnapshot
            )
          ) {
            throw new Error("Lender Build cost document detail is unavailable");
          }
        }
        const sumComponents = (kind: "subtotal" | "tax") => {
          const rows = components.filter(
            (component) => component.kind === kind
          );
          return rows.length > 0
            ? rows.reduce(
                (total, component) => total + component.amountCents,
                0
              )
            : null;
        };
        return {
          allocations: allocations.map((allocation) => ({
            amountCents: allocation.amountCents,
            buildSubmilestoneId: allocation.buildSubmilestoneId,
          })),
          amountCents: reference.amountCents,
          costDocumentId: reference.costDocumentId,
          kind: reference.documentKind,
          label: reference.label,
          pages: files
            .filter(
              (file) =>
                file.reference.kind === "cost_document_page" &&
                file.reference.costDocumentId === reference.costDocumentId
            )
            .map((file) => ({
              assetId:
                file.reference.kind === "cost_document_page"
                  ? file.reference.assetId
                  : (() => {
                      throw new Error("Lender Build cost page is unavailable");
                    })(),
              downloadUrl: file.downloadUrl,
              fileName: file.fileName,
              mimeType: file.mimeType,
            })),
          subtotalCents: sumComponents("subtotal"),
          taxCents: sumComponents("tax"),
        };
      })
  );
  const documentedCents = documents.reduce(
    (total, document) => total + document.amountCents,
    0
  );
  const submission =
    currentReview?.submission.kind === "milestone"
      ? currentReview.submission
      : null;
  const actualCostCents = submission?.actualCostCents ?? null;
  const receiptRequired =
    currentReview?.requirements.receiptInvoiceRequired ?? false;
  const receiptCoverageState = receiptRequired
    ? documentedCents === 0
      ? ("not_recorded" as const)
      : actualCostCents !== null && documentedCents < actualCostCents
        ? ("partial" as const)
        : ("covered" as const)
    : ("not_required" as const);
  const assetReferences = references.filter(
    (reference) => reference.kind === "asset"
  );
  const reviewEvidence = assetReferences.map((reference) => {
    const file = files.find(
      (candidate) =>
        candidate.reference.kind === "asset" &&
        candidate.reference.evidenceAssetId === reference.evidenceAssetId
    );
    if (!file) {
      throw new Error("Lender Build review evidence is unavailable");
    }
    return {
      downloadUrl: file.downloadUrl,
      evidenceAssetId: reference.evidenceAssetId,
      fileName: file.fileName,
      label: reference.label,
      locationVerified: reference.locationVerified,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      source:
        reference.association.kind === "site_visit"
          ? ("site_visit" as const)
          : ("evidence_package" as const),
      siteVisitId:
        reference.association.kind === "site_visit"
          ? reference.association.siteVisitId
          : null,
      submilestoneKey: reference.submilestoneKey ?? null,
    };
  });
  const siteVisitReferences = references.filter(
    (reference) => reference.kind === "site_visit"
  );
  if (
    new Set(siteVisitReferences.map((reference) => reference.siteVisitId))
      .size !== siteVisitReferences.length
  ) {
    throw new Error("Lender Build Site Visit is unavailable");
  }
  const siteVisitRows = await Promise.all(
    siteVisitReferences.map(async (reference) => ({
      reference,
      row: await ctx.db.get(reference.siteVisitId),
    }))
  );
  const siteVisits = siteVisitRows.map(({ reference, row }) => {
    if (
      !row ||
      row.buildId !== build._id ||
      row.buildMilestoneId !== milestone._id ||
      row.milestoneKey !== milestone.key ||
      row.organizationId !== build.organizationId ||
      row.brokerageId !== build.brokerageId ||
      (row.submilestoneId !== undefined &&
        !input.submilestones.some(
          (submilestone) => submilestone._id === row.submilestoneId
        ))
    ) {
      throw new Error("Lender Build Site Visit is unavailable");
    }
    return {
      completedAt: reference.completedAt,
      photoCount: assetReferences.filter(
        (assetReference) =>
          assetReference.association.kind === "site_visit" &&
          assetReference.association.siteVisitId === reference.siteVisitId
      ).length,
      report: reference.report,
      requestedAt: row.requestedAt,
      requestedDay: row.requestedDay,
      siteVisitId: reference.siteVisitId,
      submilestoneId: row.submilestoneId ?? null,
      tokenExpiresAt: row.tokenExpiresAt,
      tokenOpenedAt: row.tokenOpenedAt ?? null,
      updatedAt: row.updatedAt,
      visitId: row.visitId,
    };
  });
  const firstSiteVisit = siteVisits[0];
  const siteVisit = firstSiteVisit
    ? {
        completedAt: firstSiteVisit.completedAt,
        photoCount: firstSiteVisit.photoCount,
        report: firstSiteVisit.report,
        requestedAt: firstSiteVisit.requestedAt,
        siteVisitId: firstSiteVisit.siteVisitId,
        submilestoneId: firstSiteVisit.submilestoneId,
      }
    : null;

  return {
    actualCompletedAt,
    actualStartedAt: milestone.actualStartedAt ?? null,
    actionRequired: input.reviewState?.actionRequired ?? false,
    budgetCents: milestone.budgetCents,
    buildMilestoneId: milestone._id,
    contractors: contractors.map(
      ({ submilestoneId: _submilestoneId, ...row }) => row
    ),
    dayEnd: milestone.dayEnd,
    dayStart: milestone.dayStart,
    drawAvailabilityCents: milestone.drawAvailabilityCents,
    durationDays: milestone.durationDays,
    key: milestone.key,
    name: milestone.name,
    order: milestone.order,
    plannedEndDate: addUtcDays(build.startDate, milestone.dayEnd),
    plannedStartDate: addUtcDays(build.startDate, milestone.dayStart),
    progressPercent: milestone.progressPercent ?? null,
    receiptCoverage: {
      actualCostCents,
      documentedCents,
      documents,
      required: receiptRequired,
      state: receiptCoverageState,
    },
    reviewCycleId: milestone.currentLenderPortalReviewCycleId ?? null,
    reviewCycleNumber: milestone.currentLenderPortalReviewCycleNumber ?? null,
    reviewEvidence,
    reviewState: milestone.lenderPortalReviewState ?? null,
    siteVisit,
    siteVisits,
    status: milestone.status,
    submilestones: orderedSubmilestones.map((submilestone) => ({
      actualCostCents: submilestone.actualCostCents ?? null,
      actualStartedAt: submilestone.actualStartedAt ?? null,
      assignments: contractors
        .filter((contractor) => contractor.submilestoneId === submilestone._id)
        .map(({ submilestoneId: _submilestoneId, ...row }) => row),
      budgetCents: submilestone.budgetCents ?? 0,
      completedAt: submilestone.completedAt ?? null,
      // Field notes are operational/private; the lender projection exposes
      // only the canonical child identity and execution facts.
      description: "",
      durationDays: submilestone.durationDays ?? null,
      key: submilestone.key,
      name: submilestone.name,
      order: submilestone.order,
      progressPercent: submilestone.progressPercent ?? null,
      startDay: submilestone.startDay ?? null,
      status: submilestone.status,
      submilestoneId: submilestone._id,
    })),
  };
}

async function projectLenderBuildWideCollaboration(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">
) {
  const posts = await ctx.db
    .query("buildCollaborationPosts")
    .withIndex("by_buildId_and_lastMeaningfulActivityAt", (query) =>
      query.eq("buildId", build._id)
    )
    .order("desc")
    .take(501);
  if (posts.length > 500) {
    throw new Error("Lender Build Collaboration record limit exceeded");
  }
  const visiblePosts = posts.filter(
    (post) =>
      post.audienceMode === "build_wide" &&
      post.contentState === "active" &&
      post.source !== "system" &&
      post.currentRevisionId !== undefined &&
      post.tombstonedAt === undefined
  );
  return await Promise.all(
    visiblePosts.map(async (post) => {
      if (
        post.buildId !== build._id ||
        post.organizationId !== build.organizationId ||
        post.brokerageId !== build.brokerageId ||
        !post.currentRevisionId
      ) {
        throw new Error("Lender Build Collaboration is unavailable");
      }
      const revision = await ctx.db.get(post.currentRevisionId);
      if (
        !revision ||
        revision.postId !== post._id ||
        revision.buildId !== build._id ||
        revision.organizationId !== build.organizationId ||
        revision.brokerageId !== build.brokerageId ||
        revision.revision !== post.revision
      ) {
        throw new Error("Lender Build Collaboration is unavailable");
      }
      return {
        body: revision.plainText,
        postId: post._id,
        primaryReferenceId:
          post.primaryReferenceKind === "milestone" ||
          post.primaryReferenceKind === "submilestone" ||
          post.primaryReferenceKind === "draw"
            ? (post.primaryReferenceId ?? null)
            : null,
        primaryReferenceKind:
          post.primaryReferenceKind === "milestone" ||
          post.primaryReferenceKind === "submilestone" ||
          post.primaryReferenceKind === "draw"
            ? post.primaryReferenceKind
            : null,
        publishedAt: revision.createdAt,
        sourceLabel:
          post.authorRole === "builder" || post.authorRole === "builder-staff"
            ? "Builder team"
            : "Build participant",
      };
    })
  );
}
