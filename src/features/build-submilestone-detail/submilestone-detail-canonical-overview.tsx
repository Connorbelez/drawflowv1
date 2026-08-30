"use client";

import { useMutation } from "convex/react";
import { Check, CheckCircle2, Play, RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { api as apiRef } from "../../../convex/_generated/api";
import {
  type MilestoneStartConfirmation,
  MilestoneStartDialog,
  type MilestoneStartDialogRequest,
  type MilestoneStartSource,
} from "../backoffice-build-detail/MilestoneStartDialog.tsx";
import { ActiveBuildSubmilestoneGuidanceController } from "../submilestone-guidance/ActiveBuildSubmilestoneGuidanceController.tsx";
import { ProposalSubmilestoneScopeController } from "../submilestone-scope/ProposalSubmilestoneScopeController.tsx";
import type {
  CanonicalDirtySection,
  CanonicalWorkspaceBootstrap,
  NavigationProps,
  RetryAction,
} from "./submilestone-detail-canonical-contracts.ts";
import {
  arrayValue,
  canMutate,
  capability,
  commandKey,
  currencyInputValue,
  errorMessage,
  formatCents,
  formatDate,
  isCanonicalSubmilestoneSuperseded,
  isStaleConflict,
  milestoneKeyFor,
  milestoneNameFor,
  object,
  overviewFor,
  parseCadAmount,
  plannedDate,
  proposalSubmilestoneIdFor,
  resultRevision,
  revisionFor,
  statusLabel,
  statusVariant,
  stringValue,
  submilestoneKeyFor,
  submilestoneNameFor,
} from "./submilestone-detail-canonical-contracts.ts";
import { CommandError } from "./submilestone-detail-canonical-command.tsx";

export function CanonicalOverviewPanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  companionActionItemId: _companionActionItemId,
  onDirtyChange,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  onDirtyChange?: (section: CanonicalDirtySection, dirty: boolean) => void;
}) {
  const updateProgress = useMutation(
    apiRef.production_proposals.updateActiveBuildSubmilestoneProgress
  );
  const updateExecution = useMutation(
    apiRef.production_proposals.updateActiveBuildSubmilestoneExecution
  );
  const startWork = useMutation(
    apiRef.production_proposals.startActiveBuildMilestone
  );
  const correctStart = useMutation(
    apiRef.production_proposals.correctActiveBuildMilestoneStart
  );
  const retractStart = useMutation(
    apiRef.production_proposals.retractActiveBuildMilestoneStart
  );
  const details = overviewFor(bootstrap);
  const proposalSubmilestoneId = proposalSubmilestoneIdFor(bootstrap);
  const [progress, setProgress] = useState(String(details.progressPercent));
  const [actualCost, setActualCost] = useState(
    currencyInputValue(details.actualCostCents)
  );
  const [forecast, setForecast] = useState(
    details.completionForecastDate ?? ""
  );
  const [fieldNote, setFieldNote] = useState(details.fieldNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retry, setRetry] = useState<RetryAction | null>(null);
  const retryRef = useRef<RetryAction | null>(null);
  const [startDialog, setStartDialog] =
    useState<MilestoneStartDialogRequest | null>(null);
  const [completeAfterStart, setCompleteAfterStart] = useState(false);

  useEffect(() => {
    // This sheet stays mounted while history navigation swaps its target.
    // Reset drafts and command state at that boundary so a submit cannot use
    // values captured for the previous canonical Sub-milestone.
    setProgress(String(details.progressPercent));
    setActualCost(currencyInputValue(details.actualCostCents));
    setForecast(details.completionForecastDate ?? "");
    setFieldNote(details.fieldNote);
    setBusy(false);
    setError("");
    setSuccess("");
    setRetry(null);
    retryRef.current = null;
    setStartDialog(null);
    setCompleteAfterStart(false);
  }, [buildSubmilestoneId]);

  const workflowRevision = revisionFor(bootstrap);
  const milestoneKey = milestoneKeyFor(bootstrap);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const status = details.status;
  const actualStartedAt = details.actualStartedAt;
  const hasRevision = workflowRevision !== undefined;
  const startAllowed = hasRevision && canMutate(bootstrap, readOnly, "start");
  const correctAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "correctStart");
  const retractAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "retractStart");
  const updateAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "updateExecution");
  const completeAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "complete");
  const reopenAllowed = hasRevision && canMutate(bootstrap, readOnly, "reopen");

  const runCommand = async (action: RetryAction, successMessage?: string) => {
    const retryAction: RetryAction = () => runCommand(action, successMessage);
    retryRef.current = retryAction;
    setRetry(() => retryAction);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setError("");
      setRetry(null);
      retryRef.current = null;
      if (successMessage) {
        // Keep successful command feedback separate from errors so a saved
        // draft never renders inside the failure alert.
        setSuccess(successMessage);
      }
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      if (isStaleConflict(caught)) {
        const refreshAction: RetryAction | null = onRetry
          ? async () => {
              onRetry();
            }
          : null;
        retryRef.current = refreshAction;
        setRetry(() => refreshAction);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveProgress = () => {
    if (!updateAllowed || busy) {
      if (
        !(hasRevision || readOnly) &&
        capability(bootstrap, "updateExecution").allowed
      ) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before saving this draft."
        );
      }
      return;
    }
    if (!progress.trim()) {
      setError("Progress must be a whole number between 0 and 100.");
      return;
    }
    const progressValue = Number(progress);
    const actualCostValue = parseCadAmount(actualCost);
    if (
      !Number.isInteger(progressValue) ||
      progressValue < 0 ||
      progressValue > 100
    ) {
      setError("Progress must be a whole number between 0 and 100.");
      return;
    }
    if (actualCostValue === null) {
      setError(
        "Actual cost must be a non-negative CAD amount with no more than two decimal places."
      );
      return;
    }
    const idempotencyKey = commandKey("submilestone-progress");
    const action = async () => {
      await updateProgress({
        actualCostCents: actualCostValue ?? null,
        buildId,
        completionForecastDate: forecast.trim() || null,
        expectedRevision: workflowRevision,
        fieldNote: fieldNote.trim() || null,
        idempotencyKey,
        milestoneKey,
        progressPercent: progressValue,
        submilestoneKey,
        workosOrganizationId: organizationId,
      });
    };
    void runCommand(
      action,
      "Progress draft saved. Refreshing canonical facts…"
    );
  };

  const startRequest = (action: "correct" | "retract" | "start") => {
    if (workflowRevision === undefined) {
      setError(
        "The canonical workflow revision is unavailable. Refresh before recording this start."
      );
      return;
    }
    const source: MilestoneStartSource = "submilestone_detail";
    setCompleteAfterStart(false);
    setStartDialog({
      action,
      actualStartedAt,
      buildName: stringValue(object(bootstrap.build).buildName, "Build"),
      dependencyBlockers: dependencyBlockers(bootstrap),
      expectedRevision: workflowRevision,
      milestoneKey,
      milestoneName: milestoneNameFor(bootstrap),
      plannedStartDate: plannedDate(bootstrap),
      scope: "submilestone",
      source,
      submilestoneKey,
      submilestoneName: submilestoneNameFor(bootstrap),
    });
  };

  const complete = () => {
    if (!completeAllowed || busy) {
      if (
        !(hasRevision || readOnly) &&
        capability(bootstrap, "complete").allowed
      ) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before completing this Sub-milestone."
        );
      }
      return;
    }
    if (workflowRevision === undefined) {
      setError(
        "The canonical workflow revision is unavailable. Refresh before completing this Sub-milestone."
      );
      return;
    }
    if (actualStartedAt === undefined) {
      setCompleteAfterStart(true);
      setStartDialog({
        action: "start",
        buildName: stringValue(object(bootstrap.build).buildName, "Build"),
        dependencyBlockers: dependencyBlockers(bootstrap),
        expectedRevision: workflowRevision,
        milestoneKey,
        milestoneName: milestoneNameFor(bootstrap),
        plannedStartDate: plannedDate(bootstrap),
        scope: "submilestone",
        source: "completion_catch_up",
        startParent: false,
        submilestoneKey,
        submilestoneName: submilestoneNameFor(bootstrap),
      });
      return;
    }
    const idempotencyKey = commandKey("submilestone-complete");
    const action = async () => {
      await updateExecution({
        buildId,
        expectedRevision: workflowRevision,
        idempotencyKey,
        milestoneKey,
        reason: "Completed from canonical Sub-milestone detail.",
        status: "complete",
        submilestoneKey,
        workosOrganizationId: organizationId,
      });
    };
    void runCommand(action, "Completion recorded. Refreshing canonical facts…");
  };

  const reopen = () => {
    if (!reopenAllowed || busy) {
      if (
        !(hasRevision || readOnly) &&
        capability(bootstrap, "reopen").allowed
      ) {
        setError(
          "The canonical workflow revision is unavailable. Refresh before reopening this Sub-milestone."
        );
      }
      return;
    }
    const idempotencyKey = commandKey("submilestone-reopen");
    const action = async () => {
      await updateExecution({
        buildId,
        expectedRevision: workflowRevision,
        idempotencyKey,
        milestoneKey,
        reason: "Reopened from canonical Sub-milestone detail.",
        status: "in_progress",
        submilestoneKey,
        workosOrganizationId: organizationId,
      });
    };
    void runCommand(
      action,
      "Sub-milestone reopened. Refreshing canonical facts…"
    );
  };

  const confirmStart = async (input: MilestoneStartConfirmation) => {
    const expectedRevision = input.expectedRevision;
    if (input.action === "correct") {
      if (input.actualStartedAt === undefined || !input.reason) {
        throw new Error("A corrected actual start and reason are required.");
      }
      await correctStart({
        actualStartedAt: input.actualStartedAt,
        buildId,
        expectedRevision,
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
        workosOrganizationId: organizationId,
      });
      return;
    }
    if (input.action === "retract") {
      if (!input.reason) {
        throw new Error("A retraction reason is required.");
      }
      await retractStart({
        buildId,
        expectedRevision,
        idempotencyKey: input.idempotencyKey,
        milestoneKey: input.milestoneKey,
        reason: input.reason,
        source: input.source,
        submilestoneKey: input.submilestoneKey,
        workosOrganizationId: organizationId,
      });
      return;
    }
    if (input.actualStartedAt === undefined) {
      throw new Error("An actual start is required.");
    }
    const started = await startWork({
      actualStartedAt: input.actualStartedAt,
      buildId,
      dependencyOverrideReason: input.dependencyOverrideReason,
      expectedRevision,
      idempotencyKey: input.idempotencyKey,
      milestoneKey: input.milestoneKey,
      source: input.source,
      startParent: input.startParent,
      submilestoneKey: input.submilestoneKey,
      workosOrganizationId: organizationId,
    });
    if (completeAfterStart) {
      try {
        const nextRevision = resultRevision(started);
        if (nextRevision === undefined) {
          throw new Error(
            "The canonical start did not return a workflow revision. Refresh before completing this Sub-milestone."
          );
        }
        await updateExecution({
          actualStartedAt: input.actualStartedAt,
          buildId,
          expectedRevision: nextRevision,
          idempotencyKey: `${input.idempotencyKey}:complete`,
          milestoneKey: input.milestoneKey,
          reason: "Completion catch-up confirmed from canonical detail.",
          status: "complete",
          submilestoneKey: input.submilestoneKey ?? submilestoneKey,
          workosOrganizationId: organizationId,
        });
      } catch (caught) {
        setStartDialog(null);
        throw new Error(
          `Start was recorded, but completion failed. Refresh and retry completion. ${errorMessage(caught)}`
        );
      } finally {
        setCompleteAfterStart(false);
      }
    }
  };

  const ownership = object(
    object(bootstrap.overview).executionOwnership ?? bootstrap.ownership
  );
  const parent = object(bootstrap.milestone);
  return (
    <div className="space-y-4" data-testid="submilestone-detail-overview">
      {proposalSubmilestoneId ? (
        <ProposalSubmilestoneScopeController
          onDirtyChange={(dirty) => onDirtyChange?.("scope", dirty)}
          proposalSubmilestoneId={proposalSubmilestoneId}
          readOnly={readOnly}
          scopeRoute="active-build"
          viewerCapacity={viewerCapacity}
          workosOrganizationId={organizationId}
        />
      ) : null}
      {proposalSubmilestoneId ? (
        <ActiveBuildSubmilestoneGuidanceController
          buildSubmilestoneId={String(buildSubmilestoneId)}
          onDirtyChange={(dirty) => onDirtyChange?.("guidance", dirty)}
          proposalSubmilestoneId={proposalSubmilestoneId}
          readOnly={readOnly}
          rowName={milestoneNameFor(bootstrap)}
          subMilestoneName={submilestoneNameFor(bootstrap)}
          viewerCapacity={viewerCapacity}
          workosOrganizationId={organizationId}
        />
      ) : null}

      <Frame>
        <FramePanel className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-xs">Parent milestone</p>
              <p className="font-medium text-sm">
                {stringValue(parent.name, "Not available")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusVariant(details.status)}>
                {statusLabel(details.status)}
              </Badge>
              {isCanonicalSubmilestoneSuperseded(bootstrap) ? (
                <Badge variant="warning">Superseded · read-only</Badge>
              ) : null}
              {readOnly && !isCanonicalSubmilestoneSuperseded(bootstrap) ? (
                <Badge variant="outline">Read-only</Badge>
              ) : null}
            </div>
          </div>
          <Separator />
          <dl className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Budget" value={formatCents(details.budgetCents)} />
            <Metric
              label="Schedule"
              value={`${plannedDate(bootstrap)}${details.plannedDurationDays === undefined ? "" : ` · ${details.plannedDurationDays} day${details.plannedDurationDays === 1 ? "" : "s"}`}`}
            />
            <Metric
              label="Actual start"
              value={formatDate(details.actualStartedAt)}
            />
            <Metric
              label="Progress"
              value={`${Math.round(details.progressPercent)}%`}
            />
            <Metric
              label="Forecast"
              value={formatDate(details.completionForecastDate)}
            />
            <Metric
              label="Actual cost"
              value={
                details.actualCostCents === undefined
                  ? "Not recorded"
                  : formatCents(details.actualCostCents, 2)
              }
            />
          </dl>
          <Progress
            aria-label="Sub-milestone progress"
            value={details.progressPercent}
          />
        </FramePanel>
      </Frame>

      <Frame>
        <FramePanel className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium text-sm">Execution ownership</p>
            <Badge
              variant={ownership.state === "assigned" ? "success" : "warning"}
            >
              {statusLabel(ownership.state)}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {stringValue(
              ownership.contractorName ?? ownership.reason,
              "No active Work Allocation is recorded."
            )}
          </p>
          {details.fieldNote ? (
            <div className="border-t pt-3">
              <p className="text-muted-foreground text-xs">Field note</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {details.fieldNote}
              </p>
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      {updateAllowed ? (
        <Frame>
          <FramePanel className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Save aria-hidden="true" className="size-4" />
              Update field execution
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Label className="space-y-1 text-xs">
                <span>Progress percent</span>
                <Input
                  aria-label="Progress percent"
                  max={100}
                  min={0}
                  onChange={(event) => setProgress(event.target.value)}
                  type="number"
                  value={progress}
                />
              </Label>
              <Label className="space-y-1 text-xs">
                <span>Actual cost (CAD)</span>
                <Input
                  aria-label="Actual cost in CAD"
                  inputMode="decimal"
                  min={0}
                  onChange={(event) => setActualCost(event.target.value)}
                  step="0.01"
                  type="number"
                  value={actualCost}
                />
              </Label>
              <Label className="space-y-1 text-xs">
                <span>Completion forecast</span>
                <Input
                  aria-label="Completion forecast"
                  onChange={(event) => setForecast(event.target.value)}
                  type="date"
                  value={forecast}
                />
              </Label>
            </div>
            <Label className="space-y-1 text-xs">
              <span>Field note</span>
              <Textarea
                aria-label="Field note"
                onChange={(event) => setFieldNote(event.target.value)}
                value={fieldNote}
              />
            </Label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={busy}
                onClick={saveProgress}
                size="sm"
                type="button"
              >
                {busy ? "Saving…" : "Save update"}
              </Button>
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {error ? (
        <CommandError error={error} retry={retryRef.current ?? retry} />
      ) : null}
      {success ? (
        <div
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-success"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
          <p>{success}</p>
        </div>
      ) : null}

      {isCanonicalSubmilestoneSuperseded(bootstrap) ? null : (
        <Frame>
          <FramePanel className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-sm">
              Sub-milestone actions
            </div>
            <p className="text-muted-foreground text-xs">
              These actions update this Sub-milestone only. Draw release and
              lender review actions remain on their own surfaces.
            </p>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Sub-milestone actions</legend>
              {startAllowed && !actualStartedAt ? (
                <Button
                  disabled={busy}
                  onClick={() => startRequest("start")}
                  size="sm"
                  type="button"
                >
                  <Play aria-hidden="true" />
                  Start work
                </Button>
              ) : null}
              {correctAllowed && actualStartedAt ? (
                <Button
                  disabled={busy}
                  onClick={() => startRequest("correct")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Correct start
                </Button>
              ) : null}
              {retractAllowed && actualStartedAt ? (
                <Button
                  disabled={busy}
                  onClick={() => startRequest("retract")}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Retract start
                </Button>
              ) : null}
              {completeAllowed && status !== "complete" ? (
                <Button
                  disabled={busy}
                  onClick={complete}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Check aria-hidden="true" />
                  Complete work
                </Button>
              ) : null}
              {reopenAllowed && status === "complete" ? (
                <Button
                  disabled={busy}
                  onClick={reopen}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw aria-hidden="true" />
                  Reopen work
                </Button>
              ) : null}
              {startAllowed ||
              correctAllowed ||
              retractAllowed ||
              completeAllowed ||
              reopenAllowed ||
              updateAllowed ? null : (
                <p className="text-muted-foreground text-sm">
                  You can view this Sub-milestone, but you cannot change its
                  field execution.
                </p>
              )}
            </fieldset>
            {actualStartedAt === undefined && completeAllowed ? (
              <p className="text-muted-foreground text-xs">
                If work has not been started, completing it asks you to confirm
                the actual start first. Both events are recorded in the audit
                trail.
              </p>
            ) : null}
          </FramePanel>
        </Frame>
      )}
      {isCanonicalSubmilestoneSuperseded(bootstrap) ||
      readOnly ||
      hasRevision ? null : (
        <Frame aria-live="polite">
          <FramePanel
            className="border-warning/35 bg-warning/8 p-3 text-sm"
            role="alert"
          >
            <p className="font-medium">Refresh required before field changes</p>
            <p className="mt-1 text-muted-foreground text-xs">
              The canonical workflow revision is unavailable. Refresh this
              Sub-milestone before recording a start, completion, or execution
              update.
            </p>
          </FramePanel>
        </Frame>
      )}

      {startDialog ? (
        <MilestoneStartDialog
          onClose={() => {
            setStartDialog(null);
            setCompleteAfterStart(false);
          }}
          onConfirm={async (input) => {
            setBusy(true);
            setError("");
            try {
              await confirmStart(input);
              setStartDialog(null);
            } catch (caught) {
              setError(errorMessage(caught));
              throw caught;
            } finally {
              setBusy(false);
            }
          }}
          request={startDialog}
        />
      ) : null}
    </div>
  );
}

function dependencyBlockers(bootstrap: CanonicalWorkspaceBootstrap) {
  return arrayValue(
    object(bootstrap.overview).dependencyBlockers ??
      bootstrap.dependencyBlockers
  ).map((value) => {
    const blocker = object(value);
    return {
      milestoneKey: stringValue(blocker.milestoneKey ?? blocker.key),
      milestoneName: stringValue(
        blocker.milestoneName ?? blocker.name,
        "Predecessor milestone"
      ),
      status:
        stringValue(blocker.status, "planned") === "in_progress"
          ? ("in_progress" as const)
          : ("planned" as const),
    };
  });
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="break-words font-medium text-sm tabular-nums">{value}</dd>
    </div>
  );
}
