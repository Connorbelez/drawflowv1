"use client";

/**
 * PROTOTYPE — three Costs Workspace directions on the existing Builder Build
 * route, switchable with ?tab=costs&variant=ledger|roadmap|exceptions.
 * All interactions are in-memory and intentionally have no production effects.
 */

import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Filter,
  Link2,
  MapPin,
  MessageSquareMore,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import { PrototypeVariantSwitcher } from "#/components/prototype/PrototypeVariantSwitcher.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import type { ProductionBuildDetail } from "#/features/backoffice-build-detail/ProductionBuildDetailSurface.tsx";

export type CostsWorkspacePrototypeVariant =
  | "ledger"
  | "roadmap"
  | "exceptions";

type ReviewState =
  | "unreviewed"
  | "accepted_as_supporting_context"
  | "more_information_requested"
  | "replacement_requested"
  | "disputed"
  | "not_relevant";

interface CostDocument {
  allocationExact: boolean;
  attention?: string;
  brokerageReview: ReviewState;
  builderReview: ReviewState;
  grossCents: number;
  id: string;
  kind: "Invoice" | "Receipt";
  lifecycle: "Draft" | "Submitted" | "Superseded" | "Voided";
  milestoneKeys: string[];
  reference: string;
  revision?: string;
  sourceRole: "Builder" | "Homeowner" | "Contractor";
  submittedBy: string;
  submittedOn: string;
  title: string;
  vendor: string;
}

interface PrototypeProps {
  detail: ProductionBuildDetail;
  onVariantChange: (variant: CostsWorkspacePrototypeVariant) => void;
  variant: CostsWorkspacePrototypeVariant;
}

const VARIANTS = [
  { key: "ledger", name: "Reconciliation ledger" },
  { key: "roadmap", name: "Roadmap reconciliation" },
  { key: "exceptions", name: "Exception desk" },
] as const;

const formatter = new Intl.NumberFormat("en-CA", {
  currency: "CAD",
  maximumFractionDigits: 0,
  style: "currency",
});

function formatMoney(cents: number) {
  return formatter.format(cents / 100);
}

function shortReviewLabel(state: ReviewState) {
  const labels: Record<ReviewState, string> = {
    accepted_as_supporting_context: "Accepted",
    disputed: "Disputed",
    more_information_requested: "Info requested",
    not_relevant: "Not relevant",
    replacement_requested: "Replacement requested",
    unreviewed: "Unreviewed",
  };
  return labels[state];
}

function reviewTone(
  state: ReviewState
): "success" | "warning" | "error" | "outline" | "secondary" {
  if (state === "accepted_as_supporting_context") {
    return "success";
  }
  if (state === "disputed" || state === "replacement_requested") {
    return "error";
  }
  if (state === "more_information_requested") {
    return "warning";
  }
  if (state === "not_relevant") {
    return "secondary";
  }
  return "outline";
}

function lifecycleTone(
  state: CostDocument["lifecycle"]
): "info" | "outline" | "secondary" | "warning" {
  if (state === "Submitted") {
    return "info";
  }
  if (state === "Draft") {
    return "outline";
  }
  if (state === "Voided") {
    return "warning";
  }
  return "secondary";
}

function scopeLabel(
  document: CostDocument,
  milestones: ProductionBuildDetail["milestones"]
) {
  const labels = document.milestoneKeys
    .map((key) => milestones.find((milestone) => milestone.key === key)?.name)
    .filter(Boolean);
  return labels.length > 1
    ? `${labels[0]} +${labels.length - 1}`
    : (labels[0] ?? "Not allocated");
}

function buildFixtureDocuments(detail: ProductionBuildDetail): CostDocument[] {
  const milestoneKeys = detail.milestones.map((milestone) => milestone.key);
  const key = (index: number) =>
    milestoneKeys[index] ?? milestoneKeys[0] ?? `milestone-${index}`;

  return [
    {
      allocationExact: true,
      brokerageReview: "unreviewed",
      builderReview: "more_information_requested",
      grossCents: 1_842_650,
      id: "cost-101",
      kind: "Invoice",
      lifecycle: "Submitted",
      milestoneKeys: [key(0)],
      reference: "INV-1048",
      sourceRole: "Contractor",
      submittedBy: "Mason & Vale Excavation",
      submittedOn: "Jul 25",
      title: "Foundation excavation and haulage",
      vendor: "Mason & Vale",
      attention: "Missing equipment-hour breakdown",
    },
    {
      allocationExact: true,
      brokerageReview: "disputed",
      builderReview: "replacement_requested",
      grossCents: 863_200,
      id: "cost-102",
      kind: "Receipt",
      lifecycle: "Submitted",
      milestoneKeys: [key(1)],
      reference: "R-88321",
      sourceRole: "Homeowner",
      submittedBy: "Avery Thompson",
      submittedOn: "Jul 24",
      title: "Waterproofing membrane",
      vendor: "Northline Building Supply",
      attention: "Possible duplicate of R-88312",
    },
    {
      allocationExact: false,
      brokerageReview: "unreviewed",
      builderReview: "unreviewed",
      grossCents: 429_900,
      id: "cost-103",
      kind: "Invoice",
      lifecycle: "Draft",
      milestoneKeys: [],
      reference: "DRAFT",
      sourceRole: "Builder",
      submittedBy: "Maya Chen",
      submittedOn: "Edited today",
      title: "Concrete pump rental",
      vendor: "Hamilton Pump Co.",
      attention: "Allocation does not balance",
    },
    {
      allocationExact: true,
      brokerageReview: "accepted_as_supporting_context",
      builderReview: "accepted_as_supporting_context",
      grossCents: 2_176_440,
      id: "cost-104",
      kind: "Invoice",
      lifecycle: "Submitted",
      milestoneKeys: [key(0), key(2)],
      reference: "INV-2941",
      sourceRole: "Contractor",
      submittedBy: "Atlas Concrete",
      submittedOn: "Jul 21",
      title: "Ready-mix concrete delivery",
      vendor: "Atlas Concrete",
    },
    {
      allocationExact: true,
      brokerageReview: "accepted_as_supporting_context",
      builderReview: "accepted_as_supporting_context",
      grossCents: 693_125,
      id: "cost-105",
      kind: "Receipt",
      lifecycle: "Superseded",
      milestoneKeys: [key(1)],
      reference: "R-88017",
      revision: "Replaced by v2",
      sourceRole: "Builder",
      submittedBy: "Connor Belezney",
      submittedOn: "Jul 18",
      title: "Drainage stone — original",
      vendor: "Escarpment Aggregates",
    },
    {
      allocationExact: true,
      brokerageReview: "not_relevant",
      builderReview: "not_relevant",
      grossCents: 188_750,
      id: "cost-106",
      kind: "Receipt",
      lifecycle: "Voided",
      milestoneKeys: [key(2)],
      reference: "R-4412",
      revision: "Voided · wrong build",
      sourceRole: "Builder",
      submittedBy: "Maya Chen",
      submittedOn: "Jul 16",
      title: "Temporary fencing rental",
      vendor: "Crown Site Services",
    },
    {
      allocationExact: true,
      brokerageReview: "more_information_requested",
      builderReview: "accepted_as_supporting_context",
      grossCents: 1_124_500,
      id: "cost-107",
      kind: "Invoice",
      lifecycle: "Submitted",
      milestoneKeys: [key(2)],
      reference: "INV-716",
      sourceRole: "Contractor",
      submittedBy: "Crown Forming",
      submittedOn: "Jul 14",
      title: "Formwork labour and materials",
      vendor: "Crown Forming",
      attention: "Brokerage requested delivery ticket",
    },
  ];
}

export function CostsWorkspacePrototype({
  detail,
  onVariantChange,
  variant,
}: PrototypeProps) {
  const documents = useMemo(() => buildFixtureDocuments(detail), [detail]);
  const [search, setSearch] = useState("");
  const [lastAction, setLastAction] = useState(
    "Prototype state only — no production records are changed."
  );
  const filtered = documents.filter((document) =>
    [document.title, document.vendor, document.reference, document.submittedBy]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="min-w-0 pb-24">
      {variant === "ledger" ? (
        <LedgerDirection
          detail={detail}
          documents={filtered}
          lastAction={lastAction}
          search={search}
          setLastAction={setLastAction}
          setSearch={setSearch}
        />
      ) : null}
      {variant === "roadmap" ? (
        <RoadmapDirection
          detail={detail}
          documents={filtered}
          lastAction={lastAction}
          search={search}
          setLastAction={setLastAction}
          setSearch={setSearch}
        />
      ) : null}
      {variant === "exceptions" ? (
        <ExceptionDirection
          detail={detail}
          documents={filtered}
          lastAction={lastAction}
          search={search}
          setLastAction={setLastAction}
          setSearch={setSearch}
        />
      ) : null}
      <PrototypeVariantSwitcher
        current={variant}
        onChange={(next) =>
          onVariantChange(next as CostsWorkspacePrototypeVariant)
        }
        variants={VARIANTS}
      />
    </div>
  );
}

interface DirectionProps {
  detail: ProductionBuildDetail;
  documents: CostDocument[];
  lastAction: string;
  search: string;
  setLastAction: (value: string) => void;
  setSearch: (value: string) => void;
}

function WorkspaceHeading({
  description,
  detail,
  eyebrow,
  setLastAction,
  title,
}: {
  description: string;
  detail: ProductionBuildDetail;
  eyebrow: string;
  setLastAction: (value: string) => void;
  title: string;
}) {
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{eyebrow}</Badge>
            <Badge variant="secondary">Prototype</Badge>
          </div>
          <h2 className="font-semibold text-xl tracking-tight">{title}</h2>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            {description}
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-muted-foreground text-xs">
            <Building2 className="size-3.5" />
            {detail.build.buildName}
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() =>
            setLastAction("Add document opened — prototype state only.")
          }
        >
          <Plus />
          Add cost document
        </Button>
      </FramePanel>
      <FramePanel className="flex items-start gap-2 border-primary/20 bg-primary/5 p-3 text-xs">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          These records are supporting cost context. They do not establish
          payment, work completion, reimbursement eligibility, or draw approval.
        </p>
      </FramePanel>
    </Frame>
  );
}

function PrototypeState({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <CircleDollarSign className="size-3.5" />
      {children}
    </p>
  );
}

function SummaryMetric({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <FramePanel className="p-3.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold text-lg tabular-nums">{value}</p>
      <p className="mt-1 text-muted-foreground text-xs">{note}</p>
    </FramePanel>
  );
}

function SearchControl({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Search cost documents"
        className="pl-9"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search records, vendors, or people"
        type="search"
        value={search}
      />
    </div>
  );
}

function ReviewBadge({ label, state }: { label?: string; state: ReviewState }) {
  return (
    <Badge variant={reviewTone(state)}>
      {label ? `${label}: ` : null}
      {shortReviewLabel(state)}
    </Badge>
  );
}

function DocumentCard({
  detail,
  document,
  setLastAction,
}: {
  detail: ProductionBuildDetail;
  document: CostDocument;
  setLastAction: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="p-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={lifecycleTone(document.lifecycle)}>
            {document.lifecycle}
          </Badge>
          <Badge variant="outline">{document.kind}</Badge>
        </div>
        <CardTitle className="text-base leading-snug">
          {document.title}
        </CardTitle>
        <CardDescription>
          {document.vendor} · {document.reference}
        </CardDescription>
        <CardAction>
          <Button
            aria-label={`Open ${document.title}`}
            onClick={() =>
              setLastAction(`${document.reference} opened in prototype.`)
            }
            size="icon-sm"
            variant="ghost"
          >
            <ArrowUpRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardPanel className="grid gap-3 p-4 pt-0">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs">Gross total</p>
            <p className="font-semibold text-lg tabular-nums">
              {formatMoney(document.grossCents)}
            </p>
          </div>
          <p className="text-right text-muted-foreground text-xs">
            {scopeLabel(document, detail.milestones)}
          </p>
        </div>
        {document.attention ? (
          <div className="flex gap-2 rounded-lg bg-warning/10 p-2.5 text-xs">
            <AlertCircle className="size-4 shrink-0 text-warning-foreground" />
            <span>{document.attention}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <ReviewBadge label="Builder" state={document.builderReview} />
          <ReviewBadge label="Brokerage" state={document.brokerageReview} />
        </div>
      </CardPanel>
      <CardFooter className="justify-between border-t p-3.5 text-muted-foreground text-xs">
        <span>{document.submittedBy}</span>
        <span>{document.submittedOn}</span>
      </CardFooter>
    </Card>
  );
}

function DocumentsTable({
  detail,
  documents,
  setLastAction,
}: {
  detail: ProductionBuildDetail;
  documents: CostDocument[];
  setLastAction: (value: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cost record</TableHead>
          <TableHead>Gross total</TableHead>
          <TableHead>Allocation</TableHead>
          <TableHead>Lifecycle</TableHead>
          <TableHead>Builder review</TableHead>
          <TableHead>Brokerage review</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <TableRow key={document.id}>
            <TableCell className="min-w-60 whitespace-normal">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                  <FileText className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium leading-snug">{document.title}</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {document.vendor} · {document.reference}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell className="font-medium tabular-nums">
              {formatMoney(document.grossCents)}
            </TableCell>
            <TableCell className="max-w-44 whitespace-normal">
              <p className="text-xs">
                {scopeLabel(document, detail.milestones)}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {document.allocationExact ? "Balances exactly" : "Needs work"}
              </p>
            </TableCell>
            <TableCell>
              <Badge variant={lifecycleTone(document.lifecycle)}>
                {document.lifecycle}
              </Badge>
            </TableCell>
            <TableCell>
              <ReviewBadge state={document.builderReview} />
            </TableCell>
            <TableCell>
              <ReviewBadge state={document.brokerageReview} />
            </TableCell>
            <TableCell>
              <Button
                aria-label={`Open ${document.title}`}
                onClick={() =>
                  setLastAction(`${document.reference} opened in prototype.`)
                }
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LedgerDirection({
  detail,
  documents,
  lastAction,
  search,
  setLastAction,
  setSearch,
}: DirectionProps) {
  const [queue, setQueue] = useState<"all" | "attention" | "drafts">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const visibleDocuments = documents.filter((document) => {
    if (queue === "attention") {
      return Boolean(document.attention);
    }
    if (queue === "drafts") {
      return document.lifecycle === "Draft";
    }
    return true;
  });
  const submittedTotal = documents
    .filter((document) => document.lifecycle === "Submitted")
    .reduce((sum, document) => sum + document.grossCents, 0);

  return (
    <div className="grid min-w-0 gap-3">
      <WorkspaceHeading
        description="A high-density register for reconciling every invoice and receipt without duplicating documents across allocations."
        detail={detail}
        eyebrow="A · Ledger"
        setLastAction={setLastAction}
        title="Cost document register"
      />

      <Frame className="grid grid-cols-2 lg:grid-cols-4">
        <SummaryMetric
          label="Submitted gross"
          note="Canonical documents"
          value={formatMoney(submittedTotal)}
        />
        <SummaryMetric
          label="Needs attention"
          note="Across either review lane"
          value={String(
            documents.filter((document) => document.attention).length
          )}
        />
        <SummaryMetric
          label="Drafts"
          note="Private to collaborators"
          value={String(
            documents.filter((document) => document.lifecycle === "Draft")
              .length
          )}
        />
        <SummaryMetric
          label="Build budget"
          note="Planning context"
          value={formatMoney(detail.build.totalBudgetCents ?? 0)}
        />
      </Frame>

      <Frame>
        <FramePanel className="grid gap-3 p-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <SearchControl search={search} setSearch={setSearch} />
            <div className="grid grid-cols-3 gap-1 sm:flex">
              {(["all", "attention", "drafts"] as const).map((item) => (
                <Button
                  key={item}
                  onClick={() => setQueue(item)}
                  size="sm"
                  variant={queue === item ? "default" : "outline"}
                >
                  {item === "all"
                    ? "All records"
                    : item === "attention"
                      ? "Attention"
                      : "Drafts"}
                </Button>
              ))}
            </div>
            <Button
              onClick={() => setFiltersOpen((current) => !current)}
              size="sm"
              variant="outline"
            >
              <Filter />
              Filters
            </Button>
          </div>
          {filtersOpen ? (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {["Invoices", "Receipts", "Submitted", "Multi-scope"].map(
                (filter) => (
                  <Button
                    key={filter}
                    onClick={() =>
                      setLastAction(`${filter} filter selected in prototype.`)
                    }
                    size="xs"
                    variant="outline"
                  >
                    {filter}
                  </Button>
                )
              )}
            </div>
          ) : null}
          <PrototypeState>{lastAction}</PrototypeState>
        </FramePanel>
        <FramePanel className="hidden p-0 md:block">
          <DocumentsTable
            detail={detail}
            documents={visibleDocuments}
            setLastAction={setLastAction}
          />
        </FramePanel>
      </Frame>

      <div className="grid gap-2 md:hidden">
        {visibleDocuments.map((document) => (
          <DocumentCard
            detail={detail}
            document={document}
            key={document.id}
            setLastAction={setLastAction}
          />
        ))}
      </div>
    </div>
  );
}

function RoadmapDirection({
  detail,
  documents,
  lastAction,
  search,
  setLastAction,
  setSearch,
}: DirectionProps) {
  const [mode, setMode] = useState<"milestones" | "documents">("milestones");
  const [selectedKey, setSelectedKey] = useState(
    detail.milestones[0]?.key ?? ""
  );
  const selectedMilestone =
    detail.milestones.find((milestone) => milestone.key === selectedKey) ??
    detail.milestones[0];
  const scopedDocuments = documents.filter((document) =>
    document.milestoneKeys.includes(selectedMilestone?.key ?? "")
  );
  const scopedTotal = scopedDocuments.reduce(
    (sum, document) =>
      document.lifecycle === "Submitted" ? sum + document.grossCents : sum,
    0
  );
  const budgetCents = selectedMilestone?.budgetCents ?? 0;
  const coverage = budgetCents
    ? Math.min(100, Math.round((scopedTotal / budgetCents) * 100))
    : 0;

  return (
    <div className="grid min-w-0 gap-3">
      <WorkspaceHeading
        description="Cost context follows the construction roadmap, making each document legible beside the scope and dates it supports."
        detail={detail}
        eyebrow="B · Roadmap"
        setLastAction={setLastAction}
        title="Roadmap cost reconciliation"
      />

      <Frame>
        <FramePanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 gap-1">
            <Button
              onClick={() => setMode("milestones")}
              size="sm"
              variant={mode === "milestones" ? "default" : "outline"}
            >
              By milestone
            </Button>
            <Button
              onClick={() => setMode("documents")}
              size="sm"
              variant={mode === "documents" ? "default" : "outline"}
            >
              All documents
            </Button>
          </div>
          <SearchControl search={search} setSearch={setSearch} />
          <PrototypeState>{lastAction}</PrototypeState>
        </FramePanel>
      </Frame>

      {mode === "milestones" ? (
        <div className="grid min-w-0 gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <Frame className="h-fit">
            <FrameHeader>
              <FrameTitle>Construction roadmap</FrameTitle>
              <FrameDescription>
                Submitted gross is deduplicated by canonical document.
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="grid gap-1 p-1.5">
              {detail.milestones.map((milestone, index) => {
                const total = documents
                  .filter(
                    (document) =>
                      document.lifecycle === "Submitted" &&
                      document.milestoneKeys.includes(milestone.key)
                  )
                  .reduce((sum, document) => sum + document.grossCents, 0);
                const active = milestone.key === selectedMilestone?.key;
                return (
                  <Button
                    className="h-auto min-h-16 justify-start px-3 py-2 text-left"
                    key={milestone.key}
                    onClick={() => setSelectedKey(milestone.key)}
                    variant={active ? "secondary" : "ghost"}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-background font-semibold text-xs">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {milestone.name}
                      </span>
                      <span className="mt-1 block text-muted-foreground text-xs tabular-nums">
                        {formatMoney(total)} submitted gross
                      </span>
                    </span>
                    <ChevronRight />
                  </Button>
                );
              })}
            </FramePanel>
          </Frame>

          <div className="grid min-w-0 gap-3">
            <Frame>
              <FramePanel className="grid gap-5 p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <Badge variant="outline">
                      Days {selectedMilestone?.dayStart ?? "—"}–
                      {selectedMilestone?.dayEnd ?? "—"}
                    </Badge>
                    <h3 className="mt-2 font-semibold text-xl">
                      {selectedMilestone?.name ?? "Milestone"}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Scope-level document context, not work progress.
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-muted-foreground text-xs">
                      Submitted document gross
                    </p>
                    <p className="font-semibold text-xl tabular-nums">
                      {formatMoney(scopedTotal)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      of {formatMoney(budgetCents)} planned budget
                    </p>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>Documentation coverage</span>
                    <span className="font-medium tabular-nums">
                      {coverage}%
                    </span>
                  </div>
                  <Progress
                    aria-label="Documentation coverage"
                    value={coverage}
                  />
                  <p className="mt-2 text-muted-foreground text-xs">
                    A planning comparison only. Coverage does not communicate
                    completion or eligibility.
                  </p>
                </div>
              </FramePanel>
            </Frame>

            <Frame>
              <FrameHeader>
                <FrameTitle>Documents touching this scope</FrameTitle>
                <FrameDescription>
                  Multi-scope records show their gross total once and disclose
                  other allocations.
                </FrameDescription>
              </FrameHeader>
              <FramePanel className="grid gap-2 p-2">
                {scopedDocuments.map((document) => (
                  <Card key={document.id}>
                    <CardHeader className="p-4">
                      <CardTitle className="text-base">
                        {document.title}
                      </CardTitle>
                      <CardDescription>
                        {document.vendor} · {document.reference}
                      </CardDescription>
                      <CardAction>
                        <p className="font-semibold tabular-nums">
                          {formatMoney(document.grossCents)}
                        </p>
                      </CardAction>
                    </CardHeader>
                    <CardPanel className="flex flex-wrap gap-1.5 p-4 pt-0">
                      <Badge variant={lifecycleTone(document.lifecycle)}>
                        {document.lifecycle}
                      </Badge>
                      {document.milestoneKeys.length > 1 ? (
                        <Badge variant="warning">
                          <Link2 />
                          Also allocated to another scope
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          <Check />
                          Exact allocation
                        </Badge>
                      )}
                      <ReviewBadge
                        label="Builder"
                        state={document.builderReview}
                      />
                      <ReviewBadge
                        label="Brokerage"
                        state={document.brokerageReview}
                      />
                    </CardPanel>
                  </Card>
                ))}
                {scopedDocuments.length === 0 ? (
                  <p className="p-6 text-center text-muted-foreground text-sm">
                    No documents touch this milestone in the prototype data.
                  </p>
                ) : null}
              </FramePanel>
            </Frame>
          </div>
        </div>
      ) : (
        <>
          <Frame className="hidden md:block">
            <FramePanel className="p-0">
              <DocumentsTable
                detail={detail}
                documents={documents}
                setLastAction={setLastAction}
              />
            </FramePanel>
          </Frame>
          <div className="grid gap-2 md:hidden">
            {documents.map((document) => (
              <DocumentCard
                detail={detail}
                document={document}
                key={document.id}
                setLastAction={setLastAction}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReviewPulse({
  label,
  records,
}: {
  label: string;
  records: CostDocument[];
}) {
  const accepted = records.filter(
    (document) =>
      (label === "Builder"
        ? document.builderReview
        : document.brokerageReview) === "accepted_as_supporting_context"
  ).length;
  const unresolved = records.filter((document) => {
    const state =
      label === "Builder" ? document.builderReview : document.brokerageReview;
    return (
      state === "disputed" ||
      state === "more_information_requested" ||
      state === "replacement_requested"
    );
  }).length;

  return (
    <FramePanel className="p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{label} review</p>
        <Badge variant={unresolved ? "warning" : "success"}>
          {unresolved} unresolved
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="font-semibold text-2xl tabular-nums">{accepted}</p>
          <p className="text-muted-foreground text-xs">accepted as context</p>
        </div>
        <div>
          <p className="font-semibold text-2xl tabular-nums">{unresolved}</p>
          <p className="text-muted-foreground text-xs">need a response</p>
        </div>
      </div>
    </FramePanel>
  );
}

function ExceptionDirection({
  detail,
  documents,
  lastAction,
  search,
  setLastAction,
  setSearch,
}: DirectionProps) {
  const [segment, setSegment] = useState<"attention" | "all">("attention");
  const [allOpen, setAllOpen] = useState(false);
  const attentionDocuments = documents.filter((document) =>
    Boolean(document.attention)
  );
  const submittedTotal = documents
    .filter((document) => document.lifecycle === "Submitted")
    .reduce((sum, document) => sum + document.grossCents, 0);

  return (
    <div className="grid min-w-0 gap-3">
      <WorkspaceHeading
        description="An operational desk that puts mismatches, missing details, and independent review queues ahead of the normal register."
        detail={detail}
        eyebrow="C · Exceptions"
        setLastAction={setLastAction}
        title="Cost document attention desk"
      />

      <Frame className="grid grid-cols-2 lg:grid-cols-4">
        <SummaryMetric
          label="Submitted gross"
          note="Canonical documents"
          value={formatMoney(submittedTotal)}
        />
        <SummaryMetric
          label="Attention queue"
          note="Ranked by exception"
          value={String(attentionDocuments.length)}
        />
        <SummaryMetric
          label="Exact allocations"
          note="Across all lifecycle states"
          value={`${documents.filter((document) => document.allocationExact).length}/${documents.length}`}
        />
        <SummaryMetric
          label="Files attached"
          note="One unavailable in history"
          value={`${documents.length - 1}/${documents.length}`}
        />
      </Frame>

      <Frame className="grid md:grid-cols-2">
        <ReviewPulse label="Builder" records={documents} />
        <ReviewPulse label="Brokerage" records={documents} />
      </Frame>

      <Frame>
        <FramePanel className="grid gap-3 p-3">
          <div className="grid grid-cols-2 gap-1 md:hidden">
            <Button
              onClick={() => setSegment("attention")}
              size="sm"
              variant={segment === "attention" ? "default" : "outline"}
            >
              Attention
            </Button>
            <Button
              onClick={() => setSegment("all")}
              size="sm"
              variant={segment === "all" ? "default" : "outline"}
            >
              All documents
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchControl search={search} setSearch={setSearch} />
            <Button
              onClick={() =>
                setLastAction("Exception sort changed to oldest first.")
              }
              size="sm"
              variant="outline"
            >
              <Filter />
              Ranked by urgency
            </Button>
          </div>
          <PrototypeState>{lastAction}</PrototypeState>
        </FramePanel>
      </Frame>

      {segment === "attention" ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Needs attention</h3>
              <p className="text-muted-foreground text-sm">
                Resolve the reason without collapsing the two review lanes.
              </p>
            </div>
            <Badge variant="warning">{attentionDocuments.length} records</Badge>
          </div>
          <div className="grid gap-2 xl:grid-cols-2">
            {attentionDocuments.map((document, index) => (
              <Card key={document.id}>
                <CardHeader className="border-b p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={index === 0 ? "error" : "warning"}>
                      Priority {index + 1}
                    </Badge>
                    <Badge variant="outline">{document.kind}</Badge>
                  </div>
                  <CardTitle className="text-base">
                    {document.attention}
                  </CardTitle>
                  <CardDescription>
                    {document.title} · {document.reference}
                  </CardDescription>
                  <CardAction>
                    <p className="font-semibold tabular-nums">
                      {formatMoney(document.grossCents)}
                    </p>
                  </CardAction>
                </CardHeader>
                <CardPanel className="grid gap-3 p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <ReviewBadge
                      label="Builder"
                      state={document.builderReview}
                    />
                    <ReviewBadge
                      label="Brokerage"
                      state={document.brokerageReview}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Submitted by</p>
                      <p className="mt-1 font-medium">{document.submittedBy}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Roadmap scope</p>
                      <p className="mt-1 font-medium">
                        {scopeLabel(document, detail.milestones)}
                      </p>
                    </div>
                  </div>
                </CardPanel>
                <CardFooter className="grid grid-cols-2 gap-2 p-4">
                  <Button
                    onClick={() =>
                      setLastAction(
                        `Response requested for ${document.reference}.`
                      )
                    }
                    size="sm"
                    variant="outline"
                  >
                    <MessageSquareMore />
                    Request details
                  </Button>
                  <Button
                    onClick={() =>
                      setLastAction(
                        `${document.reference} opened in prototype.`
                      )
                    }
                    size="sm"
                  >
                    Review record
                    <ArrowUpRight />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-2 md:hidden">
          {documents.map((document) => (
            <DocumentCard
              detail={detail}
              document={document}
              key={document.id}
              setLastAction={setLastAction}
            />
          ))}
        </div>
      )}

      <Frame className="hidden md:flex">
        <FramePanel className="p-0">
          <button
            className="flex w-full items-center justify-between p-4 text-left"
            onClick={() => setAllOpen((current) => !current)}
            type="button"
          >
            <span>
              <span className="block font-medium text-sm">
                All cost documents
              </span>
              <span className="mt-1 block text-muted-foreground text-xs">
                Normal records recede until they are needed.
              </span>
            </span>
            {allOpen ? <ChevronDown /> : <ChevronRight />}
          </button>
          {allOpen ? (
            <div className="border-t">
              <DocumentsTable
                detail={detail}
                documents={documents}
                setLastAction={setLastAction}
              />
            </div>
          ) : null}
        </FramePanel>
      </Frame>

      <div className="grid grid-cols-2 gap-2 md:hidden">
        <Button
          onClick={() =>
            setLastAction("Attachment viewer opened in prototype.")
          }
          variant="outline"
        >
          <Paperclip />
          Files
        </Button>
        <Button
          onClick={() => setLastAction("Build location opened in prototype.")}
          variant="outline"
        >
          <MapPin />
          Build context
        </Button>
      </div>
    </div>
  );
}
