"use client";

import { FileText, Plus, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  BatchDraft,
  DraftEditor,
} from "./CostDocumentBatchWorkspaceModel.ts";
import {
  balancePreview,
  financialInputPatch,
  financialInputValue,
} from "./CostDocumentBatchWorkspaceModel.ts";
import type { CostDocumentActorCapacity } from "./CostDocumentRoadmapReconciliation.tsx";
import { CostDocumentVendorAutocomplete } from "./CostDocumentVendorAutocomplete.tsx";
import {
  type CostDocumentSubmilestoneOption,
  formatCad,
} from "./SingleCostDocumentCapture.tsx";

export function CaptureConfirmStep({
  actorCapacity,
  buildId,
  editor,
  onEditorChange,
  organizationId,
}: {
  actorCapacity?: CostDocumentActorCapacity;
  buildId: Id<"activeBuilds">;
  editor: DraftEditor;
  onEditorChange: (patch: Partial<DraftEditor>) => void;
  organizationId: string;
}) {
  return (
    <div className="space-y-5">
      <section
        aria-label="Document facts"
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h3 className="font-semibold">Confirm document facts</h3>
          <p className="text-muted-foreground text-sm">
            Extracted values are suggestions until you confirm them.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="cost-document-batch-title">Title</FieldLabel>
          <Input
            id="cost-document-batch-title"
            onChange={(event) =>
              onEditorChange({ title: event.currentTarget.value })
            }
            required
            value={editor.title}
          />
        </Field>
        <CostDocumentVendorAutocomplete
          actorCapacity={actorCapacity}
          buildId={buildId}
          legacyVendorName={editor.vendorName}
          onValueChange={({ displayName, profileId }) =>
            onEditorChange({
              vendorName: displayName,
              vendorProfileId: profileId ? String(profileId) : undefined,
            })
          }
          organizationId={organizationId}
          value={editor.vendorProfileId as Id<"contractorProfiles"> | undefined}
        />
        <Field>
          <FieldLabel htmlFor="cost-document-batch-date">
            Document date
          </FieldLabel>
          <Input
            id="cost-document-batch-date"
            onChange={(event) =>
              onEditorChange({ documentDate: event.currentTarget.value })
            }
            required
            type="date"
            value={editor.documentDate}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="cost-document-batch-description">
            Description
          </FieldLabel>
          <Textarea
            id="cost-document-batch-description"
            onChange={(event) =>
              onEditorChange({ description: event.currentTarget.value })
            }
            value={editor.description}
          />
        </Field>
      </section>
    </div>
  );
}

export function BalanceAllocateStep({
  balance,
  editor,
  onAddAllocation,
  onEditorChange,
  onRemoveAllocation,
  submilestones,
}: {
  balance: ReturnType<typeof balancePreview>;
  editor: DraftEditor;
  onAddAllocation: () => void;
  onEditorChange: (patch: Partial<DraftEditor>) => void;
  onRemoveAllocation: (rowId: string) => void;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  const subtotal = financialInputValue(editor, "subtotal");
  const tax = financialInputValue(editor, "tax");
  const updateFinancialInput = (kind: "subtotal" | "tax", value: string) =>
    onEditorChange(financialInputPatch(editor, kind, value));
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="cost-document-reconciliation-heading"
        className="space-y-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3
              className="font-semibold"
              id="cost-document-reconciliation-heading"
            >
              Full reconciliation
            </h3>
            <p className="text-muted-foreground text-sm">
              Subtotal, optional tax, and every Cost Allocation must reconcile
              in exact integer cents before this document can move forward.
            </p>
          </div>
          <Badge variant="outline">CAD</Badge>
        </div>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cost-document-batch-subtotal">
              Subtotal (CAD)
            </FieldLabel>
            <Input
              className="h-14 font-semibold text-xl tabular-nums"
              id="cost-document-batch-subtotal"
              inputMode="decimal"
              onChange={(event) =>
                updateFinancialInput("subtotal", event.currentTarget.value)
              }
              placeholder="0.00"
              required
              value={subtotal}
            />
            <FieldDescription>Required before allocation.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cost-document-batch-tax">Tax (CAD)</FieldLabel>
            <Input
              className="h-14 font-semibold text-xl tabular-nums"
              id="cost-document-batch-tax"
              inputMode="decimal"
              onChange={(event) =>
                updateFinancialInput("tax", event.currentTarget.value)
              }
              placeholder="0.00"
              value={tax}
            />
            <FieldDescription>
              Leave blank when no tax applies.
            </FieldDescription>
          </Field>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs">Document total</dt>
            <dd className="font-semibold tabular-nums">{balance.grossLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Allocated</dt>
            <dd className="font-semibold tabular-nums">
              {formatCad(balance.allocatedCents)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Remaining</dt>
            <dd className="font-semibold tabular-nums">
              {balance.remainingLabel}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="cost-document-allocations-heading"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3
              className="font-semibold"
              id="cost-document-allocations-heading"
            >
              Cost Allocations
            </h3>
            <p className="text-muted-foreground text-sm">
              Allocate the exact total across one or more Build Sub-milestones.
            </p>
          </div>
          <Button onClick={onAddAllocation} size="sm" variant="outline">
            <Plus /> Add allocation
          </Button>
        </div>
        <div className="grid gap-3">
          {editor.allocations.map((allocation, index) => (
            <Frame
              data-testid={`allocation-${allocation.id}`}
              key={allocation.id}
            >
              <FramePanel className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                <Field>
                  <FieldLabel
                    htmlFor={`cost-allocation-submilestone-${allocation.id}`}
                  >
                    Cost allocation {index + 1} Sub-milestone
                  </FieldLabel>
                  <select
                    className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
                    id={`cost-allocation-submilestone-${allocation.id}`}
                    onChange={(event) =>
                      onEditorChange({
                        allocations: editor.allocations.map((row) =>
                          row.id === allocation.id
                            ? {
                                ...row,
                                buildSubmilestoneId: event.currentTarget.value,
                              }
                            : row
                        ),
                      })
                    }
                    value={allocation.buildSubmilestoneId}
                  >
                    <option value="">Choose a Sub-milestone</option>
                    {submilestones.map((submilestone) => (
                      <option key={submilestone.id} value={submilestone.id}>
                        {submilestone.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor={`cost-allocation-amount-${allocation.id}`}
                  >
                    Cost allocation {index + 1} amount (CAD)
                  </FieldLabel>
                  <Input
                    id={`cost-allocation-amount-${allocation.id}`}
                    inputMode="decimal"
                    onChange={(event) =>
                      onEditorChange({
                        allocations: editor.allocations.map((row) =>
                          row.id === allocation.id
                            ? { ...row, amount: event.currentTarget.value }
                            : row
                        ),
                      })
                    }
                    placeholder="0.00"
                    value={allocation.amount}
                  />
                </Field>
                <Button
                  aria-label={`Remove allocation ${index + 1}`}
                  disabled={editor.allocations.length === 1}
                  onClick={() => onRemoveAllocation(allocation.id)}
                  size="sm"
                  variant="outline"
                >
                  Remove
                </Button>
              </FramePanel>
            </Frame>
          ))}
        </div>
      </section>
    </div>
  );
}

export function FreezeManifestStep({
  draft,
  editor,
  isComplete,
}: {
  draft: BatchDraft;
  editor: DraftEditor;
  isComplete: boolean;
}) {
  const balance = balancePreview(editor);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold">Freeze manifest</h3>
        <p className="text-muted-foreground text-sm">
          Review the source pages, facts, allocations, and reconciliation that
          will be validated before this Cost Document can complete.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-xs">Title</dt>
          <dd className="font-medium text-sm">{editor.title || "Required"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Vendor</dt>
          <dd className="font-medium text-sm">
            {editor.vendorName || "Required"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Document date</dt>
          <dd className="font-medium text-sm">
            {editor.documentDate || "Required"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Gross total</dt>
          <dd className="font-medium text-sm tabular-nums">
            {balance.grossLabel}
          </dd>
        </div>
      </dl>
      <Frame>
        <FrameHeader>
          <FrameTitle>Source pages</FrameTitle>
        </FrameHeader>
        <FramePanel className="p-3">
          {draft.pages.length > 0 ? (
            <ol className="divide-y">
              {draft.pages.map((page) => (
                <li
                  className="flex min-w-0 items-center gap-3 py-2"
                  key={page.assetId}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {page.order}. {page.fileName || "Verified source page"}
                  </span>
                  <Badge variant="outline">
                    {page.contentHashSha256 ? "Verified" : "Saved"}
                  </Badge>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              Source pages required.
            </p>
          )}
        </FramePanel>
      </Frame>
      <Frame>
        <FrameHeader>
          <FrameTitle>Cost Allocations</FrameTitle>
        </FrameHeader>
        <FramePanel className="p-3">
          <p className="font-semibold text-sm tabular-nums">
            {balance.remainingLabel}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {isComplete
              ? "This document is complete and can be reopened only by its owner."
              : "Complete only when remaining is zero and every manifest field is correct."}
          </p>
        </FramePanel>
      </Frame>
      <Alert>
        <ShieldCheck />
        <AlertTitle>Freeze is validated</AlertTitle>
        <AlertDescription>
          Completion is not submission. The server validates the source record
          again when the batch is atomically submitted.
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function EmptyBatchEditor() {
  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>Add a Cost Document</FrameTitle>
        <FrameDescription>
          Add an Invoice or Receipt from the register to start its independent
          four-step workflow.
        </FrameDescription>
      </FrameHeader>
    </Frame>
  );
}
