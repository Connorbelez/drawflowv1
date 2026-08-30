import {
  ArrowRight,
  CheckCircle2,
  CornerDownRight,
  History,
  ShieldAlert,
  Sparkles,
  TimerReset,
} from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  PrototypeDependency,
  PrototypeEntrySource,
  PrototypeScenario,
  PrototypeStartContext,
  PrototypeStartState,
} from "./-milestone-start-contracts.ts";
import {
  ENTRY_SOURCES,
  SCENARIOS,
} from "./-milestone-start-contracts.ts";
import {
  entrySourceLabel,
  formatIsoDateTime,
  lifecycleLabel,
  toDateTimeLocal,
} from "./-milestone-start-model.ts";

export function ScenarioPicker({
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

export function EntrySourcePicker({
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

export function StartDateField({
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

export function DependencyRequirement({
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

export function DependencyMap({
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

export function IndependentFacts({ context }: { context: PrototypeStartContext }) {
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

export function NotificationPreview({
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

export function CommittedSummary({
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

export function PrototypeState({
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

export function PrototypeEyebrow({ source }: { source: PrototypeEntrySource }) {
  return (
    <div className="flex items-center gap-2 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.15em]">
      <Sparkles className="size-3.5 text-primary" />
      Throwaway prototype · opened from {entrySourceLabel(source)}
    </div>
  );
}

export function ChangeRow({
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

export function FactPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/64 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-0.5 font-medium text-xs">{value}</p>
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 font-medium text-sm">{value}</p>
    </div>
  );
}

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function SectionHeading({ copy, title }: { copy: string; title: string }) {
  return (
    <div>
      <h3 className="font-heading font-semibold text-xl">{title}</h3>
      <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{copy}</p>
    </div>
  );
}

export function TimelineCopy({ copy, title }: { copy: string; title: string }) {
  return (
    <div className="pb-1">
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-0.5 text-muted-foreground text-xs">{copy}</p>
    </div>
  );
}

export function TimelineDot({
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
