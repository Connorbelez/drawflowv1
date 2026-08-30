"use client";

import type * as React from "react";
import {
  lazy,
} from "react";
import { Badge } from "#/components/ui/badge.tsx";
import type { Id } from "../../../convex/_generated/dataModel";

const LazyFieldRichTextPreview = lazy(() =>
  import("#/components/rich-text/field-rich-text.tsx").then((m) => ({
    default: m.FieldRichTextPreview,
  }))
);

import type {
  ProductionBuildDetail,
  ProductionBuildProjection,
  ProductionBuildStatus,
  ProductionDrawStatus,
  ProductionEvidenceAsset,
  ProductionEvidenceRow,
  ProductionMilestone,
  ProductionSiteVisit,
} from "./production-build-detail-contracts.ts";
import { addDaysSafe } from "./production-build-detail-projection.ts";

export function buildBuilderEvidenceRows(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection
): ProductionEvidenceRow[] {
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  return projection.milestones.flatMap((milestone) => {
    const assets = evidenceAssetsForMilestone(detail, milestone.key).filter(
      (asset) => !isSiteVisitEvidenceAsset(asset)
    );
    if (!hasBuilderSubmittedEvidence(milestone) && assets.length === 0) {
      return [];
    }
    const claim = milestone.completionClaim;
    const review = milestone.completionReview;
    const evidenceReview =
      review?.evidenceReview &&
      typeof review.evidenceReview === "object" &&
      !Array.isArray(review.evidenceReview)
        ? (review.evidenceReview as Record<string, unknown>)
        : undefined;
    const completedDay = numberFromRecord(claim, "completedDay");
    const submittedAt =
      stringFromRecord(claim, "submittedAt") ??
      stringFromRecord(review, "reviewedAt") ??
      (completedDay === undefined
        ? undefined
        : addDaysSafe(detail.build.startDate, completedDay));
    const note =
      stringFromRecord(claim, "note") ?? stringFromRecord(review, "note");
    const status =
      evidenceReview?.accepted === true
        ? "Accepted"
        : evidenceReview?.accepted === false
          ? "Info requested"
          : (stringFromRecord(review, "status") ??
            milestone.evidenceState ??
            "Submitted");
    const row: ProductionEvidenceRow = {
      amountCents:
        drawByMilestone.get(milestone.key)?.amountCents ??
        milestone.drawAvailabilityCents,
      assets,
      id: `builder-${milestone.key}`,
      locationState: evidenceLocationState(detail, milestone.key),
      milestoneKey: milestone.key,
      milestoneName: milestone.name,
      note,
      ...(canonicalSubmilestoneIdForEvidence(
        detail,
        milestone.key,
        assets.map((asset) => asset.submilestoneId)
      )
        ? {
            submilestoneId: canonicalSubmilestoneIdForEvidence(
              detail,
              milestone.key,
              assets.map((asset) => asset.submilestoneId)
            ),
          }
        : {}),
      source: "builder",
      status,
      submittedAt,
    };
    return [row];
  });
}

export function buildCompletedSiteVisitRows(
  detail: ProductionBuildDetail,
  projection: ProductionBuildProjection
): ProductionEvidenceRow[] {
  const milestoneByKey = new Map(
    projection.milestones.map((milestone) => [milestone.key, milestone])
  );
  const drawByMilestone = new Map(
    projection.draws
      .filter((draw) => draw.milestoneKey)
      .map((draw) => [draw.milestoneKey as string, draw])
  );
  const rows = new Map<string, ProductionEvidenceRow>();
  const addVisit = (visit: ProductionSiteVisit) => {
    if (visit.status !== "complete") {
      return;
    }
    const milestone = milestoneByKey.get(visit.milestoneKey);
    const key = visit.visitId || visit._id || visit.milestoneKey;
    const assets = siteVisitEvidenceAssetsForVisit(detail, visit);
    rows.set(key, {
      amountCents:
        drawByMilestone.get(visit.milestoneKey)?.amountCents ??
        milestone?.drawAvailabilityCents,
      assets,
      completedAt: visit.completedAt,
      id: `site-visit-${key}`,
      locationState: evidenceLocationState(detail, visit.milestoneKey, assets),
      milestoneKey: visit.milestoneKey,
      milestoneName: milestone?.name ?? visit.milestoneKey,
      note: visit.recordNote ?? visit.note,
      noteFormat: visit.recordNote ? visit.recordNoteFormat : undefined,
      ...(canonicalSubmilestoneIdForEvidence(
        detail,
        visit.milestoneKey,
        visit.submilestoneIds
      )
        ? {
            submilestoneId: canonicalSubmilestoneIdForEvidence(
              detail,
              visit.milestoneKey,
              visit.submilestoneIds
            ),
          }
        : {}),
      source: "site_visit",
      status: visit.status,
      submittedAt: visit.requestedAt,
    });
  };

  for (const visit of detail.siteVisits ?? []) {
    addVisit(visit);
  }
  for (const milestone of projection.milestones) {
    const siteVisit = siteVisitFromCompletionReview(milestone.completionReview);
    if (siteVisit?.status === "complete") {
      addVisit({
        milestoneKey: milestone.key,
        requestedAt: siteVisit.requestedAt ?? siteVisit.completedAt ?? "",
        requestedDay: siteVisit.requestedDay ?? milestone.dayEnd,
        status: siteVisit.status,
        visitId: siteVisit.visitId ?? milestone.key,
        ...(siteVisit.completedAt
          ? { completedAt: siteVisit.completedAt }
          : {}),
        ...(siteVisit.note ? { note: siteVisit.note } : {}),
        ...(siteVisit.recordNote ? { recordNote: siteVisit.recordNote } : {}),
        ...(siteVisit.recordNoteFormat
          ? { recordNoteFormat: siteVisit.recordNoteFormat }
          : {}),
        ...(siteVisit.submilestoneIds?.length
          ? { submilestoneIds: siteVisit.submilestoneIds }
          : {}),
        ...(siteVisit.tokenExpiresAt
          ? { tokenExpiresAt: siteVisit.tokenExpiresAt }
          : {}),
      });
    }
  }
  return [...rows.values()].sort((a, b) =>
    (b.completedAt ?? b.submittedAt ?? "").localeCompare(
      a.completedAt ?? a.submittedAt ?? ""
    )
  );
}

function canonicalSubmilestoneIdForEvidence(
  detail: ProductionBuildDetail,
  milestoneKey: string,
  submilestoneIds?: Array<Id<"buildSubmilestones"> | undefined>
) {
  const uniqueKeys = [
    ...new Set(
      (submilestoneIds ?? []).filter((id): id is Id<"buildSubmilestones"> =>
        Boolean(id)
      )
    ),
  ];
  if (uniqueKeys.length !== 1) {
    return;
  }
  return detail.submilestones.find(
    (submilestone) =>
      submilestone.milestoneKey === milestoneKey &&
      submilestone._id === uniqueKeys[0]
  )?._id;
}

function hasBuilderSubmittedEvidence(milestone: ProductionMilestone) {
  if (milestone.completionClaim) {
    return true;
  }
  const state = String(milestone.evidenceState ?? "").toLowerCase();
  if (!state) {
    return false;
  }
  return !["draft package", "not started", "planned"].includes(state);
}

function evidenceLocationState(
  detail: ProductionBuildDetail,
  milestoneKey: string,
  scopedAssets = evidenceAssetsForMilestone(detail, milestoneKey)
): ProductionEvidenceRow["locationState"] {
  if (scopedAssets.some((asset) => asset.locationVerified === false)) {
    return "unverified";
  }
  if (scopedAssets.some((asset) => asset.locationVerified === true)) {
    return "verified";
  }
  const relatedPhotos = (detail.sitePhotos ?? []).filter((photo) =>
    [photo.caption, photo.evidenceKey]
      .filter(Boolean)
      .some((value) =>
        String(value).toLowerCase().includes(milestoneKey.toLowerCase())
      )
  );
  if (relatedPhotos.some((photo) => photo.locationVerified === false)) {
    return "unverified";
  }
  if (relatedPhotos.some((photo) => photo.locationVerified === true)) {
    return "verified";
  }
  return;
}

export function evidenceAssetsForMilestone(
  detail: ProductionBuildDetail,
  milestoneKey: string
) {
  return (detail.evidenceAssets ?? []).filter(
    (asset) => asset.milestoneKey === milestoneKey
  );
}

export function siteVisitEvidenceAssetsForVisit(
  detail: ProductionBuildDetail,
  visit: ProductionSiteVisit
) {
  const milestoneAssets = evidenceAssetsForMilestone(
    detail,
    visit.milestoneKey
  );
  const visitId = visit.visitId ?? visit._id;
  const visitAssets = milestoneAssets.filter((asset) => {
    const source = String(asset.source ?? "");
    return (
      isSiteVisitEvidenceAsset(asset) &&
      (!visitId || source.includes(String(visitId)))
    );
  });
  if (visitAssets.length > 0) {
    return visitAssets;
  }
  return milestoneAssets.filter(isSiteVisitEvidenceAsset);
}

function isSiteVisitEvidenceAsset(asset: ProductionEvidenceAsset) {
  return String(asset.source ?? "")
    .toLowerCase()
    .includes("site_visit");
}

export function isUsableEvidenceUrl(url?: string | null) {
  if (!url) {
    return false;
  }
  return !(
    url.startsWith("production-evidence://") ||
    url.startsWith("production-build://")
  );
}

export function evidenceImagePreviewUrl(url?: string | null) {
  if (!url) {
    return null;
  }
  const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!siteUrl) {
    return null;
  }
  return `${siteUrl}/evidence-image-preview?url=${encodeURIComponent(url)}`;
}

export function evidenceImageSourceUrl(url?: string | null) {
  if (!url) {
    return null;
  }
  const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!siteUrl) {
    return null;
  }
  return `${siteUrl}/evidence-image-source?url=${encodeURIComponent(url)}`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"] as const;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export function evidenceStatusLabel(status: string): string {
  if (!status) {
    return "Submitted";
  }
  return status
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function evidenceStatusVariant(
  status: string
): React.ComponentProps<typeof Badge>["variant"] {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("approved") ||
    normalized.includes("accepted") ||
    normalized === "complete"
  ) {
    return "success";
  }
  if (
    normalized.includes("rejected") ||
    normalized.includes("failed") ||
    normalized.includes("declined")
  ) {
    return "destructive";
  }
  if (
    normalized.includes("info") ||
    normalized.includes("revision") ||
    normalized.includes("unverified") ||
    normalized.includes("requested")
  ) {
    return "warning";
  }
  if (normalized.includes("submitted") || normalized.includes("claim")) {
    return "info";
  }
  return "outline";
}

export function evidenceStatusIsAccepted(status: string): boolean {
  const normalized = status.toLowerCase();
  return (
    normalized.includes("approved") ||
    normalized.includes("accepted") ||
    normalized === "complete"
  );
}

export function stringFromRecord(
  value: Record<string, unknown> | undefined,
  key: string
) {
  const raw = value?.[key];
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

function numberFromRecord(
  value: Record<string, unknown> | undefined,
  key: string
) {
  const raw = value?.[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function siteVisitFromCompletionReview(
  review: Record<string, any> | undefined
): Partial<ProductionSiteVisit> | null {
  const raw = review?.siteVisit;
  return raw && typeof raw === "object" ? raw : null;
}

export function statusBadgeVariant(
  status: ProductionBuildStatus
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "completed") {
    return "success";
  }
  if (status === "paused") {
    return "warning";
  }
  return "info";
}

export function drawBadgeVariant(
  status: ProductionDrawStatus
): React.ComponentProps<typeof Badge>["variant"] {
  if (status === "released") {
    return "success";
  }
  if (status === "requested") {
    return "warning";
  }
  if (status === "in_review") {
    return "info";
  }
  if (status === "ready_for_admin" || status === "approved_for_release") {
    return "info";
  }
  if (status === "rejected") {
    return "destructive";
  }
  return "outline";
}

export function contractorAssignmentsForMilestone(
  detail: ProductionBuildDetail,
  milestoneKey: string
) {
  const profileById = new Map<string, { name: string; trades?: string[] }>();
  for (const contractor of detail.contractors ?? []) {
    profileById.set(contractor.contractorId ?? contractor._id, contractor);
  }
  for (const contractor of detail.availableContractors ?? []) {
    profileById.set(contractor._id, contractor);
  }

  return (detail.milestoneContractorAssignments ?? [])
    .filter((assignment) => assignment.milestoneKey === milestoneKey)
    .map((assignment) => {
      const profile =
        assignment.contractor ??
        profileById.get(String(assignment.contractorId));
      const submilestoneName = assignment.submilestoneKey
        ? submilestoneNameFor(detail, milestoneKey, assignment.submilestoneKey)
        : undefined;
      return {
        name: profile?.name ?? "Assigned contractor",
        role: submilestoneName
          ? `${assignment.role} · ${submilestoneName}`
          : assignment.role,
      };
    });
}

function submilestoneNameFor(
  detail: ProductionBuildDetail,
  milestoneKey: string,
  submilestoneKey: string
) {
  return (
    detail.submilestones.find(
      (submilestone) =>
        submilestone.milestoneKey === milestoneKey &&
        submilestone.key === submilestoneKey
    )?.name ?? submilestoneKey
  );
}

export function contractorAssignmentOptions(detail: ProductionBuildDetail) {
  const byId = new Map<
    string,
    {
      _id: string;
      city?: string;
      defaultPayRateCents?: number;
      defaultPayRateUnit?: "hour" | "day" | "fixed";
      email?: string;
      name: string;
      onboardingStatus?: "profile_only" | "invited" | "account_linked";
      trades?: string[];
    }
  >();
  for (const contractor of detail.contractors ?? []) {
    const id = contractor.contractorId ?? contractor._id;
    byId.set(id, {
      _id: id,
      city: contractor.city,
      defaultPayRateCents:
        contractor.payRateCents ??
        contractor.agreedRateCents ??
        contractor.defaultPayRateCents ??
        contractor.hourlyRateCents,
      defaultPayRateUnit:
        contractor.payRateUnit ??
        contractor.agreedRateUnit ??
        contractor.defaultPayRateUnit,
      email: contractor.email,
      name: contractor.name,
      onboardingStatus: contractor.onboardingStatus,
      trades: contractor.trades,
    });
  }
  for (const contractor of detail.availableContractors ?? []) {
    byId.set(contractor._id, {
      _id: contractor._id,
      city: contractor.city,
      defaultPayRateCents: contractor.defaultPayRateCents,
      defaultPayRateUnit: contractor.defaultPayRateUnit,
      email: contractor.email,
      name: contractor.name,
      onboardingStatus: contractor.onboardingStatus,
      trades: contractor.trades,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
