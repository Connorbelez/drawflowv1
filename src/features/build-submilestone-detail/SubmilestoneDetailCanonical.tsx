"use client";

import type { CanonicalTabPanelProps } from "./submilestone-detail-canonical-contracts.ts";
import { CanonicalEvidencePanel } from "./submilestone-detail-canonical-evidence.tsx";
import { CanonicalMaterialsPanel } from "./submilestone-detail-canonical-materials.tsx";
import { CanonicalOverviewPanel } from "./submilestone-detail-canonical-overview.tsx";
import { CanonicalPeoplePanel } from "./submilestone-detail-canonical-people.tsx";

export function CanonicalSubmilestoneTabPanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  requirementsCollection,
  historyCollection,
  companionActionItemId,
  onDirtyChange,
  onRetry,
  organizationId,
  readOnly,
  tab,
  viewerCapacity,
}: CanonicalTabPanelProps) {
  if (tab === "overview") {
    return (
      <CanonicalOverviewPanel
        bootstrap={bootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        companionActionItemId={companionActionItemId}
        onDirtyChange={onDirtyChange}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        viewerCapacity={viewerCapacity}
      />
    );
  }
  if (tab === "evidence") {
    return (
      <CanonicalEvidencePanel
        bootstrap={bootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        collection={collection}
        companionActionItemId={companionActionItemId}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        requirementsCollection={requirementsCollection}
        viewerCapacity={viewerCapacity}
      />
    );
  }
  if (tab === "people") {
    return (
      <CanonicalPeoplePanel
        bootstrap={bootstrap}
        buildId={buildId}
        buildSubmilestoneId={buildSubmilestoneId}
        collection={collection}
        companionActionItemId={companionActionItemId}
        historyCollection={historyCollection}
        onRetry={onRetry}
        organizationId={organizationId}
        readOnly={readOnly}
        viewerCapacity={viewerCapacity}
      />
    );
  }
  return (
    <CanonicalMaterialsPanel
      bootstrap={bootstrap}
      buildId={buildId}
      buildSubmilestoneId={buildSubmilestoneId}
      collection={collection}
      companionActionItemId={companionActionItemId}
      onRetry={onRetry}
      organizationId={organizationId}
      readOnly={readOnly}
      viewerCapacity={viewerCapacity}
    />
  );
}

export {
  createCanonicalCommandKey,
  canonicalCommandErrorMessage,
  isCanonicalReviewStaleConflict,
  isCanonicalStaleConflict,
  isCanonicalSubmilestoneSuperseded,
} from "./submilestone-detail-canonical-contracts.ts";
export type {
  CanonicalDirtySection,
  CanonicalTabPanelProps,
  CanonicalWorkspaceBootstrap,
  CanonicalWorkspaceCollection,
  NavigationProps,
  PreparedEvidenceUpload,
  RetryAction,
} from "./submilestone-detail-canonical-contracts.ts";
export {
  EvidenceAssetCard,
  evidenceAssetIdentity,
  isCanonicalEvidenceAsset,
} from "./submilestone-detail-canonical-evidence.tsx";
