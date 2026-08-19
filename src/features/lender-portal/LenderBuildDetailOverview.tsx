"use client";

import type { FunctionReturnType } from "convex/server";
import {
  Banknote,
  Building2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "#/features/backoffice-build-detail/MilestoneDetailSheet.tsx";
import { LenderMilestoneSiteVisitCompletion } from "#/features/lender-portal/LenderMilestoneSiteVisitCompletion.tsx";
import { cn } from "#/lib/utils.ts";
import type { api } from "../../../convex/_generated/api";

export type LenderBuildDetailData = FunctionReturnType<
  typeof api.lender_portal.getLenderBuildDetail
>;

type Milestone = LenderBuildDetailData["milestones"][number];

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  maximumFractionDigits: 0,
  style: "currency",
});
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const NAME_PARTS_PATTERN = /\s+/;

function formatMoney(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function formatDate(value: number | string) {
  const date =
    typeof value === "number"
      ? new Date(value)
      : new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : dateFormatter.format(date);
}

function statusLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function milestoneDateRange(milestone: Milestone) {
  return {
    end: formatDate(milestone.actualCompletedAt ?? milestone.plannedEndDate),
    source:
      milestone.actualStartedAt && milestone.actualCompletedAt
        ? "Actual"
        : milestone.actualStartedAt
          ? "Actual start · planned end"
          : milestone.actualCompletedAt
            ? "Planned start · actual end"
            : "Planned",
    start: formatDate(milestone.actualStartedAt ?? milestone.plannedStartDate),
  };
}

function receiptCoverageLabel(milestone: Milestone) {
  switch (milestone.receiptCoverage.state) {
    case "not_required":
      return "Not required";
    case "not_recorded":
      return "Not recorded";
    case "partial":
      return (
        formatMoney(milestone.receiptCoverage.documentedCents) +
        " of " +
        formatMoney(milestone.receiptCoverage.actualCostCents ?? 0)
      );
    case "covered":
      return `${formatMoney(milestone.receiptCoverage.documentedCents)} recorded`;
  }
}

export function LenderBuildDetailOverview({
  detail,
}: {
  detail: LenderBuildDetailData;
}) {
  const [expandedMilestoneKeys, setExpandedMilestoneKeys] = useState<
    Set<string>
  >(() => new Set());
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState<
    string | null
  >(null);
  const selectedMilestone =
    detail.milestones.find((item) => item.key === selectedMilestoneKey) ?? null;
  const activeMilestone =
    detail.milestones.find((item) => item.status === "in_progress") ?? null;

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
      data-testid="production-lender-build-detail"
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
            <ConsoleNavLink href="#build-overview" icon={<Building2 />}>
              Overview
            </ConsoleNavLink>
            <ConsoleNavLink href="#build-milestones" icon={<ClipboardCheck />}>
              Milestone records
            </ConsoleNavLink>
            <ConsoleNavLink href="#build-draws" icon={<Banknote />}>
              Draw records
            </ConsoleNavLink>
            <ConsoleNavLink href="#build-evidence" icon={<FileCheck2 />}>
              Review evidence
            </ConsoleNavLink>
            <ConsoleNavLink
              href="#build-collaboration"
              icon={<MessageCircle />}
            >
              Collaboration
            </ConsoleNavLink>
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-balance break-words font-semibold text-xl">
                  {detail.build.buildName}
                </h1>
                <Badge variant="secondary">Assigned</Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                Lender Build Detail
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                render={
                  <a
                    aria-label="Open Milestone queue"
                    href="/lender/milestones"
                  >
                    <span className="sr-only">Open Milestone queue</span>
                  </a>
                }
                size="sm"
                variant="outline"
              >
                Open Milestone queue
              </Button>
              <Button
                render={
                  <a aria-label="Open Draw queue" href="/lender/draws">
                    <span className="sr-only">Open Draw queue</span>
                  </a>
                }
                size="sm"
                variant="outline"
              >
                Open Draw queue
              </Button>
            </div>
          </header>

          <div className="divide-y">
            <section className="py-6" id="build-overview">
              <h2 className="font-semibold text-sm">Overview</h2>
              <BuildIdentity detail={detail} />
            </section>

            <section className="py-6" id="build-milestones">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 className="font-semibold text-sm">Milestone records</h2>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Construction progress, submitted costs, and evidence.
                  </p>
                </div>
                <Badge variant="outline">
                  {
                    detail.milestones.filter(
                      (item) => item.status === "complete"
                    ).length
                  }{" "}
                  complete ·{" "}
                  {
                    detail.milestones.filter(
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
                    {detail.milestones.map((milestone) => {
                      const expanded = expandedMilestoneKeys.has(milestone.key);
                      const dates = milestoneDateRange(milestone);
                      return (
                        <Fragment key={milestone.buildMilestoneId}>
                          <TableRow>
                            <TableCell className="min-w-56 font-medium">
                              <div className="flex items-center gap-1.5">
                                <button
                                  aria-controls={`milestone-breakdown-${milestone.key}`}
                                  aria-expanded={expanded}
                                  aria-label={
                                    (expanded ? "Collapse " : "Expand ") +
                                    milestone.name +
                                    " Sub-milestones"
                                  }
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
                            <TableCell className="min-w-36 text-xs">
                              {receiptCoverageLabel(milestone)}
                            </TableCell>
                            <TableCell className="min-w-24 font-medium tabular-nums">
                              {formatMoney(milestone.budgetCents)}
                            </TableCell>
                            <TableCell className="min-w-44">
                              <span className="block whitespace-nowrap text-xs tabular-nums">
                                {dates.start} – {dates.end}
                              </span>
                              <span className="mt-0.5 block text-muted-foreground text-xs">
                                {dates.source}
                              </span>
                            </TableCell>
                            <TableCell className="min-w-36 text-muted-foreground text-xs">
                              {milestone.reviewEvidence.length > 0
                                ? milestone.reviewEvidence.length +
                                  " attached file" +
                                  (milestone.reviewEvidence.length === 1
                                    ? ""
                                    : "s")
                                : "Not recorded"}
                            </TableCell>
                          </TableRow>
                          {expanded ? (
                            <TableRow
                              className="bg-muted/25 hover:bg-muted/25"
                              id={`milestone-breakdown-${milestone.key}`}
                            >
                              <TableCell className="p-0" colSpan={7}>
                                <SubmilestoneBreakdown
                                  buildStartDate={detail.build.startDate}
                                  milestone={milestone}
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
            </section>

            <section className="py-6" id="build-draws">
              <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <FundingPosition detail={detail} />
                <DrawRecords detail={detail} />
              </div>
            </section>

            <section className="py-6" id="build-evidence">
              <h2 className="font-semibold text-sm">Review evidence</h2>
              <p className="mt-1 text-muted-foreground text-xs">
                Files and Site Visit facts attached to current Milestone review
                cycles.
              </p>
              <div className="mt-4 divide-y border-y">
                {activeMilestone ? (
                  <EvidenceRecord milestone={activeMilestone} />
                ) : (
                  <p className="py-5 text-muted-foreground text-sm">
                    No active Milestone review evidence is available.
                  </p>
                )}
              </div>
            </section>

            <section className="py-6" id="build-collaboration">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h2 className="font-semibold text-sm">Collaboration</h2>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Participant-visible Build-wide updates.
                  </p>
                </div>
                <Badge variant="outline">Read-only</Badge>
              </div>
              <div className="mt-4 divide-y border-y">
                {detail.collaboration.length > 0 ? (
                  detail.collaboration.map((update) => (
                    <article className="flex gap-3 py-4" key={update.postId}>
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <MessageCircle aria-hidden="true" className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="font-medium text-sm">
                            {update.sourceLabel}
                          </p>
                          <time
                            className="text-muted-foreground text-xs"
                            dateTime={new Date(
                              update.publishedAt
                            ).toISOString()}
                          >
                            {formatDate(update.publishedAt)}
                          </time>
                        </div>
                        <p className="mt-1 max-w-[72ch] whitespace-pre-wrap text-pretty break-words text-sm leading-6">
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

      {selectedMilestone ? (
        <MilestoneDetailSheet
          data={toMilestoneSheetData(detail, selectedMilestone)}
          onClose={() => setSelectedMilestoneKey(null)}
          readOnly
          reviewLayer={
            <div className="space-y-4">
              <MilestoneReviewFacts milestone={selectedMilestone} />
              <LenderMilestoneSiteVisitCompletion
                milestoneId={String(selectedMilestone.buildMilestoneId)}
              />
            </div>
          }
        />
      ) : null}
    </main>
  );
}

function BuildIdentity({ detail }: { detail: LenderBuildDetailData }) {
  return (
    <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <dt className="text-muted-foreground text-xs">Build ID</dt>
        <dd className="mt-1 break-words font-medium tabular-nums">
          {detail.build.buildId}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Location</dt>
        <dd className="mt-1 flex items-center gap-1.5 font-medium">
          <MapPin className="size-3.5 text-muted-foreground" />
          {detail.build.location}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Build state</dt>
        <dd className="mt-1">
          <Badge variant="secondary">{statusLabel(detail.build.status)}</Badge>
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Budget</dt>
        <dd className="mt-1 font-medium tabular-nums">
          {formatMoney(detail.build.totalBudgetCents)}
        </dd>
      </div>
    </dl>
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
      className="flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-muted-foreground text-xs outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      href={href}
    >
      <span className="[&_svg]:size-3.5">{icon}</span>
      <span>{children}</span>
    </a>
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

function SubmilestoneBreakdown({
  buildStartDate,
  milestone,
}: {
  buildStartDate: string;
  milestone: Milestone;
}) {
  return (
    <div className="px-4 py-4 sm:pl-12">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-medium text-xs">Sub-milestone breakdown</p>
        <span className="text-muted-foreground text-xs">
          {milestone.submilestones.length} record
          {milestone.submilestones.length === 1 ? "" : "s"}
        </span>
      </div>
      {milestone.submilestones.length > 0 ? (
        <div className="divide-y border-y">
          {milestone.submilestones.map((submilestone) => {
            const startDay = submilestone.startDay ?? milestone.dayStart;
            const endDay =
              startDay + Math.max(1, submilestone.durationDays ?? 1) - 1;
            const plannedStart = addUtcDays(buildStartDate, startDay);
            const plannedEnd = addUtcDays(buildStartDate, endDay);
            return (
              <div
                className="grid gap-3 py-3 text-xs sm:grid-cols-[minmax(12rem,1.4fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)_minmax(13rem,1fr)] sm:items-center"
                key={submilestone.submilestoneId}
              >
                <p className="font-medium">{submilestone.name}</p>
                <p className="inline-flex items-center gap-2">
                  <StatusDot status={submilestone.status} />
                  {statusLabel(submilestone.status)}
                </p>
                <p className="tabular-nums">
                  {submilestone.budgetCents > 0
                    ? formatMoney(submilestone.budgetCents)
                    : "Not allocated"}
                </p>
                <p>
                  <span className="block whitespace-nowrap tabular-nums">
                    {formatDate(submilestone.actualStartedAt ?? plannedStart)} –{" "}
                    {formatDate(submilestone.completedAt ?? plannedEnd)}
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {submilestone.actualStartedAt || submilestone.completedAt
                      ? "Actual where recorded"
                      : "Planned"}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No Sub-milestone records are available.
        </p>
      )}
    </div>
  );
}

function FundingPosition({ detail }: { detail: LenderBuildDetailData }) {
  const facts = [
    ["Facility", detail.funding.facilityCents],
    ["Unlocked", detail.funding.unlockedCents],
    ["Reserved", detail.funding.reservedCents],
    ["Available", detail.funding.availableCents],
    ["Released", detail.funding.releasedCents],
  ] as const;
  return (
    <div>
      <h2 className="font-semibold text-sm">Funding position</h2>
      <p className="mt-1 text-muted-foreground text-xs">
        Available across this Build.
      </p>
      <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {formatMoney(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DrawRecords({ detail }: { detail: LenderBuildDetailData }) {
  return (
    <div className="min-w-0">
      <h2 className="font-semibold text-sm">Draw records</h2>
      <div className="mt-2 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Draw</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.draws.map((draw) => (
              <TableRow key={draw.drawRequestId}>
                <TableCell>
                  <p className="font-medium">{draw.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {draw.displayId}
                  </p>
                </TableCell>
                <TableCell>{statusLabel(draw.status)}</TableCell>
                <TableCell>{formatDate(draw.requestedAt)}</TableCell>
                <TableCell className="font-medium tabular-nums">
                  {formatMoney(draw.amountCents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {detail.draws.length === 0 ? (
          <p className="border-b py-5 text-muted-foreground text-sm">
            No current Draw records are available.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceRecord({ milestone }: { milestone: Milestone }) {
  return (
    <article className="grid gap-4 py-4 sm:grid-cols-2">
      <div>
        <p className="text-muted-foreground text-xs">Milestone</p>
        <p className="mt-1 font-medium text-sm">{milestone.name}</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {milestone.reviewEvidence.length} attached file
          {milestone.reviewEvidence.length === 1 ? "" : "s"} ·{" "}
          {receiptCoverageLabel(milestone)}
        </p>
        {milestone.reviewEvidence.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs">
            {milestone.reviewEvidence.map((asset) => (
              <li key={asset.evidenceAssetId}>{asset.label}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Site Visit</p>
        <p className="mt-1 font-medium text-sm">
          {milestone.siteVisit
            ? formatDate(milestone.siteVisit.completedAt) +
              " · " +
              milestone.siteVisit.photoCount +
              " photo" +
              (milestone.siteVisit.photoCount === 1 ? "" : "s")
            : "No completed report attached"}
        </p>
        {milestone.siteVisit ? (
          <p className="mt-1 text-muted-foreground text-xs">
            {milestone.siteVisit.report}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function MilestoneReviewFacts({ milestone }: { milestone: Milestone }) {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold text-base">
            Lender-visible review record
          </h2>
          <p className="text-muted-foreground text-sm">
            Evidence attached to this Milestone review.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Cost coverage</dt>
            <dd className="mt-1 font-medium text-sm">
              {receiptCoverageLabel(milestone)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Evidence files</dt>
            <dd className="mt-1 font-medium text-sm">
              {milestone.reviewEvidence.length}
            </dd>
          </div>
        </dl>
        {milestone.receiptCoverage.documents.map((document) => (
          <div className="border-t pt-3 text-sm" key={document.costDocumentId}>
            <p className="font-medium">{document.label}</p>
            <p className="text-muted-foreground text-xs">
              {statusLabel(document.kind)} · {formatMoney(document.amountCents)}
            </p>
          </div>
        ))}
      </FramePanel>
    </Frame>
  );
}

export function toMilestoneSheetData(
  detail: LenderBuildDetailData,
  milestone: Milestone,
  recentEvents: MilestoneSheetData["recentEvents"] = []
): MilestoneSheetData {
  return {
    ...(milestone.actualStartedAt
      ? { actualStartedAt: milestone.actualStartedAt }
      : {}),
    column: statusLabel(milestone.status),
    contractors: milestone.contractors.map((contractor) => ({
      initials: contractor.name
        .split(NAME_PARTS_PATTERN)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join(""),
      name: contractor.name,
      role: contractor.role,
    })),
    milestoneKey: milestone.key,
    name: milestone.name,
    plannedBudgetCents: milestone.budgetCents,
    plannedEndDate: milestone.plannedEndDate,
    plannedStartDate: milestone.plannedStartDate,
    recentEvents,
    status: milestone.status,
    submilestones: milestone.submilestones.map((submilestone) => {
      const startDay = submilestone.startDay ?? milestone.dayStart;
      const endDay = startDay + Math.max(1, submilestone.durationDays ?? 1) - 1;
      return {
        ...(submilestone.actualCostCents === null
          ? {}
          : { actualCostCents: submilestone.actualCostCents }),
        ...(submilestone.actualStartedAt === null
          ? {}
          : { actualStartedAt: submilestone.actualStartedAt }),
        assignments: submilestone.assignments.map((assignment) => ({
          contractorId: String(assignment.contractorId),
          name: assignment.name,
          role: assignment.role,
          status: assignment.status,
        })),
        budgetCents: submilestone.budgetCents,
        ...(submilestone.completedAt === null
          ? {}
          : { completedAt: submilestone.completedAt }),
        costDocuments: milestone.receiptCoverage.documents.flatMap((document) =>
          document.allocations
            .filter(
              (allocation) =>
                allocation.buildSubmilestoneId === submilestone.submilestoneId
            )
            .map((allocation) => ({
              _id: String(document.costDocumentId),
              allocationAmountCents: allocation.amountCents,
              kind: document.kind,
              pages: document.pages.map((page) => ({
                assetId: String(page.assetId),
                ...(page.downloadUrl ? { downloadUrl: page.downloadUrl } : {}),
                fileName: page.fileName,
                mimeType: page.mimeType,
              })),
              ...(document.subtotalCents === null
                ? {}
                : { subtotalCents: document.subtotalCents }),
              ...(document.taxCents === null
                ? {}
                : { taxCents: document.taxCents }),
              title: document.label,
            }))
        ),
        description: submilestone.description,
        endDate: addUtcDays(detail.build.startDate, endDay),
        evidence: milestone.reviewEvidence
          .filter(
            (asset) =>
              asset.submilestoneKey === submilestone.key ||
              (asset.siteVisitId !== null &&
                milestone.siteVisits.some(
                  (visit) =>
                    visit.siteVisitId === asset.siteVisitId &&
                    visit.submilestoneId === submilestone.submilestoneId
                ))
          )
          .map((asset) => ({
            evidenceKey: String(asset.evidenceAssetId),
            fileName: asset.fileName,
            label: asset.label,
            locationVerified: asset.locationVerified,
            mimeType: asset.mimeType,
            previewUrl: asset.downloadUrl,
            sizeBytes: asset.sizeBytes,
            source: asset.source,
            tag:
              asset.source === "site_visit" ? "Site Visit" : "Review evidence",
          })),
        key: submilestone.key,
        materials: [],
        name: submilestone.name,
        order: submilestone.order,
        siteVisits: milestone.siteVisits
          .filter(
            (visit) => visit.submilestoneId === submilestone.submilestoneId
          )
          .map((visit) => ({
            completedAt: visit.completedAt,
            recordNote: visit.report,
            recordNoteFormat: "plain_text" as const,
            requestedAt: visit.requestedAt,
            status: "complete" as const,
            visitId: visit.visitId,
          })),
        startDate: addUtcDays(detail.build.startDate, startDay),
        status: submilestone.status,
        submilestoneId: submilestone.submilestoneId,
      };
    }),
  };
}

function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
