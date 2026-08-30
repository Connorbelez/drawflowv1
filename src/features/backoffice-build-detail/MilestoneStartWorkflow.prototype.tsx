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

import { useMemo, useState } from "react";
import { PrototypeSwitcher } from "#/components/prototype-switcher.tsx";
import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface.tsx";
import type {
  MilestoneStartPrototypeVariant,
  PrototypeEntrySource,
  PrototypeScenario,
  PrototypeStartState,
  SharedVariantProps,
} from "./-milestone-start-contracts.ts";
import { VARIANTS } from "./-milestone-start-contracts.ts";
import {
  buildPrototypeStartContext,
  scheduleVarianceDays,
  stateForScenario,
} from "./-milestone-start-model.ts";
import {
  CompactDialogVariant,
  ContextSplitVariant,
  GuidedFieldVariant,
} from "./-milestone-start-variants.tsx";

export type { MilestoneStartPrototypeVariant, PrototypeEntrySource } from "./-milestone-start-contracts.ts";

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
