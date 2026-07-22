"use client";

/**
 * PROTOTYPE — THROWAWAY.
 * Three variants of the builder milestone execution sheet, switchable via
 * `?variant=ledger|console|field-walk` on the existing Builder Build route.
 * State is intentionally local and must never call production mutations.
 */

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileImage,
  ListChecks,
  MapPinOff,
  Package,
  Paperclip,
  Search,
  UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PrototypeSwitcher } from "#/components/prototype-switcher.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type { ProductionBuildDetail } from "./ProductionBuildDetailSurface.tsx";

export type MilestonePrototypeVariant = "ledger" | "console" | "field-walk";

type WorkState = "not_started" | "in_progress" | "complete";
type DetailTab = "overview" | "evidence" | "people" | "materials" | "notes";

const WHITESPACE_REGEX = /\s+/;

interface PrototypeEvidence {
  fileName: string;
  id: string;
  locationVerified: boolean;
  source: string;
}

interface PrototypeSubmilestone {
  actualCostCents: number | null;
  contractor: string | null;
  contractorRole: string | null;
  description: string;
  endDate: string;
  evidence: PrototypeEvidence[];
  fieldNote: string;
  key: string;
  materials: string[];
  name: string;
  plannedBudgetCents: number;
  startDate: string;
  workState: WorkState;
}

interface PrototypeModel {
  actionLog: string[];
  milestoneKey: string;
  milestoneName: string;
  milestoneSubmitted: boolean;
  plannedBudgetCents: number;
  plannedEndDate: string;
  plannedStartDate: string;
  submilestones: PrototypeSubmilestone[];
}

const VARIANTS = [
  { label: "Completion Ledger", value: "ledger" as const },
  { label: "Operations Console", value: "console" as const },
  { label: "Guided Field Walk", value: "field-walk" as const },
];

const MATERIAL_FALLBACKS = [
  ["Ductwork package", "Roof curbs"],
  ["PEX supply", "Rough-in valves"],
  ["Fixtures allowance", "Drain fittings", "Water heaters"],
  ["Panel package", "Branch wiring"],
];

const CONTRACTOR_FALLBACKS = [
  ["Northline Mechanical", "HVAC contractor"],
  [null, null],
  ["Atlas Plumbing Supply", "Supplier"],
  ["Northpoint Electric", "Electrical contractor"],
] as const;

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

  const _record = (message: string) => {
    setModel((current) => ({
      ...current,
      actionLog: [message, ...current.actionLog].slice(0, 12),
    }));
  };

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

interface SharedVariantProps {
  assignContractor: (key: string) => void;
  attachEvidence: (key: string, fileName?: string) => void;
  detailTab: DetailTab;
  model: PrototypeModel;
  onDetailTabChange: (tab: DetailTab) => void;
  onExit: () => void;
  onOpenDetail: (key: string, tab?: DetailTab) => void;
  onOpenGuidedCompletion: () => void;
  setActualCost: (key: string, value: string) => void;
  setFieldNote: (key: string, value: string) => void;
  setWorkState: (key: string, state: WorkState) => void;
  submitMilestone: () => void;
}

function CompletionLedgerVariant({
  assignContractor,
  attachEvidence,
  detailTab,
  focused,
  model,
  onBack,
  onDetailTabChange,
  onExit,
  onOpenGuidedCompletion,
  onOpenDetail,
  setActualCost,
  setFieldNote,
  setWorkState,
  submitMilestone,
}: SharedVariantProps & {
  focused?: PrototypeSubmilestone;
  onBack: () => void;
}) {
  return (
    <SheetPopup
      className="w-full sm:max-w-[680px]"
      closeProps={{ onClick: onExit }}
      data-testid="milestone-prototype-ledger"
      side="right"
    >
      <PrototypeSheetHeader
        eyebrow="A · Completion ledger"
        model={model}
        subtitle="Everything needed to close the scope, with one detail state."
      />
      <SheetPanel className="grid gap-4 px-3 sm:px-5">
        <PrototypeNotice copy="Local fixture state · actions are safe to click and never persist." />
        {focused ? (
          <SubmilestoneFocusView
            assignContractor={assignContractor}
            attachEvidence={attachEvidence}
            detailTab={detailTab}
            item={focused}
            onBack={onBack}
            onDetailTabChange={onDetailTabChange}
            setActualCost={setActualCost}
            setFieldNote={setFieldNote}
            setWorkState={setWorkState}
          />
        ) : (
          <>
            <MilestoneSummary model={model} />
            <ol className="grid gap-3">
              {model.submilestones.map((item, index) => (
                <LedgerCard
                  assignContractor={assignContractor}
                  attachEvidence={attachEvidence}
                  index={index}
                  item={item}
                  key={item.key}
                  onOpenDetail={onOpenDetail}
                  setActualCost={setActualCost}
                  setWorkState={setWorkState}
                />
              ))}
            </ol>
            <PrototypeState model={model} />
          </>
        )}
      </SheetPanel>
      <CompletionFooter
        model={model}
        onResolveIncomplete={onOpenGuidedCompletion}
        onSubmit={submitMilestone}
      />
    </SheetPopup>
  );
}

function LedgerCard({
  assignContractor,
  attachEvidence,
  index,
  item,
  onOpenDetail,
  setActualCost,
  setWorkState,
}: {
  assignContractor: (key: string) => void;
  attachEvidence: (key: string, fileName?: string) => void;
  index: number;
  item: PrototypeSubmilestone;
  onOpenDetail: (key: string, tab?: DetailTab) => void;
  setActualCost: (key: string, value: string) => void;
  setWorkState: (key: string, state: WorkState) => void;
}) {
  const unverified = item.evidence.filter(
    (evidence) => !evidence.locationVerified
  ).length;
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-xl shadow-none",
        item.workState === "complete" && "border-emerald-500/30"
      )}
      data-testid={`prototype-ledger-item-${item.key}`}
      render={<li />}
    >
      <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <WorkStateIcon state={item.workState} />
          <Button
            className="h-auto min-w-0 justify-start border-transparent p-0 text-left text-foreground hover:bg-transparent"
            onClick={() => onOpenDetail(item.key)}
            variant="ghost"
          >
            <span className="min-w-0">
              <span className="block text-[10px] text-muted-foreground uppercase tracking-wider">
                Scope {index + 1}
              </span>
              <span className="block truncate font-semibold text-sm">
                {item.name}
              </span>
            </span>
            <ChevronRight className="ml-1 size-4 shrink-0" />
          </Button>
        </div>
        <CardAction>
          <WorkStateSelect
            item={item}
            onChange={(state) => setWorkState(item.key, state)}
          />
        </CardAction>
      </CardHeader>
      <CardPanel className="grid gap-3 p-3 pt-1 sm:p-4 sm:pt-1">
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-3">
          <Metric
            label="Planned"
            value={formatMoney(item.plannedBudgetCents)}
          />
          <Metric label="Start" value={formatShortDate(item.startDate)} />
          <Metric label="End" value={formatShortDate(item.endDate)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Contractor
            </span>
            {item.contractor ? (
              <button
                className="flex min-h-9 items-center gap-2 rounded-lg border bg-background px-2.5 text-left text-xs hover:bg-muted/40"
                onClick={() => onOpenDetail(item.key, "people")}
                type="button"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-[10px]">
                  {initials(item.contractor)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {item.contractor}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {item.contractorRole}
                  </span>
                </span>
              </button>
            ) : (
              <Button
                className="justify-start"
                onClick={() => assignContractor(item.key)}
                size="sm"
                variant="outline"
              >
                <UserPlus />
                Assign contractor
              </Button>
            )}
          </div>
          <div className="grid gap-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Materials
            </span>
            <button
              className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs hover:bg-muted/40"
              onClick={() => onOpenDetail(item.key, "materials")}
              type="button"
            >
              <Package className="size-3.5 text-muted-foreground" />
              {item.materials.slice(0, 2).map((material) => (
                <span className="rounded bg-muted px-1.5 py-0.5" key={material}>
                  {material}
                </span>
              ))}
              {item.materials.length > 2 ? (
                <span className="text-muted-foreground">
                  +{item.materials.length - 2}
                </span>
              ) : null}
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label
            className="grid gap-1.5 text-xs"
            htmlFor={`prototype-ledger-cost-${item.key}`}
          >
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Actual realized cost · optional
            </span>
            <div className="relative">
              <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                aria-label={`Actual realized cost for ${item.name}`}
                className="pl-6 tabular-nums"
                id={`prototype-ledger-cost-${item.key}`}
                inputMode="decimal"
                onChange={(event) =>
                  setActualCost(item.key, event.currentTarget.value)
                }
                placeholder="Not reported"
                value={
                  item.actualCostCents === null
                    ? ""
                    : String(item.actualCostCents / 100)
                }
              />
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            <EvidenceUpload compact item={item} onAttach={attachEvidence} />
            <Button
              onClick={() =>
                setWorkState(
                  item.key,
                  item.workState === "complete" ? "in_progress" : "complete"
                )
              }
              size="sm"
              variant={item.workState === "complete" ? "outline" : "default"}
            >
              <Check />
              {item.workState === "complete" ? "Reopen" : "Mark complete"}
            </Button>
          </div>
        </div>
        {unverified > 0 ? (
          <button
            className="flex items-center gap-2 text-left text-amber-700 text-xs dark:text-amber-300"
            onClick={() => onOpenDetail(item.key, "evidence")}
            type="button"
          >
            <MapPinOff className="size-3.5" />
            {unverified} attached file{unverified === 1 ? " is" : "s are"}{" "}
            location unverified and retained for review.
          </button>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function OperationsConsoleVariant({
  assignContractor,
  attachEvidence,
  detailTab,
  model,
  onDetailTabChange,
  onExit,
  onOpenGuidedCompletion,
  onOpenDetail,
  onSelect,
  selected,
  setActualCost,
  setFieldNote,
  setWorkState,
  submitMilestone,
}: SharedVariantProps & {
  onSelect: (key: string) => void;
  selected?: PrototypeSubmilestone;
}) {
  const [filter, setFilter] = useState<"all" | "incomplete" | "unassigned">(
    "all"
  );
  const [query, setQuery] = useState("");
  const rows = model.submilestones.filter((item) => {
    const matchesQuery = item.name.toLowerCase().includes(query.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "incomplete" && item.workState !== "complete") ||
      (filter === "unassigned" && !item.contractor);
    return matchesQuery && matchesFilter;
  });

  return (
    <SheetPopup
      className="w-full sm:max-w-[min(1180px,calc(100vw-2rem))]"
      closeProps={{ onClick: onExit }}
      data-testid="milestone-prototype-console"
      side="right"
    >
      <PrototypeSheetHeader
        eyebrow="B · Operations console"
        model={model}
        subtitle="Scan and compare every scope item, then inspect without losing position."
      />
      <SheetPanel className="grid gap-3 px-3 sm:px-5">
        <PrototypeNotice copy="Local fixture state · dense desktop layout collapses to a mobile work list." />
        <MilestoneSummary compact model={model} />
        <Frame>
          <FramePanel className="flex flex-wrap items-center gap-2 p-2">
            <div className="relative min-w-52 flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search sub-milestones"
                className="pl-8"
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search scope"
                value={query}
              />
            </div>
            <NativeSelect
              aria-label="Filter sub-milestones"
              className="min-w-36"
              onChange={(event) =>
                setFilter(event.currentTarget.value as typeof filter)
              }
              value={filter}
            >
              <NativeSelectOption value="all">All scope</NativeSelectOption>
              <NativeSelectOption value="incomplete">
                Incomplete
              </NativeSelectOption>
              <NativeSelectOption value="unassigned">
                Unassigned
              </NativeSelectOption>
            </NativeSelect>
          </FramePanel>
        </Frame>
        <div className="grid min-h-[32rem] gap-3 md:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
          <Frame className="hidden md:flex">
            <FramePanel className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-52 bg-background">
                      Scope
                    </TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Planned</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Materials</TableHead>
                    <TableHead>Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((item) => (
                    <TableRow
                      className="cursor-pointer"
                      data-state={
                        selected?.key === item.key ? "selected" : undefined
                      }
                      key={item.key}
                      onClick={() => onSelect(item.key)}
                    >
                      <TableCell className="sticky left-0 z-10 bg-background">
                        <div className="flex items-center gap-2">
                          <WorkStateIcon state={item.workState} />
                          <button
                            className="font-medium hover:underline"
                            onClick={() => onSelect(item.key)}
                            type="button"
                          >
                            {item.name}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatShortDate(item.startDate)}–
                        {formatShortDate(item.endDate)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatMoney(item.plannedBudgetCents)}
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Input
                          aria-label={`Actual cost for ${item.name}`}
                          className="h-7 w-24 text-xs tabular-nums"
                          inputMode="decimal"
                          onChange={(event) =>
                            setActualCost(item.key, event.currentTarget.value)
                          }
                          placeholder="—"
                          value={
                            item.actualCostCents === null
                              ? ""
                              : String(item.actualCostCents / 100)
                          }
                        />
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        {item.contractor ? (
                          <Button
                            className="h-auto p-0"
                            onClick={() => onSelect(item.key)}
                            variant="link"
                          >
                            {item.contractor}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => assignContractor(item.key)}
                            size="xs"
                            variant="outline"
                          >
                            <UserPlus />
                            Assign
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>{item.materials.length}</TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Button
                          onClick={() => onOpenDetail(item.key, "evidence")}
                          size="xs"
                          variant="ghost"
                        >
                          <Paperclip />
                          {item.evidence.length}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </FramePanel>
          </Frame>
          <div className="grid gap-2 md:hidden">
            {rows.map((item) => (
              <Card
                className="rounded-xl shadow-none"
                key={item.key}
                onClick={() => onSelect(item.key)}
                render={<button type="button" />}
              >
                <CardPanel className="grid grid-cols-[1fr_auto] gap-3 p-3 text-left">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <WorkStateIcon state={item.workState} />
                      <span className="truncate font-medium text-sm">
                        {item.name}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {formatMoney(item.plannedBudgetCents)} ·{" "}
                      {item.contractor ?? "Unassigned"}
                    </p>
                  </div>
                  <ChevronRight />
                </CardPanel>
              </Card>
            ))}
          </div>
          {selected ? (
            <Frame>
              <FramePanel className="grid content-start gap-3 p-3 sm:p-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Inspector
                  </p>
                  <h3 className="font-semibold text-lg">{selected.name}</h3>
                </div>
                <SubmilestoneTabs
                  assignContractor={assignContractor}
                  attachEvidence={attachEvidence}
                  detailTab={detailTab}
                  item={selected}
                  onDetailTabChange={onDetailTabChange}
                  setActualCost={setActualCost}
                  setFieldNote={setFieldNote}
                  setWorkState={setWorkState}
                />
              </FramePanel>
            </Frame>
          ) : null}
        </div>
        <PrototypeState model={model} />
      </SheetPanel>
      <CompletionFooter
        model={model}
        onResolveIncomplete={onOpenGuidedCompletion}
        onSubmit={submitMilestone}
      />
    </SheetPopup>
  );
}

function FieldWalkVariant({
  assignContractor,
  attachEvidence,
  fieldStep,
  model,
  onCompleteAndAdvance,
  onExit,
  onFieldStepChange,
  onOpenGuidedCompletion,
  onSelect,
  selected,
  setActualCost,
  setFieldNote,
  submitMilestone,
}: SharedVariantProps & {
  fieldStep: number;
  onCompleteAndAdvance: () => void;
  onFieldStepChange: (step: number) => void;
  onSelect: (key: string) => void;
  selected?: PrototypeSubmilestone;
}) {
  const steps = ["Scope", "People", "Capture", "Cost", "Review"];
  return (
    <SheetPopup
      className="w-full sm:max-w-[900px]"
      closeProps={{ onClick: onExit }}
      data-testid="milestone-prototype-field-walk"
      side="right"
    >
      <PrototypeSheetHeader
        eyebrow="C · Guided field walk"
        model={model}
        subtitle="Walk the site one work item at a time and capture completion in context."
      />
      <SheetPanel className="grid gap-3 px-3 sm:px-5">
        <PrototypeNotice copy="Local fixture state · designed for phone, tablet, and camera-first capture." />
        <div className="grid min-h-[34rem] gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Frame className="hidden lg:flex">
            <FramePanel className="grid content-start gap-2 p-2">
              <p className="px-2 pt-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                Field checklist
              </p>
              {model.submilestones.map((item, index) => (
                <Card
                  className={cn(
                    "rounded-lg shadow-none",
                    selected?.key === item.key &&
                      "border-primary/50 bg-primary/5"
                  )}
                  key={item.key}
                  onClick={() => onSelect(item.key)}
                  render={<button type="button" />}
                >
                  <CardPanel className="flex items-center gap-2 p-2 text-left">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted font-semibold text-[10px]">
                      {item.workState === "complete" ? (
                        <Check className="size-3.5 text-emerald-600" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-xs">
                        {item.name}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {workStateLabel(item.workState)}
                      </span>
                    </span>
                    <ChevronRight className="size-3.5" />
                  </CardPanel>
                </Card>
              ))}
            </FramePanel>
          </Frame>
          {selected ? (
            <Frame>
              <FramePanel className="grid content-start gap-4 p-3 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Current work item
                    </p>
                    <h3 className="font-semibold text-lg">{selected.name}</h3>
                    <p className="text-muted-foreground text-xs">
                      {formatShortDate(selected.startDate)}–
                      {formatShortDate(selected.endDate)} ·{" "}
                      {formatMoney(selected.plannedBudgetCents)} planned
                    </p>
                  </div>
                  <NativeSelect
                    aria-label="Choose field work item"
                    className="lg:hidden"
                    onChange={(event) => onSelect(event.currentTarget.value)}
                    value={selected.key}
                  >
                    {model.submilestones.map((item) => (
                      <NativeSelectOption key={item.key} value={item.key}>
                        {item.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <Progress value={((fieldStep + 1) / steps.length) * 100} />
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {steps.map((step, index) => (
                    <Button
                      className="min-w-fit flex-1"
                      key={step}
                      onClick={() => onFieldStepChange(index)}
                      size="xs"
                      variant={index === fieldStep ? "default" : "outline"}
                    >
                      {index + 1}. {step}
                    </Button>
                  ))}
                </div>
                <FieldStep
                  assignContractor={assignContractor}
                  attachEvidence={attachEvidence}
                  item={selected}
                  setActualCost={setActualCost}
                  setFieldNote={setFieldNote}
                  step={fieldStep}
                />
                <div className="flex items-center justify-between gap-2 border-t pt-4">
                  <Button
                    disabled={fieldStep === 0}
                    onClick={() =>
                      onFieldStepChange(Math.max(0, fieldStep - 1))
                    }
                    variant="outline"
                  >
                    <ArrowLeft />
                    Back
                  </Button>
                  {fieldStep < steps.length - 1 ? (
                    <Button
                      onClick={() =>
                        onFieldStepChange(
                          Math.min(steps.length - 1, fieldStep + 1)
                        )
                      }
                    >
                      Continue
                      <ChevronRight />
                    </Button>
                  ) : (
                    <Button onClick={onCompleteAndAdvance}>
                      <Check />
                      Mark complete & next
                    </Button>
                  )}
                </div>
              </FramePanel>
            </Frame>
          ) : null}
        </div>
        <PrototypeState model={model} />
      </SheetPanel>
      <CompletionFooter
        model={model}
        onResolveIncomplete={onOpenGuidedCompletion}
        onSubmit={submitMilestone}
      />
    </SheetPopup>
  );
}

function FieldStep({
  assignContractor,
  attachEvidence,
  item,
  setActualCost,
  setFieldNote,
  step,
}: {
  assignContractor: (key: string) => void;
  attachEvidence: (key: string, fileName?: string) => void;
  item: PrototypeSubmilestone;
  setActualCost: (key: string, value: string) => void;
  setFieldNote: (key: string, value: string) => void;
  step: number;
}) {
  if (step === 0) {
    return (
      <div className="grid gap-3">
        <StepHeading
          copy="Confirm the scope and the approved plan before recording field work."
          title="Scope and plan"
        />
        <Frame>
          <FramePanel className="grid gap-3 p-3 sm:grid-cols-3">
            <Metric
              label="Planned budget"
              value={formatMoney(item.plannedBudgetCents)}
            />
            <Metric label="Start" value={formatShortDate(item.startDate)} />
            <Metric label="End" value={formatShortDate(item.endDate)} />
          </FramePanel>
          <FramePanel className="p-3 text-sm">{item.description}</FramePanel>
        </Frame>
        <div className="grid gap-2">
          <p className="font-medium text-sm">Attached materials</p>
          <div className="flex flex-wrap gap-2">
            {item.materials.map((material) => (
              <Badge key={material} variant="outline">
                <Package />
                {material}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="grid gap-3">
        <StepHeading
          copy="Confirm who delivered this scope or assign someone before continuing."
          title="Responsible people"
        />
        <Card className="rounded-xl shadow-none">
          <CardPanel className="flex items-center justify-between gap-3 p-4">
            {item.contractor ? (
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-primary/15 font-semibold text-sm">
                  {initials(item.contractor)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.contractor}</p>
                  <p className="truncate text-muted-foreground text-sm">
                    {item.contractorRole}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-medium">No contractor assigned</p>
                <p className="text-muted-foreground text-sm">
                  Add the person or company responsible for this work.
                </p>
              </div>
            )}
            <Button
              onClick={() => assignContractor(item.key)}
              variant="outline"
            >
              <UserPlus />
              {item.contractor ? "Change" : "Assign"}
            </Button>
          </CardPanel>
        </Card>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="grid gap-3">
        <StepHeading
          copy="Capture photos or files. Location failure keeps the evidence and flags it for review."
          title="Capture evidence"
        />
        <EvidenceUpload item={item} onAttach={attachEvidence} />
        <EvidenceGallery item={item} />
        <label
          className="grid gap-2 font-medium text-sm"
          htmlFor={`prototype-field-note-${item.key}`}
        >
          Field note
          <Textarea
            id={`prototype-field-note-${item.key}`}
            onChange={(event) =>
              setFieldNote(item.key, event.currentTarget.value)
            }
            placeholder="What was completed, observed, or blocked?"
            value={item.fieldNote}
          />
        </label>
      </div>
    );
  }
  if (step === 3) {
    return (
      <div className="grid gap-3">
        <StepHeading
          copy="Record the realized cost if it is known. Empty is different from zero."
          title="Actual realized cost"
        />
        <Frame>
          <FramePanel className="grid gap-3 p-4 sm:grid-cols-2">
            <Metric
              label="Planned budget"
              value={formatMoney(item.plannedBudgetCents)}
            />
            <label
              className="grid gap-1.5 text-sm"
              htmlFor={`prototype-field-cost-${item.key}`}
            >
              Reported actual · optional
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  className="pl-7 text-lg tabular-nums"
                  id={`prototype-field-cost-${item.key}`}
                  inputMode="decimal"
                  onChange={(event) =>
                    setActualCost(item.key, event.currentTarget.value)
                  }
                  placeholder="Not reported"
                  value={
                    item.actualCostCents === null
                      ? ""
                      : String(item.actualCostCents / 100)
                  }
                />
              </div>
            </label>
          </FramePanel>
        </Frame>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <StepHeading
        copy="Review what will be recorded, then explicitly mark only this work item complete."
        title="Review completion"
      />
      <Frame>
        <FramePanel className="grid gap-3 p-4 sm:grid-cols-2">
          <ReviewLine
            label="Contractor"
            value={item.contractor ?? "Unassigned"}
          />
          <ReviewLine
            label="Evidence"
            value={`${item.evidence.length} attached`}
          />
          <ReviewLine
            label="Actual cost"
            value={
              item.actualCostCents === null
                ? "Not reported"
                : formatMoney(item.actualCostCents)
            }
          />
          <ReviewLine
            label="Location"
            value={
              item.evidence.some((evidence) => !evidence.locationVerified)
                ? "Review needed"
                : "Verified"
            }
          />
        </FramePanel>
      </Frame>
    </div>
  );
}

function SubmilestoneFocusView({
  assignContractor,
  attachEvidence,
  detailTab,
  item,
  onBack,
  onDetailTabChange,
  setActualCost,
  setFieldNote,
  setWorkState,
}: {
  assignContractor: (key: string) => void;
  attachEvidence: (key: string, fileName?: string) => void;
  detailTab: DetailTab;
  item: PrototypeSubmilestone;
  onBack: () => void;
  onDetailTabChange: (tab: DetailTab) => void;
  setActualCost: (key: string, value: string) => void;
  setFieldNote: (key: string, value: string) => void;
  setWorkState: (key: string, state: WorkState) => void;
}) {
  return (
    <div className="grid gap-4">
      <Button className="w-fit" onClick={onBack} size="sm" variant="ghost">
        <ArrowLeft />
        Back to milestone
      </Button>
      <div>
        <div className="flex items-center gap-2">
          <WorkStateIcon state={item.workState} />
          <h3 className="font-semibold text-xl">{item.name}</h3>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          {formatShortDate(item.startDate)}–{formatShortDate(item.endDate)} ·{" "}
          {formatMoney(item.plannedBudgetCents)} planned
        </p>
      </div>
      <SubmilestoneTabs
        assignContractor={assignContractor}
        attachEvidence={attachEvidence}
        detailTab={detailTab}
        item={item}
        onDetailTabChange={onDetailTabChange}
        setActualCost={setActualCost}
        setFieldNote={setFieldNote}
        setWorkState={setWorkState}
      />
    </div>
  );
}

function SubmilestoneTabs({
  assignContractor,
  attachEvidence,
  detailTab,
  item,
  onDetailTabChange,
  setActualCost,
  setFieldNote,
  setWorkState,
}: {
  assignContractor: (key: string) => void;
  attachEvidence: (key: string, fileName?: string) => void;
  detailTab: DetailTab;
  item: PrototypeSubmilestone;
  onDetailTabChange: (tab: DetailTab) => void;
  setActualCost: (key: string, value: string) => void;
  setFieldNote: (key: string, value: string) => void;
  setWorkState: (key: string, state: WorkState) => void;
}) {
  return (
    <Tabs
      onValueChange={(value) => onDetailTabChange(value as DetailTab)}
      value={detailTab}
    >
      <TabsList
        className="max-w-full justify-start overflow-x-auto"
        variant="underline"
      >
        <TabsTab value="overview">Overview</TabsTab>
        <TabsTab value="evidence">Evidence</TabsTab>
        <TabsTab value="people">People</TabsTab>
        <TabsTab value="materials">Materials</TabsTab>
        <TabsTab value="notes">Notes & history</TabsTab>
      </TabsList>
      <TabsPanel className="grid gap-3 pt-3" value="overview">
        <p className="text-sm leading-relaxed">{item.description}</p>
        <Frame>
          <FramePanel className="grid gap-3 p-3 sm:grid-cols-3">
            <Metric
              label="Planned"
              value={formatMoney(item.plannedBudgetCents)}
            />
            <Metric label="Start" value={formatShortDate(item.startDate)} />
            <Metric label="End" value={formatShortDate(item.endDate)} />
          </FramePanel>
          <FramePanel className="grid gap-2 p-3 sm:grid-cols-2">
            <label
              className="grid gap-1.5 text-sm"
              htmlFor={`prototype-detail-cost-${item.key}`}
            >
              Actual realized cost
              <Input
                id={`prototype-detail-cost-${item.key}`}
                inputMode="decimal"
                onChange={(event) =>
                  setActualCost(item.key, event.currentTarget.value)
                }
                placeholder="Not reported"
                value={
                  item.actualCostCents === null
                    ? ""
                    : String(item.actualCostCents / 100)
                }
              />
            </label>
            <div className="grid gap-1.5 text-sm">
              Work state
              <WorkStateSelect
                item={item}
                onChange={(state) => setWorkState(item.key, state)}
              />
            </div>
          </FramePanel>
        </Frame>
      </TabsPanel>
      <TabsPanel className="grid gap-3 pt-3" value="evidence">
        <EvidenceUpload item={item} onAttach={attachEvidence} />
        <EvidenceGallery item={item} />
      </TabsPanel>
      <TabsPanel className="grid gap-3 pt-3" value="people">
        <Card className="rounded-xl shadow-none">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Assigned contractor</CardTitle>
            <CardDescription>
              Scope-level responsibility and cost detail.
            </CardDescription>
          </CardHeader>
          <CardPanel className="p-4 pt-1">
            {item.contractor ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-medium">{item.contractor}</p>
                  <p className="text-muted-foreground text-sm">
                    {item.contractorRole}
                  </p>
                  <p className="mt-2 text-muted-foreground text-xs">
                    Estimated 24 h · Actual 21.5 h · Cost notes available
                  </p>
                </div>
                <Button
                  onClick={() => assignContractor(item.key)}
                  variant="outline"
                >
                  Change assignment
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => assignContractor(item.key)}
                variant="outline"
              >
                <UserPlus />
                Assign contractor
              </Button>
            )}
          </CardPanel>
        </Card>
      </TabsPanel>
      <TabsPanel className="grid gap-2 pt-3" value="materials">
        {item.materials.map((material, index) => (
          <Card className="rounded-xl shadow-none" key={material}>
            <CardPanel className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium text-sm">{material}</p>
                <p className="text-muted-foreground text-xs">
                  {index % 2 === 0
                    ? "Builder Supply Group"
                    : "Supplier not recorded"}{" "}
                  · Qty {index + 1}
                </p>
              </div>
              <span className="font-medium text-sm tabular-nums">
                {formatMoney(
                  Math.max(12_500, item.plannedBudgetCents / (index + 3))
                )}
              </span>
            </CardPanel>
          </Card>
        ))}
      </TabsPanel>
      <TabsPanel className="grid gap-3 pt-3" value="notes">
        <label
          className="grid gap-2 font-medium text-sm"
          htmlFor={`prototype-detail-note-${item.key}`}
        >
          Field note
          <Textarea
            id={`prototype-detail-note-${item.key}`}
            onChange={(event) =>
              setFieldNote(item.key, event.currentTarget.value)
            }
            placeholder="Add a scoped field note"
            value={item.fieldNote}
          />
        </label>
        <Frame>
          <FramePanel className="grid gap-2 p-3 text-xs">
            <p className="font-medium">Prototype audit history</p>
            <p className="text-muted-foreground">
              Builder Lead · Scope opened for field review · today
            </p>
            <p className="text-muted-foreground">
              System · Planned schedule copied from approved roadmap · Jun 2
            </p>
          </FramePanel>
        </Frame>
      </TabsPanel>
    </Tabs>
  );
}

function PrototypeSheetHeader({
  eyebrow,
  model,
  subtitle,
}: {
  eyebrow: string;
  model: PrototypeModel;
  subtitle: string;
}) {
  const complete = completedCount(model);
  return (
    <SheetHeader className="border-b px-4 py-4 sm:px-6">
      <div className="pr-8">
        <p className="text-[10px] text-lime-600 uppercase tracking-[0.16em] dark:text-lime-300">
          Prototype · {eyebrow}
        </p>
        <SheetTitle className="mt-1">{model.milestoneName}</SheetTitle>
        <SheetDescription className="mt-1">{subtitle}</SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{model.milestoneKey.toUpperCase()}</Badge>
          <Badge
            variant={
              complete === model.submilestones.length ? "success" : "secondary"
            }
          >
            <ListChecks />
            {complete}/{model.submilestones.length} complete
          </Badge>
          {model.milestoneSubmitted ? (
            <Badge variant="success">
              <CheckCircle2 />
              Submitted for lender review
            </Badge>
          ) : null}
        </div>
      </div>
    </SheetHeader>
  );
}

function PrototypeNotice({ copy }: { copy: string }) {
  return (
    <Frame>
      <FramePanel className="flex items-center gap-2 p-2.5 text-muted-foreground text-xs">
        <ClipboardCheck className="size-4 shrink-0 text-lime-600 dark:text-lime-300" />
        {copy}
      </FramePanel>
    </Frame>
  );
}

function MilestoneSummary({
  compact = false,
  model,
}: {
  compact?: boolean;
  model: PrototypeModel;
}) {
  const complete = completedCount(model);
  const actual = model.submilestones.reduce(
    (sum, item) => sum + (item.actualCostCents ?? 0),
    0
  );
  return (
    <Frame>
      <FramePanel className={cn("grid gap-3", compact ? "p-3" : "p-4")}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Milestone progress</p>
            <p className="text-muted-foreground text-xs">
              {complete} of {model.submilestones.length} sub-milestones complete
            </p>
          </div>
          <span className="font-semibold text-lg tabular-nums">
            {Math.round(
              (complete / Math.max(1, model.submilestones.length)) * 100
            )}
            %
          </span>
        </div>
        <Progress
          value={(complete / Math.max(1, model.submilestones.length)) * 100}
        />
        <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
          <Metric
            label="Planned"
            value={formatMoney(model.plannedBudgetCents)}
          />
          <Metric
            label="Actual entered"
            value={actual > 0 ? formatMoney(actual) : "—"}
          />
          <Metric
            label="Start"
            value={formatShortDate(model.plannedStartDate)}
          />
          <Metric label="End" value={formatShortDate(model.plannedEndDate)} />
        </div>
      </FramePanel>
    </Frame>
  );
}

function CompletionFooter({
  model,
  onResolveIncomplete,
  onSubmit,
}: {
  model: PrototypeModel;
  onResolveIncomplete: () => void;
  onSubmit: () => void;
}) {
  const incomplete = model.submilestones.filter(
    (item) => item.workState !== "complete"
  );
  const eligible = incomplete.length === 0;
  return (
    <SheetFooter className="z-20 items-stretch gap-3 bg-background/95 px-4 pb-20 backdrop-blur sm:flex-row sm:items-center sm:px-6 sm:pb-16">
      <div className="min-w-0 flex-1 text-left">
        <p className="font-medium text-sm">
          {eligible
            ? "All sub-milestones are complete"
            : `${incomplete.length} sub-milestone${incomplete.length === 1 ? "" : "s"} still incomplete`}
        </p>
        <p
          className="truncate text-muted-foreground text-xs"
          id="prototype-completion-blockers"
        >
          {eligible
            ? "Ready to submit a builder completion claim for lender review."
            : `Guided completion will walk through: ${incomplete.map((item) => item.name).join(" · ")}`}
        </p>
      </div>
      <Button
        aria-describedby="prototype-completion-blockers"
        disabled={model.milestoneSubmitted}
        onClick={eligible ? onSubmit : onResolveIncomplete}
      >
        {eligible ? <ClipboardCheck /> : <ListChecks />}
        {model.milestoneSubmitted
          ? "Completion submitted"
          : eligible
            ? "Submit milestone completion"
            : "Complete remaining scope"}
      </Button>
    </SheetFooter>
  );
}

function EvidenceUpload({
  compact = false,
  item,
  onAttach,
}: {
  compact?: boolean;
  item: PrototypeSubmilestone;
  onAttach: (key: string, fileName?: string) => void;
}) {
  const id = `prototype-evidence-${item.key}-${compact ? "compact" : "full"}`;
  return (
    <div
      className={cn(
        !compact && "grid gap-2 rounded-xl border border-dashed p-4 text-center"
      )}
    >
      {compact ? null : (
        <>
          <FileImage className="mx-auto size-8 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">Capture or attach evidence</p>
            <p className="text-muted-foreground text-xs">
              Photos and files remain attached if location cannot be verified.
            </p>
          </div>
        </>
      )}
      <label
        className={buttonVariants({ size: "sm", variant: "outline" })}
        htmlFor={id}
      >
        <Paperclip />
        {compact ? `Evidence ${item.evidence.length}` : "Choose file"}
        <input
          className="sr-only"
          id={id}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            onAttach(item.key, file?.name);
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>
    </div>
  );
}

function EvidenceGallery({ item }: { item: PrototypeSubmilestone }) {
  if (item.evidence.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
        No evidence attached yet.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {item.evidence.map((evidence) => (
        <Card className="rounded-xl shadow-none" key={evidence.id}>
          <CardPanel className="flex items-start gap-3 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
              <FileImage className="size-5 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">
                {evidence.fileName}
              </p>
              <p className="text-muted-foreground text-xs">{evidence.source}</p>
              <Badge
                className="mt-2"
                variant={evidence.locationVerified ? "success" : "outline"}
              >
                {evidence.locationVerified ? <Check /> : <MapPinOff />}
                {evidence.locationVerified
                  ? "Location verified"
                  : "Location unverified"}
              </Badge>
            </div>
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function WorkStateSelect({
  item,
  onChange,
}: {
  item: PrototypeSubmilestone;
  onChange: (state: WorkState) => void;
}) {
  return (
    <NativeSelect
      aria-label={`Work state for ${item.name}`}
      onChange={(event) => onChange(event.currentTarget.value as WorkState)}
      value={item.workState}
    >
      <NativeSelectOption value="not_started">Not started</NativeSelectOption>
      <NativeSelectOption value="in_progress">In progress</NativeSelectOption>
      <NativeSelectOption value="complete">Complete</NativeSelectOption>
    </NativeSelect>
  );
}

function WorkStateIcon({ state }: { state: WorkState }) {
  if (state === "complete") {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
  }
  if (state === "in_progress") {
    return (
      <Circle className="size-4 shrink-0 fill-amber-400/30 text-amber-600" />
    );
  }
  return <Circle className="size-4 shrink-0 text-muted-foreground" />;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="truncate font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}

function StepHeading({ copy, title }: { copy: string; title: string }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground text-sm">{copy}</p>
    </div>
  );
}

function PrototypeState({ model }: { model: PrototypeModel }) {
  return (
    <details className="rounded-xl border bg-muted/20 p-3 text-xs">
      <summary className="cursor-pointer font-medium">Prototype state</summary>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
        {JSON.stringify(model, null, 2)}
      </pre>
    </details>
  );
}

function buildPrototypeModel(
  detail: ProductionBuildDetail,
  requestedMilestoneKey?: string
): PrototypeModel {
  const milestone =
    detail.milestones.find((item) => item.key === requestedMilestoneKey) ??
    detail.milestones[0];
  const milestoneKey = milestone?.key ?? requestedMilestoneKey ?? "milestone";
  const sourceRows = detail.submilestones.filter(
    (item) => item.milestoneKey === milestoneKey
  );
  const fallbackNames = ["HVAC", "Plumbing", "Plumbing supplies", "Electrical"];
  const rows = sourceRows.length
    ? sourceRows
    : fallbackNames.map((name, index) => ({
        budgetCents: Math.round((milestone?.budgetCents ?? 10_000_000) / 4),
        durationDays: 4 + index,
        key: `${milestoneKey}-prototype-${index + 1}`,
        milestoneKey,
        name,
        order: index + 1,
        startDay: (milestone?.dayStart ?? 0) + index * 4,
        status: "planned" as const,
      }));
  const startBase = detail.build.startDate;
  const explicitlyBudgetedCents = rows.reduce(
    (sum, row) => sum + Math.max(0, row.budgetCents ?? 0),
    0
  );
  const unbudgetedCount = rows.filter(
    (row) => !row.budgetCents || row.budgetCents <= 0
  ).length;
  const distributedBudgetCents = Math.round(
    Math.max(0, (milestone?.budgetCents ?? 0) - explicitlyBudgetedCents) /
      Math.max(1, unbudgetedCount)
  );
  const submilestones = rows.map(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This throwaway fixture assembler intentionally keeps prototype shaping local.
    (row, index): PrototypeSubmilestone => {
      const assignments = (detail.milestoneContractorAssignments ?? []).filter(
        (assignment) => assignment.submilestoneKey === row.key
      );
      const assignment = assignments[0];
      const materialRows = (detail.costItems ?? []).filter((item) =>
        item.relevantSubmilestoneKeys.includes(row.key)
      );
      const evidenceRows = (detail.evidenceAssets ?? []).filter(
        (evidence) => evidence.submilestoneKey === row.key
      );
      const fallbackContractor =
        CONTRACTOR_FALLBACKS[index % CONTRACTOR_FALLBACKS.length];
      const startDay = row.startDay ?? (milestone?.dayStart ?? 0) + index * 3;
      const durationDays = Math.max(1, row.durationDays ?? 4);
      const plannedBudgetCents =
        row.budgetCents && row.budgetCents > 0
          ? row.budgetCents
          : distributedBudgetCents;
      const actualStatus =
        row.status === "complete"
          ? "complete"
          : row.status === "in_progress"
            ? "in_progress"
            : index === 0
              ? "in_progress"
              : index === 2
                ? "complete"
                : "not_started";
      return {
        actualCostCents:
          actualStatus === "complete"
            ? Math.round(plannedBudgetCents * 0.96)
            : null,
        contractor:
          assignment?.contractor?.name ?? fallbackContractor?.[0] ?? null,
        contractorRole: assignment?.role ?? fallbackContractor?.[1] ?? null,
        description:
          materialRows.find((item) => item.description)?.description ??
          `Complete and document the ${row.name.toLowerCase()} scope in accordance with the approved roadmap and inspection requirements.`,
        endDate: addDays(startBase, startDay + durationDays - 1),
        evidence:
          evidenceRows.length > 0
            ? evidenceRows.map((evidence, evidenceIndex) => ({
                fileName: evidence.fileName,
                id: evidence.evidenceKey || `${row.key}-${evidenceIndex}`,
                locationVerified: evidence.locationVerified ?? false,
                source: evidence.source ?? "Builder upload",
              }))
            : index === 0 || index === 2
              ? [
                  {
                    fileName:
                      index === 0
                        ? "rough-in-progress.jpg"
                        : "delivery-ticket.pdf",
                    id: `${row.key}-fixture-evidence`,
                    locationVerified: index === 0,
                    source: "Prototype fixture",
                  },
                ]
              : [],
        fieldNote:
          index === 0
            ? "Crew completed the east-side rough-in. West riser remains accessible for inspection."
            : "",
        key: row.key,
        materials:
          materialRows.length > 0
            ? materialRows.map((item) => item.title)
            : (MATERIAL_FALLBACKS[index % MATERIAL_FALLBACKS.length] ?? [
                "No materials recorded",
              ]),
        name: row.name,
        plannedBudgetCents,
        startDate: addDays(startBase, startDay),
        workState: actualStatus,
      };
    }
  );
  return {
    actionLog: ["Prototype initialized with local in-memory state."],
    milestoneKey,
    milestoneName: milestone?.name ?? "Milestone execution",
    milestoneSubmitted: false,
    plannedBudgetCents:
      milestone?.budgetCents ??
      submilestones.reduce((sum, item) => sum + item.plannedBudgetCents, 0),
    plannedEndDate: addDays(startBase, milestone?.dayEnd ?? 20),
    plannedStartDate: addDays(startBase, milestone?.dayStart ?? 0),
    submilestones,
  };
}

function addDays(startIso: string, days: number) {
  const date = new Date(`${startIso.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function completedCount(model: PrototypeModel) {
  return model.submilestones.filter((item) => item.workState === "complete")
    .length;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function initials(name: string) {
  return name
    .split(WHITESPACE_REGEX)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function nameFor(model: PrototypeModel, key: string) {
  return model.submilestones.find((item) => item.key === key)?.name ?? key;
}

function workStateLabel(state: WorkState) {
  if (state === "complete") {
    return "Complete";
  }
  if (state === "in_progress") {
    return "In progress";
  }
  return "Not started";
}
