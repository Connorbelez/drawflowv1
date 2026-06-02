import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { api } from "../../convex/_generated/api";

type ClaimPreview =
  | {
      brokerage: {
        displayName: string;
        legalName: string;
        workosOrganizationId: string;
      };
      claimStatus: "active" | "claimed" | "expired" | "revoked";
      drawCount: number;
      expiresAt: number | null;
      milestoneCount: number;
      proposal: {
        borrowerCoPayBps: number;
        borrowerWorkingCapitalLimitCents: number;
        buildName: string;
        lenderDrawPolicyLimitCents: number;
        location: string;
        status: string;
        totalBudgetCents: number;
      };
      workosOrganizationId: string;
    }
  | null
  | undefined;
type LoadedClaimPreview = NonNullable<ClaimPreview>;

export const Route = createFileRoute("/proposal-claim/$claimToken")({
  ssr: false,
  component: ProposalClaimRoute,
});

function ProposalClaimRoute() {
  const { claimToken } = Route.useParams();
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const preview = useQuery(api.production_proposals.getProposalClaimPreview, {
    claimToken,
  }) as ClaimPreview;
  const claimDraftProposalLink = useMutation(
    api.production_proposals.claimDraftProposalLink
  );
  const [claiming, setClaiming] = useState(false);
  const returnPathname = useMemo(
    () => `/proposal-claim/${encodeURIComponent(claimToken)}`,
    [claimToken]
  );
  const signUpHref = `/api/auth/sign-up?returnPathname=${encodeURIComponent(
    returnPathname
  )}`;
  const signInHref = `/api/auth/sign-in?returnPathname=${encodeURIComponent(
    returnPathname
  )}`;

  async function handleClaim() {
    if (!preview || preview.claimStatus !== "active") {
      return;
    }
    if (!context.userId) {
      window.location.href = signUpHref;
      return;
    }
    setClaiming(true);
    try {
      const result = await claimDraftProposalLink({
        claimToken,
        workosOrganizationId: preview.workosOrganizationId,
      });
      toast.success("Proposal claimed.");
      void navigate({
        params: { proposalId: result.proposalId },
        to: "/builder/proposals/$proposalId",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message.replace(/^\[.*?\]\s*/, "")
          : "Could not claim this proposal."
      );
    } finally {
      setClaiming(false);
    }
  }

  if (preview === undefined) {
    return (
      <ClaimShell>
        <FramePanel className="grid min-h-60 place-items-center">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading proposal claim...
          </div>
        </FramePanel>
      </ClaimShell>
    );
  }

  if (!preview) {
    return (
      <ClaimShell>
        <FramePanel>
          <Badge variant="outline">Claim link</Badge>
          <FrameTitle className="mt-3 text-xl">Claim link unavailable</FrameTitle>
          <FrameDescription className="mt-2">
            This proposal link is invalid or no longer points to an active draft.
          </FrameDescription>
          <div className="mt-5">
            <Button render={<a href="/" />}>Return home</Button>
          </div>
        </FramePanel>
      </ClaimShell>
    );
  }

  const unavailable = preview.claimStatus !== "active";

  return (
    <ClaimShell>
      <FramePanel className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant={unavailable ? "outline" : "success"}>
              {claimStatusLabel(preview.claimStatus)}
            </Badge>
            <FrameTitle className="mt-3 text-2xl">
              {preview.proposal.buildName}
            </FrameTitle>
            <FrameDescription className="mt-2">
              {preview.proposal.location} · {preview.brokerage.displayName}
            </FrameDescription>
          </div>
          <div className="grid size-12 place-items-center rounded-md border bg-muted">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
        </div>

        <div className="grid gap-3 border-y py-4 sm:grid-cols-4">
          <ClaimMetric
            label="Budget"
            value={formatClaimCents(preview.proposal.totalBudgetCents)}
          />
          <ClaimMetric
            label="Working capital"
            value={formatClaimCents(
              preview.proposal.borrowerWorkingCapitalLimitCents
            )}
          />
          <ClaimMetric
            label="Milestones"
            value={String(preview.milestoneCount)}
          />
          <ClaimMetric label="Draws" value={String(preview.drawCount)} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2 text-muted-foreground text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Claiming assigns this draft to your builder profile and places it
              in your builder proposal drafts.
            </span>
          </div>
          {context.userId ? (
            <Button
              disabled={unavailable}
              loading={claiming}
              onClick={handleClaim}
            >
              <CheckCircle2 aria-hidden />
              Claim proposal
            </Button>
          ) : (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button render={<a href={signUpHref} />}>
                Create account
                <ArrowRight aria-hidden />
              </Button>
              <Button render={<a href={signInHref} />} variant="outline">
                Sign in
              </Button>
            </div>
          )}
        </div>

        {preview.expiresAt ? (
          <p className="text-muted-foreground text-xs">
            Link expires {formatClaimDateTime(preview.expiresAt)}.
          </p>
        ) : null}
      </FramePanel>
    </ClaimShell>
  );
}

function ClaimShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-4">
      <Frame className="w-full max-w-3xl">{children}</Frame>
    </main>
  );
}

function ClaimMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <strong className="font-semibold text-lg">{value}</strong>
    </div>
  );
}

function claimStatusLabel(status: LoadedClaimPreview["claimStatus"]) {
  if (status === "active") {
    return "Ready to claim";
  }
  if (status === "claimed") {
    return "Already claimed";
  }
  if (status === "expired") {
    return "Expired";
  }
  return "Revoked";
}

function formatClaimCents(value: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value / 100);
}

function formatClaimDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
