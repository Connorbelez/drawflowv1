"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Play,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
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
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

export type MilestoneStartSource =
  | "assistant"
  | "calendar"
  | "completion_catch_up"
  | "gantt"
  | "guided_field_workflow"
  | "milestone_card"
  | "milestone_detail"
  | "submilestone_detail"
  | "submilestone_ledger";

export interface MilestoneStartDependency {
  milestoneKey: string;
  milestoneName: string;
  status: "in_progress" | "planned";
}

export interface MilestoneStartDialogRequest {
  action?: "correct" | "retract" | "start";
  actualStartedAt?: number;
  buildName: string;
  dependencyBlockers: MilestoneStartDependency[];
  milestoneKey: string;
  milestoneName: string;
  plannedStartDate: string;
  scope: "milestone" | "submilestone";
  source: MilestoneStartSource;
  startParent?: boolean;
  submilestoneKey?: string;
  submilestoneName?: string;
}

export interface MilestoneStartConfirmation {
  action: "correct" | "retract" | "start";
  actualStartedAt?: number;
  dependencyOverrideReason?: string;
  idempotencyKey: string;
  milestoneKey: string;
  reason?: string;
  source: MilestoneStartSource;
  startParent?: boolean;
  submilestoneKey?: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One confirmation surface intentionally keeps start, dependency-exception, correction, retraction, offline, and retry states visible together.
export function MilestoneStartDialog({
  onClose,
  onConfirm,
  request,
}: {
  onClose: () => void;
  onConfirm: (input: MilestoneStartConfirmation) => Promise<unknown> | unknown;
  request: MilestoneStartDialogRequest;
}) {
  const action = request.action ?? "start";
  const [actualStartInput, setActualStartInput] = useState(() =>
    toDateTimeLocal(request.actualStartedAt ?? Date.now())
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const actualStartedAt = Date.parse(actualStartInput);
  const varianceDays = useMemo(
    () =>
      Number.isFinite(actualStartedAt)
        ? Math.round(
            (actualStartedAt - Date.parse(request.plannedStartDate)) /
              86_400_000
          )
        : 0,
    [actualStartedAt, request.plannedStartDate]
  );
  const targetName = request.submilestoneName ?? request.milestoneName;
  const needsDependencyReason =
    action === "start" && request.dependencyBlockers.length > 0;
  const needsAmendmentReason = action !== "start";
  const actualStartIsValid =
    action === "retract" ||
    (Number.isFinite(actualStartedAt) && actualStartedAt <= Date.now());

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const submit = async () => {
    const normalizedReason = reason.trim();
    if (!online) {
      setError(
        "Work starts are online-only. Reconnect before recording this event."
      );
      return;
    }
    if (!actualStartIsValid) {
      setError("Actual start must be now or earlier.");
      return;
    }
    if (needsDependencyReason && !normalizedReason) {
      setError(
        "Explain why work began before the declared predecessor milestones were complete."
      );
      return;
    }
    if (needsAmendmentReason && normalizedReason.length < 3) {
      setError("A correction or retraction reason is required.");
      return;
    }
    const confirmation: MilestoneStartConfirmation = {
      action,
      ...(action === "retract" ? {} : { actualStartedAt }),
      ...(needsDependencyReason
        ? { dependencyOverrideReason: normalizedReason }
        : {}),
      idempotencyKey,
      milestoneKey: request.milestoneKey,
      ...(needsAmendmentReason ? { reason: normalizedReason } : {}),
      source: request.source,
      startParent: request.startParent,
      submilestoneKey: request.submilestoneKey,
    };
    setPending(true);
    setError("");
    try {
      await onConfirm(confirmation);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !(open || pending) && onClose()} open>
      <DialogPopup
        className="max-h-[min(90svh,46rem)] max-w-xl overflow-y-auto"
        data-testid="milestone-start-dialog"
        showCloseButton={false}
      >
        <DialogHeader className="border-b">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{sourceLabel(request.source)}</Badge>
            <Badge variant="secondary">
              {request.scope === "submilestone" ? "Submilestone" : "Milestone"}
            </Badge>
          </div>
          <DialogTitle>{dialogTitle(action)}</DialogTitle>
          <DialogDescription>
            {action === "retract"
              ? `Retract the recorded start for ${targetName} without deleting its history.`
              : `Record when ${targetName} actually began. The approved Construction Roadmap stays unchanged.`}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="grid gap-4">
          <Frame>
            <FramePanel className="grid gap-3 p-4">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
                  Build
                </p>
                <p className="mt-1 font-medium">{request.buildName}</p>
              </div>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <Fact
                  icon={<CalendarClock />}
                  label="Parent milestone"
                  value={request.milestoneName}
                />
                {request.submilestoneName ? (
                  <Fact
                    icon={<Play />}
                    label="Submilestone"
                    value={request.submilestoneName}
                  />
                ) : (
                  <Fact
                    icon={<Clock3 />}
                    label="Planned start"
                    value={formatDateTime(request.plannedStartDate)}
                  />
                )}
              </div>
              {request.submilestoneName ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Fact
                    icon={<Clock3 />}
                    label="Planned start"
                    value={formatDateTime(request.plannedStartDate)}
                  />
                  <Fact
                    icon={<CalendarClock />}
                    label="Schedule variance"
                    value={varianceLabel(varianceDays)}
                  />
                </div>
              ) : (
                <Fact
                  icon={<CalendarClock />}
                  label="Schedule variance"
                  value={varianceLabel(varianceDays)}
                />
              )}
            </FramePanel>
          </Frame>

          {request.startParent && request.scope === "submilestone" ? (
            <Alert variant="info">
              <CheckCircle2 />
              <AlertTitle>Parent and submilestone start together</AlertTitle>
              <AlertDescription>
                This one confirmation records linked starts for{" "}
                {request.milestoneName} and {request.submilestoneName}.
              </AlertDescription>
            </Alert>
          ) : null}

          {action === "retract" ? null : (
            <Field>
              <FieldLabel htmlFor="milestone-actual-start">
                Actual start
              </FieldLabel>
              <Input
                id="milestone-actual-start"
                max={toDateTimeLocal(Date.now())}
                onChange={(event) => setActualStartInput(event.target.value)}
                type="datetime-local"
                value={actualStartInput}
              />
              <FieldDescription>
                Current and backdated starts are valid. Backdating alone does
                not require a reason.
              </FieldDescription>
            </Field>
          )}

          {request.dependencyBlockers.length > 0 && action === "start" ? (
            <Alert variant="warning">
              <ShieldAlert />
              <AlertTitle>Declared predecessors are incomplete</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {request.dependencyBlockers.map((dependency) => (
                    <li key={dependency.milestoneKey}>
                      {dependency.milestoneName} is{" "}
                      {lifecycleLabel(dependency.status)}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {actualStartIsValid ? null : (
            <Alert role="alert" variant="error">
              <AlertTriangle />
              <AlertTitle>Choose a valid actual start</AlertTitle>
              <AlertDescription>
                Actual start must be now or earlier. Future work belongs in the
                approved Construction Roadmap.
              </AlertDescription>
            </Alert>
          )}

          {needsDependencyReason || needsAmendmentReason ? (
            <Field>
              <FieldLabel htmlFor="milestone-start-reason">
                {needsDependencyReason
                  ? "Why is work starting out of sequence?"
                  : action === "correct"
                    ? "Why is this start being corrected?"
                    : "Why is this start being retracted?"}
              </FieldLabel>
              <Textarea
                id="milestone-start-reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  needsDependencyReason
                    ? "Describe the field decision and current dependency context."
                    : "Record the source of the correction for the audit trail."
                }
                value={reason}
              />
            </Field>
          ) : null}

          {online ? null : (
            <Alert variant="warning">
              <WifiOff />
              <AlertTitle>Reconnect to record this event</AlertTitle>
              <AlertDescription>
                No local draft will be presented as a recorded work start.
              </AlertDescription>
            </Alert>
          )}
          {error ? (
            <Alert role="alert" variant="error">
              <AlertTriangle />
              <AlertTitle>Could not record the work start</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </DialogPanel>

        <DialogFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button disabled={pending} onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!(online && actualStartIsValid)}
            loading={pending}
            onClick={submit}
          >
            {error ? <RefreshCw /> : <Play />}
            {error ? "Retry" : confirmationLabel(action, needsDependencyReason)}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2">
      <span className="mt-0.5 text-muted-foreground [&>svg]:size-4">
        {icon}
      </span>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="mt-0.5 text-sm">{value}</p>
      </div>
    </div>
  );
}

function dialogTitle(action: "correct" | "retract" | "start") {
  if (action === "correct") {
    return "Correct actual start";
  }
  if (action === "retract") {
    return "Retract actual start";
  }
  return "Start work";
}

function confirmationLabel(
  action: "correct" | "retract" | "start",
  exception: boolean
) {
  if (action === "correct") {
    return "Record correction";
  }
  if (action === "retract") {
    return "Retract start";
  }
  return exception ? "Record exception start" : "Record start";
}

function sourceLabel(source: MilestoneStartSource) {
  return (
    {
      assistant: "Assistant confirmation",
      calendar: "Calendar",
      completion_catch_up: "Completion confirmation",
      gantt: "Gantt roadmap",
      guided_field_workflow: "Guided field workflow",
      milestone_card: "Milestone card",
      milestone_detail: "Milestone detail",
      submilestone_detail: "Submilestone detail",
      submilestone_ledger: "Submilestone ledger",
    } satisfies Record<MilestoneStartSource, string>
  )[source];
}

function lifecycleLabel(status: MilestoneStartDependency["status"]) {
  return status === "in_progress" ? "In progress" : "Planned";
}

function varianceLabel(days: number) {
  if (days === 0) {
    return "On planned date";
  }
  return days < 0
    ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} early`
    : `${days} day${days === 1 ? "" : "s"} late`;
}

function toDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    try {
      const parsed = JSON.parse(error.message) as { message?: string };
      return parsed.message?.trim() || error.message;
    } catch {
      return error.message;
    }
  }
  return "The start could not be recorded. Your date and reason are retained.";
}
