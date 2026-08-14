import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  History,
  MapPinCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { PrototypeVariantSwitcher } from "#/components/prototypes/PrototypeVariantSwitcher.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
  type MilestoneSheetSubmilestone,
} from "#/features/backoffice-build-detail/MilestoneDetailSheet.tsx";

/**
 * THESIS: Revision belongs inside the canonical Milestone detail sheet, not in
 * a parallel workflow. OWN-WORLD: Preserve DrawFlow's existing light Operate
 * sheet, Frame hierarchy, status badges, and direct controls. STORY: The
 * Builder sees why the same Milestone needs revision, repairs the affected
 * completion fields, and resubmits cycle N+1 without losing history. FIRST
 * VIEWPORT: The open sheet leads with stable Milestone identity, Needs revision,
 * and Builder-visible instructions before normal scope and evidence. FORM:
 * Existing-surface extension; Variant A is the locked direction and B/C remain
 * comparison history. FINISH:
 * unreviewed and undocumented is unfinished; this build ends with the finish
 * review, a focused contract test, and a recorded verdict.
 */

export const BUILDER_MILESTONE_REVISION_VARIANTS = [
  { key: "A", label: "Inline revision notice · locked" },
  { key: "B", label: "Guided repair checklist" },
  { key: "C", label: "Affected-section panel" },
] as const;

export type BuilderMilestoneRevisionVariant =
  (typeof BUILDER_MILESTONE_REVISION_VARIANTS)[number]["key"];

type RevisionState = "needs_revision" | "pending";

const isVariant = (value: unknown): value is BuilderMilestoneRevisionVariant =>
  BUILDER_MILESTONE_REVISION_VARIANTS.some((variant) => variant.key === value);

export const Route = createFileRoute(
  "/builder/milestone-revision-detail-prototype"
)({
  component: PrototypeRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    variant: isVariant(search.variant) ? search.variant : "A",
  }),
});

const revisionInstructions =
  "Documented receipts and invoices total $144,800.00, but the entered actual cost is $148,000.00. Add $3,200.00 in eligible documents or correct the actual cost before resubmitting.";

const money = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  style: "currency",
});

function PrototypeRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { variant } = Route.useSearch();

  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <BuilderMilestoneRevisionPrototype
      onVariantChange={(nextVariant) =>
        navigate({ replace: true, search: { variant: nextVariant } })
      }
      variant={variant}
    />
  );
}

export function BuilderMilestoneRevisionPrototype({
  initialAttached = false,
  initialCycle = 2,
  initialState = "needs_revision",
  onVariantChange = () => undefined,
  variant,
}: {
  initialAttached?: boolean;
  initialCycle?: number;
  initialState?: RevisionState;
  onVariantChange?: (variant: BuilderMilestoneRevisionVariant) => void;
  variant: BuilderMilestoneRevisionVariant;
}) {
  const [actualCostValue, setActualCostValue] = useState("148000");
  const [attached, setAttached] = useState(initialAttached);
  const [cycle, setCycle] = useState(initialCycle);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [state, setState] = useState<RevisionState>(initialState);
  const [statusMessage, setStatusMessage] = useState(
    "Local Needs revision preview ready."
  );
  const actualCost = Number(actualCostValue.replaceAll(",", "")) || 0;
  const documentedTotal = 144_800 + (attached ? 3200 : 0);
  const eligible = documentedTotal === actualCost;

  const attach = () => {
    setAttached(true);
    setStatusMessage(
      actualCost === 148_000
        ? "Representative invoice added. Documented total now equals actual cost."
        : "Representative invoice added. The documented total still does not equal the entered actual cost."
    );
  };

  const reset = () => {
    setActualCostValue("148000");
    setAttached(false);
    setCycle(initialCycle);
    setState("needs_revision");
    setStatusMessage(
      `Local preview reset to Needs revision in cycle ${initialCycle}.`
    );
  };

  const updateActualCost = (value: string) => {
    setActualCostValue(value);
    const nextActualCost = Number(value.replaceAll(",", "")) || 0;
    setStatusMessage(
      documentedTotal === nextActualCost
        ? "Entered actual cost now matches the documented total. Ready to resubmit."
        : "Entered actual cost does not match the documented total. Revision is still required."
    );
  };

  const resubmit = () => {
    if (!(eligible && state === "needs_revision")) {
      return;
    }
    setCycle((current) => current + 1);
    setState("pending");
    setStatusMessage(
      `Milestone completion resubmitted into decision cycle ${cycle + 1}. All required approvals reset.`
    );
  };

  const props: RevisionSheetProps = {
    actualCostValue,
    attach,
    attached,
    cycle,
    documentedTotal,
    eligible,
    onActualCostChange: updateActualCost,
    onOpenChange: setSheetOpen,
    reset,
    resubmit,
    sheetOpen,
    state,
    variant,
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/25 pb-28">
      <p aria-live="polite" className="sr-only">
        {statusMessage}
      </p>
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="outline">Throwaway prototype</Badge>
          <Badge variant="secondary">Local state only</Badge>
          <Badge variant="success">Variant A locked</Badge>
        </div>
        <div className="max-w-2xl">
          <h1 className="text-balance font-semibold text-3xl tracking-tight">
            Milestone revision inside the existing detail sheet
          </h1>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
            This route is only a comparison container. The proposed production
            behavior belongs in the canonical Milestone detail sheet.
          </p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>
          Open Milestone detail
        </Button>
      </div>

      <RevisionDetailSheet {...props} />

      <PrototypeVariantSwitcher
        current={variant}
        onChange={(value) => {
          if (isVariant(value)) {
            onVariantChange(value);
          }
        }}
        variants={BUILDER_MILESTONE_REVISION_VARIANTS}
      />
    </main>
  );
}

interface RevisionSheetProps {
  actualCostValue: string;
  attach: () => void;
  attached: boolean;
  cycle: number;
  documentedTotal: number;
  eligible: boolean;
  onActualCostChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  reset: () => void;
  resubmit: () => void;
  sheetOpen: boolean;
  state: RevisionState;
  variant: BuilderMilestoneRevisionVariant;
}

function RevisionDetailSheet(props: RevisionSheetProps) {
  const data = createMilestoneSheetData(props);
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!props.sheetOpen) {
      setFooterTarget(null);
      return;
    }

    let canonicalSummary: HTMLElement | null = null;
    const connectFooter = () => {
      canonicalSummary = document.querySelector<HTMLElement>(
        '[data-testid="milestone-footer-summary"]'
      );
      const footer = canonicalSummary?.parentElement;
      if (!(canonicalSummary && footer)) {
        return false;
      }
      canonicalSummary.hidden = true;
      setFooterTarget(footer);
      return true;
    };
    const observer = new MutationObserver(() => {
      if (connectFooter()) {
        observer.disconnect();
      }
    });

    if (!connectFooter()) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      observer.disconnect();
      if (canonicalSummary) {
        canonicalSummary.hidden = false;
      }
    };
  }, [props.sheetOpen]);

  return (
    <>
      {props.sheetOpen ? (
        <MilestoneDetailSheet
          collaboration={<BuilderSafeCollaboration />}
          data={data}
          eventsSourceLabel="Builder-safe request history"
          onClose={() => props.onOpenChange(false)}
          pending={props.state === "pending"}
          reviewLayer={<RevisionLayer {...props} />}
        />
      ) : null}
      {footerTarget
        ? createPortal(<RevisionAwareFooter {...props} />, footerTarget)
        : null}
    </>
  );
}

function createMilestoneSheetData(
  props: RevisionSheetProps
): MilestoneSheetData {
  const actualCostCents =
    (Number(props.actualCostValue.replaceAll(",", "")) || 0) * 100;
  const rows: MilestoneSheetSubmilestone[] = [
    createSubmilestone({
      actualCostCents: Math.max(0, actualCostCents - 6_320_000),
      costCents: 8_160_000,
      key: "structural-framing",
      name: "Structural framing",
      order: 1,
    }),
    createSubmilestone({
      actualCostCents: 6_320_000,
      costCents: 6_320_000,
      key: "roof-framing-dry-in",
      name: "Roof framing and dry-in",
      order: 2,
    }),
    createSubmilestone({
      actualCostCents: 0,
      costCents: props.attached ? 320_000 : 0,
      key: "weatherproofing-checks",
      name: "Weatherproofing checks",
      order: 3,
    }),
  ];

  return {
    actualStartedAt: Date.parse("2026-07-14T13:00:00Z"),
    column:
      props.state === "needs_revision"
        ? `Needs revision — ${revisionInstructions}`
        : `Pending review — decision cycle ${props.cycle}`,
    contractors: [],
    drawGroupKey: "draw-04",
    milestoneKey: "ms-07",
    name: "Framing and roof dry-in",
    plannedBudgetCents: 15_000_000,
    recentEvents: [],
    status: "complete",
    submilestones: rows,
    ...(props.state === "pending"
      ? { submittedAt: Date.parse("2026-08-13T14:30:00Z") }
      : {}),
  };
}

function createSubmilestone({
  actualCostCents,
  costCents,
  key,
  name,
  order,
}: {
  actualCostCents: number;
  costCents: number;
  key: string;
  name: string;
  order: number;
}): MilestoneSheetSubmilestone {
  const hasCostDocument = costCents > 0;

  return {
    actualCostCents,
    assignments: [],
    budgetCents: actualCostCents,
    completedAt: Date.parse("2026-08-08T15:00:00Z"),
    costDocuments: hasCostDocument
      ? [
          {
            _id: `${key}-invoice`,
            allocationAmountCents: costCents,
            kind: "invoice",
            pages: [
              {
                assetId: `${key}-invoice-page`,
                fileName: `${key}-invoice.pdf`,
                mimeType: "application/pdf",
              },
            ],
            subtotalCents: costCents,
            title:
              key === "weatherproofing-checks"
                ? "Correction invoice supplement"
                : `${name} invoice`,
          },
        ]
      : [],
    description: `${name} completion scope`,
    endDate: "2026-08-08",
    evidence: [
      {
        createdAt: Date.parse("2026-08-08T15:00:00Z"),
        evidenceKey: `${key}-completion-photo`,
        fileName: `${key}-completion.jpg`,
        label: `${name} completion photo`,
        locationVerified: true,
        mimeType: "image/jpeg",
        sizeBytes: 840_000,
        tag: "completion",
      },
    ],
    key,
    materials: [],
    name,
    order,
    siteVisits:
      order === 3
        ? [
            {
              completedAt: "2026-08-08",
              requestedAt: "2026-08-05",
              status: "complete",
              visitId: "SV-482",
            },
          ]
        : [],
    startDate: "2026-07-14",
    status: "complete",
  };
}

function RevisionLayer(props: RevisionSheetProps) {
  if (props.state === "pending") {
    return (
      <div
        className="order-first grid gap-4"
        data-testid="builder-milestone-revision-sheet"
      >
        <RevisionStatusSummary cycle={props.cycle} state={props.state} />
        <PendingNotice cycle={props.cycle} />
        <RequestHistory cycle={props.cycle} state={props.state} />
      </div>
    );
  }

  return (
    <div
      className="order-first grid gap-4"
      data-testid="builder-milestone-revision-sheet"
    >
      <RevisionStatusSummary cycle={props.cycle} state={props.state} />
      {props.variant === "A" ? (
        <InlineRevisionNotice cycle={props.cycle} eligible={props.eligible} />
      ) : null}
      {props.variant === "B" ? <GuidedRevisionChecklist {...props} /> : null}
      {props.variant === "C" ? (
        <AffectedSectionRail cycle={props.cycle} eligible={props.eligible} />
      ) : null}
      <CompletionSection annotate={props.variant === "C"} {...props} />
      <LockedRequirementsSummary />
      <RequestHistory cycle={props.cycle} state={props.state} />
    </div>
  );
}

function RevisionStatusSummary({
  cycle,
  state,
}: {
  cycle: number;
  state: RevisionState;
}) {
  const label =
    state === "needs_revision" ? "Needs revision" : "Pending review";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        aria-label={`Status: ${label}`}
        variant={state === "needs_revision" ? "warning" : "secondary"}
      >
        {label}
      </Badge>
      <Badge variant="outline">Decision cycle {cycle}</Badge>
      <Badge variant="outline">Same Milestone MS-07</Badge>
    </div>
  );
}

function InlineRevisionNotice({
  cycle,
  eligible,
}: {
  cycle: number;
  eligible: boolean;
}) {
  return (
    <Alert className="border-warning/35 bg-warning/6">
      <AlertTriangle />
      <AlertTitle>Why this Milestone needs revision</AlertTitle>
      <AlertDescription>
        <p>{revisionInstructions}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={eligible ? "success" : "warning"}>
            {eligible ? "Ready to resubmit" : "$3,200.00 gap remains"}
          </Badge>
          <span className="text-xs">
            Decision cycle {cycle} · Requested Aug 12, 2026
          </span>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function GuidedRevisionChecklist(props: RevisionSheetProps) {
  const completed = props.eligible ? 3 : 2;
  return (
    <Frame>
      <FramePanel className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[60ch]">
            <h2 className="font-semibold text-base">Repair this submission</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {revisionInstructions}
            </p>
          </div>
          <Badge variant={props.eligible ? "success" : "warning"}>
            {completed} of 3 ready
          </Badge>
        </div>
        <Progress
          aria-label={`${completed} of 3 revision requirements ready`}
          value={(completed / 3) * 100}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <RepairStep
            complete
            detail="All child scope remains complete."
            label="Scope"
          />
          <RepairStep
            complete
            detail="Report and 6 qualifying photos."
            label="Site Visit"
          />
          <RepairStep
            complete={props.eligible}
            detail={
              props.eligible
                ? "Documented total matches actual cost."
                : "$3,200.00 evidence gap remains."
            }
            label="Cost evidence"
          />
        </div>
      </FramePanel>
    </Frame>
  );
}

function RepairStep({
  complete,
  detail,
  label,
}: {
  complete: boolean;
  detail: string;
  label: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {complete ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      )}
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </div>
    </div>
  );
}

function AffectedSectionRail({
  cycle,
  eligible,
}: {
  cycle: number;
  eligible: boolean;
}) {
  return (
    <aside>
      <Frame>
        <FramePanel className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(13rem,1fr)] sm:p-5">
          <div className="min-w-0">
            <h2 className="font-semibold text-base">Revision request</h2>
            <p className="mt-2 text-muted-foreground text-sm">
              {revisionInstructions}
            </p>
            <p className="mt-3 text-muted-foreground text-xs">
              Decision cycle {cycle} · Requested Aug 12, 2026
            </p>
          </div>
          <div className="space-y-3 border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
            <RepairStep
              complete={eligible}
              detail={eligible ? "Resolved" : "$3,200.00 gap"}
              label="Completion costs"
            />
            <RepairStep
              complete
              detail="No change requested"
              label="Site Visit"
            />
            <RepairStep
              complete
              detail="No change requested"
              label="Child scope"
            />
          </div>
        </FramePanel>
      </Frame>
    </aside>
  );
}

function PendingNotice({ cycle }: { cycle: number }) {
  return (
    <Alert>
      <ClipboardCheck />
      <AlertTitle>Milestone completion resubmitted</AlertTitle>
      <AlertDescription>
        Decision cycle {cycle} is pending review. Completion inputs are
        read-only and every policy-required approval has reset for this cycle.
      </AlertDescription>
    </Alert>
  );
}

function CompletionSection({
  actualCostValue,
  annotate,
  attach,
  attached,
  cycle,
  documentedTotal,
  eligible,
  onActualCostChange,
  state,
}: RevisionSheetProps & { annotate: boolean }) {
  const disabled = state !== "needs_revision";
  return (
    <Frame>
      <FramePanel className="space-y-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Completion submission</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              The same pre-submission fields are editable while this Milestone
              needs revision.
            </p>
          </div>
          <Badge variant={eligible ? "success" : "warning"}>
            {eligible ? "Eligible" : "Revision required"}
          </Badge>
        </div>

        {annotate && !eligible ? (
          <Alert className="border-warning/35 bg-warning/6">
            <AlertTriangle />
            <AlertTitle>Affected section</AlertTitle>
            <AlertDescription>
              Resolve the documented-cost mismatch here. No other Milestone
              section needs a change.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label
            className="grid gap-2 font-medium text-sm"
            htmlFor="prototype-milestone-actual-cost"
          >
            Entered actual cost
            <Input
              aria-describedby="prototype-milestone-actual-cost-help prototype-milestone-actual-cost-status"
              aria-invalid={
                (Number(actualCostValue.replaceAll(",", "")) || 0) <= 0
              }
              disabled={disabled}
              id="prototype-milestone-actual-cost"
              inputMode="decimal"
              onChange={(event) => onActualCostChange(event.target.value)}
              value={actualCostValue}
            />
            <span
              className="font-normal text-muted-foreground text-xs"
              id="prototype-milestone-actual-cost-help"
            >
              Correct this value only if the prior submission was inaccurate.
            </span>
            <span
              className={
                eligible
                  ? "font-normal text-success text-xs"
                  : "font-normal text-warning text-xs"
              }
              id="prototype-milestone-actual-cost-status"
            >
              {eligible
                ? "Matches the documented total."
                : "Does not match the documented total."}
            </span>
          </label>
          <div className="grid content-start gap-2">
            <p className="font-medium text-sm">Eligible documented total</p>
            <p className="font-semibold text-2xl tracking-tight">
              {money.format(documentedTotal)}
            </p>
            <p className="text-muted-foreground text-xs">
              Receipts and invoices referenced by this completion submission.
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-sm">Cost evidence</h3>
              <p className="mt-1 text-muted-foreground text-xs">
                Evidence stays attached to this Milestone completion and its
                decision cycle.
              </p>
            </div>
            <Badge variant="outline">2 retained</Badge>
          </div>
          <EvidenceRow
            detail={`$81,600.00 · retained from decision cycle ${cycle}`}
            icon={FileText}
            label="Northshore framing invoice"
          />
          <EvidenceRow
            detail={`$63,200.00 · retained from decision cycle ${cycle}`}
            icon={ReceiptText}
            label="Roof dry-in invoice"
          />
          {attached ? (
            <EvidenceRow
              detail={`$3,200.00 · prepared for decision cycle ${cycle + 1}`}
              icon={FileCheck2}
              label="Correction invoice supplement"
            />
          ) : null}
          {disabled || attached ? null : (
            <div className="space-y-3">
              <FileUploader
                accept="application/pdf,image/*"
                description="Choose local evidence for this prototype. Nothing is uploaded or persisted."
                helperText="Representative receipt or invoice evidence only."
                inputLabel="Choose local Milestone correction evidence"
                multiple={false}
                onFilesChange={(files) => {
                  if (files.length > 0) {
                    attach();
                  }
                }}
                showUploadButton={false}
                title="Add the representative $3,200 invoice"
                variant="compact"
              />
              <Button onClick={attach} size="sm" variant="ghost">
                <FileCheck2 /> Use representative evidence without a file
              </Button>
            </div>
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}

function EvidenceRow({
  detail,
  icon: Icon,
  label,
}: {
  detail: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium text-sm">{label}</p>
          <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
        </div>
      </div>
      <Badge variant="secondary">Attached</Badge>
    </div>
  );
}

function LockedRequirementsSummary() {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Locked requirements</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              These are the configured gates for this Milestone completion.
            </p>
          </div>
          <Badge variant="success">Complete</Badge>
        </div>
        <div className="flex items-start gap-3">
          <MapPinCheck className="mt-0.5 size-5 shrink-0 text-success" />
          <div>
            <p className="font-medium text-sm">Required Site Visit complete</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Qualifying report · 6 photos · Aug 8, 2026
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <ReceiptText className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-medium text-sm">Receipts and invoices</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Eligible documented total must equal the entered actual cost.
            </p>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function RequestHistory({
  cycle,
  state,
}: {
  cycle: number;
  state: RevisionState;
}) {
  const revisionCycle = state === "pending" ? cycle - 1 : cycle;

  return (
    <Frame>
      <FramePanel className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Completion history</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Builder-safe history for this same Milestone.
            </p>
          </div>
          <History className="size-4 text-muted-foreground" />
        </div>
        <ol className="space-y-4">
          <li>
            <p className="font-medium text-sm">Decision cycle 1</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Submitted · evidence references retained
            </p>
          </li>
          <li>
            <p className="font-medium text-sm">
              Decision cycle {revisionCycle}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Needs revision · Builder-visible instructions issued Aug 12, 2026
            </p>
          </li>
          {state === "pending" ? (
            <li>
              <p className="font-medium text-sm">Decision cycle {cycle}</p>
              <p className="mt-1 text-muted-foreground text-xs">
                {state === "pending" ? "Pending review" : "Current cycle"} ·
                every required approval reset
              </p>
            </li>
          ) : null}
        </ol>
        <div className="flex items-start gap-2 text-muted-foreground text-xs">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Internal notes, reviewer identity, votes, and private audit content
          are excluded.
        </div>
      </FramePanel>
    </Frame>
  );
}

function BuilderSafeCollaboration() {
  return (
    <Frame>
      <FramePanel className="space-y-2 p-4">
        <h2 className="font-semibold text-base">No shared discussion</h2>
        <p className="text-muted-foreground text-sm">
          This revision has no Builder-visible collaboration items. Decision
          history remains in Overview.
        </p>
      </FramePanel>
    </Frame>
  );
}

function RevisionAwareFooter(props: RevisionSheetProps) {
  const pending = props.state === "pending";

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 text-left">
          <p className="font-medium text-sm">
            {pending
              ? `Decision cycle ${props.cycle} pending review`
              : props.eligible
                ? "Revision complete"
                : "Resubmission blocked by a $3,200.00 evidence gap"}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {pending
              ? "Editing is locked while this decision cycle is under review."
              : props.eligible
                ? `The same Milestone is ready for decision cycle ${props.cycle + 1}.`
                : "Add eligible evidence or correct the entered actual cost."}
          </p>
        </div>
        <Button
          className="shrink-0"
          data-testid="prototype-milestone-resubmit"
          disabled={pending || !props.eligible}
          onClick={props.resubmit}
        >
          <ClipboardCheck />
          {pending ? "Completion resubmitted" : "Resubmit milestone completion"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Prototype action only. Nothing is uploaded, persisted, or sent.
        </p>
        <Button onClick={props.reset} size="sm" variant="ghost">
          <RotateCcw /> Reset local preview
        </Button>
      </div>
    </div>
  );
}
