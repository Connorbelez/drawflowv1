import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { ProvisionBuilderWizard } from "#/features/builder-onboarding/ProvisionBuilderWizard.tsx";
import { requireUserManagementWriteAccess } from "#/lib/auth/rbac.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface OnboardBuilderSearch {
  proposalId?: string;
}

export function validateOnboardBuilderSearch(
  search: Record<string, unknown>
): OnboardBuilderSearch {
  return typeof search.proposalId === "string" && search.proposalId.trim()
    ? { proposalId: search.proposalId }
    : {};
}

export const Route = createFileRoute("/backoffice/onboard-builder")({
  beforeLoad: ({ context, location }) =>
    requireUserManagementWriteAccess({
      isAuthenticated: Boolean(context.userId),
      organizationId: context.organizationId,
      pathname: location.pathname,
      roles: [context.role, ...(context.roles ?? [])],
      workspace: "backoffice",
    }),
  ssr: false,
  staticData: {
    breadcrumb: {
      label: "Onboard builder",
      to: "/backoffice/onboard-builder",
    },
  },
  validateSearch: validateOnboardBuilderSearch,
  component: OnboardBuilderRoute,
});

function OnboardBuilderRoute() {
  const { proposalId } = Route.useSearch();
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const assignProposalBuilder = useMutation(
    api.production_proposals.assignProposalBuilder
  );
  const workosOrganizationId = context.organizationId as string;
  const proposalDetail = useQuery(
    api.production_proposals.getProposalDetailByString,
    proposalId ? { proposalId, workosOrganizationId } : "skip"
  );

  if (proposalId && proposalDetail === undefined) {
    return <ProposalOnboardingGate loading />;
  }
  if (
    proposalId &&
    (!proposalDetail ||
      proposalDetail.proposal.builderProfileId ||
      (proposalDetail.proposal.status !== "draft" &&
        proposalDetail.proposal.status !== "submitted" &&
        proposalDetail.proposal.status !== "approved"))
  ) {
    return (
      <ProposalOnboardingGate
        onReturn={() => navigate({ search: {}, to: "/backoffice/proposals" })}
      />
    );
  }

  return (
    <ProvisionBuilderWizard
      attachmentName={proposalDetail?.proposal.buildName}
      attachToProposal={Boolean(proposalId)}
      onProvisioned={
        proposalId
          ? (result) =>
              assignProposalBuilder({
                builderProfileId:
                  result.builderProfileId as Id<"builderProfiles">,
                proposalId: proposalId as Id<"buildProposals">,
                workosOrganizationId,
              })
          : undefined
      }
      onReturnToProposal={
        proposalId
          ? () =>
              navigate({
                params: { planId: proposalId },
                search: { tab: "review" },
                to: "/backoffice/proposals/$planId",
              })
          : undefined
      }
    />
  );
}

function ProposalOnboardingGate({
  loading = false,
  onReturn,
}: {
  loading?: boolean;
  onReturn?: () => Promise<void> | void;
}) {
  return (
    <main className="min-h-svh bg-muted/30 px-4 py-6 sm:px-6 lg:px-8">
      <Frame className="mx-auto w-full max-w-3xl">
        <FramePanel className="grid gap-4 p-5">
          {loading ? (
            <>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full max-w-lg" />
              <Skeleton className="h-8 w-32" />
            </>
          ) : (
            <>
              <div className="grid gap-1">
                <FrameTitle>Builder attachment unavailable</FrameTitle>
                <FrameDescription>
                  This Build Proposal does not exist, is outside the active
                  brokerage, already has a builder, or has already closed.
                </FrameDescription>
              </div>
              {onReturn ? (
                <div>
                  <Button onClick={onReturn} variant="outline">
                    Return to proposals
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </FramePanel>
      </Frame>
    </main>
  );
}
