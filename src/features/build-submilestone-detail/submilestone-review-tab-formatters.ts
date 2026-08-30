import type { Id } from "../../../convex/_generated/dataModel";
import type { CostDocumentSummary } from "../cost-documents/CostDocumentRoadmapReconciliation.tsx";
import type { SubmilestoneCostDocument } from "../cost-documents/SubmilestoneCostDocuments.tsx";
import type { ReviewTabBootstrap } from "./submilestone-review-tab-contracts.ts";

export function formatReviewCents(cents: number | undefined) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format((cents ?? 0) / 100);
}

export function formatOptionalReviewCents(cents: number | undefined) {
  return cents === undefined ? "Not recorded" : formatReviewCents(cents);
}

export function formatReviewDate(value: number | undefined) {
  if (value === undefined) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function plannedSubmilestoneDate(
  bootstrap: ReviewTabBootstrap,
  boundary: "end" | "start"
) {
  const { plannedDurationDays, plannedStartDay } = bootstrap.overview;
  if (plannedStartDay === undefined || !bootstrap.build.startDate) {
    return "Not scheduled";
  }
  const start = Date.parse(bootstrap.build.startDate);
  if (!Number.isFinite(start)) {
    return boundary === "start" ? bootstrap.build.startDate : "Not scheduled";
  }
  const dayOffset =
    Math.max(0, Math.round(plannedStartDay)) +
    (boundary === "end"
      ? Math.max(1, Math.round(plannedDurationDays ?? 1)) - 1
      : 0);
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export function costDocumentsForSubmilestone(
  documents: CostDocumentSummary[],
  buildSubmilestoneId: Id<"buildSubmilestones">
): SubmilestoneCostDocument[] {
  return documents
    .filter(
      (document) =>
        document.lifecycle.state === "current" &&
        document.allocations.some(
          (allocation) =>
            String(allocation.buildSubmilestoneId) ===
            String(buildSubmilestoneId)
        )
    )
    .map((document) => ({
      _id: String(document._id),
      allocationAmountCents: document.allocations
        .filter(
          (allocation) =>
            String(allocation.buildSubmilestoneId) ===
            String(buildSubmilestoneId)
        )
        .reduce((sum, allocation) => sum + allocation.amountCents, 0),
      kind: document.kind,
      pages: document.pages.map((page) => ({
        assetId: String(page.assetId),
        fileName: page.fileName,
        mimeType: page.mimeType,
      })),
      title: document.title,
    }));
}

export function reviewStateLabel(state: string) {
  return state
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function siteVisitStatusLabel(status: string) {
  return reviewStateLabel(status);
}

export function reviewKindLabel(kind: string) {
  return reviewStateLabel(kind);
}

export function formatReviewTimestamp(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value);
}

export function stateTransitionLabel(priorState: string, newState: string) {
  return `State transition: ${summarizeState(priorState)} → ${summarizeState(newState)}`;
}

function summarizeState(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return (
      Object.entries(parsed)
        .map(([key, item]) => `${reviewStateLabel(key)}: ${String(item)}`)
        .join(", ") || "Recorded"
    );
  } catch {
    return value || "Recorded";
  }
}
