import {
  type PaginationOptions,
  paginationOptsValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { lenderOrganizationQuery } from "../authz";
import { listAccessibleLenderBuilds } from "../lender_portal_access";
import {
  encodeLenderQueueCursor,
  type LenderQueueScope,
  parseValidatedLenderQueueCursor,
} from "../lender_portal_pagination";
import { currentLenderApproverMaps, reviewerQueueRow } from "../lender_portal_phase5";
import { activeBuildDrawFundingSnapshotFromRows } from "../production_proposals";
import {
  LENDER_DRAW_QUEUE_MAX_PAGE_SIZE,
  lenderDrawQueuePage,
  lenderDrawQueueReviewCycle,
} from "./shared.js";

function lenderDrawQueueReviewCycleProjection(
  cycle: Doc<"lenderPortalReviewCycles">,
  canonical: Awaited<ReturnType<typeof reviewerQueueRow>>
) {
  const evidencePackageRevisionIds = new Set<string>();
  let locationReferenceCount = 0;
  let locationVerifiedCount = 0;

  for (const reference of cycle.evidenceReferences) {
    if (reference.kind === "package_revision") {
      evidencePackageRevisionIds.add(
        String(reference.evidencePackageRevisionId)
      );
    }
    if (reference.kind === "asset") {
      locationReferenceCount += 1;
      if (reference.locationVerified) {
        locationVerifiedCount += 1;
      }
      if (reference.association.kind === "package_revision") {
        evidencePackageRevisionIds.add(
          String(reference.association.evidencePackageRevisionId)
        );
      }
    }
  }

  return {
    approvedGroups: canonical.approvedGroups,
    evidencePackageRevisionCount: evidencePackageRevisionIds.size,
    evidenceReferenceCount: cycle.evidenceReferences.length,
    lenderApprovalCount: canonical.lenderApprovalCount,
    lenderQuorum: cycle.requirements.lenderQuorum,
    locationReferenceCount,
    locationVerifiedCount,
    requiredGroups: cycle.requirements.requiredGroups,
    state: canonical.state,
  };
}

export const getLenderDrawQueue = lenderOrganizationQuery
  .input({
    paginationOpts: paginationOptsValidator,
    scope: v.union(v.literal("action"), v.literal("all")),
  })
  .returns(lenderDrawQueuePage)
  .handler(async (ctx, args) => {
    validateLenderDrawQueuePageSize(args.paginationOpts.numItems);
    const [accessibleBuilds, eligibleLenderWorkosUserIds] = await Promise.all([
      listAccessibleLenderBuilds(ctx),
      currentLenderApproverMaps(ctx),
    ]);
    const rows = await Promise.all(
      accessibleBuilds.map(async ({ build }) => {
        const [
          builder,
          drawRequests,
          milestones,
          allocations,
          facilities,
          plannedDraws,
        ] = await Promise.all([
          ctx.db.get(build.builderProfileId),
          ctx.db
            .query("activeBuildDrawRequests")
            .withIndex("by_build", (query) => query.eq("buildId", build._id)),
          exhaustRows(
            ctx.db
              .query("buildMilestones")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
          exhaustRows(
            ctx.db
              .query("activeBuildDrawRequestAllocations")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
          exhaustRows(
            ctx.db
              .query("loanFacilities")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
          exhaustRows(
            ctx.db
              .query("plannedDrawScheduleRows")
              .withIndex("by_build", (query) => query.eq("buildId", build._id))
          ),
        ]);
        const allDrawRequests = await exhaustRows(drawRequests);
        if (
          !builder ||
          builder.brokerageId !== build.brokerageId ||
          builder.organizationId !== build.organizationId
        ) {
          throw new Error("Lender Draw builder scope is unavailable.");
        }
        return await Promise.all(
          allDrawRequests
            .filter(
              (drawRequest) =>
                drawRequest.status !== "cancelled" &&
                drawRequest.status !== "withdrawn"
            )
            .map(async (drawRequest) => {
              const fundingPosition = activeBuildDrawFundingSnapshotFromRows({
                allocations,
                allowLegacyUnattributedRequests: true,
                facilities,
                ignoreUnattributedRequestIds: new Set([
                  String(drawRequest._id),
                ]),
                milestones,
                plannedDraws,
                requests: allDrawRequests,
              });
              const remainingAfterCents =
                fundingPosition.availableCents - drawRequest.amountCents;
              const reviewCycle = await lenderDrawQueueReviewCycle(
                ctx,
                build,
                drawRequest
              );
              const canonicalReview = reviewCycle
                ? await reviewerQueueRow(ctx, {
                    build,
                    cycle: reviewCycle,
                    eligibleLenderIds: eligibleLenderWorkosUserIds.draw,
                    group: "lender",
                    viewerWorkosUserId: ctx.activeOrganization.workosUserId,
                  })
                : null;
              return {
                actionRequired: canonicalReview?.actionRequired ?? false,
                amountCents: drawRequest.amountCents,
                buildId: build._id,
                buildName: build.buildName,
                builderName: builder.displayName,
                currentReviewCycleId: reviewCycle?._id ?? null,
                currentReviewCycleNumber: reviewCycle?.cycleNumber ?? null,
                displayId: drawRequest.displayId,
                drawRequestId: drawRequest._id,
                fundingPosition: {
                  availableBeforeCents: fundingPosition.availableCents,
                  reconciled: remainingAfterCents >= 0,
                  remainingAfterCents,
                },
                label: drawRequest.label,
                lenderPortalReviewState:
                  reviewCycle?.state ??
                  drawRequest.lenderPortalReviewState ??
                  null,
                location: build.location,
                note: drawRequest.note ?? null,
                requestedAt: drawRequest.requestedAt,
                reviewCycle:
                  reviewCycle && canonicalReview
                    ? lenderDrawQueueReviewCycleProjection(
                        reviewCycle,
                        canonicalReview
                      )
                    : null,
                status: drawRequest.status,
                targetAvailability:
                  canonicalReview?.targetAvailability ?? "unavailable",
                updatedAt: drawRequest.updatedAt,
                viewerActionState:
                  canonicalReview?.viewerActionState ?? "unavailable",
                viewerDecision: canonicalReview?.viewerDecision ?? null,
                workOrderKey: drawRequest.workOrderKey ?? null,
              };
            })
        );
      })
    );
    const authorizedRows = rows.flat().sort(compareLenderDrawQueueRows);
    const scopedRows =
      args.scope === "action"
        ? authorizedRows.filter((row) => row.actionRequired)
        : authorizedRows;
    return paginateLenderDrawQueueRows({
      authorizedRows,
      paginationOpts: args.paginationOpts,
      rows: scopedRows,
      scope: args.scope,
    });
  })
  .public();

async function exhaustRows<T>(rows: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const row of rows) {
    result.push(row);
  }
  return result;
}

function compareLenderDrawQueueRows(
  left: {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  },
  right: {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  }
) {
  return (
    right.updatedAt - left.updatedAt ||
    String(right.drawRequestId).localeCompare(String(left.drawRequestId))
  );
}

function paginateLenderDrawQueueRows<
  T extends {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  },
>(input: {
  authorizedRows: T[];
  paginationOpts: PaginationOptions;
  rows: T[];
  scope: LenderQueueScope;
}) {
  const cursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.cursor,
    getAnchorId: (row) => String(row.drawRequestId),
    getAnchorValue: (row) => row.updatedAt,
    label: "Draw",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const endCursor = parseValidatedLenderQueueCursor({
    cursor: input.paginationOpts.endCursor ?? null,
    getAnchorId: (row) => String(row.drawRequestId),
    getAnchorValue: (row) => row.updatedAt,
    label: "Draw",
    rows: input.authorizedRows,
    scope: input.scope,
  });
  const afterStart = cursor
    ? input.rows.filter((row) => lenderDrawQueueRowIsAfterCursor(row, cursor))
    : input.rows;
  const candidates = endCursor
    ? afterStart.filter(
        (row) => !lenderDrawQueueRowIsAfterCursor(row, endCursor)
      )
    : afterStart;
  const page = endCursor
    ? candidates
    : candidates.slice(0, input.paginationOpts.numItems);
  if (endCursor) {
    return {
      continueCursor: input.paginationOpts.endCursor ?? "",
      isDone: true,
      page,
    };
  }
  const isDone = candidates.length <= input.paginationOpts.numItems;
  const last = page.at(-1);
  return {
    continueCursor:
      isDone || !last
        ? ""
        : encodeLenderQueueCursor({
            position: {
              anchorId: String(last.drawRequestId),
              anchorValue: last.updatedAt,
            },
            scope: input.scope,
          }),
    isDone,
    page,
  };
}

function lenderDrawQueueRowIsAfterCursor(
  row: {
    drawRequestId: Doc<"activeBuildDrawRequests">["_id"];
    updatedAt: number;
  },
  cursor: { anchorId: string; anchorValue: number }
) {
  return (
    row.updatedAt < cursor.anchorValue ||
    (row.updatedAt === cursor.anchorValue &&
      String(row.drawRequestId).localeCompare(cursor.anchorId) < 0)
  );
}

function validateLenderDrawQueuePageSize(numItems: number) {
  if (
    !Number.isSafeInteger(numItems) ||
    numItems < 1 ||
    numItems > LENDER_DRAW_QUEUE_MAX_PAGE_SIZE
  ) {
    throw new ConvexError({
      code: "INVALID_PAGE_SIZE",
      message: `Draw queue pages must contain between 1 and ${LENDER_DRAW_QUEUE_MAX_PAGE_SIZE} rows.`,
      recoverable: true,
    });
  }
}

