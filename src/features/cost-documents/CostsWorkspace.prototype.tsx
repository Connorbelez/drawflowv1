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
  Download,
  Eye,
  FileText,
  Filter,
  Hammer,
  Link2,
  MapPin,
  MessageSquareMore,
  MoreHorizontal,
  Package,
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
  attachments: {
    id: string;
    mediaType: "PDF" | "Image";
    name: string;
    size: string;
  }[];
  attention?: string;
  brokerageReview: ReviewState;
  builderReview: ReviewState;
  costType: "Materials" | "Labour";
  description: string;
  dueOn?: string;
  grossCents: number;
  id: string;
  issuedOn: string;
  kind: "Invoice" | "Receipt";
  lifecycle: "Draft" | "Submitted" | "Superseded" | "Voided";
  lineItems: {
    amountCents: number;
    description: string;
  }[];
  milestoneKeys: string[];
  reference: string;
  revision?: string;
  sourceRole: "Builder" | "Homeowner" | "Contractor";
  submilestoneAllocations: {
    amountCents: number;
    submilestoneKey: string;
  }[];
  submittedBy: string;
  submittedOn: string;
  taxCents: number;
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

function submilestoneLabel(
  submilestoneKey: string,
  submilestones: ProductionBuildDetail["submilestones"]
) {
  return (
    submilestones.find((submilestone) => submilestone.key === submilestoneKey)
      ?.name ?? "Unrecognized sub-milestone"
  );
}

function costTypeTone(costType: CostDocument["costType"]) {
  return costType === "Materials" ? "info" : "warning";
}

function buildFixtureDocuments(detail: ProductionBuildDetail): CostDocument[] {
  const milestoneKeys = detail.milestones.map((milestone) => milestone.key);
  const key = (index: number) =>
    milestoneKeys[index] ?? milestoneKeys[0] ?? `milestone-${index}`;
  const subKey = (milestoneIndex: number, submilestoneIndex: number) =>
    detail.submilestones.filter(
      (submilestone) => submilestone.milestoneKey === key(milestoneIndex)
    )[submilestoneIndex]?.key ??
    detail.submilestones[submilestoneIndex]?.key ??
    `submilestone-${milestoneIndex}-${submilestoneIndex}`;

  return [
    {
      allocationExact: true,
      attachments: [
        {
          id: "file-101-a",
          mediaType: "PDF",
          name: "INV-1048-excavation.pdf",
          size: "1.8 MB",
        },
        {
          id: "file-101-b",
          mediaType: "Image",
          name: "haulage-tickets.jpg",
          size: "3.4 MB",
        },
      ],
      brokerageReview: "unreviewed",
      builderReview: "more_information_requested",
      costType: "Labour",
      description:
        "Excavation crew, operator time, and disposal haulage for the primary foundation cut.",
      dueOn: "Aug 8, 2026",
      grossCents: 1_842_650,
      id: "cost-101",
      issuedOn: "Jul 24, 2026",
      kind: "Invoice",
      lifecycle: "Submitted",
      lineItems: [
        {
          amountCents: 1_240_000,
          description: "Excavator and operator · 40 hours",
        },
        {
          amountCents: 362_500,
          description: "Haulage crew and disposal runs",
        },
      ],
      milestoneKeys: [key(0)],
      reference: "INV-1048",
      sourceRole: "Contractor",
      submilestoneAllocations: [
        {
          amountCents: 1_842_650,
          submilestoneKey: subKey(0, 1),
        },
      ],
      submittedBy: "Mason & Vale Excavation",
      submittedOn: "Jul 25",
      taxCents: 240_150,
      title: "Foundation excavation and haulage",
      vendor: "Mason & Vale",
      attention: "Missing equipment-hour breakdown",
    },
    {
      allocationExact: true,
      attachments: [
        {
          id: "file-102-a",
          mediaType: "Image",
          name: "northline-receipt-88321.jpg",
          size: "2.1 MB",
        },
        {
          id: "file-102-b",
          mediaType: "PDF",
          name: "membrane-product-sheet.pdf",
          size: "684 KB",
        },
      ],
      brokerageReview: "disputed",
      builderReview: "replacement_requested",
      costType: "Materials",
      description:
        "Foundation waterproofing membrane, primer, and termination accessories.",
      grossCents: 863_200,
      id: "cost-102",
      issuedOn: "Jul 23, 2026",
      kind: "Receipt",
      lifecycle: "Submitted",
      lineItems: [
        {
          amountCents: 642_000,
          description: "Waterproofing membrane rolls",
        },
        {
          amountCents: 108_000,
          description: "Primer and termination bars",
        },
      ],
      milestoneKeys: [key(0)],
      reference: "R-88321",
      sourceRole: "Homeowner",
      submilestoneAllocations: [
        {
          amountCents: 863_200,
          submilestoneKey: subKey(0, 2),
        },
      ],
      submittedBy: "Avery Thompson",
      submittedOn: "Jul 24",
      taxCents: 113_200,
      title: "Waterproofing membrane",
      vendor: "Northline Building Supply",
      attention: "Possible duplicate of R-88312",
    },
    {
      allocationExact: false,
      attachments: [
        {
          id: "file-103-a",
          mediaType: "PDF",
          name: "pump-rental-draft.pdf",
          size: "412 KB",
        },
      ],
      brokerageReview: "unreviewed",
      builderReview: "unreviewed",
      costType: "Labour",
      description:
        "Concrete pump operator and equipment rental for the foundation pour.",
      dueOn: "Aug 12, 2026",
      grossCents: 429_900,
      id: "cost-103",
      issuedOn: "Jul 28, 2026",
      kind: "Invoice",
      lifecycle: "Draft",
      lineItems: [
        {
          amountCents: 290_000,
          description: "Pump truck and operator",
        },
        {
          amountCents: 90_000,
          description: "Mobilization and washout",
        },
      ],
      milestoneKeys: [key(0)],
      reference: "DRAFT",
      sourceRole: "Builder",
      submilestoneAllocations: [
        {
          amountCents: 380_000,
          submilestoneKey: subKey(0, 2),
        },
      ],
      submittedBy: "Maya Chen",
      submittedOn: "Edited today",
      taxCents: 49_900,
      title: "Concrete pump rental",
      vendor: "Hamilton Pump Co.",
      attention: "Allocation does not balance",
    },
    {
      allocationExact: true,
      attachments: [
        {
          id: "file-104-a",
          mediaType: "PDF",
          name: "atlas-invoice-2941.pdf",
          size: "946 KB",
        },
        {
          id: "file-104-b",
          mediaType: "PDF",
          name: "delivery-tickets-2941.pdf",
          size: "2.7 MB",
        },
      ],
      brokerageReview: "accepted_as_supporting_context",
      builderReview: "accepted_as_supporting_context",
      costType: "Materials",
      description:
        "Ready-mix concrete deliveries allocated across foundation forms and mechanical housekeeping pads.",
      dueOn: "Aug 4, 2026",
      grossCents: 2_176_440,
      id: "cost-104",
      issuedOn: "Jul 20, 2026",
      kind: "Invoice",
      lifecycle: "Submitted",
      lineItems: [
        {
          amountCents: 1_540_000,
          description: "35 MPa ready-mix concrete",
        },
        {
          amountCents: 353_310,
          description: "Delivery and environmental surcharges",
        },
      ],
      milestoneKeys: [key(0), key(2)],
      reference: "INV-2941",
      sourceRole: "Contractor",
      submilestoneAllocations: [
        {
          amountCents: 1_451_000,
          submilestoneKey: subKey(0, 2),
        },
        {
          amountCents: 725_440,
          submilestoneKey: subKey(2, 0),
        },
      ],
      submittedBy: "Atlas Concrete",
      submittedOn: "Jul 21",
      taxCents: 283_130,
      title: "Ready-mix concrete delivery",
      vendor: "Atlas Concrete",
    },
    {
      allocationExact: true,
      attachments: [
        {
          id: "file-105-a",
          mediaType: "Image",
          name: "aggregate-receipt-88017.jpg",
          size: "1.2 MB",
        },
      ],
      brokerageReview: "accepted_as_supporting_context",
      builderReview: "accepted_as_supporting_context",
      costType: "Materials",
      description:
        "Drainage stone delivered for footing drainage and foundation backfill.",
      grossCents: 693_125,
      id: "cost-105",
      issuedOn: "Jul 17, 2026",
      kind: "Receipt",
      lifecycle: "Superseded",
      lineItems: [
        {
          amountCents: 613_385,
          description: "19 mm clear drainage stone",
        },
      ],
      milestoneKeys: [key(0)],
      reference: "R-88017",
      revision: "Replaced by v2",
      sourceRole: "Builder",
      submilestoneAllocations: [
        {
          amountCents: 693_125,
          submilestoneKey: subKey(0, 1),
        },
      ],
      submittedBy: "Connor Belezney",
      submittedOn: "Jul 18",
      taxCents: 79_740,
      title: "Drainage stone — original",
      vendor: "Escarpment Aggregates",
    },
    {
      allocationExact: true,
      attachments: [
        {
          id: "file-106-a",
          mediaType: "PDF",
          name: "crown-rental-4412.pdf",
          size: "308 KB",
        },
      ],
      brokerageReview: "not_relevant",
      builderReview: "not_relevant",
      costType: "Materials",
      description:
        "Temporary perimeter fencing rental submitted against the wrong build.",
      grossCents: 188_750,
      id: "cost-106",
      issuedOn: "Jul 15, 2026",
      kind: "Receipt",
      lifecycle: "Voided",
      lineItems: [
        {
          amountCents: 167_035,
          description: "Temporary fence panels and bases",
        },
      ],
      milestoneKeys: [key(2)],
      reference: "R-4412",
      revision: "Voided · wrong build",
      sourceRole: "Builder",
      submilestoneAllocations: [
        {
          amountCents: 188_750,
          submilestoneKey: subKey(2, 2),
        },
      ],
      submittedBy: "Maya Chen",
      submittedOn: "Jul 16",
      taxCents: 21_715,
      title: "Temporary fencing rental",
      vendor: "Crown Site Services",
    },
    {
      allocationExact: true,
      attachments: [
        {
          id: "file-107-a",
          mediaType: "PDF",
          name: "crown-forming-invoice-716.pdf",
          size: "1.1 MB",
        },
        {
          id: "file-107-b",
          mediaType: "Image",
          name: "crew-timesheet-716.jpg",
          size: "2.9 MB",
        },
      ],
      brokerageReview: "more_information_requested",
      builderReview: "accepted_as_supporting_context",
      costType: "Labour",
      description:
        "Formwork carpentry crew for footing and foundation wall forms.",
      dueOn: "Jul 30, 2026",
      grossCents: 1_124_500,
      id: "cost-107",
      issuedOn: "Jul 13, 2026",
      kind: "Invoice",
      lifecycle: "Submitted",
      lineItems: [
        {
          amountCents: 812_500,
          description: "Formwork carpentry crew · 125 hours",
        },
        {
          amountCents: 182_500,
          description: "Site supervision and layout",
        },
      ],
      milestoneKeys: [key(0)],
      reference: "INV-716",
      sourceRole: "Contractor",
      submilestoneAllocations: [
        {
          amountCents: 1_124_500,
          submilestoneKey: subKey(0, 2),
        },
      ],
      submittedBy: "Crown Forming",
      submittedOn: "Jul 14",
      taxCents: 129_500,
      title: "Foundation formwork labour",
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
    <Card
      className="w-full text-left"
      onClick={() =>
        setLastAction(`${document.reference} opened in prototype.`)
      }
      render={<button type="button" />}
    >
      <CardHeader className="p-4">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge variant={costTypeTone(document.costType)}>
            {document.costType === "Materials" ? <Package /> : <Hammer />}
            {document.costType}
          </Badge>
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
          <ArrowUpRight className="size-4 text-muted-foreground" />
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
        <div>
          <p className="mb-1.5 text-muted-foreground text-xs">
            Assigned sub-milestones
          </p>
          <div className="flex flex-wrap gap-1.5">
            {document.submilestoneAllocations.map((allocation) => (
              <Badge key={allocation.submilestoneKey} variant="secondary">
                {submilestoneLabel(
                  allocation.submilestoneKey,
                  detail.submilestones
                )}
              </Badge>
            ))}
          </div>
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
          <TableHead>Cost type</TableHead>
          <TableHead>Gross total</TableHead>
          <TableHead>Assigned scope</TableHead>
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
            <TableCell>
              <Badge variant={costTypeTone(document.costType)}>
                {document.costType}
              </Badge>
            </TableCell>
            <TableCell className="font-medium tabular-nums">
              {formatMoney(document.grossCents)}
            </TableCell>
            <TableCell className="max-w-44 whitespace-normal">
              <p className="text-xs">
                {scopeLabel(document, detail.milestones)}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {document.submilestoneAllocations
                  .map((allocation) =>
                    submilestoneLabel(
                      allocation.submilestoneKey,
                      detail.submilestones
                    )
                  )
                  .join(" · ")}
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
  const [selectedDocument, setSelectedDocument] = useState<CostDocument | null>(
    null
  );
  const selectedMilestone =
    detail.milestones.find((milestone) => milestone.key === selectedKey) ??
    detail.milestones[0];
  const scopedDocuments = documents.filter((document) =>
    document.milestoneKeys.includes(selectedMilestone?.key ?? "")
  );
  const materialDocuments = scopedDocuments.filter(
    (document) => document.costType === "Materials"
  );
  const labourDocuments = scopedDocuments.filter(
    (document) => document.costType === "Labour"
  );
  const scopedTotal = scopedDocuments.reduce(
    (sum, document) =>
      document.lifecycle === "Submitted" ? sum + document.grossCents : sum,
    0
  );
  const materialTotal = materialDocuments.reduce(
    (sum, document) =>
      document.lifecycle === "Submitted" ? sum + document.grossCents : sum,
    0
  );
  const labourTotal = labourDocuments.reduce(
    (sum, document) =>
      document.lifecycle === "Submitted" ? sum + document.grossCents : sum,
    0
  );
  const budgetCents = selectedMilestone?.budgetCents ?? 0;
  const coverage = budgetCents
    ? Math.min(100, Math.round((scopedTotal / budgetCents) * 100))
    : 0;
  const openDocument = (document: CostDocument) => {
    setSelectedDocument(document);
    setLastAction(
      `${document.reference} opened with allocations and attachments.`
    );
  };

  return (
    <>
      <div className="grid min-w-0 gap-3">
        <WorkspaceHeading
          description="Cost context follows the construction roadmap, with separate material and labour records resolved to the sub-milestones they support."
          detail={detail}
          eyebrow="B · Selected direction"
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
                  const milestoneDocuments = documents.filter(
                    (document) =>
                      document.lifecycle === "Submitted" &&
                      document.milestoneKeys.includes(milestone.key)
                  );
                  const materialGross = milestoneDocuments
                    .filter((document) => document.costType === "Materials")
                    .reduce((sum, document) => sum + document.grossCents, 0);
                  const labourGross = milestoneDocuments
                    .filter((document) => document.costType === "Labour")
                    .reduce((sum, document) => sum + document.grossCents, 0);
                  const active = milestone.key === selectedMilestone?.key;
                  return (
                    <Button
                      className="h-auto min-h-20 justify-start px-3 py-2 text-left"
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
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Package className="size-3" />
                            {formatMoney(materialGross)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Hammer className="size-3" />
                            {formatMoney(labourGross)}
                          </span>
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
                  <Frame className="grid grid-cols-2">
                    <FramePanel className="p-3">
                      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Package className="size-3.5" />
                        Materials
                      </p>
                      <p className="mt-1 font-semibold text-lg tabular-nums">
                        {formatMoney(materialTotal)}
                      </p>
                    </FramePanel>
                    <FramePanel className="p-3">
                      <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Hammer className="size-3.5" />
                        Labour
                      </p>
                      <p className="mt-1 font-semibold text-lg tabular-nums">
                        {formatMoney(labourTotal)}
                      </p>
                    </FramePanel>
                  </Frame>
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

              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                <CostTypeLane
                  costType="Materials"
                  detail={detail}
                  documents={materialDocuments}
                  onOpenDocument={openDocument}
                />
                <CostTypeLane
                  costType="Labour"
                  detail={detail}
                  documents={labourDocuments}
                  onOpenDocument={openDocument}
                />
              </div>
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
                  setLastAction={() => openDocument(document)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <CostDocumentDetailSheet
        detail={detail}
        document={selectedDocument}
        onClose={() => setSelectedDocument(null)}
        setLastAction={setLastAction}
      />
    </>
  );
}

function CostTypeLane({
  costType,
  detail,
  documents,
  onOpenDocument,
}: {
  costType: CostDocument["costType"];
  detail: ProductionBuildDetail;
  documents: CostDocument[];
  onOpenDocument: (document: CostDocument) => void;
}) {
  const total = documents
    .filter((document) => document.lifecycle === "Submitted")
    .reduce((sum, document) => sum + document.grossCents, 0);
  const Icon = costType === "Materials" ? Package : Hammer;

  return (
    <Frame className="h-fit">
      <FrameHeader className="flex-row items-start justify-between gap-3">
        <div>
          <FrameTitle className="flex items-center gap-2">
            <Icon className="size-4" />
            {costType} documents
          </FrameTitle>
          <FrameDescription>
            {documents.length} records · {formatMoney(total)} submitted gross
          </FrameDescription>
        </div>
        <Badge variant={costTypeTone(costType)}>
          {costType === "Materials" ? "Products & rentals" : "Crews & services"}
        </Badge>
      </FrameHeader>
      <FramePanel className="grid gap-2 p-2">
        {documents.map((document) => (
          <Card
            className="w-full text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
            key={document.id}
            onClick={() => onOpenDocument(document)}
            render={<button type="button" />}
          >
            <CardHeader className="p-4">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={lifecycleTone(document.lifecycle)}>
                  {document.lifecycle}
                </Badge>
                <Badge variant="outline">{document.kind}</Badge>
              </div>
              <CardTitle className="pr-20 text-base leading-snug">
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
            <CardPanel className="grid gap-2.5 p-4 pt-0">
              <div>
                <p className="mb-1.5 text-muted-foreground text-xs">
                  Assigned sub-milestones
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {document.submilestoneAllocations.map((allocation) => (
                    <Badge key={allocation.submilestoneKey} variant="secondary">
                      {submilestoneLabel(
                        allocation.submilestoneKey,
                        detail.submilestones
                      )}
                      <span className="opacity-64">
                        · {formatMoney(allocation.amountCents)}
                      </span>
                    </Badge>
                  ))}
                </div>
              </div>
              {document.milestoneKeys.length > 1 ? (
                <p className="flex items-center gap-1.5 text-warning-foreground text-xs">
                  <Link2 className="size-3.5" />
                  Allocated across {document.milestoneKeys.length} milestones
                </p>
              ) : null}
            </CardPanel>
            <CardFooter className="justify-between border-t p-3.5 text-muted-foreground text-xs">
              <span className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" />
                {document.attachments.length} attached{" "}
                {document.attachments.length === 1 ? "file" : "files"}
              </span>
              <span className="flex items-center gap-1">
                View full record
                <ChevronRight className="size-3.5" />
              </span>
            </CardFooter>
          </Card>
        ))}
        {documents.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground text-sm">
            No {costType.toLowerCase()} documents touch this milestone.
          </p>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function CostDocumentDetailSheet({
  detail,
  document,
  onClose,
  setLastAction,
}: {
  detail: ProductionBuildDetail;
  document: CostDocument | null;
  onClose: () => void;
  setLastAction: (value: string) => void;
}) {
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const previewFile = document?.attachments.find(
    (attachment) => attachment.id === previewFileId
  );

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setPreviewFileId(null);
        }
      }}
      open={Boolean(document)}
    >
      <SheetPopup
        className="max-w-2xl max-sm:w-full"
        initialFocus={false}
        variant="inset"
      >
        {document ? (
          <>
            <SheetHeader className="border-b pr-14">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={costTypeTone(document.costType)}>
                  {document.costType === "Materials" ? <Package /> : <Hammer />}
                  {document.costType}
                </Badge>
                <Badge variant="outline">{document.kind}</Badge>
                <Badge variant={lifecycleTone(document.lifecycle)}>
                  {document.lifecycle}
                </Badge>
              </div>
              <SheetTitle className="leading-tight">
                {document.title}
              </SheetTitle>
              <SheetDescription>
                {document.vendor} · {document.reference}
              </SheetDescription>
            </SheetHeader>

            <SheetPanel className="grid gap-3 p-3 sm:p-5">
              <Frame>
                <FramePanel className="grid gap-4 p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-muted-foreground text-xs">
                        Tax-inclusive total
                      </p>
                      <p className="mt-1 font-semibold text-2xl tabular-nums">
                        {formatMoney(document.grossCents)}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-muted-foreground">Issued</p>
                      <p className="font-medium">{document.issuedOn}</p>
                      {document.dueOn ? (
                        <>
                          <p className="mt-2 text-muted-foreground">Due</p>
                          <p className="font-medium">{document.dueOn}</p>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {document.description}
                  </p>
                </FramePanel>
                <FramePanel className="flex items-start gap-2 border-primary/20 bg-primary/5 p-3 text-xs">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  Supporting cost context only. This record does not establish
                  payment, completion, reimbursement eligibility, or draw
                  approval.
                </FramePanel>
              </Frame>

              <Frame>
                <FrameHeader>
                  <FrameTitle>Line items</FrameTitle>
                  <FrameDescription>
                    Full invoice or receipt resolution.
                  </FrameDescription>
                </FrameHeader>
                <FramePanel className="p-0">
                  <div className="divide-y">
                    {document.lineItems.map((lineItem) => (
                      <div
                        className="flex items-start justify-between gap-4 p-4 text-sm"
                        key={lineItem.description}
                      >
                        <span>{lineItem.description}</span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatMoney(lineItem.amountCents)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 p-4 text-muted-foreground text-sm">
                      <span>HST</span>
                      <span className="tabular-nums">
                        {formatMoney(document.taxCents)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 p-4 font-semibold text-sm">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {formatMoney(document.grossCents)}
                      </span>
                    </div>
                  </div>
                </FramePanel>
              </Frame>

              <Frame>
                <FrameHeader>
                  <FrameTitle>Assigned sub-milestones</FrameTitle>
                  <FrameDescription>
                    Allocations must resolve exactly to the document total.
                  </FrameDescription>
                </FrameHeader>
                <FramePanel className="grid gap-2 p-2">
                  {document.submilestoneAllocations.map((allocation) => {
                    const submilestone = detail.submilestones.find(
                      (item) => item.key === allocation.submilestoneKey
                    );
                    const milestone = detail.milestones.find(
                      (item) => item.key === submilestone?.milestoneKey
                    );
                    return (
                      <Card key={allocation.submilestoneKey}>
                        <CardPanel className="flex items-start justify-between gap-4 p-3.5">
                          <div>
                            <p className="font-medium text-sm">
                              {submilestone?.name ?? "Unknown sub-milestone"}
                            </p>
                            <p className="mt-1 text-muted-foreground text-xs">
                              {milestone?.name ?? "Unknown milestone"}
                            </p>
                          </div>
                          <p className="font-semibold text-sm tabular-nums">
                            {formatMoney(allocation.amountCents)}
                          </p>
                        </CardPanel>
                      </Card>
                    );
                  })}
                  <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                    <span className="flex items-center gap-1.5 text-success">
                      {document.allocationExact ? (
                        <>
                          <Check className="size-3.5" />
                          Allocations balance exactly
                        </>
                      ) : (
                        <>
                          <AlertCircle className="size-3.5" />
                          Allocation requires attention
                        </>
                      )}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(
                        document.submilestoneAllocations.reduce(
                          (sum, allocation) => sum + allocation.amountCents,
                          0
                        )
                      )}
                    </span>
                  </div>
                </FramePanel>
              </Frame>

              <Frame>
                <FrameHeader>
                  <FrameTitle>Attached files</FrameTitle>
                  <FrameDescription>
                    Durable records with request-time access controls.
                  </FrameDescription>
                </FrameHeader>
                {previewFile ? (
                  <FramePanel className="grid min-h-64 place-items-center bg-muted/40 p-6 text-center">
                    <div>
                      {previewFile.mediaType === "Image" ? (
                        <Eye className="mx-auto size-10 text-muted-foreground" />
                      ) : (
                        <FileText className="mx-auto size-10 text-muted-foreground" />
                      )}
                      <p className="mt-3 font-medium text-sm">
                        {previewFile.name}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Prototype file preview · {previewFile.size}
                      </p>
                    </div>
                  </FramePanel>
                ) : null}
                <FramePanel className="grid gap-2 p-2">
                  {document.attachments.map((attachment) => (
                    <Card key={attachment.id}>
                      <CardPanel className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
                        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                          <FileText className="size-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm">
                            {attachment.name}
                          </p>
                          <p className="mt-1 text-muted-foreground text-xs">
                            {attachment.mediaType} · {attachment.size} · Stored
                            with integrity verification
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button
                            onClick={() => setPreviewFileId(attachment.id)}
                            size="sm"
                            variant="outline"
                          >
                            <Eye />
                            Preview
                          </Button>
                          <Button
                            onClick={() =>
                              setLastAction(
                                `${attachment.name} download requested in prototype.`
                              )
                            }
                            size="sm"
                            variant="outline"
                          >
                            <Download />
                            Download
                          </Button>
                        </div>
                      </CardPanel>
                    </Card>
                  ))}
                </FramePanel>
              </Frame>

              <Frame className="grid sm:grid-cols-2">
                <FramePanel className="p-4">
                  <p className="mb-2 font-medium text-sm">Builder review</p>
                  <ReviewBadge state={document.builderReview} />
                </FramePanel>
                <FramePanel className="p-4">
                  <p className="mb-2 font-medium text-sm">Brokerage review</p>
                  <ReviewBadge state={document.brokerageReview} />
                </FramePanel>
              </Frame>

              <Frame>
                <FrameHeader>
                  <FrameTitle>Record provenance</FrameTitle>
                </FrameHeader>
                <FramePanel className="grid gap-3 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Submitted by
                    </p>
                    <p className="mt-1 font-medium">{document.submittedBy}</p>
                    <p className="text-muted-foreground text-xs">
                      {document.sourceRole}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">
                      Submitted or edited
                    </p>
                    <p className="mt-1 font-medium">{document.submittedOn}</p>
                    {document.revision ? (
                      <p className="text-muted-foreground text-xs">
                        {document.revision}
                      </p>
                    ) : null}
                  </div>
                </FramePanel>
              </Frame>
            </SheetPanel>

            <SheetFooter>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
              <Button
                onClick={() =>
                  setLastAction(
                    `${document.reference} audit history opened in prototype.`
                  )
                }
              >
                View audit history
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetPopup>
    </Sheet>
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
