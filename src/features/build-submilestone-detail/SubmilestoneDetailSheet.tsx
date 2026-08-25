"use client";

import type { SubmilestoneDetailSheetProps } from "./submilestone-detail-sheet-contracts.ts";
import { SubmilestoneDetailSheet as SubmilestoneDetailSheetImpl } from "./submilestone-detail-sheet-main.tsx";

export type { SubmilestoneDetailSheetProps } from "./submilestone-detail-sheet-contracts.ts";

export function SubmilestoneDetailSheet(props: SubmilestoneDetailSheetProps) {
  return <SubmilestoneDetailSheetImpl {...props} />;
}
