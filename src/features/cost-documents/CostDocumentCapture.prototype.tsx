/**
 * THROWAWAY PROTOTYPE — three Cost Document Capture directions on the
 * existing Builder Build Costs route, switchable with ?variant=.
 */
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { PrototypeVariantSwitcher } from "#/components/prototype/PrototypeVariantSwitcher.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
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
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";

export type CostDocumentCapturePrototypeVariant =
  | "capture-guided"
  | "capture-ledger"
  | "capture-sourcebench";

export type CostDocumentCapturePrototypeScenario =
  | "ready"
  | "uploading"
  | "duplicate"
  | "stale-assignment";

interface CostDocumentCapturePrototypeProps {
  onClose: () => void;
  onScenarioChange: (scenario: CostDocumentCapturePrototypeScenario) => void;
  onVariantChange: (variant: CostDocumentCapturePrototypeVariant) => void;
  scenario: CostDocumentCapturePrototypeScenario;
  variant: CostDocumentCapturePrototypeVariant;
}

const VARIANTS = [
  { key: "capture-guided", name: "A — Snapline" },
  { key: "capture-ledger", name: "B — Capture Ledger" },
  { key: "capture-sourcebench", name: "C — Sourcebench" },
] as const;

const SCENARIOS: {
  key: CostDocumentCapturePrototypeScenario;
  label: string;
}[] = [
  { key: "ready", label: "Ready" },
  { key: "uploading", label: "Uploading" },
  { key: "duplicate", label: "Near duplicate" },
  { key: "stale-assignment", label: "Stale assignment" },
];

const STEPS = [
  "Capture",
  "Confirm",
  "Balance",
  "Allocate",
  "Share",
  "Freeze",
] as const;
type GuidedStep = (typeof STEPS)[number];

const LEDGER_ROWS = [
  "Source",
  "Document facts",
  "Gross reconciliation",
  "Cost allocations",
  "Access & submission",
] as const;
type LedgerRow = (typeof LEDGER_ROWS)[number];

const SOURCEBENCH_SECTIONS = [
  "Facts",
  "Amount",
  "Allocations",
  "Access",
  "Review",
] as const;
type SourcebenchSection = (typeof SOURCEBENCH_SECTIONS)[number];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    style: "currency",
  }).format(value);
}

export function CostDocumentCapturePrototype({
  onClose,
  onScenarioChange,
  onVariantChange,
  scenario,
  variant,
}: CostDocumentCapturePrototypeProps) {
  const [title, setTitle] = useState("Northline insulation package");
  const [description, setDescription] = useState(
    "Supply and delivery of exterior insulation, fasteners, and membrane accessories."
  );
  const [grossTotal, setGrossTotal] = useState(18_420);
  const [foundationAllocation, setFoundationAllocation] = useState(11_600);
  const [envelopeAllocation, setEnvelopeAllocation] = useState(6820);
  const [step, setStep] = useState<GuidedStep>("Capture");
  const [ledgerRow, setLedgerRow] = useState<LedgerRow>("Source");
  const [sourcebenchSection, setSourcebenchSection] =
    useState<SourcebenchSection>("Facts");

  const allocated = foundationAllocation + envelopeAllocation;
  const remaining = grossTotal - allocated;
  const captureState = {
    allocated,
    description,
    envelopeAllocation,
    foundationAllocation,
    grossTotal,
    remaining,
    setDescription,
    setEnvelopeAllocation,
    setFoundationAllocation,
    setGrossTotal,
    setTitle,
    title,
  };

  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open
      >
        <SheetPopup
          className="max-w-[96rem] max-sm:w-full sm:w-[calc(100%-2rem)]"
          initialFocus={false}
          showCloseButton={false}
          variant="inset"
        >
          <CaptureHeader
            onClose={onClose}
            onScenarioChange={onScenarioChange}
            scenario={scenario}
            variant={variant}
          />
          {variant === "capture-guided" ? (
            <GuidedCapture
              captureState={captureState}
              onStepChange={setStep}
              scenario={scenario}
              step={step}
            />
          ) : null}
          {variant === "capture-ledger" ? (
            <LedgerCapture
              activeRow={ledgerRow}
              captureState={captureState}
              onRowChange={setLedgerRow}
              scenario={scenario}
            />
          ) : null}
          {variant === "capture-sourcebench" ? (
            <SourcebenchCapture
              captureState={captureState}
              onSectionChange={setSourcebenchSection}
              scenario={scenario}
              section={sourcebenchSection}
            />
          ) : null}
        </SheetPopup>
      </Sheet>
      <PrototypeVariantSwitcher
        className="z-[60]"
        current={variant}
        onChange={(next) =>
          onVariantChange(next as CostDocumentCapturePrototypeVariant)
        }
        variants={VARIANTS}
      />
    </>
  );
}

function CaptureHeader({
  onClose,
  onScenarioChange,
  scenario,
  variant,
}: {
  onClose: () => void;
  onScenarioChange: (scenario: CostDocumentCapturePrototypeScenario) => void;
  scenario: CostDocumentCapturePrototypeScenario;
  variant: CostDocumentCapturePrototypeVariant;
}) {
  return (
    <SheetHeader className="gap-3 border-b pr-4 sm:pr-6">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            aria-label="Close capture"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle>New cost document</SheetTitle>
              <Badge variant="secondary">Private draft</Badge>
              <Badge variant="outline">Prototype</Badge>
            </div>
            <SheetDescription className="mt-1">
              Hamilton Infill Build · Supporting cost context only
            </SheetDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-muted-foreground text-xs sm:inline">
            Saved just now
          </span>
          <Button
            aria-label="Close"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.16em]">
          State
        </span>
        {SCENARIOS.map((item) => (
          <Button
            key={item.key}
            onClick={() => onScenarioChange(item.key)}
            size="xs"
            variant={scenario === item.key ? "default" : "outline"}
          >
            {item.label}
          </Button>
        ))}
        <span className="ml-auto hidden text-muted-foreground text-xs lg:inline">
          {variant === "capture-guided"
            ? "Guided completion"
            : variant === "capture-ledger"
              ? "Single reconciliation surface"
              : "Source-first verification"}
        </span>
      </div>
    </SheetHeader>
  );
}

interface CaptureState {
  allocated: number;
  description: string;
  envelopeAllocation: number;
  foundationAllocation: number;
  grossTotal: number;
  remaining: number;
  setDescription: (value: string) => void;
  setEnvelopeAllocation: (value: number) => void;
  setFoundationAllocation: (value: number) => void;
  setGrossTotal: (value: number) => void;
  setTitle: (value: string) => void;
  title: string;
}

function GuidedCapture({
  captureState,
  onStepChange,
  scenario,
  step,
}: {
  captureState: CaptureState;
  onStepChange: (step: GuidedStep) => void;
  scenario: CostDocumentCapturePrototypeScenario;
  step: GuidedStep;
}) {
  const stepIndex = STEPS.indexOf(step);
  const previous = STEPS[Math.max(0, stepIndex - 1)] ?? "Capture";
  const next = STEPS[Math.min(STEPS.length - 1, stepIndex + 1)] ?? "Freeze";

  return (
    <>
      <div className="border-b bg-muted/30 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto">
          {STEPS.map((item, index) => (
            <button
              className={cn(
                "flex min-w-fit items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
                item === step
                  ? "border-primary font-semibold text-foreground"
                  : index < stepIndex
                    ? "border-transparent text-foreground"
                    : "border-transparent text-muted-foreground"
              )}
              key={item}
              onClick={() => onStepChange(item)}
              type="button"
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-xs",
                  index < stepIndex &&
                    "border-primary bg-primary text-primary-foreground",
                  item === step && "border-primary text-primary"
                )}
              >
                {index < stepIndex ? <Check className="size-3" /> : index + 1}
              </span>
              {item}
            </button>
          ))}
        </div>
      </div>
      <SheetPanel className="p-3 sm:p-5">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(19rem,0.8fr)_minmax(24rem,1.2fr)]">
          <SourcePreview compact={step !== "Capture"} scenario={scenario} />
          <Frame>
            <FrameHeader>
              <FrameTitle className="text-base">{step}</FrameTitle>
              <FrameDescription>{guidedStepDescription(step)}</FrameDescription>
            </FrameHeader>
            <FramePanel className="min-h-[25rem] p-4 sm:p-6">
              <GuidedStepBody
                captureState={captureState}
                scenario={scenario}
                step={step}
              />
            </FramePanel>
          </Frame>
        </div>
      </SheetPanel>
      <SheetFooter className="pb-20 sm:pb-16">
        <div className="mr-auto hidden items-center gap-2 text-sm sm:flex">
          <LockKeyhole className="size-4 text-muted-foreground" />
          <span>Private draft · only explicit collaborators can edit</span>
        </div>
        <Button
          disabled={stepIndex === 0}
          onClick={() => onStepChange(previous)}
          variant="outline"
        >
          <ArrowLeft /> Back
        </Button>
        <Button
          disabled={step === "Freeze" && captureState.remaining !== 0}
          onClick={() => onStepChange(next)}
        >
          {step === "Freeze" ? "Submit and freeze document" : "Continue"}
          {step === "Freeze" ? <LockKeyhole /> : <ArrowRight />}
        </Button>
      </SheetFooter>
    </>
  );
}

function guidedStepDescription(step: GuidedStep) {
  switch (step) {
    case "Capture":
      return "Photograph or choose every page of this invoice or receipt.";
    case "Confirm":
      return "Confirm the required document facts; extracted values remain suggestions.";
    case "Balance":
      return "Enter the tax-inclusive gross total and optionally reconcile its components.";
    case "Allocate":
      return "Assign the exact gross total across relevant Sub-milestones.";
    case "Share":
      return "Keep the Draft private or invite eligible Builder-side collaborators.";
    case "Freeze":
      return "Review the immutable publication manifest before submission.";
  }
}

function GuidedStepBody({
  captureState,
  scenario,
  step,
}: {
  captureState: CaptureState;
  scenario: CostDocumentCapturePrototypeScenario;
  step: GuidedStep;
}) {
  if (step === "Capture") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="h-24 justify-start px-5" size="lg">
            <Camera className="size-6" />
            <span className="text-left">
              <span className="block font-semibold">Take photo</span>
              <span className="block font-normal text-primary-foreground/70 text-xs">
                Camera-first on mobile
              </span>
            </span>
          </Button>
          <Button
            className="h-24 justify-start px-5"
            size="lg"
            variant="outline"
          >
            <UploadCloud className="size-6" />
            <span className="text-left">
              <span className="block font-semibold">Choose files</span>
              <span className="block font-normal text-muted-foreground text-xs">
                PDF, JPG, PNG · up to 20 MB
              </span>
            </span>
          </Button>
        </div>
        <ScenarioNotice scenario={scenario} />
        <p className="text-muted-foreground text-xs">
          Every page must belong to the same source document. Supporting
          evidence is attached separately after submission.
        </p>
      </div>
    );
  }
  if (step === "Confirm") {
    return <DocumentFactsFields captureState={captureState} />;
  }
  if (step === "Balance") {
    return <GrossReconciliation captureState={captureState} />;
  }
  if (step === "Allocate") {
    return <AllocationEditor captureState={captureState} scenario={scenario} />;
  }
  if (step === "Share") {
    return <CollaborationEditor />;
  }
  return <FreezeManifest captureState={captureState} scenario={scenario} />;
}

function LedgerCapture({
  activeRow,
  captureState,
  onRowChange,
  scenario,
}: {
  activeRow: LedgerRow;
  captureState: CaptureState;
  onRowChange: (row: LedgerRow) => void;
  scenario: CostDocumentCapturePrototypeScenario;
}) {
  return (
    <>
      <SheetPanel className="p-3 sm:p-5">
        <div className="mx-auto max-w-5xl">
          <Frame>
            <FrameHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <FrameTitle className="text-lg">Cost capture ledger</FrameTitle>
                <FrameDescription>
                  Resolve the source, facts, amount, allocation, and access in
                  any order.
                </FrameDescription>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                <StatusFact
                  label="Source"
                  value={scenario === "uploading" ? "Uploading" : "Durable"}
                  warn={scenario === "uploading"}
                />
                <StatusFact label="Facts" value="Complete" />
                <StatusFact label="Gross delta" value="$0.00" />
                <StatusFact
                  label="Allocation"
                  value={formatMoney(captureState.remaining)}
                  warn={captureState.remaining !== 0}
                />
              </div>
            </FrameHeader>
            {LEDGER_ROWS.map((row, index) => {
              const expanded = row === activeRow;
              return (
                <FramePanel className="p-0" key={row}>
                  <button
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 p-4 text-left"
                    onClick={() => onRowChange(row)}
                    type="button"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border font-semibold text-xs">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-sm">{row}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {ledgerRowSummary(row, captureState, scenario)}
                      </span>
                    </span>
                    {ledgerRowIssue(row, captureState, scenario) ? (
                      <Badge variant="warning">Action needed</Badge>
                    ) : (
                      <CheckCircle2 className="size-4 text-success" />
                    )}
                    {expanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </button>
                  {expanded ? (
                    <div className="border-t p-4 sm:p-6">
                      <LedgerRowBody
                        captureState={captureState}
                        row={row}
                        scenario={scenario}
                      />
                    </div>
                  ) : null}
                </FramePanel>
              );
            })}
            <FrameFooter className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span>
                  <strong>{formatMoney(captureState.grossTotal)}</strong> gross
                </span>
                <span>
                  <strong>{formatMoney(captureState.allocated)}</strong>{" "}
                  allocated
                </span>
                <span
                  className={cn(
                    captureState.remaining !== 0 && "text-warning-foreground"
                  )}
                >
                  <strong>{formatMoney(captureState.remaining)}</strong>{" "}
                  remaining
                </span>
                <span className="text-muted-foreground">
                  Private Draft · saved
                </span>
              </div>
              <Button
                disabled={captureState.remaining !== 0 || scenario !== "ready"}
              >
                Review publication <ArrowRight />
              </Button>
            </FrameFooter>
          </Frame>
        </div>
      </SheetPanel>
      <SheetFooter className="pb-20 sm:hidden">
        <Button
          className="w-full"
          disabled={captureState.remaining !== 0 || scenario !== "ready"}
        >
          Review publication <ArrowRight />
        </Button>
      </SheetFooter>
    </>
  );
}

function ledgerRowSummary(
  row: LedgerRow,
  state: CaptureState,
  scenario: CostDocumentCapturePrototypeScenario
) {
  if (row === "Source") {
    return scenario === "uploading"
      ? "northline-insulation.pdf · 68% uploaded"
      : "northline-insulation.pdf · verified and scan-clean";
  }
  if (row === "Document facts") {
    return `Materials invoice · ${state.title}`;
  }
  if (row === "Gross reconciliation") {
    return `${formatMoney(state.grossTotal)} CAD · components reconcile`;
  }
  if (row === "Cost allocations") {
    return `${formatMoney(state.allocated)} across 2 Sub-milestones · ${formatMoney(state.remaining)} remaining`;
  }
  return scenario === "duplicate"
    ? "Private Draft · near-duplicate reason required"
    : "Private Draft · 1 explicit collaborator";
}

function ledgerRowIssue(
  row: LedgerRow,
  state: CaptureState,
  scenario: CostDocumentCapturePrototypeScenario
) {
  return (
    (row === "Source" && scenario === "uploading") ||
    (row === "Cost allocations" &&
      (state.remaining !== 0 || scenario === "stale-assignment")) ||
    (row === "Access & submission" && scenario === "duplicate")
  );
}

function LedgerRowBody({
  captureState,
  row,
  scenario,
}: {
  captureState: CaptureState;
  row: LedgerRow;
  scenario: CostDocumentCapturePrototypeScenario;
}) {
  if (row === "Source") {
    return <SourcePreview compact scenario={scenario} />;
  }
  if (row === "Document facts") {
    return <DocumentFactsFields captureState={captureState} />;
  }
  if (row === "Gross reconciliation") {
    return <GrossReconciliation captureState={captureState} />;
  }
  if (row === "Cost allocations") {
    return <AllocationEditor captureState={captureState} scenario={scenario} />;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CollaborationEditor />
      <div className="grid content-start gap-3">
        <ScenarioNotice scenario={scenario} />
        <Alert>
          <ShieldCheck />
          <AlertTitle>Submission has no financial effect</AlertTitle>
          <AlertDescription>
            It does not establish payment, completion, reimbursement
            eligibility, or draw approval.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

function SourcebenchCapture({
  captureState,
  onSectionChange,
  scenario,
  section,
}: {
  captureState: CaptureState;
  onSectionChange: (section: SourcebenchSection) => void;
  scenario: CostDocumentCapturePrototypeScenario;
  section: SourcebenchSection;
}) {
  return (
    <>
      <SheetPanel className="p-0">
        <div className="grid min-h-[calc(100vh-15rem)] lg:grid-cols-[minmax(26rem,1.2fr)_minmax(24rem,0.8fr)]">
          <div className="border-b bg-muted/45 p-3 lg:border-r lg:border-b-0 lg:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">Source document</p>
                <p className="text-muted-foreground text-xs">
                  northline-insulation.pdf · page 1 of 2
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="xs" variant="outline">
                  −
                </Button>
                <Badge variant="outline">92%</Badge>
                <Button size="xs" variant="outline">
                  +
                </Button>
                <Button
                  aria-label="More source actions"
                  size="icon-xs"
                  variant="ghost"
                >
                  <MoreHorizontal />
                </Button>
              </div>
            </div>
            <SourcePreview scenario={scenario} sourcebench />
          </div>
          <div className="min-w-0 bg-background">
            <div className="sticky top-0 z-10 flex overflow-x-auto border-b bg-background px-3 pt-2">
              {SOURCEBENCH_SECTIONS.map((item) => (
                <button
                  className={cn(
                    "min-w-fit border-b-2 px-3 py-2 font-medium text-sm",
                    item === section
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground"
                  )}
                  key={item}
                  onClick={() => onSectionChange(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="p-4 sm:p-6">
              <div className="mb-5">
                <h3 className="font-semibold text-lg">{section}</h3>
                <p className="text-muted-foreground text-sm">
                  {sourcebenchDescription(section)}
                </p>
              </div>
              <SourcebenchSectionBody
                captureState={captureState}
                scenario={scenario}
                section={section}
              />
            </div>
          </div>
        </div>
      </SheetPanel>
      <SheetFooter className="pb-20 sm:pb-16">
        <div className="mr-auto flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span>
            <strong>4/5</strong> checks complete
          </span>
          <span>
            <strong>{formatMoney(captureState.remaining)}</strong> remaining
          </span>
          <span className="text-muted-foreground">Private Draft · saved</span>
        </div>
        <Button
          disabled={scenario !== "ready" || captureState.remaining !== 0}
          onClick={() =>
            onSectionChange(section === "Review" ? "Review" : "Review")
          }
        >
          Review publication <ArrowRight />
        </Button>
      </SheetFooter>
    </>
  );
}

function sourcebenchDescription(section: SourcebenchSection) {
  if (section === "Facts") {
    return "Confirm required facts without losing sight of the source.";
  }
  if (section === "Amount") {
    return "Reconcile the visible total against optional components.";
  }
  if (section === "Allocations") {
    return "Assign exact cents across relevant Sub-milestones.";
  }
  if (section === "Access") {
    return "Control Draft collaboration and resolve duplicate signals.";
  }
  return "Compare the immutable manifest directly against the source.";
}

function SourcebenchSectionBody({
  captureState,
  scenario,
  section,
}: {
  captureState: CaptureState;
  scenario: CostDocumentCapturePrototypeScenario;
  section: SourcebenchSection;
}) {
  if (section === "Facts") {
    return <DocumentFactsFields captureState={captureState} />;
  }
  if (section === "Amount") {
    return <GrossReconciliation captureState={captureState} />;
  }
  if (section === "Allocations") {
    return <AllocationEditor captureState={captureState} scenario={scenario} />;
  }
  if (section === "Access") {
    return (
      <div className="grid gap-4">
        <CollaborationEditor />
        <ScenarioNotice scenario={scenario} />
      </div>
    );
  }
  return <FreezeManifest captureState={captureState} scenario={scenario} />;
}

function SourcePreview({
  compact = false,
  scenario,
  sourcebench = false,
}: {
  compact?: boolean;
  scenario: CostDocumentCapturePrototypeScenario;
  sourcebench?: boolean;
}) {
  const isUploading = scenario === "uploading";
  return (
    <Card className={cn("overflow-hidden", sourcebench && "mx-auto max-w-3xl")}>
      <CardPanel
        className={cn("grid gap-4 p-3", sourcebench ? "sm:p-5" : "sm:p-4")}
      >
        <div
          className={cn(
            "relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg border bg-white text-slate-900 shadow-sm",
            compact ? "min-h-48" : "min-h-[22rem]",
            sourcebench && "min-h-[34rem]"
          )}
        >
          <div className="border-lime-500 border-b-4 bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-bold text-lg">NORTHLINE SUPPLY CO.</p>
                <p className="text-slate-300 text-xs">
                  Building envelope materials
                </p>
              </div>
              <p className="font-semibold text-xl">INVOICE</p>
            </div>
          </div>
          <div className="grid gap-5 p-5 text-xs sm:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-500 uppercase tracking-wide">
                Bill to
              </p>
              <p className="mt-1 font-semibold">Hamilton Infill Build</p>
              <p>18 Aberdeen Avenue</p>
              <p>Hamilton, ON</p>
            </div>
            <div className="sm:text-right">
              <p>
                <span className="text-slate-500">Invoice:</span> NL-10492
              </p>
              <p>
                <span className="text-slate-500">Issued:</span> July 18, 2026
              </p>
              <p>
                <span className="text-slate-500">Due:</span> August 17, 2026
              </p>
            </div>
          </div>
          <div className="mx-5 border-y py-3 text-xs">
            <div className="grid grid-cols-[1fr_auto] gap-3 font-semibold">
              <span>Exterior insulation package</span>
              <span>$12,900.00</span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-3">
              <span>Fasteners and membrane accessories</span>
              <span>$3,400.00</span>
            </div>
          </div>
          <div className="ml-auto grid w-64 gap-1 p-5 text-xs">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>$16,300.00</span>
            </div>
            <div className="flex justify-between">
              <span>HST</span>
              <span>$2,120.00</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 font-bold text-base">
              <span>Total</span>
              <span>$18,420.00</span>
            </div>
          </div>
          {isUploading ? (
            <div className="absolute inset-x-4 bottom-4 rounded-lg border bg-white/95 p-3 shadow-lg">
              <div className="mb-2 flex justify-between text-xs">
                <span className="font-semibold">Uploading source</span>
                <span>68%</span>
              </div>
              <Progress value={68} />
              <p className="mt-2 text-slate-500 text-xs">
                Saved on this device · not yet durable
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            {isUploading ? (
              <RefreshCw className="size-4 animate-spin text-warning" />
            ) : (
              <ShieldCheck className="size-4 text-success" />
            )}
            <span>
              {isUploading
                ? "Uploading · verification and scan pending"
                : "SHA-256 verified · scan clean · durable"}
            </span>
          </div>
          <div className="flex gap-1">
            <Button size="xs" variant="outline">
              <Plus /> Add page
            </Button>
            <Button size="xs" variant="ghost">
              <ScanLine /> Replace
            </Button>
          </div>
        </div>
      </CardPanel>
    </Card>
  );
}

function DocumentFactsFields({ captureState }: { captureState: CaptureState }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <ToggleChoice active icon={<FileText />} label="Invoice" />
        <ToggleChoice icon={<ReceiptText />} label="Receipt" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleChoice active label="Materials" />
        <ToggleChoice label="Labour" />
      </div>
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input
          onChange={(event) => captureState.setTitle(event.target.value)}
          value={captureState.title}
        />
      </Field>
      <Field>
        <FieldLabel>Description</FieldLabel>
        <Textarea
          onChange={(event) => captureState.setDescription(event.target.value)}
          rows={4}
          value={captureState.description}
        />
        <FieldDescription>
          Required context for reviewers; rich text in production.
        </FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Vendor</FieldLabel>
          <Input defaultValue="Northline Supply Co." />
        </Field>
        <Field>
          <FieldLabel>Document date</FieldLabel>
          <Input defaultValue="2026-07-18" type="date" />
        </Field>
      </div>
    </div>
  );
}

function ToggleChoice({
  active = false,
  icon,
  label,
}: {
  active?: boolean;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <Button className="justify-start" variant={active ? "default" : "outline"}>
      {icon}
      {label}
      {active ? <Check className="ml-auto" /> : null}
    </Button>
  );
}

function GrossReconciliation({ captureState }: { captureState: CaptureState }) {
  const subtotal = 16_300;
  const tax = captureState.grossTotal - subtotal;
  return (
    <div className="grid gap-5">
      <Field>
        <FieldLabel>Tax-inclusive gross total</FieldLabel>
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-3 grid place-items-center text-muted-foreground">
            $
          </span>
          <Input
            className="pl-7 text-lg tabular-nums"
            min={0}
            onChange={(event) =>
              captureState.setGrossTotal(Number(event.target.value))
            }
            type="number"
            value={captureState.grossTotal}
          />
          <span className="absolute inset-y-0 right-3 grid place-items-center text-muted-foreground text-xs">
            CAD
          </span>
        </div>
        <FieldDescription>
          Build currency is inherited and cannot be changed here.
        </FieldDescription>
      </Field>
      <div className="border-y py-4">
        <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-sm">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatMoney(subtotal)}</span>
          <span>HST</span>
          <span className="tabular-nums">{formatMoney(tax)}</span>
          <span className="border-t pt-3 font-semibold">Calculated gross</span>
          <span className="border-t pt-3 font-semibold tabular-nums">
            {formatMoney(subtotal + tax)}
          </span>
          <span className="text-muted-foreground">Reconciliation delta</span>
          <span className="font-semibold text-success tabular-nums">$0.00</span>
        </div>
      </div>
      <Button className="w-fit" size="sm" variant="outline">
        <Plus /> Add tax, fee, or discount
      </Button>
    </div>
  );
}

function AllocationEditor({
  captureState,
  scenario,
}: {
  captureState: CaptureState;
  scenario: CostDocumentCapturePrototypeScenario;
}) {
  return (
    <div className="grid gap-4">
      {scenario === "stale-assignment" ? (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Contractor assignment changed</AlertTitle>
          <AlertDescription>
            Exterior insulation is no longer a qualifying assignment. The amount
            is preserved, but submission is blocked.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Milestone / Sub-milestone</TableHead>
              <TableHead className="w-44 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <p className="font-medium">Foundation · Waterproofing</p>
                <p className="text-muted-foreground text-xs">Selected scope</p>
              </TableCell>
              <TableCell>
                <MoneyTableInput
                  onChange={captureState.setFoundationAllocation}
                  value={captureState.foundationAllocation}
                />
              </TableCell>
            </TableRow>
            <TableRow
              className={cn(scenario === "stale-assignment" && "bg-warning/8")}
            >
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">Envelope · Exterior insulation</p>
                  {scenario === "stale-assignment" ? (
                    <Badge variant="warning">Stale</Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">Selected scope</p>
              </TableCell>
              <TableCell>
                <MoneyTableInput
                  onChange={captureState.setEnvelopeAllocation}
                  value={captureState.envelopeAllocation}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
        <Button size="sm" variant="outline">
          <Plus /> Add Sub-milestone
        </Button>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Remaining to allocate</p>
          <p
            className={cn(
              "font-semibold text-lg tabular-nums",
              captureState.remaining !== 0 && "text-warning-foreground"
            )}
          >
            {formatMoney(captureState.remaining)}
          </p>
        </div>
      </div>
      <Button
        className="w-fit justify-self-end"
        disabled={captureState.remaining === 0}
        onClick={() =>
          captureState.setEnvelopeAllocation(
            captureState.grossTotal - captureState.foundationAllocation
          )
        }
        size="sm"
        variant="secondary"
      >
        Assign remaining to exterior insulation
      </Button>
      <p className="text-muted-foreground text-xs">
        Amounts—not percentages—are canonical. Allocations must equal the gross
        total exactly.
      </p>
    </div>
  );
}

function MoneyTableInput({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="relative">
      <span className="absolute inset-y-0 left-3 grid place-items-center text-muted-foreground">
        $
      </span>
      <Input
        className="pl-7 text-right tabular-nums"
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </div>
  );
}

function CollaborationEditor() {
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
          <LockKeyhole className="size-4" />
        </span>
        <div>
          <p className="font-semibold text-sm">Private Draft</p>
          <p className="text-muted-foreground text-xs">
            Only you can see this Draft until you invite collaborators.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-y py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-muted font-semibold text-xs">
            AM
          </span>
          <div>
            <p className="font-medium text-sm">Avery Morgan</p>
            <p className="text-muted-foreground text-xs">
              Builder Staff · can edit
            </p>
          </div>
        </div>
        <Button aria-label="Remove collaborator" size="icon-xs" variant="ghost">
          <X />
        </Button>
      </div>
      <Button className="w-fit" size="sm" variant="outline">
        <Users /> Manage collaborators
      </Button>
      <p className="text-muted-foreground text-xs">
        Every edit is attributed. Draft collaboration ends when the document is
        submitted.
      </p>
    </div>
  );
}

function ScenarioNotice({
  scenario,
}: {
  scenario: CostDocumentCapturePrototypeScenario;
}) {
  if (scenario === "duplicate") {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>Possible duplicate found</AlertTitle>
        <AlertDescription>
          A submitted invoice has a similar vendor, reference, date, and total.
          Review it and provide a reason before continuing.
          <Textarea
            className="mt-3"
            placeholder="Explain why this is a different cost document…"
            rows={3}
          />
        </AlertDescription>
      </Alert>
    );
  }
  if (scenario === "stale-assignment") {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <AlertTitle>Assignment changed since this Draft was saved</AlertTitle>
        <AlertDescription>
          Entered work is preserved, but the affected allocation must be removed
          or reassigned by an authorized participant.
        </AlertDescription>
      </Alert>
    );
  }
  if (scenario === "uploading") {
    return (
      <Alert>
        <UploadCloud />
        <AlertTitle>Source is still uploading</AlertTitle>
        <AlertDescription>
          Facts are saved privately, but this Draft is not publishable until
          verification and scanning complete.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="success">
      <ShieldCheck />
      <AlertTitle>Source is durable and scan-clean</AlertTitle>
      <AlertDescription>
        SHA-256 verified · 2 pages · ready for publication review.
      </AlertDescription>
    </Alert>
  );
}

function FreezeManifest({
  captureState,
  scenario,
}: {
  captureState: CaptureState;
  scenario: CostDocumentCapturePrototypeScenario;
}) {
  const items = useMemo(
    () => [
      ["Source", "2 verified pages · SHA-256 recorded"],
      ["Document", `Materials invoice · ${captureState.title}`],
      [
        "Gross total",
        `${formatMoney(captureState.grossTotal)} CAD · exact component reconciliation`,
      ],
      [
        "Allocations",
        `${formatMoney(captureState.allocated)} across 2 Sub-milestones`,
      ],
      ["Provenance", "Submitted by Connor Belezney as Builder Owner"],
    ],
    [captureState]
  );
  return (
    <div className="grid gap-4">
      {scenario === "ready" ? null : <ScenarioNotice scenario={scenario} />}
      <div className="border-y">
        {items.map(([label, value]) => (
          <div
            className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[8rem_1fr]"
            key={label}
          >
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-medium text-sm">{value}</span>
          </div>
        ))}
      </div>
      <Alert>
        <LockKeyhole />
        <AlertTitle>Submission freezes this revision</AlertTitle>
        <AlertDescription>
          Source pages, facts, amount components, allocations, provenance, and
          duplicate acknowledgement become immutable. Corrections create a new
          revision.
        </AlertDescription>
      </Alert>
      <p className="text-muted-foreground text-xs">
        Submission does not prove payment or completion, establish reimbursement
        eligibility, approve a Milestone, include the document in a Draw, or
        release funds.
      </p>
    </div>
  );
}

function StatusFact({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("font-semibold", warn && "text-warning-foreground")}>
        {value}
      </p>
    </div>
  );
}
