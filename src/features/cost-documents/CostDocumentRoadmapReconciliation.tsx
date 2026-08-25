"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Filter,
  Hammer,
  Package,
  Search,
} from "lucide-react";
import { Component, type ReactNode, useEffect, useMemo, useState } from "react";

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
import { Progress } from "#/components/ui/progress.tsx";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CostDocumentDetailSheet } from "./CostDocumentRoadmapReconciliationDetailParts.tsx";
import {
  CostDocumentLane,
  EmptyLedger,
  FilterSelect,
  SubmilestoneReconciliationSection,
} from "./CostDocumentRoadmapReconciliationLedgerParts.tsx";
import type {
  CostDocumentReview,
  Filters,
} from "./CostDocumentRoadmapReconciliationModel.ts";
import {
  claimedWithoutReceiptCents,
  documentationCoveragePercent,
  formatCoverage,
  groupDocumentsByMilestone,
  groupDocumentsBySubmilestone,
  INITIAL_FILTERS,
  matchesFilters,
  milestoneContextForKey,
  milestoneLabel,
  uniqueMilestoneOptions,
  updateFilters,
} from "./CostDocumentRoadmapReconciliationModel.ts";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";
import { formatCad } from "./SingleCostDocumentCapture.tsx";

// biome-ignore lint/performance/noBarrelFile: Preserve the established public detail exports from the roadmap facade.
export {
  CostDocumentDetail,
  CostDocumentDetailSheet,
} from "./CostDocumentRoadmapReconciliationDetailParts.tsx";

export interface CostDocumentSummary {
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
  financialComponents?: Array<{
    amountCents: number;
    kind: "subtotal" | "tax" | "fee" | "discount";
    label?: string;
    order: number;
  }>;
  grossTotalCents: number;
  integrity?: { healthy: boolean; openExceptionKinds: string[] };
  kind: "invoice" | "receipt";
  lifecycle: { state: "current" | "superseded" | "voided" };
  pages: Array<{
    assetId: Id<"buildCollaborationAssets">;
    contentHashSha256: string;
    fileName: string;
    mimeType: string;
    order: number;
  }>;
  reviewAttention?:
    | "needs_correction"
    | "partially_reviewed"
    | "reviewed"
    | "unreviewed";
  state: "submitted";
  submittedAt: number;
  title: string;
  uploaderScope: "other" | "self";
  vendor?: {
    displayName: string;
    partyType: "contractor" | "supplier" | "vendor";
    profileId?: Id<"contractorProfiles">;
    resolution: "linked" | "unresolved_legacy";
  };
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

export type CostDocumentInteractionMode =
  | "brokerage-review"
  | "read-only"
  | "standard";

export type CostDocumentActorCapacity =
  | "admin"
  | "principle-broker"
  | "broker"
  | "broker-staff"
  | "builder"
  | "builder-staff"
  | "homeowner"
  | "contractor";

export interface CostDocumentRoadmapReconciliationProps {
  /**
   * Pins Cost API calls and private source retrieval to the capacity selected
   * by this Build-local surface. Authorization remains server-enforced.
   */
  actorCapacity?: CostDocumentActorCapacity;
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This coordinator keeps pagination, filters, role redaction, and the two approved roadmap modes together.
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<"milestones" | "documents">("milestones");
  const [search, setSearch] = useState("");
  const [selectedMilestoneKey, setSelectedMilestoneKey] = useState<string>();
  const { loadMore, results, status } = usePaginatedQuery(
    api.cost_documents.listCostDocumentRoadmapReconciliation,
    { buildId, organizationId, ...actorCapacityInput } as never,
    { initialNumItems: 5 }
  );
  useEffect(() => {
    if (status === "CanLoadMore") {
      loadMore(5);
    }
  }, [loadMore, status]);
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
  useEffect(() => {
    if (status !== "Exhausted") {
      return;
    }
    const firstMilestone = milestoneOptions[0]?.[0];
    if (
      selectedMilestoneKey &&
      milestoneOptions.some(([key]) => key === selectedMilestoneKey)
    ) {
      return;
    }
    setSelectedMilestoneKey(firstMilestone);
  }, [milestoneOptions, selectedMilestoneKey, status]);
  const activeMilestoneKey =
    selectedMilestoneKey ?? milestoneOptions[0]?.[0] ?? "";
  const selectedSubmilestoneGroups = useMemo(
    () =>
      groupDocumentsBySubmilestone(
        visibleDocuments,
        submilestones,
        activeMilestoneKey
      ),
    [activeMilestoneKey, submilestones, visibleDocuments]
  );
  const selectedMaterialTotal = selectedSubmilestoneGroups.reduce(
    (total, group) => total + group.materialsInvoicedCents,
    0
  );
  const selectedLabourTotal = selectedSubmilestoneGroups.reduce(
    (total, group) => total + group.labourInvoicedCents,
    0
  );
  const selectedTotal = selectedMaterialTotal + selectedLabourTotal;
  const selectedMilestone = milestoneContextForKey(
    submilestones,
    activeMilestoneKey
  );
  const selectedMilestoneBudget = selectedMilestone?.budgetCents ?? 0;
  const selectedMilestoneIsActual = selectedMilestone?.usesActualCost ?? false;
  const coverage = documentationCoveragePercent(
    selectedTotal,
    selectedMilestoneBudget
  );
  const coverageLabel = formatCoverage(coverage);
  const selectedClaimedWithoutReceiptCents = claimedWithoutReceiptCents(
    selectedTotal,
    selectedMilestoneBudget
  );
  const selectedMaterialsCoverage = documentationCoveragePercent(
    selectedMaterialTotal,
    selectedMilestoneBudget
  );
  const selectedLabourCoverage = documentationCoveragePercent(
    selectedLabourTotal,
    selectedMilestoneBudget
  );
  const roadmapMilestones = milestoneOptions.map(([key, label], index) => {
    const group = groups.find((item) => item.key === key);
    const submilestoneGroups = groupDocumentsBySubmilestone(
      visibleDocuments,
      submilestones,
      key
    );
    const materialGross = submilestoneGroups.reduce(
      (total, item) => total + item.materialsInvoicedCents,
      0
    );
    const labourGross = submilestoneGroups.reduce(
      (total, item) => total + item.labourInvoicedCents,
      0
    );
    const documentedGross = materialGross + labourGross;
    const context = milestoneContextForKey(submilestones, key);
    const targetCents = context?.budgetCents ?? 0;
    return {
      claimedWithoutReceiptCents: claimedWithoutReceiptCents(
        documentedGross,
        targetCents
      ),
      coverage: documentationCoveragePercent(documentedGross, targetCents),
      group,
      key,
      label,
      labourGross,
      materialGross,
      number: index + 1,
      targetCents,
      usesActualCost: context?.usesActualCost ?? false,
    };
  });

  return (
    <div
      className="space-y-4"
      data-testid="cost-document-roadmap-reconciliation"
    >
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 gap-1">
            <Button
              aria-pressed={mode === "milestones"}
              onClick={() => setMode("milestones")}
              size="sm"
              variant={mode === "milestones" ? "default" : "outline"}
            >
              By milestone
            </Button>
            <Button
              aria-pressed={mode === "documents"}
              onClick={() => setMode("documents")}
              size="sm"
              variant={mode === "documents" ? "default" : "outline"}
            >
              All documents
            </Button>
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-9"
              id="cost-document-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search records, vendors, or people"
              value={search}
            />
          </div>
          <Button
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
            size="sm"
            variant="outline"
          >
            <Filter /> Filters
          </Button>
        </FramePanel>
      </Frame>

      {filtersOpen ? (
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
              <FieldLabel htmlFor="cost-document-search-filters">
                Search Cost Documents
              </FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="ps-9"
                  id="cost-document-search-filters"
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
              onChange={(value) =>
                updateFilters(setFilters, "milestone", value)
              }
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
                ...submilestones.map((item): [string, string] => [
                  String(item.id),
                  item.label,
                ]),
              ]}
              value={filters.submilestone}
            />
          </FramePanel>
        </Frame>
      ) : null}

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
        ) : mode === "documents" ? (
          <Frame>
            <FrameHeader>
              <FrameTitle>All documents</FrameTitle>
              <FrameDescription>
                Every authorized record in the immutable Cost Document set.
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="grid min-w-0 gap-4 lg:grid-cols-2">
              <CostDocumentLane
                category="materials"
                documents={visibleDocuments.filter(
                  (document) => document.category === "materials"
                )}
                onOpenCostDocument={onOpenCostDocument}
                showInternalSignals={interactionMode !== "read-only"}
                submilestones={submilestones}
              />
              <CostDocumentLane
                category="labour"
                documents={visibleDocuments.filter(
                  (document) => document.category === "labour"
                )}
                onOpenCostDocument={onOpenCostDocument}
                showInternalSignals={interactionMode !== "read-only"}
                submilestones={submilestones}
              />
            </FramePanel>
          </Frame>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
            <Frame className="h-fit min-w-0 overflow-hidden">
              <FrameHeader>
                <FrameTitle>Construction roadmap</FrameTitle>
                <FrameDescription>
                  Submitted gross is deduplicated by canonical document.
                </FrameDescription>
              </FrameHeader>
              <FramePanel className="grid min-w-0 gap-1 overflow-hidden p-1.5">
                {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Each roadmap row renders its budget, coverage, and residual-cost state together. */}
                {roadmapMilestones.map((milestone) => {
                  const active = milestone.key === activeMilestoneKey;
                  const residualLabel = milestone.usesActualCost
                    ? "without receipt"
                    : "undocumented";
                  return (
                    <Button
                      className="h-auto min-h-20 w-full min-w-0 max-w-full shrink justify-start gap-2 overflow-hidden whitespace-normal px-2.5 py-2 text-left focus-visible:ring-offset-0 sm:h-auto sm:gap-2.5"
                      data-testid={`roadmap-milestone-${milestone.key}`}
                      key={milestone.key}
                      onClick={() => setSelectedMilestoneKey(milestone.key)}
                      variant={active ? "secondary" : "ghost"}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-background font-semibold text-xs">
                        {active ? <Check /> : milestone.number}
                      </span>
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <span className="block truncate font-medium">
                          {milestone.label}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <Package className="size-3" />
                            {formatCad(milestone.materialGross)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Hammer className="size-3" />
                            {formatCad(milestone.labourGross)}
                          </span>
                        </span>
                        {milestone.targetCents ? (
                          <span className="mt-1.5 grid min-w-0 gap-1">
                            <span className="flex min-w-0 items-center justify-between gap-2 text-muted-foreground text-xs">
                              <span className="truncate">Documented</span>
                              <span className="shrink-0 tabular-nums">
                                {formatCoverage(milestone.coverage)}
                              </span>
                            </span>
                            <Progress
                              aria-label={`${milestone.label} documentation coverage`}
                              className="gap-0"
                              value={milestone.coverage}
                            />
                            {milestone.claimedWithoutReceiptCents > 0 ? (
                              <span className="block truncate text-muted-foreground text-xs tabular-nums">
                                {formatCad(
                                  milestone.claimedWithoutReceiptCents
                                )}{" "}
                                {residualLabel}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="mt-1.5 block text-muted-foreground text-xs">
                            Coverage unavailable
                          </span>
                        )}
                      </span>
                      <ChevronRight className="size-4 shrink-0" />
                    </Button>
                  );
                })}
              </FramePanel>
            </Frame>

            <div className="grid min-w-0 gap-4">
              <Frame>
                <FramePanel className="grid gap-5 p-4 sm:p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div>
                      <Badge variant="outline">
                        Days {selectedMilestone?.dayStart ?? "—"}–
                        {selectedMilestone?.dayEnd ?? "—"}
                      </Badge>
                      <h3 className="mt-2 font-semibold text-xl">
                        {selectedMilestone?.label ??
                          milestoneLabel(activeMilestoneKey, submilestones)}
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
                        {formatCad(selectedTotal)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {selectedMilestoneBudget
                          ? `of ${formatCad(selectedMilestoneBudget)} ${selectedMilestoneIsActual ? "actual cost" : "planned budget"}`
                          : "Planned budget not supplied"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2">
                    <Card className="rounded-r-none bg-sky-500/8">
                      <CardPanel className="p-3">
                        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Package className="size-3.5" /> Materials
                        </p>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                          <p className="font-semibold text-lg tabular-nums">
                            {formatCad(selectedMaterialTotal)}
                          </p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {selectedMilestoneBudget
                              ? formatCoverage(selectedMaterialsCoverage)
                              : "—"}
                          </p>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Documentation coverage
                        </p>
                      </CardPanel>
                    </Card>
                    <Card className="rounded-l-none bg-amber-500/10">
                      <CardPanel className="p-3">
                        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Hammer className="size-3.5" /> Labour
                        </p>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                          <p className="font-semibold text-lg tabular-nums">
                            {formatCad(selectedLabourTotal)}
                          </p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {selectedMilestoneBudget
                              ? formatCoverage(selectedLabourCoverage)
                              : "—"}
                          </p>
                        </div>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Documentation coverage
                        </p>
                      </CardPanel>
                    </Card>
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between text-xs">
                      <span>Documentation coverage</span>
                      <span className="font-medium tabular-nums">
                        {selectedMilestoneBudget ? coverageLabel : "—"}
                      </span>
                    </div>
                    <Progress
                      aria-label="Documentation coverage"
                      value={coverage}
                    />
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-muted-foreground text-xs">
                      <p>
                        A planning comparison only. Coverage does not
                        communicate completion or eligibility.
                      </p>
                      {selectedMilestoneBudget ? (
                        <p className="tabular-nums">
                          {selectedClaimedWithoutReceiptCents > 0
                            ? `${formatCad(selectedClaimedWithoutReceiptCents)} ${
                                selectedMilestoneIsActual
                                  ? "claimed without receipt"
                                  : "undocumented vs budget"
                              }`
                            : selectedMilestoneIsActual
                              ? "Fully documented vs actual cost"
                              : "Fully documented vs budget"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </FramePanel>
              </Frame>

              <div className="grid min-w-0 gap-4">
                {selectedSubmilestoneGroups.length === 0 ? (
                  <EmptyLedger
                    description="Sub-milestones for this Milestone will appear here once the Construction Roadmap includes them."
                    title="No Sub-milestones on this Milestone"
                  />
                ) : (
                  selectedSubmilestoneGroups.map((group) => (
                    <SubmilestoneReconciliationSection
                      group={group}
                      key={String(group.id)}
                      onOpenCostDocument={onOpenCostDocument}
                      showInternalSignals={interactionMode !== "read-only"}
                      submilestones={submilestones}
                    />
                  ))
                )}
              </div>
            </div>
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
