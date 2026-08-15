import {
  createFileRoute,
  Link,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { LenderOrganizationMembersTable } from "#/features/lender-organizations/LenderOrganizationMembersTable.tsx";
import { LenderActiveBuildList } from "#/features/lender-portfolio/LenderActiveBuildList.tsx";
import { LenderAssignedProposalList } from "#/features/lender-portfolio/LenderAssignedProposalList.tsx";
import { useRouteBreadcrumbProjection } from "#/components/route-breadcrumbs.tsx";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type Portfolio = FunctionReturnType<
  typeof api.lender_portal.getBackofficeLenderOrganizationPortfolio
>;
type Members = FunctionReturnType<
  typeof api.lenderOrganizations.listLenderOrganizationMembersForAdmin
>;

export const Route = createFileRoute("/backoffice/lenders/$lenderId")({
  component: LenderOrganizationDetailRoute,
  errorComponent: LenderOrganizationDetailError,
  staticData: {
    breadcrumb: {
      label: ({ params }) =>
        params.lenderId ? "Loading organization…" : "Organization unavailable",
      params: ({ params }) =>
        params.lenderId ? { lenderId: params.lenderId } : undefined,
      to: "/backoffice/lenders/$lenderId",
    },
  },
});

function LenderOrganizationDetailError({
  reset,
}: ErrorComponentProps) {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/20 p-4 pb-20 md:p-8">
      <Frame className="mx-auto max-w-2xl">
        <FramePanel className="p-8">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
            Lender organization
          </p>
          <h1 className="mt-3 font-heading font-semibold text-2xl">
            Organization unavailable
          </h1>
          <p className="mt-3 max-w-lg text-muted-foreground text-sm leading-6">
            This Lender Organization could not be loaded. It may not exist or
            its parent Brokerage may be unavailable.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={reset} variant="outline">
              Try again
            </Button>
            <Button render={<Link to="/backoffice/lenders" />} variant="ghost">
              Back to Lender Organizations
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function LenderOrganizationDetailRoute() {
  const { lenderId } = Route.useParams();
  const lenderOrganizationId = lenderId as Id<"lenderOrganizations">;
  const portfolio = useQuery(
    api.lender_portal.getBackofficeLenderOrganizationPortfolio,
    { lenderOrganizationId }
  ) as Portfolio | undefined;
  const members = useQuery(
    api.lenderOrganizations.listLenderOrganizationMembersForAdmin,
    { lenderOrganizationId }
  ) as Members | undefined;

  useRouteBreadcrumbProjection(
    "/backoffice/lenders/$lenderId",
    portfolio?.organization.displayName ?? "Loading organization…"
  );

  if (portfolio === undefined || members === undefined) {
    return <LenderOrganizationDetailLoading />;
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/20 pb-20">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 p-4 md:p-8">
        <header className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
                Back Office / Lenders
              </p>
              <h1 className="mt-2 truncate font-heading font-semibold text-3xl tracking-tight">
                {portfolio.organization.displayName}
              </h1>
              <p className="mt-2 text-muted-foreground text-sm">
                {portfolio.organization.legalName}
              </p>
            </div>
            <Button render={<Link to="/backoffice/lenders" />} variant="outline">
              Back to Lender Organizations
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground text-sm">
            <span className="inline-flex items-center gap-2">
              <Building2 aria-hidden className="size-4" />
              Parent Brokerage: {portfolio.organization.brokerageName}
            </span>
            <Badge
              variant={
                portfolio.organization.status === "active" ? "default" : "outline"
              }
            >
              {portfolio.organization.status === "active" ? "Active" : "Inactive"}
            </Badge>
          </div>
        </header>

        <LenderOrganizationSummary
          activeBuildCount={portfolio.builds.length}
          activeMemberCount={members.members.length}
          currentProposalCount={portfolio.proposals.filter((proposal) => !proposal.readOnly).length}
        />

        <div className="space-y-8">
          <PortfolioSection
            description="Live Builds created from current Proposals assigned to this Lender Organization."
            heading="Active Builds"
          >
            <LenderActiveBuildList
              builds={portfolio.builds}
              linkTo="/backoffice/builds/$buildId"
            />
          </PortfolioSection>

          <PortfolioSection
            description="Proposals assigned to this organization, including approved or closed records and withdrawn history."
            heading="Submitted Proposals"
          >
            <LenderAssignedProposalList
              linkTo="/backoffice/proposals/$planId"
              proposals={portfolio.proposals}
            />
          </PortfolioSection>

          <PortfolioSection
            description="Active users assigned through the application organization and the shared WorkOS membership projection."
            heading="Organization members"
          >
            <Frame>
              <FramePanel className="p-0">
                <LenderOrganizationMembersTable
                  members={members.members}
                  mode="table"
                />
              </FramePanel>
            </Frame>
          </PortfolioSection>
        </div>
      </div>
    </main>
  );
}

function PortfolioSection({
  children,
  description,
  heading,
}: {
  children: ReactNode;
  description: string;
  heading: string;
}) {
  return (
    <section aria-labelledby={`${heading}-heading`} className="space-y-3">
      <div>
        <h2
          className="font-heading font-semibold text-xl"
          id={`${heading}-heading`}
        >
          {heading}
        </h2>
        <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      <Separator />
      {children}
    </section>
  );
}

export function LenderOrganizationSummary({
  activeBuildCount,
  activeMemberCount,
  currentProposalCount,
}: {
  activeBuildCount: number;
  activeMemberCount: number;
  currentProposalCount: number;
}) {
  return (
    <Frame>
      <FramePanel className="p-0">
        <div className="grid gap-0 sm:grid-cols-3">
          <SummaryMetric label="Active Builds" value={activeBuildCount} />
          <SummaryMetric label="Current assigned Proposals" value={currentProposalCount} />
          <SummaryMetric label="Active members" value={activeMemberCount} />
        </div>
      </FramePanel>
    </Frame>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-5 sm:border-r last:sm:border-r-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-heading font-semibold text-2xl">{value}</p>
    </div>
  );
}

function LenderOrganizationDetailLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading lender organization detail"
      className="min-h-[calc(100vh-3.5rem)] bg-muted/20 pb-20"
    >
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 p-4 md:p-8">
        <div className="space-y-3">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
            Back Office / Lenders
          </p>
          <div className="h-9 w-72 animate-pulse rounded bg-muted" />
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
        </div>
        <Frame>
          <FramePanel className="h-24 animate-pulse bg-muted/40" />
        </Frame>
        <p aria-live="polite" className="text-muted-foreground text-sm">
          Loading organization portfolio and members…
        </p>
      </div>
    </main>
  );
}
