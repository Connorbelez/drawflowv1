import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Gauge,
  MapPin,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import type { ComponentType } from "react";

import { PrototypeVariantSwitcher } from "../components/prototypes/PrototypeVariantSwitcher";
import { LenderPrototypeShell } from "../components/prototypes/LenderPrototypeShell";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Separator } from "../components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { cn } from "../lib/utils";

// PROTOTYPE ONLY: rejected source variants A/B/C plus accepted Variant D on
// /lender/prototype?variant=A|B|C|D.
const prototypeVariants = [
  { key: "A", label: "Rejected · Action desk" },
  { key: "B", label: "Rejected · Portfolio book" },
  { key: "C", label: "Rejected · Decision lanes" },
  { key: "D", label: "Accepted · Action-led portfolio" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute("/lender/prototype")({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "D",
  }),
  component: LenderDashboardPrototypeRoute,
});

const actionItems = [
  {
    type: "Proposal",
    title: "Juniper Row Homes",
    meta: "Revision 3 · 5 checkpoints",
    fact: "Policy confirmation required",
    icon: FileCheck2,
  },
  {
    type: "Milestone",
    title: "Harbourline · Framing complete",
    meta: "Site visit and 14 attachments ready",
    fact: "Site visit complete",
    icon: ClipboardCheck,
  },
  {
    type: "Draw",
    title: "Cedar & King · Draw 04",
    meta: "$428,500 · Back Office approved",
    fact: "Lender approval required",
    icon: WalletCards,
  },
  {
    type: "Milestone",
    title: "Parkview Mews · Foundation",
    meta: "1 of 2 lender approvals recorded",
    fact: "Lender quorum outstanding",
    icon: ClipboardCheck,
  },
] as const;

const builds = [
  {
    name: "Harbourline Residences",
    location: "Hamilton, ON",
    facility: "$5.2M",
    released: "$2.1M",
    next: "Milestone review",
    status: "Needs action",
    progress: 40,
  },
  {
    name: "Cedar & King",
    location: "Kitchener, ON",
    facility: "$4.8M",
    released: "$2.9M",
    next: "Draw 04 review",
    status: "Needs action",
    progress: 60,
  },
  {
    name: "Parkview Mews",
    location: "Guelph, ON",
    facility: "$3.6M",
    released: "$0.9M",
    next: "Lender quorum",
    status: "In review",
    progress: 25,
  },
  {
    name: "Northfield Commons",
    location: "Waterloo, ON",
    facility: "$2.9M",
    released: "$1.9M",
    next: "No action required",
    status: "On track",
    progress: 66,
  },
] as const;

function LenderDashboardPrototypeRoute() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const selectVariant = (nextVariant: string) => {
    if (!isPrototypeVariant(nextVariant)) {
      return;
    }

    void navigate({
      replace: true,
      search: { variant: nextVariant },
      to: "/lender/prototype",
    });
  };

  return (
    <LenderPrototypeShell>
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-28">
        <div className="border-y border-amber-500/30 bg-amber-50 px-4 py-2 text-center text-[11px] font-medium tracking-wide text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          THROWAWAY PROTOTYPE · READ-ONLY REPRESENTATIVE DATA · NOT PRODUCTION
        </div>
        <main className="mx-auto min-w-0 max-w-[1440px] p-4">
          {variant === "A" ? <VariantA /> : null}
          {variant === "B" ? <VariantB /> : null}
          {variant === "C" ? <VariantC /> : null}
          {variant === "D" ? <VariantD /> : null}
        </main>
      </div>
      <PrototypeVariantSwitcher
        current={variant}
        onChange={selectVariant}
        variants={prototypeVariants}
      />
    </LenderPrototypeShell>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <Badge className="w-fit gap-1.5" variant="outline">
        <Activity className="size-3" /> Updated 9:42 AM
      </Badge>
    </header>
  );
}

function VariantA() {
  return (
    <div>
      <PageHeading
        description="Start with the decisions assigned to you, then scan the portfolio state around them."
        eyebrow="Variant A · Action desk"
        title="Good morning, Morgan"
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={FileText}
          label="Proposals"
          total="4 assigned"
          value="2"
        />
        <MetricCard
          icon={Building2}
          label="Active Builds"
          total="$16.5M facility"
          value="7"
        />
        <MetricCard
          icon={ClipboardCheck}
          label="Milestones"
          total="9 assigned"
          value="3"
        />
        <MetricCard
          icon={WalletCards}
          label="Draws"
          total="$428.5K pending"
          value="1"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.75fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b">
            <div>
              <CardTitle>Needs my action</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                4 assigned reviews with current workflow state
              </p>
            </div>
            <Badge>4 open</Badge>
          </CardHeader>
          <CardContent className="divide-y px-0">
            {actionItems.map((item) => (
              <ActionRow item={item} key={item.title} />
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned portfolio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <PortfolioStat label="Total facility" value="$18.4M" />
              <PortfolioStat label="Funds released" value="$7.8M" />
              <Progress aria-label="Funds released" value={42} />
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <PortfolioStat label="Active Builds" value="7" />
                <PortfolioStat label="Review attached" value="28 files" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-start gap-3 py-5">
              <ShieldCheck className="mt-0.5 size-5 text-primary-foreground" />
              <div>
                <p className="text-sm font-semibold">Review policy in effect</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Two active Builds require both Back Office and lender-group
                  approval.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  total,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  total: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{value}</span>
            <span className="text-xs font-medium text-muted-foreground">
              need action
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {label} · {total}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionRow({ item }: { item: (typeof actionItems)[number] }) {
  const Icon = item.icon;
  return (
    <div className="group flex items-center gap-4 px-5 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          <Badge variant="outline">{item.type}</Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {item.meta}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-xs font-medium text-foreground">{item.fact}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Assigned to you
        </p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground" />
    </div>
  );
}

function PortfolioStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function VariantB() {
  return (
    <div>
      <PageHeading
        description="Treat the dashboard as a lender book: one dense portfolio ledger with action state in context."
        eyebrow="Variant B · Portfolio book"
        title="Assigned portfolio"
      />

      <section className="mb-5 overflow-hidden rounded-lg border bg-card">
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <InlineMetric
            label="Total facility"
            value="$18.4M"
            note="7 active Builds"
          />
          <InlineMetric
            label="Funds released"
            value="$7.8M"
            note="42% of facility"
          />
          <InlineMetric
            label="Needs action"
            value="6"
            note="Across 4 records"
          />
          <InlineMetric
            label="Awaiting others"
            value="5"
            note="No action from you"
          />
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Active Build ledger</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                All assigned Builds with their next review state
              </p>
            </div>
            <Badge variant="secondary">All assigned</Badge>
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
              {builds.map((build) => (
                <TableRow key={build.name}>
                  <TableCell className="pl-5 py-4">
                    <p className="font-semibold text-foreground">
                      {build.name}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MapPin className="size-3" /> {build.location}
                    </p>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {build.facility}
                  </TableCell>
                  <TableCell>
                    <div className="w-28">
                      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>{build.released}</span>
                        <span>{build.progress}%</span>
                      </div>
                      <Progress value={build.progress} />
                    </div>
                  </TableCell>
                  <TableCell>{build.next}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <Badge
                      variant={
                        build.status === "Needs action" ? "default" : "outline"
                      }
                    >
                      {build.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <aside className="rounded-lg border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Review requirements</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Current workflow facts for lender review
            </p>
          </div>
          <div className="divide-y">
            {actionItems.slice(0, 3).map((item, index) => (
              <div className="px-5 py-4" key={item.title}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.type}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold leading-5">
                  {item.title}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{item.fact}</span>
                  <ArrowUpRight className="size-3.5" />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function VariantD() {
  return (
    <div>
      <PageHeading
        description="Start with lender-required decisions, then move into the complete assigned portfolio book."
        eyebrow="Variant D · Accepted action-led portfolio"
        title="Assigned portfolio"
      />

      <Card className="mb-7 border-primary/35 shadow-sm">
        <CardHeader className="flex-row items-center justify-between border-b bg-primary/5">
          <div>
            <CardTitle>Needs my attention</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              4 assigned reviews with current workflow state
            </p>
          </div>
          <Badge>4 open</Badge>
        </CardHeader>
        <CardContent className="divide-y px-0">
          {actionItems.map((item) => (
            <ActionRow item={item} key={item.title} />
          ))}
        </CardContent>
      </Card>

      <section aria-labelledby="variant-d-portfolio-heading">
        <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2
              className="text-sm font-semibold"
              id="variant-d-portfolio-heading"
            >
              Assigned portfolio
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Complete lender book with current review state in context
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">$18.4M facility</Badge>
            <Badge variant="secondary">7 active Builds</Badge>
          </div>
        </div>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold">Active Build ledger</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  All assigned Builds with their next review state
                </p>
              </div>
              <Badge variant="secondary">All assigned</Badge>
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
                {builds.map((build) => (
                  <TableRow key={build.name}>
                    <TableCell className="pl-5 py-4">
                      <p className="font-semibold text-foreground">
                        {build.name}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="size-3" /> {build.location}
                      </p>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {build.facility}
                    </TableCell>
                    <TableCell>
                      <div className="w-28">
                        <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                          <span>{build.released}</span>
                          <span>{build.progress}%</span>
                        </div>
                        <Progress value={build.progress} />
                      </div>
                    </TableCell>
                    <TableCell>{build.next}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <Badge
                        variant={
                          build.status === "Needs action"
                            ? "default"
                            : "outline"
                        }
                      >
                        {build.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <aside className="rounded-lg border bg-card">
            <div className="border-b px-5 py-4">
              <h3 className="text-sm font-semibold">Review requirements</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Current workflow facts for lender review
              </p>
            </div>
            <div className="divide-y">
              {actionItems.slice(0, 3).map((item, index) => (
                <div className="px-5 py-4" key={item.title}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {item.type}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-5">
                    {item.title}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.fact}</span>
                    <ArrowUpRight className="size-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

// TODO(lender-portal): replace the prototype's representative records with the
// canonical lender dashboard projection. Keep this selected composition intact.
export function LenderDashboardVariantD() {
  return <VariantD />;
}

function InlineMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="pb-1 text-[10px] text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

function VariantC() {
  const lanes = [
    {
      title: "Decide now",
      description: "Your approval is outstanding",
      count: 4,
      icon: Gauge,
      items: actionItems.slice(0, 2),
      className: "border-primary/40 bg-primary/5",
    },
    {
      title: "Waiting on others",
      description: "Your counting decision is recorded",
      count: 5,
      icon: Clock3,
      items: [
        {
          type: "Draw",
          title: "Parkview · Draw 02",
          meta: "Waiting on Back Office",
          fact: "Approved by you",
          icon: WalletCards,
        },
        {
          type: "Milestone",
          title: "Northfield · Roofing",
          meta: "1 of 2 lender approvals",
          fact: "Lender quorum outstanding",
          icon: ClipboardCheck,
        },
      ],
      className: "bg-card",
    },
    {
      title: "Recently resolved",
      description: "Completed lender decisions",
      count: 3,
      icon: CheckCircle2,
      items: [
        {
          type: "Proposal",
          title: "Willow House",
          meta: "Current revision approved",
          fact: "Decision recorded",
          icon: FileCheck2,
        },
        {
          type: "Draw",
          title: "Harbourline · Draw 03",
          meta: "Approval outcome recorded",
          fact: "Decision recorded",
          icon: WalletCards,
        },
      ],
      className: "bg-card",
    },
  ] as const;

  return (
    <div>
      <PageHeading
        description="Organize the landing page by decision ownership so partial approvals and handoffs stay visible."
        eyebrow="Variant C · Decision lanes"
        title="Review control room"
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <CompactPulse
          icon={FileText}
          label="Proposal confirmations"
          value="2"
        />
        <CompactPulse
          icon={ClipboardCheck}
          label="Milestone decisions"
          value="3"
        />
        <CompactPulse icon={WalletCards} label="Draw decisions" value="1" />
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          return (
            <div
              className={cn("rounded-xl border p-3", lane.className)}
              key={lane.title}
            >
              <div className="flex items-start justify-between px-1 py-2">
                <div className="flex items-center gap-2.5">
                  <Icon className="size-4 text-muted-foreground" />
                  <div>
                    <h2 className="text-sm font-semibold">{lane.title}</h2>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {lane.description}
                    </p>
                  </div>
                </div>
                <Badge variant="outline">{lane.count}</Badge>
              </div>
              <div className="mt-2 grid gap-3">
                {lane.items.map((item) => (
                  <LaneCard item={item} key={item.title} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">Portfolio coverage</p>
            <p className="mt-1 text-xs text-muted-foreground">
              7 assigned active Builds · $18.4M total facility
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <CoverageItem label="No action" value="3 Builds" />
            <CoverageItem label="Lender action" value="3 Builds" />
            <CoverageItem label="Waiting on Back Office" value="1 Build" />
          </div>
        </div>
      </section>
    </div>
  );
}

function CompactPulse({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function LaneCard({
  item,
}: {
  item: {
    type: string;
    title: string;
    meta: string;
    fact: string;
    icon: ComponentType<{ className?: string }>;
  };
}) {
  const Icon = item.icon;
  return (
    <article className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-muted">
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <Badge variant="outline">{item.type}</Badge>
      </div>
      <h3 className="mt-4 text-sm font-semibold leading-5">{item.title}</h3>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {item.meta}
      </p>
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-[10px]">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Activity className="size-3" /> {item.fact}
        </span>
        <ChevronRight className="size-3.5 text-muted-foreground" />
      </div>
    </article>
  );
}

function CoverageItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
