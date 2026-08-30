import type { ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  BrokerageSiteVisitsResult,
} from "../backoffice-site-visits/site-visit-types.ts";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import type { ScheduleHealthResult } from "./scheduleHealth";

export type WorkState = "planned" | "in_progress" | "complete";
export type MilestoneDisplayState = WorkState | "needs_revision";
export type SubmilestoneReviewState = "approved" | "pending_review" | "rejected";

export interface SubmilestoneReviewSummary {
  backOfficeApproved: boolean;
  backOfficeRequired: boolean;
  lenderApprovals: number;
  lenderQuorumRequired: boolean;
  lenderQuorumSize: number;
  state: SubmilestoneReviewState;
}

export interface MilestoneSheetSubmilestone {
  actualCostCents?: number;
  actualStartedAt?: number;
  assignments: Array<{
    actualCostCents?: number;
    actualHours?: number;
    agreedRateCents?: number;
    agreedRateUnit?: "day" | "fixed" | "hour";
    contractorId: string;
    costNotes?: string;
    estimatedCostCents?: number;
    estimatedHours?: number;
    name: string;
    role: string;
    status: string;
  }>;
  budgetCents: number;
  completedAt?: number;
  completedByWorkosUserId?: string;
  costDocuments?: Array<{
    _id: string;
    allocationAmountCents: number;
    kind: "invoice" | "receipt";
    pages: Array<{
      assetId: string;
      downloadUrl?: string;
      fileName: string;
      mimeType: string;
    }>;
    subtotalCents?: number;
    taxCents?: number;
    title: string;
  }>;
  description: string;
  endDate: string;
  evidence: Array<{
    createdAt?: number;
    evidenceKey: string;
    fileName: string;
    label: string;
    locationVerified: boolean;
    mimeType: string;
    previewUrl?: string | null;
    sizeBytes: number;
    source?: string;
    tag: string;
  }>;
  fieldNote?: string;
  key: string;
  materials: Array<{
    description?: string;
    id: string;
    quantity: number;
    supplier?: string;
    title: string;
    totalCents: number;
    type: "equipment" | "material";
  }>;
  name: string;
  order: number;
  review?: SubmilestoneReviewSummary;
  scheduleHealth?: ScheduleHealthResult;
  siteVisits: Array<{
    completedAt?: string;
    note?: string;
    recordNote?: string;
    recordNoteFormat?: "html" | "plain_text";
    requestedAt: string;
    status: string;
    visitId: string;
  }>;
  startDate: string;
  status: WorkState;
  submilestoneId?: Id<"buildSubmilestones">;
  workflowRevision?: number;
}

export interface MilestoneSheetData {
  actualStartedAt?: number;
  canStartWork?: boolean;
  column: string;
  contractors: { name: string; initials: string; role?: string }[];
  currentDay?: number;
  drawGroupKey?: string;
  milestoneKey: string;
  name: string;
  plannedBudgetCents?: number;
  plannedEndDate?: string;
  plannedStartDate?: string;
  recentEvents: {
    _id: string;
    title: string;
    actor: string;
    createdAt: number;
  }[];
  requestedAmountCents?: number;
  reviewRequest?: {
    note: string;
    requestedAt?: number;
  };
  status?: MilestoneDisplayState;
  submilestones?: MilestoneSheetSubmilestone[];
  submittedAt?: number;
}

export interface MilestoneCostDocumentPage {
  assetId: string;
  downloadUrl?: string;
  fileName: string;
  mimeType: string;
}

/**
 * Parent Milestone aggregate/detail surface.
 *
 * Child scope is intentionally represented as read-only ledger rows. Every
 * child interaction dispatches to the route-owned canonical
 * SubmilestoneDetailSheet; this component has no child mutation adapter or
 * nested detail/guided view.
 */
export interface MilestoneDetailSheetProps {
  assignmentsSourceLabel?: string;
  /** Canonical comment threads aggregated by the route from existing child companions. */
  collaboration?: ReactNode;
  data: MilestoneSheetData | null;
  errorMessage?: string;
  eventsSourceLabel?: string;
  focusedSubmilestoneId?: string;
  focusedSubmilestoneKey?: string;
  /** Route-owned footer for a governed workflow extension such as Builder resubmission. */
  footer?: ReactNode;
  onAmendStart?: (
    action: "correct" | "retract",
    milestoneKey: string,
    submilestoneKey?: string
  ) => void;
  onApprove?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onAssignVisit?: (milestoneKey: string) => void;
  onClose: () => void;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  onOpenCostDocument?: (costDocumentId: string) => void;
  onOpenCostDocumentPage?: (page: MilestoneCostDocumentPage) => void;
  onReject?: (milestoneKey: string) => void;
  onRequestInfo?: (milestoneKey: string, note: string) => void;
  onStartWork?: (milestoneKey: string, note?: string) => Promise<void> | void;
  onSubmitCompletion?: (input: {
    actualCostCents?: number;
    actualStartedAt?: number;
    completedDay: number;
    dependencyOverrideReason?: string;
    idempotencyKey: string;
    milestoneKey: string;
    note?: string;
  }) => Promise<unknown> | unknown;
  pending?: boolean;
  /** Hides every workflow mutation and decision control for projection-only consumers. */
  readOnly?: boolean;
  /** Canonical route adapter for capability-aware child decision menu items. */
  renderSubmilestoneReviewItems?: (
    row: MilestoneSheetSubmilestone
  ) => ReactNode;
  /** Optional route-specific review facts composed into the shared Overview. */
  reviewLayer?: ReactNode;
  /** Hides the expiring field-token URL for read-only consumers such as lenders. */
  showSiteVisitFieldLink?: boolean;
  siteVisits?: BrokerageSiteVisitsResult;
  /** Governed reviewer entrypoints. Omit for Builder and read-only routes. */
  submilestoneReviewActions?: {
    onApprove?: (submilestoneKey: string) => void;
    onReject?: (submilestoneKey: string) => void;
  };
}
