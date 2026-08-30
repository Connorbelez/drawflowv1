"use client";

import { useAccessToken } from "@workos/authkit-tanstack-react-start/client";
import { useMutation } from "convex/react";
import {
  AlertTriangle,
  Download,
  Eye,
  History,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
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
import type {
  CostDocumentActorCapacity,
  CostDocumentDetail as CostDocumentDetailRecord,
  CostDocumentInteractionMode,
} from "./CostDocumentRoadmapReconciliation.tsx";
import type { CostDocumentReview } from "./CostDocumentRoadmapReconciliationModel.ts";
import {
  displayCostDocumentVendor,
  formatDateTime,
  isPreviewable,
  messageForCostDocumentAction,
  reviewAttentionLabel,
  reviewBadgeVariant,
  shortHash,
  titleCase,
} from "./CostDocumentRoadmapReconciliationModel.ts";
import {
  costDocumentPageDownloadUrl,
  formatCad,
} from "./SingleCostDocumentCapture.tsx";

export function CostDocumentDetailSheet({
  actorCapacity,
  buildId,
  document,
  interactionMode = "standard",
  onClose,
  onStartCorrection,
  organizationId,
}: {
  actorCapacity?: CostDocumentActorCapacity;
  buildId: Id<"activeBuilds">;
  document: CostDocumentDetailRecord | null | undefined;
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
  actorCapacity?: CostDocumentActorCapacity;
  buildId: Id<"activeBuilds">;
  document: CostDocumentDetailRecord;
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
  const [correctionReason, setCorrectionReason] = useState("");
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
    const reason = correctionReason.trim();
    if (!reason) {
      return;
    }
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
        reason,
        reuseSourcePages: true,
        ...actorCapacityInput,
      } as never);
      onStartCorrection?.({
        batchId: String(correction.batchId),
        draftId: String(correction.draftId),
      });
      setCorrectionReason("");
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
    page: CostDocumentDetailRecord["pages"][number],
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
      const revocationUrl = objectUrl;
      if (mode === "download") {
        const anchor = window.document.createElement("a");
        anchor.download = page.fileName;
        anchor.href = objectUrl;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(revocationUrl), 0);
      } else {
        preview?.location.replace(objectUrl);
        window.setTimeout(() => URL.revokeObjectURL(revocationUrl), 60_000);
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
              {displayCostDocumentVendor(document)} ·{" "}
              {formatCad(document.grossTotalCents)} ·{" "}
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
              [
                "Vendor",
                `${displayCostDocumentVendor(document)}${
                  document.vendor?.resolution === "unresolved_legacy"
                    ? " (unresolved legacy text)"
                    : ""
                }`,
              ],
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
              <div className="space-y-2">
                <Field>
                  <FieldLabel htmlFor="cost-document-correction-reason">
                    Correction reason
                  </FieldLabel>
                  <Textarea
                    id="cost-document-correction-reason"
                    onChange={(event) =>
                      setCorrectionReason(event.target.value)
                    }
                    placeholder="Why is a new immutable revision required?"
                    value={correctionReason}
                  />
                </Field>
                <Button
                  disabled={!correctionReason.trim()}
                  onClick={beginCorrection}
                  type="button"
                  variant="outline"
                >
                  Start correction
                </Button>
              </div>
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
