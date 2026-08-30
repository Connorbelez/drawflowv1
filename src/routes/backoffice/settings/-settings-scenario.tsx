import { useEffect, useState } from "react";

import { CheckCircle2, Copy, Plus, Trash2 } from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import {
  formatBps,
  parsePercentToBps,
  scenarioDrawTotalBps,
  type TimelineSettingsDrawDraft,
  type TimelineSettingsScenarioDraft,
  type TimelineSettingsTemplateDraft,
  validateScenarioDrafts,
} from "#/features/timeline-workspace/-timeline-demo-settings-adapter.ts";
import { cn } from "#/lib/utils.ts";

import {
  buildSettingsScenarioScheduleRows,
  SettingsCashflowPreview,
  updateScenario,
} from "./-settings-cashflow.tsx";

export function ScenarioSettingsTab({
  onDelete,
  onDuplicate,
  onNew,
  onReset,
  onSelectScenario,
  onSetActive,
  onUpdate,
  selectedScenario,
  template,
  validation,
}: {
  onDelete: (scenario: TimelineSettingsScenarioDraft) => void;
  onDuplicate: () => void;
  onNew: () => void;
  onReset: (scenarioKey: string) => void;
  onSelectScenario: (scenarioKey: string) => void;
  onSetActive: () => void;
  onUpdate: (
    updater: (
      template: TimelineSettingsTemplateDraft
    ) => TimelineSettingsTemplateDraft
  ) => void;
  selectedScenario: TimelineSettingsScenarioDraft | null;
  template: TimelineSettingsTemplateDraft;
  validation: ReturnType<typeof validateScenarioDrafts>;
}) {
  const validationMessages = selectedScenario
    ? getScenarioValidationMessages(validation, selectedScenario.scenarioKey)
    : [];

  return (
    <div>
      <div
        className="grid gap-3 border-b bg-muted/30 p-4 xl:grid-cols-[260px_minmax(0,1fr)_auto] xl:items-center"
        data-testid="timeline-settings-scenario-header"
      >
        <div className="grid gap-1 text-sm">
          <span className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
            Scenario
          </span>
          <Select
            items={template.scenarios.map((scenario) => ({
              label: scenario.name,
              value: scenario.scenarioKey,
            }))}
            onValueChange={(value) => {
              if (typeof value === "string") {
                onSelectScenario(value);
              }
            }}
            value={selectedScenario?.scenarioKey ?? ""}
          >
            <SelectTrigger aria-label="Scenario" className="h-10 font-medium">
              <SelectValue placeholder="Select scenario" />
            </SelectTrigger>
            <SelectPopup>
              {template.scenarios.map((scenario) => (
                <SelectItem
                  key={scenario.scenarioKey}
                  value={scenario.scenarioKey}
                >
                  {scenario.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 text-sm">
          <strong>{selectedScenario?.name ?? "No scenario selected"}</strong>
          <span>{selectedScenario?.draws.length ?? 0} draws</span>
          <span>
            {selectedScenario
              ? formatBps(scenarioDrawTotalBps(selectedScenario))
              : "0.00%"}
          </span>
          {selectedScenario?.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : null}
          {selectedScenario ? (
            <span>
              Day {selectedScenario.draws[0]?.timingDay ?? 0} through day{" "}
              {selectedScenario.draws.at(-1)?.timingDay ?? 0}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedScenario ? (
            <Button
              disabled={selectedScenario.isActive}
              onClick={onSetActive}
              size="sm"
              variant="outline"
            >
              <CheckCircle2 />
              Set active
            </Button>
          ) : null}
          <Button onClick={onNew} size="sm" variant="outline">
            <Plus />
            Create
          </Button>
          <Button
            disabled={!selectedScenario}
            onClick={onDuplicate}
            size="sm"
            variant="outline"
          >
            <Copy />
            Duplicate
          </Button>
          {selectedScenario ? (
            <Button
              onClick={() => onDelete(selectedScenario)}
              size="sm"
              variant="destructive"
            >
              <Trash2 />
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      {selectedScenario ? (
        <div className="grid gap-4 p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              aria-label="Scenario name"
              onChange={(event) =>
                onUpdate((current) =>
                  updateScenario(current, selectedScenario.scenarioKey, {
                    name: event.target.value,
                  })
                )
              }
              value={selectedScenario.name}
            />
            <Input
              aria-label="Scenario description"
              onChange={(event) =>
                onUpdate((current) =>
                  updateScenario(current, selectedScenario.scenarioKey, {
                    description: event.target.value,
                  })
                )
              }
              value={selectedScenario.description}
            />
            <Button
              disabled={!selectedScenario.isDefault}
              onClick={() => onReset(selectedScenario.scenarioKey)}
              variant="outline"
            >
              Reset default
            </Button>
          </div>

          <SettingsCashflowPreview
            scenario={selectedScenario}
            template={template}
          />

          <FramePanel className="overflow-x-auto p-0">
            <Table className="min-w-[1120px]">
              <TableHeader className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-[0.08em]">
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Milestone start</TableHead>
                  <TableHead>Milestone end</TableHead>
                  <TableHead>Draw unlock</TableHead>
                  <TableHead>Amount %</TableHead>
                  <TableHead>Review note</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildSettingsScenarioScheduleRows(
                  template,
                  selectedScenario
                ).map(({ draw, milestoneEnd, milestoneStart }) => (
                  <ScenarioDrawRow
                    draw={draw}
                    key={draw.drawKey}
                    milestoneEnd={milestoneEnd}
                    milestoneStart={milestoneStart}
                    onRemove={() =>
                      onUpdate((current) =>
                        updateScenario(current, selectedScenario.scenarioKey, {
                          draws: selectedScenario.draws.filter(
                            (row) => row.drawKey !== draw.drawKey
                          ),
                        })
                      )
                    }
                    onUpdateDraw={(nextDraw) =>
                      onUpdate((current) =>
                        updateScenario(current, selectedScenario.scenarioKey, {
                          draws: selectedScenario.draws.map((row) =>
                            row.drawKey === draw.drawKey ? nextDraw : row
                          ),
                        })
                      )
                    }
                    timingError={getScenarioDrawValidationError(
                      validation,
                      selectedScenario.scenarioKey,
                      draw.drawKey,
                      "timingDayWindow"
                    )}
                  />
                ))}
              </TableBody>
            </Table>
          </FramePanel>
          <FramePanel
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 p-3 text-sm",
              validation.ok ? "bg-success/10" : "bg-destructive/10"
            )}
          >
            <Button
              onClick={() =>
                onUpdate((current) =>
                  updateScenario(current, selectedScenario.scenarioKey, {
                    draws: [
                      ...selectedScenario.draws,
                      {
                        amountBps: 0,
                        drawKey: `draw-${selectedScenario.draws.length + 1}`,
                        label: `Draw ${String(selectedScenario.draws.length + 1).padStart(2, "0")}`,
                        order: selectedScenario.draws.length,
                        reviewNote: "",
                        timingDay:
                          (selectedScenario.draws.at(-1)?.timingDay ?? 0) + 14,
                      },
                    ],
                  })
                )
              }
              variant="outline"
            >
              <Plus />
              Add draw
            </Button>
            <strong>
              Total draw percentage{" "}
              {formatBps(scenarioDrawTotalBps(selectedScenario))}
            </strong>
            {validationMessages.length > 0 ? (
              <div className="min-w-[min(100%,52rem)] text-destructive">
                <strong className="block">Resolve scenario validation</strong>
                <ul className="mt-1 grid gap-1">
                  {validationMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </FramePanel>
        </div>
      ) : null}
    </div>
  );
}

function ScenarioDrawRow({
  draw,
  milestoneEnd,
  milestoneStart,
  onRemove,
  onUpdateDraw,
  timingError,
}: {
  draw: TimelineSettingsDrawDraft;
  milestoneEnd: number | null;
  milestoneStart: number | null;
  onRemove: () => void;
  onUpdateDraw: (draw: TimelineSettingsDrawDraft) => void;
  timingError?: string;
}) {
  const [timingDayText, setTimingDayText] = useState(String(draw.timingDay));
  const [amountText, setAmountText] = useState(formatBps(draw.amountBps));
  const [editingTimingDay, setEditingTimingDay] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);

  useEffect(() => {
    if (!editingTimingDay) {
      setTimingDayText(String(draw.timingDay));
    }
  }, [draw.drawKey, draw.timingDay, editingTimingDay]);

  useEffect(() => {
    if (!editingAmount) {
      setAmountText(formatBps(draw.amountBps));
    }
  }, [draw.amountBps, draw.drawKey, editingAmount]);

  return (
    <TableRow>
      <TableCell>
        <Input
          aria-label={`${draw.label} label`}
          onChange={(event) =>
            onUpdateDraw({ ...draw, label: event.target.value })
          }
          value={draw.label}
        />
      </TableCell>
      <TableCell>
        <ScheduleDayValue
          ariaLabel={`${draw.label} milestone start day`}
          day={milestoneStart}
        />
      </TableCell>
      <TableCell>
        <ScheduleDayValue
          ariaLabel={`${draw.label} milestone end day`}
          day={milestoneEnd}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-invalid={timingError ? true : undefined}
          aria-label={`${draw.label} draw unlock day`}
          inputMode="numeric"
          onBlur={() => {
            setEditingTimingDay(false);
            setTimingDayText(String(draw.timingDay));
          }}
          onChange={(event) => {
            const nextValue = normalizeIntegerInput(event.target.value);
            setTimingDayText(nextValue);
            if (nextValue === "") {
              return;
            }
            onUpdateDraw({
              ...draw,
              timingDay: Number(nextValue),
            });
          }}
          onFocus={() => setEditingTimingDay(true)}
          pattern="[0-9]*"
          value={timingDayText}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${draw.label} amount`}
          inputMode="decimal"
          onBlur={() => {
            setEditingAmount(false);
            setAmountText(formatBps(draw.amountBps));
          }}
          onChange={(event) => {
            const nextValue = normalizePercentInput(event.target.value);
            setAmountText(nextValue);
            if (nextValue === "") {
              return;
            }
            const parsedBps = parsePercentToBps(nextValue);
            if (!Number.isFinite(parsedBps)) {
              return;
            }
            onUpdateDraw({
              ...draw,
              amountBps: parsedBps,
            });
          }}
          onFocus={() => setEditingAmount(true)}
          pattern="[0-9]*[.]?[0-9]*%?"
          value={amountText}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${draw.label} review note`}
          onChange={(event) =>
            onUpdateDraw({ ...draw, reviewNote: event.target.value })
          }
          value={draw.reviewNote}
        />
      </TableCell>
      <TableCell>{draw.order + 1}</TableCell>
      <TableCell>
        <Button onClick={onRemove} size="sm" variant="outline">
          Remove
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ScheduleDayValue({
  ariaLabel,
  day,
}: {
  ariaLabel: string;
  day: number | null;
}) {
  return (
    <Badge
      aria-label={ariaLabel}
      className="min-w-16 justify-center font-mono tabular-nums"
      variant="outline"
    >
      {day === null ? "—" : `Day ${day}`}
    </Badge>
  );
}

function getScenarioValidationMessages(
  validation: ReturnType<typeof validateScenarioDrafts>,
  scenarioKey: string
) {
  const scenarioEntries = Object.entries(validation.errors).filter(([key]) =>
    isScenarioValidationKey(key, scenarioKey)
  );
  const visibleEntries =
    scenarioEntries.length > 0
      ? scenarioEntries
      : Object.entries(validation.errors);
  const timingMessages = visibleEntries
    .filter(([key]) => key.endsWith(":timingDayWindow"))
    .map(([, message]) => message);

  if (timingMessages.length > 0) {
    return timingMessages;
  }

  return visibleEntries.map(([, message]) => message);
}

function getScenarioDrawValidationError(
  validation: ReturnType<typeof validateScenarioDrafts>,
  scenarioKey: string,
  drawKey: string,
  field: string
) {
  return validation.errors[`scenario:${scenarioKey}:draw:${drawKey}:${field}`];
}

function isScenarioValidationKey(key: string, scenarioKey: string) {
  return key === "activeScenario" || key.startsWith(`scenario:${scenarioKey}:`);
}

function normalizeIntegerInput(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePercentInput(value: string) {
  const withoutPercent = value.replaceAll("%", "");
  let normalized = "";
  let hasDecimal = false;

  for (const character of withoutPercent) {
    if (character >= "0" && character <= "9") {
      normalized += character;
      continue;
    }
    if (character === "." && !hasDecimal) {
      normalized += character;
      hasDecimal = true;
    }
  }

  if (normalized === ".") {
    return "0.";
  }

  return normalized;
}
