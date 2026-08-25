import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  Play,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
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
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
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
import { cn } from "#/lib/utils.ts";
import type {
  PrototypeDependency,
  PrototypeEntrySource,
  PrototypeStartContext,
  PrototypeStartState,
  SharedVariantProps,
} from "./-milestone-start-contracts.ts";
import { ENTRY_SOURCES } from "./-milestone-start-contracts.ts";
import {
  entrySourceLabel,
  formatInputDateTime,
  formatLongDate,
  formatShortDate,
  lifecycleLabel,
  varianceLabel,
} from "./-milestone-start-model.ts";
import {
  ChangeRow,
  CommittedSummary,
  DependencyMap,
  DependencyRequirement,
  EntrySourcePicker,
  IndependentFacts,
  KeyValue,
  NotificationPreview,
  PrototypeEyebrow,
  PrototypeState,
  ReviewRow,
  ScenarioPicker,
  SectionHeading,
  StartDateField,
  TimelineCopy,
  TimelineDot,
} from "./-milestone-start-controls.tsx";

export function CompactDialogVariant(props: SharedVariantProps) {
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

export function ContextSplitVariant(props: SharedVariantProps) {
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

export function GuidedFieldVariant({
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
                    context={context}
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

export function GuidedOriginStep({
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

export function GuidedDateStep({
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

export function GuidedDependencyStep({
  blockers,
  context,
  onChange,
  reason,
}: {
  blockers: PrototypeDependency[];
  context: PrototypeStartContext;
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

export function GuidedReviewStep({
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
