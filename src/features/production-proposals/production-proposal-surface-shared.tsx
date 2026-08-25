import { AlertTriangle } from "lucide-react";
import { type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import type { TimelinePlanRow } from "#/features/builder-dashboard/BuilderTimelineDashboard.tsx";
import { DEFAULT_DRAW_REVIEW_LAG_DAYS } from "#/features/timeline-workspace/-timeline-milestone-schedule.ts";
import {
  calculateDrawAvailabilityAmount,
  type IsometricIconKey,
} from "#/features/timeline-workspace/-timeline-share-snapshot.ts";
import { type ProposalGanttDrawDraft } from "./ProductionProposalGanttWorkspace.tsx";
import type {
  ProductionProposalStatus,
  ProductionProposal,
  ProductionSubmilestone,
  ProductionDraw,
  ProductionProposalDetail,
  ProposalDrawAvailabilityViolation,
  ProductionKanbanCard,
  ProductionProposalSettings,
} from "./production-proposal-surface-contracts";

export function findProposalDrawAvailabilityViolation(
  detail: ProductionProposalDetail
): ProposalDrawAvailabilityViolation | null {
  const milestones = detail.milestones ?? [];
  const draws = [...(detail.draws ?? detail.plannedDraws ?? [])].sort(
    (a, b) =>
      a.timingDay - b.timingDay ||
      (a.order ?? Number.MAX_SAFE_INTEGER) -
        (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.drawKey.localeCompare(b.drawKey)
  );
  let scheduledCents = 0;

  for (const draw of draws) {
    const unlockedCents = milestones.reduce((total, milestone) => {
      const unlockDay = milestone.dayEnd + DEFAULT_DRAW_REVIEW_LAG_DAYS;
      if (unlockDay > draw.timingDay) {
        return total;
      }

      const availabilityCents =
        milestone.drawAvailabilityCents === undefined
          ? calculateDrawAvailabilityAmount(
              milestone.budgetCents,
              detail.proposal.borrowerCoPayBps
            )
          : Math.max(0, Math.round(milestone.drawAvailabilityCents));
      return total + availabilityCents;
    }, 0);
    const availableCents = Math.max(0, unlockedCents - scheduledCents);

    if (draw.amountCents > availableCents) {
      return {
        availableCents,
        draw,
        overageCents: draw.amountCents - availableCents,
      };
    }

    scheduledCents += draw.amountCents;
  }

  return null;
}

export function ProposalDrawAvailabilityWarning({
  detail,
}: {
  detail: ProductionProposalDetail;
}) {
  const violation = findProposalDrawAvailabilityViolation(detail);

  if (!violation) {
    return null;
  }

  return (
    <Alert
      data-testid="proposal-packet-draw-availability-warning"
      variant="warning"
    >
      <AlertTriangle aria-hidden />
      <AlertTitle>
        Generated draw schedule exceeds maximum availability
      </AlertTitle>
      <AlertDescription>
        {violation.draw.label} schedules{" "}
        {formatCents(violation.draw.amountCents)} on day{" "}
        {violation.draw.timingDay}, but only{" "}
        {formatCents(violation.availableCents)} is unlocked after the{" "}
        {DEFAULT_DRAW_REVIEW_LAG_DAYS}-day review lag. Reduce or move this draw
        by {formatCents(violation.overageCents)}.
      </AlertDescription>
    </Alert>
  );
}

export function productionProposalActionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Review action failed.";
  }
  const message = error.message.trim();
  if (!message) {
    return "Review action failed.";
  }
  const uncaughtMatch = message.match(/Uncaught Error:\s*([^\n]+)/);
  return uncaughtMatch?.[1]?.trim() || message;
}

export function isValidIanaTimezone(value: string) {
  if (!value) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function ProposalDrawScheduleSnapshot({
  draws,
}: {
  draws: ProductionDraw[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Draw</TableHead>
          <TableHead>Timing</TableHead>
          <TableHead className="text-right">Available</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {draws.map((draw) => (
          <TableRow key={draw.drawKey}>
            <TableCell>{draw.label}</TableCell>
            <TableCell>Day {draw.timingDay}</TableCell>
            <TableCell className="text-right">
              {formatCents(draw.amountCents)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ProposalLifecycleSummary({
  lifecycle,
}: {
  lifecycle: NonNullable<ProductionProposalDetail["lifecycle"]>;
}) {
  return (
    <Section title="Proposal lifecycle">
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Back Office approval</dt>
          <dd className="mt-1 font-semibold">
            {proposalLifecycleLabel(lifecycle.backOfficeApproval)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lender confirmation</dt>
          <dd className="mt-1 font-semibold">
            {proposalLifecycleLabel(lifecycle.lenderConfirmation)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Closing</dt>
          <dd className="mt-1 font-semibold">
            {proposalLifecycleLabel(lifecycle.closing)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Build activation</dt>
          <dd className="mt-1 font-semibold">
            {proposalLifecycleLabel(lifecycle.activation)}
          </dd>
        </div>
      </dl>
    </Section>
  );
}

export function proposalLifecycleLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function materialPlanningMilestones(detail: ProductionProposalDetail) {
  const submilestonesByMilestone = new Map<string, ProductionSubmilestone[]>();
  for (const submilestone of detail.submilestones ?? []) {
    const next = submilestonesByMilestone.get(submilestone.milestoneKey) ?? [];
    next.push(submilestone);
    submilestonesByMilestone.set(submilestone.milestoneKey, next);
  }
  return (detail.milestones ?? []).map((milestone) => ({
    budgetCents: milestone.budgetCents,
    key: milestone.key,
    name: milestone.name,
    order: milestone.order,
    submilestones: (submilestonesByMilestone.get(milestone.key) ?? [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((submilestone) => ({
        budgetCents: submilestone.budgetCents,
        durationDays: submilestone.durationDays,
        key: submilestone.key,
        milestoneKey: submilestone.milestoneKey,
        name: submilestone.name,
        order: submilestone.order,
      })),
  }));
}

export function draftDrawsForAvailabilityRecalculation(
  draws: ProposalGanttDrawDraft[]
): ProposalGanttDrawDraft[] {
  return draws.map((draw) => ({
    ...draw,
    amountCents: 0,
  }));
}

export function productionProposalDetailToDraftDraws(
  detail: ProductionProposalDetail
): ProposalGanttDrawDraft[] {
  return (detail.draws ?? detail.plannedDraws ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        a.timingDay - b.timingDay ||
        a.drawKey.localeCompare(b.drawKey)
    )
    .map((draw, index) => ({
      amountCents: draw.amountCents,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order ?? index + 1,
      timingDay: draw.timingDay,
    }));
}

export function allocateEvenlyCents(totalCents: number, count: number) {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(Math.max(0, Math.round(totalCents)) / count);
  let remainder = Math.max(0, Math.round(totalCents)) - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

export function toTimelineRows(
  cards: ProductionKanbanCard[]
): TimelinePlanRow[] {
  return cards.map((card) => ({
    budgetGovernance: card.budgetGovernance,
    buildName: card.buildName ?? card.title,
    buildStatus: card.buildStatus,
    buildKey: card.activeBuildId,
    builderName: card.builderName,
    drawCount: card.drawCount ?? 0,
    imageUrl: card.imageUrl,
    kind: card.activeBuildId ? "activeBuild" : "proposal",
    location: card.location,
    locationLatitude: card.locationLatitude,
    locationLongitude: card.locationLongitude,
    milestoneCount: card.milestoneCount ?? 0,
    milestonesBehindSchedule: card.milestonesBehindSchedule,
    pendingDrawRequestCount: card.pendingDrawRequestCount,
    pendingModificationRequestCount: card.pendingModificationRequestCount,
    planId: card.proposalId,
    status: card.column === "closed" ? "approved" : card.column,
    totalBudgetCents: card.totalBudgetCents,
    updatedAt: card.updatedAt,
  }));
}

export function productionTemplateToWorksheetRows(
  template: ProductionProposalSettings["templates"][number] | undefined
): TimelineMilestoneWorksheetRow[] {
  if (!template) {
    return [];
  }

  return template.milestones.map((milestone, index) => {
    const durationDays =
      milestone.durationDays ??
      Math.max(4, Math.round((milestone.percentageBps / 10_000) * 120));
    const type = milestone.type ?? milestone.archetypeKey ?? milestone.key;

    return {
      baseItemId: milestone.key,
      budgetText: formatBps(milestone.percentageBps),
      dependencyKeys: milestone.dependencyKeys ?? [],
      durationDays,
      durationText: String(durationDays),
      excluded: false,
      icon:
        milestone.icon ?? iconForMilestoneKey(milestone.key, milestone.name),
      key: milestone.key,
      name: milestone.name,
      order: index,
      percentageBps: milestone.percentageBps,
      percentageText: formatBps(milestone.percentageBps),
      siteVisitGuidance: milestone.siteVisitGuidance,
      subMilestoneDetails: milestone.submilestones.map((submilestone) => ({
        budgetText:
          submilestone.budgetCents === undefined
            ? "$0"
            : formatCents(submilestone.budgetCents),
        description: "",
        durationText: String(submilestone.durationDays ?? 1),
        id: submilestone.key,
        name: submilestone.name,
      })),
      subMilestones: milestone.submilestones.map(
        (submilestone) => submilestone.name
      ),
      type,
    };
  });
}

export function iconForMilestoneKey(
  key: string,
  name?: string
): IsometricIconKey {
  const normalized = `${key} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("foundation") || normalized.includes("site")) {
    return "foundation";
  }
  if (normalized.includes("kitchen") || normalized.includes("cabinet")) {
    return "kitchen";
  }
  if (
    normalized.includes("plumb") ||
    normalized.includes("mechanical") ||
    normalized.includes("mep")
  ) {
    return "plumbing";
  }
  if (normalized.includes("roof") || normalized.includes("dry-in")) {
    return "roofing";
  }
  if (normalized.includes("frame") || normalized.includes("shell")) {
    return "framing";
  }
  if (normalized.includes("rough")) {
    return "roughIn";
  }
  if (normalized.includes("exterior") || normalized.includes("window")) {
    return "exterior";
  }
  if (normalized.includes("finish") || normalized.includes("fixture")) {
    return "finishes";
  }
  if (normalized.includes("close")) {
    return "closeout";
  }
  if (normalized.includes("drywall")) {
    return "drywall";
  }
  return "change";
}

export function ProposalPlanMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export function Section({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b p-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

export function DetailGrid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {rows.map(([label, value]) => (
        <div className="grid gap-1" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SettingMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 font-semibold text-xl">{value}</div>
    </div>
  );
}

export function LabeledInput({
  inputMode,
  label,
  onChange,
  value,
}: {
  inputMode?: "numeric";
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

export function statusLabel(status: ProductionProposalStatus) {
  return status
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export function proposalCompactStageState(status: ProductionProposalStatus) {
  switch (status) {
    case "draft":
      return "Incomplete draft";
    case "submitted":
      return "Editing blocked while submitted";
    case "approved":
      return "Approved";
    case "closed":
      return "Closed";
  }
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function formatBps(bps: number) {
  return `${(bps / 100).toFixed(2)}% / ${bps} bps`;
}

export function calculateProposalApprovedAmountCents(
  proposal: ProductionProposal,
  draws: ProductionDraw[] = []
) {
  const totalDrawnCents = calculateProposalTotalDrawAmountCents(draws);
  return Math.max(0, proposal.lenderDrawPolicyLimitCents, totalDrawnCents);
}

export function calculateProposalTotalDrawAmountCents(
  draws: ProductionDraw[] = []
) {
  return draws.reduce(
    (total, draw) => total + Math.max(0, Math.round(draw.amountCents)),
    0
  );
}

export function formatInterestAnnualBps(value: number) {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%`;
}

export function formatInterestRateDraft(value: number) {
  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

export function parseInterestRateDraftToBps(value: string, fallback: number) {
  const normalized = value.replace(/[%\s]/g, "");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(10_000, Math.round(parsed * 100)))
    : fallback;
}

export function parseInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseRequiredInteger(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  return Number.parseInt(normalized, 10);
}

export function digitDraftValue(value: string) {
  return value.replace(/\D/g, "");
}

export function centsToDollarsInput(cents: number) {
  return String(Math.round(cents / 100));
}

export function dollarsInputToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : -1;
}

export function dollarsInputToOptionalCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : -1;
}

export function calculateUnapprovedBudgetBps(
  totalBudgetCents: number,
  approvedAmountCents: number
) {
  if (totalBudgetCents <= 0) {
    return 0;
  }
  const normalizedApprovedAmountCents = Math.max(
    0,
    Math.min(totalBudgetCents, approvedAmountCents)
  );
  return Math.max(
    0,
    Math.min(
      10_000,
      Math.round(
        ((totalBudgetCents - normalizedApprovedAmountCents) * 10_000) /
          totalBudgetCents
      )
    )
  );
}

export function normalizeDocumentType(
  value: string
): "permit" | "budget" | "plan" | "supporting" {
  if (
    value === "permit" ||
    value === "budget" ||
    value === "plan" ||
    value === "supporting"
  ) {
    return value;
  }
  return "supporting";
}
