"use client";
import type * as React from "react";
import {
  lazy,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import type { CostDocumentSummary } from "#/features/cost-documents/CostDocumentRoadmapReconciliation.tsx";
import type { ActiveBuildTimelineWorkspaceProps } from "./ActiveBuildTimelineWorkspace";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import { initialsFor } from "./format";
import {
  type MilestoneSheetData,
} from "./MilestoneDetailSheet";
import { deriveScheduleHealth } from "./scheduleHealth";
import type {
  ProductionBuildDetail,
  ProductionBuildProjection,
  ProductionBuildStatus,
  ProductionDraw,
  ProductionDrawStatus,
  ProductionMilestone,
  ProductionSiteVisit,
  ProductionSubmilestone,
} from "./production-build-detail-contracts.ts";
import {
  contractorAssignmentsForMilestone,
  siteVisitFromCompletionReview,
  stringFromRecord,
} from "./production-build-detail-evidence-utils.ts";
import { materialPlanningItemTotal } from "./production-build-detail-draw-overview.tsx";
import { resolveProductionMilestoneKanbanState } from "./production-build-detail-workspaces.tsx";

export function toProductionMilestoneSheetData(
  detail: ProductionBuildDetail,
  milestoneKey: string,
  costDocuments: CostDocumentSummary[] = []
): MilestoneSheetData | null {
  const projection = buildProductionBuildProjection(detail);
  return buildMilestoneSheetData(
    detail,
    projection,
    milestoneKey,
    resolveProductionCurrentDay(detail),
    costDocuments
  );
}

export function buildMilestoneSheetData(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
  milestoneKey: string,
  currentDay: number,
  costDocuments: CostDocumentSummary[] = []
): MilestoneSheetData | null {
  const milestone = projection.milestones.find(
    (row) => row.key === milestoneKey
  );
  if (!milestone) {
    return null;
  }
  const draw = projection.draws.find(
    (row) => row.milestoneKey === milestoneKey
  );
  const state = resolveProductionMilestoneKanbanState({
    currentDay,
    draw,
    milestone,
    projection,
  });
  const events = (detail.auditEvents ?? [])
    .filter((event) =>
      ["milestone", "evidence", "site_visit"].some((scope) =>
        event.eventType.includes(scope)
      )
    )
    .slice(0, 6)
    .map((event) => ({
      _id: event._id,
      actor: event.actorPersona,
      createdAt: event.createdAt,
      title: event.eventType.replace(/[._]/g, " "),
    }));
  const reviewStatus = stringFromRecord(milestone.completionReview, "status");
  const reviewNote = stringFromRecord(
    milestone.completionReview,
    "note"
  )?.trim();
  const reviewRequestedAt = stringFromRecord(
    milestone.completionReview,
    "reviewedAt"
  );
  const parsedReviewRequestedAt = reviewRequestedAt
    ? Date.parse(reviewRequestedAt)
    : Number.NaN;
  const completionSubmittedAt = stringFromRecord(
    milestone.completionClaim,
    "submittedAt"
  );
  const parsedSubmittedAt = completionSubmittedAt
    ? Date.parse(completionSubmittedAt)
    : Number.NaN;
  const sourceSubmilestones = detail.submilestones
    .filter((row) => row.milestoneKey === milestone.key)
    .sort((left, right) => left.order - right.order);
  const explicitBudgetCents = sourceSubmilestones.reduce(
    (sum, row) => sum + Math.max(0, row.budgetCents ?? 0),
    0
  );
  const missingBudgetCount = sourceSubmilestones.filter(
    (row) => !row.budgetCents || row.budgetCents <= 0
  ).length;
  const distributedBudgetCents = Math.round(
    Math.max(0, milestone.budgetCents - explicitBudgetCents) /
      Math.max(1, missingBudgetCount)
  );
  return {
    actualStartedAt: milestone.actualStartedAt,
    canStartWork: state.canStartWork,
    column: state.column,
    contractors: contractorAssignmentsForMilestone(detail, milestone.key).map(
      (contractor) => ({
        initials: initialsFor(contractor.name),
        name: contractor.name,
        role: contractor.role,
      })
    ),
    drawGroupKey: draw?.drawKey ?? milestone.key,
    currentDay,
    milestoneKey: milestone.key,
    name: milestone.name,
    plannedBudgetCents: milestone.budgetCents,
    plannedEndDate: addDaysSafe(detail.build.startDate, milestone.dayEnd),
    plannedStartDate: addDaysSafe(detail.build.startDate, milestone.dayStart),
    recentEvents: events,
    status: milestone.status,
    reviewRequest:
      reviewStatus === "revisionRequested" && reviewNote
        ? {
            note: reviewNote,
            ...(Number.isFinite(parsedReviewRequestedAt)
              ? { requestedAt: parsedReviewRequestedAt }
              : {}),
          }
        : undefined,
    requestedAmountCents:
      milestone.drawAvailabilityCents > 0
        ? milestone.drawAvailabilityCents
        : draw?.amountCents,
    submittedAt: Number.isFinite(parsedSubmittedAt)
      ? parsedSubmittedAt
      : undefined,
    submilestones: sourceSubmilestones.map((submilestone) => {
      const startDay =
        submilestone.startDay ??
        milestone.dayStart + Math.max(0, submilestone.order - 1);
      const durationDays = Math.max(1, submilestone.durationDays ?? 1);
      const endDay = startDay + durationDays - 1;
      const scheduleHealth = deriveScheduleHealth({
        currentDay,
        endDay,
        lifecycleStatus: submilestone.status,
      });
      const assignments = (detail.milestoneContractorAssignments ?? [])
        .filter(
          (assignment) =>
            assignment.milestoneKey === milestone.key &&
            assignment.submilestoneKey === submilestone.key
        )
        .map((assignment) => ({
          actualCostCents: assignment.actualCostCents,
          actualHours: assignment.actualHours,
          agreedRateCents: assignment.agreedRateCents,
          agreedRateUnit: assignment.agreedRateUnit,
          contractorId: assignment.contractorId,
          costNotes: assignment.costNotes,
          estimatedCostCents: assignment.estimatedCostCents,
          estimatedHours: assignment.estimatedHours,
          name: assignment.contractor?.name ?? "Assigned contractor",
          role: assignment.role,
          status: assignment.status,
        }));
      const materials = (detail.costItems ?? [])
        .filter((item) =>
          item.relevantSubmilestoneKeys.includes(submilestone.key)
        )
        .map((item) => ({
          description: item.description,
          id: item._id,
          quantity: item.quantity,
          supplier: item.supplier,
          title: item.title,
          totalCents: materialPlanningItemTotal(item),
          type: item.itemType,
        }));
      const evidence = (detail.evidenceAssets ?? [])
        .filter(
          (asset) =>
            asset.milestoneKey === milestone.key &&
            asset.submilestoneKey === submilestone.key
        )
        .map((asset) => ({
          createdAt: asset.createdAt,
          evidenceKey: asset.evidenceKey,
          fileName: asset.fileName,
          label: asset.label,
          locationVerified: asset.locationVerified ?? false,
          mimeType: asset.mimeType,
          previewUrl: asset.previewUrl,
          sizeBytes: asset.sizeBytes,
          source: asset.source,
          tag: asset.tag,
        }));
      const siteVisits = (detail.siteVisits ?? [])
        .filter(
          (visit) =>
            visit.milestoneKey === milestone.key &&
            (visit.submilestoneKeys ?? []).includes(submilestone.key)
        )
        .map((visit) => ({
          completedAt: visit.completedAt,
          note: visit.note,
          recordNote: visit.recordNote,
          recordNoteFormat: visit.recordNoteFormat,
          requestedAt: visit.requestedAt,
          status: visit.status,
          visitId: visit.visitId,
        }));
      const submilestoneCostDocuments = costDocuments
        .filter(
          (document) =>
            document.lifecycle.state === "current" &&
            document.allocations.some(
              (allocation) =>
                String(allocation.buildSubmilestoneId) ===
                String(submilestone._id)
            )
        )
        .map((document) => ({
          _id: String(document._id),
          allocationAmountCents: document.allocations
            .filter(
              (allocation) =>
                String(allocation.buildSubmilestoneId) ===
                String(submilestone._id)
            )
            .reduce((sum, allocation) => sum + allocation.amountCents, 0),
          kind: document.kind,
          pages: document.pages.map((page) => ({
            assetId: String(page.assetId),
            fileName: page.fileName,
            mimeType: page.mimeType,
          })),
          subtotalCents: document.financialComponents
            ?.filter((component) => component.kind === "subtotal")
            .reduce((sum, component) => sum + component.amountCents, 0),
          taxCents: document.financialComponents
            ?.filter((component) => component.kind === "tax")
            .reduce((sum, component) => sum + component.amountCents, 0),
          title: document.title,
        }));
      return {
        actualStartedAt: submilestone.actualStartedAt,
        actualCostCents: submilestone.actualCostCents,
        assignments,
        budgetCents:
          submilestone.budgetCents && submilestone.budgetCents > 0
            ? submilestone.budgetCents
            : distributedBudgetCents,
        completedAt: submilestone.completedAt,
        completedByWorkosUserId: submilestone.completedByWorkosUserId,
        costDocuments: submilestoneCostDocuments,
        description:
          materials.find((item) => item.description)?.description ??
          `Complete and document the ${submilestone.name.toLowerCase()} scope against the approved construction roadmap.`,
        endDate: addDaysSafe(detail.build.startDate, endDay),
        evidence,
        fieldNote: submilestone.fieldNote,
        key: submilestone.key,
        materials,
        name: submilestone.name,
        order: submilestone.order,
        review:
          submilestone.reviewDecisionState || submilestone.evidenceReviewState
            ? {
                backOfficeApproved:
                  submilestone.reviewDecisionState === "approved",
                backOfficeRequired: false,
                lenderApprovals: 0,
                lenderQuorumRequired: false,
                lenderQuorumSize: 0,
                state:
                  submilestone.reviewDecisionState === "approved"
                    ? "approved"
                    : submilestone.reviewDecisionState ===
                          "changes_requested" ||
                        submilestone.evidenceReviewState === "changes_requested"
                      ? "rejected"
                      : "pending_review",
              }
            : undefined,
        scheduleHealth,
        siteVisits,
        startDate: addDaysSafe(detail.build.startDate, startDay),
        status: submilestone.status,
        // Convex treats a legacy sub-milestone row without workflowRevision as
        // canonical revision 0. Preserve that row-scoped token for governed
        // lifecycle commands instead of borrowing the parent revision.
        workflowRevision: submilestone.workflowRevision ?? 0,
        submilestoneId: submilestone._id,
      };
    }),
  };
}

export function resolveProductionCurrentDay(
  detail: ProductionBuildDetail,
  timelineWorkspace?: ActiveBuildTimelineWorkspaceProps["workspace"] | null
) {
  const timelineDay = timelineWorkspace?.plan?.currentDay;
  if (typeof timelineDay === "number" && Number.isFinite(timelineDay)) {
    return Math.round(timelineDay);
  }
  return daysBetweenProductionDates(
    detail.build.startDate,
    new Date().toISOString()
  );
}

function daysBetweenProductionDates(startIso: string, endIso: string) {
  const parseDay = (value: string) => {
    const dayPart = value.includes("T") ? value.slice(0, 10) : value;
    const ms = Date.parse(`${dayPart}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : Date.now();
  };
  return Math.max(
    0,
    Math.round((parseDay(endIso) - parseDay(startIso)) / 86_400_000)
  );
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildProductionBuildProjection(
  detail: ProductionBuildDetail
): ProductionBuildProjection {
  const milestones = [...detail.milestones].sort((a, b) => a.order - b.order);
  const draws = [...detail.draws].sort((a, b) => a.order - b.order);
  const submilestones = [...detail.submilestones].sort(
    (a, b) => a.order - b.order
  );
  const submilestonesByMilestone = new Map<string, ProductionSubmilestone[]>();
  for (const submilestone of submilestones) {
    const list = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    list.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, list);
  }
  const maxDay = Math.max(
    60,
    ...milestones.map((milestone) => milestone.dayEnd + 14),
    ...draws.map((draw) => draw.timingDay + 14)
  );
  const calendarIsoDates = new Set<string>();
  for (const milestone of milestones) {
    calendarIsoDates.add(
      addDaysSafe(detail.build.startDate, milestone.dayStart)
    );
    calendarIsoDates.add(addDaysSafe(detail.build.startDate, milestone.dayEnd));
  }
  for (const draw of draws) {
    calendarIsoDates.add(addDaysSafe(detail.build.startDate, draw.timingDay));
  }

  return {
    calendarDates: [...calendarIsoDates].map(dateFromIso),
    draws,
    maxDay,
    milestones,
    submilestonesByMilestone,
  };
}

export function buildCurrentBuildOverview(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection,
  currentDay: number
): CurrentBuildOverview {
  const incompleteMilestones = projection.milestones.filter(
    (milestone) => !isMilestoneApprovedForDrawAvailability(milestone)
  );
  const behindSchedule = incompleteMilestones
    .filter(
      (milestone) =>
        deriveScheduleHealth({
          currentDay,
          endDay: milestone.dayEnd,
          lifecycleStatus: milestone.status,
        }).health === "behind_schedule"
    )
    .sort(compareMilestonesMostOverdueFirst);
  const behindScheduleKeys = new Set(
    behindSchedule.map((milestone) => milestone.key)
  );
  const current = incompleteMilestones
    .filter(
      (milestone) =>
        !behindScheduleKeys.has(milestone.key) &&
        isCurrentActiveMilestone(milestone)
    )
    .sort(compareMilestonesMostRecentFirst);
  const currentKeys = new Set(current.map((milestone) => milestone.key));
  const next =
    incompleteMilestones
      .filter(
        (milestone) =>
          !(
            behindScheduleKeys.has(milestone.key) ||
            currentKeys.has(milestone.key)
          )
      )
      .sort(compareMilestonesScheduleFirst)[0] ?? null;
  const approvedMilestoneAvailabilityCents = projection.milestones
    .filter(isMilestoneApprovedForDrawAvailability)
    .reduce((sum, milestone) => sum + milestone.drawAvailabilityCents, 0);
  const committedDrawCents = projection.draws
    .filter((draw) => isCommittedDrawStatus(draw.status))
    .reduce((sum, draw) => sum + draw.amountCents, 0);
  const drawnCents = projection.draws
    .filter((draw) => draw.status === "released")
    .reduce((sum, draw) => sum + draw.amountCents, 0);
  const currentAvailabilityCents = Math.max(
    0,
    approvedMilestoneAvailabilityCents - committedDrawCents
  );
  const totalApprovedCents =
    detail.loanFacility?.principalCents ??
    detail.capitalPlan?.lenderDrawPolicyLimitCents ??
    detail.build.totalBudgetCents;
  const upcomingDraw = resolveUpcomingDraw(projection.draws);
  const requestableAmountCents =
    upcomingDraw && isRequestableDrawStatus(upcomingDraw.status)
      ? Math.min(upcomingDraw.amountCents, currentAvailabilityCents)
      : 0;

  return {
    committedDrawCents,
    currentAvailabilityCents,
    drawnCents,
    milestoneHorizon: {
      behindSchedule,
      current,
      next,
    },
    percentComplete: buildPercentComplete(projection.milestones),
    requestableAmountCents,
    totalApprovedCents,
    upcomingDraw,
  };
}

function compareMilestonesMostOverdueFirst(
  left: ProductionMilestone,
  right: ProductionMilestone
): number {
  return left.dayEnd - right.dayEnd || left.order - right.order;
}

function compareMilestonesScheduleFirst(
  left: ProductionMilestone,
  right: ProductionMilestone
): number {
  return left.dayStart - right.dayStart || left.order - right.order;
}

function compareMilestonesMostRecentFirst(
  left: ProductionMilestone,
  right: ProductionMilestone
): number {
  const scoreDelta =
    milestoneRecentActivityScore(right) - milestoneRecentActivityScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return right.order - left.order;
}

function milestoneRecentActivityScore(milestone: ProductionMilestone): number {
  const submittedAt = stringFromRecord(
    milestone.completionClaim,
    "submittedAt"
  );
  const reviewedAt = stringFromRecord(milestone.completionReview, "reviewedAt");
  const parsedDates = [submittedAt, reviewedAt]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  if (parsedDates.length > 0) {
    return Math.max(...parsedDates);
  }
  if (typeof milestone.updatedAt === "number") {
    return milestone.updatedAt;
  }
  return milestone.dayEnd;
}

export function isCurrentActiveMilestone(milestone: ProductionMilestone): boolean {
  return (
    milestone.status === "in_progress" ||
    milestoneHasPendingCompletionClaim(milestone)
  );
}

export function milestoneHasPendingCompletionClaim(
  milestone: ProductionMilestone
): boolean {
  const reviewStatus = stringFromRecord(milestone.completionReview, "status");
  return (
    milestone.status !== "complete" &&
    Boolean(milestone.completionClaim) &&
    reviewStatus !== "approved"
  );
}

export function isMilestoneApprovedForDrawAvailability(
  milestone: ProductionMilestone
): boolean {
  return (
    milestone.status === "complete" ||
    stringFromRecord(milestone.completionReview, "status") === "approved"
  );
}

function isCommittedDrawStatus(status: ProductionDrawStatus): boolean {
  return (
    status === "requested" ||
    status === "in_review" ||
    status === "ready_for_admin" ||
    status === "approved_for_release" ||
    status === "released"
  );
}

export function isRequestableDrawStatus(
  status: ProductionDrawStatus | undefined
): boolean {
  return status === "planned" || status === "rejected";
}

function resolveUpcomingDraw(draws: ProductionDraw[]): ProductionDraw | null {
  return (
    draws
      .filter(
        (draw) => draw.status !== "released" && draw.status !== "cancelled"
      )
      .slice()
      .sort((a, b) => {
        const statusDelta =
          upcomingDrawStatusPriority(a.status) -
          upcomingDrawStatusPriority(b.status);
        if (statusDelta !== 0) {
          return statusDelta;
        }
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return a.timingDay - b.timingDay;
      })[0] ?? null
  );
}

export function compareDrawsMostRecentFirst(
  left: ProductionDraw,
  right: ProductionDraw
): number {
  const scoreDelta =
    drawRecentActivityScore(right) - drawRecentActivityScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return right.order - left.order;
}

function drawRecentActivityScore(draw: ProductionDraw): number {
  const activityDates = [
    draw.releasedAt,
    draw.releaseDate,
    draw.reviewedAt,
    draw.requestedAt,
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  if (activityDates.length > 0) {
    return Math.max(...activityDates);
  }
  return draw.timingDay;
}

export function compareDrawsScheduleFirst(
  left: ProductionDraw,
  right: ProductionDraw
): number {
  if (left.order !== right.order) {
    return left.order - right.order;
  }
  return left.timingDay - right.timingDay;
}

function siteVisitsForMilestone(
  detail: ProductionBuildDetail,
  milestone: ProductionMilestone
): ProductionSiteVisit[] {
  const visits = (detail.siteVisits ?? []).filter(
    (visit) => visit.milestoneKey === milestone.key
  );
  const reviewedVisit = siteVisitFromCompletionReview(
    milestone.completionReview
  );
  const merged = new Map<string, ProductionSiteVisit>();
  if (reviewedVisit) {
    const visitId = reviewedVisit.visitId ?? milestone.key;
    merged.set(visitId, {
      milestoneKey: milestone.key,
      requestedAt: reviewedVisit.requestedAt ?? reviewedVisit.completedAt ?? "",
      requestedDay: reviewedVisit.requestedDay ?? milestone.dayEnd,
      status: reviewedVisit.status ?? "requested",
      visitId,
      ...(reviewedVisit._id ? { _id: reviewedVisit._id } : {}),
      ...(reviewedVisit.completedAt
        ? { completedAt: reviewedVisit.completedAt }
        : {}),
      ...(reviewedVisit.note ? { note: reviewedVisit.note } : {}),
      ...(reviewedVisit.recordNote
        ? { recordNote: reviewedVisit.recordNote }
        : {}),
      ...(reviewedVisit.recordNoteFormat
        ? { recordNoteFormat: reviewedVisit.recordNoteFormat }
        : {}),
      ...(reviewedVisit.submilestoneIds?.length
        ? { submilestoneIds: reviewedVisit.submilestoneIds }
        : {}),
      ...(reviewedVisit.requestedTime
        ? { requestedTime: reviewedVisit.requestedTime }
        : {}),
      ...(reviewedVisit.tokenConsumedAt
        ? { tokenConsumedAt: reviewedVisit.tokenConsumedAt }
        : {}),
      ...(reviewedVisit.tokenExpiresAt
        ? { tokenExpiresAt: reviewedVisit.tokenExpiresAt }
        : {}),
      ...(reviewedVisit.tokenOpenedAt
        ? { tokenOpenedAt: reviewedVisit.tokenOpenedAt }
        : {}),
      ...(reviewedVisit.url ? { url: reviewedVisit.url } : {}),
    });
  }
  // Canonical site-visit rows must win over the completion-review snapshot.
  // Otherwise a stale "requested" snapshot can overwrite a newly cancelled
  // visit and leave the lender interface looking active after the mutation.
  for (const visit of visits) {
    merged.set(siteVisitIdentity(visit), visit);
  }
  return [...merged.values()]
    .filter((visit) => visit.status !== "cancelled")
    .sort(
      (a, b) =>
        siteVisitRecentActivityScore(b) - siteVisitRecentActivityScore(a)
    );
}

function siteVisitIdentity(visit: ProductionSiteVisit) {
  return visit.visitId ?? visit._id ?? `${visit.milestoneKey}-visit`;
}

function siteVisitRecentActivityScore(visit: ProductionSiteVisit): number {
  if (visit.completedAt) {
    const completed = Date.parse(visit.completedAt);
    if (Number.isFinite(completed)) {
      return completed;
    }
  }
  if (typeof visit.tokenOpenedAt === "number") {
    return visit.tokenOpenedAt;
  }
  if (typeof visit.updatedAt === "number") {
    return visit.updatedAt;
  }
  const requested = Date.parse(visit.requestedAt);
  if (Number.isFinite(requested)) {
    return requested;
  }
  return typeof visit.createdAt === "number" ? visit.createdAt : 0;
}

export function siteVisitStateLabel(visit: ProductionSiteVisit): string {
  if (visit.status === "complete") {
    return "Site visit completed";
  }
  if (visit.status === "cancelled") {
    return "Site visit cancelled";
  }
  if (visit.tokenOpenedAt) {
    return "Site visit in progress";
  }
  return "Site visit ordered";
}

export function siteVisitTokenStateLabel(visit: ProductionSiteVisit): string {
  if (visit.status === "complete" || visit.tokenConsumedAt) {
    return "Consumed";
  }
  if (visit.status === "cancelled") {
    return "Cancelled";
  }
  if (visit.tokenExpiresAt && visit.tokenExpiresAt <= Date.now()) {
    return "Expired";
  }
  if (visit.tokenOpenedAt) {
    return "Opened";
  }
  return "Active";
}

export function formatSiteVisitDateTime(value?: string | number): string {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function siteVisitBadgeVariant(
  visit: ProductionSiteVisit
): React.ComponentProps<typeof Badge>["variant"] {
  if (visit.status === "complete") {
    return "success";
  }
  if (visit.status === "cancelled") {
    return "destructive";
  }
  return visit.tokenOpenedAt ? "warning" : "info";
}

function upcomingDrawStatusPriority(status: ProductionDrawStatus): number {
  if (status === "planned" || status === "rejected") {
    return 0;
  }
  if (status === "requested") {
    return 1;
  }
  if (status === "in_review") {
    return 2;
  }
  if (status === "ready_for_admin") {
    return 3;
  }
  if (status === "approved_for_release") {
    return 4;
  }
  return 5;
}

export function buildPercentComplete(milestones: ProductionMilestone[]): number {
  const completed = milestones.filter(
    (milestone) => milestone.status === "complete"
  ).length;
  return milestones.length > 0
    ? Math.round((completed / milestones.length) * 100)
    : 0;
}

export function milestoneProgressPercent(
  milestone: ProductionMilestone,
  submilestones: ProductionSubmilestone[]
): number {
  if (typeof milestone.normalizedProgressPercent === "number") {
    return clampPercent(milestone.normalizedProgressPercent);
  }
  if (typeof milestone.progressPercent === "number") {
    return clampPercent(milestone.progressPercent);
  }
  if (submilestones.length > 0) {
    return clampPercent(
      (submilestones.filter(
        (submilestone) => submilestone.status === "complete"
      ).length /
        submilestones.length) *
        100
    );
  }
  if (milestone.status === "complete") {
    return 100;
  }
  return milestone.status === "in_progress" ? 50 : 0;
}

export function addDaysSafe(isoDate: string, days: number): string {
  const base = dateFromIso(isoDate);
  if (Number.isNaN(base.valueOf())) {
    return isoDate;
  }
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateFromIso(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!(year && month && day)) {
    return new Date(isoDate);
  }
  return new Date(year, month - 1, day);
}

export function statusLabel(status: ProductionBuildStatus): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function drawStatusLabel(status: ProductionDrawStatus): string {
  switch (status) {
    case "approved_for_release":
      return "Approved for release";
    case "in_review":
      return "In review";
    case "ready_for_admin":
      return "Ready for admin";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "requested":
      return "Requested";
    case "released":
      return "Released";
    default:
      return "Planned";
  }
}
