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
  "Capture & confirm",
  "Balance & allocate",
  "Share",
  "Freeze",
] as const;
type GuidedStep = (typeof STEPS)[number];

interface GuidedDocumentDraft {
  category: "Labour" | "Materials";
  description: string;
  documentNumber: string;
  envelopeAllocation: number;
  foundationAllocation: number;
  grossTotal: number;
  id: string;
  kind: "Invoice" | "Receipt";
  pages: number;
  step: GuidedStep;
  title: string;
  vendor: string;
}

const INITIAL_GUIDED_DOCUMENTS: GuidedDocumentDraft[] = [
  {
    category: "Materials",
    description:
      "Supply and delivery of exterior insulation, fasteners, and membrane accessories.",
    documentNumber: "NL-10492",
    envelopeAllocation: 6820,
    foundationAllocation: 11_600,
    grossTotal: 18_420,
    id: "northline-insulation",
    kind: "Invoice",
    pages: 2,
    step: "Capture & confirm",
    title: "Northline insulation package",
    vendor: "Northline Supply Co.",
  },
  {
    category: "Materials",
    description: "Ready-mix concrete delivery tickets for foundation walls.",
    documentNumber: "RC-7781",
    envelopeAllocation: 0,
    foundationAllocation: 7940,
    grossTotal: 7940,
    id: "redwood-concrete",
    kind: "Invoice",
    pages: 3,
    step: "Balance & allocate",
    title: "Foundation concrete deliveries",
    vendor: "Redwood Concrete",
  },
  {
    category: "Labour",
    description: "Electrical rough-in crew labour and site coordination.",
    documentNumber: "ME-2218",
    envelopeAllocation: 3280,
    foundationAllocation: 0,
    grossTotal: 3280,
    id: "mckay-electrical",
    kind: "Receipt",
    pages: 1,
    step: "Capture & confirm",
    title: "Electrical rough-in labour",
    vendor: "McKay Electrical",
  },
];

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
            <GuidedCapture scenario={scenario} />
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
              <SheetTitle>
                {variant === "capture-guided"
                  ? "New cost documents"
                  : "New cost document"}
              </SheetTitle>
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
  scenario,
}: {
  scenario: CostDocumentCapturePrototypeScenario;
}) {
  const [documents, setDocuments] = useState(INITIAL_GUIDED_DOCUMENTS);
  const [activeDocumentId, setActiveDocumentId] = useState(
    INITIAL_GUIDED_DOCUMENTS[0]?.id ?? ""
  );
  const activeDocument =
    documents.find((document) => document.id === activeDocumentId) ??
    documents[0];

  if (!activeDocument) {
    return null;
  }

  const updateDocument = (
    documentId: string,
    patch: Partial<GuidedDocumentDraft>
  ) => {
    setDocuments((current) =>
      current.map((document) =>
        document.id === documentId ? { ...document, ...patch } : document
      )
    );
  };
  const onStepChange = (step: GuidedStep) => {
    updateDocument(activeDocument.id, { step });
  };
  const captureState: CaptureState = {
    allocated:
      activeDocument.foundationAllocation + activeDocument.envelopeAllocation,
    description: activeDocument.description,
    envelopeAllocation: activeDocument.envelopeAllocation,
    foundationAllocation: activeDocument.foundationAllocation,
    grossTotal: activeDocument.grossTotal,
    remaining:
      activeDocument.grossTotal -
      activeDocument.foundationAllocation -
      activeDocument.envelopeAllocation,
    setDescription: (description) =>
      updateDocument(activeDocument.id, { description }),
    setEnvelopeAllocation: (envelopeAllocation) =>
      updateDocument(activeDocument.id, { envelopeAllocation }),
    setFoundationAllocation: (foundationAllocation) =>
      updateDocument(activeDocument.id, { foundationAllocation }),
    setGrossTotal: (grossTotal) =>
      updateDocument(activeDocument.id, { grossTotal }),
    setTitle: (title) => updateDocument(activeDocument.id, { title }),
    title: activeDocument.title,
  };
  const step = activeDocument.step;
  const stepIndex = STEPS.indexOf(step);
  const previous = STEPS[Math.max(0, stepIndex - 1)] ?? "Capture & confirm";
  const next = STEPS[Math.min(STEPS.length - 1, stepIndex + 1)] ?? "Freeze";
  const addDocument = () => {
    const existing = documents.find(
      (document) => document.id === "city-tool-rental"
    );
    if (existing) {
      setActiveDocumentId(existing.id);
      return;
    }
    const document: GuidedDocumentDraft = {
      category: "Materials",
      description: "Rental receipt awaiting confirmation.",
      documentNumber: "Pending",
      envelopeAllocation: 0,
      foundationAllocation: 0,
      grossTotal: 0,
      id: "city-tool-rental",
      kind: "Receipt",
      pages: 2,
      step: "Capture & confirm",
      title: "Untitled cost document",
      vendor: "City Tool Rental",
    };
    setDocuments((current) => [...current, document]);
    setActiveDocumentId(document.id);
  };

  return (
    <>
      <SheetPanel className="p-3 sm:p-5">
        <div className="mx-auto grid max-w-[90rem] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <GuidedDocumentQueue
            activeDocumentId={activeDocument.id}
            documents={documents}
            onAddDocument={addDocument}
            onDocumentChange={setActiveDocumentId}
          />
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold text-lg">
                    {activeDocument.vendor}
                  </h2>
                  <Badge variant="outline">{activeDocument.kind}</Badge>
                  <Badge variant="secondary">{activeDocument.category}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">
                  {activeDocument.pages}{" "}
                  {activeDocument.pages === 1 ? "page" : "pages"} ·{" "}
                  {activeDocument.documentNumber}
                </p>
              </div>
              <p className="font-semibold text-sm tabular-nums">
                {activeDocument.grossTotal > 0
                  ? formatMoney(activeDocument.grossTotal)
                  : "Total required"}
              </p>
            </div>
            <GuidedStepRail onStepChange={onStepChange} step={step} />
            {step === "Balance & allocate" ? (
              <Frame>
                <FrameHeader className="gap-4 border-b sm:flex sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <FrameTitle className="text-base">{step}</FrameTitle>
                    <FrameDescription>
                      {guidedStepDescription(step)}
                    </FrameDescription>
                  </div>
                  <Button className="w-fit" size="sm" variant="outline">
                    <FileText /> View {activeDocument.pages}-page source
                  </Button>
                </FrameHeader>
                <FramePanel className="min-h-[25rem] p-4 sm:p-6 lg:p-8">
                  <GuidedStepBody
                    captureState={captureState}
                    document={activeDocument}
                    onDocumentUpdate={(patch) =>
                      updateDocument(activeDocument.id, patch)
                    }
                    scenario={scenario}
                    step={step}
                  />
                </FramePanel>
              </Frame>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(26rem,1.05fr)]">
                <SourcePreview
                  compact={step !== "Capture & confirm"}
                  document={activeDocument}
                  managePages={step === "Capture & confirm"}
                  scenario={scenario}
                />
                <Frame>
                  <FrameHeader>
                    <FrameTitle className="text-base">{step}</FrameTitle>
                    <FrameDescription>
                      {guidedStepDescription(step)}
                    </FrameDescription>
                  </FrameHeader>
                  <FramePanel className="min-h-[25rem] p-4 sm:p-6">
                    <GuidedStepBody
                      captureState={captureState}
                      document={activeDocument}
                      onDocumentUpdate={(patch) =>
                        updateDocument(activeDocument.id, patch)
                      }
                      scenario={scenario}
                      step={step}
                    />
                  </FramePanel>
                </Frame>
              </div>
            )}
          </div>
        </div>
      </SheetPanel>
      <SheetFooter className="pb-20 sm:pb-16">
        <div className="mr-auto hidden items-center gap-2 text-sm lg:flex">
          <LockKeyhole className="size-4 text-muted-foreground" />
          <span>
            {documents.length} documents in this private batch · progress saves
            independently
          </span>
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
          {step === "Freeze"
            ? "Submit and freeze this document"
            : "Continue this document"}
          {step === "Freeze" ? <LockKeyhole /> : <ArrowRight />}
        </Button>
      </SheetFooter>
    </>
  );
}

function GuidedDocumentQueue({
  activeDocumentId,
  documents,
  onAddDocument,
  onDocumentChange,
}: {
  activeDocumentId: string;
  documents: GuidedDocumentDraft[];
  onAddDocument: () => void;
  onDocumentChange: (documentId: string) => void;
}) {
  return (
    <Frame className="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-15rem)]">
      <FrameHeader className="gap-3">
        <div>
          <FrameTitle>Cost documents</FrameTitle>
          <FrameDescription>
            {documents.length} independent records in this batch
          </FrameDescription>
        </div>
        <Button className="w-full" onClick={onAddDocument} size="sm">
          <Plus /> Add documents
        </Button>
      </FrameHeader>
      <FramePanel className="flex gap-2 overflow-x-auto p-2 lg:grid lg:overflow-y-auto">
        {documents.map((document) => {
          const documentStepIndex = STEPS.indexOf(document.step);
          const isActive = document.id === activeDocumentId;
          return (
            <Card
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "min-w-64 text-left transition-colors lg:min-w-0",
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-muted/50"
              )}
              key={document.id}
              onClick={() => onDocumentChange(document.id)}
              render={<button type="button" />}
            >
              <CardPanel className="grid gap-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-sm">
                      {document.vendor}
                    </p>
                    <p className="mt-0.5 truncate text-muted-foreground text-xs">
                      {document.kind} · {document.category} · {document.pages}p
                    </p>
                  </div>
                  {document.grossTotal > 0 ? (
                    <span className="font-medium text-xs tabular-nums">
                      {formatMoney(document.grossTotal)}
                    </span>
                  ) : (
                    <Badge variant="warning">New</Badge>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium">{document.step}</span>
                    <span className="text-muted-foreground">
                      {documentStepIndex + 1}/{STEPS.length}
                    </span>
                  </div>
                  <div
                    aria-label={`${document.step}, step ${documentStepIndex + 1} of ${STEPS.length}`}
                    aria-valuemax={STEPS.length}
                    aria-valuemin={1}
                    aria-valuenow={documentStepIndex + 1}
                    className="grid grid-cols-4 gap-1"
                    role="progressbar"
                  >
                    {STEPS.map((step, index) => (
                      <span
                        className={cn(
                          "h-1 rounded-full bg-muted",
                          index <= documentStepIndex && "bg-primary"
                        )}
                        key={step}
                      />
                    ))}
                  </div>
                </div>
              </CardPanel>
            </Card>
          );
        })}
      </FramePanel>
    </Frame>
  );
}

function GuidedStepRail({
  onStepChange,
  step,
}: {
  onStepChange: (step: GuidedStep) => void;
  step: GuidedStep;
}) {
  const stepIndex = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b">
      {STEPS.map((item, index) => (
        <button
          className={cn(
            "flex min-w-fit items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
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
  );
}

function guidedStepDescription(step: GuidedStep) {
  switch (step) {
    case "Capture & confirm":
      return "Add every page, then confirm the required facts for this invoice or receipt.";
    case "Balance & allocate":
      return "Reconcile the gross total and assign that exact amount across relevant Sub-milestones.";
    case "Share":
      return "Keep the Draft private or invite eligible Builder-side collaborators.";
    case "Freeze":
      return "Review the immutable publication manifest before submission.";
  }
}

function GuidedStepBody({
  captureState,
  document,
  onDocumentUpdate,
  scenario,
  step,
}: {
  captureState: CaptureState;
  document: GuidedDocumentDraft;
  onDocumentUpdate: (patch: Partial<GuidedDocumentDraft>) => void;
  scenario: CostDocumentCapturePrototypeScenario;
  step: GuidedStep;
}) {
  if (step === "Capture & confirm") {
    return (
      <div className="grid gap-5">
        {scenario === "duplicate" || scenario === "stale-assignment" ? (
          <ScenarioNotice scenario={scenario} />
        ) : null}
        <div>
          <p className="font-semibold">Confirm document facts</p>
          <p className="text-muted-foreground text-xs">
            Extracted values are suggestions until you confirm them.
          </p>
        </div>
        <DocumentFactsFields
          captureState={captureState}
          document={document}
          onDocumentUpdate={onDocumentUpdate}
        />
      </div>
    );
  }
  if (step === "Balance & allocate") {
    return (
      <div className="grid gap-10">
        <section className="min-w-0">
          <div className="mb-4 border-b pb-3">
            <p className="font-semibold">1. Reconcile gross</p>
            <p className="text-muted-foreground text-xs">
              Confirm the tax-inclusive amount represented by this document.
            </p>
          </div>
          <GrossReconciliation captureState={captureState} prominent />
        </section>
        <section className="min-w-0 border-t pt-8">
          <div className="mb-4 border-b pb-3">
            <p className="font-semibold">2. Allocate exact total</p>
            <p className="text-muted-foreground text-xs">
              Resolve the same gross amount to one or more Sub-milestones.
            </p>
          </div>
          <AllocationEditor
            captureState={captureState}
            roomy
            scenario={scenario}
          />
        </section>
      </div>
    );
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
  document,
  managePages = false,
  scenario,
  sourcebench = false,
}: {
  compact?: boolean;
  document?: GuidedDocumentDraft;
  managePages?: boolean;
  scenario: CostDocumentCapturePrototypeScenario;
  sourcebench?: boolean;
}) {
  const isUploading = scenario === "uploading";
  const grossTotal = document?.grossTotal ?? 18_420;
  const subtotal = Math.round((grossTotal / 1.13) * 100) / 100;
  const tax = grossTotal - subtotal;
  const primaryLine = Math.round(subtotal * 0.7 * 100) / 100;
  const secondaryLine = subtotal - primaryLine;
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
                <p className="font-bold text-lg">
                  {(document?.vendor ?? "Northline Supply Co.").toUpperCase()}
                </p>
                <p className="text-slate-300 text-xs">
                  {document
                    ? `${document.category} cost document`
                    : "Building envelope materials"}
                </p>
              </div>
              <p className="font-semibold text-xl">
                {(document?.kind ?? "Invoice").toUpperCase()}
              </p>
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
                <span className="text-slate-500">
                  {document?.kind ?? "Invoice"}:
                </span>{" "}
                {document?.documentNumber ?? "NL-10492"}
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
              <span>{document?.title ?? "Exterior insulation package"}</span>
              <span>{formatMoney(primaryLine)}</span>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-3">
              <span>Additional documented charges</span>
              <span>{formatMoney(secondaryLine)}</span>
            </div>
          </div>
          <div className="ml-auto grid w-64 gap-1 p-5 text-xs">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>HST</span>
              <span>{formatMoney(tax)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 font-bold text-base">
              <span>Total</span>
              <span>{formatMoney(grossTotal)}</span>
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
        <SourcePageControls
          document={document}
          isUploading={isUploading}
          managePages={managePages}
        />
      </CardPanel>
    </Card>
  );
}

function SourcePageControls({
  document,
  isUploading,
  managePages,
}: {
  document?: GuidedDocumentDraft;
  isUploading: boolean;
  managePages: boolean;
}) {
  const status = (
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
  );

  if (document && managePages) {
    return (
      <div className="grid gap-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Source pages</p>
            <p className="text-muted-foreground text-xs">
              {document.pages} pages in this Cost Document
            </p>
          </div>
          <span className="text-muted-foreground text-xs">
            Page 1 of {document.pages}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="justify-start" size="sm">
            <Camera /> Take photo
          </Button>
          <Button className="justify-start" size="sm" variant="outline">
            <UploadCloud /> Choose files
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {status}
          <Button size="xs" variant="ghost">
            <ScanLine /> Replace current page
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Every page added here belongs to this Cost Document. Use “Add
          documents” in the register for another invoice or receipt.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      {status}
      {document ? (
        <Button size="xs" variant="outline">
          <FileText /> View {document.pages} pages
        </Button>
      ) : (
        <div className="flex items-center gap-1">
          <Button size="xs" variant="outline">
            <Plus /> Add page
          </Button>
          <Button size="xs" variant="ghost">
            <ScanLine /> Replace
          </Button>
        </div>
      )}
    </div>
  );
}

function DocumentFactsFields({
  captureState,
  document,
  onDocumentUpdate,
}: {
  captureState: CaptureState;
  document?: GuidedDocumentDraft;
  onDocumentUpdate?: (patch: Partial<GuidedDocumentDraft>) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <ToggleChoice
          active={!document || document.kind === "Invoice"}
          icon={<FileText />}
          label="Invoice"
          onClick={() => onDocumentUpdate?.({ kind: "Invoice" })}
        />
        <ToggleChoice
          active={document?.kind === "Receipt"}
          icon={<ReceiptText />}
          label="Receipt"
          onClick={() => onDocumentUpdate?.({ kind: "Receipt" })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ToggleChoice
          active={!document || document.category === "Materials"}
          label="Materials"
          onClick={() => onDocumentUpdate?.({ category: "Materials" })}
        />
        <ToggleChoice
          active={document?.category === "Labour"}
          label="Labour"
          onClick={() => onDocumentUpdate?.({ category: "Labour" })}
        />
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
          <Input
            defaultValue={document?.vendor ?? "Northline Supply Co."}
            key={document?.id}
            onChange={(event) =>
              onDocumentUpdate?.({ vendor: event.target.value })
            }
          />
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
  onClick,
}: {
  active?: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Button
      className="justify-start"
      onClick={onClick}
      variant={active ? "default" : "outline"}
    >
      {icon}
      {label}
      {active ? <Check className="ml-auto" /> : null}
    </Button>
  );
}

function GrossReconciliation({
  captureState,
  prominent = false,
}: {
  captureState: CaptureState;
  prominent?: boolean;
}) {
  const subtotal =
    captureState.grossTotal === 18_420
      ? 16_300
      : Math.round((captureState.grossTotal / 1.13) * 100) / 100;
  const tax = captureState.grossTotal - subtotal;
  return (
    <div
      className={cn(
        "grid gap-5",
        prominent &&
          "lg:grid-cols-[minmax(22rem,0.9fr)_minmax(20rem,1.1fr)] lg:items-start lg:gap-8"
      )}
    >
      <Field>
        <FieldLabel>Tax-inclusive gross total</FieldLabel>
        <div className="relative w-full">
          <span
            className={cn(
              "pointer-events-none absolute inset-y-0 left-3 z-10 grid place-items-center text-muted-foreground",
              prominent && "left-4 font-semibold text-lg"
            )}
          >
            $
          </span>
          <Input
            className={cn(
              "pl-7 text-lg tabular-nums",
              prominent &&
                "h-16 font-semibold text-2xl [&_[data-slot=input]]:h-16 [&_[data-slot=input]]:pr-16 [&_[data-slot=input]]:pl-10 [&_[data-slot=input]]:text-2xl"
            )}
            min={0}
            onChange={(event) =>
              captureState.setGrossTotal(Number(event.target.value))
            }
            type="number"
            value={captureState.grossTotal}
          />
          <span
            className={cn(
              "absolute inset-y-0 right-3 grid place-items-center text-muted-foreground text-xs",
              prominent && "right-4 font-medium"
            )}
          >
            CAD
          </span>
        </div>
        <FieldDescription>
          Build currency is inherited and cannot be changed here.
        </FieldDescription>
      </Field>
      <div className="grid gap-4">
        <div className="border-y py-4">
          <div className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-sm">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(subtotal)}</span>
            <span>HST</span>
            <span className="tabular-nums">{formatMoney(tax)}</span>
            <span className="border-t pt-3 font-semibold">
              Calculated gross
            </span>
            <span className="border-t pt-3 font-semibold tabular-nums">
              {formatMoney(subtotal + tax)}
            </span>
            <span className="text-muted-foreground">Reconciliation delta</span>
            <span className="font-semibold text-success tabular-nums">
              $0.00
            </span>
          </div>
        </div>
        <Button className="w-fit" size="sm" variant="outline">
          <Plus /> Add tax, fee, or discount
        </Button>
      </div>
    </div>
  );
}

function AllocationEditor({
  captureState,
  roomy = false,
  scenario,
}: {
  captureState: CaptureState;
  roomy?: boolean;
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
              <TableHead
                className={cn("text-right", roomy ? "w-52 sm:w-64" : "w-44")}
              >
                Amount
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className={cn(roomy && "py-4")}>
                <p className="font-medium">Foundation · Waterproofing</p>
                <p className="text-muted-foreground text-xs">Selected scope</p>
              </TableCell>
              <TableCell className={cn(roomy && "py-4")}>
                <MoneyTableInput
                  onChange={captureState.setFoundationAllocation}
                  prominent={roomy}
                  value={captureState.foundationAllocation}
                />
              </TableCell>
            </TableRow>
            <TableRow
              className={cn(scenario === "stale-assignment" && "bg-warning/8")}
            >
              <TableCell className={cn(roomy && "py-4")}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">Envelope · Exterior insulation</p>
                  {scenario === "stale-assignment" ? (
                    <Badge variant="warning">Stale</Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">Selected scope</p>
              </TableCell>
              <TableCell className={cn(roomy && "py-4")}>
                <MoneyTableInput
                  onChange={captureState.setEnvelopeAllocation}
                  prominent={roomy}
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
  prominent = false,
  value,
}: {
  onChange: (value: number) => void;
  prominent?: boolean;
  value: number;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 z-10 grid place-items-center text-muted-foreground">
        $
      </span>
      <Input
        className={cn(
          "pl-7 text-right tabular-nums",
          prominent &&
            "h-12 min-w-56 font-semibold text-base [&_[data-slot=input]]:h-12 [&_[data-slot=input]]:pr-4 [&_[data-slot=input]]:pl-7 [&_[data-slot=input]]:text-base"
        )}
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
