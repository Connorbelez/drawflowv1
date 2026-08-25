"use client";

import { ChevronRight, FileText, Hammer, Package } from "lucide-react";
import { Badge } from "#/components/ui/badge.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import type { CostDocumentSummary } from "./CostDocumentRoadmapReconciliation.tsx";
import type {
  SubmilestoneDocumentEntry,
  SubmilestoneGroup,
} from "./CostDocumentRoadmapReconciliationModel.ts";
import {
  allocationLabel,
  claimedWithoutReceiptCents,
  displayCostDocumentVendor,
  documentationCoveragePercent,
  formatCoverage,
  reviewAttentionLabel,
  reviewBadgeVariant,
  titleCase,
} from "./CostDocumentRoadmapReconciliationModel.ts";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";
import { formatCad } from "./SingleCostDocumentCapture.tsx";

export function FilterSelect({
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

export function EmptyLedger({
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

export function SubmilestoneReconciliationSection({
  group,
  onOpenCostDocument,
  showInternalSignals,
  submilestones,
}: {
  group: SubmilestoneGroup;
  onOpenCostDocument: (costDocumentId: string) => void;
  showInternalSignals: boolean;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  const invoicedTotal =
    group.materialsInvoicedCents + group.labourInvoicedCents;
  const coverage = documentationCoveragePercent(
    invoicedTotal,
    group.budgetCents
  );
  const withoutReceiptCents = claimedWithoutReceiptCents(
    invoicedTotal,
    group.budgetCents
  );
  const recordCount = group.materials.length + group.labour.length;
  const budgetLabel = group.usesActualCost ? "actual cost" : "planned budget";
  const budgetSummary = group.budgetCents
    ? ` of ${formatCad(group.budgetCents)} ${budgetLabel}`
    : " · Budget not supplied";
  const recordSummary = `${recordCount} record${recordCount === 1 ? "" : "s"} · ${formatCad(invoicedTotal)} invoiced${budgetSummary}`;

  return (
    <Frame data-testid={`roadmap-submilestone-${String(group.id)}`}>
      <FrameHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <FrameTitle>{group.name}</FrameTitle>
          <FrameDescription>{recordSummary}</FrameDescription>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">
            Documentation coverage
          </p>
          <p className="font-semibold tabular-nums">
            {group.budgetCents ? formatCoverage(coverage) : "—"}
          </p>
          {group.budgetCents ? (
            <p className="mt-1 text-muted-foreground text-xs tabular-nums">
              {withoutReceiptCents > 0
                ? `${formatCad(withoutReceiptCents)} ${
                    group.usesActualCost ? "without receipt" : "undocumented"
                  }`
                : group.usesActualCost
                  ? "Fully documented"
                  : "Fully documented vs budget"}
            </p>
          ) : null}
        </div>
      </FrameHeader>
      <FramePanel className="grid min-w-0 gap-3 p-2 xl:grid-cols-2">
        <SubmilestoneCategoryLane
          category="materials"
          entries={group.materials}
          focusBuildSubmilestoneId={group.id}
          invoicedCents={group.materialsInvoicedCents}
          onOpenCostDocument={onOpenCostDocument}
          showInternalSignals={showInternalSignals}
          submilestones={submilestones}
        />
        <SubmilestoneCategoryLane
          category="labour"
          entries={group.labour}
          focusBuildSubmilestoneId={group.id}
          invoicedCents={group.labourInvoicedCents}
          onOpenCostDocument={onOpenCostDocument}
          showInternalSignals={showInternalSignals}
          submilestones={submilestones}
        />
      </FramePanel>
    </Frame>
  );
}

function SubmilestoneCategoryLane({
  category,
  entries,
  focusBuildSubmilestoneId,
  invoicedCents,
  onOpenCostDocument,
  showInternalSignals,
  submilestones,
}: {
  category: "labour" | "materials";
  entries: SubmilestoneDocumentEntry[];
  focusBuildSubmilestoneId: Id<"buildSubmilestones">;
  invoicedCents: number;
  onOpenCostDocument: (costDocumentId: string) => void;
  showInternalSignals: boolean;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  const title = category === "materials" ? "Materials" : "Labour";
  return (
    <Frame
      aria-label={`${title} for this Sub-milestone`}
      className={category === "materials" ? "bg-sky-500/8" : "bg-amber-500/10"}
    >
      <FrameHeader>
        <div>
          <FrameTitle className="flex items-center gap-2 text-sm">
            {category === "materials" ? (
              <Package className="size-3.5" />
            ) : (
              <Hammer className="size-3.5" />
            )}
            {title}
          </FrameTitle>
          <FrameDescription className="tabular-nums">
            {entries.length} record{entries.length === 1 ? "" : "s"} ·{" "}
            {formatCad(invoicedCents)} invoiced
          </FrameDescription>
        </div>
      </FrameHeader>
      <FramePanel className="space-y-2 p-2">
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No {title.toLocaleLowerCase("en-CA")} records assigned to this
            Sub-milestone.
          </p>
        ) : (
          entries.map((entry) => (
            <CostDocumentCard
              document={entry.document}
              focusAllocationAmountCents={entry.allocationAmountCents}
              focusBuildSubmilestoneId={focusBuildSubmilestoneId}
              key={`${entry.document._id}:${String(focusBuildSubmilestoneId)}`}
              onOpen={() => onOpenCostDocument(String(entry.document._id))}
              showInternalSignals={showInternalSignals}
              submilestones={submilestones}
            />
          ))
        )}
      </FramePanel>
    </Frame>
  );
}

export function CostDocumentLane({
  category,
  documents,
  onOpenCostDocument,
  showInternalSignals,
  submilestones,
}: {
  category: "labour" | "materials";
  documents: CostDocumentSummary[];
  onOpenCostDocument: (costDocumentId: string) => void;
  showInternalSignals: boolean;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  const title = category === "materials" ? "Materials" : "Labour";
  const submittedGross = documents.reduce(
    (total, document) =>
      document.lifecycle.state === "current"
        ? total + document.grossTotalCents
        : total,
    0
  );
  return (
    <Frame
      aria-label={`${title} Cost Documents`}
      className={category === "materials" ? "bg-sky-500/8" : "bg-amber-500/10"}
    >
      <FrameHeader className="flex-row items-start justify-between gap-3">
        <div>
          <FrameTitle className="flex items-center gap-2">
            {category === "materials" ? (
              <Package className="size-4" />
            ) : (
              <Hammer className="size-4" />
            )}
            {title} documents
          </FrameTitle>
          <FrameDescription>
            {documents.length} record{documents.length === 1 ? "" : "s"} ·{" "}
            {formatCad(submittedGross)} submitted gross
          </FrameDescription>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Submitted gross</p>
          <p className="font-semibold text-sm tabular-nums">
            {formatCad(submittedGross)}
          </p>
        </div>
      </FrameHeader>
      <FramePanel className="space-y-2 p-2">
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
              submilestones={submilestones}
            />
          ))
        )}
      </FramePanel>
    </Frame>
  );
}

function CostDocumentCard({
  document,
  focusAllocationAmountCents,
  focusBuildSubmilestoneId,
  onOpen,
  showInternalSignals,
  submilestones,
}: {
  document: CostDocumentSummary;
  focusAllocationAmountCents?: number;
  focusBuildSubmilestoneId?: Id<"buildSubmilestones">;
  onOpen: () => void;
  showInternalSignals: boolean;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  const displayAmountCents =
    focusAllocationAmountCents ?? document.grossTotalCents;
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
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge
                size="sm"
                variant={
                  document.lifecycle.state === "current"
                    ? "secondary"
                    : "warning"
                }
              >
                {titleCase(document.lifecycle.state)}
              </Badge>
              <Badge size="sm" variant="outline">
                {titleCase(document.kind)}
              </Badge>
            </div>
            <p className="truncate font-semibold">{document.title}</p>
            <p className="text-muted-foreground text-sm">
              {displayCostDocumentVendor(document)} · {document.documentDate}
            </p>
            {document.vendor?.resolution === "unresolved_legacy" ? (
              <Badge size="sm" variant="warning">
                Unresolved vendor
              </Badge>
            ) : null}
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">
              {formatCad(displayAmountCents)}
            </p>
            {focusAllocationAmountCents !== undefined &&
            focusAllocationAmountCents !== document.grossTotalCents ? (
              <p className="text-muted-foreground text-xs tabular-nums">
                {`of ${formatCad(document.grossTotalCents)} document`}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
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
        <div className="space-y-2 text-muted-foreground text-xs">
          <p>Assigned Sub-milestones</p>
          <div className="flex flex-wrap gap-1.5">
            {document.allocations.map((allocation) => {
              const focused =
                focusBuildSubmilestoneId !== undefined &&
                allocation.buildSubmilestoneId === focusBuildSubmilestoneId;
              return (
                <Badge
                  key={`${allocation.buildSubmilestoneId}:${allocation.order}`}
                  variant={focused ? "default" : "secondary"}
                >
                  <span>{allocationLabel(allocation, submilestones)}</span>
                  <span> · {formatCad(allocation.amountCents)}</span>
                </Badge>
              );
            })}
          </div>
          <p>
            {document.uploaderScope === "self"
              ? "Uploaded by you"
              : "Uploaded by another authorized participant"}
          </p>
        </div>
      </CardPanel>
      <div className="flex items-center justify-end gap-1 border-t px-3.5 py-3 text-muted-foreground text-xs">
        View full record <ChevronRight className="size-3.5" />
      </div>
    </Card>
  );
}
