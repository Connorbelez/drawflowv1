"use client";

import { useAccessToken } from "@workos/authkit-tanstack-react-start/client";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  Download,
  Eye,
  FileText,
  History,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  Component,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";
import {
  costDocumentPageDownloadUrl,
  formatCad,
} from "./SingleCostDocumentCapture.tsx";

const SUPPORTING_CONTEXT_DISCLOSURE =
  "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.";

interface CostDocumentSummary {
  _id: Id<"costDocuments">;
  allocations: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    order: number;
    submilestoneKey: string;
    submilestoneName: string;
  }>;
  category: "labour" | "materials";
  currency: "CAD";
  documentDate: string;
  duplicateWarning?: boolean;
  grossTotalCents: number;
  integrity?: { healthy: boolean; openExceptionKinds: string[] };
  kind: "invoice" | "receipt";
  lifecycle: { state: "current" | "superseded" | "voided" };
  reviewAttention?:
    | "needs_correction"
    | "partially_reviewed"
    | "reviewed"
    | "unreviewed";
  state: "submitted";
  submittedAt: number;
  title: string;
  uploaderScope: "other" | "self";
  vendorName: string;
}

export type CostDocumentDetail = Omit<
  CostDocumentSummary,
  "duplicateWarning" | "integrity"
> & {
  activity: Array<{ createdAt: number; eventType: string }>;
  capabilities: {
    canRecordBrokerageReview: boolean;
    canRecordBuilderReview: boolean;
    canStartCorrection: boolean;
    canVoid: boolean;
  };
  description?: string;
  duplicateWarning?: { overridden: true; reason: string };
  financialComponents: Array<{
    amountCents: number;
    kind: "discount" | "fee" | "subtotal" | "tax";
    label?: string;
    order: number;
  }>;
  integrity?: {
    healthy: boolean;
    openExceptions: Array<{
      actionRequired: boolean;
      assetId: Id<"buildCollaborationAssets">;
      createdAt: number;
      kind: "corrupt" | "missing" | "quarantined" | "unavailable";
      pageId: Id<"costDocumentPages">;
    }>;
  };
  lifecycle: {
    state: "current" | "superseded" | "voided";
    supersededAt?: number;
    voidedAt?: number;
    voidReason?: string;
  };
  pages: Array<{
    assetId: Id<"buildCollaborationAssets">;
    contentHashSha256: string;
    fileName: string;
    mimeType: string;
    order: number;
  }>;
  revision: {
    number: number;
    supersededByCostDocumentId?: Id<"costDocuments">;
    supersedesCostDocumentId?: Id<"costDocuments">;
  };
  reviews?: {
    brokerage?: CostDocumentReview;
    builder?: CostDocumentReview;
  };
  supportingContextDisclosure: string;
};

interface CostDocumentReview {
  annotation: string;
  createdAt: number;
  outcome: "accepted" | "needs_correction";
  revision: number;
}

interface Filters {
  category: "all" | "labour" | "materials";
  duplicate: "all" | "has_duplicate" | "none";
  integrity: "all" | "attention" | "healthy";
  kind: "all" | "invoice" | "receipt";
  lifecycle: "all" | "current" | "superseded" | "voided";
  milestone: string;
  review: NonNullable<CostDocumentSummary["reviewAttention"]> | "all";
  submilestone: string;
  uploader: "all" | "other" | "self";
}

const INITIAL_FILTERS: Filters = {
  category: "all",
  duplicate: "all",
  integrity: "all",
  kind: "all",
  lifecycle: "all",
  milestone: "all",
  review: "all",
  submilestone: "all",
  uploader: "all",
};

export type CostDocumentInteractionMode =
  | "brokerage-review"
  | "read-only"
  | "standard";

export interface CostDocumentRoadmapReconciliationProps {
  /**
   * Pins Cost API calls and private source retrieval to the capacity selected
   * by this Build-local surface. Authorization remains server-enforced.
   */
  actorCapacity?: "homeowner" | "contractor";
  buildId: Id<"activeBuilds">;
  /**
   * The surface-level action boundary. It can only narrow server-granted
   * capabilities: Brokerages may record their own review, while Contractor
   * history stays immutable and read-only.
   */
  interactionMode?: CostDocumentInteractionMode;
  onCloseCostDocument: () => void;
  onOpenCostDocument: (costDocumentId: string) => void;
  onStartCorrection?: (input: { batchId: string; draftId: string }) => void;
  organizationId: string;
  selectedCostDocumentId?: string;
  submilestones: CostDocumentSubmilestoneOption[];
}

/**
 * The Build Workspace's canonical Cost Document ledger. It deliberately
 * reconciles immutable supporting-cost records only: it does not imply that
 * a payment occurred, work completed, a reimbursement is eligible, or a Draw
 * should be approved/released.
 */
export function CostDocumentRoadmapReconciliation(
  props: CostDocumentRoadmapReconciliationProps
): ReactNode {
  const [retryKey, setRetryKey] = useState(0);
  return (
    <RoadmapReconciliationBoundary
      key={retryKey}
      onRetry={() => setRetryKey((value) => value + 1)}
    >
      <CostDocumentRoadmapReconciliationContent {...props} />
    </RoadmapReconciliationBoundary>
  );
}

function CostDocumentRoadmapReconciliationContent({
  actorCapacity,
  buildId,
  interactionMode = "standard",
  onCloseCostDocument,
  onOpenCostDocument,
  onStartCorrection,
  organizationId,
  selectedCostDocumentId,
  submilestones,
}: CostDocumentRoadmapReconciliationProps) {
  const actorCapacityInput = actorCapacity ? { actorCapacity } : {};
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [search, setSearch] = useState("");
  const autoLoadBoundaryRef = useRef<number>();
  const { loadMore, results, status } = usePaginatedQuery(
    api.cost_documents.listCostDocumentRoadmapReconciliation,
    { buildId, organizationId, ...actorCapacityInput } as never,
    { initialNumItems: 5 }
  );
  useEffect(() => {
    if (
      status === "CanLoadMore" &&
      autoLoadBoundaryRef.current !== results.length
    ) {
      autoLoadBoundaryRef.current = results.length;
      loadMore(5);
    }
  }, [loadMore, results.length, status]);
  const selectedDocument = useQuery(
    api.cost_documents.getCostDocument,
    selectedCostDocumentId
      ? ({
          buildId,
          costDocumentId: selectedCostDocumentId,
          organizationId,
          ...actorCapacityInput,
        } as never)
      : "skip"
  ) as CostDocumentDetail | null | undefined;
  const documents = results as CostDocumentSummary[];
  const milestoneOptions = useMemo(
    () => uniqueMilestoneOptions(submilestones),
    [submilestones]
  );
  const visibleDocuments = useMemo(
    () =>
      documents.filter((document) =>
        matchesFilters(document, filters, search, submilestones)
      ),
    [documents, filters, search, submilestones]
  );
  const groups = useMemo(
    () => groupDocumentsByMilestone(visibleDocuments, submilestones),
    [submilestones, visibleDocuments]
  );
  const currentTotals = useMemo(
    () =>
      documents.reduce(
        (totals, document) => {
          if (document.lifecycle.state === "current") {
            totals[document.category] += document.grossTotalCents;
          }
          return totals;
        },
        { labour: 0, materials: 0 }
      ),
    [documents]
  );

  return (
    <div
      className="space-y-4"
      data-testid="cost-document-roadmap-reconciliation"
    >
      <Frame>
        <FrameHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <FrameTitle>Roadmap reconciliation</FrameTitle>
              <FrameDescription>
                Submitted Invoice and Receipt context, organized against the
                Construction Roadmap by Milestone.
              </FrameDescription>
            </div>
            <Badge variant="outline">Cost Documents</Badge>
          </div>
          <Alert>
            <ShieldCheck />
            <AlertTitle>Supporting cost context only</AlertTitle>
            <AlertDescription>{SUPPORTING_CONTEXT_DISCLOSURE}</AlertDescription>
          </Alert>
        </FrameHeader>
        {status === "Exhausted" ? (
          <FramePanel className="grid gap-3 sm:grid-cols-2">
            <LedgerTotal
              amountCents={currentTotals.materials}
              category="materials"
              label="Materials submitted gross"
            />
            <LedgerTotal
              amountCents={currentTotals.labour}
              category="labour"
              label="Labour submitted gross"
            />
          </FramePanel>
        ) : (
          <FramePanel>
            <p className="text-muted-foreground text-sm">
              Loading the complete authorized Cost Document ledger…
            </p>
          </FramePanel>
        )}
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Search and filters</FrameTitle>
          <FrameDescription>
            Narrow the immutable record set without changing its financial or
            roadmap facts.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field className="md:col-span-2 xl:col-span-4">
            <FieldLabel htmlFor="cost-document-search">
              Search Cost Documents
            </FieldLabel>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="ps-9"
                id="cost-document-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Vendor, title, allocation, or document date"
                value={search}
              />
            </div>
          </Field>
          <FilterSelect
            id="cost-document-kind-filter"
            label="Filter by document kind"
            onChange={(value) =>
              updateFilters(setFilters, "kind", value as Filters["kind"])
            }
            options={[
              ["all", "All kinds"],
              ["invoice", "Invoice"],
              ["receipt", "Receipt"],
            ]}
            value={filters.kind}
          />
          <FilterSelect
            id="cost-document-category-filter"
            label="Filter by category"
            onChange={(value) =>
              updateFilters(
                setFilters,
                "category",
                value as Filters["category"]
              )
            }
            options={[
              ["all", "All categories"],
              ["materials", "Materials"],
              ["labour", "Labour"],
            ]}
            value={filters.category}
          />
          <FilterSelect
            id="cost-document-lifecycle-filter"
            label="Filter by lifecycle"
            onChange={(value) =>
              updateFilters(
                setFilters,
                "lifecycle",
                value as Filters["lifecycle"]
              )
            }
            options={[
              ["all", "All lifecycle states"],
              ["current", "Current"],
              ["superseded", "Superseded"],
              ["voided", "Voided"],
            ]}
            value={filters.lifecycle}
          />
          {interactionMode === "read-only" ? null : (
            <>
              <FilterSelect
                id="cost-document-review-filter"
                label="Filter by review attention"
                onChange={(value) =>
                  updateFilters(
                    setFilters,
                    "review",
                    value as Filters["review"]
                  )
                }
                options={[
                  ["all", "All review states"],
                  ["unreviewed", "Unreviewed"],
                  ["partially_reviewed", "Partially reviewed"],
                  ["reviewed", "Reviewed"],
                  ["needs_correction", "Needs correction"],
                ]}
                value={filters.review}
              />
              <FilterSelect
                id="cost-document-duplicate-filter"
                label="Filter by duplicate signal"
                onChange={(value) =>
                  updateFilters(
                    setFilters,
                    "duplicate",
                    value as Filters["duplicate"]
                  )
                }
                options={[
                  ["all", "All duplicate states"],
                  ["has_duplicate", "Duplicate override"],
                  ["none", "No duplicate override"],
                ]}
                value={filters.duplicate}
              />
              <FilterSelect
                id="cost-document-integrity-filter"
                label="Filter by file integrity"
                onChange={(value) =>
                  updateFilters(
                    setFilters,
                    "integrity",
                    value as Filters["integrity"]
                  )
                }
                options={[
                  ["all", "All integrity states"],
                  ["healthy", "Healthy files"],
                  ["attention", "Integrity attention"],
                ]}
                value={filters.integrity}
              />
            </>
          )}
          <FilterSelect
            id="cost-document-uploader-filter"
            label="Filter by uploader"
            onChange={(value) =>
              updateFilters(
                setFilters,
                "uploader",
                value as Filters["uploader"]
              )
            }
            options={[
              ["all", "All uploaders"],
              ["self", "Uploaded by me"],
              ["other", "Uploaded by another participant"],
            ]}
            value={filters.uploader}
          />
          <FilterSelect
            id="cost-document-milestone-filter"
            label="Filter by Milestone"
            onChange={(value) => updateFilters(setFilters, "milestone", value)}
            options={[["all", "All Milestones"], ...milestoneOptions]}
            value={filters.milestone}
          />
          <FilterSelect
            id="cost-document-submilestone-filter"
            label="Filter by Sub-milestone"
            onChange={(value) =>
              updateFilters(setFilters, "submilestone", value)
            }
            options={[
              ["all", "All Sub-milestones"],
              ...submilestones.map((item) => [String(item.id), item.label]),
            ]}
            value={filters.submilestone}
          />
        </FramePanel>
      </Frame>

      {status === "Exhausted" ? (
        documents.length === 0 ? (
          <EmptyLedger
            description="Submitted Invoice and Receipt records will appear here after they are frozen."
            title="No submitted Cost Documents yet"
          />
        ) : visibleDocuments.length === 0 ? (
          <EmptyLedger
            description="Change or clear a filter to see other authorized submitted records."
            title="No Cost Documents match these filters"
          />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <MilestoneReconciliationGroup
                group={group}
                key={group.key}
                onOpenCostDocument={onOpenCostDocument}
                showInternalSignals={interactionMode !== "read-only"}
              />
            ))}
          </div>
        )
      ) : (
        <Frame>
          <FramePanel>
            <p className="text-muted-foreground text-sm">
              Loading all authorized Cost Documents before applying totals,
              search, and filters…
            </p>
          </FramePanel>
        </Frame>
      )}

      {selectedCostDocumentId ? (
        <CostDocumentDetailSheet
          actorCapacity={actorCapacity}
          buildId={buildId}
          document={selectedDocument}
          interactionMode={interactionMode}
          onClose={onCloseCostDocument}
          onStartCorrection={onStartCorrection}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}

function LedgerTotal({
  amountCents,
  category,
  label,
}: {
  amountCents: number;
  category: "labour" | "materials";
  label: string;
}) {
  return (
    <Card
      className={category === "materials" ? "bg-sky-500/8" : "bg-amber-500/10"}
    >
      <CardPanel className="p-3">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 font-semibold text-xl tabular-nums">
          {formatCad(amountCents)}
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          Current records only; submitted gross totals remain independent.
        </p>
      </CardPanel>
    </Card>
  );
}

function FilterSelect({
  id,
  label,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: [string, string][];
  value: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        className="w-full"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <NativeSelectOption key={optionValue} value={optionValue}>
            {optionLabel}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function EmptyLedger({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Frame>
      <FramePanel className="py-10 text-center">
        <FileText className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
          {description}
        </p>
      </FramePanel>
    </Frame>
  );
}

interface MilestoneGroup {
  key: string;
  label: string;
  labour: CostDocumentSummary[];
  materials: CostDocumentSummary[];
}

function MilestoneReconciliationGroup({
  group,
  onOpenCostDocument,
  showInternalSignals,
}: {
  group: MilestoneGroup;
  onOpenCostDocument: (costDocumentId: string) => void;
  showInternalSignals: boolean;
}) {
  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>{group.label}</FrameTitle>
        <FrameDescription>
          Reconcile supporting cost context against this Milestone’s assigned
          Sub-milestones.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="grid gap-4 lg:grid-cols-2">
        <CostDocumentLane
          category="materials"
          documents={group.materials}
          onOpenCostDocument={onOpenCostDocument}
          showInternalSignals={showInternalSignals}
        />
        <CostDocumentLane
          category="labour"
          documents={group.labour}
          onOpenCostDocument={onOpenCostDocument}
          showInternalSignals={showInternalSignals}
        />
      </FramePanel>
    </Frame>
  );
}

function CostDocumentLane({
  category,
  documents,
  onOpenCostDocument,
  showInternalSignals,
}: {
  category: "labour" | "materials";
  documents: CostDocumentSummary[];
  onOpenCostDocument: (costDocumentId: string) => void;
  showInternalSignals: boolean;
}) {
  const title = category === "materials" ? "Materials" : "Labour";
  return (
    <Frame
      aria-label={`${title} Cost Documents`}
      className={category === "materials" ? "bg-sky-500/8" : "bg-amber-500/10"}
    >
      <FrameHeader className="flex-row items-center justify-between py-3">
        <FrameTitle>{title}</FrameTitle>
        <Badge variant="outline">{documents.length}</Badge>
      </FrameHeader>
      <FramePanel className="space-y-2 p-3">
        {documents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No {title.toLocaleLowerCase("en-CA")} records match this Milestone.
          </p>
        ) : (
          documents.map((document) => (
            <CostDocumentCard
              document={document}
              key={document._id}
              onOpen={() => onOpenCostDocument(String(document._id))}
              showInternalSignals={showInternalSignals}
            />
          ))
        )}
      </FramePanel>
    </Frame>
  );
}

function CostDocumentCard({
  document,
  onOpen,
  showInternalSignals,
}: {
  document: CostDocumentSummary;
  onOpen: () => void;
  showInternalSignals: boolean;
}) {
  return (
    <Card
      className="text-start transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
      render={
        <button
          aria-label={`Open ${document.title}`}
          onClick={onOpen}
          type="button"
        />
      }
    >
      <CardPanel className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{document.title}</p>
            <p className="text-muted-foreground text-sm">
              {document.vendorName} · {formatCad(document.grossTotalCents)}
            </p>
          </div>
          <Badge
            variant={
              document.lifecycle.state === "current" ? "secondary" : "warning"
            }
          >
            {titleCase(document.lifecycle.state)}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge size="sm" variant="outline">
            {titleCase(document.kind)}
          </Badge>
          <Badge size="sm" variant="outline">
            {titleCase(document.category)}
          </Badge>
          {showInternalSignals && document.reviewAttention ? (
            <Badge
              size="sm"
              variant={reviewBadgeVariant(document.reviewAttention)}
            >
              {reviewAttentionLabel(document.reviewAttention)}
            </Badge>
          ) : null}
          {showInternalSignals && document.duplicateWarning ? (
            <Badge size="sm" variant="warning">
              Duplicate override
            </Badge>
          ) : null}
          {showInternalSignals && document.integrity?.healthy === false ? (
            <Badge size="sm" variant="error">
              Integrity attention
            </Badge>
          ) : null}
        </div>
        <div className="space-y-1 text-muted-foreground text-xs">
          <p>
            {document.uploaderScope === "self"
              ? "Uploaded by you"
              : "Uploaded by another authorized participant"}
          </p>
          <ul aria-label="Assigned Sub-milestones" className="space-y-1">
            {document.allocations.map((allocation) => (
              <li key={`${allocation.buildSubmilestoneId}:${allocation.order}`}>
                {allocation.submilestoneKey} · {allocation.submilestoneName} ·{" "}
                {formatCad(allocation.amountCents)}
              </li>
            ))}
          </ul>
        </div>
      </CardPanel>
    </Card>
  );
}

export function CostDocumentDetailSheet({
  actorCapacity,
  buildId,
  document,
  interactionMode = "standard",
  onClose,
  onStartCorrection,
  organizationId,
}: {
  actorCapacity?: "homeowner" | "contractor";
  buildId: Id<"activeBuilds">;
  document: CostDocumentDetail | null | undefined;
  interactionMode?: CostDocumentInteractionMode;
  onClose: () => void;
  onStartCorrection?: (input: { batchId: string; draftId: string }) => void;
  organizationId: string;
}) {
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open>
      <SheetPopup
        className="w-full max-w-2xl max-sm:h-dvh max-sm:w-screen"
        side="right"
      >
        {document === undefined ? (
          <>
            <SheetHeader>
              <SheetTitle>Cost Document</SheetTitle>
              <SheetDescription>
                Reading the selected immutable record.
              </SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <p className="text-muted-foreground text-sm">
                Reading Cost Document…
              </p>
            </SheetPanel>
          </>
        ) : document === null ? (
          <>
            <SheetHeader>
              <SheetTitle>Cost Document unavailable</SheetTitle>
              <SheetDescription>
                Access is rechecked for every record and source page. Your
                current Build role no longer permits this record.
              </SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <Button onClick={onClose} type="button" variant="outline">
                Close record
              </Button>
            </SheetPanel>
          </>
        ) : (
          <CostDocumentDetail
            actorCapacity={actorCapacity}
            buildId={buildId}
            document={document}
            interactionMode={interactionMode}
            onStartCorrection={onStartCorrection}
            organizationId={organizationId}
          />
        )}
      </SheetPopup>
    </Sheet>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This canonical detail controller keeps private retrieval, role-scoped review commands, correction, voiding, and their shared error state on one live Cost Document surface.
export function CostDocumentDetail({
  actorCapacity,
  buildId,
  document,
  interactionMode = "standard",
  onStartCorrection,
  organizationId,
}: {
  actorCapacity?: "homeowner" | "contractor";
  buildId: Id<"activeBuilds">;
  document: CostDocumentDetail;
  interactionMode?: CostDocumentInteractionMode;
  onStartCorrection?: (input: { batchId: string; draftId: string }) => void;
  organizationId: string;
}) {
  const actorCapacityInput = actorCapacity ? { actorCapacity } : {};
  const { getAccessToken } = useAccessToken();
  const setReview = useMutation(
    api.cost_documents.setCostDocumentReviewAnnotation
  );
  const startCorrection = useMutation(
    api.cost_documents.startCostDocumentCorrection
  );
  const voidCostDocument = useMutation(api.cost_documents.voidCostDocument);
  const correctionKeys = useRef(new Map<string, string>());
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingAssetId, setDownloadingAssetId] =
    useState<Id<"buildCollaborationAssets"> | null>(null);
  const [reviewAnnotations, setReviewAnnotations] = useState({
    brokerage: "",
    builder: "",
  });
  const [reviewOutcomes, setReviewOutcomes] = useState<{
    brokerage: "accepted" | "needs_correction";
    builder: "accepted" | "needs_correction";
  }>({ brokerage: "accepted", builder: "accepted" });
  const [voidReason, setVoidReason] = useState("");
  const canRecordBuilderReview =
    interactionMode === "standard" &&
    document.capabilities.canRecordBuilderReview;
  const canRecordBrokerageReview =
    interactionMode !== "read-only" &&
    document.capabilities.canRecordBrokerageReview;
  const canStartCorrection =
    interactionMode === "standard" && document.capabilities.canStartCorrection;
  const canVoid =
    interactionMode === "standard" && document.capabilities.canVoid;

  const recordReview = async (
    event: FormEvent<HTMLFormElement>,
    reviewType: "brokerage" | "builder"
  ) => {
    event.preventDefault();
    const annotation = reviewAnnotations[reviewType].trim();
    if (!annotation) {
      return;
    }
    setActionError(null);
    try {
      await setReview({
        annotation,
        buildId,
        costDocumentId: document._id,
        organizationId,
        outcome: reviewOutcomes[reviewType],
        reviewType,
        ...actorCapacityInput,
      } as never);
      setReviewAnnotations((current) => ({ ...current, [reviewType]: "" }));
    } catch (cause) {
      setActionError(messageForCostDocumentAction(cause));
    }
  };

  const beginCorrection = async () => {
    setActionError(null);
    try {
      let idempotencyKey = correctionKeys.current.get(String(document._id));
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        correctionKeys.current.set(String(document._id), idempotencyKey);
      }
      const correction = await startCorrection({
        buildId,
        costDocumentId: document._id,
        idempotencyKey,
        organizationId,
        reuseSourcePages: true,
        ...actorCapacityInput,
      } as never);
      onStartCorrection?.({
        batchId: String(correction.batchId),
        draftId: String(correction.draftId),
      });
    } catch (cause) {
      setActionError(messageForCostDocumentAction(cause));
    }
  };

  const voidRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!voidReason.trim()) {
      return;
    }
    setActionError(null);
    try {
      await voidCostDocument({
        buildId,
        costDocumentId: document._id,
        organizationId,
        reason: voidReason.trim(),
        ...actorCapacityInput,
      } as never);
      setVoidReason("");
    } catch (cause) {
      setActionError(messageForCostDocumentAction(cause));
    }
  };

  const retrievePage = async (
    page: CostDocumentDetail["pages"][number],
    mode: "download" | "preview"
  ) => {
    setActionError(null);
    setDownloadingAssetId(page.assetId);
    const preview =
      mode === "preview" ? window.open("about:blank", "_blank") : null;
    if (mode === "preview" && !preview) {
      setActionError("Allow pop-ups to preview this private source page.");
      setDownloadingAssetId(null);
      return;
    }
    if (preview) {
      preview.opener = null;
    }
    let objectUrl: string | undefined;
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Sign in again to retrieve this private source page.");
      }
      const response = await fetch(
        costDocumentPageDownloadUrl({
          actorCapacity,
          assetId: page.assetId,
          buildId,
          costDocumentId: document._id,
          organizationId,
        }),
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) {
        throw new Error(
          "This private source page is no longer available under your current Build access."
        );
      }
      objectUrl = URL.createObjectURL(await response.blob());
      if (mode === "download") {
        const anchor = window.document.createElement("a");
        anchor.download = page.fileName;
        anchor.href = objectUrl;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      } else {
        preview?.location.replace(objectUrl);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (cause) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      preview?.close();
      setActionError(messageForCostDocumentAction(cause));
    } finally {
      setDownloadingAssetId(null);
    }
  };

  const allocatedCents = document.allocations.reduce(
    (total, allocation) => total + allocation.amountCents,
    0
  );
  return (
    <>
      <SheetHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 pe-8">
          <div className="min-w-0">
            <SheetTitle>{document.title}</SheetTitle>
            <SheetDescription>
              {document.vendorName} · {formatCad(document.grossTotalCents)} ·{" "}
              {titleCase(document.lifecycle.state)} record
            </SheetDescription>
          </div>
          <Badge variant="outline">{titleCase(document.kind)}</Badge>
        </div>
      </SheetHeader>
      <SheetPanel className="space-y-4">
        <Alert>
          <ShieldCheck />
          <AlertTitle>Supporting cost context only</AlertTitle>
          <AlertDescription>
            {document.supportingContextDisclosure}
          </AlertDescription>
        </Alert>

        <DetailSection title="Document facts">
          <DefinitionList
            rows={[
              ["Kind", titleCase(document.kind)],
              ["Category", titleCase(document.category)],
              ["Document date", document.documentDate],
              ["Vendor", document.vendorName],
              ["Lifecycle", titleCase(document.lifecycle.state)],
              [
                "Description",
                document.description || "No description recorded.",
              ],
            ]}
          />
        </DetailSection>

        <DetailSection title="Financial reconciliation">
          <DefinitionList
            rows={[
              ["Submitted gross total", formatCad(document.grossTotalCents)],
              ["Exact Sub-milestone allocations", formatCad(allocatedCents)],
              [
                "Allocation variance",
                formatCad(document.grossTotalCents - allocatedCents),
              ],
            ]}
          />
          <p className="mt-3 text-muted-foreground text-xs">
            This is a recorded-cost reconciliation only. It does not establish
            payment, work completion, reimbursement eligibility, Draw inclusion,
            or approval.
          </p>
        </DetailSection>

        <DetailSection title="Recorded financial line items">
          {document.financialComponents.length > 0 ? (
            <ul className="space-y-2">
              {document.financialComponents.map((component) => (
                <li
                  className="flex items-center justify-between gap-3 text-sm"
                  key={component.order}
                >
                  <span>{component.label || titleCase(component.kind)}</span>
                  <span className="font-medium tabular-nums">
                    {formatCad(component.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No item-level financial components were stored with this source
              record.
            </p>
          )}
        </DetailSection>

        <DetailSection title="Exact allocations">
          <ul className="space-y-2">
            {document.allocations.map((allocation) => (
              <li
                className="flex items-center justify-between gap-3 text-sm"
                key={`${allocation.buildSubmilestoneId}:${allocation.order}`}
              >
                <span>
                  {allocation.submilestoneKey} · {allocation.submilestoneName}
                </span>
                <span className="font-medium tabular-nums">
                  {formatCad(allocation.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </DetailSection>

        <DetailSection title="Record provenance">
          <DefinitionList
            rows={[
              [
                "Uploader context",
                document.uploaderScope === "self"
                  ? "Uploaded by you"
                  : "Uploaded by another authorized participant",
              ],
              ["Submitted", formatDateTime(document.submittedAt)],
              ["Currency", document.currency],
            ]}
          />
        </DetailSection>

        {interactionMode === "read-only" || !document.reviews ? null : (
          <DetailSection title="Reviews">
            <div className="space-y-3">
              <ReviewSummary
                label="Builder review"
                review={document.reviews.builder}
              />
              <ReviewSummary
                label="Brokerage review"
                review={document.reviews.brokerage}
              />
            </div>
            <div className="mt-4 grid gap-4">
              {canRecordBuilderReview ? (
                <ReviewForm
                  annotation={reviewAnnotations.builder}
                  onAnnotationChange={(value) =>
                    setReviewAnnotations((current) => ({
                      ...current,
                      builder: value,
                    }))
                  }
                  onOutcomeChange={(value) =>
                    setReviewOutcomes((current) => ({
                      ...current,
                      builder: value as "accepted" | "needs_correction",
                    }))
                  }
                  onSubmit={(event) => recordReview(event, "builder")}
                  outcome={reviewOutcomes.builder}
                  reviewType="builder"
                />
              ) : null}
              {canRecordBrokerageReview ? (
                <ReviewForm
                  annotation={reviewAnnotations.brokerage}
                  onAnnotationChange={(value) =>
                    setReviewAnnotations((current) => ({
                      ...current,
                      brokerage: value,
                    }))
                  }
                  onOutcomeChange={(value) =>
                    setReviewOutcomes((current) => ({
                      ...current,
                      brokerage: value as "accepted" | "needs_correction",
                    }))
                  }
                  onSubmit={(event) => recordReview(event, "brokerage")}
                  outcome={reviewOutcomes.brokerage}
                  reviewType="brokerage"
                />
              ) : null}
            </div>
          </DetailSection>
        )}

        {interactionMode === "read-only" ? null : (
          <DetailSection title="Duplicate signals">
            {document.duplicateWarning ? (
              <p className="text-sm">
                A likely-duplicate check was overridden with this reason:{" "}
                {document.duplicateWarning.reason}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                No duplicate override was recorded for this Cost Document.
              </p>
            )}
          </DetailSection>
        )}

        <DetailSection title="Revision and void history">
          <DefinitionList
            rows={[
              ["Revision", String(document.revision.number)],
              [
                "Supersedes",
                document.revision.supersedesCostDocumentId
                  ? "A prior immutable Cost Document"
                  : "Original submitted record",
              ],
              [
                "Superseded by",
                document.revision.supersededByCostDocumentId
                  ? "A newer immutable Cost Document"
                  : "No newer record",
              ],
              [
                "Voided",
                document.lifecycle.voidedAt
                  ? formatDateTime(document.lifecycle.voidedAt)
                  : "Not voided",
              ],
              ["Void reason", document.lifecycle.voidReason || "None"],
            ]}
          />
          <div className="mt-4 space-y-3">
            {canStartCorrection && onStartCorrection ? (
              <Button onClick={beginCorrection} type="button" variant="outline">
                Start correction
              </Button>
            ) : null}
            {canVoid ? (
              <form className="space-y-2" onSubmit={voidRecord}>
                <Field>
                  <FieldLabel htmlFor="cost-document-void-reason">
                    Void reason
                  </FieldLabel>
                  <Textarea
                    id="cost-document-void-reason"
                    onChange={(event) => setVoidReason(event.target.value)}
                    placeholder="Why should this immutable record be marked void?"
                    value={voidReason}
                  />
                </Field>
                <Button
                  disabled={!voidReason.trim()}
                  type="submit"
                  variant="destructive-outline"
                >
                  Void record
                </Button>
              </form>
            ) : null}
          </div>
        </DetailSection>

        <DetailSection title="Audit activity">
          {document.activity.length > 0 ? (
            <ol className="space-y-2">
              {document.activity.map((activity) => (
                <li
                  className="flex gap-2 text-sm"
                  key={`${activity.eventType}:${activity.createdAt}`}
                >
                  <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {activity.eventType.replaceAll("_", " ")} ·{" "}
                    {formatDateTime(activity.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              No audit activity is available.
            </p>
          )}
        </DetailSection>

        <DetailSection title="Evidence Package references">
          <p className="text-muted-foreground text-sm">
            No Evidence Package is attached to this Cost Document. Source pages
            support cost provenance; they are not completion evidence.
          </p>
        </DetailSection>

        <DetailSection title="Source pages">
          <p className="mb-3 text-muted-foreground text-sm">
            Access is rechecked before every private preview or download.
          </p>
          <div className="space-y-2">
            {document.pages.map((page) => {
              const integrityException =
                document.integrity?.openExceptions.find(
                  (exception) => exception.assetId === page.assetId
                );
              return (
                <Card key={page.assetId}>
                  <CardPanel className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {page.order}. {page.fileName}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {page.mimeType} · SHA-256{" "}
                        {shortHash(page.contentHashSha256)}
                      </p>
                      {integrityException ? (
                        <p className="mt-1 text-destructive-text text-xs">
                          {titleCase(integrityException.kind)} source page —
                          preview/download blocked until integrity review.
                        </p>
                      ) : null}
                    </div>
                    {integrityException ? null : (
                      <div className="flex flex-wrap gap-2">
                        {isPreviewable(page.mimeType) ? (
                          <Button
                            aria-label={`Preview page ${page.order}: ${page.fileName}`}
                            disabled={downloadingAssetId === page.assetId}
                            onClick={() => retrievePage(page, "preview")}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Eye />
                            Preview
                          </Button>
                        ) : null}
                        <Button
                          aria-label={`Download page ${page.order}: ${page.fileName}`}
                          disabled={downloadingAssetId === page.assetId}
                          onClick={() => retrievePage(page, "download")}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Download />
                          Download
                        </Button>
                      </div>
                    )}
                  </CardPanel>
                </Card>
              );
            })}
          </div>
        </DetailSection>

        {actionError ? (
          <Alert variant="error">
            <AlertTriangle />
            <AlertTitle>Cost Document action unavailable</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}
      </SheetPanel>
    </>
  );
}

function DetailSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Frame>
      <FrameHeader className="py-3">
        <FrameTitle>{title}</FrameTitle>
      </FrameHeader>
      <FramePanel className="p-4">{children}</FramePanel>
    </Frame>
  );
}

function DefinitionList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(9rem,auto)_1fr]">
      {rows.map(([term, value]) => (
        <div className="contents" key={term}>
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewSummary({
  label,
  review,
}: {
  label: string;
  review?: CostDocumentReview;
}) {
  return (
    <Card>
      <CardPanel className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-sm">{label}</p>
          <Badge
            size="sm"
            variant={review ? reviewBadgeVariant(review.outcome) : "outline"}
          >
            {review ? reviewAttentionLabel(review.outcome) : "Not recorded"}
          </Badge>
        </div>
        {review ? (
          <>
            <p className="mt-2 text-sm">{review.annotation}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Revision {review.revision} · {formatDateTime(review.createdAt)}
            </p>
          </>
        ) : null}
      </CardPanel>
    </Card>
  );
}

function ReviewForm({
  annotation,
  onAnnotationChange,
  onOutcomeChange,
  onSubmit,
  outcome,
  reviewType,
}: {
  annotation: string;
  onAnnotationChange: (value: string) => void;
  onOutcomeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  outcome: "accepted" | "needs_correction";
  reviewType: "brokerage" | "builder";
}) {
  const label = reviewType === "builder" ? "Builder" : "Brokerage";
  const inputId = `cost-document-${reviewType}-review`;
  return (
    <Card render={<form onSubmit={onSubmit} />}>
      <CardPanel className="p-3">
        <Field>
          <FieldLabel htmlFor={inputId}>
            {label} supporting-context review
          </FieldLabel>
          <Textarea
            id={inputId}
            onChange={(event) => onAnnotationChange(event.target.value)}
            placeholder="Record a durable review annotation"
            value={annotation}
          />
        </Field>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={`${label} review outcome`}
            onChange={(event) => onOutcomeChange(event.target.value)}
            size="sm"
            value={outcome}
          >
            <NativeSelectOption value="accepted">Accepted</NativeSelectOption>
            <NativeSelectOption value="needs_correction">
              Needs correction
            </NativeSelectOption>
          </NativeSelect>
          <Button
            disabled={!annotation.trim()}
            size="sm"
            type="submit"
            variant="outline"
          >
            Record {label} review
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}

function matchesFilters(
  document: CostDocumentSummary,
  filters: Filters,
  search: string,
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("en-CA");
  const searchHaystack = [
    document.documentDate,
    document.title,
    document.vendorName,
    ...document.allocations.flatMap((allocation) => [
      allocation.submilestoneKey,
      allocation.submilestoneName,
      submilestones.find((item) => item.id === allocation.buildSubmilestoneId)
        ?.label || "",
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase("en-CA");
  const allocationMilestones = document.allocations.map((allocation) =>
    milestoneForAllocation(allocation, submilestones)
  );
  return (
    (!normalizedSearch || searchHaystack.includes(normalizedSearch)) &&
    (filters.kind === "all" || document.kind === filters.kind) &&
    (filters.category === "all" || document.category === filters.category) &&
    (filters.lifecycle === "all" ||
      document.lifecycle.state === filters.lifecycle) &&
    (filters.review === "all" || document.reviewAttention === filters.review) &&
    (filters.duplicate === "all" ||
      (filters.duplicate === "has_duplicate"
        ? document.duplicateWarning
        : !document.duplicateWarning)) &&
    (filters.integrity === "all" ||
      (filters.integrity === "healthy"
        ? document.integrity?.healthy === true
        : document.integrity?.healthy === false)) &&
    (filters.uploader === "all" ||
      document.uploaderScope === filters.uploader) &&
    (filters.milestone === "all" ||
      allocationMilestones.includes(filters.milestone)) &&
    (filters.submilestone === "all" ||
      document.allocations.some(
        (allocation) =>
          String(allocation.buildSubmilestoneId) === filters.submilestone
      ))
  );
}

function groupDocumentsByMilestone(
  documents: CostDocumentSummary[],
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const groups = new Map<string, MilestoneGroup>();
  for (const document of documents) {
    const keys = new Set(
      document.allocations.map((allocation) =>
        milestoneForAllocation(allocation, submilestones)
      )
    );
    for (const key of keys) {
      const group = groups.get(key) || {
        key,
        label: milestoneLabel(key),
        labour: [],
        materials: [],
      };
      group[document.category].push(document);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "en-CA")
  );
}

function uniqueMilestoneOptions(
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const values = new Set<string>();
  for (const submilestone of submilestones) {
    values.add(submilestone.milestoneKey || submilestone.label.split(" · ")[0]);
  }
  return [...values]
    .sort((left, right) => left.localeCompare(right, "en-CA"))
    .map((value) => [value, milestoneLabel(value)] as [string, string]);
}

function milestoneForAllocation(
  allocation: CostDocumentSummary["allocations"][number],
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const matchingSubmilestone = submilestones.find(
    (item) => item.id === allocation.buildSubmilestoneId
  );
  return (
    matchingSubmilestone?.milestoneKey ||
    matchingSubmilestone?.label.split(" · ")[0] ||
    allocation.submilestoneKey ||
    "unmapped-roadmap"
  );
}

function milestoneLabel(value: string) {
  return value === "unmapped-roadmap"
    ? "Unmapped roadmap allocation"
    : titleCase(value);
}

function updateFilters<Key extends keyof Filters>(
  setFilters: (update: (current: Filters) => Filters) => void,
  key: Key,
  value: Filters[Key]
) {
  setFilters((current) => ({ ...current, [key]: value }));
}

function reviewBadgeVariant(
  review:
    | NonNullable<CostDocumentSummary["reviewAttention"]>
    | CostDocumentReview["outcome"]
) {
  if (review === "needs_correction") {
    return "warning" as const;
  }
  if (review === "reviewed" || review === "accepted") {
    return "success" as const;
  }
  return "outline" as const;
}

function reviewAttentionLabel(
  review:
    | NonNullable<CostDocumentSummary["reviewAttention"]>
    | CostDocumentReview["outcome"]
) {
  if (review === "needs_correction") {
    return "Needs correction";
  }
  if (review === "partially_reviewed") {
    return "Partially reviewed";
  }
  if (review === "reviewed") {
    return "Reviewed";
  }
  if (review === "accepted") {
    return "Accepted";
  }
  return "Unreviewed";
}

function isPreviewable(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-CA"));
}

function shortHash(value: string) {
  return value.length > 16 ? `${value.slice(0, 12)}…${value.slice(-4)}` : value;
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function messageForCostDocumentAction(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "This Cost Document action is unavailable.";
}

// biome-ignore lint/style/useReactFunctionComponents: React error boundaries require a class component.
class RoadmapReconciliationBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Frame>
          <FramePanel className="space-y-3">
            <Alert variant="error">
              <AlertTriangle />
              <AlertTitle>Roadmap reconciliation unavailable</AlertTitle>
              <AlertDescription>
                The authorized Cost Document ledger could not be loaded. No
                financial, payment, completion, reimbursement, Draw, or approval
                state was changed.
              </AlertDescription>
            </Alert>
            <Button
              onClick={this.props.onRetry}
              type="button"
              variant="outline"
            >
              Retry
            </Button>
          </FramePanel>
        </Frame>
      );
    }
    return this.props.children;
  }
}
