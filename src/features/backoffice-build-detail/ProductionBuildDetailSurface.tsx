"use client";

import type { ComponentProps } from "react";

import { ProductionBuildDetailSurfaceContent } from "./production-build-detail-surface-content.tsx";

export type {
  ProductionBuildDetail,
  ProductionBuildDetailActions,
  ProductionBuildProjection,
  ProductionDraw,
  ProductionDrawId,
  ProductionDrawStatus,
  ProductionMilestone,
  ProductionMilestoneStatus,
  ProductionSubmilestone,
} from "./production-build-detail-contracts.ts";

export { contractorsCardActions } from "./production-build-detail-support.tsx";
export { ProductionDrawsTable } from "./production-build-detail-draws.tsx";
export { toProductionMilestoneSheetData } from "./production-build-detail-projection.ts";

export type ProductionBuildDetailSurfaceProps = ComponentProps<
  typeof ProductionBuildDetailSurfaceContent
>;

export function ProductionBuildDetailSurface(
  props: ProductionBuildDetailSurfaceProps
) {
  return <ProductionBuildDetailSurfaceContent {...props} />;
}
