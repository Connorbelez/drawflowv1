import type { MutableRefObject } from "react";
import { useEffect, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import {
  AUTOSAVE_DELAY_MS,
  CONVEX_ERROR_PREFIX,
  type CopiedValuesConfirmationResult,
  type DraftConflict,
  type DraftLinePatch,
  type DraftPatch,
  type DraftReadResult,
  type LifecycleReadResult,
  type LocalLedgerState,
  MAX_TIMEOUT_MS,
  type PricingDisplayLine,
  type QuoteAccess,
  type ReadableDraftResult,
  type ReadableLifecycleResult,
  type ResponseLedgerSource,
} from "./QuoteFieldLedgerContracts";
import { parseQuoteRoundTiptapJson } from "./quote-round-tiptap.ts";

export function isReadableDraft(
  result: DraftReadResult | undefined
): result is ReadableDraftResult {
  return result?.status === "available" || result?.status === "read_only";
}

export function stateFromResponse(
  source: ResponseLedgerSource
): LocalLedgerState {
  return {
    amounts: Object.fromEntries(
      (source?.lineItems ?? []).map((line) => [
        line.lineKey,
        line.quotedAmountCents,
      ])
    ),
    answers: Object.fromEntries(
      (source?.responses ?? []).map((answer) => [
        answer.sourcePackageRevisionResponseFieldId,
        answer.value,
      ])
    ),
    commentsHtml: source?.commentsHtml ?? "",
    expandedLines: (source?.lineItems ?? [])
      .filter((line) => line.source === "expanded_scope")
      .map((line) => ({
        lineKey: line.lineKey,
        quotedAmountCents: line.quotedAmountCents,
        scope: line.scope,
        source: line.source,
        sourcePackageRevisionLabourLineId:
          line.sourcePackageRevisionLabourLineId,
        sourcePackageRevisionMaterialLineId:
          line.sourcePackageRevisionMaterialLineId,
        sourcePackageRevisionResponseFieldId:
          line.sourcePackageRevisionResponseFieldId,
        title: line.title,
      })),
    version: source
      ? "version" in source
        ? source.version
        : source.sourceDraftVersion
      : 0,
  };
}

export function packagePricingLines(
  access: QuoteAccess,
  scope: "labour" | "materials",
  _ledger: LocalLedgerState
): PricingDisplayLine[] {
  const packageLines: PricingDisplayLine[] =
    scope === "labour"
      ? access.package.labourLines.map((line) => ({
          context: line.sourceScopeChangeReason,
          detail: parseQuoteRoundTiptapJson(line.scopeOfWorkTiptapJson),
          line: {
            lineKey: `labour:${line.sourceLineId}`,
            scope: "labour",
            source: "package_labour",
            sourcePackageRevisionLabourLineId: line.sourceLineId,
            title: `${line.milestoneName} · ${line.submilestoneName}`,
          },
          meta: [
            line.startDay === undefined
              ? undefined
              : `Start day ${line.startDay}`,
            line.durationDays === undefined
              ? undefined
              : `${line.durationDays} day${line.durationDays === 1 ? "" : "s"}`,
            line.sourceScopeVersion === undefined
              ? undefined
              : `Scope v${line.sourceScopeVersion}`,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" · "),
        }))
      : access.package.materialLines.map((line) => ({
          context: [
            line.description,
            line.deliveryLocation
              ? `Delivery: ${line.deliveryLocation}`
              : undefined,
            line.deliveryInstructions,
          ]
            .filter((value): value is string => Boolean(value))
            .join(" · "),
          detail: parseQuoteRoundTiptapJson(line.specificationTiptapJson),
          line: {
            lineKey: `material:${line.sourceLineId}`,
            scope: "materials",
            source: "package_material",
            sourcePackageRevisionMaterialLineId: line.sourceLineId,
            title: line.title,
          },
          meta: `${line.quantity} ${line.unit} · delivery days ${line.deliveryStartDay}–${line.deliveryEndDay}`,
        }));
  const fieldLines: PricingDisplayLine[] = access.package.responseFields
    .filter((field) => field.kind === "priced_line" && field.scope === scope)
    .map((field) => ({
      detail: field.richTextDefaultHtml ?? "",
      line: {
        lineKey: `field:${field.sourceFieldId}`,
        scope: field.scope,
        source: "template_priced",
        sourcePackageRevisionResponseFieldId: field.sourceFieldId,
        title: field.label,
      },
      meta: field.required
        ? "Required response field"
        : "Optional response field",
    }));
  return [...packageLines, ...fieldLines];
}

export function sumPricingLines(
  lines: PricingDisplayLine[],
  amounts: Record<string, number | undefined>
) {
  return lines.reduce(
    (total, { line }) => total + (amounts[line.lineKey] ?? 0),
    0
  );
}

export function sumDraftLines(
  lines: DraftLinePatch[],
  amounts: Record<string, number | undefined>
) {
  return lines.reduce((total, line) => total + (amounts[line.lineKey] ?? 0), 0);
}

export function mergeDraftPatches(
  current: DraftPatch | null,
  next: DraftPatch
): DraftPatch {
  const lineMap = new Map(
    (current?.linePatches ?? []).map((line) => [line.lineKey, line])
  );
  for (const line of next.linePatches ?? []) {
    lineMap.set(line.lineKey, line);
  }
  const answerMap = new Map(
    (current?.answerPatches ?? []).map((answer) => [
      answer.sourcePackageRevisionResponseFieldId,
      answer,
    ])
  );
  for (const answer of next.answerPatches ?? []) {
    answerMap.set(answer.sourcePackageRevisionResponseFieldId, answer);
  }
  const removeKeys = new Set([
    ...(current?.removeExpandedLineKeys ?? []),
    ...(next.removeExpandedLineKeys ?? []),
  ]);
  for (const key of removeKeys) {
    lineMap.delete(key);
  }
  return {
    ...(lineMap.size ? { linePatches: [...lineMap.values()] } : {}),
    ...(answerMap.size ? { answerPatches: [...answerMap.values()] } : {}),
    ...(current?.commentsHtml !== undefined || next.commentsHtml !== undefined
      ? {
          commentsHtml:
            next.commentsHtml === undefined
              ? (current?.commentsHtml ?? null)
              : next.commentsHtml,
        }
      : {}),
    ...(removeKeys.size ? { removeExpandedLineKeys: [...removeKeys] } : {}),
  };
}

export function restoreInFlightPatch(
  inFlight: DraftPatch,
  newer: DraftPatch | null
) {
  return newer ? mergeDraftPatches(inFlight, newer) : inFlight;
}

export function isReadableLifecycle(
  result: LifecycleReadResult | undefined
): result is ReadableLifecycleResult {
  return Boolean(
    result &&
      (result.status === "available" ||
        result.status === "read_only" ||
        result.status === "acknowledgement_required") &&
      "eligibility" in result
  );
}

export function responseSubmissionStatus(
  submission: ReadableLifecycleResult["currentSubmission"]
) {
  if (!submission) {
    return null;
  }
  const projection = submission as typeof submission & {
    state?: string;
    status?: string;
  };
  return projection.status ?? projection.state ?? "submitted";
}

export function revisionStatusLabel(
  revision: ReadableLifecycleResult["revisions"][number]
) {
  if (revision.status === "withdrawn") {
    return "Withdrawn";
  }
  if (revision.status === "superseded") {
    return revision.supersededByRevision
      ? `Superseded by revision ${revision.supersededByRevision}`
      : "Superseded";
  }
  return "Current";
}

export function responseLifecycleBadge(
  submission: ReadableLifecycleResult["currentSubmission"],
  submissionStatus: string | null,
  readOnly: boolean
) {
  if (submissionStatus === "withdrawn") {
    return { label: "Withdrawn", variant: "warning" as const };
  }
  if (submission) {
    return {
      label: `Submitted revision ${submission.revision}`,
      variant: "success" as const,
    };
  }
  return readOnly
    ? { label: "Read-only", variant: "outline" as const }
    : { label: "Draft review", variant: "info" as const };
}

export function lifecycleFailureMessage(status: string) {
  switch (status) {
    case "conflict":
    case "draft_conflict":
    case "stale_draft":
      return "A newer Field Ledger draft exists. Reload it before submitting.";
    case "submission_conflict":
      return "The submitted revision changed. Reload the latest response history.";
    case "invalid":
    case "invalid_response":
      return "Complete every required response field and valid pricing line before submitting.";
    case "no_draft":
      return "Save at least one meaningful Field Ledger change before submitting.";
    case "no_submission":
      return "No submitted quote revision is available for this action.";
    case "confirmation_required":
      return "Confirm withdrawal before removing the quote from comparison.";
    case "acknowledgement_required":
      return "Review and acknowledge the updated package before continuing.";
    case "read_only":
      return "The response window closed before this action reached the server.";
    case "superseded":
      return "This package revision was replaced. Use the newest invitation.";
    case "unavailable":
      return "This invitation is no longer active. Reopen the original invitation.";
    default:
      return "The response lifecycle changed before this action completed. Reload and retry.";
  }
}

export async function invokeRecipientMutation<
  TInput extends Record<string, unknown>,
  TResult,
>({
  browserMutation,
  claimedMutation,
  input,
  sessionToken,
  usingClaimedAccess,
}: {
  browserMutation: (
    input: TInput & { sessionToken: string }
  ) => Promise<TResult>;
  claimedMutation: (input: TInput) => Promise<TResult>;
  input: TInput;
  sessionToken?: string;
  usingClaimedAccess: boolean;
}) {
  if (usingClaimedAccess) {
    return await claimedMutation(input);
  }
  if (!sessionToken) {
    throw new Error(
      "This invitation session ended. Reopen the original invitation."
    );
  }
  return await browserMutation({ ...input, sessionToken });
}

export function lifecycleErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? draftSaveErrorMessage(error) : fallback;
}

export function draftSaveErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(CONVEX_ERROR_PREFIX, "")
    : "Your local changes are still on this device. Retry when connected.";
}

export function scheduleFlush(
  timerRef: MutableRefObject<number | null>,
  flush: () => Promise<void>
) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
  }
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    runFlush(flush);
  }, AUTOSAVE_DELAY_MS);
}

export function runFlush(flush: () => Promise<void>) {
  flush().catch(() => undefined);
}

export function copiedValuesConfirmationBlocked({
  hasConflict,
  hasDraft,
  hasPendingConfirmation,
  flushing,
  readOnly,
  responseWritesLocked,
}: {
  hasConflict: boolean;
  hasDraft: boolean;
  hasPendingConfirmation: boolean;
  flushing: boolean;
  readOnly: boolean;
  responseWritesLocked: boolean;
}) {
  return (
    !(hasDraft && hasPendingConfirmation) ||
    hasConflict ||
    flushing ||
    readOnly ||
    responseWritesLocked
  );
}

export function copiedValuesFlushBlocked({
  hasConflict,
  hasPendingPatch,
  flushing,
  readOnly,
  responseWritesLocked,
}: {
  hasConflict: boolean;
  hasPendingPatch: boolean;
  flushing: boolean;
  readOnly: boolean;
  responseWritesLocked: boolean;
}) {
  return (
    hasPendingPatch ||
    hasConflict ||
    flushing ||
    readOnly ||
    responseWritesLocked
  );
}

export function handleCopiedValuesConfirmationResult(
  result: CopiedValuesConfirmationResult,
  sourceVersion: number,
  {
    conflictRef,
    pendingRef,
    setConfirmedSourceVersion,
    setConflict,
    setLifecycleMessage,
    setSyncError,
    versionRef,
  }: {
    conflictRef: MutableRefObject<DraftConflict | null>;
    pendingRef: MutableRefObject<DraftPatch | null>;
    setConfirmedSourceVersion: (version: number) => void;
    setConflict: (conflict: DraftConflict) => void;
    setLifecycleMessage: (message: string) => void;
    setSyncError: (message: string) => void;
    versionRef: MutableRefObject<number>;
  }
) {
  if (result.status === "confirmed") {
    if (!pendingRef.current) {
      versionRef.current = result.draft.version;
    }
    setConfirmedSourceVersion(sourceVersion);
    setLifecycleMessage("Copied response values confirmed.");
    return;
  }
  if (result.status === "not_required") {
    setConfirmedSourceVersion(sourceVersion);
    return;
  }
  if (result.status === "conflict" && result.draft) {
    const nextConflict = { draft: result.draft };
    conflictRef.current = nextConflict;
    setConflict(nextConflict);
    return;
  }
  setSyncError(lifecycleFailureMessage(result.status));
}

export async function uploadResponseFile(
  uploadUrl: string,
  uploadSecret: string,
  file: File
) {
  const upload = await fetch(uploadUrl, {
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Quote-Upload-Secret": uploadSecret,
    },
    method: "POST",
  });
  if (!upload.ok) {
    throw new Error(
      "Storage upload failed before the Field Ledger could save the file."
    );
  }
  const body = (await upload.json()) as { storageId?: string };
  if (!body.storageId) {
    throw new Error("Storage did not return a file reference.");
  }
  return body.storageId as Id<"_storage">;
}

export function usePresentationClock(boundaries: Array<number | undefined>) {
  const [observedAt, setObservedAt] = useState(() => Date.now());
  const nextBoundary = boundaries
    .filter(
      (boundary): boundary is number =>
        typeof boundary === "number" && boundary > observedAt
    )
    .reduce<number | null>(
      (nearest, boundary) =>
        nearest === null || boundary < nearest ? boundary : nearest,
      null
    );
  useEffect(() => {
    if (nextBoundary === null) {
      return;
    }
    const remaining = nextBoundary - observedAt;
    if (remaining <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => setObservedAt(Date.now()),
      Math.min(remaining, MAX_TIMEOUT_MS)
    );
    return () => window.clearTimeout(timer);
  }, [nextBoundary, observedAt]);
  return observedAt;
}

export function ledgerIsReadOnly(access: QuoteAccess, observedAt: number) {
  return (
    access.roundState !== "open" ||
    observedAt >= access.package.responseDeadline
  );
}

export function parseQuotedCents(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`)
  );
}
export function formatChangedFieldKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
export function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
export function formatBytes(value: number) {
  return value < 1024 * 1024
    ? `${Math.max(1, Math.round(value / 1024))} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
export function money(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}
export function safeClientKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
}
export function uploadFailureMessage(
  status:
    | "read_only"
    | "revision_required"
    | "acknowledgement_required"
    | "superseded"
    | "unavailable"
) {
  return status === "read_only"
    ? "The response window closed before this file could attach."
    : status === "revision_required"
      ? "Start Revise quote before attaching files to a submitted response."
      : status === "acknowledgement_required"
        ? "Review and acknowledge the updated package before attaching files."
        : status === "superseded"
          ? "This package was replaced before the file could attach."
          : "This invitation session ended before the file could attach.";
}
