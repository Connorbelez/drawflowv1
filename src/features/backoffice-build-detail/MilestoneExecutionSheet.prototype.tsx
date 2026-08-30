"use client";

/**
 * PROTOTYPE — THROWAWAY.
 * Three variants of the builder milestone execution sheet, switchable via
 * `?variant=ledger|console|field-walk` on the existing Builder Build route.
 * State is intentionally local and must never call production mutations.
 */

import { useMemo, useState } from "react";
import { PrototypeSwitcher } from "#/components/prototype-switcher.tsx";
import { Sheet } from "#/components/ui/sheet.tsx";
import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface.tsx";
import type {
  DetailTab,
  MilestonePrototypeVariant,
  PrototypeSubmilestone,
  WorkState,
} from "./-milestone-execution-contracts.ts";
import { VARIANTS } from "./-milestone-execution-contracts.ts";
import { buildPrototypeModel, nameFor } from "./-milestone-execution-model.ts";
import {
  CompletionLedgerVariant,
  FieldWalkVariant,
  OperationsConsoleVariant,
} from "./-milestone-execution-variants.tsx";

export type { MilestonePrototypeVariant } from "./-milestone-execution-contracts.ts";

export function MilestoneExecutionSheetPrototype({
  detail,
  milestoneKey,
  onExit,
  onVariantChange,
  variant,
}: {
  detail: ProductionBuildDetail;
  milestoneKey?: string;
  onExit: () => void;
  onVariantChange: (variant: MilestonePrototypeVariant) => void;
  variant: MilestonePrototypeVariant;
}) {
  const initialModel = useMemo(
    () => buildPrototypeModel(detail, milestoneKey),
    [detail, milestoneKey]
  );
  const [model, setModel] = useState(initialModel);
  const [selectedKey, setSelectedKey] = useState(
    initialModel.submilestones[0]?.key ?? ""
  );
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [fieldStep, setFieldStep] = useState(0);

  const selected =
    model.submilestones.find((item) => item.key === selectedKey) ??
    model.submilestones[0];
  const focused = detailKey
    ? model.submilestones.find((item) => item.key === detailKey)
    : undefined;

  const updateItem = (
    key: string,
    update: (item: PrototypeSubmilestone) => PrototypeSubmilestone,
    message: string
  ) => {
    setModel((current) => ({
      ...current,
      actionLog: [message, ...current.actionLog].slice(0, 12),
      milestoneSubmitted: false,
      submilestones: current.submilestones.map((item) =>
        item.key === key ? update(item) : item
      ),
    }));
  };

  const setWorkState = (key: string, workState: WorkState) =>
    updateItem(
      key,
      (item) => ({ ...item, workState }),
      `${nameFor(model, key)} changed to ${workState.replace("_", " ")}.`
    );

  const setActualCost = (key: string, value: string) => {
    const dollars = Number(value.replace(/[^0-9.]/g, ""));
    updateItem(
      key,
      (item) => ({
        ...item,
        actualCostCents:
          value.trim() === "" || !Number.isFinite(dollars)
            ? null
            : Math.round(dollars * 100),
      }),
      `${nameFor(model, key)} actual cost updated locally.`
    );
  };

  const assignContractor = (key: string) =>
    updateItem(
      key,
      (item) => ({
        ...item,
        contractor: item.contractor ?? "Lakeview Trades",
        contractorRole: item.contractorRole ?? "Assigned contractor",
      }),
      `${nameFor(model, key)} assigned to Lakeview Trades.`
    );

  const attachEvidence = (key: string, fileName?: string) =>
    updateItem(
      key,
      (item) => ({
        ...item,
        evidence: [
          ...item.evidence,
          {
            fileName: fileName || `site-photo-${item.evidence.length + 1}.jpg`,
            id: `prototype-evidence-${Date.now()}`,
            locationVerified: true,
            source: "Builder upload",
          },
        ],
      }),
      `${nameFor(model, key)} received a local evidence attachment.`
    );

  const setFieldNote = (key: string, fieldNote: string) =>
    updateItem(
      key,
      (item) => ({ ...item, fieldNote }),
      `${nameFor(model, key)} field note updated locally.`
    );

  const submitMilestone = () => {
    if (model.submilestones.some((item) => item.workState !== "complete")) {
      return;
    }
    setModel((current) => ({
      ...current,
      actionLog: [
        "Milestone completion submitted locally for lender review.",
        ...current.actionLog,
      ].slice(0, 12),
      milestoneSubmitted: true,
    }));
  };

  const completeAndAdvance = () => {
    if (!selected) {
      return;
    }
    const next = model.submilestones.find(
      (item) => item.key !== selected.key && item.workState !== "complete"
    );
    setWorkState(selected.key, "complete");
    if (next) {
      setSelectedKey(next.key);
      setFieldStep(0);
    } else {
      onVariantChange("ledger");
    }
  };

  const openGuidedCompletion = () => {
    const firstIncomplete = model.submilestones.find(
      (item) => item.workState !== "complete"
    );
    if (firstIncomplete) {
      setSelectedKey(firstIncomplete.key);
      setFieldStep(0);
    }
    onVariantChange("field-walk");
  };

  const shared = {
    assignContractor,
    attachEvidence,
    detailTab,
    model,
    onExit,
    onDetailTabChange: setDetailTab,
    onOpenGuidedCompletion: openGuidedCompletion,
    onOpenDetail: (key: string, tab: DetailTab = "overview") => {
      setDetailKey(key);
      setDetailTab(tab);
    },
    setActualCost,
    setFieldNote,
    setWorkState,
    submitMilestone,
  };

  return (
    <>
      <Sheet open>
        {variant === "ledger" ? (
          <CompletionLedgerVariant
            {...shared}
            focused={focused}
            onBack={() => setDetailKey(null)}
          />
        ) : null}
        {variant === "console" ? (
          <OperationsConsoleVariant
            {...shared}
            onSelect={setSelectedKey}
            selected={selected}
          />
        ) : null}
        {variant === "field-walk" ? (
          <FieldWalkVariant
            {...shared}
            fieldStep={fieldStep}
            onCompleteAndAdvance={completeAndAdvance}
            onFieldStepChange={setFieldStep}
            onSelect={(key) => {
              setSelectedKey(key);
              setFieldStep(0);
            }}
            selected={selected}
          />
        ) : null}
      </Sheet>
      <PrototypeSwitcher
        current={variant}
        onChange={onVariantChange}
        onExit={onExit}
        variants={VARIANTS}
      />
    </>
  );
}
