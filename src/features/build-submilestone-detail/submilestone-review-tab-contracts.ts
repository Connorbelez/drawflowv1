import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { CostDocumentSummary } from "../cost-documents/CostDocumentRoadmapReconciliation.tsx";
import type { CanonicalWorkspaceCollection } from "./SubmilestoneDetailCanonical.tsx";

export type CanonicalReview = FunctionReturnType<
  typeof api.build_submilestone_review.getActiveBuildSubmilestoneReview
>;

export type ReviewCommand =
  | "approve"
  | "recommend"
  | "request_changes"
  | "retract"
  | "site_visit"
  | "waive";

export interface ReviewCapability {
  allowed: boolean;
  reason?: string;
}

export interface ReviewTabBootstrap {
  build: {
    buildName: string;
    location: string;
    startDate: string;
  };
  capabilities: {
    canonical: {
      approveChild: ReviewCapability;
      retractChildApproval: ReviewCapability;
      waiveSiteVisit: ReviewCapability;
    };
    review: {
      recommend: ReviewCapability;
      requestChanges: ReviewCapability;
    };
    siteVisit: {
      cancel: ReviewCapability;
      order: ReviewCapability;
    };
  };
  evidence: {
    evidencePackageRevision?: number;
    evidencePackageStatus?: string;
    itemCount: number;
    requirementCount: number;
  };
  milestone: {
    buildMilestoneId: Id<"buildMilestones">;
    drawAvailabilityCents: number;
    key: string;
    name: string;
  };
  overview: {
    actualCompletedAt?: number;
    actualCostCents?: number;
    actualStartedAt?: number;
    budgetCents?: number;
    plannedDurationDays?: number;
    plannedStartDay?: number;
  };
  submilestone: {
    buildSubmilestoneId: Id<"buildSubmilestones">;
    key: string;
    name: string;
    proposalSubmilestoneId: Id<"proposalSubmilestones">;
  };
}

export interface SubmilestoneReviewTabProps {
  bootstrap: ReviewTabBootstrap;
  buildId: Id<"activeBuilds">;
  collection?: CanonicalWorkspaceCollection;
  costDocuments?: CostDocumentSummary[];
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenCostDocument?: (costDocumentId: string) => void;
  onOpenScopeAndGuidance?: () => void;
  onOpenTarget?: (
    target: BuildDetailTarget,
    context?: { selectedTab?: string }
  ) => void;
  onRetry?: () => void;
  organizationId: string;
  readOnly: boolean;
}
