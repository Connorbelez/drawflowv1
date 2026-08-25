/**
 * Production proposals proposal timeline workspace bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { v } from "convex/values";
import { authenticatedQuery } from "../authz";
import { type Doc, type Id } from "../types";
import { authorizeProposal } from "./authorization_core.js";
import { proposalAppPermissionProjection, canUseAppPermission } from "./builder_staff_access.js";
import { proposalContractorPlanningProjection } from "./contractor_proposal_helpers.js";
import { PROPOSAL_TIMELINE_MIN_DAY } from "./contracts_foundation.js";
import { withBorrowerStartingCash } from "./directory_cards.js";
import { isBackoffice } from "./proposal_claim.js";
import { costItemTotalCents } from "./proposal_cost_validation.js";
import { firstActiveMilestoneForWorkspace, productionTimelineStatusForMilestone, productionTimelineToneForMilestone, productionCompletionClaimView, productionCompletionReviewView, productionPolicyState, productionTimelinePermissions, iconForProductionMilestone } from "./proposal_lender_approval.js";
import { getPermitWaiver, collectByIndex } from "./storage_helpers.js";

export const getProductionTimelineWorkspace = authenticatedQuery
  .input({
    includeContractorPlanning: v.optional(v.boolean()),
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeProposal(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
    );
    const [
      milestoneRows,
      submilestones,
      scopeContracts,
      fieldGuidanceRows,
      costItemRows,
      drawRows,
      capitalEventRows,
      documentRows,
      evidenceRows,
      modificationRequests,
      permitWaiver,
    ] = await Promise.all([
      collectByIndex(ctx, "proposalMilestones", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalSubmilestones",
        "by_proposal",
        args.proposalId,
      ),
      ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_organizationId_and_proposalId", (query) =>
          query
            .eq("organizationId", auth.proposal.organizationId)
            .eq("proposalId", args.proposalId),
        )
        .collect(),
      ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_organizationId_and_proposalId", (query) =>
          query
            .eq("organizationId", auth.proposal.organizationId)
            .eq("proposalId", args.proposalId),
        )
        .collect(),
      collectByIndex(ctx, "proposalCostItems", "by_proposal", args.proposalId),
      collectByIndex(
        ctx,
        "proposalDrawScheduleRows",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalCapitalEvents",
        "by_proposal",
        args.proposalId,
      ),
      args.includeContractorPlanning
        ? collectByIndex(
            ctx,
            "proposalDocuments",
            "by_proposal",
            args.proposalId,
          )
        : Promise.resolve([]),
      collectByIndex(
        ctx,
        "proposalEvidenceAssets",
        "by_proposal",
        args.proposalId,
      ),
      collectByIndex(
        ctx,
        "proposalTimelineModificationRequests",
        "by_proposal",
        args.proposalId,
      ),
      getPermitWaiver(ctx, args.proposalId),
    ]);

    const milestones = [...milestoneRows].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    );
    const draws = [...drawRows].sort(
      (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey),
    );
    const drawByMilestoneKey = new Map(
      draws
        .filter((draw) => draw.milestoneKey)
        .map((draw) => [draw.milestoneKey as string, draw]),
    );
    const maxDay = Math.max(
      60,
      ...milestones.map((milestone) => milestone.dayEnd + 10),
      ...draws.map((draw) => draw.timingDay + 10),
    );
    const currentDay =
      auth.proposal.status === "draft"
        ? (milestones[0]?.dayStart ?? 0)
        : Math.max(
            milestones[0]?.dayStart ?? 0,
            Math.min(
              maxDay,
              Math.round(
                ((auth.proposal.submittedAt ?? auth.proposal.updatedAt) -
                  auth.proposal.createdAt) /
                  86_400_000,
              ),
            ),
          );
    const activeMilestone = firstActiveMilestoneForWorkspace(milestones);
    const appPermissions = await proposalAppPermissionProjection(ctx, auth);
    const canViewLenderDrawNotes = isBackoffice(auth.roles);
    const fieldGuidanceBySubmilestoneId = new Map(
      fieldGuidanceRows.map((guidance) => [
        guidance.proposalSubmilestoneId,
        guidance,
      ]),
    );
    const scopeRevisionBySubmilestoneId = new Map<
      Id<"proposalSubmilestones">,
      Doc<"submilestoneScopeRevisions">
    >();
    await Promise.all(
      scopeContracts.map(async (contract) => {
        // Timeline authoring reads the active draft only before first
        // submission. After submission, the workspace remains a read-only
        // projection of the effective immutable revision; SFG-07 owns any
        // successor-draft editing surface.
        const revisionId =
          auth.proposal.status === "draft" &&
          auth.proposal.submittedAt === undefined
            ? (contract.activeDraftRevisionId ?? contract.effectiveRevisionId)
            : contract.effectiveRevisionId;
        if (!revisionId) {
          return;
        }
        const revision = await ctx.db.get(revisionId);
        if (
          revision &&
          revision.contractId === contract._id &&
          revision.proposalId === args.proposalId &&
          revision.proposalSubmilestoneId === contract.proposalSubmilestoneId
        ) {
          scopeRevisionBySubmilestoneId.set(
            contract.proposalSubmilestoneId,
            revision,
          );
        }
      }),
    );

    return {
      activeBuild: auth.proposal.activeBuildId
        ? await ctx.db.get(auth.proposal.activeBuildId)
        : null,
      appPermissions,
      capitalEvents: canUseAppPermission(appPermissions, "capitalEvent", "view")
        ? [
            {
              amountCents:
                auth.proposal.borrowerStartingCashCents ??
                auth.proposal.timelineStartingCashCents ??
                auth.proposal.borrowerWorkingCapitalLimitCents,
              capitalEventKey: "borrower-reserve",
              eventKind: "cashInfusion",
              label: "Borrower reserve",
              x: 0,
            },
            ...[...capitalEventRows]
              .sort((a, b) => a.order - b.order || a.x - b.x)
              .map((event) => ({
                amountCents: event.amountCents,
                capitalEventKey: event.capitalEventKey,
                eventKind: event.eventKind,
                interestAnnualBps: event.interestAnnualBps,
                label: event.label,
                x: event.x,
              })),
          ]
        : [],
      contractorPlanning:
        args.includeContractorPlanning &&
        canUseAppPermission(appPermissions, "contractor", "view")
          ? await proposalContractorPlanningProjection(ctx, {
              auth,
              documents: documentRows,
              milestones,
              proposalId: args.proposalId,
              submilestones,
            })
          : undefined,
      costItems: canUseAppPermission(appPermissions, "material", "view")
        ? [...costItemRows]
            .sort(
              (a, b) =>
                a.milestoneKey.localeCompare(b.milestoneKey) ||
                a.createdAt - b.createdAt,
            )
            .map((item) => ({
              _id: item._id,
              costCents: item.costCents,
              description: item.description,
              itemKey: item.itemKey,
              itemType: item.itemType,
              milestoneKey: item.milestoneKey,
              quantity: item.quantity,
              relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
              supplier: item.supplier,
              title: item.title,
              totalCents: costItemTotalCents(item),
              updatedAt: item.updatedAt,
            }))
        : [],
      draws: canUseAppPermission(appPermissions, "draw", "view")
        ? draws.map((draw) => ({
            amountCents: draw.amountCents,
            customDate: draw.customDate ?? draw.source === "manual",
            drawKey: draw.drawKey,
            itemMilestoneKey: draw.milestoneKey,
            label: draw.label,
            ...(canViewLenderDrawNotes
              ? {
                  requestNote: draw.requestNote,
                  requestReviewNote: draw.requestReviewNote,
                }
              : {}),
            requestStatus: draw.requestStatus,
            reviewedAt: draw.reviewedAt,
            requestedAt: draw.requestedAt,
            x: draw.timingDay,
          }))
        : [],
      evidenceAssets: canUseAppPermission(appPermissions, "evidence", "view")
        ? await Promise.all(
            [...evidenceRows]
              .sort((a, b) => a.createdAt - b.createdAt)
              .map(async (asset) => ({
                evidenceKey: asset.evidenceKey,
                fileName: asset.fileName,
                label: asset.label,
                milestoneKey: asset.milestoneKey,
                mimeType: asset.mimeType,
                previewUrl: asset.storageId
                  ? await ctx.storage.getUrl(asset.storageId)
                  : null,
                sizeBytes: asset.sizeBytes,
                submilestoneKey: asset.submilestoneKey,
                tag: asset.tag,
              })),
          )
        : [],
      milestones: canUseAppPermission(appPermissions, "milestone", "view")
        ? milestones.map((milestone, index) => {
            const draw = drawByMilestoneKey.get(milestone.key);
            const evidenceState =
              milestone.evidenceState ??
              (evidenceRows.some(
                (asset: any) => asset.milestoneKey === milestone.key,
              )
                ? "Submitted package"
                : milestone.completionClaim
                  ? "Completion claimed"
                  : "Draft package");
            return {
              budgetCents: milestone.budgetCents,
              completionClaim: productionCompletionClaimView(
                milestone.completionClaim,
              ),
              completionReview: productionCompletionReviewView(
                milestone.completionReview ??
                  milestone.completionClaim?.completionReview,
              ),
              dependencyKeys: milestone.dependencyKeys ?? [],
              drawAvailabilityCents: milestone.drawAvailabilityCents,
              drawKey: draw?.label ?? "Reimbursement draw",
              durationDays: milestone.durationDays,
              evidenceState,
              icon:
                milestone.icon ??
                iconForProductionMilestone(milestone.key, milestone.name),
              lane:
                milestone.lane ??
                (index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0),
              markerLabel: milestone.markerLabel ?? String(index + 1),
              milestoneKey: milestone.key,
              name: milestone.name,
              order: index + 1,
              policyState:
                milestone.policyState ??
                productionPolicyState(auth.proposal, permitWaiver),
              status: productionTimelineStatusForMilestone(
                index,
                auth.proposal,
                milestone,
              ),
              submilestoneSnapshot: canUseAppPermission(
                appPermissions,
                "submilestone",
                "view",
              )
                ? submilestones
                    .filter(
                      (submilestone: any) =>
                        submilestone.milestoneKey === milestone.key,
                    )
                    .sort(
                      (a: any, b: any) =>
                        a.order - b.order || a.key.localeCompare(b.key),
                    )
                    .map((submilestone: any) => ({
                      ...(submilestone.budgetCents === undefined
                        ? {}
                        : { budgetCents: submilestone.budgetCents }),
                      ...(submilestone.durationDays === undefined
                        ? {}
                        : { durationDays: submilestone.durationDays }),
                      ...(fieldGuidanceBySubmilestoneId.has(submilestone._id)
                        ? {
                            fieldGuidance: {
                              cameraAnglesTiptapJson:
                                fieldGuidanceBySubmilestoneId.get(
                                  submilestone._id,
                                )!.cameraAnglesTiptapJson,
                              whatToVerifyTiptapJson:
                                fieldGuidanceBySubmilestoneId.get(
                                  submilestone._id,
                                )!.whatToVerifyTiptapJson,
                            },
                          }
                        : {}),
                      key: submilestone.key,
                      name: submilestone.name,
                      order: submilestone.order,
                      ...(scopeRevisionBySubmilestoneId.has(submilestone._id)
                        ? {
                            scopeOfWorkTiptapJson:
                              scopeRevisionBySubmilestoneId.get(
                                submilestone._id,
                              )!.scopeOfWorkTiptapJson,
                          }
                        : {}),
                      ...(submilestone.startDay === undefined
                        ? {}
                        : { startDay: submilestone.startDay }),
                    }))
                : [],
              tone: productionTimelineToneForMilestone(
                index,
                auth.proposal,
                milestone,
              ),
              x: milestone.dayStart,
            };
          })
        : [],
      modificationRequests: [...modificationRequests]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((request) => ({
          _id: request._id,
          milestoneKey: request.milestoneKey,
          reason: request.reason,
          requestedPayload: request.requestedPayload,
          requestType: request.requestType,
          reviewNote: request.reviewNote,
          status: request.status,
        })),
      permissions: productionTimelinePermissions(auth),
      plan: {
        borrowerCoPayBps: auth.proposal.borrowerCoPayBps,
        borrowerCoPayCents:
          auth.proposal.borrowerCoPayCents ??
          Math.round(
            (auth.proposal.totalBudgetCents * auth.proposal.borrowerCoPayBps) /
              10_000,
          ),
        currentDay: auth.proposal.timelineCurrentDay ?? currentDay,
        progressValue: auth.proposal.timelineProgressValue ?? currentDay,
        rangeMax: auth.proposal.timelineRangeMax ?? maxDay,
        rangeMin: PROPOSAL_TIMELINE_MIN_DAY,
        routeState: {
          activeMilestoneKey:
            auth.proposal.timelineRouteState?.activeMilestoneKey ??
            activeMilestone?.key,
          selectedPanelOpen:
            auth.proposal.timelineRouteState?.selectedPanelOpen ??
            Boolean(activeMilestone),
          straightLine: auth.proposal.timelineRouteState?.straightLine ?? true,
        },
        minimumCashReserveCents:
          auth.proposal.timelineMinimumCashReserveCents ?? 0,
        startingCashCents:
          auth.proposal.borrowerStartingCashCents ??
          auth.proposal.timelineStartingCashCents ??
          auth.proposal.borrowerWorkingCapitalLimitCents,
      },
      planSummary: {
        address: auth.proposal.location,
        includedCount: milestones.length,
        templateTitle: auth.proposal.buildName,
        totalBudget: auth.proposal.totalBudgetCents,
      },
      proposal: withBorrowerStartingCash(auth.proposal),
    };
  })
  .public();
