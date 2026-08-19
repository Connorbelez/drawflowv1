"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CheckCircle2, CircleX } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "#/components/ui/dropdown-menu.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import type { MilestoneSheetSubmilestone } from "./MilestoneDetailSheet.tsx";

type WorkspaceBootstrap = FunctionReturnType<
  typeof api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap
>;

/**
 * Adapts the canonical child-review capability contract into the shared menu.
 * The actual decision form and command remain owned by SubmilestoneDetailSheet.
 */
export function MilestoneReviewMenuItems({
  buildId,
  onOpenReview,
  organizationId,
  readOnly,
  row,
  viewerCapacity,
}: {
  buildId: Id<"activeBuilds">;
  onOpenReview: (submilestoneKey: string) => void;
  organizationId: string;
  readOnly: boolean;
  row: MilestoneSheetSubmilestone;
  viewerCapacity?: BuildCollaborationRole;
}) {
  const bootstrap = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap,
    row.submilestoneId
      ? {
          buildId,
          buildSubmilestoneId: row.submilestoneId,
          organizationId,
          viewerCapacity,
        }
      : "skip"
  ) as WorkspaceBootstrap | undefined;

  if (
    readOnly ||
    !(bootstrap && "submilestone" in bootstrap) ||
    !(
      bootstrap.capabilities.canonical.approveChild.allowed ||
      bootstrap.capabilities.review.requestChanges.allowed
    )
  ) {
    return null;
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Reviewer actions</DropdownMenuLabel>
      {bootstrap.capabilities.canonical.approveChild.allowed ? (
        <DropdownMenuItem onClick={() => onOpenReview(row.key)}>
          <CheckCircle2 aria-hidden="true" />
          Approve Sub-milestone
        </DropdownMenuItem>
      ) : null}
      {bootstrap.capabilities.review.requestChanges.allowed ? (
        <DropdownMenuItem
          onClick={() => onOpenReview(row.key)}
          variant="destructive"
        >
          <CircleX aria-hidden="true" />
          <span>
            Reject Sub-milestone
            <span className="block text-muted-foreground text-xs">
              Return for correction and reset approvals
            </span>
          </span>
        </DropdownMenuItem>
      ) : null}
    </>
  );
}
