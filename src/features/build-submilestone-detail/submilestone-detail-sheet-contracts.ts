import type { FunctionReturnType } from "convex/server";
import type { ComponentProps } from "react";

import type { Badge } from "#/components/ui/badge.tsx";
import type { SheetPopup } from "#/components/ui/sheet.tsx";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import type { BuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { CostDocumentSummary } from "../cost-documents/CostDocumentRoadmapReconciliation.tsx";

export type { Id } from "../../../convex/_generated/dataModel";
export type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
export type { BuildSubmilestoneDetailTab } from "../build-detail-targets/buildDetailTab.ts";
export type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
export type { CostDocumentSummary } from "../cost-documents/CostDocumentRoadmapReconciliation.tsx";
export type {
  CanonicalDirtySection,
  CanonicalWorkspaceBootstrap,
  CanonicalWorkspaceCollection,
} from "./SubmilestoneDetailCanonical.tsx";

export type WorkspaceBootstrap = FunctionReturnType<
  typeof api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap
>;
export type VisibleWorkspaceBootstrap = Extract<
  WorkspaceBootstrap,
  { submilestone: unknown }
>;
export type WorkspaceCollectionResult = FunctionReturnType<
  typeof api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection
>;
export type VisibleWorkspaceCollection = Extract<
  WorkspaceCollectionResult,
  { page: unknown[] }
>;
export type WorkspaceCollectionRow = VisibleWorkspaceCollection["page"][number];

export type WorkspaceCollection =
  | "evidence_requirements"
  | "evidence_assets"
  | "people_assignments"
  | "people_history"
  | "materials"
  | "collaboration_comments"
  | "review_decisions";

export interface CollectionPaginationState {
  accumulatedRows: WorkspaceCollectionRow[];
  cursor?: string;
  previousPage?: VisibleWorkspaceCollection;
}

export interface CollectionPaginationStore {
  byCollection: Partial<Record<WorkspaceCollection, CollectionPaginationState>>;
  targetKey: string;
}

export interface PendingCanonicalNavigation {
  action: () => void;
  label: string;
}

export type SheetFocusTarget =
  | ComponentProps<typeof SheetPopup>["initialFocus"]
  | undefined;

export const TAB_LABELS: Record<BuildSubmilestoneDetailTab, string> = {
  collaboration: "Collaboration",
  evidence: "Evidence",
  materials: "Materials",
  overview: "Overview",
  people: "People",
  review: "Review",
};

export const COLLECTION_FOR_TAB: Partial<
  Record<BuildSubmilestoneDetailTab, WorkspaceCollection>
> = {
  collaboration: "collaboration_comments",
  evidence: "evidence_assets",
  materials: "materials",
  people: "people_assignments",
  review: "evidence_assets",
};

export const ACTIVE_REVIEW_STATES = new Set([
  "changes_requested",
  "in_review",
  "reopened",
]);

export const LENDER_REVIEW_ROLES = new Set<BuildCollaborationRole>([
  "admin",
  "broker",
  "broker-staff",
  "principle-broker",
]);

export interface SubmilestoneDetailSheetProps {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  canGoBack?: boolean;
  canGoForward?: boolean;
  companionActionItemId?: Id<"buildActionItems">;
  costDocuments?: CostDocumentSummary[];
  finalFocus?: SheetFocusTarget;
  initialFocus?: SheetFocusTarget;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenChange: (open: boolean) => void;
  onOpenCostDocument?: (costDocumentId: string) => void;
  onOpenTarget?: (
    target: BuildDetailTarget,
    context?: { selectedTab?: string }
  ) => void;
  onReferenceOpen?: (reference: {
    entityId: string;
    entityKind: string;
    href: string;
  }) => void;
  onRetry?: () => void;
  onSelectedTabChange?: (tab: BuildSubmilestoneDetailTab) => void;
  open: boolean;
  organizationId: string;
  readOnly?: boolean;
  selectedTab?: BuildSubmilestoneDetailTab;
  viewerCapacity?: BuildCollaborationRole;
}

export interface NavigationProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onClose: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
}

export function isVisibleWorkspaceCollection(
  collection: WorkspaceCollectionResult | undefined
): collection is VisibleWorkspaceCollection {
  return Boolean(collection && "page" in collection);
}

export function mergeCollectionRows(
  accumulated: WorkspaceCollectionRow[],
  page: WorkspaceCollectionRow[]
) {
  const rowsById = new Map(accumulated.map((row) => [row.id, row] as const));
  for (const row of page) {
    rowsById.set(row.id, row);
  }
  return [...rowsById.values()];
}

export function isVisibleWorkspaceBootstrap(
  value: WorkspaceBootstrap | undefined
): value is VisibleWorkspaceBootstrap {
  return Boolean(value && "submilestone" in value);
}

export function defaultTabForWorkspace(
  value: WorkspaceBootstrap | undefined,
  viewerCapacity: BuildCollaborationRole | undefined
): BuildSubmilestoneDetailTab {
  if (!isVisibleWorkspaceBootstrap(value)) {
    return "overview";
  }
  const role = viewerCapacity ?? value.persona;
  const activeReview =
    value.review.reviewRound > 0 &&
    (ACTIVE_REVIEW_STATES.has(value.review.reviewDecisionState) ||
      ACTIVE_REVIEW_STATES.has(value.review.evidenceReviewState));
  return LENDER_REVIEW_ROLES.has(role) && activeReview ? "review" : "overview";
}

export function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Unknown";
}

export function statusBadgeVariant(
  value: string
): ComponentProps<typeof Badge>["variant"] {
  const normalized = value.toLowerCase();
  if (normalized === "complete" || normalized === "approved") {
    return "success";
  }
  if (
    normalized === "blocked" ||
    normalized === "changes_requested" ||
    normalized === "reopened"
  ) {
    return "warning";
  }
  return "outline";
}

export function scheduleLabel(bootstrap: VisibleWorkspaceBootstrap) {
  const { durationDays, parentDayEnd, parentDayStart, startDay } =
    bootstrap.schedule;
  const childWindow =
    startDay === undefined
      ? "Start not set"
      : `Day ${startDay}${durationDays === undefined ? "" : ` · ${durationDays} day${durationDays === 1 ? "" : "s"}`}`;
  return `${childWindow} · Parent ${parentDayStart}–${parentDayEnd}`;
}

export function formatCents(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}
