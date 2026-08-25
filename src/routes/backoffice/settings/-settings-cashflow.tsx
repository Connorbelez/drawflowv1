import { useEffect, useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  getCashflowCompoundExtent,
  TimelineCashflowCompoundChart,
  type TimelineCashflowCompoundDatum,
  type TimelineCashflowReferenceLine,
} from "#/features/timeline-workspace/-TimelineCashflowCompoundChart.tsx";
import {
  formatBps,
  formatDay,
  getActiveScenario,
  includedDurationDays,
  includedPocTotalBps,
  milestoneEndDay,
  milestoneStartDay,
  scenarioDrawTotalBps,
  TOTAL_BPS,
  type TimelineSettingsScenarioDraft,
  type TimelineSettingsTemplateDraft,
  validateScenarioDrafts,
  validateTemplateDraft,
} from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";

import {
  SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS,
  type PendingConfirmation,
  type TimelineSettingsWorkspaceLabels,
} from "./-settings-contracts.ts";
import { MetricRow } from "./-settings-primitives.tsx";
import { validateTemplateMetadata } from "./-settings-template.tsx";

export function SettingsCashflowPreview({
  scenario,
  template,
}: {
  scenario: TimelineSettingsScenarioDraft;
  template: TimelineSettingsTemplateDraft;
}) {
  const defaultStartingCash = useMemo(
    () => getSettingsStartingCashDollars(template),
    [template]
  );
  const [startingCashText, setStartingCashText] = useState(() =>
    formatDollarInputValue(defaultStartingCash)
  );
  const parsedStartingCash = parseDollarInputToDollars(startingCashText);
  const startingCash = Number.isFinite(parsedStartingCash)
    ? parsedStartingCash
    : defaultStartingCash;
  const data = useMemo(
    () => buildSettingsCashflowChartData(template, scenario, startingCash),
    [scenario, startingCash, template]
  );
  const scheduleReferenceLines = useMemo(
    () => buildSettingsScheduleReferenceLines(template, scenario),
    [scenario, template]
  );
  const extent = getCashflowCompoundExtent(data);
  const maxDay = Math.max(30, ...data.map((row) => row.day));
  const ticks = buildCashflowTicks(maxDay);

  useEffect(() => {
    setStartingCashText(formatDollarInputValue(defaultStartingCash));
  }, [defaultStartingCash, template.templateKey]);

  return (
    <FramePanel className="overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b bg-muted/40 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold">Cash on hand vs milestone cost</h3>
          <p className="text-muted-foreground text-sm">
            Benchmarked against a{" "}
            {formatCompactDollarLabel(SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS)}{" "}
            sample budget; starting cash covers the first milestone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            Sample budget:{" "}
            {formatCompactDollarLabel(SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS)}
          </Badge>
          <label className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-warning/35 bg-warning/10 px-2 py-1 font-medium text-[11px] text-warning-foreground">
            <span>Starting cash:</span>
            <Input
              aria-label="Preview starting cash"
              className="h-6 w-24 rounded-md border-warning/35 bg-background/80 text-xs shadow-none"
              data-testid="timeline-settings-preview-starting-cash"
              inputMode="decimal"
              nativeInput
              onBlur={() => {
                setStartingCashText(formatDollarInputValue(startingCash));
              }}
              onChange={(event) => {
                const nextStartingCash = parseDollarInputToDollars(
                  event.target.value
                );
                setStartingCashText(
                  Number.isFinite(nextStartingCash)
                    ? formatDollarInputValue(nextStartingCash)
                    : event.target.value
                );
              }}
              value={startingCashText}
            />
            <span
              className="text-warning-foreground/75"
              data-testid="timeline-settings-preview-starting-cash-compact"
            >
              {formatCompactDollarLabel(startingCash)}
            </span>
          </label>
        </div>
      </div>
      <div
        aria-label="Schedule marker legend"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/70 px-4 py-2 text-muted-foreground text-xs"
      >
        <ScheduleMarkerLegend
          color="oklch(0.58 0.18 160)"
          label="Milestone start"
        />
        <ScheduleMarkerLegend
          color="oklch(0.67 0.18 275)"
          label="Milestone end"
        />
        <ScheduleMarkerLegend
          color="oklch(0.62 0.18 245)"
          label="Draw unlock"
        />
      </div>
      <TimelineCashflowCompoundChart
        barSize={22}
        chartMargin={{ bottom: 0, left: 0, right: 12, top: 92 }}
        className="h-[420px] min-w-0"
        data={data}
        hideDrawReferenceLines
        hideMilestoneEndReferenceLines
        referenceLines={scheduleReferenceLines}
        testId="timeline-settings-cashflow-compound-chart"
        xDomain={[0, maxDay]}
        xTicks={ticks}
        yAxisWidth={64}
        yDomain={[extent.min, extent.max]}
      />
    </FramePanel>
  );
}

function ScheduleMarkerLegend({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export function ConfirmationModal({
  canSave,
  isCreate,
  kind,
  labels,
  metadataValidation,
  onClose,
  onConfirm,
  saving,
  scenario,
  scenarioValidation,
  template,
  templateValidation,
}: {
  canSave: boolean;
  isCreate: boolean;
  kind: PendingConfirmation;
  labels: TimelineSettingsWorkspaceLabels;
  metadataValidation: ReturnType<typeof validateTemplateMetadata>;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  scenario: TimelineSettingsScenarioDraft | null;
  scenarioValidation: ReturnType<typeof validateScenarioDrafts>;
  template: TimelineSettingsTemplateDraft | null;
  templateValidation: ReturnType<typeof validateTemplateDraft>;
}) {
  if (!kind) {
    return null;
  }
  const isSeed = kind === "seed";
  const actionLabel = isCreate ? "Create" : "Save";
  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/60 p-6 pt-24 backdrop-blur-sm">
      <FramePanel className="mx-auto grid max-h-[calc(100vh-8rem)] w-full max-w-4xl gap-4 overflow-auto bg-popover p-6 text-popover-foreground shadow-2xl">
        <div>
          <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
            {isSeed
              ? "Confirm seed defaults"
              : `Confirm template ${actionLabel.toLowerCase()}`}
          </div>
          <h2 className="mt-1 font-semibold text-2xl">
            {isSeed
              ? labels.seedConfirmTitle
              : `${actionLabel} ${template?.title ?? "template"}?`}
          </h2>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {isSeed
              ? labels.seedConfirmBody
              : `This single ${actionLabel.toLowerCase()} commits the canonical milestone template and all draw scenario changes attached to the selected template.`}
          </p>
        </div>
        {!isSeed && template ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
                Milestone template
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <MetricRow
                  label="Included"
                  value={`${template.milestones.filter((row) => row.included).length} milestones`}
                />
                <MetricRow
                  label="Total PoC"
                  value={formatBps(includedPocTotalBps(template))}
                />
                <MetricRow
                  label="Total duration"
                  value={formatDay(includedDurationDays(template))}
                />
                <MetricRow
                  label="Warnings"
                  value={templateValidation.warnings[0] ?? "None"}
                />
              </dl>
            </Card>
            <Card className="p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
                Draw scenarios
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <MetricRow
                  label="Changed scenarios"
                  value={`${template.scenarios.length} attached to ${template.title}`}
                />
                <MetricRow
                  label="Active scenario"
                  value={getActiveScenario(template)?.name ?? "Missing"}
                />
                <MetricRow
                  label="Selected draw total"
                  value={
                    scenario
                      ? formatBps(scenarioDrawTotalBps(scenario))
                      : "0.00%"
                  }
                />
                <MetricRow
                  label="Preview cash"
                  value="$0 starting cash assumption"
                />
              </dl>
            </Card>
          </div>
        ) : null}
        {isSeed || (canSave && scenarioValidation.ok) ? null : (
          <FramePanel className="border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
            {Object.values(metadataValidation.errors)[0] ??
              Object.values(templateValidation.errors)[0] ??
              Object.values(scenarioValidation.errors)[0] ??
              "Resolve validation before saving."}
          </FramePanel>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={saving || !(isSeed || canSave)} onClick={onConfirm}>
            {saving
              ? "Working..."
              : isSeed
                ? "Confirm seed"
                : `Confirm ${actionLabel.toLowerCase()}`}
          </Button>
        </div>
      </FramePanel>
    </div>
  );
}

export function updateScenario(
  template: TimelineSettingsTemplateDraft,
  scenarioKey: string,
  patch: Partial<TimelineSettingsScenarioDraft>
): TimelineSettingsTemplateDraft {
  return {
    ...template,
    scenarios: template.scenarios.map((scenario) =>
      scenario.scenarioKey === scenarioKey
        ? { ...scenario, ...patch }
        : scenario
    ),
  };
}

export function buildSettingsCashflowChartData(
  template: TimelineSettingsTemplateDraft,
  scenario: TimelineSettingsScenarioDraft | null,
  startingCash = getSettingsStartingCashDollars(template)
): TimelineCashflowCompoundDatum[] {
  let cashOnHand = startingCash;
  const projectBudgetDollars = SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS;
  const includedMilestones = template.milestones
    .filter((row) => row.included)
    .slice()
    .sort((a, b) => a.order - b.order);
  const events = [
    ...includedMilestones.map((milestone, index) => {
      const startDay = milestoneStartDay(includedMilestones, index);
      const endDay = milestoneEndDay(includedMilestones, index);

      return {
        amount: Math.round(
          (projectBudgetDollars * milestone.percentageBps) / TOTAL_BPS
        ),
        day: startDay,
        id: `milestone:${milestone.milestoneKey}`,
        milestoneEndDay: endDay,
        name: milestone.name,
        type: "milestone" as const,
      };
    }),
    ...(scenario?.draws ?? [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((draw) => ({
        amount: Math.round((projectBudgetDollars * draw.amountBps) / TOTAL_BPS),
        day: draw.timingDay,
        id: `draw:${draw.drawKey}`,
        name: draw.label,
        type: "draw" as const,
      })),
  ].sort((a, b) => a.day - b.day || a.type.localeCompare(b.type));

  const data: TimelineCashflowCompoundDatum[] = [
    {
      budget: 0,
      capitalSpikeAmount: 0,
      cashOnHand: startingCash,
      day: 0,
      event: "start",
      id: "start",
      name: "Starting cash",
    },
  ];

  for (const event of events) {
    cashOnHand += event.type === "draw" ? event.amount : -event.amount;
    data.push({
      budget: event.type === "milestone" ? event.amount : 0,
      capitalSpikeAmount: 0,
      cashOnHand,
      day: event.day,
      event: event.type === "draw" ? "draw" : "milestone",
      id: event.id,
      milestoneEndDay:
        event.type === "milestone" ? event.milestoneEndDay : undefined,
      name: event.name,
    });
  }

  return data;
}

export function buildSettingsScenarioScheduleRows(
  template: TimelineSettingsTemplateDraft,
  scenario: TimelineSettingsScenarioDraft
) {
  const includedMilestones = template.milestones
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey)
    );

  return scenario.draws.map((draw) => {
    const milestone = includedMilestones[draw.order];
    const milestoneIndex = milestone ? draw.order : -1;

    return {
      draw,
      milestone,
      milestoneEnd:
        milestoneIndex >= 0
          ? milestoneEndDay(includedMilestones, milestoneIndex)
          : null,
      milestoneStart:
        milestoneIndex >= 0
          ? milestoneStartDay(includedMilestones, milestoneIndex)
          : null,
    };
  });
}

export function buildSettingsScheduleReferenceLines(
  template: TimelineSettingsTemplateDraft,
  scenario: TimelineSettingsScenarioDraft
): TimelineCashflowReferenceLine[] {
  return buildSettingsScenarioScheduleRows(template, scenario).flatMap(
    ({ draw, milestone, milestoneEnd, milestoneStart }) => {
      const ordinal = draw.order + 1;
      const markers: TimelineCashflowReferenceLine[] = [];

      if (milestone && milestoneStart !== null) {
        markers.push({
          label: `M${ordinal} · Day ${milestoneStart}`,
          labelOffsetY: -52,
          opacity: 0.64,
          stroke: "oklch(0.58 0.18 160)",
          strokeDasharray: "2 4",
          x: milestoneStart,
        });
      }
      if (milestone && milestoneEnd !== null) {
        markers.push({
          label: `M${ordinal} · Day ${milestoneEnd}`,
          labelOffsetY: -28,
          opacity: 0.64,
          stroke: "oklch(0.67 0.18 275)",
          strokeDasharray: "5 4",
          x: milestoneEnd,
        });
      }
      markers.push({
        label: `D${ordinal} · Day ${draw.timingDay}`,
        labelOffsetY: -4,
        opacity: 0.64,
        stroke: "oklch(0.62 0.18 245)",
        strokeDasharray: "3 4",
        x: draw.timingDay,
      });

      return markers;
    }
  );
}

function getSettingsStartingCashDollars(
  template: TimelineSettingsTemplateDraft
) {
  const firstMilestone = template.milestones
    .filter((row) => row.included)
    .slice()
    .sort((a, b) => a.order - b.order)[0];

  return firstMilestone
    ? Math.round(
        (SETTINGS_SAMPLE_PROJECT_BUDGET_DOLLARS *
          firstMilestone.percentageBps) /
          TOTAL_BPS
      )
    : 0;
}

function parseDollarInputToDollars(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : Number.NaN;
}

function formatDollarInputValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(Math.max(0, Math.round(value)));
}

function formatCompactDollarLabel(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${Number.isInteger(absolute / 1_000_000) ? String(absolute / 1_000_000) : (absolute / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 1000) {
    return `${sign}$${Math.round(absolute / 1000)}K`;
  }

  return `${sign}$${Math.round(absolute)}`;
}

function buildCashflowTicks(maxDay: number) {
  const interval = maxDay > 180 ? 45 : maxDay > 90 ? 30 : 15;
  const ticks = [0];
  for (let day = interval; day < maxDay; day += interval) {
    ticks.push(day);
  }
  ticks.push(maxDay);
  return [...new Set(ticks.map((tick) => Math.round(tick)))];
}
