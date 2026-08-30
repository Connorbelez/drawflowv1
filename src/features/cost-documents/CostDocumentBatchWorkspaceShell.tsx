"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Progress, ProgressTrack } from "#/components/ui/progress.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import type {
  BatchDraft,
  BatchProjection,
} from "./CostDocumentBatchWorkspaceModel.ts";
import {
  STEPS,
  stepIndex,
  stepLabel,
} from "./CostDocumentBatchWorkspaceModel.ts";
import { formatCad } from "./SingleCostDocumentCapture.tsx";

export function CostDocumentBatchLaunchPanel({
  activeBatch,
  error,
  onResume,
  onStart,
  starting,
}: {
  activeBatch: BatchProjection | null;
  error?: string;
  onResume: () => void;
  onStart: () => void;
  starting: boolean;
}) {
  return (
    <Frame data-testid="cost-document-batch-workspace">
      <FrameHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FrameTitle>Cost Documents</FrameTitle>
              <Badge variant="outline">CAD</Badge>
            </div>
            <FrameDescription>
              Capture Invoice and Receipt source records, reconcile each Cost
              Allocation, then submit the completed batch atomically.
            </FrameDescription>
          </div>
          {activeBatch ? (
            <Badge variant="secondary">Private draft saved</Badge>
          ) : null}
        </div>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-muted-foreground text-sm">
          {activeBatch
            ? `${activeBatch.drafts.length} private draft${activeBatch.drafts.length === 1 ? "" : "s"} can be resumed without creating another batch.`
            : "A Cost Document is supporting cost context only. It does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval."}
        </p>
        {activeBatch ? (
          <Button onClick={onResume}>
            <RefreshCw /> Resume private batch
          </Button>
        ) : (
          <Button loading={starting} onClick={onStart}>
            <Plus /> Start Cost Document batch
          </Button>
        )}
      </FramePanel>
      {error ? (
        <FramePanel>
          <Alert variant="error">
            <AlertTitle>Batch not started</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </FramePanel>
      ) : null}
    </Frame>
  );
}

export function CostDocumentBatchSheet({
  children,
  duplicateOverrideRequired = false,
  exactDraft = false,
  onClose,
  uploadingPages = false,
}: {
  children: React.ReactNode;
  duplicateOverrideRequired?: boolean;
  exactDraft?: boolean;
  onClose: () => void | Promise<void>;
  uploadingPages?: boolean;
}) {
  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          Promise.resolve(onClose()).catch(() => undefined);
        }
      }}
      open
    >
      <SheetPopup
        className="max-sm:h-dvh max-sm:w-screen sm:h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-[96rem]"
        data-testid="cost-document-batch-sheet"
        initialFocus={false}
        showCloseButton={false}
        variant="inset"
      >
        <SheetHeader className="gap-3 border-b pr-4 sm:pr-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Button
                aria-label="Return to Costs workspace"
                onClick={onClose}
                size="icon-sm"
                variant="ghost"
              >
                <ArrowLeft />
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle>
                    {exactDraft ? "Shared Cost Document" : "New Cost Documents"}
                  </SheetTitle>
                  <Badge variant={exactDraft ? "info" : "secondary"}>
                    {exactDraft ? "Exact Draft" : "Private draft"}
                  </Badge>
                </div>
                <SheetDescription className="mt-1">
                  {exactDraft
                    ? "Your access is scoped to this Draft. Sibling Cost Documents and batch submission remain private to its creator."
                    : "Complete each source record independently. The batch publishes only after every document reaches Freeze."}
                </SheetDescription>
              </div>
            </div>
            <Button
              aria-label="Close Cost Document batch"
              onClick={onClose}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs sm:px-6">
          <span className="mr-1 font-medium text-muted-foreground uppercase tracking-[0.16em]">
            State
          </span>
          <Badge variant={uploadingPages ? "outline" : "success"}>
            {uploadingPages ? "Uploading" : "Ready"}
          </Badge>
          {duplicateOverrideRequired ? (
            <Badge variant="warning">
              <AlertTriangle /> Near duplicate
            </Badge>
          ) : null}
          <Badge variant="outline">Guided completion</Badge>
        </div>
        {children}
      </SheetPopup>
    </Sheet>
  );
}

export function CostDocumentRegister({
  activeDraftId,
  addingDraft,
  drafts,
  newCategory,
  newKind,
  onAdd,
  onCategoryChange,
  onKindChange,
  onSelect,
  selectionLocked,
}: {
  activeDraftId: string;
  addingDraft: boolean;
  drafts: BatchDraft[];
  newCategory: CostDocumentCategory;
  newKind: CostDocumentKind;
  onAdd: () => void;
  onCategoryChange: (category: CostDocumentCategory) => void;
  onKindChange: (kind: CostDocumentKind) => void;
  onSelect: (draft: BatchDraft) => void | Promise<void>;
  selectionLocked: boolean;
}) {
  return (
    <Frame
      className="h-fit max-lg:sticky max-lg:top-0 max-lg:z-20 lg:sticky lg:top-0"
      data-testid="cost-document-batch-register"
    >
      <FrameHeader className="gap-1 px-3 py-3 lg:gap-2 lg:px-5 lg:py-5">
        <FrameTitle>Cost documents</FrameTitle>
        <FrameDescription>
          {drafts.length} independent record{drafts.length === 1 ? "" : "s"} in
          this batch
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="space-y-3 p-2 lg:p-3">
        <Button
          aria-label="Add document"
          className="w-full"
          disabled={selectionLocked}
          loading={addingDraft}
          onClick={onAdd}
        >
          <Plus /> Add documents
        </Button>
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <Field className="min-w-0">
            <FieldLabel className="text-xs" htmlFor="new-cost-document-kind">
              New kind
            </FieldLabel>
            <select
              className="min-h-9 rounded-lg border border-input bg-background px-2 text-xs"
              disabled={selectionLocked}
              id="new-cost-document-kind"
              onChange={(event) =>
                onKindChange(event.target.value as CostDocumentKind)
              }
              value={newKind}
            >
              <option value="invoice">Invoice</option>
              <option value="receipt">Receipt</option>
            </select>
          </Field>
          <Field className="min-w-0">
            <FieldLabel
              className="text-xs"
              htmlFor="new-cost-document-category"
            >
              New category
            </FieldLabel>
            <select
              className="min-h-9 rounded-lg border border-input bg-background px-2 text-xs"
              disabled={selectionLocked}
              id="new-cost-document-category"
              onChange={(event) =>
                onCategoryChange(event.target.value as CostDocumentCategory)
              }
              value={newCategory}
            >
              <option value="materials">Materials</option>
              <option value="labour">Labour</option>
            </select>
          </Field>
        </div>
      </FramePanel>
      <FramePanel className="bg-muted/20 p-2">
        {drafts.length > 0 ? (
          <ul
            aria-label="Cost Document register"
            className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-1 lg:grid lg:overflow-visible"
            data-testid="cost-document-batch-register-rail"
          >
            {drafts.map((draft) => (
              <CostDocumentRegisterCard
                active={String(draft._id) === activeDraftId}
                draft={draft}
                key={draft._id}
                onSelect={onSelect}
                selectionLocked={selectionLocked}
              />
            ))}
          </ul>
        ) : (
          <p className="p-2 text-muted-foreground text-sm">
            Add an Invoice or Receipt to begin the batch.
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

export function CostDocumentRegisterCard({
  active,
  draft,
  onSelect,
  selectionLocked,
}: {
  active: boolean;
  draft: BatchDraft;
  onSelect: (draft: BatchDraft) => void | Promise<void>;
  selectionLocked: boolean;
}) {
  const draftId = String(draft._id);
  const complete = draft.lifecycle === "complete";
  const amount =
    draft.grossTotalCents && draft.grossTotalCents > 0
      ? formatCad(draft.grossTotalCents)
      : "Not set";
  const completion = complete
    ? "Complete at Freeze"
    : `Step ${stepIndex(draft.activeStep) + 1} of ${STEPS.length} · ${stepLabel(draft.activeStep)}`;

  return (
    <li className="w-[min(18rem,calc(100vw-3rem))] shrink-0 lg:w-auto lg:min-w-0">
      <Card
        className={
          active ? "h-full border-primary ring-1 ring-primary/30" : "h-full"
        }
        data-testid={`draft-${draftId}`}
        render={
          <button
            aria-describedby={`draft-progress-${draftId}`}
            aria-pressed={active}
            disabled={selectionLocked}
            onClick={() => {
              Promise.resolve(onSelect(draft)).catch(() => undefined);
            }}
            type="button"
          />
        }
      >
        <CardPanel className="space-y-3 p-3 text-left">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 truncate font-medium text-sm">
              {draft.vendorName?.trim() ||
                draft.title?.trim() ||
                "Untitled Cost Document"}
            </span>
            <span className="shrink-0 font-medium text-xs tabular-nums">
              {amount}
            </span>
          </div>
          {draft.vendorName?.trim() && !draft.vendorProfileId ? (
            <Badge size="sm" variant="warning">
              Unresolved legacy vendor
            </Badge>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {draft.kind === "invoice" ? "Invoice" : "Receipt"} ·{" "}
            {draft.category === "materials" ? "Materials" : "Labour"} ·{" "}
            {draft.pages.length}p
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <RegisterFact
              label="Kind"
              value={draft.kind === "invoice" ? "Invoice" : "Receipt"}
            />
            <RegisterFact
              label="Classification"
              value={draft.category === "materials" ? "Materials" : "Labour"}
            />
            <RegisterFact
              label="Pages"
              value={`${draft.pages.length} page${draft.pages.length === 1 ? "" : "s"}`}
            />
            <RegisterFact className="sr-only" label="Amount" value={amount} />
            <RegisterFact
              className="col-span-2"
              label="Completion"
              value={completion}
            />
          </dl>
          <RegisterDraftProgress
            data-testid={`draft-progress-${draftId}`}
            draft={draft}
          />
        </CardPanel>
      </Card>
    </li>
  );
}

export function RegisterFact({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function RegisterDraftProgress({
  draft,
  ...props
}: { draft: BatchDraft } & Omit<
  React.ComponentProps<typeof Progress>,
  "value"
>) {
  const currentStepIndex = stepIndex(draft.activeStep);
  const complete = draft.lifecycle === "complete";
  const progress = complete
    ? 100
    : ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <Progress
      aria-label={`Progress for ${draft.title?.trim() || "this Cost Document"}`}
      value={progress}
      {...props}
    >
      <ProgressTrack
        className="grid h-2 grid-cols-4 gap-1 rounded-none bg-transparent"
        data-testid={`draft-segments-${draft._id}`}
      >
        {STEPS.map((step, index) => {
          const completeSegment = complete || index < currentStepIndex;
          const activeSegment = !complete && index === currentStepIndex;
          return (
            <span
              aria-hidden="true"
              className={
                completeSegment
                  ? "rounded-sm bg-success"
                  : activeSegment
                    ? "rounded-sm bg-primary"
                    : "rounded-sm bg-input"
              }
              key={step.id}
            />
          );
        })}
      </ProgressTrack>
      <ol className="sr-only" data-testid={`draft-segment-labels-${draft._id}`}>
        {STEPS.map((step, index) => {
          const status =
            complete || index < currentStepIndex
              ? "complete"
              : index === currentStepIndex
                ? "current"
                : "upcoming";
          return (
            <li
              aria-current={status === "current" ? "step" : undefined}
              key={step.id}
            >
              {step.label}: {status}
            </li>
          );
        })}
      </ol>
      <span className="sr-only">
        {complete
          ? "Complete at Freeze"
          : `Step ${currentStepIndex + 1} of ${STEPS.length} · ${stepLabel(draft.activeStep)}`}
      </span>
    </Progress>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The source preview deliberately renders capability-aware upload, fallback, and page-management states in one governed surface.
export function CostDocumentSourcePreview({
  busy,
  draft,
  managePages,
  onAuthorizePage,
  onMoveSavedPage,
  onPendingFilesChange,
  onRemoveSavedPage,
  onReplaceSavedPage,
  onUploadPages,
  pendingFiles,
  uploadingPages,
}: {
  busy: boolean;
  draft: BatchDraft;
  managePages: boolean;
  onAuthorizePage?: (
    assetId: Id<"buildCollaborationAssets">
  ) => Promise<string>;
  onMoveSavedPage: (assetId: string, direction: -1 | 1) => void | Promise<void>;
  onPendingFilesChange: (files: File[]) => void;
  onRemoveSavedPage: (assetId: string) => void | Promise<void>;
  onReplaceSavedPage: (assetId: string, file: File) => void | Promise<void>;
  onUploadPages: () => void;
  pendingFiles: File[];
  uploadingPages: boolean;
}) {
  const pages = [...draft.pages].sort(
    (left, right) => left.order - right.order
  );
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pageUrl, setPageUrl] = useState<string>();
  const [pageError, setPageError] = useState<string>();
  const [loadingPage, setLoadingPage] = useState(false);
  const activePage = pages[activePageIndex];
  const activePageId = activePage ? String(activePage.assetId) : undefined;

  useEffect(() => {
    setActivePageIndex((current) =>
      pages.length === 0 ? 0 : Math.min(current, pages.length - 1)
    );
  }, [pages.length]);

  useEffect(() => {
    let cancelled = false;
    setPageUrl(undefined);
    setPageError(undefined);
    if (!(activePageId && onAuthorizePage)) {
      return;
    }
    setLoadingPage(true);
    onAuthorizePage(activePageId as Id<"buildCollaborationAssets">)
      .then((url) => {
        if (!cancelled) {
          setPageUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPageError(
            "This source page is not available for inline preview. Use the source row to inspect its verified file state."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPage(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activePageId, onAuthorizePage]);

  const mimeType = activePage?.mimeType ?? "";
  const canInlinePreview =
    mimeType === "application/pdf" || mimeType.startsWith("image/");

  return (
    <Frame className="min-w-0 overflow-hidden" data-testid="source-preview">
      <FrameHeader className="gap-2 border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <FrameTitle>Source pages</FrameTitle>
            <FrameDescription>
              {pages.length > 0
                ? `${pages.length} page${pages.length === 1 ? "" : "s"} in this Cost Document`
                : "Add every page for this one Invoice or Receipt."}
            </FrameDescription>
          </div>
          {activePage ? (
            <Badge variant="outline">
              Page {activePageIndex + 1} of {pages.length}
            </Badge>
          ) : null}
        </div>
      </FrameHeader>
      <FramePanel className="space-y-4 p-3 sm:p-4">
        {pages.length > 0 ? (
          <div className="overflow-hidden rounded-xl border bg-muted/20">
            <div className="flex min-h-72 items-center justify-center p-3 sm:min-h-[28rem]">
              {loadingPage ? (
                <p className="text-muted-foreground text-sm">
                  Loading verified source page…
                </p>
              ) : pageUrl && canInlinePreview ? (
                mimeType === "application/pdf" ? (
                  <iframe
                    className="h-[26rem] w-full rounded-lg bg-white sm:h-[32rem]"
                    src={pageUrl}
                    title={activePage?.fileName || "Cost Document source page"}
                  />
                ) : (
                  <img
                    alt={activePage?.fileName || "Cost Document source page"}
                    className="max-h-[32rem] max-w-full rounded-lg object-contain"
                    height={1600}
                    src={pageUrl}
                    width={1200}
                  />
                )
              ) : (
                <div className="max-w-sm space-y-2 text-center">
                  <FileText className="mx-auto size-8 text-muted-foreground" />
                  <p className="font-medium text-sm">
                    {activePage?.fileName || "Verified source page"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {pageError ||
                      "Inline preview is unavailable for this file type."}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <Button
                aria-label="Previous source page"
                disabled={activePageIndex === 0}
                onClick={() =>
                  setActivePageIndex((current) => Math.max(0, current - 1))
                }
                size="icon-sm"
                variant="ghost"
              >
                <ArrowLeft />
              </Button>
              <span className="min-w-0 truncate text-muted-foreground text-xs">
                {activePage?.fileName || "Verified source page"}
              </span>
              <Button
                aria-label="Next source page"
                disabled={activePageIndex >= pages.length - 1}
                onClick={() =>
                  setActivePageIndex((current) =>
                    Math.min(pages.length - 1, current + 1)
                  )
                }
                size="icon-sm"
                variant="ghost"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-muted/20 p-6 text-center">
            <div>
              <FileText className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-medium text-sm">No source pages yet</p>
              <p className="mt-1 max-w-sm text-muted-foreground text-xs">
                Upload every page before this Cost Document can reach Freeze.
              </p>
            </div>
          </div>
        )}

        {managePages ? (
          <div className="space-y-3">
            <Input
              accept="application/pdf,image/*"
              className="sr-only"
              data-testid="page-input"
              disabled={busy || uploadingPages}
              id="cost-document-batch-pages"
              multiple
              onChange={(event) => {
                onPendingFilesChange(
                  Array.from(event.currentTarget.files ?? [])
                );
              }}
              type="file"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || uploadingPages}
                onClick={() =>
                  document.getElementById("cost-document-batch-pages")?.click()
                }
                variant="default"
              >
                <UploadCloud /> Choose files
              </Button>
              <Button
                disabled={busy || uploadingPages}
                onClick={() =>
                  document.getElementById("cost-document-batch-pages")?.click()
                }
                variant="outline"
              >
                <FileText /> Take photo
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Each clean page is bound to this private Draft immediately. Add
              only the remaining pages if an upload is interrupted.
            </p>
            {pendingFiles.length > 0 ? (
              <div className="grid gap-2" data-testid="pending-source-pages">
                {pendingFiles.map((file, index) => (
                  <Card key={`${file.name}:${file.lastModified}`}>
                    <CardPanel className="flex min-w-0 items-center gap-3 p-3">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {file.name}
                      </span>
                      <Badge variant="outline">Page {index + 1}</Badge>
                    </CardPanel>
                  </Card>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={pendingFiles.length === 0 || busy || uploadingPages}
                loading={uploadingPages}
                onClick={onUploadPages}
                variant="outline"
              >
                <UploadCloud /> Upload source pages
              </Button>
              {pages.length > 0 ? (
                <span className="text-muted-foreground text-xs">
                  <ShieldCheck className="mr-1 inline size-3.5 text-success" />
                  SHA-256 verified · scan clean · durable
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {pages.length > 0 ? (
          <ol aria-label="Saved source pages" className="space-y-2">
            {pages.map((page, index) => (
              <li className="rounded-lg border p-2.5" key={page.assetId}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {page.order}. {page.fileName || "Verified source page"}
                  </span>
                  <Badge variant="outline">{page.mimeType || "File"}</Badge>
                  {page.contentHashSha256 ? (
                    <Badge variant="success">Verified</Badge>
                  ) : (
                    <Badge variant="warning">Scanning</Badge>
                  )}
                </div>
                {managePages ? (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                    <Button
                      aria-label={`Move page ${index + 1} earlier`}
                      disabled={busy || uploadingPages || index === 0}
                      onClick={() => {
                        Promise.resolve(
                          onMoveSavedPage(String(page.assetId), -1)
                        ).catch(() => undefined);
                      }}
                      size="icon-sm"
                      variant="outline"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      aria-label={`Move page ${index + 1} later`}
                      disabled={
                        busy || uploadingPages || index === pages.length - 1
                      }
                      onClick={() => {
                        Promise.resolve(
                          onMoveSavedPage(String(page.assetId), 1)
                        ).catch(() => undefined);
                      }}
                      size="icon-sm"
                      variant="outline"
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      aria-label={`Remove page ${index + 1}`}
                      disabled={busy || uploadingPages}
                      onClick={() => {
                        Promise.resolve(
                          onRemoveSavedPage(String(page.assetId))
                        ).catch(() => undefined);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Remove
                    </Button>
                    <Field className="min-w-[12rem]">
                      <FieldLabel
                        className="sr-only"
                        htmlFor={`cost-document-replace-page-${page.assetId}`}
                      >
                        Replace page {index + 1}
                      </FieldLabel>
                      <Input
                        accept="application/pdf,image/*"
                        className="h-8 text-xs"
                        data-testid={`replace-page-${page.assetId}`}
                        disabled={busy || uploadingPages}
                        id={`cost-document-replace-page-${page.assetId}`}
                        onChange={(event) => {
                          const replacement = Array.from(
                            event.currentTarget.files ?? []
                          )[0];
                          event.currentTarget.value = "";
                          if (replacement) {
                            Promise.resolve(
                              onReplaceSavedPage(
                                String(page.assetId),
                                replacement
                              )
                            ).catch(() => undefined);
                          }
                        }}
                        type="file"
                      />
                    </Field>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </FramePanel>
    </Frame>
  );
}
