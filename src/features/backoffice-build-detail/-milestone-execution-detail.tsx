import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileImage,
  ListChecks,
  MapPinOff,
  Paperclip,
  UserPlus,
} from "lucide-react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import {
  Card,
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import type {
  DetailTab,
  PrototypeModel,
  PrototypeSubmilestone,
  WorkState,
} from "./-milestone-execution-contracts.ts";
import {
  completedCount,
  formatMoney,
  formatShortDate,
} from "./-milestone-execution-model.ts";

export function SubmilestoneFocusView({
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

export function SubmilestoneTabs({
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

export function PrototypeSheetHeader({
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

export function PrototypeNotice({ copy }: { copy: string }) {
  return (
    <Frame>
      <FramePanel className="flex items-center gap-2 p-2.5 text-muted-foreground text-xs">
        <ClipboardCheck className="size-4 shrink-0 text-lime-600 dark:text-lime-300" />
        {copy}
      </FramePanel>
    </Frame>
  );
}

export function MilestoneSummary({
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

export function CompletionFooter({
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

export function EvidenceUpload({
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

export function EvidenceGallery({ item }: { item: PrototypeSubmilestone }) {
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

export function WorkStateSelect({
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

export function WorkStateIcon({ state }: { state: WorkState }) {
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

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="truncate font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}

export function ReviewLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-medium text-sm">{value}</span>
    </div>
  );
}

export function StepHeading({ copy, title }: { copy: string; title: string }) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-muted-foreground text-sm">{copy}</p>
    </div>
  );
}

export function PrototypeState({ model }: { model: PrototypeModel }) {
  return (
    <details className="rounded-xl border bg-muted/20 p-3 text-xs">
      <summary className="cursor-pointer font-medium">Prototype state</summary>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
        {JSON.stringify(model, null, 2)}
      </pre>
    </details>
  );
}
