import {
  ArrowLeft,
  Check,
  ChevronRight,
  MapPinOff,
  Package,
  Paperclip,
  Search,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardHeader,
  CardPanel,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import {
  SheetPanel,
  SheetPopup,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  DetailTab,
  PrototypeSubmilestone,
  SharedVariantProps,
  WorkState,
} from "./-milestone-execution-contracts.ts";
import {
  formatMoney,
  formatShortDate,
  initials,
  workStateLabel,
} from "./-milestone-execution-model.ts";
import {
  CompletionFooter,
  EvidenceGallery,
  EvidenceUpload,
  Metric,
  MilestoneSummary,
  PrototypeNotice,
  PrototypeSheetHeader,
  PrototypeState,
  ReviewLine,
  StepHeading,
  SubmilestoneFocusView,
  SubmilestoneTabs,
  WorkStateIcon,
  WorkStateSelect,
} from "./-milestone-execution-detail.tsx";

export function CompletionLedgerVariant({
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

export function LedgerCard({
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

export function OperationsConsoleVariant({
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

export function FieldWalkVariant({
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

export function FieldStep({
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
