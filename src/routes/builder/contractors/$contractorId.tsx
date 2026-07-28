import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { ContractorDetailSurface } from "#/features/contractors/ContractorDetailSurface.tsx";
import {
  getVisualContractorDetail,
  isProductionVisualParityFixtureEnabled,
} from "#/features/contractors/contractorVisualFixtures.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/builder/contractors/$contractorId")({
  staticData: {
    breadcrumb: {
      label: "Contractor detail",
      to: "/builder",
    },
  },
  component: BuilderContractorRoute,
});

function BuilderContractorRoute() {
  const { contractorId } = Route.useParams();
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const visualFixture = isProductionVisualParityFixtureEnabled();
  const contractorApi = (api as any).production_proposals;
  const liveDetail = useQuery(
    contractorApi.getContractorDetail,
    visualFixture
      ? "skip"
      : {
          contractorId: contractorId as Id<"contractorProfiles">,
          workosOrganizationId,
        }
  );
  const detail = visualFixture
    ? getVisualContractorDetail(contractorId)
    : liveDetail;

  // Builder-side optional invite action (PRD §11.3, user story 47). The backend
  // enforces that builders can only invite contractors attached to their own
  // proposals/builds.
  const sendInvite = useMutation(
    (api as any).contractorOnboarding.sendContractorProfileInvite
  );
  const [pendingInvite, setPendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  if (detail === undefined) {
    return (
      <main className="min-h-svh bg-muted/30 p-4 sm:p-6">
        <Frame>
          <FramePanel className="p-5 text-sm">Loading contractor...</FramePanel>
        </Frame>
      </main>
    );
  }

  const onInvite = async () => {
    setPendingInvite(true);
    setInviteError(null);
    try {
      await sendInvite({
        contractorId: contractorId as Id<"contractorProfiles">,
        workosOrganizationId,
      });
      setInviteSent(true);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingInvite(false);
    }
  };

  return (
    <>
      <ContractorDetailSurface
        backHref="/builder"
        backLabel="Builder workspace"
        buildHrefForWorkHistory={(row) => `/builder/builds/${row.buildId}`}
        detail={detail}
        emptyWorkHistory="No assigned build or milestone work is visible for this contractor."
      />
      {!visualFixture && (
        <main className="bg-muted/30 px-4 pb-10 sm:px-6">
          <div className="mx-auto w-full max-w-6xl">
            <Frame>
              <FramePanel className="flex flex-col gap-3 p-4 sm:p-5">
                <div>
                  <h2 className="font-semibold text-sm">Invite contractor</h2>
                  <p className="text-muted-foreground text-xs">
                    Send a WorkOS invitation so this contractor can claim their
                    profile and access the workspace. Only contractors attached
                    to your proposals/builds can be invited.
                  </p>
                </div>
                {inviteError ? (
                  <p className="text-destructive text-xs">{inviteError}</p>
                ) : null}
                {inviteSent ? (
                  <p className="text-emerald-600 text-xs">
                    Invitation sent. The contractor will appear in onboarding
                    review.
                  </p>
                ) : null}
                <div>
                  <Button
                    disabled={pendingInvite || inviteSent}
                    onClick={onInvite}
                    size="sm"
                    type="button"
                  >
                    {pendingInvite ? "Sending…" : "Send invite"}
                  </Button>
                </div>
              </FramePanel>
            </Frame>
          </div>
        </main>
      )}
    </>
  );
}
