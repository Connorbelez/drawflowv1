import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  BuildPermitViewerDrawer,
  firstPermitDocument,
} from "#/features/build-permit-viewer/BuildPermitViewerDrawer.tsx";
import { ProductionTimelineWorkspace } from "#/features/production-proposals/ProductionTimelineWorkspace.tsx";
import {
  getVisualParityProposalDetail,
  getVisualParityTimelineWorkspace,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/builder/proposals/$proposalId/roadmap")({
  ssr: false,
  component: BuilderProductionProposalRoadmapCompatibilityRoute,
});

function BuilderProductionProposalRoadmapCompatibilityRoute() {
  const { proposalId } = Route.useParams();
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const typedProposalId = proposalId as Id<"buildProposals">;
  const joinSession = useMutation(api.proposal_collaboration.joinSession);
  const collabToken = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("collab"),
    []
  );
  const [collabJoinState, setCollabJoinState] = useState<
    "idle" | "joined" | "joining"
  >(collabToken ? "joining" : "joined");

  useEffect(() => {
    if (!(collabToken && collabJoinState === "joining")) {
      return;
    }
    void joinSession({ shareToken: collabToken, workosOrganizationId })
      .then(() => {
        setCollabJoinState("joined");
        toast.success("Joined live collaboration.");
      })
      .catch((error) => {
        setCollabJoinState("idle");
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to join live collaboration."
        );
      });
  }, [collabJoinState, collabToken, joinSession, workosOrganizationId]);

  const workspaceQuery = useQuery(
    api.production_proposals.getProductionTimelineWorkspace,
    visualFixtureEnabled || collabJoinState === "joining"
      ? "skip"
      : {
          proposalId: typedProposalId,
          workosOrganizationId,
        }
  );
  const workspace = visualFixtureEnabled
    ? getVisualParityTimelineWorkspace(proposalId)
    : workspaceQuery;
  const detailQuery = useQuery(
    api.production_proposals.getProposalDetailByString,
    visualFixtureEnabled || collabJoinState === "joining"
      ? "skip"
      : {
          proposalId,
          workosOrganizationId,
        }
  );
  const detail = visualFixtureEnabled
    ? getVisualParityProposalDetail(proposalId)
    : detailQuery;

  if (!workspace || detail === undefined || collabJoinState === "joining") {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {collabJoinState === "joining"
            ? "Joining live collaboration..."
            : "Loading production timeline..."}
        </div>
      </div>
    );
  }

  return (
    <ProductionTimelineWorkspace
      appPermissions={detail?.appPermissions}
      backofficeHref={`/backoffice/proposals/${proposalId}`}
      headerActions={
        <BuildPermitViewerDrawer
          permit={firstPermitDocument(detail?.documents)}
          size="sm"
        />
      }
      initialRole="builder"
      persistenceMode={visualFixtureEnabled ? "noop" : "convex"}
      prejoinedCollabToken={collabJoinState === "joined" ? collabToken : null}
      proposalHref={`/builder/proposals/${proposalId}`}
      proposalId={typedProposalId}
      workosOrganizationId={workosOrganizationId}
      workspace={workspace}
    />
  );
}
