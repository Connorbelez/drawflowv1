"use client";

/**
 * PROTOTYPE — THROWAWAY.
 * Three variants of the milestone-start workflow, switchable via
 * `?variant=start-dialog|start-context|start-guided` on the existing
 * `/builder/builds/$buildId` route.
 *
 * DECISION — 2026-07-28: Variant A (`start-dialog`, compact confirmation)
 * is the selected production direction. The other variants remain primary
 * source evidence only and must not be promoted to production.
 *
 * The prototype reads the real Build Workspace projection, but every action
 * below is deliberately local-only and must never call a production mutation.
 */

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  CornerDownRight,
  History,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { PrototypeSwitcher } from "#/components/prototype-switcher.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface.tsx";

export type MilestoneStartPrototypeVariant =
  | "start-dialog"
  | "start-context"
  | "start-guided";

type PrototypeScenario = "ready" | "backdated" | "dependency" | "completion";

export type PrototypeEntrySource =
  | "milestone_card"
  | "calendar"
  | "gantt"
  | "submilestone"
  | "assistant";

type PrototypeLifecycle = "planned" | "in_progress" | "completion_submitted";

interface PrototypeDependency {
  key: string;
  name: string;
  status: "planned" | "in_progress";
}

interface PrototypeStartContext {
  buildName: string;
  dependencyCandidates: PrototypeDependency[];
  evidenceState: string;
  milestoneKey: string;
  plannedEndDate: string;
  plannedStartDate: string;
  progressPercent: number;
  scopeKind: "milestone" | "submilestone";
  targetKey: string;
  targetName: string;
}

interface PrototypeStartState {
  actionLog: string[];
  actualStartedAt?: string;
  actualStartedAtInput: string;
  completionSubmittedAt?: string;
  dependencyOverrideReason: string;
  entrySource: PrototypeEntrySource;
  lifecycle: PrototypeLifecycle;
  reportedAt?: string;
  scenario: PrototypeScenario;
}

const VARIANTS = [
  { label: "Compact confirmation", value: "start-dialog" as const },
  { label: "Context split", value: "start-context" as const },
  { label: "Guided field check-in", value: "start-guided" as const },
];

const SCENARIOS: Array<{
  description: string;
  label: string;
  value: PrototypeScenario;
}> = [
  {
    description: "Start now with no dependency exception.",
    label: "Ready now",
    value: "ready",
  },
  {
    description: "Report work that began earlier.",
    label: "Backdated",
    value: "backdated",
  },
  {
    description: "Record reality while prerequisites remain open.",
    label: "Dependency exception",
    value: "dependency",
  },
  {
    description: "Capture the missing start during completion.",
    label: "Completion catch-up",
    value: "completion",
  },
];

const ENTRY_SOURCES: Array<{
  label: string;
  value: PrototypeEntrySource;
}> = [
  { label: "Milestone card", value: "milestone_card" },
  { label: "Calendar", value: "calendar" },
  { label: "Gantt", value: "gantt" },
  { label: "Submilestone", value: "submilestone" },
  { label: "Assistant", value: "assistant" },
];

export function MilestoneStartWorkflowPrototype({
  detail,
  entrySource,
  milestoneKey,
  onDismiss,
  onExit,
  onVariantChange,
  open,
  submilestoneKey,
  variant,
}: {
  detail: ProductionBuildDetail;
  entrySource?: PrototypeEntrySource;
  milestoneKey?: string;
  onDismiss: () => void;
  onExit: () => void;
  onVariantChange: (variant: MilestoneStartPrototypeVariant) => void;
  open: boolean;
  submilestoneKey?: string;
  variant: MilestoneStartPrototypeVariant;
}) {
  const context = useMemo(
    () => buildPrototypeStartContext(detail, milestoneKey, submilestoneKey),
    [detail, milestoneKey, submilestoneKey]
  );
  const [state, setState] = useState<PrototypeStartState>(() =>
    stateForScenario(context, "ready", entrySource)
  );
  const [error, setError] = useState("");
  const [guidedStep, setGuidedStep] = useState(0);

  const blockers =
    state.scenario === "dependency" ? context.dependencyCandidates : [];
  const varianceDays = scheduleVarianceDays(
    state.actualStartedAtInput,
    context.plannedStartDate
  );
  const isCompletionCatchUp = state.scenario === "completion";
  const committed = Boolean(state.reportedAt);

  const changeScenario = (scenario: PrototypeScenario) => {
    setState(stateForScenario(context, scenario));
    setError("");
    setGuidedStep(0);
  };

  const commit = () => {
    const actualStartedAt = new Date(state.actualStartedAtInput);
    if (
      Number.isNaN(actualStartedAt.getTime()) ||
      actualStartedAt.getTime() > Date.now()
    ) {
      setError("Actual start must be now or earlier.");
      return false;
    }
    if (
      blockers.length > 0 &&
      state.dependencyOverrideReason.trim().length === 0
    ) {
      setError(
        "Explain why work began before the configured dependencies were complete."
      );
      return false;
    }

    const reportedAt = new Date().toISOString();
    const actualIso = actualStartedAt.toISOString();
    setError("");
    setState((current) => ({
      ...current,
      actionLog: [
        isCompletionCatchUp
          ? `Local prototype recorded ${context.scopeKind} start and completion submission atomically.`
          : blockers.length > 0
            ? `Local prototype recorded the dependency-override ${context.scopeKind} start and queued a lender alert.`
            : `Local prototype recorded the ${context.scopeKind} start without changing progress or evidence.`,
        ...current.actionLog,
      ].slice(0, 8),
      actualStartedAt: actualIso,
      completionSubmittedAt: isCompletionCatchUp ? reportedAt : undefined,
      lifecycle: isCompletionCatchUp ? "completion_submitted" : "in_progress",
      reportedAt,
    }));
    return true;
  };

  const reset = () => changeScenario(state.scenario);
  const updateState = (patch: Partial<PrototypeStartState>) =>
    setState((current) => ({ ...current, ...patch }));

  const shared: SharedVariantProps = {
    blockers,
    committed,
    context,
    error,
    isCompletionCatchUp,
    onCommit: commit,
    onDismiss,
    onReset: reset,
    onScenarioChange: changeScenario,
    onStateChange: updateState,
    state,
    varianceDays,
  };

  return (
    <>
      {open && variant === "start-dialog" ? (
        <CompactDialogVariant {...shared} />
      ) : null}
      {open && variant === "start-context" ? (
        <ContextSplitVariant {...shared} />
      ) : null}
      {open && variant === "start-guided" ? (
        <GuidedFieldVariant
          {...shared}
          onStepChange={setGuidedStep}
          step={guidedStep}
        />
      ) : null}
      <PrototypeSwitcher
        current={variant}
        onChange={onVariantChange}
        onExit={onExit}
        variants={VARIANTS}
      />
    </>
  );
}

interface SharedVariantProps {
  blockers: PrototypeDependency[];
  committed: boolean;
  context: PrototypeStartContext;
  error: string;
  isCompletionCatchUp: boolean;
  onCommit: () => boolean;
  onDismiss: () => void;
  onReset: () => void;
  onScenarioChange: (scenario: PrototypeScenario) => void;
  onStateChange: (patch: Partial<PrototypeStartState>) => void;
  state: PrototypeStartState;
  varianceDays: number;
}

function CompactDialogVariant(props: SharedVariantProps) {
  const {
    blockers,
    committed,
    context,
    error,
    isCompletionCatchUp,
    onCommit,
    onDismiss,
    onReset,
    onScenarioChange,
    onStateChange,
    state,
    varianceDays,
  } = props;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDismiss();
        }
      }}
      open
    >
      <DialogPopup
        className="max-w-xl"
        data-testid="milestone-start-prototype-dialog"
        showCloseButton={false}
      >
        <DialogHeader className="border-b">
          <PrototypeEyebrow source={state.entrySource} />
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>
              {isCompletionCatchUp ? "Add the missing start" : "Start work"}
            </DialogTitle>
            <Badge variant="outline">{context.targetKey.toUpperCase()}</Badge>
          </div>
          <DialogDescription>
            {isCompletionCatchUp
              ? `Confirm when ${context.targetName} began before submitting completion.`
              : `Record when ${context.targetName} actually began.`}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          <ScenarioPicker
            current={state.scenario}
            onChange={onScenarioChange}
          />
          {committed ? (
            <CommittedSummary
              context={context}
              onReset={onReset}
              state={state}
            />
          ) : (
            <>
              <Frame>
                <FramePanel className="grid gap-3 p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <KeyValue
                      label="Planned start"
                      value={formatShortDate(context.plannedStartDate)}
                    />
                    <KeyValue
                      label="Schedule variance"
                      value={varianceLabel(varianceDays)}
                    />
                  </div>
                  <Separator />
                  <StartDateField
                    onChange={(actualStartedAtInput) =>
                      onStateChange({ actualStartedAtInput })
                    }
                    value={state.actualStartedAtInput}
                  />
                </FramePanel>
              </Frame>
              <DependencyRequirement
                blockers={blockers}
                onChange={(dependencyOverrideReason) =>
                  onStateChange({ dependencyOverrideReason })
                }
                reason={state.dependencyOverrideReason}
              />
              {error ? (
                <Alert variant="error">
                  <AlertTriangle />
                  <AlertTitle>Cannot record yet</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <IndependentFacts context={context} />
              <PrototypeState context={context} state={state} />
            </>
          )}
        </DialogPanel>
        <DialogFooter className="pb-20 sm:pb-4">
          <Button onClick={onDismiss} variant="ghost">
            Back to milestone
          </Button>
          {committed ? (
            <Button onClick={onReset} variant="outline">
              <RotateCcw /> Reset
            </Button>
          ) : (
            <Button onClick={onCommit}>
              <Play />
              {isCompletionCatchUp
                ? "Record start & submit completion"
                : blockers.length > 0
                  ? "Record exception start"
                  : "Record start"}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ContextSplitVariant(props: SharedVariantProps) {
  const {
    blockers,
    committed,
    context,
    error,
    isCompletionCatchUp,
    onCommit,
    onDismiss,
    onReset,
    onScenarioChange,
    onStateChange,
    state,
    varianceDays,
  } = props;

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDismiss();
        }
      }}
      open
    >
      <SheetPopup
        className="max-w-[min(96vw,64rem)]"
        data-testid="milestone-start-prototype-context"
        showCloseButton={false}
        side="right"
      >
        <SheetHeader className="border-b">
          <PrototypeEyebrow source={state.entrySource} />
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{context.targetName}</SheetTitle>
            <Badge variant={committed ? "success" : "outline"}>
              {lifecycleLabel(state.lifecycle)}
            </Badge>
          </div>
          <SheetDescription>
            Compare the approved roadmap to the field report before recording
            the actual start.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
          <div className="grid content-start gap-4">
            <ScenarioPicker
              current={state.scenario}
              onChange={onScenarioChange}
            />
            <Card>
              <CardHeader className="border-b">
                <CardTitle>Roadmap context</CardTitle>
                <CardDescription>
                  The approved plan stays fixed; this declaration creates
                  actual-versus-planned variance.
                </CardDescription>
                <CardAction>
                  <Badge variant="outline">{varianceLabel(varianceDays)}</Badge>
                </CardAction>
              </CardHeader>
              <CardPanel className="grid gap-4 pt-5">
                <div className="relative grid grid-cols-[auto_1fr] gap-x-3 gap-y-4">
                  <TimelineDot icon={<CalendarClock />} tone="muted" />
                  <TimelineCopy
                    copy={formatLongDate(context.plannedStartDate)}
                    title="Approved planned start"
                  />
                  <TimelineDot icon={<Clock3 />} tone="primary" />
                  <TimelineCopy
                    copy={formatInputDateTime(state.actualStartedAtInput)}
                    title="Builder-reported actual start"
                  />
                  <TimelineDot
                    icon={blockers.length > 0 ? <ShieldAlert /> : <Check />}
                    tone={blockers.length > 0 ? "warning" : "success"}
                  />
                  <TimelineCopy
                    copy={
                      blockers.length > 0
                        ? `${blockers.length} configured prerequisite${blockers.length === 1 ? "" : "s"} incomplete`
                        : "All configured prerequisites complete"
                    }
                    title="Dependency state at report time"
                  />
                </div>
              </CardPanel>
            </Card>
            <DependencyMap blockers={blockers} context={context} />
            <Card>
              <CardHeader>
                <CardTitle>What this changes</CardTitle>
                <CardDescription>
                  The lifecycle event is deliberately narrow.
                </CardDescription>
              </CardHeader>
              <CardPanel className="grid gap-2 pt-0">
                <ChangeRow
                  after="In progress"
                  before="Planned"
                  label="Lifecycle"
                />
                <ChangeRow
                  after={`${context.progressPercent}%`}
                  before={`${context.progressPercent}%`}
                  label="Progress"
                  unchanged
                />
                <ChangeRow
                  after={context.evidenceState}
                  before={context.evidenceState}
                  label="Evidence"
                  unchanged
                />
                <ChangeRow
                  after="Unchanged"
                  before="Approved baseline"
                  label="Roadmap"
                  unchanged
                />
              </CardPanel>
            </Card>
          </div>

          <div className="grid content-start gap-4 lg:sticky lg:top-0">
            <Card>
              <CardHeader className="border-b">
                <CardTitle>
                  {isCompletionCatchUp
                    ? "Completion needs a start"
                    : "Record actual start"}
                </CardTitle>
                <CardDescription>
                  Report the field fact. Draw eligibility does not change.
                </CardDescription>
              </CardHeader>
              <CardPanel className="grid gap-4 pt-5">
                {committed ? (
                  <CommittedSummary
                    context={context}
                    onReset={onReset}
                    state={state}
                  />
                ) : (
                  <>
                    <EntrySourcePicker
                      onChange={(entrySource) => onStateChange({ entrySource })}
                      value={state.entrySource}
                    />
                    <StartDateField
                      onChange={(actualStartedAtInput) =>
                        onStateChange({ actualStartedAtInput })
                      }
                      value={state.actualStartedAtInput}
                    />
                    <DependencyRequirement
                      blockers={blockers}
                      onChange={(dependencyOverrideReason) =>
                        onStateChange({ dependencyOverrideReason })
                      }
                      reason={state.dependencyOverrideReason}
                    />
                    {error ? (
                      <Alert variant="error">
                        <AlertTriangle />
                        <AlertTitle>Cannot record yet</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ) : null}
                    <Button className="w-full" onClick={onCommit} size="lg">
                      <Play />
                      {isCompletionCatchUp
                        ? "Record start & submit completion"
                        : blockers.length > 0
                          ? "Record start with exception"
                          : "Record start"}
                    </Button>
                  </>
                )}
              </CardPanel>
            </Card>
            <NotificationPreview blockers={blockers} />
            <PrototypeState context={context} state={state} />
          </div>
        </SheetPanel>
        <SheetFooter className="pb-20 sm:pb-4">
          <Button onClick={onDismiss} variant="ghost">
            Back to milestone
          </Button>
          <Button onClick={onReset} variant="outline">
            <RotateCcw /> Reset local state
          </Button>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

function GuidedFieldVariant({
  blockers,
  committed,
  context,
  error,
  isCompletionCatchUp,
  onCommit,
  onDismiss,
  onReset,
  onScenarioChange,
  onStateChange,
  onStepChange,
  state,
  step,
  varianceDays,
}: SharedVariantProps & {
  onStepChange: (step: number) => void;
  step: number;
}) {
  const steps = ["Origin", "Actual start", "Dependencies", "Confirm"];
  const next = () => onStepChange(Math.min(steps.length - 1, step + 1));
  const back = () => onStepChange(Math.max(0, step - 1));
  const finish = () => {
    if (onCommit()) {
      onStepChange(steps.length - 1);
    }
  };

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onDismiss();
        }
      }}
      open
    >
      <SheetPopup
        className="max-h-[90vh]"
        data-testid="milestone-start-prototype-guided"
        showCloseButton={false}
        side="bottom"
      >
        <SheetHeader className="border-b py-4">
          <div className="mx-auto flex w-full max-w-4xl items-start justify-between gap-4">
            <div>
              <PrototypeEyebrow source={state.entrySource} />
              <SheetTitle className="mt-2">
                {isCompletionCatchUp
                  ? "Add the missing field start"
                  : "Field start check-in"}
              </SheetTitle>
              <SheetDescription>
                {context.targetName} · {context.buildName}
              </SheetDescription>
            </div>
            <Badge variant="outline">
              Step {step + 1} of {steps.length}
            </Badge>
          </div>
          <div className="mx-auto mt-3 w-full max-w-4xl">
            <Progress value={((step + 1) / steps.length) * 100} />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {steps.map((label, index) => (
                <button
                  className={cn(
                    "text-left text-[11px]",
                    index <= step
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                  key={label}
                  onClick={() => onStepChange(index)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </SheetHeader>
        <SheetPanel className="mx-auto w-full max-w-4xl">
          <div className="grid gap-5">
            <ScenarioPicker
              current={state.scenario}
              onChange={onScenarioChange}
            />
            {committed ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                <CommittedSummary
                  context={context}
                  onReset={onReset}
                  state={state}
                />
                <PrototypeState context={context} state={state} />
              </div>
            ) : (
              <>
                {step === 0 ? (
                  <GuidedOriginStep
                    onChange={(entrySource) => onStateChange({ entrySource })}
                    value={state.entrySource}
                  />
                ) : null}
                {step === 1 ? (
                  <GuidedDateStep
                    context={context}
                    onChange={(actualStartedAtInput) =>
                      onStateChange({ actualStartedAtInput })
                    }
                    value={state.actualStartedAtInput}
                    varianceDays={varianceDays}
                  />
                ) : null}
                {step === 2 ? (
                  <GuidedDependencyStep
                    blockers={blockers}
                    onChange={(dependencyOverrideReason) =>
                      onStateChange({ dependencyOverrideReason })
                    }
                    reason={state.dependencyOverrideReason}
                  />
                ) : null}
                {step === 3 ? (
                  <GuidedReviewStep
                    blockers={blockers}
                    context={context}
                    isCompletionCatchUp={isCompletionCatchUp}
                    state={state}
                    varianceDays={varianceDays}
                  />
                ) : null}
                {error ? (
                  <Alert variant="error">
                    <AlertTriangle />
                    <AlertTitle>Cannot record yet</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
                <PrototypeState context={context} state={state} />
              </>
            )}
          </div>
        </SheetPanel>
        <SheetFooter className="pb-20 sm:pb-4">
          <div className="flex w-full items-center justify-between gap-3">
            <Button onClick={step === 0 ? onDismiss : back} variant="ghost">
              <ArrowLeft />
              {step === 0 ? "Back to milestone" : "Back"}
            </Button>
            {committed ? (
              <Button onClick={onReset} variant="outline">
                <RotateCcw /> Run again
              </Button>
            ) : step < steps.length - 1 ? (
              <Button onClick={next}>
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button onClick={finish}>
                <Check />
                {isCompletionCatchUp
                  ? "Record start & submit completion"
                  : "Confirm actual start"}
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}

function GuidedOriginStep({
  onChange,
  value,
}: {
  onChange: (source: PrototypeEntrySource) => void;
  value: PrototypeEntrySource;
}) {
  return (
    <div>
      <SectionHeading
        copy="This prototype keeps one workflow while testing how it feels from each real Build Workspace entry point."
        title="Where did you open this from?"
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {ENTRY_SOURCES.map((source) => (
          <Card
            className={cn(
              "cursor-pointer text-left transition-colors",
              value === source.value && "border-primary bg-primary/4"
            )}
            key={source.value}
            onClick={() => onChange(source.value)}
            render={<button type="button" />}
          >
            <CardPanel className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{source.label}</span>
                {value === source.value ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : null}
              </div>
            </CardPanel>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GuidedDateStep({
  context,
  onChange,
  value,
  varianceDays,
}: {
  context: PrototypeStartContext;
  onChange: (value: string) => void;
  value: string;
  varianceDays: number;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <div>
        <SectionHeading
          copy="Use the real field date. Backdating is valid and does not need an explanation."
          title="When did work actually begin?"
        />
        <div className="mt-5">
          <StartDateField onChange={onChange} value={value} />
        </div>
      </div>
      <Frame>
        <FramePanel className="grid gap-4 p-5">
          <KeyValue
            label="Approved start"
            value={formatLongDate(context.plannedStartDate)}
          />
          <Separator />
          <KeyValue label="Actual start" value={formatInputDateTime(value)} />
          <Separator />
          <KeyValue label="Variance" value={varianceLabel(varianceDays)} />
        </FramePanel>
      </Frame>
    </div>
  );
}

function GuidedDependencyStep({
  blockers,
  onChange,
  reason,
}: {
  blockers: PrototypeDependency[];
  onChange: (value: string) => void;
  reason: string;
}) {
  return (
    <div>
      <SectionHeading
        copy={
          blockers.length > 0
            ? "DrawFlow records the field reality, flags the configured dependency exception, and alerts the assigned lender team."
            : `No configured prerequisite blocks this ${context.scopeKind}.`
        }
        title={
          blockers.length > 0
            ? "Explain the dependency exception"
            : "Dependencies are clear"
        }
      />
      <div className="mt-5">
        <DependencyRequirement
          blockers={blockers}
          onChange={onChange}
          reason={reason}
        />
      </div>
    </div>
  );
}

function GuidedReviewStep({
  blockers,
  context,
  isCompletionCatchUp,
  state,
  varianceDays,
}: {
  blockers: PrototypeDependency[];
  context: PrototypeStartContext;
  isCompletionCatchUp: boolean;
  state: PrototypeStartState;
  varianceDays: number;
}) {
  return (
    <div>
      <SectionHeading
        copy="Nothing below changes until the explicit confirmation."
        title="Review the field declaration"
      />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Frame>
          <FramePanel className="grid gap-3 p-5">
            <ReviewRow
              label={
                context.scopeKind === "submilestone"
                  ? "Submilestone"
                  : "Milestone"
              }
              value={`${context.targetName} (${context.targetKey})`}
            />
            <ReviewRow
              label="Actual start"
              value={formatInputDateTime(state.actualStartedAtInput)}
            />
            <ReviewRow label="Variance" value={varianceLabel(varianceDays)} />
            <ReviewRow
              label="Entry point"
              value={entrySourceLabel(state.entrySource)}
            />
            <ReviewRow
              label="Dependencies"
              value={
                blockers.length > 0
                  ? `${blockers.length} incomplete · exception recorded`
                  : "Complete"
              }
            />
          </FramePanel>
        </Frame>
        <Frame>
          <FramePanel className="grid gap-3 p-5">
            <ReviewRow
              label="Lifecycle"
              value={
                isCompletionCatchUp
                  ? "Planned → In progress → Completion submitted"
                  : "Planned → In progress"
              }
            />
            <ReviewRow
              label="Progress"
              value={`${context.progressPercent}% · unchanged`}
            />
            <ReviewRow
              label="Evidence"
              value={`${context.evidenceState} · unchanged`}
            />
            <ReviewRow label="Roadmap" value="Approved plan · unchanged" />
            <ReviewRow
              label="Lender alert"
              value={blockers.length > 0 ? "Assigned team + admin" : "None"}
            />
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}

function ScenarioPicker({
  current,
  onChange,
}: {
  current: PrototypeScenario;
  onChange: (scenario: PrototypeScenario) => void;
}) {
  return (
    <div>
      <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
        Prototype scenario
      </p>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((scenario) => (
          <Button
            key={scenario.value}
            onClick={() => onChange(scenario.value)}
            size="sm"
            title={scenario.description}
            variant={current === scenario.value ? "default" : "outline"}
          >
            {scenario.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function EntrySourcePicker({
  onChange,
  value,
}: {
  onChange: (source: PrototypeEntrySource) => void;
  value: PrototypeEntrySource;
}) {
  return (
    <Field>
      <FieldLabel>Opened from</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {ENTRY_SOURCES.map((source) => (
          <Button
            key={source.value}
            onClick={() => onChange(source.value)}
            size="sm"
            variant={value === source.value ? "secondary" : "ghost"}
          >
            {source.label}
          </Button>
        ))}
      </div>
    </Field>
  );
}

function StartDateField({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field className="w-full">
      <FieldLabel htmlFor="prototype-actual-start">
        Actual start date and time
      </FieldLabel>
      <Input
        id="prototype-actual-start"
        max={toDateTimeLocal(new Date())}
        nativeInput
        onChange={(event) => onChange(event.currentTarget.value)}
        type="datetime-local"
        value={value}
      />
      <FieldDescription>
        Defaults to now. Backdating is allowed; future starts are not.
      </FieldDescription>
    </Field>
  );
}

function DependencyRequirement({
  blockers,
  onChange,
  reason,
}: {
  blockers: PrototypeDependency[];
  onChange: (value: string) => void;
  reason: string;
}) {
  if (blockers.length === 0) {
    return (
      <Alert variant="success">
        <CheckCircle2 />
        <AlertTitle>Configured dependencies complete</AlertTitle>
        <AlertDescription>
          No exception reason is required for this start.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="warning">
      <ShieldAlert />
      <AlertTitle>
        {blockers.length} configured prerequisite
        {blockers.length === 1 ? "" : "s"} still incomplete
      </AlertTitle>
      <AlertDescription>
        <ul className="grid gap-1">
          {blockers.map((blocker) => (
            <li className="flex items-center gap-2" key={blocker.key}>
              <CornerDownRight className="size-3.5" />
              {blocker.name} · {lifecycleLabel(blocker.status)}
            </li>
          ))}
        </ul>
        <Field className="mt-1 w-full">
          <FieldLabel htmlFor="prototype-dependency-reason">
            Why did work begin before prerequisites were complete?
          </FieldLabel>
          <Textarea
            id="prototype-dependency-reason"
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder="Describe the field condition or sequencing decision."
            value={reason}
          />
          <FieldDescription>
            This reason is included in the audit event and lender alert.
          </FieldDescription>
        </Field>
      </AlertDescription>
    </Alert>
  );
}

function DependencyMap({
  blockers,
  context,
}: {
  blockers: PrototypeDependency[];
  context: PrototypeStartContext;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dependency chain</CardTitle>
        <CardDescription>
          Configured roadmap relationships, not chronological guesswork.
        </CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-2 pt-0">
        {blockers.length > 0 ? (
          blockers.map((blocker) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg bg-warning/6 px-3 py-2"
              key={blocker.key}
            >
              <div>
                <p className="font-medium text-sm">{blocker.name}</p>
                <p className="text-muted-foreground text-xs">{blocker.key}</p>
              </div>
              <Badge variant="warning">{lifecycleLabel(blocker.status)}</Badge>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-success/6 px-3 py-3">
            <div>
              <p className="font-medium text-sm">All prerequisites complete</p>
              <p className="text-muted-foreground text-xs">
                {context.targetName} can begin without an exception.
              </p>
            </div>
            <CheckCircle2 className="size-5 text-success" />
          </div>
        )}
      </CardPanel>
    </Card>
  );
}

function IndependentFacts({ context }: { context: PrototypeStartContext }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <FactPill label="Lifecycle" value="Planned → In progress" />
      <FactPill
        label="Progress"
        value={`${context.progressPercent}% · stays`}
      />
      <FactPill label="Evidence" value={`${context.evidenceState} · stays`} />
    </div>
  );
}

function NotificationPreview({
  blockers,
}: {
  blockers: PrototypeDependency[];
}) {
  return (
    <Alert variant={blockers.length > 0 ? "warning" : "info"}>
      {blockers.length > 0 ? <ShieldAlert /> : <History />}
      <AlertTitle>
        {blockers.length > 0
          ? "Audit event + lender alert"
          : "Audit event only"}
      </AlertTitle>
      <AlertDescription>
        {blockers.length > 0
          ? "Assigned lender staff and admin receive the dependency exception. The actual start is still recorded."
          : "Routine starts appear in activity history without creating lender inbox noise."}
      </AlertDescription>
    </Alert>
  );
}

function CommittedSummary({
  context,
  onReset,
  state,
}: {
  context: PrototypeStartContext;
  onReset: () => void;
  state: PrototypeStartState;
}) {
  return (
    <Alert variant="success">
      <CheckCircle2 />
      <AlertTitle>
        {state.lifecycle === "completion_submitted"
          ? "Start and completion recorded locally"
          : "Actual start recorded locally"}
      </AlertTitle>
      <AlertDescription>
        <div className="grid gap-1">
          <span>Actual start: {formatIsoDateTime(state.actualStartedAt)}</span>
          <span>Reported: {formatIsoDateTime(state.reportedAt)}</span>
          <span>
            Progress remains {context.progressPercent}% and evidence remains{" "}
            {context.evidenceState.toLowerCase()}.
          </span>
        </div>
        <Button className="w-fit" onClick={onReset} size="sm" variant="outline">
          <TimerReset /> Reset scenario
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function PrototypeState({
  context,
  state,
}: {
  context: PrototypeStartContext;
  state: PrototypeStartState;
}) {
  return (
    <details className="text-xs" open>
      <summary className="cursor-pointer px-1 font-medium">
        Full local prototype state
      </summary>
      <Frame className="mt-2">
        <FramePanel className="p-3">
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
            {JSON.stringify(
              {
                actualStartedAt: state.actualStartedAt,
                actualStartedAtInput: state.actualStartedAtInput,
                actionLog: state.actionLog,
                completionSubmittedAt: state.completionSubmittedAt,
                dependencyOverrideReason:
                  state.dependencyOverrideReason || null,
                entrySource: state.entrySource,
                evidenceState: context.evidenceState,
                lifecycle: state.lifecycle,
                milestoneKey: context.milestoneKey,
                progressPercent: context.progressPercent,
                reportedAt: state.reportedAt,
                scenario: state.scenario,
                scopeKind: context.scopeKind,
                targetKey: context.targetKey,
              },
              null,
              2
            )}
          </pre>
        </FramePanel>
      </Frame>
    </details>
  );
}

function PrototypeEyebrow({ source }: { source: PrototypeEntrySource }) {
  return (
    <div className="flex items-center gap-2 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
      <Sparkles className="size-3.5 text-primary" />
      Throwaway prototype · opened from {entrySourceLabel(source)}
    </div>
  );
}

function ChangeRow({
  after,
  before,
  label,
  unchanged = false,
}: {
  after: string;
  before: string;
  label: string;
  unchanged?: boolean;
}) {
  return (
    <Card className="grid grid-cols-[6.5rem_1fr_auto_1fr] items-center gap-2 rounded-lg px-3 py-2 text-sm shadow-none">
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">{before}</span>
      <ArrowRight className="size-3.5 text-muted-foreground" />
      <span className={unchanged ? "text-muted-foreground" : "font-medium"}>
        {after}
      </span>
    </Card>
  );
}

function FactPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/64 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-0.5 font-medium text-xs">{value}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 font-medium text-sm">{value}</p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SectionHeading({ copy, title }: { copy: string; title: string }) {
  return (
    <div>
      <h3 className="font-heading font-semibold text-xl">{title}</h3>
      <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{copy}</p>
    </div>
  );
}

function TimelineCopy({ copy, title }: { copy: string; title: string }) {
  return (
    <div className="pb-1">
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-0.5 text-muted-foreground text-xs">{copy}</p>
    </div>
  );
}

function TimelineDot({
  icon,
  tone,
}: {
  icon: ReactNode;
  tone: "muted" | "primary" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "relative z-10 grid size-8 place-items-center rounded-full border bg-background [&_svg]:size-3.5",
        tone === "muted" && "text-muted-foreground",
        tone === "primary" && "border-primary/30 text-primary",
        tone === "success" && "border-success/30 text-success",
        tone === "warning" && "border-warning/30 text-warning"
      )}
    >
      {icon}
    </div>
  );
}

function buildPrototypeStartContext(
  detail: ProductionBuildDetail,
  requestedMilestoneKey?: string,
  requestedSubmilestoneKey?: string
): PrototypeStartContext {
  const milestone =
    detail.milestones.find((item) => item.key === requestedMilestoneKey) ??
    detail.milestones.find((item) => item.status === "planned") ??
    detail.milestones[0];
  const milestoneKey =
    milestone?.key ?? requestedMilestoneKey ?? "prototype-milestone";
  const submilestone = requestedSubmilestoneKey
    ? detail.submilestones.find(
        (item) =>
          item.key === requestedSubmilestoneKey &&
          item.milestoneKey === milestoneKey
      )
    : undefined;
  const scopeKind = submilestone ? "submilestone" : "milestone";
  const targetKey = submilestone?.key ?? milestoneKey;
  const targetName = submilestone?.name ?? milestone?.name ?? "Milestone";
  const dependencyCandidates = (milestone?.dependencyKeys ?? [])
    .map((key) => detail.milestones.find((item) => item.key === key))
    .filter((item): item is NonNullable<(typeof detail.milestones)[number]> =>
      Boolean(item)
    )
    .map((item) => ({
      key: item.key,
      name: item.name,
      status:
        item.status === "planned"
          ? ("planned" as const)
          : ("in_progress" as const),
    }));
  const fallbackDependency =
    detail.milestones.find((item) => item.key !== milestoneKey) ?? milestone;
  const plannedStartDay = submilestone?.startDay ?? milestone?.dayStart ?? 0;
  const plannedEndDay = submilestone
    ? plannedStartDay + Math.max(1, submilestone.durationDays ?? 1)
    : (milestone?.dayEnd ?? 20);

  return {
    buildName: detail.build.buildName,
    dependencyCandidates:
      dependencyCandidates.length > 0
        ? dependencyCandidates
        : [
            {
              key: fallbackDependency?.key ?? "site-servicing",
              name: fallbackDependency?.name ?? "Site servicing",
              status: "in_progress",
            },
          ],
    evidenceState: milestone?.evidenceState ?? "Not started",
    milestoneKey,
    plannedEndDate: addDays(detail.build.startDate, plannedEndDay),
    plannedStartDate: addDays(detail.build.startDate, plannedStartDay),
    progressPercent: submilestone
      ? 0
      : (milestone?.progressPercent ??
        milestone?.normalizedProgressPercent ??
        0),
    scopeKind,
    targetKey,
    targetName,
  };
}

function stateForScenario(
  context: PrototypeStartContext,
  scenario: PrototypeScenario,
  entrySource?: PrototypeEntrySource
): PrototypeStartState {
  const now = new Date();
  const actual =
    scenario === "backdated"
      ? backdatedValue(context.plannedStartDate, now)
      : toDateTimeLocal(now);

  return {
    actionLog: [
      `Loaded ${scenario.replace("_", " ")} scenario in local prototype state.`,
    ],
    actualStartedAtInput: actual,
    dependencyOverrideReason: "",
    entrySource:
      entrySource ??
      (scenario === "completion"
        ? "submilestone"
        : scenario === "dependency"
          ? "gantt"
          : "milestone_card"),
    lifecycle: "planned",
    scenario,
  };
}

function backdatedValue(plannedStartDate: string, now: Date) {
  const planned = new Date(`${plannedStartDate}T08:00:00`);
  const candidate = new Date(planned);
  candidate.setDate(candidate.getDate() + 1);
  if (candidate.getTime() < now.getTime()) {
    return toDateTimeLocal(candidate);
  }
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() - 4);
  fallback.setHours(8, 0, 0, 0);
  return toDateTimeLocal(fallback);
}

function addDays(startIso: string, days: number) {
  const date = new Date(`${startIso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function scheduleVarianceDays(actualInput: string, plannedDate: string) {
  const actual = new Date(actualInput);
  const planned = new Date(`${plannedDate}T12:00:00`);
  if (Number.isNaN(actual.getTime()) || Number.isNaN(planned.getTime())) {
    return 0;
  }
  return Math.round(
    (actual.getTime() - planned.getTime()) / (24 * 60 * 60 * 1000)
  );
}

function varianceLabel(days: number) {
  if (days === 0) {
    return "On plan";
  }
  return days < 0 ? `${Math.abs(days)}d early` : `${Math.abs(days)}d late`;
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatInputDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatIsoDateTime(value?: string) {
  if (!value) {
    return "Not recorded";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function entrySourceLabel(source: PrototypeEntrySource) {
  return ENTRY_SOURCES.find((item) => item.value === source)?.label ?? source;
}

function lifecycleLabel(
  lifecycle: PrototypeLifecycle | PrototypeDependency["status"]
) {
  if (lifecycle === "completion_submitted") {
    return "Completion submitted";
  }
  if (lifecycle === "in_progress") {
    return "In progress";
  }
  return "Planned";
}
