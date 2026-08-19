"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link2 } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { BuildCollaborationRole } from "../../../convex/build_collaboration_model";
import type { VisibleBuildActionItemDetail } from "../build-collaboration/BuildActionItemDetailSheet.tsx";
import type { BuildDetailTarget } from "../build-detail-targets/buildDetailTarget.ts";
import type { BuildDetailTargetContext } from "../build-detail-targets/useBuildDetailTargetController.ts";
import { SubmilestoneDiscussionThread } from "../build-submilestone-detail/SubmilestoneCollaborationPanel.tsx";
import type { MilestoneSheetSubmilestone } from "./MilestoneDetailSheet.tsx";

type WorkspaceBootstrap = FunctionReturnType<
  typeof api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap
>;

export interface MilestoneCollaborationAggregateProps {
  buildId: Id<"activeBuilds">;
  onOpenCanonicalTarget?: (
    target: BuildDetailTarget,
    context?: BuildDetailTargetContext
  ) => void;
  organizationId: string;
  readOnly: boolean;
  rows: MilestoneSheetSubmilestone[];
  viewerCapacity?: BuildCollaborationRole;
}

/**
 * Read projection of the existing canonical Sub-milestone comment threads.
 * The child companion remains the only collaboration record and command owner.
 */
export function MilestoneCollaborationAggregate({
  buildId,
  onOpenCanonicalTarget,
  organizationId,
  readOnly,
  rows,
  viewerCapacity,
}: MilestoneCollaborationAggregateProps) {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Collaboration</h2>
            <p className="text-muted-foreground text-sm">
              Canonical comment threads aggregated across every Sub-milestone.
            </p>
          </div>
          <Badge variant="outline">{rows.length} Sub-milestones</Badge>
        </div>
        <div className="space-y-5">
          {rows.map((row, index) => (
            <section className="space-y-3" key={row.key}>
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm">{row.name}</h3>
                  <p className="text-muted-foreground text-xs">
                    Canonical Sub-milestone comment thread
                  </p>
                </div>
                <Button
                  className="h-auto p-0"
                  disabled={!(row.submilestoneId && onOpenCanonicalTarget)}
                  onClick={() =>
                    row.submilestoneId &&
                    onOpenCanonicalTarget?.(
                      {
                        kind: "submilestone",
                        submilestoneId: row.submilestoneId,
                      },
                      { selectedTab: "collaboration" }
                    )
                  }
                  size="sm"
                  type="button"
                  variant="link"
                >
                  <Link2 aria-hidden="true" /> Open full collaboration
                </Button>
              </div>
              {row.submilestoneId ? (
                <CanonicalThread
                  buildId={buildId}
                  buildSubmilestoneId={row.submilestoneId}
                  organizationId={organizationId}
                  readOnly={readOnly}
                  viewerCapacity={viewerCapacity}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Canonical Sub-milestone reference unavailable.
                </p>
              )}
            </section>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}

function CanonicalThread({
  buildId,
  buildSubmilestoneId,
  organizationId,
  readOnly,
  viewerCapacity,
}: {
  buildId: Id<"activeBuilds">;
  buildSubmilestoneId: Id<"buildSubmilestones">;
  organizationId: string;
  readOnly: boolean;
  viewerCapacity?: BuildCollaborationRole;
}) {
  const bootstrap = useQuery(
    api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap,
    {
      buildId,
      buildSubmilestoneId,
      organizationId,
      viewerCapacity,
    }
  ) as WorkspaceBootstrap | undefined;
  const companionActionItemId =
    bootstrap && "submilestone" in bootstrap
      ? bootstrap.companion?.actionItemId
      : undefined;
  const detail = useQuery(
    api.build_action_item_details.getBuildActionItemDetail,
    companionActionItemId
      ? { actionItemId: companionActionItemId, buildId, organizationId }
      : "skip"
  );

  if (
    bootstrap === undefined ||
    (companionActionItemId && detail === undefined)
  ) {
    return (
      <p aria-live="polite" className="text-muted-foreground text-sm">
        Loading discussion…
      </p>
    );
  }
  if (!(detail && detail.state === "visible")) {
    return (
      <p className="text-muted-foreground text-sm">
        No canonical discussion is available for this Sub-milestone.
      </p>
    );
  }

  return (
    <SubmilestoneDiscussionThread
      buildId={buildId}
      comments={(detail as VisibleBuildActionItemDetail).comments}
      onReact={async () => undefined}
      onReferenceOpen={() => undefined}
      onReply={() => undefined}
      organizationId={organizationId}
      readOnly={readOnly}
      tagOptions={[]}
    />
  );
}
