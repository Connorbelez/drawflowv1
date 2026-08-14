import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FolderKanban,
  MapPin,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";

import { LenderPrototypeShell } from "#/components/prototypes/LenderPrototypeShell.tsx";
import { lenderDrawQueue } from "#/components/prototypes/lenderDrawQueueContract.ts";
import { PrototypeVariantSwitcher } from "#/components/prototypes/PrototypeVariantSwitcher.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { getVisualParityActiveBuildDetail } from "#/features/production-proposals/visualParityFixtures.ts";
import { cn } from "#/lib/utils.ts";

// PROTOTYPE ONLY: three lender Build Detail overview variants with Variant C
// selected and locked as the winning prototype contract,
// switchable at /lender/build-detail-overview-prototype?variant=A|B|C.
// Every variant is the same narrow, permission-shaped projection: Overview,
// Milestone records, Draw records, and evidence attached to a relevant review.
const prototypeVariants = [
  { key: "A", label: "Canonical adaptation" },
  { key: "B", label: "External stakeholder overview" },
  { key: "C", label: "Precision console · locked" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute("/lender/build-detail-overview-prototype")(
  {
    validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
      variant: isPrototypeVariant(search.variant) ? search.variant : "C",
    }),
    component: LenderBuildDetailOverviewPrototypeRoute,
  }
);

const representativeBuildFixture = getVisualParityActiveBuildDetail(
  "active-build-visual-lender-overview"
);

const representativeDraws = lenderDrawQueue.filter(
  (draw) => draw.build === "Harbourline Residences"
);

const currentDraw = representativeDraws.find(
  (draw) => draw.state === "needs-action"
);

const approvedDraw = representativeDraws.find(
  (draw) => draw.state === "approved"
);

// Local representative projection only. Build identity and pooled Draw facts
// come from the locked lender fixture; Milestone records reuse the current
// production Build-detail fixture. This is not a persisted or production model.
const representativeBuild =
  representativeBuildFixture && currentDraw
    ? {
        ...representativeBuildFixture,
        build: {
          ...representativeBuildFixture.build,
          buildName: currentDraw.build,
          location: currentDraw.location,
        },
      }
    : representativeBuildFixture;

const statusLabel = (status: string) =>
  status
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

function LenderBuildDetailOverviewPrototypeRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { variant } = Route.useSearch();

  return (
    <LenderBuildDetailOverviewPrototypeSurface
      onVariantChange={(nextVariant) =>
        navigate({
          search: { variant: nextVariant },
          replace: true,
        })
      }
      variant={variant}
    />
  );
}

export function LenderBuildDetailOverviewPrototypeSurface({
  onVariantChange = () => undefined,
  variant,
}: {
  onVariantChange?: (variant: PrototypeVariantKey) => void;
  variant: PrototypeVariantKey;
}) {
  if (!(representativeBuild && currentDraw)) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <Frame>
          <FramePanel className="max-w-md">
            Representative Build data is unavailable.
          </FramePanel>
        </Frame>
      </main>
    );
  }

  return (
    <LenderPrototypeShell
      activeNavigation="Active Builds"
      identity={{
        avatarFallback: "ML",
        organizationName: "Meridian Capital",
        roleLabel: "Lender user",
        userName: "Morgan Lee",
      }}
      pageTitle={representativeBuild.build.buildName}
    >
      <div className="h-[calc(100svh-9rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        {variant === "A" ? <VariantA build={representativeBuild} /> : null}
        {variant === "B" ? <VariantB build={representativeBuild} /> : null}
        {variant === "C" ? <VariantC build={representativeBuild} /> : null}
      </div>

      <PrototypeVariantSwitcher
        current={variant}
        onChange={(nextVariant) =>
          onVariantChange(nextVariant as PrototypeVariantKey)
        }
        variants={prototypeVariants}
      />
    </LenderPrototypeShell>
  );
}

type RepresentativeBuild = NonNullable<typeof representativeBuild>;
type RepresentativeMilestone = RepresentativeBuild["milestones"][number];
type RepresentativeBuildWithPublicUpdates = RepresentativeBuild & {
  notes?: {
    public?: Array<{
      _id: string;
      body: string;
      createdAt: number;
      visibility: "public";
    }>;
  };
};

const currencyWholeFormatter = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
  style: "currency",
});

const compactDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

const formatWholeCents = (cents: number) =>
  currencyWholeFormatter.format(cents / 100);

const formatCompactDate = (value: string | number) =>
  compactDateFormatter.format(
    typeof value === "number" ? new Date(value) : new Date(`${value}T00:00:00Z`)
  );

const addUtcDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

function milestoneDateRange(
  build: RepresentativeBuild,
  milestone: RepresentativeMilestone
) {
  const submilestones = build.submilestones.filter(
    (item) => item.milestoneKey === milestone.key
  );
  const completedDates = submilestones
    .map((item) => item.completedAt)
    .filter((value): value is number => typeof value === "number");
  const hasActualEnd =
    submilestones.length > 0 && completedDates.length === submilestones.length;
  const start = milestone.actualStartedAt
    ? formatCompactDate(milestone.actualStartedAt)
    : formatCompactDate(addUtcDays(build.build.startDate, milestone.dayStart));
  const end = hasActualEnd
    ? formatCompactDate(Math.max(...completedDates))
    : formatCompactDate(addUtcDays(build.build.startDate, milestone.dayEnd));

  return {
    end,
    source:
      milestone.actualStartedAt && hasActualEnd
        ? "Actual"
        : milestone.actualStartedAt
          ? "Actual start · planned end"
          : hasActualEnd
            ? "Planned start · actual end"
            : "Planned",
    start,
  };
}

function submilestoneDateRange(
  build: RepresentativeBuild,
  milestone: RepresentativeMilestone,
  submilestone: RepresentativeBuild["submilestones"][number]
) {
  const plannedStartDay =
    submilestone.startDay ??
    milestone.dayStart + Math.max(0, submilestone.order - 1);
  const plannedEndDay =
    plannedStartDay + Math.max(1, submilestone.durationDays ?? 1) - 1;
  const start = submilestone.actualStartedAt
    ? formatCompactDate(submilestone.actualStartedAt)
    : formatCompactDate(addUtcDays(build.build.startDate, plannedStartDay));
  const end = submilestone.completedAt
    ? formatCompactDate(submilestone.completedAt)
    : formatCompactDate(addUtcDays(build.build.startDate, plannedEndDay));

  return {
    end,
    source:
      submilestone.actualStartedAt && submilestone.completedAt
        ? "Actual"
        : submilestone.actualStartedAt
          ? "Actual start · planned end"
          : submilestone.completedAt
            ? "Planned start · actual end"
            : "Planned",
    start,
  };
}

function PrototypeNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-muted-foreground text-xs",
        compact && "gap-1.5 text-xs"
      )}
    >
      <Badge variant="outline">Prototype only</Badge>
      <Badge variant="secondary">Read-only</Badge>
      <span>Local representative data</span>
      <span aria-hidden="true">·</span>
      <span>C approved and locked</span>
    </div>
  );
}

function CanonicalSourceNote({ dense = false }: { dense?: boolean }) {
  return (
    <div
      className={cn("flex items-start gap-3 text-sm", dense && "gap-2 text-xs")}
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-foreground" />
      <p className="max-w-[72ch] leading-relaxed">
        <span className="font-medium text-foreground">
          Canonical Build state, permission-shaped for your assignment.
        </span>{" "}
        This overview does not expose the Builder or Back Office Build Workspace
        and does not own a separate copy of the Build.
      </p>
    </div>
  );
}

function BuildIdentity({
  build,
  className,
}: {
  build: RepresentativeBuild;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      <div>
        <dt className="text-muted-foreground text-xs">Build ID</dt>
        <dd className="mt-1 font-medium tabular-nums">
          {build.displayId ?? build.build._id}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Builder</dt>
        <dd className="mt-1 font-medium">
          {currentDraw?.builder ?? "Assigned Builder"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Location</dt>
        <dd className="mt-1 flex items-center gap-1.5 font-medium">
          <MapPin className="size-3.5 text-muted-foreground" />
          {build.build.location}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Build state</dt>
        <dd className="mt-1">
          <Badge variant="secondary">{statusLabel(build.build.status)}</Badge>
        </dd>
      </div>
    </dl>
  );
}

function ReviewNavigation({
  quiet = false,
  showDescription = true,
}: {
  quiet?: boolean;
  showDescription?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        render={
          <a href="/lender/milestones-prototype?variant=C">
            Open Milestone review <ArrowUpRight />
          </a>
        }
        size="sm"
        variant={quiet ? "outline" : "default"}
      />
      <Button
        render={
          <a href="/lender/draw-review-sheet-prototype?variant=A">
            Open Draw review <ArrowUpRight />
          </a>
        }
        size="sm"
        variant="outline"
      />
      {showDescription ? (
        <span className="text-muted-foreground text-xs">
          Open a record to review its submitted work and evidence.
        </span>
      ) : null}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full bg-muted-foreground/35",
        status === "complete" && "bg-emerald-600",
        status === "in_progress" && "bg-primary"
      )}
    />
  );
}

function MilestoneRecordList({
  build,
  calm = false,
}: {
  build: RepresentativeBuild;
  calm?: boolean;
}) {
  const visit = build.siteVisits?.[0];

  return (
    <div className="divide-y">
      {build.milestones.map((milestone) => {
        const isCurrent = milestone.status === "in_progress";
        const relevantVisit =
          visit?.milestoneKey === milestone.key ? visit : undefined;

        return (
          <article
            className={cn(
              "grid gap-3 py-4 first:pt-0 last:pb-0",
              calm ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_8rem]"
            )}
            key={milestone._id}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusDot status={milestone.status} />
                <h3 className="truncate font-medium text-sm">
                  {milestone.name}
                </h3>
                {isCurrent ? <Badge variant="secondary">Current</Badge> : null}
              </div>
              <p className="mt-1 pl-4 text-muted-foreground text-xs">
                {statusLabel(milestone.status)} ·{" "}
                {milestone.progressPercent ?? 0}% recorded progress
              </p>
              {isCurrent ? (
                <Card className="mt-3 ml-4 bg-muted/65 shadow-none">
                  <CardContent className="grid gap-2 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Review evidence</p>
                      <p className="mt-1 font-medium">
                        {milestone.evidenceState ??
                          "No review package recorded"}
                      </p>
                    </div>
                    {relevantVisit ? (
                      <div>
                        <p className="text-muted-foreground">Site Visit</p>
                        <p className="mt-1 font-medium">
                          {statusLabel(relevantVisit.status)} ·{" "}
                          {relevantVisit.note}
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
            </div>
            <div className="sm:text-right">
              <Progress
                aria-label={`${milestone.name} recorded progress`}
                className="mt-1"
                value={milestone.progressPercent ?? 0}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PooledFundingPosition() {
  if (!currentDraw) {
    return null;
  }

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-3">
        <FundingFact
          label="Pooled availability"
          value={currentDraw.fundingPosition.availableBefore}
        />
        <FundingFact
          label="Current request"
          strong
          value={currentDraw.fundingPosition.requested}
        />
        <FundingFact
          label="Remaining if approved"
          value={currentDraw.fundingPosition.remainingAfter}
        />
      </dl>
      <p className="max-w-[70ch] text-muted-foreground text-xs leading-relaxed">
        Funding is shown at the Build level. The remaining balance reflects this
        request.
      </p>
    </div>
  );
}

function FundingFact({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "mt-1 font-medium text-base tabular-nums",
          strong && "text-xl"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DrawRecordsTable({ compact = false }: { compact?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Draw record</TableHead>
          {compact ? null : <TableHead>Review evidence</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Request</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {representativeDraws.map((draw) => (
          <TableRow key={draw.displayId}>
            <TableCell>
              <p className="font-medium">{draw.requestLabel}</p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {draw.displayId} · {draw.cycle}
              </p>
            </TableCell>
            {compact ? null : (
              <TableCell>
                <div className="flex max-w-80 flex-wrap gap-1.5">
                  {draw.evidence.map((fact) => (
                    <Badge key={fact.kind} variant="outline">
                      {fact.label}
                    </Badge>
                  ))}
                </div>
              </TableCell>
            )}
            <TableCell>
              <Badge
                variant={draw.state === "approved" ? "secondary" : "outline"}
              >
                {draw.stateLabel}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {draw.amount}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SectionHeading({
  action,
  children,
  description,
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h2 className="font-semibold text-lg">{children}</h2>
        <p className="mt-1 max-w-[65ch] text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function VariantA({ build }: { build: RepresentativeBuild }) {
  return (
    <main
      className="min-h-full bg-muted/20 px-3 pt-4 pb-28 sm:px-5 lg:px-7"
      data-testid="lender-build-overview-variant-a"
    >
      <div className="mx-auto w-full max-w-[1480px] space-y-4">
        <Frame>
          <FramePanel className="space-y-5">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
              <div>
                <PrototypeNotice />
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <h1 className="font-semibold text-2xl tracking-[-0.02em]">
                    {build.build.buildName}
                  </h1>
                  <Badge variant="secondary">Assigned live Build</Badge>
                </div>
                <p className="mt-2 max-w-[70ch] text-muted-foreground text-sm">
                  Lender Build Detail Overview
                </p>
              </div>
              <ReviewNavigation quiet />
            </div>
            <Separator />
            <BuildIdentity build={build} />
          </FramePanel>
          <FramePanel className="bg-primary/8 py-4">
            <CanonicalSourceNote />
          </FramePanel>
        </Frame>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <Frame>
            <FramePanel>
              <SectionHeading description="Canonical Milestone records with only review-relevant evidence expanded in place.">
                Milestone records
              </SectionHeading>
              <Separator className="my-5" />
              <MilestoneRecordList build={build} />
            </FramePanel>
          </Frame>

          <Frame>
            <FramePanel>
              <SectionHeading description="The current Draw Request against pooled Build availability.">
                Reimbursement position
              </SectionHeading>
              <Separator className="my-5" />
              <PooledFundingPosition />
            </FramePanel>
            <FramePanel>
              <div className="flex items-start gap-3">
                <Eye className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Overview boundary</p>
                  <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                    Only the confirmed narrow lender fields are loaded for this
                    assigned Build. Focused review work opens on its established
                    record surface.
                  </p>
                </div>
              </div>
            </FramePanel>
          </Frame>
        </div>

        <Frame>
          <FramePanel className="p-0">
            <div className="p-5">
              <SectionHeading description="Each row is a lender-visible projection of the canonical Draw record and its current review evidence.">
                Draw records
              </SectionHeading>
            </div>
            <Separator />
            <div className="overflow-x-auto px-2 pb-2">
              <DrawRecordsTable />
            </div>
          </FramePanel>
        </Frame>
      </div>
    </main>
  );
}

function VariantB({ build }: { build: RepresentativeBuild }) {
  const complete = build.milestones.find(
    (milestone) => milestone.status === "complete"
  );
  const active = build.milestones.find(
    (milestone) => milestone.status === "in_progress"
  );

  return (
    <main
      className="min-h-full bg-background px-4 pt-6 pb-28 sm:px-7 lg:px-10"
      data-testid="lender-build-overview-variant-b"
    >
      <div className="mx-auto w-full max-w-5xl">
        <PrototypeNotice />
        <div className="mt-8 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <MapPin className="size-4" />
            <span>{build.build.location}</span>
            <span aria-hidden="true">·</span>
            <span>{currentDraw?.builder}</span>
          </div>
          <h1 className="mt-4 text-balance font-semibold text-3xl tracking-[-0.025em] sm:text-4xl">
            {build.build.buildName}
          </h1>
          <p className="mt-5 max-w-[65ch] text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg">
            {complete?.name ?? "Initial work"} is complete.{" "}
            {active?.name ?? "The next Milestone"} is underway, and its review
            context is available without exposing the Builder or Back Office
            workspace.
          </p>
        </div>

        <div className="mt-8 border-y py-4">
          <CanonicalSourceNote />
        </div>

        <section className="py-10">
          <SectionHeading description="Milestone records in plain language: completed, current, and planned construction work.">
            Where construction stands
          </SectionHeading>
          <div className="mt-6">
            <MilestoneRecordList build={build} calm />
          </div>
        </section>

        <Separator />

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <SectionHeading description="Draw records show the amount under review against pooled Build availability, without assigning it to a Milestone or Draw Group.">
              Where reimbursement stands
            </SectionHeading>
            <div className="mt-6">
              <PooledFundingPosition />
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current Draw record</CardTitle>
              <CardDescription>{currentDraw?.displayId}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="font-medium text-sm">
                  {currentDraw?.requestLabel}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {currentDraw?.stateLabel} · {currentDraw?.cycle}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentDraw?.evidence.map((fact) => (
                  <Badge key={fact.kind} variant="outline">
                    {fact.label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator />

        <section className="py-10">
          <SectionHeading description="These links open the established review contexts. This overview records no decisions.">
            Continue into a focused record
          </SectionHeading>
          <div className="mt-5">
            <ReviewNavigation />
          </div>
        </section>

        {approvedDraw ? (
          <p className="border-t pt-5 text-muted-foreground text-xs">
            Previous record retained: {approvedDraw.displayId} ·{" "}
            {approvedDraw.requestLabel} · {approvedDraw.stateLabel}.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function VariantC({ build }: { build: RepresentativeBuild }) {
  const [expandedMilestoneKeys, setExpandedMilestoneKeys] = useState<
    Set<string>
  >(() => new Set());
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState<
    string | null
  >(null);
  const active = build.milestones.find(
    (milestone) => milestone.status === "in_progress"
  );
  const visit = build.siteVisits?.find(
    (siteVisit) => siteVisit.milestoneKey === active?.key
  );
  const selectedMilestone = selectedMilestoneKey
    ? (build.milestones.find(
        (milestone) => milestone.key === selectedMilestoneKey
      ) ?? null)
    : null;
  const publicUpdates =
    (build as RepresentativeBuildWithPublicUpdates).notes?.public ?? [];

  const toggleMilestone = (milestoneKey: string) => {
    setExpandedMilestoneKeys((current) => {
      const next = new Set(current);
      if (next.has(milestoneKey)) {
        next.delete(milestoneKey);
      } else {
        next.add(milestoneKey);
      }
      return next;
    });
  };

  return (
    <main
      className="min-h-full px-4 pt-5 pb-28 sm:px-6"
      data-testid="lender-build-overview-variant-c"
    >
      <div className="mx-auto grid w-full max-w-[1540px] gap-6 2xl:min-h-[calc(100vh-6.5rem)] 2xl:grid-cols-[12rem_minmax(0,1fr)] 2xl:gap-8">
        <aside className="min-w-0 2xl:pt-2">
          <nav
            aria-label="Build Detail sections"
            className="grid grid-cols-2 gap-1 sm:grid-cols-5 2xl:sticky 2xl:top-20 2xl:grid-cols-1"
          >
            <p className="col-span-full mb-2 hidden font-medium text-muted-foreground text-xs 2xl:block">
              Sections
            </p>
            <ConsoleNavLink href="#c-overview" icon={<Building2 />}>
              Overview
            </ConsoleNavLink>
            <ConsoleNavLink href="#c-milestones" icon={<FolderKanban />}>
              Milestone records
            </ConsoleNavLink>
            <ConsoleNavLink href="#c-draws" icon={<Banknote />}>
              Draw records
            </ConsoleNavLink>
            <ConsoleNavLink href="#c-evidence" icon={<FileCheck2 />}>
              Review evidence
            </ConsoleNavLink>
            <ConsoleNavLink href="#c-collaboration" icon={<MessageCircle />}>
              Collaboration
            </ConsoleNavLink>
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-xl">
                  {build.build.buildName}
                </h1>
                <Badge variant="secondary">Assigned</Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                Lender Build Detail
              </p>
            </div>
            <ReviewNavigation quiet showDescription={false} />
          </header>

          <div className="divide-y">
            <section className="py-6" id="c-overview">
              <h2 className="font-semibold text-sm">Overview</h2>
              <BuildIdentity
                build={build}
                className="mt-5 sm:grid-cols-2 xl:grid-cols-4"
              />
            </section>

            <section className="py-6" id="c-milestones">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 className="font-semibold text-sm">Milestone records</h2>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Current construction progress.
                  </p>
                </div>
                <Badge variant="outline">
                  {
                    build.milestones.filter(
                      (item) => item.status === "complete"
                    ).length
                  }{" "}
                  complete ·{" "}
                  {
                    build.milestones.filter(
                      (item) => item.status === "in_progress"
                    ).length
                  }{" "}
                  active
                </Badge>
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Milestone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28 whitespace-normal leading-tight">
                        Recorded progress
                      </TableHead>
                      <TableHead className="w-36 whitespace-normal leading-tight">
                        Receipt / invoice coverage
                      </TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Date range</TableHead>
                      <TableHead className="w-32 whitespace-normal leading-tight">
                        Review evidence
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {build.milestones.map((milestone) => {
                      const expanded = expandedMilestoneKeys.has(milestone.key);
                      const dateRange = milestoneDateRange(build, milestone);
                      const submilestones = build.submilestones
                        .filter((item) => item.milestoneKey === milestone.key)
                        .sort((left, right) => left.order - right.order);

                      return (
                        <Fragment key={milestone._id}>
                          <TableRow>
                            <TableCell className="min-w-56 font-medium">
                              <div className="flex items-center gap-1.5">
                                <button
                                  aria-controls={`milestone-breakdown-${milestone.key}`}
                                  aria-expanded={expanded}
                                  aria-label={`${expanded ? "Collapse" : "Expand"} ${milestone.name} Sub-milestones`}
                                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => toggleMilestone(milestone.key)}
                                  type="button"
                                >
                                  <ChevronDown
                                    aria-hidden="true"
                                    className={cn(
                                      "size-3.5 transition-transform",
                                      expanded && "rotate-180"
                                    )}
                                  />
                                </button>
                                <button
                                  className="rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() =>
                                    setSelectedMilestoneKey(milestone.key)
                                  }
                                  type="button"
                                >
                                  {milestone.name}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className="min-w-28">
                              <span className="inline-flex items-center gap-2">
                                <StatusDot status={milestone.status} />
                                {statusLabel(milestone.status)}
                              </span>
                            </TableCell>
                            <TableCell className="min-w-28 tabular-nums">
                              {milestone.progressPercent ?? 0}%
                            </TableCell>
                            <TableCell className="min-w-36">
                              <span className="block text-muted-foreground text-xs">
                                Not recorded
                              </span>
                            </TableCell>
                            <TableCell className="min-w-24 font-medium tabular-nums">
                              {formatWholeCents(milestone.budgetCents)}
                            </TableCell>
                            <TableCell className="min-w-44">
                              <span className="block whitespace-nowrap text-xs tabular-nums">
                                {dateRange.start} – {dateRange.end}
                              </span>
                              <span className="mt-0.5 block text-muted-foreground text-xs">
                                {dateRange.source}
                              </span>
                            </TableCell>
                            <TableCell className="min-w-36 text-muted-foreground text-xs">
                              {milestone.status === "in_progress"
                                ? (milestone.evidenceState ?? "Not recorded")
                                : "—"}
                            </TableCell>
                          </TableRow>
                          {expanded ? (
                            <TableRow
                              className="bg-muted/25 hover:bg-muted/25"
                              id={`milestone-breakdown-${milestone.key}`}
                            >
                              <TableCell className="p-0" colSpan={7}>
                                <SubmilestoneBreakdown
                                  build={build}
                                  milestone={milestone}
                                  submilestones={submilestones}
                                />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-3 text-muted-foreground text-xs">
                Receipt and invoice coverage appears when cost documents are
                attached to a Milestone review.
              </p>
            </section>

            <section className="py-6" id="c-draws">
              <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <h2 className="font-semibold text-sm">Funding position</h2>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Available across this Build.
                  </p>
                  <div className="mt-4">
                    <PooledFundingPosition />
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm">Draw records</h2>
                  <div className="mt-2 overflow-x-auto">
                    <DrawRecordsTable compact />
                  </div>
                </div>
              </div>
            </section>

            <section className="py-6" id="c-evidence">
              <h2 className="font-semibold text-sm">Review evidence</h2>
              <p className="mt-1 text-muted-foreground text-xs">
                Evidence attached to the active Milestone and Draw records.
              </p>
              <div className="mt-4 grid gap-x-8 md:grid-cols-2">
                <EvidenceLedgerRow
                  icon={<ClipboardCheck />}
                  label={`Milestone · ${active?.name ?? "Current"}`}
                  title={active?.evidenceState ?? "No evidence state recorded"}
                >
                  {visit
                    ? `Site Visit ${statusLabel(visit.status).toLowerCase()}: ${visit.note}`
                    : "No Site Visit context attached to this Milestone review."}
                </EvidenceLedgerRow>
                <EvidenceLedgerRow
                  icon={<FileCheck2 />}
                  label={`Draw · ${currentDraw?.displayId}`}
                  title={
                    currentDraw?.evidence[0]?.label ??
                    "No evidence state recorded"
                  }
                >
                  {currentDraw?.evidence
                    .slice(1)
                    .map((fact) => fact.label)
                    .join(" · ")}
                </EvidenceLedgerRow>
              </div>
            </section>

            <section className="py-6" id="c-collaboration">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 className="font-semibold text-sm">Collaboration</h2>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Participant-visible updates for this Build.
                  </p>
                </div>
                <Badge variant="outline">Read-only</Badge>
              </div>
              <div className="mt-4 divide-y border-y">
                {publicUpdates.length > 0 ? (
                  publicUpdates.map((update) => (
                    <article className="flex gap-3 py-4" key={update._id}>
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <MessageCircle aria-hidden="true" className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="font-medium text-sm">Builder team</p>
                          <time
                            className="text-muted-foreground text-xs"
                            dateTime={new Date(update.createdAt).toISOString()}
                          >
                            {formatCompactDate(update.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1 max-w-[72ch] text-sm leading-6">
                          {update.body}
                        </p>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="py-5 text-muted-foreground text-sm">
                    No participant-visible updates have been posted.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <MilestoneReviewSheet
        build={build}
        milestone={selectedMilestone}
        onClose={() => setSelectedMilestoneKey(null)}
      />
    </main>
  );
}

function SubmilestoneBreakdown({
  build,
  milestone,
  submilestones,
}: {
  build: RepresentativeBuild;
  milestone: RepresentativeMilestone;
  submilestones: RepresentativeBuild["submilestones"];
}) {
  return (
    <div className="px-4 py-4 sm:pl-12">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-medium text-xs">Sub-milestone breakdown</p>
        <span className="text-muted-foreground text-xs">
          {submilestones.length} record{submilestones.length === 1 ? "" : "s"}
        </span>
      </div>
      {submilestones.length > 0 ? (
        <div className="divide-y border-y">
          {submilestones.map((submilestone) => {
            const dateRange = submilestoneDateRange(
              build,
              milestone,
              submilestone
            );
            return (
              <div
                className="grid gap-3 py-3 text-xs sm:grid-cols-[minmax(12rem,1.4fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)_minmax(13rem,1fr)] sm:items-center"
                key={submilestone._id}
              >
                <p className="font-medium">{submilestone.name}</p>
                <p className="inline-flex items-center gap-2">
                  <StatusDot status={submilestone.status} />
                  {statusLabel(submilestone.status)}
                </p>
                <p className="tabular-nums">
                  {submilestone.budgetCents && submilestone.budgetCents > 0
                    ? formatWholeCents(submilestone.budgetCents)
                    : "Not allocated"}
                </p>
                <p>
                  <span className="block whitespace-nowrap tabular-nums">
                    {dateRange.start} – {dateRange.end}
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {dateRange.source}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="border-y py-4 text-muted-foreground text-xs">
          No Sub-milestone records are attached.
        </p>
      )}
    </div>
  );
}

function MilestoneReviewSheet({
  build,
  milestone,
  onClose,
}: {
  build: RepresentativeBuild;
  milestone: RepresentativeMilestone | null;
  onClose: () => void;
}) {
  if (!milestone) {
    return null;
  }

  const dateRange = milestoneDateRange(build, milestone);
  const submilestones = build.submilestones
    .filter((item) => item.milestoneKey === milestone.key)
    .sort((left, right) => left.order - right.order);
  const visit = build.siteVisits?.find(
    (siteVisit) => siteVisit.milestoneKey === milestone.key
  );

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetPopup className="w-full sm:max-w-[720px]" side="right">
        <SheetHeader className="border-b px-5 py-5 sm:px-6">
          <div className="pr-8">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>{milestone.name}</SheetTitle>
              <Badge variant="outline">Read-only</Badge>
            </div>
            <SheetDescription className="mt-1">
              Milestone detail and review record
            </SheetDescription>
          </div>
        </SheetHeader>
        <SheetPanel className="px-5 sm:px-6">
          <section className="py-5">
            <h2 className="font-semibold text-sm">Milestone record</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <MilestoneSheetFact label="Status">
                <span className="inline-flex items-center gap-2">
                  <StatusDot status={milestone.status} />
                  {statusLabel(milestone.status)}
                </span>
              </MilestoneSheetFact>
              <MilestoneSheetFact label="Recorded progress">
                <span className="tabular-nums">
                  {milestone.progressPercent ?? 0}%
                </span>
              </MilestoneSheetFact>
              <MilestoneSheetFact label="Budget">
                <span className="tabular-nums">
                  {formatWholeCents(milestone.budgetCents)}
                </span>
              </MilestoneSheetFact>
              <MilestoneSheetFact label="Date range">
                <span className="block tabular-nums">
                  {dateRange.start} – {dateRange.end}
                </span>
                <span className="mt-0.5 block font-normal text-muted-foreground text-xs">
                  {dateRange.source}
                </span>
              </MilestoneSheetFact>
            </dl>
          </section>

          <Separator />

          <section className="py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-sm">Sub-milestones</h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  Recorded child scope for this Milestone.
                </p>
              </div>
              <Badge variant="outline">{submilestones.length}</Badge>
            </div>
            <div className="mt-4 divide-y border-y">
              {submilestones.length > 0 ? (
                submilestones.map((submilestone) => {
                  const submilestoneRange = submilestoneDateRange(
                    build,
                    milestone,
                    submilestone
                  );
                  return (
                    <div
                      className="grid gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      key={submilestone._id}
                    >
                      <div>
                        <p className="font-medium">{submilestone.name}</p>
                        <p className="mt-1 text-muted-foreground text-xs tabular-nums">
                          {submilestoneRange.start} – {submilestoneRange.end} ·{" "}
                          {submilestoneRange.source}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-2 text-xs">
                        <StatusDot status={submilestone.status} />
                        {statusLabel(submilestone.status)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="py-4 text-muted-foreground text-sm">
                  No Sub-milestone records are attached.
                </p>
              )}
            </div>
          </section>

          <Separator />

          <section className="py-5">
            <h2 className="font-semibold text-sm">Review context</h2>
            <div className="mt-4 divide-y border-y">
              <MilestoneReviewContextRow
                icon={<ReceiptText />}
                label="Receipt / invoice coverage"
                value="Not recorded"
              />
              <MilestoneReviewContextRow
                icon={<FileCheck2 />}
                label="Review evidence"
                value={milestone.evidenceState ?? "Not recorded"}
              />
              <MilestoneReviewContextRow
                icon={<CalendarDays />}
                label="Site Visit"
                value={
                  visit
                    ? `${statusLabel(visit.status)} · ${visit.note}`
                    : "No Site Visit attached"
                }
              />
            </div>
          </section>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

function MilestoneSheetFact({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium text-sm">{children}</dd>
    </div>
  );
}

function MilestoneReviewContextRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-0.5 text-sm">{value}</p>
      </div>
    </div>
  );
}

function ConsoleNavLink({
  children,
  href,
  icon,
}: {
  children: ReactNode;
  href: string;
  icon: ReactNode;
}) {
  return (
    <a
      className="group flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-muted-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      <span className="[&_svg]:size-3.5">{icon}</span>
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function EvidenceLedgerRow({
  children,
  icon,
  label,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <article className="flex gap-3 border-t py-4 first:border-t-0 first:pt-0">
      <div className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 font-medium text-sm">{title}</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          {children}
        </p>
      </div>
    </article>
  );
}
