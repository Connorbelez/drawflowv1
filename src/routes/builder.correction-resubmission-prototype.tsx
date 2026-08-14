import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  History,
  LockKeyhole,
  MapPinned,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  UploadCloud,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { PrototypeVariantSwitcher } from "#/components/prototypes/PrototypeVariantSwitcher.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { FileUploader } from "#/components/ui/file-uploader.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";

// PROTOTYPE ONLY: three unselected Builder correction/resubmission variants at
// /builder/correction-resubmission-prototype?variant=A|B|C. Local state only.
// No variant is accepted, approved, or locked. After explicit selection, the
// selected route/component structure must be promoted directly, not rebuilt.
const variants = [
  { key: "A", label: "Canonical Builder adaptation" },
  { key: "B", label: "Guided field repair" },
  { key: "C", label: "Cycle ledger repair bench" },
] as const;
type Variant = (typeof variants)[number]["key"];
type Kind = "milestone" | "draw";
type RequestState = "correction" | "pending" | "partial" | "approved" | "stale";
const validVariant = (value: unknown): value is Variant =>
  variants.some((v) => v.key === value);

export const Route = createFileRoute(
  "/builder/correction-resubmission-prototype"
)({
  validateSearch: (search: Record<string, unknown>) => ({
    variant: validVariant(search.variant) ? search.variant : "A",
  }),
  component: PrototypeRoute,
});

const milestone = {
  id: "MR-07-018",
  label: "Framing and roof dry-in",
  actual: 148_000,
  documented: 144_800,
};
const draw = {
  id: "DR-2048",
  label: "Draw 04 · Framing reimbursement",
  amount: 68_500,
};
const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function PrototypeRoute() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { variant } = Route.useSearch();
  if (import.meta.env.PROD) {
    return null;
  }
  return (
    <BuilderCorrectionPrototypeSurface
      onVariantChange={(next) =>
        navigate({ search: { variant: next }, replace: true })
      }
      variant={variant}
    />
  );
}

export function BuilderCorrectionPrototypeSurface({
  initialAttached = false,
  initialCycle = 2,
  initialRequestKind = "milestone",
  initialState = "correction",
  onVariantChange = () => undefined,
  variant,
}: {
  initialAttached?: boolean;
  initialCycle?: number;
  initialRequestKind?: Kind;
  initialState?: RequestState;
  onVariantChange?: (variant: Variant) => void;
  variant: Variant;
}) {
  const [kind, setKind] = useState<Kind>(initialRequestKind);
  const [state, setState] = useState<RequestState>(initialState);
  const [cycle, setCycle] = useState(initialCycle);
  const [attached, setAttached] = useState(initialAttached);
  const [live, setLive] = useState("Local correction preview ready.");
  const eligible = kind === "draw" || attached;
  const documented = milestone.documented + (attached ? 3200 : 0);

  const reset = (nextKind = kind) => {
    setKind(nextKind);
    setState("correction");
    setCycle(2);
    setAttached(false);
    setLive("Local state reset to decision cycle 2.");
  };
  const attach = () => {
    setAttached(true);
    setLive(
      kind === "milestone"
        ? "Representative invoice attached. Documented total now equals actual cost."
        : "Representative Draw evidence attached."
    );
  };
  const resubmit = () => {
    if (!eligible || state !== "correction") {
      return;
    }
    setCycle((value) => value + 1);
    setState("pending");
    setLive(
      `Same request resubmitted into decision cycle ${cycle + 1}. All required approvals reset.`
    );
  };

  const props = {
    kind,
    state,
    cycle,
    attached,
    eligible,
    documented,
    setKind: (value: Kind) => reset(value),
    setState,
    reset: () => reset(),
    attach,
    resubmit,
  };
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background pb-28">
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      {variant === "A" ? <VariantA {...props} /> : null}
      {variant === "B" ? <VariantB {...props} /> : null}
      {variant === "C" ? <VariantC {...props} /> : null}
      <PrototypeVariantSwitcher
        current={variant}
        onChange={(value) => {
          const activeElement = document.activeElement;
          if (
            activeElement instanceof HTMLElement &&
            activeElement.matches(
              'input, textarea, select, [role="combobox"], [contenteditable="true"]'
            )
          ) {
            return;
          }
          onVariantChange(value as Variant);
        }}
        variants={variants}
      />
    </main>
  );
}

interface Props {
  attach: () => void;
  attached: boolean;
  cycle: number;
  documented: number;
  eligible: boolean;
  kind: Kind;
  reset: () => void;
  resubmit: () => void;
  setKind: (value: Kind) => void;
  setState: (value: RequestState) => void;
  state: RequestState;
}

function Header(props: Props) {
  const request = props.kind === "milestone" ? milestone : draw;
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Throwaway prototype</Badge>
            <Badge variant="secondary">Local state only</Badge>
            <Badge variant="warning">Awaiting variant decision</Badge>
          </div>
          <h1 className="mt-4 text-balance font-semibold text-2xl tracking-tight sm:text-3xl">
            Correct and resubmit
          </h1>
          <p className="mt-2 max-w-[70ch] text-muted-foreground text-sm leading-relaxed">
            Repair the configured requirements on the existing request. Your
            next submission starts decision cycle {props.cycle + 1} on the same
            request record and resets every required approval.
          </p>
        </div>
        <div className="text-sm xl:text-right">
          <p className="font-medium">Harbourline Residences</p>
          <p className="mt-1 text-muted-foreground">
            {request.id} · Decision cycle {props.cycle}
          </p>
        </div>
      </div>
      <Frame>
        <FramePanel className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
            <p className="font-medium text-xs">Request type</p>
            <div className="mt-2 flex gap-2">
              <Button
                aria-pressed={props.kind === "milestone"}
                onClick={() => props.setKind("milestone")}
                size="sm"
                variant={props.kind === "milestone" ? "default" : "outline"}
              >
                Milestone completion
              </Button>
              <Button
                aria-pressed={props.kind === "draw"}
                onClick={() => props.setKind("draw")}
                size="sm"
                variant={props.kind === "draw" ? "default" : "outline"}
              >
                Draw Request
              </Button>
            </div>
          </div>
          <div>
            <label className="font-medium text-xs" htmlFor="prototype-state">
              Preview high-level state
            </label>
            <select
              className="mt-2 h-9 w-full rounded-lg border bg-background px-3 text-sm"
              id="prototype-state"
              onChange={(e) => props.setState(e.target.value as RequestState)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.stopPropagation();
                }
              }}
              value={props.state}
            >
              <option value="correction">Correction required</option>
              <option value="pending">Pending review</option>
              <option value="partial">Partial approval</option>
              <option value="approved">Approved</option>
              <option value="stale">Stale / changed elsewhere</option>
            </select>
          </div>
          <Button onClick={props.reset} size="sm" variant="ghost">
            <RotateCcw /> Reset local state
          </Button>
        </FramePanel>
      </Frame>
    </div>
  );
}

function StateBanner({
  state,
  kind,
  cycle,
}: Pick<Props, "state" | "kind" | "cycle">) {
  const config = {
    correction: [
      AlertTriangle,
      "Correction required",
      `The existing ${kind === "milestone" ? "Milestone" : "Draw"} request is editable again. Correct its configured requirements, then resubmit this same record.`,
    ],
    pending: [
      Clock3,
      "Pending review",
      `Decision cycle ${cycle} is submitted. Editing is locked while required review is pending.`,
    ],
    partial: [
      Clock3,
      "Partial approval",
      "One configured approval group is complete. Every required group must approve this cycle.",
    ],
    approved: [
      CheckCircle2,
      "Approved",
      "Every approval group required by the locked policy has approved this cycle.",
    ],
    stale: [
      RefreshCw,
      "Request changed elsewhere",
      "Reload the latest request cycle before making another correction.",
    ],
  }[state] as [typeof AlertTriangle, string, string];
  const Icon = config[0];
  return (
    <Alert
      className={
        state === "correction" ? "border-warning/35 bg-warning/6" : undefined
      }
    >
      <Icon />
      <AlertTitle>{config[1]}</AlertTitle>
      <AlertDescription>{config[2]}</AlertDescription>
    </Alert>
  );
}

function Privacy() {
  return (
    <Alert>
      <ShieldCheck />
      <AlertTitle>Your Builder-safe view</AlertTitle>
      <AlertDescription>
        This page shows configured requirements and high-level request state.
        Reviewer identity, private decision details, internal votes, and private
        audit content are not available in this view.
      </AlertDescription>
    </Alert>
  );
}

function Requirements(props: Props) {
  if (props.kind === "draw") {
    return (
      <div className="space-y-4">
        <Requirement
          detail="The reimbursement request remains DR-2048 across correction and resubmission."
          label="Same Draw Request record"
          ok
        />
        <Requirement
          detail="Back Office and lender quorum approvals reset for the next cycle."
          label="Locked decision policy understood"
          ok
        />
        <Requirement
          detail="No Draw-level Site Visit or receipt/invoice evidence gate is configured."
          label="No additional Draw evidence gate"
          ok
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Requirement
        detail={`${money.format(props.documented)} documented of ${money.format(milestone.actual)} actual cost.`}
        label="Receipt and invoice total equals actual cost"
        ok={props.documented === milestone.actual}
      />
      <Requirement
        detail="SV-482 is complete with 6 qualifying photos."
        label="Required Site Visit report and photo"
        ok
      />
      <Requirement
        detail="Back Office and lender quorum may approve in either order."
        label="Locked approval groups"
        ok
      />
    </div>
  );
}

function Requirement({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {ok ? (
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

function Evidence(props: Props) {
  const evidenceCycle =
    props.state === "correction" ? props.cycle + 1 : props.cycle;
  const referenceCycle =
    props.state === "correction" ? props.cycle : evidenceCycle;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-base">
          Evidence in this review context
        </h2>
        <p className="mt-1 text-muted-foreground text-xs">
          Only evidence referenced by this request and decision cycle appears
          here. This is not a document library.
        </p>
      </div>
      <div className="divide-y">
        {(props.kind === "milestone"
          ? [
              [
                "Northshore framing invoice",
                `$81,600.00 · Referenced by decision cycle ${referenceCycle}`,
              ],
              [
                "Roof dry-in invoice",
                `$63,200.00 · Referenced by decision cycle ${referenceCycle}`,
              ],
              [
                "Qualifying Site Visit report SV-482",
                `6 photos · Referenced by decision cycle ${referenceCycle}`,
              ],
            ]
          : [
              [
                "Draw Request evidence package EP-2048-R2",
                `Decision cycle ${referenceCycle} · 8 relevant items`,
              ],
            ]
        ).map(([label, detail]) => (
          <div
            className="flex items-start justify-between gap-4 py-3"
            key={label}
          >
            <div className="flex gap-3">
              <FileCheck2 className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">{label}</p>
                <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
              </div>
            </div>
            <Badge variant="secondary">Attached</Badge>
          </div>
        ))}
      </div>
      {props.state === "correction" && !props.attached ? (
        <FileUploader
          accept="application/pdf,image/*"
          description="Choose a local file for this request and decision cycle. Nothing is uploaded or persisted."
          helperText={
            props.kind === "milestone"
              ? "Representative receipt or invoice evidence only."
              : "Representative request-level evidence only."
          }
          inputLabel="Choose local correction evidence"
          multiple={false}
          onFilesChange={(files) => {
            if (files.length > 0) {
              props.attach();
            }
          }}
          showUploadButton={false}
          title={
            props.kind === "milestone"
              ? "Add the representative $3,200 invoice"
              : "Add representative Draw evidence"
          }
          variant="compact"
        />
      ) : null}
      {props.state === "correction" && !props.attached ? (
        <Button onClick={props.attach} size="sm" variant="ghost">
          <UploadCloud />
          {props.kind === "milestone"
            ? "Use representative evidence without choosing a file"
            : "Use representative Draw evidence without choosing a file"}
        </Button>
      ) : null}
      {props.attached ? (
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          <span>
            {props.kind === "milestone"
              ? "Correction invoice supplement"
              : "Updated request-level progress summary"}{" "}
            {props.state === "correction" ? "prepared for" : "referenced by"}
            {" decision cycle "}
            {evidenceCycle}.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Submit(props: Props) {
  if (props.state === "stale") {
    return (
      <div className="space-y-4">
        <h2 className="font-semibold">Load the latest request</h2>
        <p className="text-muted-foreground text-sm">
          Do not overwrite a newer cycle.
        </p>
        <Button className="w-full" onClick={props.reset}>
          <RefreshCw /> Reload local snapshot
        </Button>
      </div>
    );
  }
  if (props.state !== "correction") {
    return (
      <div className="space-y-3">
        <LockKeyhole className="size-4" />
        <h2 className="font-semibold">Current cycle is read-only</h2>
        <Badge variant={props.state === "approved" ? "success" : "secondary"}>
          {props.state === "pending"
            ? "Pending review"
            : props.state === "partial"
              ? "Partial approval"
              : "Approved"}
        </Badge>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-base">Resubmit the same request</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Keeps request identity and authorized history, starts cycle{" "}
          {props.cycle + 1}, and resets every required approval.
        </p>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Submission eligibility</span>
        <Badge variant={props.eligible ? "success" : "warning"}>
          {props.eligible ? "Eligible" : "Blocked"}
        </Badge>
      </div>
      <Button
        className="w-full"
        disabled={!props.eligible}
        onClick={props.resubmit}
      >
        <Send /> Resubmit corrected request
      </Button>
      <p className="text-muted-foreground text-xs">
        Prototype action only. No request, evidence, approval, notification, or
        audit record is written.
      </p>
    </div>
  );
}

function RequestHistory(props: Props) {
  const stateLabel =
    props.state === "correction"
      ? "Returned for correction"
      : props.state === "pending"
        ? "Pending review"
        : props.state === "partial"
          ? "Partial approval"
          : props.state === "approved"
            ? "Approved"
            : "Changed elsewhere";
  return (
    <div className="space-y-4">
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold text-base">Permitted request history</h2>
        <Badge variant="outline">High-level only</Badge>
      </div>
      <ol className="space-y-4">
        <li>
          <p className="font-medium text-sm">Decision cycle 1</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Submitted by your Builder team · 4 evidence references retained
          </p>
        </li>
        <li>
          <p className="font-medium text-sm">Decision cycle 2</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {props.cycle > 2 ? "Returned for correction" : stateLabel} · 3
            evidence references retained
          </p>
        </li>
        {props.cycle > 2 ? (
          <li>
            <p className="font-medium text-sm">Decision cycle {props.cycle}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {stateLabel} · Current request-cycle references retained
            </p>
          </li>
        ) : null}
      </ol>
      <p className="text-muted-foreground text-xs">
        Reviewer identity and private decision details are excluded.
      </p>
    </div>
  );
}

function Summary(props: Props) {
  const request = props.kind === "milestone" ? milestone : draw;
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-muted-foreground text-xs">Stable request</dt>
        <dd className="mt-1 font-medium">{request.id}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Current cycle</dt>
        <dd className="mt-1 font-medium">Decision cycle {props.cycle}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">Request</dt>
        <dd className="mt-1 font-medium">{request.label}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground text-xs">
          Locked decision policy
        </dt>
        <dd className="mt-1 font-medium">Back Office + lender quorum</dd>
      </div>
    </dl>
  );
}

function VariantA(props: Props) {
  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Header {...props} />
      <div className="grid gap-4 lg:grid-cols-2">
        <StateBanner {...props} />
        <Privacy />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.65fr_.75fr]">
        <Frame>
          <FramePanel className="space-y-6 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold text-lg">Current request</h2>
              <div className="mt-4">
                <Summary {...props} />
              </div>
            </div>
            <Separator />
            <div>
              <h2 className="font-semibold">Configured requirements</h2>
              <div className="mt-4">
                <Requirements {...props} />
              </div>
            </div>
            <Separator />
            <Evidence {...props} />
          </FramePanel>
        </Frame>
        <div className="space-y-5">
          <Frame>
            <FramePanel className="p-5">
              <Submit {...props} />
            </FramePanel>
          </Frame>
          <Frame>
            <FramePanel className="p-5">
              <RequestHistory {...props} />
            </FramePanel>
          </Frame>
        </div>
      </div>
    </div>
  );
}

function VariantB(props: Props) {
  const progress =
    props.state === "correction" ? (props.eligible ? 66 : 33) : 100;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <Header {...props} />
      <StateBanner {...props} />
      <Privacy />
      <Frame>
        <FramePanel className="space-y-4 p-5">
          <div className="flex justify-between">
            <h2 className="font-semibold">Correction progress</h2>
            <span className="text-sm">
              {Math.round(progress / 33)} of 3 ready
            </span>
          </div>
          <Progress value={progress} />
        </FramePanel>
      </Frame>
      <Card>
        <CardHeader>
          <CardTitle>Check the locked requirements</CardTitle>
          <CardDescription>
            These Build policy requirements cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Requirements {...props} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Repair this review context</CardTitle>
          <CardDescription>Add only relevant evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          <Evidence {...props} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Start the next decision cycle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3 text-sm">
            <p>Request identity · Stays the same</p>
            <p>Prior history · Retained</p>
            <p>Required approvals · Reset</p>
            <p>
              {props.state === "correction"
                ? `Next cycle · ${props.cycle + 1}`
                : `Current cycle · ${props.cycle}`}
            </p>
          </div>
          <Submit {...props} />
        </CardContent>
      </Card>
      <Frame>
        <FramePanel className="p-5">
          <RequestHistory {...props} />
        </FramePanel>
      </Frame>
    </div>
  );
}

function VariantC(props: Props) {
  const id = props.kind === "milestone" ? milestone.id : draw.id;
  return (
    <div className="mx-auto max-w-[1560px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <Header {...props} />
      <StateBanner {...props} />
      <div className="grid gap-5 xl:grid-cols-[280px_1fr_360px]">
        <Frame>
          <FramePanel className="space-y-6 p-5">
            <h2 className="font-semibold">Request ledger</h2>
            <Ledger icon={LockKeyhole} label="Request" value={id} />
            <Ledger
              icon={History}
              label="Retained cycles"
              value={`${props.cycle - 1} prior`}
            />
            <Ledger
              icon={Workflow}
              label="Current cycle"
              value={`${props.cycle}`}
            />
            <Ledger
              icon={Banknote}
              label="Request type"
              value={
                props.kind === "milestone"
                  ? "Milestone completion"
                  : "Draw reimbursement"
              }
            />
            <Separator />
            <RequestHistory {...props} />
          </FramePanel>
        </Frame>
        <Frame>
          <FramePanel className="space-y-6 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold text-lg">Correction bench</h2>
              <p className="mt-1 text-muted-foreground text-sm">
                Reconcile only the requirements and evidence bound to this
                request cycle.
              </p>
            </div>
            {props.kind === "milestone" ? (
              <div className="space-y-4">
                <h3 className="font-medium">Milestone cost reconciliation</h3>
                <Requirement
                  detail={`${money.format(props.documented)} of ${money.format(milestone.actual)}`}
                  label="Eligible receipts and invoices"
                  ok={props.eligible}
                />
                <Requirement
                  detail="Report + 6 photos"
                  label="Required Site Visit"
                  ok
                />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Draw correction boundary</CardTitle>
                  <CardDescription>
                    This Draw Request has no configured receipt/invoice or Site
                    Visit gate. Pooled funding allocation is not shown.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
            <Separator />
            <Evidence {...props} />
          </FramePanel>
        </Frame>
        <div className="space-y-5">
          <Frame>
            <FramePanel className="p-5">
              <h2 className="mb-4 font-semibold">Cycle command</h2>
              <Submit {...props} />
            </FramePanel>
          </Frame>
          <Privacy />
          <Frame>
            <FramePanel className="space-y-3 p-5">
              <h2 className="font-semibold">What this cannot do</h2>
              <Boundary
                icon={ShieldCheck}
                text="Cannot approve, reject, release, or change locked policy."
              />
              <Boundary
                icon={FileText}
                text="Cannot open another Build or a broad document library."
              />
              <Boundary
                icon={MapPinned}
                text="Cannot create or complete a required Site Visit."
              />
              <Boundary
                icon={ReceiptText}
                text="Cannot attribute pooled Draw funding to a Milestone or Draw Group."
              />
            </FramePanel>
          </Frame>
        </div>
      </div>
    </div>
  );
}

function Ledger({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof History;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid size-8 place-items-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}
function Boundary({
  icon: Icon,
  text,
}: {
  icon: typeof ShieldCheck;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 text-muted-foreground text-xs">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{text}</p>
    </div>
  );
}
