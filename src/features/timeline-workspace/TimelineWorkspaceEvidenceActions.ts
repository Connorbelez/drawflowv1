import type { Id } from "../../../convex/_generated/dataModel";
import type { FormEvent } from "react";
import { toast } from "sonner";
import {
  isHeicLikeEvidenceImage,
  normalizeEvidenceFileForUpload,
} from "#/lib/evidence-image-normalization.ts";
import {
  DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE,
  calculateApprovedDrawRequestLimit,
  calculateDrawRequestLimit,
  clampNumber,
  getMaxSchedulableDrawAmount,
  relabelTimelineDraws,
} from "./TimelineWorkspaceDrawUtils.ts";
import { normalizeMilestoneTimelineItems } from "./-timeline-milestone-schedule.ts";
import {
  dollarsToCents,
  money,
  resolveTimelinePersistenceSiteVisitMilestoneKey,
  timelineMilestonePayloadToItem,
} from "./TimelineWorkspaceDefaults.ts";
import type { DemoEvidenceAsset } from "./-timeline-share-snapshot.ts";
import type {
  TimelineCompletionClaimInput,
  TimelineModificationRequestView,
  TimelineSiteVisitRequestInput,
} from "./TimelineWorkspaceTypes.ts";
import type { TimelineWorkspaceBaseControllerModel } from "./TimelineWorkspaceBaseController.ts";

export function createTimelineWorkspaceEvidenceActions(
  base: TimelineWorkspaceBaseControllerModel
) {
  const {
    activeDrawId,
    approvedDrawLimit,
    canWriteLiveTimeline,
    drawEditDraft,
    draws,
    durablePlanId,
    items,
    liveBuildMode,
    persistCreateEvidenceAsset,
    persistDeleteEvidenceAsset,
    persistGenerateEvidenceUploadUrl,
    persistRecordMilestoneSiteVisit,
    persistRequestMilestoneSiteVisit,
    persistReviewDrawRequest,
    persistReviewMilestoneCompletion,
    persistReviewModificationRequest,
    persistSubmitDrawRequest,
    persistSubmitMilestoneCompletion,
    persistDrawSequenceUpdates,
    persistUpdateDraw,
    persistUpdateEvidenceAsset,
    persistence,
    resolvedRange,
    runDurableMutation,
    setActiveDrawId,
    setItems,
    setModificationRequests,
    setDraws,
    workspaceMode,
    setRange,
  } = base;
  const completeMilestone = (
    itemId: string,
    claim: TimelineCompletionClaimInput
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                completionClaim: {
                  ...(claim.actualCost === undefined
                    ? {}
                    : { actualCost: claim.actualCost }),
                  completedDay: claim.completedDay,
                  ...(claim.note ? { note: claim.note } : {}),
                  ...(claim.qualityNote
                    ? { qualityNote: claim.qualityNote }
                    : {}),
                  ...(claim.qualityRating === undefined
                    ? {}
                    : { qualityRating: claim.qualityRating }),
                  submittedAt: new Date().toISOString(),
                },
                evidence:
                  (item.data.evidencePackage?.assets.length ?? 0) > 0
                    ? "Submitted package"
                    : "Completion claimed",
                status: "complete",
              },
            }
          : item
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistSubmitMilestoneCompletion({
            actualCostCents:
              claim.actualCost === undefined
                ? undefined
                : dollarsToCents(claim.actualCost),
            completedDay: claim.completedDay,
            milestoneKey: itemId,
            note: claim.note,
            qualityNote: claim.qualityNote,
            qualityRating: claim.qualityRating,
          }),
        "milestone completion"
      );
    }
  };

  const addEvidenceFiles = (itemId: string, files: File[]) => {
    if (files.length === 0) {
      return;
    }

    void (async () => {
      const evidenceFiles = await Promise.all(
        files
          .filter(
            (file) =>
              file.type.startsWith("image/") ||
              isHeicLikeEvidenceImage({
                fileName: file.name,
                mimeType: file.type,
              })
          )
          .map((file) => normalizeEvidenceFileForUpload(file))
      );
      if (evidenceFiles.length === 0) {
        return;
      }

      const createdAssets: DemoEvidenceAsset[] = [];
      setItems((currentItems) =>
        currentItems.map((item) => {
          if (!(item.id === itemId && item.data)) {
            return item;
          }

          const existingAssets = item.data.evidencePackage?.assets ?? [];
          const nextAssets = evidenceFiles.map((file, index) => {
            const assetNumber = existingAssets.length + index + 1;

            const asset = {
              fileName: file.name,
              id: `evidence-${itemId}-${Date.now()}-${index}`,
              label: `Evidence image ${assetNumber}`,
              mimeType: file.type || "image/*",
              previewUrl: URL.createObjectURL(file),
              size: file.size,
              tag: item.data?.name ?? item.label ?? "Milestone",
            } satisfies DemoEvidenceAsset;
            createdAssets.push(asset);
            return asset;
          });

          if (nextAssets.length === 0) {
            return item;
          }

          return {
            ...item,
            data: {
              ...item.data,
              evidence: "Submitted package",
              evidencePackage: {
                assets: [...existingAssets, ...nextAssets],
              },
            },
          };
        })
      );
      if (durablePlanId && createdAssets.length > 0) {
        for (const [index, asset] of createdAssets.entries()) {
          const file = evidenceFiles[index];
          if (!file) {
            continue;
          }
          void (async () => {
            const uploadUrl = await persistGenerateEvidenceUploadUrl();
            const response = await fetch(uploadUrl, {
              body: file,
              headers: {
                "Content-Type": file.type || "application/octet-stream",
              },
              method: "POST",
            });
            if (!response.ok) {
              throw new Error("Evidence upload failed.");
            }
            const { storageId } = (await response.json()) as {
              storageId: string;
            };
            await persistCreateEvidenceAsset({
              asset: {
                evidenceKey: asset.id,
                fileName: asset.fileName,
                label: asset.label,
                milestoneKey: itemId,
                mimeType: asset.mimeType,
                sizeBytes: asset.size,
                storageId: storageId as Id<"_storage">,
                tag: asset.tag,
              },
            });
          })().catch((error) => {
            const message =
              error instanceof Error
                ? error.message
                : "Unable to persist evidence.";
            toast.error(message);
          });
        }
      }
    })().catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to prepare evidence images.";
      toast.error(message);
    });
  };

  const updateEvidenceAsset = (
    itemId: string,
    assetId: string,
    patch: Partial<Pick<DemoEvidenceAsset, "label" | "tag">>
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data?.evidencePackage
          ? {
              ...item,
              data: {
                ...item.data,
                evidencePackage: {
                  assets: item.data.evidencePackage.assets.map((asset) =>
                    asset.id === assetId
                      ? {
                          ...asset,
                          ...(patch.label === undefined
                            ? {}
                            : { label: patch.label }),
                          ...(patch.tag === undefined
                            ? {}
                            : { tag: patch.tag }),
                        }
                      : asset
                  ),
                },
              },
            }
          : item
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistUpdateEvidenceAsset({
            evidenceKey: assetId,
            label: patch.label,
            tag: patch.tag,
          }),
        "evidence asset"
      );
    }
  };

  const removeEvidenceAsset = (itemId: string, assetId: string) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (!(item.id === itemId && item.data?.evidencePackage)) {
          return item;
        }

        const removedAsset = item.data.evidencePackage.assets.find(
          (asset) => asset.id === assetId
        );
        if (removedAsset?.previewUrl) {
          URL.revokeObjectURL(removedAsset.previewUrl);
        }

        const nextAssets = item.data.evidencePackage.assets.filter(
          (asset) => asset.id !== assetId
        );

        return {
          ...item,
          data: {
            ...item.data,
            evidence:
              nextAssets.length > 0 ? "Submitted package" : "Draft package",
            evidencePackage: { assets: nextAssets },
          },
        };
      })
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistDeleteEvidenceAsset({
            evidenceKey: assetId,
          }),
        "evidence deletion"
      );
    }
  };

  const updatePlannedDraw = (
    drawId: string,
    patch: { amount?: number; x?: number },
    options: { closeEditor?: boolean } = {}
  ) => {
    if (!canWriteLiveTimeline) {
      toast.error("Timeline is locked in this status.");
      return;
    }

    const targetDraw = draws.find((draw) => draw.id === drawId);
    if (!targetDraw) {
      return;
    }

    const nextAmount =
      patch.amount === undefined
        ? targetDraw.amount
        : Math.max(0, Math.round(patch.amount));
    const nextX =
      patch.x === undefined
        ? targetDraw.x
        : Math.max(resolvedRange.min, Math.round(patch.x));

    if (!(Number.isFinite(nextAmount) && Number.isFinite(nextX))) {
      return;
    }

    const isNonWorseningCapacityEdit =
      nextAmount <= targetDraw.amount && nextX >= targetDraw.x;
    const maxSchedulableAmount = getMaxSchedulableDrawAmount(
      nextX,
      items,
      draws,
      {
        excludeDrawId: drawId,
        proposedDrawId: drawId,
      },
      approvedDrawLimit
    );

    if (!isNonWorseningCapacityEdit && nextAmount > maxSchedulableAmount) {
      toast.error(
        maxSchedulableAmount <= 0
          ? DRAW_UNLOCK_CAPACITY_BLOCKED_MESSAGE
          : `Only ${money(maxSchedulableAmount)} is unlocked and available to draw by day ${nextX}.`
      );
      return;
    }

    const nextDraws = relabelTimelineDraws(
      draws.map((draw) =>
        draw.id === drawId
          ? {
              ...draw,
              amount: nextAmount,
              customDate: true,
              x: nextX,
            }
          : draw
      )
    );

    const sequencedTargetDraw =
      nextDraws.find((draw) => draw.id === drawId) ?? targetDraw;

    setDraws((currentDraws) =>
      relabelTimelineDraws(
        currentDraws.map((draw) =>
          draw.id === drawId
            ? {
                ...draw,
                amount: nextAmount,
                customDate: true,
                x: nextX,
              }
            : draw
        )
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistUpdateDraw({
            amountCents: dollarsToCents(nextAmount),
            customDate: true,
            drawKey: drawId,
            label: sequencedTargetDraw.label,
            order: nextDraws.findIndex((draw) => draw.id === drawId) + 1,
            x: nextX,
          }),
        "draw update"
      );
      persistDrawSequenceUpdates(draws, nextDraws, new Set([drawId]));
    }
    if (nextX > resolvedRange.max) {
      setRange((currentRange) => ({
        ...currentRange,
        max: nextX,
      }));
    }
    if (options.closeEditor) {
      setActiveDrawId(null);
    }
  };

  const applyDrawEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeDrawId) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const nextAmount = Math.max(
      1,
      Math.round(Number(formData.get("drawAmount") ?? drawEditDraft.amount))
    );
    const nextX = Math.max(
      resolvedRange.min,
      Math.round(Number(formData.get("drawDate") ?? drawEditDraft.x))
    );

    if (!(Number.isFinite(nextAmount) && Number.isFinite(nextX))) {
      return;
    }

    updatePlannedDraw(
      activeDrawId,
      { amount: nextAmount, x: nextX },
      { closeEditor: true }
    );
  };

  const submitDrawRequest = (
    drawId: string,
    request: { amount: number; note?: string; x?: number }
  ) => {
    const targetDraw = draws.find((draw) => draw.id === drawId);

    if (!targetDraw) {
      return;
    }

    const nextX =
      request.x === undefined
        ? targetDraw.x
        : clampNumber(
            Math.round(request.x),
            resolvedRange.min,
            resolvedRange.max
          );
    const requestedDraw = { ...targetDraw, x: nextX };
    const limit = liveBuildMode
      ? calculateApprovedDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        )
      : calculateDrawRequestLimit(
          requestedDraw,
          items,
          draws,
          approvedDrawLimit
        );
    const nextAmount = clampNumber(
      Math.round(request.amount),
      0,
      limit.availableLimit
    );

    setDraws((currentDraws) =>
      currentDraws.map((draw) => {
        if (draw.id !== drawId) {
          return draw;
        }

        const {
          requestReviewNote: _requestReviewNote,
          reviewedAt: _reviewedAt,
          ...draftDraw
        } = draw;

        return {
          ...draftDraw,
          amount: nextAmount,
          customDate: true,
          ...(request.note ? { requestNote: request.note } : {}),
          requestStatus: "requested",
          requestedAt: new Date().toISOString(),
          x: nextX,
        };
      })
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistSubmitDrawRequest({
            amountCents: dollarsToCents(nextAmount),
            drawKey: drawId,
            note: request.note,
            x: nextX,
          }),
        "draw request"
      );
    }
  };

  const reviewDrawRequest = (
    drawId: string,
    review: { note?: string; status: "approved" | "rejected" }
  ) => {
    setDraws((currentDraws) =>
      currentDraws.map((draw) =>
        draw.id === drawId
          ? {
              ...draw,
              ...(review.note ? { requestReviewNote: review.note } : {}),
              requestStatus: review.status,
              reviewedAt: new Date().toISOString(),
            }
          : draw
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistReviewDrawRequest({
            drawKey: drawId,
            note: review.note,
            status: review.status,
          }),
        "draw review"
      );
    }
  };

  const reviewModificationRequest = (
    request: TimelineModificationRequestView,
    review: { note?: string; status: "approved" | "rejected" }
  ) => {
    setModificationRequests((currentRequests) =>
      currentRequests.map((candidate) =>
        candidate === request || candidate._id === request._id
          ? {
              ...candidate,
              ...(review.note ? { reviewNote: review.note } : {}),
              status: review.status,
            }
          : candidate
      )
    );

    if (review.status === "approved") {
      if (
        request.requestType === "createMilestone" &&
        request.requestedPayload?.milestone
      ) {
        const milestone = request.requestedPayload.milestone;
        const nextItem = timelineMilestonePayloadToItem(milestone, true);
        setItems((currentItems) =>
          normalizeMilestoneTimelineItems([...currentItems, nextItem])
        );
      }

      if (request.requestType === "deleteMilestone" && request.milestoneKey) {
        setItems((currentItems) =>
          currentItems.filter((item) => item.id !== request.milestoneKey)
        );
      }

      if (
        request.requestType === "updateMilestoneBudget" &&
        request.milestoneKey &&
        typeof request.requestedPayload?.budgetCents === "number"
      ) {
        const nextAmount = request.requestedPayload.budgetCents / 100;
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === request.milestoneKey && item.data
              ? {
                  ...item,
                  data: {
                    ...item.data,
                    amount: nextAmount,
                  },
                }
              : item
          )
        );
      }
    }

    if (durablePlanId && request._id) {
      runDurableMutation(
        () =>
          persistReviewModificationRequest({
            note: review.note,
            requestId: request._id,
            status: review.status,
          }),
        "timeline modification review"
      );
    }
  };

  const reviewMilestoneCompletion = (
    itemId: string,
    review: { note?: string; status: "approved" | "revisionRequested" }
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                completionReview: {
                  ...(review.note ? { note: review.note } : {}),
                  reviewedAt: new Date().toISOString(),
                  ...(item.data.completionReview?.siteVisit
                    ? { siteVisit: item.data.completionReview.siteVisit }
                    : {}),
                  status: review.status,
                },
              },
            }
          : item
      )
    );
    if (durablePlanId) {
      runDurableMutation(
        () =>
          persistReviewMilestoneCompletion({
            milestoneKey: itemId,
            note: review.note,
            status: review.status,
          }),
        "milestone review"
      );
    }
  };

  const requestMilestoneSiteVisit = (
    itemId: string,
    request: TimelineSiteVisitRequestInput
  ) => {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId && item.data
          ? {
              ...item,
              data: {
                ...item.data,
                completionReview: {
                  ...(item.data.completionReview?.note
                    ? { note: item.data.completionReview.note }
                    : {}),
                  reviewedAt:
                    item.data.completionReview?.reviewedAt ??
                    new Date().toISOString(),
                  siteVisit: {
                    ...(request.includedItemIds
                      ? { includedItemIds: request.includedItemIds }
                      : {}),
                    ...(request.note ? { note: request.note } : {}),
                    requestedAt: new Date().toISOString(),
                    requestedDay: Math.max(0, Math.round(request.requestedDay)),
                    ...(request.status ? { status: request.status } : {}),
                    ...(request.tokenExpiresAt
                      ? { tokenExpiresAt: request.tokenExpiresAt }
                      : {}),
                    ...(request.url ? { url: request.url } : {}),
                    ...(request.visitId ? { visitId: request.visitId } : {}),
                  },
                  status:
                    item.data.completionReview?.status ?? "revisionRequested",
                },
              },
            }
          : item
      )
    );
  };
  const createMilestoneSiteVisit = persistence?.requestMilestoneSiteVisit
    ? (itemId: string, request: TimelineSiteVisitRequestInput) =>
        persistRequestMilestoneSiteVisit({
          includedMilestoneKeys: (request.includedItemIds ?? [itemId]).map(
            (includedItemId) =>
              resolveTimelinePersistenceSiteVisitMilestoneKey(
                includedItemId,
                workspaceMode
              )
          ),
          milestoneKey: resolveTimelinePersistenceSiteVisitMilestoneKey(
            itemId,
            workspaceMode
          ),
          note: request.note,
          requestedDay: request.requestedDay,
        })
    : undefined;
  const recordMilestoneSiteVisit = persistence?.recordMilestoneSiteVisit
    ? (itemId: string, request: TimelineSiteVisitRequestInput) =>
        persistRecordMilestoneSiteVisit({
          milestoneKey: resolveTimelinePersistenceSiteVisitMilestoneKey(
            itemId,
            workspaceMode
          ),
          note: request.note,
          status: request.status,
          visitId: request.visitId,
        })
    : undefined;


  return {
    addEvidenceFiles,
    applyDrawEdit,
    completeMilestone,
    createMilestoneSiteVisit,
    recordMilestoneSiteVisit,
    removeEvidenceAsset,
    requestMilestoneSiteVisit,
    reviewDrawRequest,
    reviewMilestoneCompletion,
    reviewModificationRequest,
    submitDrawRequest,
    updateEvidenceAsset,
    updatePlannedDraw,
  };
}

export type TimelineWorkspaceEvidenceActions = ReturnType<
  typeof createTimelineWorkspaceEvidenceActions
>;
