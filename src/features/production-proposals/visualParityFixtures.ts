import { createVisualParityCostItem as createVisualParityCostItemImpl } from "./-visual-parity-cost-fixtures.ts";
import { getVisualParityActiveBuildDetail as getVisualParityActiveBuildDetailImpl } from "./-visual-parity-build-fixtures.ts";
import {
  getVisualParityCreateContext as getVisualParityCreateContextImpl,
  getVisualParityKanban as getVisualParityKanbanImpl,
  getVisualParityProposalDetail as getVisualParityProposalDetailImpl,
} from "./-visual-parity-proposal-fixtures.ts";
import {
  getVisualParityActiveBuildTimelineWorkspace as getVisualParityActiveBuildTimelineWorkspaceImpl,
  getVisualParityTimelineWorkspace as getVisualParityTimelineWorkspaceImpl,
} from "./-visual-parity-timeline-fixtures.ts";
import { getVisualParitySettings as getVisualParitySettingsImpl } from "./-visual-parity-template-fixtures.ts";
import {
  VISUAL_PARITY_ACTIVE_BUILD_ID as VISUAL_PARITY_ACTIVE_BUILD_ID_VALUE,
  VISUAL_PARITY_APPROVED_PROPOSAL_ID as VISUAL_PARITY_APPROVED_PROPOSAL_ID_VALUE,
  VISUAL_PARITY_CLOSED_PROPOSAL_ID as VISUAL_PARITY_CLOSED_PROPOSAL_ID_VALUE,
  VISUAL_PARITY_ORGANIZATION_ID as VISUAL_PARITY_ORGANIZATION_ID_VALUE,
  VISUAL_PARITY_PROPOSAL_ID as VISUAL_PARITY_PROPOSAL_ID_VALUE,
  VISUAL_PARITY_SUBMITTED_PROPOSAL_ID as VISUAL_PARITY_SUBMITTED_PROPOSAL_ID_VALUE,
  isProductionVisualParityFixtureEnabled as isProductionVisualParityFixtureEnabledValue,
} from "./visualParityConstants.ts";

export const VISUAL_PARITY_ACTIVE_BUILD_ID =
  VISUAL_PARITY_ACTIVE_BUILD_ID_VALUE;
export const VISUAL_PARITY_APPROVED_PROPOSAL_ID =
  VISUAL_PARITY_APPROVED_PROPOSAL_ID_VALUE;
export const VISUAL_PARITY_CLOSED_PROPOSAL_ID =
  VISUAL_PARITY_CLOSED_PROPOSAL_ID_VALUE;
export const VISUAL_PARITY_ORGANIZATION_ID =
  VISUAL_PARITY_ORGANIZATION_ID_VALUE;
export const VISUAL_PARITY_PROPOSAL_ID = VISUAL_PARITY_PROPOSAL_ID_VALUE;
export const VISUAL_PARITY_SUBMITTED_PROPOSAL_ID =
  VISUAL_PARITY_SUBMITTED_PROPOSAL_ID_VALUE;
export function isProductionVisualParityFixtureEnabled(): boolean {
  return isProductionVisualParityFixtureEnabledValue();
}

export function getVisualParityCreateContext(): ReturnType<
  typeof getVisualParityCreateContextImpl
> {
  return getVisualParityCreateContextImpl();
}

export function getVisualParityKanban(): ReturnType<
  typeof getVisualParityKanbanImpl
> {
  return getVisualParityKanbanImpl();
}

export function getVisualParityProposalDetail(
  proposalId?: string
): ReturnType<typeof getVisualParityProposalDetailImpl> {
  return getVisualParityProposalDetailImpl(proposalId);
}

export function getVisualParityActiveBuildDetail(
  buildId?: string
): ReturnType<typeof getVisualParityActiveBuildDetailImpl> {
  return getVisualParityActiveBuildDetailImpl(buildId);
}

export function createVisualParityCostItem(
  payload: Parameters<typeof createVisualParityCostItemImpl>[0],
  suffix?: Parameters<typeof createVisualParityCostItemImpl>[1]
): ReturnType<typeof createVisualParityCostItemImpl> {
  return createVisualParityCostItemImpl(payload, suffix);
}

export function getVisualParityTimelineWorkspace(
  proposalId?: string
): ReturnType<typeof getVisualParityTimelineWorkspaceImpl> {
  return getVisualParityTimelineWorkspaceImpl(proposalId);
}

export function getVisualParityActiveBuildTimelineWorkspace(
  buildId?: string
): ReturnType<typeof getVisualParityActiveBuildTimelineWorkspaceImpl> {
  return getVisualParityActiveBuildTimelineWorkspaceImpl(buildId);
}

export function getVisualParitySettings(): ReturnType<
  typeof getVisualParitySettingsImpl
> {
  return getVisualParitySettingsImpl();
}
