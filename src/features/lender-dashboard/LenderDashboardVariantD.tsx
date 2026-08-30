import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  Mail,
  MapPin,
  WalletCards,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Progress } from "../../components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

type DashboardActionTarget =
  | {
      assignmentId: string;
      kind: "proposal";
      proposalId: string;
    }
  | {
      buildId: string;
      kind: "build";
    };

interface DashboardActionItem {
  fact: string;
  icon: ComponentType<{ className?: string }>;
  meta: string;
  target?: DashboardActionTarget;
  title: string;
  type: "Proposal" | "Milestone" | "Draw";
}

type LenderDashboardData = NonNullable<
  FunctionReturnType<typeof api.lender_portal.getLenderDashboard>
>;

export function LenderDashboardVariantD() {
  const currentOrganization = useQuery(
    api.lenderOrganizations.getCurrentLenderOrganization,
    {}
  );
  const dashboard = useQuery(
    api.lender_portal.getLenderDashboard,
    currentOrganization?.organization ? {} : "skip"
  );

  if (currentOrganization !== undefined && !currentOrganization.organization) {
    return <LenderDashboardUnassignedState />;
  }

  if (currentOrganization === undefined || dashboard === undefined) {
    return (
      <Card className="grid min-h-96 place-items-center text-muted-foreground text-sm">
        Loading assigned portfolio…
      </Card>
    );
  }

  return <LiveLenderDashboardVariantD data={dashboard} />;
}

function LenderDashboardUnassignedState() {
  return (
    <Card className="mx-auto mt-12 max-w-2xl">
      <CardHeader>
        <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
          Lender organization
        </p>
        <CardTitle className="font-heading text-2xl">
          <h1>Your assigned portfolio is still being arranged.</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="max-w-xl text-muted-foreground text-sm leading-6">
          A DrawFlow admin needs to attach your lender account to an application
          organization before assigned work can appear here.
        </p>
        <Button
          className="mt-6"
          render={
            <a
              aria-label="Contact DrawFlow admin about lender organization access"
              href="mailto:support@fairlend.ca?subject=DrawFlow%20lender%20organization%20access"
            >
              <span className="sr-only">
                Contact DrawFlow admin about lender organization access
              </span>
            </a>
          }
        >
          <Mail aria-hidden />
          Contact DrawFlow admin
        </Button>
      </CardContent>
    </Card>
  );
}

export function LiveLenderDashboardVariantD({
  data,
}: {
  data: LenderDashboardData;
}) {
  const actions = data.actions.map(toDashboardActionItem);

  return (
    <div>
      <PageHeading
        eyebrow="Lender portfolio"
        title="Assigned portfolio"
        updatedAt={data.updatedAt}
      />

      <Card className="mb-7 border-primary/35 shadow-sm">
        <CardHeader className="flex-row items-center justify-between border-b bg-primary/5">
          <div>
            <CardTitle>
              <h2>Needs my attention</h2>
            </CardTitle>
            <p className="mt-1 text-muted-foreground text-xs">
              {actions.length} assigned reviews with current workflow state
            </p>
          </div>
          <Badge className="tabular-nums">{actions.length} open</Badge>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {actions.length === 0 ? (
            <p className="p-5 text-muted-foreground text-sm">
              No lender decisions need your attention right now.
            </p>
          ) : (
            actions.map((item) => (
              <ActionRow item={item} key={item.title + item.fact} />
            ))
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="lender-dashboard-portfolio-heading">
        <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <h2
            className="font-semibold text-sm"
            id="lender-dashboard-portfolio-heading"
          >
            Assigned portfolio
          </h2>
          <div className="flex flex-wrap gap-2 tabular-nums">
            <Badge variant="outline">
              {data.stats.assignedProposalCount} proposals
            </Badge>
            <Badge variant="secondary">
              {data.stats.activeBuildCount} active Builds
            </Badge>
            <Badge variant="outline">
              {data.stats.milestoneCount} Milestones
            </Badge>
            <Badge variant="outline">{data.stats.drawCount} Draws</Badge>
            <Badge variant="outline">
              {data.stats.totalFacilityCents > 0
                ? `${formatCompactCurrency(data.stats.totalFacilityCents)} facility`
                : "Facility not booked"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden py-0">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="font-semibold text-sm">Active Builds</h3>
              <Badge variant="secondary">
                {data.stats.assignedProposalCount} assigned proposals
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Build</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead>Next state</TableHead>
                  <TableHead className="pr-5 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.builds.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="p-5 text-muted-foreground text-sm"
                      colSpan={5}
                    >
                      No active Builds are assigned to this lender organization.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.builds.map((build) => {
                    const releasedPercent = build.facilityCents
                      ? Math.min(
                          100,
                          Math.round(
                            (build.releasedCents / build.facilityCents) * 100
                          )
                        )
                      : 0;
                    return (
                      <TableRow key={build.buildId}>
                        <TableCell className="py-4 pl-5">
                          <p className="font-semibold text-foreground">
                            {build.buildName}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-muted-foreground text-xs">
                            <MapPin aria-hidden className="size-3" />
                            {build.location}
                          </p>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {build.facilityCents > 0
                            ? formatCompactCurrency(build.facilityCents)
                            : "Not booked"}
                        </TableCell>
                        <TableCell>
                          <div className="w-28">
                            <div className="mb-1 flex justify-between text-muted-foreground text-xs tabular-nums">
                              <span>
                                {formatCompactCurrency(build.releasedCents)}
                              </span>
                              <span>{releasedPercent}%</span>
                            </div>
                            <Progress
                              aria-label={`${build.buildName} funds released`}
                              value={releasedPercent}
                            />
                          </div>
                        </TableCell>
                        <TableCell>{build.nextState}</TableCell>
                        <TableCell className="pr-5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {build.milestonesBehindSchedule > 0 ? (
                              <Badge className="tabular-nums" variant="warning">
                                {build.milestonesBehindSchedule}{" "}
                                {build.milestonesBehindSchedule === 1
                                  ? "Milestone"
                                  : "Milestones"}{" "}
                                behind schedule
                              </Badge>
                            ) : null}
                            <Badge
                              variant={
                                build.status === "needs_action"
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {formatBuildStatus(build.status)}
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          <Card className="overflow-hidden py-0">
            <div className="border-b px-5 py-4">
              <h3 className="font-semibold text-sm">Review requirements</h3>
            </div>
            <div className="divide-y">
              {actions.length === 0 ? (
                <p className="p-5 text-muted-foreground text-sm">
                  No open review requirements.
                </p>
              ) : (
                actions.map((item, index) => (
                  <DashboardActionTarget
                    ariaLabel={`Open ${item.type.toLowerCase()} ${item.title}`}
                    className="block px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    key={item.title + item.fact}
                    target={item.target}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        {item.type}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-sm leading-5">
                      {item.title}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.fact}</span>
                      <ArrowUpRight aria-hidden className="size-3.5" />
                    </div>
                  </DashboardActionTarget>
                ))
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  updatedAt,
}: {
  eyebrow: string;
  title: string;
  updatedAt: number;
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <p className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
          {eyebrow}
        </p>
        <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
          {title}
        </h1>
      </div>
      <Badge className="w-fit gap-1.5" variant="outline">
        <Activity aria-hidden className="size-3" />
        {updatedAt > 0
          ? `Updated ${formatTime(updatedAt)}`
          : "No recorded activity"}
      </Badge>
    </header>
  );
}

function ActionRow({ item }: { item: DashboardActionItem }) {
  const Icon = item.icon;
  return (
    <DashboardActionTarget
      ariaLabel={`Open ${item.type.toLowerCase()} ${item.title}`}
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      target={item.target}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-sm">{item.title}</p>
          <Badge variant="outline">{item.type}</Badge>
        </div>
        <p className="mt-1 truncate text-muted-foreground text-xs">
          {item.meta}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="font-medium text-foreground text-xs">{item.fact}</p>
        <p className="mt-1 text-muted-foreground text-xs">Assigned to you</p>
      </div>
      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
    </DashboardActionTarget>
  );
}

function DashboardActionTarget({
  ariaLabel,
  children,
  className,
  target,
}: {
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  target?: DashboardActionTarget;
}) {
  if (!target) {
    return <div className={className}>{children}</div>;
  }

  if (target.kind === "proposal") {
    return (
      <Link
        aria-label={ariaLabel}
        className={className}
        params={{ proposalId: target.proposalId }}
        preload="intent"
        search={{ assignmentId: target.assignmentId }}
        to="/lender/proposals/$proposalId"
        viewTransition
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      aria-label={ariaLabel}
      className={className}
      params={{ buildId: target.buildId }}
      preload="intent"
      to="/lender/builds/$buildId"
      viewTransition
    >
      {children}
    </Link>
  );
}

function toDashboardActionItem(
  action: LenderDashboardData["actions"][number]
): DashboardActionItem {
  const icon =
    action.type === "Proposal"
      ? FileCheck2
      : action.type === "Milestone"
        ? ClipboardCheck
        : WalletCards;
  return {
    fact: action.fact,
    icon,
    meta:
      action.amountCents === undefined
        ? action.meta
        : `${formatCompactCurrency(action.amountCents)} · ${action.meta}`,
    target:
      action.type === "Proposal" && action.proposalId && action.assignmentId
        ? {
            assignmentId: action.assignmentId,
            kind: "proposal" as const,
            proposalId: action.proposalId,
          }
        : action.buildId
          ? { buildId: action.buildId, kind: "build" as const }
          : undefined,
    title: action.title,
    type: action.type,
  };
}

function formatCompactCurrency(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: cents >= 10_000_000 ? 1 : 0,
    notation: "compact",
    style: "currency",
  }).format(cents / 100);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function formatBuildStatus(
  status: "active" | "needs_action" | "on_track" | "future_start"
) {
  switch (status) {
    case "needs_action":
      return "Needs action";
    case "future_start":
      return "Future start";
    default:
      return "On track";
  }
}
