import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileImage,
  FileText,
  History,
  ListTodo,
  Mail,
  MapPinCheck,
  MessageCircle,
  Phone,
  ReceiptText,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { LenderPrototypeShell } from "../components/prototypes/LenderPrototypeShell";
import { PrototypeVariantSwitcher } from "../components/prototypes/PrototypeVariantSwitcher";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Frame, FramePanel } from "../components/ui/frame";
import { Separator } from "../components/ui/separator";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "../components/ui/sheet";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../components/ui/tabs";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/utils";

const prototypeVariants = [
  { key: "A", label: "Financial summary sheet" },
  { key: "B", label: "Evidence ledger sheet" },
  { key: "C", label: "System Post workspace" },
] as const;

type PrototypeVariantKey = (typeof prototypeVariants)[number]["key"];
type Decision = "approve" | "decline" | null;

interface PrototypeSearch {
  variant: PrototypeVariantKey;
}

const isPrototypeVariant = (value: unknown): value is PrototypeVariantKey =>
  prototypeVariants.some((variant) => variant.key === value);

export const Route = createFileRoute("/lender/draw-review-sheet-prototype")({
  validateSearch: (search: Record<string, unknown>): PrototypeSearch => ({
    variant: isPrototypeVariant(search.variant) ? search.variant : "A",
  }),
  component: LenderDrawReviewSheetPrototype,
});

const drawRequest = {
  amount: 186_400,
  build: "Harbourline Residences",
  builder: "Northshore Build Co.",
  contact: {
    email: "avery@northshorebuild.ca",
    name: "Avery Chen",
    phone: "+1 905-555-0142",
    role: "Builder principal",
  },
  displayId: "DR-2048",
  location: "Hamilton, ON",
  note: "Reimbursement request for completed framing and roof dry-in work. Updated invoice package attached after the prior correction request.",
  submittedAt: "Aug 12, 2026 · 3:42 PM",
  submissionCycle: "Submission cycle 2",
} as const;

const financials = {
  availableNow: 242_900,
  coverageAmount: 386_400,
  coveragePercent: 90.2,
  drawnAmount: 185_600,
  postRequestAvailable: 56_500,
  totalApproved: 428_500,
} as const;

const evidence = [
  {
    amount: "$142,000.00",
    detail: "Invoice · submitted Aug 12",
    icon: ReceiptText,
    id: "EV-881",
    label: "Northshore framing invoice",
    state: "Included in coverage",
  },
  {
    amount: "$44,400.00",
    detail: "Invoice · submitted Aug 12",
    icon: FileText,
    id: "EV-884",
    label: "Roofing contractor invoice",
    state: "Included in coverage",
  },
  {
    amount: "18 images",
    detail: "Photo set · location signals verified",
    icon: FileImage,
    id: "EV-879",
    label: "Framing and sheathing evidence",
    state: "Relevant to this request",
  },
  {
    amount: "Completed Aug 11",
    detail: "Site visit · no open findings",
    icon: MapPinCheck,
    id: "SV-116",
    label: "Completion inspection report",
    state: "Relevant to this request",
  },
] as const;

const comments = [
  {
    initials: "AC",
    meta: "Builder · Aug 12, 3:42 PM",
    name: "Avery Chen",
    text: "The two revised invoices now match the reimbursement amount. I also attached the inspection photo set requested in the prior review.",
  },
  {
    initials: "ML",
    meta: "Lender reviewer · Aug 13, 9:18 AM",
    name: "Morgan Lee",
    text: "Invoice coverage is reconciled. Back Office review is complete; lender quorum remains open.",
  },
] as const;

const actionItems = [
  {
    assignee: "Morgan Lee",
    id: "AI-492",
    state: "In progress",
    title: "Confirm roofing invoice tax breakdown",
  },
  {
    assignee: "Back Office",
    id: "AI-497",
    state: "Open",
    title: "Record final invoice reconciliation note",
  },
] as const;

const money = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  style: "currency",
});

function LenderDrawReviewSheetPrototype() {
  const { variant } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [open, setOpen] = useState(true);

  const selectVariant = (nextVariant: string) => {
    if (!isPrototypeVariant(nextVariant)) {
      return;
    }
    navigate({
      replace: true,
      search: { variant: nextVariant },
      to: "/lender/draw-review-sheet-prototype",
    });
  };

  return (
    <LenderPrototypeShell activeNavigation="Draws" pageTitle="Draw review">
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/30 pb-24">
        <PrototypeBanner />
        <BackgroundWorkspace onOpen={() => setOpen(true)} />
      </div>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetPopup
          className="w-[calc(100%-1rem)] max-w-[76rem] sm:w-[calc(100%-2rem)]"
          showBackdrop={false}
          variant="inset"
        >
          <DrawSheetHeader variant={variant} />
          {variant === "A" ? <FinancialSummaryVariant /> : null}
          {variant === "B" ? <EvidenceLedgerVariant /> : null}
          {variant === "C" ? <SystemPostVariant /> : null}
        </SheetPopup>
      </Sheet>
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
      THROWAWAY PROTOTYPE · REPRESENTATIVE READ-ONLY DATA · NOTHING IS RECORDED
    </div>
  );
}

function BackgroundWorkspace({ onOpen }: { onOpen: () => void }) {
  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Draws / In review</p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">
            Draw requests
          </h1>
        </div>
        <Button onClick={onOpen}>Open draw review</Button>
      </div>
      <Frame className="opacity-65">
        <FramePanel className="p-0">
          <div className="grid grid-cols-[1.1fr_.8fr_.8fr_.7fr] gap-4 border-b px-5 py-3 text-muted-foreground text-xs uppercase tracking-wide">
            <span>Builder / build</span>
            <span>Requested</span>
            <span>Submitted</span>
            <span>Status</span>
          </div>
          <div className="grid grid-cols-[1.1fr_.8fr_.8fr_.7fr] items-center gap-4 px-5 py-4 text-sm">
            <span className="font-medium">Northshore Build Co.</span>
            <span className="tabular-nums">$186,400</span>
            <span>Aug 12, 2026</span>
            <Badge className="w-fit" variant="info">
              In lender review
            </Badge>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function DrawSheetHeader({ variant }: { variant: PrototypeVariantKey }) {
  return (
    <SheetHeader className="shrink-0 border-b pb-4">
      <div className="flex flex-wrap items-center gap-2 pr-10">
        <Badge variant="info">In lender review</Badge>
        <Badge variant="outline">{drawRequest.submissionCycle}</Badge>
        <span className="text-muted-foreground text-xs">
          Canonical Draw Request · history retained
        </span>
      </div>
      <SheetTitle className="pr-10">
        {drawRequest.displayId} · {money.format(drawRequest.amount)}
      </SheetTitle>
      <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <Building2 className="size-3.5" /> {drawRequest.build}
        </span>
        <span>Submitted {drawRequest.submittedAt}</span>
        <span>Variant {variant}</span>
      </SheetDescription>
    </SheetHeader>
  );
}

function FinancialSummaryVariant() {
  const [tab, setTab] = useState("overview");
  return (
    <Tabs className="min-h-0 flex-1 gap-0" onValueChange={setTab} value={tab}>
      <SheetTabs
        labels={[
          ["overview", "Overview"],
          ["collaboration", "Collaboration"],
          ["actions", "Action Items"],
          ["decision", "Decision"],
        ]}
      />
      <SheetPanel className="min-h-0 pb-28">
        <TabsPanel className="space-y-5 pt-4" value="overview">
          <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <FinancialHero />
            <BuilderContact prominent />
          </div>
          <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
            <RequestContext />
            <EvidenceList compact />
          </div>
          <PolicyState />
        </TabsPanel>
        <TabsPanel className="pt-4" value="collaboration">
          <CollaborationPanel />
        </TabsPanel>
        <TabsPanel className="pt-4" value="actions">
          <ActionItemsPanel />
        </TabsPanel>
        <TabsPanel className="pt-4" value="decision">
          <DecisionPanel />
        </TabsPanel>
      </SheetPanel>
      <DecisionFooter onSelect={() => setTab("decision")} />
    </Tabs>
  );
}

function EvidenceLedgerVariant() {
  const [tab, setTab] = useState("review");
  return (
    <Tabs className="min-h-0 flex-1 gap-0" onValueChange={setTab} value={tab}>
      <FinancialStrip />
      <SheetTabs
        labels={[
          ["review", "Review ledger"],
          ["collaboration", "Collaboration"],
          ["actions", "Action Items"],
          ["decision", "Decision"],
        ]}
      />
      <SheetPanel className="min-h-0 pb-28">
        <TabsPanel className="pt-4" value="review">
          <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <div className="space-y-5">
              <EvidenceList />
              <PolicyState />
            </div>
            <div className="space-y-5">
              <BuilderContact prominent />
              <RequestContext />
              <CoverageRing compact />
            </div>
          </div>
        </TabsPanel>
        <TabsPanel className="pt-4" value="collaboration">
          <CollaborationPanel />
        </TabsPanel>
        <TabsPanel className="pt-4" value="actions">
          <ActionItemsPanel />
        </TabsPanel>
        <TabsPanel className="pt-4" value="decision">
          <DecisionPanel />
        </TabsPanel>
      </SheetPanel>
      <DecisionFooter onSelect={() => setTab("decision")} />
    </Tabs>
  );
}

function SystemPostVariant() {
  const [tab, setTab] = useState("workstream");
  return (
    <Tabs className="min-h-0 flex-1 gap-0" onValueChange={setTab} value={tab}>
      <SheetTabs
        labels={[
          ["workstream", "Workstream"],
          ["request", "Draw Request"],
          ["decision", "Decision"],
        ]}
      />
      <SheetPanel className="min-h-0 pb-28">
        <TabsPanel className="space-y-5 pt-4" value="workstream">
          <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
            <div className="space-y-5">
              <BuilderContact prominent />
              <CoverageRing compact />
              <PolicyState />
            </div>
            <Frame>
              <FramePanel className="p-0">
                <div className="border-b px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">
                        Draw System Post · {drawRequest.displayId}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        One collaboration thread for this canonical request
                      </p>
                    </div>
                    <Badge variant="outline">Synced projection</Badge>
                  </div>
                </div>
                <div className="grid divide-y xl:grid-cols-2 xl:divide-x xl:divide-y-0">
                  <div className="p-5">
                    <CollaborationPanel embedded />
                  </div>
                  <div className="p-5">
                    <ActionItemsPanel embedded />
                  </div>
                </div>
              </FramePanel>
            </Frame>
          </div>
        </TabsPanel>
        <TabsPanel className="space-y-5 pt-4" value="request">
          <FinancialHero />
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <RequestContext />
            <EvidenceList compact />
          </div>
        </TabsPanel>
        <TabsPanel className="pt-4" value="decision">
          <DecisionPanel />
        </TabsPanel>
      </SheetPanel>
      <DecisionFooter onSelect={() => setTab("decision")} />
    </Tabs>
  );
}

function SheetTabs({
  labels,
}: {
  labels: readonly (readonly [string, string])[];
}) {
  return (
    <div className="shrink-0 border-b px-4 pt-1 sm:px-6">
      <TabsList
        aria-label="Draw review detail sections"
        className="w-full max-w-full justify-start overflow-x-auto"
        variant="underline"
      >
        {labels.map(([value, label]) => (
          <TabsTab key={value} value={value}>
            {label}
          </TabsTab>
        ))}
      </TabsList>
    </div>
  );
}

function FinancialHero() {
  return (
    <Frame>
      <FramePanel className="grid gap-6 p-5 md:grid-cols-[13rem_1fr] md:items-center">
        <CoverageRing />
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-3">
            <Metric
              label="Total approved"
              value={money.format(financials.totalApproved)}
            />
            <Metric
              label="Drawn amount"
              value={money.format(financials.drawnAmount)}
            />
            <Metric
              label="Draw availability"
              value={money.format(financials.availableNow)}
            />
            <Metric
              label="This request"
              value={money.format(drawRequest.amount)}
            />
            <Metric
              label="After this request"
              value={money.format(financials.postRequestAvailable)}
            />
            <Metric
              label="Coverage amount"
              value={money.format(financials.coverageAmount)}
            />
          </div>
          <Separator className="my-5" />
          <p className="text-muted-foreground text-sm">
            Total approved is the amount unlocked to date. Draw availability is
            pooled and can be used when needed; it is not reserved to a
            milestone or Draw Group.
          </p>
        </div>
      </FramePanel>
    </Frame>
  );
}

function FinancialStrip() {
  return (
    <div className="shrink-0 border-b bg-muted/35 px-6 py-3">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric
          label="Total approved"
          value={money.format(financials.totalApproved)}
        />
        <Metric label="Drawn" value={money.format(financials.drawnAmount)} />
        <Metric
          label="Available"
          value={money.format(financials.availableNow)}
        />
        <Metric
          label="Invoice coverage"
          value={`${financials.coveragePercent}%`}
        />
      </div>
    </div>
  );
}

function CoverageRing({ compact = false }: { compact?: boolean }) {
  const circumference = 2 * Math.PI * 43;
  const dash = (financials.coveragePercent / 100) * circumference;
  return (
    <div
      className={cn(
        "flex items-center gap-4",
        !compact && "flex-col justify-center text-center"
      )}
    >
      <div className={cn("relative shrink-0", compact ? "size-28" : "size-40")}>
        <svg
          aria-label={`${financials.coveragePercent}% invoice and receipt coverage`}
          className="size-full -rotate-90"
          viewBox="0 0 100 100"
        >
          <circle
            className="stroke-muted"
            cx="50"
            cy="50"
            fill="none"
            r="43"
            strokeWidth="8"
          />
          <circle
            className="stroke-primary"
            cx="50"
            cy="50"
            fill="none"
            r="43"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
            strokeWidth="8"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-semibold tabular-nums",
              compact ? "text-xl" : "text-3xl"
            )}
          >
            {financials.coveragePercent}%
          </span>
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            covered
          </span>
        </div>
      </div>
      <div className={cn(!compact && "text-center")}>
        <p className="font-medium text-sm">Receipt and invoice coverage</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {money.format(financials.coverageAmount)} of{" "}
          {money.format(financials.totalApproved)} total unlocked funds
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 font-semibold text-base tabular-nums">{value}</p>
    </div>
  );
}

function BuilderContact({ prominent = false }: { prominent?: boolean }) {
  return (
    <Card className={cn(prominent && "border-primary/25")}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-11">
            <AvatarFallback>NB</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Builder
            </p>
            <CardTitle className="truncate text-base">
              {drawRequest.builder}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">{drawRequest.contact.name}</p>
            <p className="text-muted-foreground text-xs">
              {drawRequest.contact.role}
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <Button
            render={
              <a
                aria-label={`Email ${drawRequest.contact.name}`}
                href={`mailto:${drawRequest.contact.email}`}
              >
                <Mail /> {drawRequest.contact.email}
              </a>
            }
            size="sm"
            variant="outline"
          />
          <Button
            render={
              <a
                aria-label={`Call ${drawRequest.contact.name}`}
                href={`tel:${drawRequest.contact.phone.replace(/[^+\d]/g, "")}`}
              >
                <Phone /> {drawRequest.contact.phone}
              </a>
            }
            size="sm"
            variant="outline"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function RequestContext() {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-sm">Submitted Draw Request</h2>
          <p className="mt-1 text-muted-foreground text-xs">
            {drawRequest.displayId} · {drawRequest.submissionCycle} ·{" "}
            {drawRequest.location}
          </p>
        </div>
        <p className="text-sm leading-6">{drawRequest.note}</p>
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground text-sm">Requested</span>
          <span className="font-semibold text-lg tabular-nums">
            {money.format(drawRequest.amount)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          No milestone allocation is recorded. The request draws from pooled
          availability unlocked by approved progress.
        </p>
      </FramePanel>
    </Frame>
  );
}

function EvidenceList({ compact = false }: { compact?: boolean }) {
  return (
    <Frame>
      <FramePanel className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-sm">Attached Evidence</h2>
            <p className="mt-1 text-muted-foreground text-xs">
              Request-level evidence · no milestone grouping
            </p>
          </div>
          <Badge variant="secondary">{evidence.length} relevant items</Badge>
        </div>
        <div className="divide-y">
          {evidence.map((item) => {
            const Icon = item.icon;
            return (
              <div
                className={cn(
                  "grid items-center gap-3 px-5 py-4",
                  compact
                    ? "grid-cols-[auto_1fr_auto]"
                    : "grid-cols-[auto_1fr_auto_auto]"
                )}
                key={item.id}
              >
                <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{item.label}</p>
                  <p className="mt-0.5 text-muted-foreground text-xs">
                    {item.detail} · {item.id}
                  </p>
                </div>
                {compact ? null : (
                  <Badge className="hidden md:inline-flex" variant="outline">
                    {item.state}
                  </Badge>
                )}
                <span className="text-right font-medium text-sm tabular-nums">
                  {item.amount}
                </span>
              </div>
            );
          })}
        </div>
      </FramePanel>
    </Frame>
  );
}

function PolicyState() {
  return (
    <Frame>
      <FramePanel className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-sm">Approval policy</h2>
            <p className="mt-1 text-muted-foreground text-xs">
              Back Office and lender quorum may complete in either order.
            </p>
          </div>
          <Badge variant="warning">1 of 2 gates satisfied</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Gate
            icon={<CheckCircle2 className="size-5 text-success" />}
            label="Back Office"
            state="Approved · Aug 13, 8:54 AM"
          />
          <Gate
            icon={<Circle className="size-5 text-muted-foreground" />}
            label="Lender quorum"
            state="1 of 2 approvals recorded"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          There is no review priority or per-review deadline. Final approval
          remains unavailable until every required gate is satisfied.
        </p>
      </FramePanel>
    </Frame>
  );
}

function Gate({
  icon,
  label,
  state,
}: {
  icon: ReactNode;
  label: string;
  state: string;
}) {
  return (
    <div className="flex items-center gap-3 border-muted border-l-2 pl-3">
      {icon}
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-muted-foreground text-xs">{state}</p>
      </div>
    </div>
  );
}

function CollaborationPanel({ embedded = false }: { embedded?: boolean }) {
  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-sm">
            <MessageCircle className="size-4" /> Collaboration
          </h2>
          <p className="mt-1 text-muted-foreground text-xs">
            Synced with comments on the Draw System Post
          </p>
        </div>
        <Badge variant="outline">Read-only projection</Badge>
      </div>
      <Separator />
      <div className="space-y-5">
        {comments.map((comment) => (
          <div className="flex gap-3" key={comment.meta}>
            <Avatar size="sm">
              <AvatarFallback>{comment.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="font-medium text-sm">{comment.name}</p>
                <p className="text-muted-foreground text-xs">{comment.meta}</p>
              </div>
              <p className="mt-1 text-sm leading-6">{comment.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
  return embedded ? (
    content
  ) : (
    <Frame>
      <FramePanel className="p-5">{content}</FramePanel>
    </Frame>
  );
}

function ActionItemsPanel({ embedded = false }: { embedded?: boolean }) {
  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-sm">
            <ListTodo className="size-4" /> Linked Action Items
          </h2>
          <p className="mt-1 text-muted-foreground text-xs">
            Canonical items linked through the Draw System Post
          </p>
        </div>
        <Badge variant="secondary">Coordination only</Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        These items do not gate, approve, release, or mutate the Draw Request.
      </p>
      <Separator />
      <div className="space-y-3">
        {actionItems.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <Circle className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{item.title}</p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {item.id} · {item.assignee}
                </p>
              </div>
              <Badge variant="outline">{item.state}</Badge>
              <ExternalLink className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
  return embedded ? (
    content
  ) : (
    <Frame>
      <FramePanel className="p-5">{content}</FramePanel>
    </Frame>
  );
}

function DecisionPanel() {
  const [decision, setDecision] = useState<Decision>(null);
  const [reason, setReason] = useState("");
  const canPreview =
    decision === "approve" ||
    (decision === "decline" && reason.trim().length > 0);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Frame>
        <FramePanel className="space-y-5 p-5">
          <div>
            <h2 className="font-semibold text-base">Lender decision</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              This interaction previews a decision only. No workflow state is
              changed.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              className="h-auto justify-start py-4"
              onClick={() => setDecision("approve")}
              variant={decision === "approve" ? "default" : "outline"}
            >
              <Check /> Approve this request
            </Button>
            <Button
              className="h-auto justify-start py-4"
              onClick={() => setDecision("decline")}
              variant={decision === "decline" ? "destructive" : "outline"}
            >
              <X /> Decline for correction
            </Button>
          </div>
          {decision === "decline" ? (
            <div>
              <label className="font-medium text-sm" htmlFor="decline-reason">
                Private decline reason
              </label>
              <p className="mt-1 text-muted-foreground text-xs">
                Required. Reviewer identity and this reason are not shown to the
                builder.
              </p>
              <Textarea
                className="mt-3 min-h-28"
                id="decline-reason"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain what must be corrected before resubmission…"
                value={reason}
              />
            </div>
          ) : null}
          {decision === "decline" ? (
            <p className="text-muted-foreground text-xs">
              Decline returns this same Draw Request record for builder
              correction, retains history, and resets required approvals on
              resubmission.
            </p>
          ) : null}
          <Button disabled={!canPreview}>
            {decision === "decline" ? "Preview decline" : "Preview approval"}
          </Button>
        </FramePanel>
      </Frame>
      <PolicyState />
    </div>
  );
}

function DecisionFooter({ onSelect }: { onSelect: () => void }) {
  return (
    <SheetFooter className="absolute inset-x-0 bottom-0 z-10 items-center justify-between gap-3 bg-background/95 backdrop-blur sm:flex-row">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <History className="size-4" /> Same request record · full history
        retained
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline">
          <ArrowLeft /> Back to Draw queue
        </Button>
        <Button onClick={onSelect} size="sm">
          <ShieldCheck /> Review decision
        </Button>
      </div>
    </SheetFooter>
  );
}
