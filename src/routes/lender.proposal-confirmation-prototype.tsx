import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  FileClock,
  History,
  LockKeyhole,
  MapPin,
  Milestone,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

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
import { Checkbox } from "../components/ui/checkbox";
import { Progress } from "../components/ui/progress";
import { Separator } from "../components/ui/separator";
import { Textarea } from "../components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { cn } from "../lib/utils";

// PROTOTYPE ONLY: the accepted in-place Proposal Review and decision side sheet,
// plus two rejected structures, on this route with ?variant=A|C|D.
const prototypeVariants = [
  { key: "A", label: "Rejected · Guided checkpoint" },
  { key: "C", label: "Rejected · Revision comparison" },
  { key: "D", label: "Accepted · Progressive dossier" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute("/lender/proposal-confirmation-prototype")(
  {
    validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
      variant: isPrototypeVariant(search.variant) ? search.variant : "D",
    }),
    component: LenderProposalConfirmationPrototype,
  }
);

const checkpoints = [
  {
    key: "milestones",
    label: "Milestone count",
    current: "8 Milestones",
    previous: "7 Milestones",
    detail:
      "One Milestone was added to separate exterior close-in from interior rough-in.",
    changed: true,
    icon: Milestone,
  },
  {
    key: "budget",
    label: "Budget",
    current: "$4.8M total Budget",
    previous: "$4.8M total Budget",
    detail: "The total Budget is unchanged in the current proposal revision.",
    changed: false,
    icon: Banknote,
  },
  {
    key: "schedule",
    label: "Schedule and timeline",
    current: "14-month construction schedule",
    previous: "13-month construction schedule",
    detail:
      "The additional Milestone extends the construction schedule by one month.",
    changed: true,
    icon: CalendarRange,
  },
  {
    key: "builder",
    label: "Builder",
    current: "Northstar Construction",
    previous: "Northstar Construction",
    detail: "The assigned builder is unchanged in this revision.",
    changed: false,
    icon: Building2,
  },
  {
    key: "policy",
    label: "Access and review policy",
    current: "Back Office-configured policy",
    previous: "Back Office-configured policy",
    detail: "The lender confirms this policy but cannot edit it.",
    changed: false,
    icon: ShieldCheck,
  },
] as const;

const policyFacts = [
  ["Draw approval", "Back Office and lender quorum"],
  ["Milestone approval", "Back Office and lender quorum"],
  ["Site visit", "Required"],
  ["Receipt / invoice evidence", "Required"],
  ["Lender quorum", "2 active lender members"],
] as const;

interface ReviewFact {
  label: string;
  value: string;
}

interface AcceptedReviewCard {
  changed?: boolean;
  currentFacts: readonly ReviewFact[];
  detail: string;
  icon: ComponentType<{ className?: string }>;
  key: string;
  label: string;
  previousFacts?: readonly ReviewFact[];
  readOnly?: boolean;
  summary: string;
}

const acceptedReviewCards: readonly AcceptedReviewCard[] = [
  {
    key: "property",
    label: "Property",
    summary: "Toronto, Ontario · Townhome development",
    detail:
      "Representative proposal facts are limited to location and build type.",
    icon: MapPin,
    currentFacts: [
      { label: "Location", value: "Toronto, Ontario" },
      { label: "Build type", value: "Townhome development" },
    ],
  },
  {
    key: "milestones-schedule",
    label: "Milestones & schedule",
    summary: "8 Milestones · 14-month construction schedule",
    detail:
      "One Milestone was added, extending the construction schedule by one month.",
    changed: true,
    icon: Milestone,
    previousFacts: [
      { label: "Milestone count", value: "7 Milestones" },
      { label: "Schedule", value: "13-month construction schedule" },
    ],
    currentFacts: [
      { label: "Milestone count", value: "8 Milestones" },
      { label: "Schedule", value: "14-month construction schedule" },
    ],
  },
  {
    key: "budget",
    label: "Budget",
    summary: "$4.8M total Budget",
    detail: "The total Budget is unchanged in the current proposal revision.",
    changed: false,
    icon: Banknote,
    currentFacts: [{ label: "Total Budget", value: "$4.8M" }],
  },
  {
    key: "builder",
    label: "Builder",
    summary: "Northstar Construction",
    detail:
      "The assigned builder is unchanged in the current proposal revision.",
    changed: false,
    icon: Building2,
    currentFacts: [{ label: "Builder", value: "Northstar Construction" }],
  },
  {
    key: "policy",
    label: "Access/review policy",
    summary: "Back Office-configured · lender read-only",
    detail: "The lender reviews and confirms this policy but cannot edit it.",
    changed: false,
    icon: ShieldCheck,
    currentFacts: [
      { label: "Configured by", value: "Back Office" },
      { label: "Lender control", value: "Confirm only" },
    ],
    readOnly: true,
  },
];

function LenderProposalConfirmationPrototype() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const selectVariant = (nextVariant: string) => {
    if (!isPrototypeVariant(nextVariant)) return;
    void navigate({
      replace: true,
      search: { variant: nextVariant },
      to: "/lender/proposal-confirmation-prototype",
    });
  };

  return (
    <LenderPrototypeShell
      activeNavigation="Proposals"
      pageTitle={variant === "D" ? "Juniper Row Homes" : "Proposal review"}
      workspace={variant === "D" ? "backoffice" : "lender"}
    >
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-28">
        <div className="border-y border-amber-500/30 bg-amber-50 px-4 py-2 text-center text-[11px] font-medium tracking-wide text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          THROWAWAY PROTOTYPE · READ-ONLY REPRESENTATIVE DATA · NO DECISIONS ARE
          SAVED
        </div>
        <main className="mx-auto min-w-0 max-w-[1440px] p-4">
          {variant === "D" ? (
            <VariantD />
          ) : (
            <>
              <ProposalContext variant={variant} />
              {variant === "A" ? <VariantA /> : null}
              {variant === "C" ? <VariantC /> : null}
            </>
          )}
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

function ProposalContext({ variant }: { variant: PrototypeVariantKey }) {
  return (
    <header className="mb-5 flex flex-col justify-between gap-4 border-b pb-5 lg:flex-row lg:items-end">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge>Confirmation required</Badge>
          <Badge variant="outline">Revision 3</Badge>
          <Badge className="gap-1" variant="secondary">
            <FileClock className="size-3" /> Review cycle 2
          </Badge>
          <Badge className="gap-1" variant="outline">
            <LockKeyhole className="size-3" /> Policy read-only
          </Badge>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Back Office approved · Pending closing
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Juniper Row Homes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Full lender confirmation repeats because Back Office published a
          revised proposal.
        </p>
      </div>
      {variant === "D" ? (
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Review coverage
          </p>
          <p className="mt-1 text-sm font-semibold">
            5 required cards available
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Current cycle
            </p>
            <p className="mt-1 text-sm font-semibold">0 of 5 confirmed</p>
          </div>
          <Progress
            aria-label="Confirmation progress"
            className="w-28"
            value={0}
          />
        </div>
      )}
    </header>
  );
}

function VariantA() {
  const focused = checkpoints[0];
  const Icon = focused.icon;

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_310px]">
      <Card className="h-fit">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Required checkpoints</CardTitle>
          <p className="text-xs text-muted-foreground">
            Review all five again for Revision 3
          </p>
        </CardHeader>
        <CardContent className="px-2 py-2">
          {checkpoints.map((checkpoint, index) => {
            const StepIcon = checkpoint.icon;
            return (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-3",
                  index === 0 ? "bg-primary/10" : "text-muted-foreground"
                )}
                key={checkpoint.key}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StepIcon className="size-3.5" />
                    <p className="text-xs font-semibold text-foreground">
                      {checkpoint.label}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-[10px]">
                    {checkpoint.current}
                  </p>
                  {checkpoint.changed ? (
                    <Badge className="mt-2" variant="outline">
                      Changed
                    </Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b bg-primary/5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Checkpoint 1 of 5
                </p>
                <CardTitle className="mt-1">{focused.label}</CardTitle>
              </div>
            </div>
            <Badge>Changed in Revision 3</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 py-5">
          <RevisionDelta checkpoint={focused} />
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Current proposal fact</p>
            <p className="mt-2 text-2xl font-semibold">{focused.current}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {focused.detail}
            </p>
          </div>
          <ReadOnlyActions />
        </CardContent>
      </Card>

      <div className="grid h-fit gap-5">
        <PriorDecline />
        <CycleHistory compact />
      </div>
    </div>
  );
}

interface AcknowledgementAuditRecord {
  actor: "Morgan Lee";
  areaKey: string;
  areaLabel: string;
  recordedAt: string;
  role: "Lender user";
  sequence: number;
  state: "Acknowledged" | "Acknowledgement cleared";
}

function VariantD() {
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);

  return (
    <>
      <BackOfficeProposalPacketHost
        onOpenLenderReview={() => setReviewSheetOpen(true)}
      />
      {reviewSheetOpen ? (
        <LenderReviewSheet onClose={() => setReviewSheetOpen(false)} />
      ) : null}
    </>
  );
}

// TODO(lender-portal): replace packet fixture data and local acknowledgement
// state with the canonical proposal revision, audit, and decision commands.
export function LenderProposalReviewVariantD() {
  return <VariantD />;
}

function BackOfficeProposalPacketHost({
  onOpenLenderReview,
}: {
  onOpenLenderReview: () => void;
}) {
  const tabs = ["Packet", "Review", "Milestones", "Draws", "Closing"];

  return (
    <div className="grid gap-5">
      <header className="flex flex-col justify-between gap-4 border-b pb-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>Approved</Badge>
            <Badge variant="outline">Closing pending</Badge>
            <Badge variant="secondary">Revision 3</Badge>
            <Badge variant="outline">Accepted Variant D</Badge>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Back Office · Proposal packet
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Juniper Row Homes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Toronto, Ontario · Townhome development
          </p>
        </div>
        <Button className="gap-2" onClick={onOpenLenderReview}>
          Open lender confirmation <ChevronRight className="size-4" />
        </Button>
      </header>

      <nav
        aria-label="Proposal packet sections"
        className="flex gap-1 overflow-x-auto border-b"
      >
        {tabs.map((tab) => (
          <Button
            aria-current={tab === "Packet" ? "page" : undefined}
            className="rounded-b-none"
            key={tab}
            tabIndex={tab === "Packet" ? 0 : -1}
            variant={tab === "Packet" ? "secondary" : "ghost"}
          >
            {tab}
          </Button>
        ))}
      </nav>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid gap-4">
          <PacketHostSection title="Build, site, and loan summary">
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="grid min-h-44 place-items-center rounded-lg border bg-muted/50 p-5 text-center">
                <div>
                  <MapPin className="mx-auto size-7 text-muted-foreground" />
                  <p className="mt-3 text-sm font-semibold">Toronto, Ontario</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Townhome development
                  </p>
                </div>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <PacketHostFact
                  label="Builder"
                  value="Northstar Construction"
                />
                <PacketHostFact
                  label="Status"
                  value="Approved, closing pending"
                />
                <PacketHostFact label="Milestones" value="8" />
                <PacketHostFact label="Planned duration" value="14 months" />
              </dl>
            </div>
          </PacketHostSection>

          <PacketHostSection title="Milestone and submilestone worksheet">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packet item</TableHead>
                  <TableHead>Current revision</TableHead>
                  <TableHead className="text-right">Review state</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Milestone count</TableCell>
                  <TableCell>8 Milestones</TableCell>
                  <TableCell className="text-right">
                    <Badge>Changed</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    Construction schedule
                  </TableCell>
                  <TableCell>14 months</TableCell>
                  <TableCell className="text-right">
                    <Badge>Changed</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </PacketHostSection>
        </div>

        <div className="grid h-fit gap-4">
          <PacketHostSection title="Closing financials">
            <PacketHostFact label="Budget" value="$4.8M" />
            <PacketHostFact
              label="Closing state"
              value="Approved, closing pending"
            />
          </PacketHostSection>
          <PacketHostSection title="Build details">
            <PacketHostFact label="Build type" value="Townhome development" />
            <PacketHostFact label="Builder" value="Northstar Construction" />
          </PacketHostSection>
          <PacketHostSection title="Documents">
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <FileText className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs font-semibold">Proposal attachments</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Packet documents remain attached to the Back Office proposal
                  record.
                </p>
              </div>
            </div>
          </PacketHostSection>
        </div>
      </div>
    </div>
  );
}

function PacketHostSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 py-4">{children}</CardContent>
    </Card>
  );
}

function PacketHostFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function LenderReviewSheet({ onClose }: { onClose: () => void }) {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [acknowledgedKeys, setAcknowledgedKeys] = useState<string[]>([]);
  const [auditRecords, setAuditRecords] = useState<
    AcknowledgementAuditRecord[]
  >([]);
  const [decisionMode, setDecisionMode] = useState<"confirm" | "decline">(
    "confirm"
  );
  const [declineReason, setDeclineReason] = useState("");
  const confirmationReady =
    acknowledgedKeys.length === acceptedReviewCards.length;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const recordAcknowledgement = (
    card: AcceptedReviewCard,
    acknowledged: boolean
  ) => {
    setAcknowledgedKeys((current) =>
      acknowledged
        ? [...current.filter((key) => key !== card.key), card.key]
        : current.filter((key) => key !== card.key)
    );
    setAuditRecords((current) => [
      ...current,
      {
        actor: "Morgan Lee",
        areaKey: card.key,
        areaLabel: card.label,
        recordedAt: new Intl.DateTimeFormat("en-CA", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        }).format(new Date()),
        role: "Lender user",
        sequence: current.length + 1,
        state: acknowledged ? "Acknowledged" : "Acknowledgement cleared",
      },
    ]);
  };

  return (
    <aside
      aria-labelledby="lender-review-sheet-title"
      aria-modal="false"
      className="fixed inset-y-0 right-0 z-[80] flex w-full flex-col border-l bg-background shadow-2xl sm:max-w-[760px]"
      role="dialog"
    >
      <header className="shrink-0 border-b bg-background px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge>Confirmation required</Badge>
              <Badge variant="outline">Revision 3</Badge>
              <Badge variant="secondary">Review cycle 2</Badge>
            </div>
            <h2
              className="text-lg font-semibold"
              id="lender-review-sheet-title"
            >
              Lender proposal confirmation
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Juniper Row Homes · no acknowledgement or decision is saved
            </p>
          </div>
          <Button
            aria-label="Close lender confirmation sheet"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Progress
            aria-label="Lender acknowledgement progress"
            className="flex-1"
            value={(acknowledgedKeys.length / acceptedReviewCards.length) * 100}
          />
          <p className="shrink-0 text-xs font-semibold">
            {acknowledgedKeys.length} of {acceptedReviewCards.length}{" "}
            acknowledged
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-0.5 size-5" />
            <div>
              <p className="text-sm font-semibold">
                Full confirmation is inside this sheet
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Expand each read-only area, then acknowledge the current
                Revision 3 facts. Every change to an acknowledgement is recorded
                below as prototype audit evidence.
              </p>
            </div>
          </div>
        </div>

        {acceptedReviewCards.map((card, index) => {
          const acknowledged = acknowledgedKeys.includes(card.key);
          const lastRecord = [...auditRecords]
            .reverse()
            .find((record) => record.areaKey === card.key);
          return (
            <ProgressiveReviewCard
              acknowledged={acknowledged}
              auditRecord={lastRecord}
              card={card}
              expanded={expandedCard === card.key}
              index={index}
              key={card.key}
              onAcknowledgementChange={(checked) =>
                recordAcknowledgement(card, checked)
              }
              onToggle={() =>
                setExpandedCard((current) =>
                  current === card.key ? null : card.key
                )
              }
            />
          );
        })}

        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="size-4" /> Acknowledgement audit trail
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Actor, role, recorded state, sequence, and local prototype
              timestamp
            </p>
          </CardHeader>
          <CardContent className="py-4">
            {auditRecords.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No acknowledgements recorded in this prototype session.
              </p>
            ) : (
              <ol className="grid gap-3">
                {auditRecords.map((record) => (
                  <li
                    className="grid gap-1 rounded-lg border p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
                    key={`${record.areaKey}-${record.sequence}`}
                  >
                    <Badge variant="outline">#{record.sequence}</Badge>
                    <div>
                      <p className="text-xs font-semibold">
                        {record.areaLabel} · {record.state}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {record.actor} · {record.role}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {record.recordedAt}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <PriorDecline />
        <CycleHistory compact />

        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-sm">Lender decision</CardTitle>
            <p className="text-xs text-muted-foreground">
              Confirmation unlocks only after all five required areas are
              acknowledged. Decline remains available with a required reason.
            </p>
          </CardHeader>
          <CardContent className="py-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                aria-pressed={decisionMode === "confirm"}
                onClick={() => setDecisionMode("confirm")}
                variant={decisionMode === "confirm" ? "default" : "outline"}
              >
                Confirm
              </Button>
              <Button
                aria-pressed={decisionMode === "decline"}
                onClick={() => setDecisionMode("decline")}
                variant={decisionMode === "decline" ? "destructive" : "outline"}
              >
                Decline
              </Button>
            </div>

            {decisionMode === "confirm" ? (
              <div className="mt-4 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  {confirmationReady ? (
                    <CheckCircle2 className="mt-0.5 size-5 text-primary" />
                  ) : (
                    <LockKeyhole className="mt-0.5 size-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">
                      {confirmationReady
                        ? "Ready to confirm"
                        : "Acknowledgements incomplete"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {confirmationReady
                        ? "All five acknowledgement records are present for the current revision."
                        : `${acceptedReviewCards.length - acknowledgedKeys.length} required area${acceptedReviewCards.length - acknowledgedKeys.length === 1 ? " remains" : "s remain"} unacknowledged.`}
                    </p>
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  disabled={!confirmationReady}
                  onClick={(event) => event.preventDefault()}
                >
                  Confirm Revision 3
                </Button>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-destructive/30 p-4">
                <label
                  className="text-sm font-semibold"
                  htmlFor="proposal-decline-reason"
                >
                  Decline reason{" "}
                  <span className="text-destructive">Required</span>
                </label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  State what Back Office must correct before publishing the next
                  review cycle.
                </p>
                <Textarea
                  aria-required="true"
                  className="mt-3 min-h-24"
                  id="proposal-decline-reason"
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="Required reason for declining this revision"
                  required
                  value={declineReason}
                />
                <Button
                  className="mt-4 w-full"
                  disabled={!declineReason.trim()}
                  onClick={(event) => event.preventDefault()}
                  variant="destructive"
                >
                  Decline Revision 3
                </Button>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  The proposal remains pending. Back Office updates it in place,
                  and the full lender review repeats.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="shrink-0 border-t bg-muted/20 px-5 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] leading-4 text-muted-foreground">
            Throwaway prototype · local state only
          </p>
          <Button onClick={onClose} size="sm" variant="outline">
            Return to proposal packet
          </Button>
        </div>
      </footer>
    </aside>
  );
}

function VariantC() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between border-b">
            <div>
              <CardTitle>Revision comparison</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Prior lender-reviewed facts beside the current full confirmation
                cycle
              </p>
            </div>
            <Badge variant="outline">2 changed · 3 unchanged</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Checkpoint</TableHead>
                  <TableHead>Prior review · Revision 2</TableHead>
                  <TableHead>Current · Revision 3</TableHead>
                  <TableHead className="pr-5 text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkpoints.map((checkpoint) => {
                  const Icon = checkpoint.icon;
                  return (
                    <TableRow
                      className={
                        checkpoint.changed ? "bg-primary/[0.04]" : undefined
                      }
                      key={checkpoint.key}
                    >
                      <TableCell className="pl-5 py-4">
                        <div className="flex items-center gap-2 font-semibold">
                          <Icon className="size-4 text-muted-foreground" />{" "}
                          {checkpoint.label}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {checkpoint.previous}
                      </TableCell>
                      <TableCell className="font-medium">
                        {checkpoint.current}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <Badge
                          variant={checkpoint.changed ? "default" : "outline"}
                        >
                          {checkpoint.changed ? "Changed" : "Unchanged"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid h-fit gap-5">
          <PriorDecline />
          <PolicyCard />
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Confirmation-cycle history</CardTitle>
        </CardHeader>
        <CardContent className="py-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
            <HistoryEvent
              icon={TriangleAlert}
              label="Cycle 1"
              title="Lender declined Revision 2"
            />
            <ArrowRight className="hidden size-4 text-muted-foreground md:block" />
            <HistoryEvent
              icon={FileClock}
              label="Back Office"
              title="Revision 3 published in place"
            />
            <ArrowRight className="hidden size-4 text-muted-foreground md:block" />
            <HistoryEvent
              active
              icon={ClipboardCheck}
              label="Cycle 2"
              title="Full confirmation required again"
            />
          </div>
        </CardContent>
      </Card>

      <ReadOnlyActions horizontal />
    </div>
  );
}

function ProgressiveReviewCard({
  acknowledged,
  auditRecord,
  card,
  expanded,
  index,
  onAcknowledgementChange,
  onToggle,
}: {
  acknowledged: boolean;
  auditRecord?: AcknowledgementAuditRecord;
  card: AcceptedReviewCard;
  expanded: boolean;
  index: number;
  onAcknowledgementChange: (acknowledged: boolean) => void;
  onToggle: () => void;
}) {
  const Icon = card.icon;
  const detailsId = `proposal-review-card-${card.key}`;
  const acknowledgementId = `proposal-review-acknowledgement-${card.key}`;

  return (
    <Card className="overflow-hidden">
      <button
        aria-controls={detailsId}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${card.label} details`}
        className="grid w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-center"
        onClick={onToggle}
        type="button"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-full border text-xs font-semibold">
            {index + 1}
          </div>
          <div>
            <p className="text-sm font-semibold">{card.label}</p>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Icon className="size-3" /> Required review card
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{card.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {expanded ? "Hide proposal detail" : "Show proposal detail"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {acknowledged ? <Badge>Acknowledged</Badge> : null}
          {card.readOnly ? <Badge variant="secondary">Read-only</Badge> : null}
          {card.changed === true ? (
            <Badge>Changed</Badge>
          ) : card.changed === false ? (
            <Badge variant="outline">Unchanged</Badge>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {expanded ? (
        <div className="border-t bg-muted/20 px-5 py-5" id={detailsId}>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            {card.detail}
          </p>
          {card.previousFacts ? (
            <div className="mb-4 grid gap-3 lg:grid-cols-2">
              <ReviewFacts
                facts={card.previousFacts}
                label="Prior lender-reviewed revision"
                muted
              />
              <ReviewFacts facts={card.currentFacts} label="Current revision" />
            </div>
          ) : (
            <ReviewFacts
              facts={card.currentFacts}
              label="Current proposal facts"
            />
          )}
          {card.key === "policy" ? <PolicyFacts compact /> : null}
        </div>
      ) : null}

      <div className="border-t px-5 py-4">
        <div className="flex items-start gap-3">
          <Checkbox
            aria-label={`Acknowledge ${card.label}`}
            checked={acknowledged}
            id={acknowledgementId}
            onCheckedChange={onAcknowledgementChange}
          />
          <div className="min-w-0 flex-1">
            <label
              className="cursor-pointer text-xs font-semibold"
              htmlFor={acknowledgementId}
            >
              I acknowledge the current {card.label.toLowerCase()} facts
            </label>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              This control creates local prototype audit evidence for Morgan Lee
              as a lender user.
            </p>
            {auditRecord ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-[10px]">
                <Badge variant="outline">Audit #{auditRecord.sequence}</Badge>
                <span>
                  {auditRecord.actor} · {auditRecord.role}
                </span>
                <span className="font-semibold">{auditRecord.state}</span>
                <span className="text-muted-foreground">
                  {auditRecord.recordedAt}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ReviewFacts({
  facts,
  label,
  muted = false,
}: {
  facts: readonly ReviewFact[];
  label: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-4",
        muted && "text-muted-foreground"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="mt-1 text-sm font-semibold">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RevisionDelta({
  checkpoint,
}: {
  checkpoint: (typeof checkpoints)[number];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Prior lender-reviewed revision
        </p>
        <p className="mt-2 text-sm font-medium text-muted-foreground line-through decoration-muted-foreground/50">
          {checkpoint.previous}
        </p>
      </div>
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Current revision
        </p>
        <p className="mt-2 text-sm font-semibold">{checkpoint.current}</p>
      </div>
    </div>
  );
}

function PriorDecline() {
  return (
    <Card className="border-destructive/30">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-destructive" />
          <CardTitle className="text-sm">Prior cycle declined</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          Revision 2 · lender decision retained in history
        </p>
      </CardHeader>
      <CardContent className="py-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Required reason
        </p>
        <p className="mt-2 text-sm leading-6">
          “The Milestone count did not match the schedule summary. Separate
          exterior close-in from interior rough-in.”
        </p>
        <Separator className="my-4" />
        <p className="text-xs text-muted-foreground">
          Proposal remained Back Office-approved and pending closing while it
          was revised in place.
        </p>
      </CardContent>
    </Card>
  );
}

function CycleHistory({ compact = false }: { compact?: boolean }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4" /> Cycle history
        </CardTitle>
      </CardHeader>
      <CardContent className="py-4">
        <div className="grid gap-4">
          <TimelineItem
            complete
            label="Cycle 1"
            text="Revision 2 reviewed and declined with reason"
          />
          <TimelineItem
            complete
            label="Revision update"
            text="Back Office published Revision 3 in place"
          />
          <TimelineItem
            label="Cycle 2"
            text="Full proposal confirmation is required again"
          />
        </div>
        {!compact ? (
          <p className="mt-4 border-t pt-4 text-[10px] leading-4 text-muted-foreground">
            Earlier revision facts, checkpoint confirmations, decisions, and
            decline reasons remain retained.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TimelineItem({
  complete = false,
  label,
  text,
}: {
  complete?: boolean;
  label: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
          complete && "bg-muted"
        )}
      >
        {complete ? (
          <Check className="size-3" />
        ) : (
          <Circle className="size-2.5" />
        )}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-xs leading-5">{text}</p>
      </div>
    </div>
  );
}

function PolicyCard() {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <LockKeyhole className="size-4" /> Access and review policy
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Configured by Back Office · lender read-only
        </p>
      </CardHeader>
      <CardContent className="py-4">
        <PolicyFacts />
      </CardContent>
    </Card>
  );
}

function PolicyFacts({ compact = false }: { compact?: boolean }) {
  return (
    <dl
      className={cn(
        "grid gap-3",
        compact && "mt-3 border-t pt-3 sm:grid-cols-2"
      )}
    >
      {policyFacts.map(([label, value]) => (
        <div
          className={cn(
            !compact &&
              "flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"
          )}
          key={label}
        >
          <dt className="text-[10px] text-muted-foreground">{label}</dt>
          <dd className={cn("text-xs font-medium", !compact && "text-right")}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReadOnlyActions({ horizontal = false }: { horizontal?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed bg-muted/20 p-4",
        horizontal &&
          "flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
      )}
    >
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="size-4" /> Decision controls preview
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Disabled in this read-only prototype. Decline requires a reason;
          approval requires all five confirmations.
        </p>
      </div>
      <div className={cn("mt-4 flex gap-2", horizontal && "mt-0")}>
        <Button disabled variant="outline">
          Decline with reason
        </Button>
        <Button disabled>
          Confirm checkpoint <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function HistoryEvent({
  active = false,
  icon: Icon,
  label,
  title,
}: {
  active?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        active && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <p className="mt-2 text-sm font-semibold">{title}</p>
    </div>
  );
}
