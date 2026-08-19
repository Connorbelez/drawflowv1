import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  FileImage,
  FileText,
  History,
  MapPinCheck,
  ReceiptText,
  RotateCcw,
  Scale,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";

import { LenderPrototypeShell } from "../components/prototypes/LenderPrototypeShell";
import { PrototypeVariantSwitcher } from "../components/prototypes/PrototypeVariantSwitcher";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Frame, FramePanel } from "../components/ui/frame";
import { Progress } from "../components/ui/progress";
import { Separator } from "../components/ui/separator";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";

// PROTOTYPE ONLY: four structures for one lender Draw review and decision,
// switchable on /lender/draw-review-prototype?variant=A|B|C|D.
const prototypeVariants = [
  { key: "A", label: "Evidence cockpit" },
  { key: "B", label: "Pooled funding ledger" },
  { key: "C", label: "Ordered review brief" },
  { key: "D", label: "Peer-gate map" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

interface DrawEvidence {
  context: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  id: string;
  kind: string;
  label: string;
  state: "accepted" | "verified";
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute("/lender/draw-review-prototype")({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "A",
  }),
  component: LenderDrawReviewPrototype,
});

const drawRequest = {
  amount: "$186,400.00",
  build: "Harbourline Residences",
  builder: "Northshore Build Co.",
  cycle: "Submission cycle 2",
  displayId: "DR-2048",
  location: "Hamilton, ON",
  note: "Reimbursement request for completed framing and roof dry-in work. Updated invoice package attached after the prior correction request.",
  policy: "Back Office + lender quorum",
  requestLabel: "Framing reimbursement",
  submittedAt: "Aug 12, 2026 · 3:42 PM",
  workOrderKey: "DRAW-WO-2048",
} as const;

const pooledAvailability = {
  beforeRequest: "$242,900.00",
  remainingAfterRequest: "$56,500.00",
  requestedShare: 76.7,
} as const;

const evidenceItems: readonly DrawEvidence[] = [
  {
    id: "EV-881",
    kind: "Invoice",
    label: "Northshore framing invoice",
    detail: "$142,000.00 · submitted Aug 12",
    context: "Submitted with this Draw Request",
    icon: ReceiptText,
    state: "accepted",
  },
  {
    id: "EV-884",
    kind: "Invoice",
    label: "Roofing contractor invoice",
    detail: "$44,400.00 · submitted Aug 12",
    context: "Submitted with this Draw Request",
    icon: FileText,
    state: "accepted",
  },
  {
    id: "EV-879",
    kind: "Photo set",
    label: "Framing and sheathing evidence",
    detail: "18 images · location signals verified",
    context: "Request-level supporting evidence",
    icon: FileImage,
    state: "verified",
  },
  {
    id: "SV-116",
    kind: "Site visit",
    label: "Completion inspection report",
    detail: "Completed Aug 11 · no open findings",
    context: "Relevant to this reimbursement request",
    icon: MapPinCheck,
    state: "verified",
  },
] as const;

function LenderDrawReviewPrototype() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const selectVariant = (nextVariant: string) => {
    if (!isPrototypeVariant(nextVariant)) {
      return;
    }
    navigate({
      replace: true,
      search: { variant: nextVariant },
      to: "/lender/draw-review-prototype",
    });
  };

  return (
    <LenderPrototypeShell activeNavigation="Draws" pageTitle="Draw review">
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-28">
        <PrototypeBanner />
        <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
          <RequestHeader />
          {variant === "A" ? <EvidenceCockpit /> : null}
          {variant === "B" ? <PooledFundingLedger /> : null}
          {variant === "C" ? <OrderedReviewBrief /> : null}
          {variant === "D" ? <PeerGateMap /> : null}
        </main>
      </div>
      <PrototypeVariantSwitcher
        current={variant}
        onChange={selectVariant}
        variants={prototypeVariants}
      />
    </LenderPrototypeShell>
  );
}

function PrototypeBanner() {
  return (
    <div className="border-amber-500/30 border-y bg-amber-50 px-4 py-2 text-center font-medium text-amber-950 text-xs tracking-wide dark:bg-amber-950/40 dark:text-amber-100">
      THROWAWAY PROTOTYPE · REPRESENTATIVE DATA · NO DECISION IS RECORDED
    </div>
  );
}

function RequestHeader() {
  return (
    <header className="mb-5 flex flex-col justify-between gap-4 border-b pb-5 xl:flex-row xl:items-end">
      <div className="min-w-0">
        <Button className="mb-2 -ml-2" size="sm" variant="ghost">
          <ArrowLeft /> Back to Draw queue
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">In lender review</Badge>
          <Badge variant="outline">{drawRequest.cycle}</Badge>
          <span className="text-muted-foreground text-xs">
            Same canonical request · history retained
          </span>
        </div>
        <h1 className="mt-2 font-semibold text-2xl tracking-tight sm:text-3xl">
          {drawRequest.requestLabel}
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {drawRequest.build} · {drawRequest.builder} · {drawRequest.location}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-7 gap-y-3 text-right sm:grid-cols-4 xl:min-w-[30rem] xl:grid-cols-2 2xl:grid-cols-4">
        <HeaderFact emphasis label="Requested" value={drawRequest.amount} />
        <HeaderFact label="Draw Request" value={drawRequest.displayId} />
        <HeaderFact label="Work Order" value={drawRequest.workOrderKey} />
        <HeaderFact label="Submitted" value={drawRequest.submittedAt} />
      </div>
    </header>
  );
}

function HeaderFact({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 whitespace-nowrap font-medium text-sm tabular-nums",
          emphasis && "font-semibold text-xl"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function EvidenceCockpit() {
  const [selectedEvidence, setSelectedEvidence] = useState(evidenceItems[0]);

  return (
    <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
      <Frame className="h-fit">
        <FramePanel className="p-3">
          <SectionHeading
            eyebrow="Attached evidence"
            title="4 relevant records"
          />
          <div className="mt-3 space-y-1">
            {evidenceItems.map((evidence) => (
              <Button
                className="h-auto w-full justify-start whitespace-normal px-3 py-3 text-left sm:h-auto"
                key={evidence.id}
                onClick={() => setSelectedEvidence(evidence)}
                variant={
                  selectedEvidence.id === evidence.id ? "secondary" : "ghost"
                }
              >
                <evidence.icon className="mt-0.5 self-start" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sm">
                    {evidence.label}
                  </span>
                  <span className="mt-0.5 block text-muted-foreground text-xs">
                    {evidence.kind} · {evidence.id}
                  </span>
                </span>
                <ChevronRight />
              </Button>
            ))}
          </div>
        </FramePanel>
      </Frame>

      <div className="space-y-4">
        <Frame>
          <FramePanel className="min-h-[24rem] p-0">
            <div className="flex min-h-[20rem] items-center justify-center bg-muted/45 p-8 text-center">
              <div>
                <selectedEvidence.icon className="mx-auto size-12 text-muted-foreground" />
                <p className="mt-4 font-semibold text-lg">
                  {selectedEvidence.label}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Representative evidence preview · {selectedEvidence.id}
                </p>
                <Button className="mt-5" variant="outline">
                  <Eye /> Inspect record
                </Button>
              </div>
            </div>
            <div className="grid gap-4 border-t p-5 sm:grid-cols-3">
              <CompactFact
                label="Evidence type"
                value={selectedEvidence.kind}
              />
              <CompactFact
                label="Record detail"
                value={selectedEvidence.detail}
              />
              <CompactFact
                label="Review context"
                value={selectedEvidence.context}
              />
            </div>
          </FramePanel>
        </Frame>
        <SubmissionAndFunding />
      </div>

      <div className="space-y-4">
        <PolicyGatePanel />
        <DecisionComposer />
      </div>
    </div>
  );
}

function PooledFundingLedger() {
  return (
    <div className="space-y-4">
      <Frame>
        <FramePanel className="p-0">
          <div className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
            <SectionHeading
              eyebrow="Pooled availability impact"
              title="One request against the Build's unlocked balance"
            />
            <div className="text-left lg:text-right">
              <p className="text-muted-foreground text-xs">Requested now</p>
              <p className="font-semibold text-xl tabular-nums">
                {drawRequest.amount}
              </p>
              <p className="text-success-foreground text-xs">
                Within current pooled availability
              </p>
            </div>
          </div>
          <Separator />
          <div className="p-5">
            <PoolBalancePanel />
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Evidence submitted with this request
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {evidenceItems.map((evidence) => (
                <EvidenceCard evidence={evidence} key={evidence.id} />
              ))}
            </CardContent>
          </Card>
          <SubmissionContext />
        </div>
        <div className="space-y-4">
          <PolicyGatePanel compact />
          <DecisionComposer />
        </div>
      </div>
    </div>
  );
}

function OrderedReviewBrief() {
  const [section, setSection] = useState<
    "request" | "funding" | "evidence" | "policy"
  >("request");
  const sections = [
    { key: "request", label: "1. Submission", complete: true },
    { key: "funding", label: "2. Funding position", complete: true },
    { key: "evidence", label: "3. Evidence", complete: true },
    { key: "policy", label: "4. Policy gates", complete: false },
  ] as const;

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_22rem]">
      <Frame className="h-fit lg:sticky lg:top-20">
        <FramePanel className="p-3">
          <p className="px-2 pb-2 font-semibold text-xs uppercase tracking-wide">
            Review brief
          </p>
          <nav className="space-y-1">
            {sections.map((item) => (
              <Button
                className="w-full justify-start"
                key={item.key}
                onClick={() => setSection(item.key)}
                variant={section === item.key ? "secondary" : "ghost"}
              >
                {item.complete ? (
                  <CheckCircle2 className="text-success-foreground" />
                ) : (
                  <Circle className="text-warning-foreground" />
                )}
                {item.label}
              </Button>
            ))}
          </nav>
          <Separator className="my-3" />
          <p className="px-2 text-muted-foreground text-xs leading-5">
            The sections organize review only. They do not impose a required
            approval order.
          </p>
        </FramePanel>
      </Frame>

      <div className="space-y-4">
        <BriefSection
          active={section === "request"}
          eyebrow="1 · Submitted Draw Request"
          onOpen={() => setSection("request")}
          title={`${drawRequest.displayId} · ${drawRequest.amount}`}
        >
          <SubmissionContext />
        </BriefSection>
        <BriefSection
          active={section === "funding"}
          eyebrow="2 · Pooled funding position"
          onOpen={() => setSection("funding")}
          title="$242,900 available · $56,500 remaining"
        >
          <PoolBalancePanel />
        </BriefSection>
        <BriefSection
          active={section === "evidence"}
          eyebrow="3 · Relevant evidence"
          onOpen={() => setSection("evidence")}
          title="Invoices reconcile · field evidence verified"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {evidenceItems.map((evidence) => (
              <EvidenceCard evidence={evidence} key={evidence.id} />
            ))}
          </div>
        </BriefSection>
        <BriefSection
          active={section === "policy"}
          eyebrow="4 · Required approval groups"
          onOpen={() => setSection("policy")}
          title="Back Office satisfied · lender quorum outstanding"
        >
          <PolicyGatePanel embedded />
        </BriefSection>
      </div>

      <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        <Frame>
          <FramePanel>
            <SectionHeading
              eyebrow="Review summary"
              title="Ready for your decision"
            />
            <div className="mt-4 space-y-3 text-sm">
              <SummaryCheck label="Request and note reviewed" />
              <SummaryCheck label="Request fits pooled availability" />
              <SummaryCheck label="Relevant evidence inspected" />
              <SummaryCheck label="No payment or release action here" />
            </div>
          </FramePanel>
        </Frame>
        <DecisionComposer />
      </div>
    </div>
  );
}

function PeerGateMap() {
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div className="space-y-4">
      <Frame>
        <FramePanel>
          <div className="mx-auto max-w-5xl py-3">
            <div className="text-center">
              <Badge variant="outline">
                Policy snapshot for this submission cycle
              </Badge>
              <h2 className="mt-3 font-semibold text-2xl">
                Two peer approval groups
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
                Back Office and lender quorum may finish in either order. Both
                must be satisfied before the request can reach its next
                high-level state.
              </p>
            </div>

            <div className="relative mt-8 grid gap-4 md:grid-cols-2">
              <GateCard
                detail="Recorded in the current submission cycle"
                icon={ShieldCheck}
                label="Back Office"
                state="Satisfied"
                tone="success"
              />
              <GateCard
                detail="1 of 2 lender approvals recorded"
                icon={Users}
                label="Lender quorum"
                state="Your decision can satisfy quorum"
                tone="warning"
              />
            </div>

            <div className="mx-auto mt-4 flex max-w-xl flex-col items-center">
              <div className="h-6 w-px bg-border" />
              <Frame className="w-full">
                <FramePanel className="text-center">
                  <Scale className="mx-auto size-5 text-muted-foreground" />
                  <p className="mt-2 font-semibold">Current gate result</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    One lender approval remains. No required group has priority,
                    and no review deadline is inferred.
                  </p>
                </FramePanel>
              </Frame>
            </div>
          </div>
        </FramePanel>
      </Frame>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Frame>
            <FramePanel>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <SectionHeading
                  eyebrow="Decision basis"
                  title="Request, pooled availability, and evidence"
                />
                <Button
                  onClick={() => setShowEvidence(!showEvidence)}
                  variant="outline"
                >
                  {showEvidence ? <X /> : <Eye />}
                  {showEvidence ? "Hide evidence" : "Inspect evidence"}
                </Button>
              </div>
              <Separator className="my-4" />
              <div className="grid gap-5 md:grid-cols-2">
                <SubmissionSummary />
                <PoolBalancePanel compact />
              </div>
              {showEvidence ? (
                <>
                  <Separator className="my-5" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {evidenceItems.map((evidence) => (
                      <EvidenceCard evidence={evidence} key={evidence.id} />
                    ))}
                  </div>
                </>
              ) : null}
            </FramePanel>
          </Frame>
          <CycleHistory />
        </div>
        <DecisionComposer />
      </div>
    </div>
  );
}

function DecisionComposer() {
  const [mode, setMode] = useState<"idle" | "decline" | "preview">("idle");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<"approved" | "declined" | null>(null);
  const normalizedReason = reason.trim();

  const reset = () => {
    setMode("idle");
    setPreview(null);
    setReason("");
  };

  if (mode === "preview" && preview) {
    return (
      <Frame>
        <FramePanel>
          <Badge variant={preview === "approved" ? "success" : "warning"}>
            Prototype preview
          </Badge>
          <h3 className="mt-3 font-semibold text-lg">
            {preview === "approved"
              ? "Your lender approval would satisfy quorum"
              : "The request would return for Builder correction"}
          </h3>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {preview === "approved"
              ? "Back Office is already satisfied. This preview does not approve release or execute payment."
              : "DR-2048 and DRAW-WO-2048 remain the same records. History is retained, and all required approvals reset when the Builder resubmits."}
          </p>
          {preview === "declined" ? (
            <div className="mt-4 border-warning border-l-2 pl-3">
              <p className="font-medium text-xs">Private lender rationale</p>
              <p className="mt-1 text-sm">{normalizedReason}</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Builder sees only correction requirements and high-level state.
              </p>
            </div>
          ) : null}
          <Button className="mt-5 w-full" onClick={reset} variant="outline">
            <RotateCcw /> Reset preview
          </Button>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame>
      <FramePanel>
        <div className="flex items-start justify-between gap-3">
          <SectionHeading
            eyebrow="Your decision"
            title="Lender quorum review"
          />
          <Badge variant="warning">1 of 2</Badge>
        </div>
        <p className="mt-3 text-muted-foreground text-sm leading-6">
          Your decision is one peer-group approval. It does not release funds.
        </p>
        {mode === "decline" ? (
          <div className="mt-4 space-y-3">
            <div>
              <label className="font-medium text-sm" htmlFor="decline-reason">
                Rejection reason
              </label>
              <Textarea
                className="mt-2"
                id="decline-reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Record the lender-only rationale for correction."
                rows={4}
                value={reason}
              />
              <p className="mt-2 text-muted-foreground text-xs leading-5">
                Required. Private to authorized lender review. The Builder sees
                requirements and high-level state, not reviewer identity or this
                rationale.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => setMode("idle")} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={!normalizedReason}
                onClick={() => {
                  setPreview("declined");
                  setMode("preview");
                }}
                variant="destructive"
              >
                Preview decline
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-2">
            <Button
              onClick={() => {
                setPreview("approved");
                setMode("preview");
              }}
            >
              <Check /> Preview approval
            </Button>
            <Button
              onClick={() => setMode("decline")}
              variant="destructive-outline"
            >
              <X /> Decline with reason
            </Button>
          </div>
        )}
        <Separator className="my-4" />
        <p className="flex gap-2 text-muted-foreground text-xs leading-5">
          <History className="mt-0.5 size-3.5 shrink-0" />
          Decisions append to this request's private review history. No generic
          comments, deadline, payment, or release control is added here.
        </p>
      </FramePanel>
    </Frame>
  );
}

function PolicyGatePanel({
  compact = false,
  embedded = false,
}: {
  compact?: boolean;
  embedded?: boolean;
}) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading eyebrow="Draw policy" title={drawRequest.policy} />
        <Badge variant="warning">1 gate outstanding</Badge>
      </div>
      <p className="mt-3 text-muted-foreground text-xs leading-5">
        Required groups are peers. Either group may finish first.
      </p>
      <div className={cn("mt-4 space-y-3", compact && "space-y-2")}>
        <ApprovalRow
          detail="Approved in this submission cycle"
          icon={ShieldCheck}
          label="Back Office"
          status="Satisfied"
          success
        />
        <ApprovalRow
          detail="1 of 2 approvals recorded"
          icon={Users}
          label="Lender quorum"
          status="Outstanding"
        />
      </div>
      <Separator className="my-4" />
      <p className="text-muted-foreground text-xs leading-5">
        A rejection returns this same request for correction. History remains;
        required approvals reset for its next submission cycle.
      </p>
    </>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return (
    <Frame>
      <FramePanel>{content}</FramePanel>
    </Frame>
  );
}

function ApprovalRow({
  detail,
  icon: Icon,
  label,
  status,
  success = false,
}: {
  detail: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  status: string;
  success?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "mt-0.5 rounded-full p-1.5",
          success
            ? "bg-success/10 text-success-foreground"
            : "bg-warning/10 text-warning-foreground"
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">{label}</p>
          <Badge variant={success ? "success" : "warning"}>{status}</Badge>
        </div>
        <p className="mt-0.5 text-muted-foreground text-xs">{detail}</p>
      </div>
    </div>
  );
}

function SubmissionAndFunding() {
  return (
    <Frame>
      <FramePanel>
        <div className="grid gap-5 md:grid-cols-2">
          <SubmissionSummary />
          <PoolBalancePanel compact />
        </div>
      </FramePanel>
    </Frame>
  );
}

function SubmissionContext() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Builder submission context</CardTitle>
      </CardHeader>
      <CardContent>
        <SubmissionSummary />
      </CardContent>
    </Card>
  );
}

function SubmissionSummary() {
  return (
    <div>
      <p className="font-semibold text-sm">{drawRequest.requestLabel}</p>
      <p className="mt-1 text-muted-foreground text-xs">
        {drawRequest.displayId} · {drawRequest.workOrderKey}
      </p>
      <p className="mt-4 text-sm leading-6">“{drawRequest.note}”</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="outline">{drawRequest.submittedAt}</Badge>
        <Badge variant="outline">{drawRequest.cycle}</Badge>
      </div>
    </div>
  );
}

function PoolBalancePanel({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-sm">Pooled draw availability</p>
        <Badge variant="success">Request fits</Badge>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">
            Available before request
          </p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {pooledAvailability.beforeRequest}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">This request</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            − {drawRequest.amount}
          </p>
        </div>
        <div className="col-span-2">
          <Progress value={pooledAvailability.requestedShare} />
        </div>
        <div className="col-span-2 flex items-end justify-between gap-3 border-t pt-3">
          <div>
            <p className="text-muted-foreground text-xs">
              Remaining if approved
            </p>
            <p className="mt-0.5 font-semibold text-lg tabular-nums">
              {pooledAvailability.remainingAfterRequest}
            </p>
          </div>
          <p className="text-right text-muted-foreground text-xs">
            {pooledAvailability.requestedShare}% of available balance
          </p>
        </div>
      </div>
      {compact ? null : (
        <p className="mt-4 border-primary/40 border-l-2 pl-3 text-muted-foreground text-xs leading-5">
          Approved work unlocked this balance earlier. This Draw Request can use
          the pool at any time; no Milestone or Draw Group is assigned to it.
        </p>
      )}
    </div>
  );
}

function EvidenceCard({ evidence }: { evidence: DrawEvidence }) {
  return (
    <Card className="rounded-xl shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2">
            <evidence.icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-sm">{evidence.label}</p>
              <Badge variant="success">{evidence.state}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-xs">
              {evidence.kind} · {evidence.id}
            </p>
            <p className="mt-2 text-xs">{evidence.detail}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {evidence.context}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BriefSection({
  active,
  children,
  eyebrow,
  onOpen,
  title,
}: {
  active: boolean;
  children: ReactNode;
  eyebrow: string;
  onOpen: () => void;
  title: string;
}) {
  return (
    <Frame className={cn(active && "ring-2 ring-primary/30")}>
      <FramePanel>
        <button
          className="flex w-full items-center justify-between gap-4 text-left"
          onClick={onOpen}
          type="button"
        >
          <SectionHeading eyebrow={eyebrow} title={title} />
          <ChevronRight
            className={cn(
              "shrink-0 transition-transform",
              active && "rotate-90"
            )}
          />
        </button>
        {active ? (
          <>
            <Separator className="my-4" />
            {children}
          </>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function GateCard({
  detail,
  icon: Icon,
  label,
  state,
  tone,
}: {
  detail: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  state: string;
  tone: "success" | "warning";
}) {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <div
          className={cn(
            "mx-auto flex size-11 items-center justify-center rounded-full",
            tone === "success"
              ? "bg-success/10 text-success-foreground"
              : "bg-warning/10 text-warning-foreground"
          )}
        >
          <Icon className="size-5" />
        </div>
        <p className="mt-3 font-semibold">{label}</p>
        <Badge className="mt-2" variant={tone}>
          {state}
        </Badge>
        <p className="mt-3 text-muted-foreground text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}

function CycleHistory() {
  return (
    <Frame>
      <FramePanel>
        <div className="flex items-start gap-3">
          <History className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <p className="font-semibold text-sm">Request history retained</p>
            <p className="mt-1 text-muted-foreground text-xs leading-5">
              Cycle 1 returned for correction. Cycle 2 is the current submission
              on the same {drawRequest.displayId} / {drawRequest.workOrderKey}{" "}
              record. Prior reviewer identity and rationale remain private.
            </p>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function SummaryCheck({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-foreground" />
      <span>{label}</span>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-semibold text-base">{title}</h2>
    </div>
  );
}

function CompactFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-medium text-sm">{value}</p>
    </div>
  );
}
