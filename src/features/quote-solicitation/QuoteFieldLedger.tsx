"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  CloudOff,
  ExternalLink,
  Loader2,
  MapPinned,
  Plus,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  type ChangeEvent,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FieldRichTextEditor,
  FieldRichTextPreview,
} from "#/components/rich-text/field-rich-text.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseQuoteRoundTiptapJson } from "./quote-round-tiptap.ts";

type DraftReadResult = FunctionReturnType<
  typeof api.quote_response_drafts.getQuoteInvitationResponseDraft
>;
type ReadableDraftResult = Extract<
  DraftReadResult,
  { status: "available" | "read_only" }
>;
type QuoteAccess = ReadableDraftResult["access"];
type QuoteDraft = ReadableDraftResult["draft"];
type DraftLineSource =
  | "package_labour"
  | "package_material"
  | "template_priced"
  | "expanded_scope";
type DraftScope = "labour" | "materials" | "whole_quote";

interface DraftLinePatch {
  lineKey: string;
  quotedAmountCents?: number | null;
  scope: DraftScope;
  source: DraftLineSource;
  sourcePackageRevisionLabourLineId?: Id<"quotePackageRevisionLabourLines">;
  sourcePackageRevisionMaterialLineId?: Id<"quotePackageRevisionMaterialLines">;
  sourcePackageRevisionResponseFieldId?: Id<"quotePackageRevisionResponseFields">;
  title?: string;
}

interface DraftAnswerPatch {
  sourcePackageRevisionResponseFieldId: Id<"quotePackageRevisionResponseFields">;
  value: string | null;
}

interface DraftPatch {
  answerPatches?: DraftAnswerPatch[];
  commentsHtml?: string | null;
  linePatches?: DraftLinePatch[];
  removeExpandedLineKeys?: string[];
}

interface PricingDisplayLine {
  context?: string;
  detail?: NonNullable<ReturnType<typeof parseQuoteRoundTiptapJson>> | string;
  line: DraftLinePatch;
  meta: string;
}

interface LocalLedgerState {
  amounts: Record<string, number | undefined>;
  answers: Record<string, string | undefined>;
  commentsHtml: string;
  expandedLines: DraftLinePatch[];
  version: number;
}

interface DraftConflict {
  draft: QuoteDraft;
}

interface StagedAttachment {
  stagingSessionId: Id<"quoteInvitationResponseDraftAttachmentStagingSessions">;
  storageId: Id<"_storage">;
}

const AUTOSAVE_DELAY_MS = 550;
const MAX_TIMEOUT_MS = 2_147_483_647;
const CONVEX_ERROR_PREFIX = /^\[.*?\]\s*/;

export interface QuoteFieldLedgerProps {
  access: QuoteAccess;
  accountClaimActions?: ReactNode;
  hasAuthenticatedUser: boolean;
  onReopenInvitation?: () => void;
  sessionToken?: string;
}

/**
 * The recipient-facing Field Ledger is one continuous response surface. Its
 * local state is deliberately optimistic, while the server remains the sole
 * authority for invitation scope, response deadlines, and draft versions.
 */
export function QuoteFieldLedger({
  accountClaimActions,
  access: initialAccess,
  hasAuthenticatedUser,
  onReopenInvitation,
  sessionToken,
}: QuoteFieldLedgerProps) {
  const observedAt = usePresentationClock([
    initialAccess.package.responseDeadline,
    initialAccess.sessionExpiresAt,
  ]);
  const {
    activeRead,
    readOnly,
    serverSuperseded,
    serverUnavailable,
    usingClaimedAccess,
  } = useQuoteFieldLedgerAccess({
    hasAuthenticatedUser,
    initialAccess,
    observedAt,
    sessionToken,
  });
  const saveBrowserDraft = useMutation(
    api.quote_response_drafts.saveQuoteInvitationResponseDraft
  );
  const saveClaimedDraft = useMutation(
    api.quote_response_drafts.saveClaimedQuoteInvitationResponseDraft
  );
  const beginBrowserUpload = useMutation(
    api.quote_response_drafts.beginQuoteInvitationResponseDraftAttachmentUpload
  );
  const beginClaimedUpload = useMutation(
    api.quote_response_drafts
      .beginClaimedQuoteInvitationResponseDraftAttachmentUpload
  );
  const registerBrowserUpload = useMutation(
    api.quote_response_drafts
      .registerQuoteInvitationResponseDraftAttachmentUpload
  );
  const registerClaimedUpload = useMutation(
    api.quote_response_drafts
      .registerClaimedQuoteInvitationResponseDraftAttachmentUpload
  );
  const attachBrowserFile = useMutation(
    api.quote_response_drafts.attachQuoteInvitationResponseDraftFile
  );
  const attachClaimedFile = useMutation(
    api.quote_response_drafts.attachClaimedQuoteInvitationResponseDraftFile
  );

  const access = activeRead.access;

  const initialState = useMemo(
    () => stateFromDraft(activeRead.draft),
    [activeRead.draft]
  );
  const [ledger, setLedger] = useState<LocalLedgerState>(initialState);
  const [syncMessage, setSyncMessage] = useState("Opening saved draft…");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const controlsLocked = readOnly || Boolean(conflict);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedTitle, setExpandedTitle] = useState("");
  const [expandedAmount, setExpandedAmount] = useState("");
  const [expandedScope, setExpandedScope] = useState<"labour" | "materials">(
    "labour"
  );
  const versionRef = useRef(initialState.version);
  const pendingRef = useRef<DraftPatch | null>(null);
  const timerRef = useRef<number | null>(null);
  const flushingRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const localEditsRef = useRef(false);
  const conflictRef = useRef<DraftConflict | null>(null);
  const stagedAttachmentRef = useRef<StagedAttachment | null>(null);

  useEffect(() => {
    conflictRef.current = conflict;
  }, [conflict]);

  useEffect(() => {
    // A reactive read can arrive between a local keystroke and its mutation.
    // Do not silently advance the base version in that window: the queued patch
    // must retain the version it was actually edited against so Convex returns a
    // recoverable optimistic conflict instead of accepting an accidental rebase.
    if (
      localEditsRef.current ||
      pendingRef.current ||
      flushingRef.current ||
      conflictRef.current
    ) {
      return;
    }
    const next = stateFromDraft(activeRead.draft);
    versionRef.current = next.version;
    setLedger(next);
    setSyncMessage(next.version ? "Saved to DrawFlow" : "No draft yet");
    setSyncError(null);
  }, [activeRead.draft]);

  const invokeSave = useCallback(
    async (expectedVersion: number, patch: DraftPatch) => {
      if (usingClaimedAccess) {
        return await saveClaimedDraft({
          expectedVersion,
          patch,
          quoteRoundInvitationId: access.invitationId,
        });
      }
      if (!sessionToken) {
        return { status: "unavailable" as const };
      }
      return await saveBrowserDraft({
        expectedVersion,
        patch,
        quoteRoundInvitationId: access.invitationId,
        sessionToken,
      });
    },
    [
      access.invitationId,
      saveBrowserDraft,
      saveClaimedDraft,
      sessionToken,
      usingClaimedAccess,
    ]
  );

  const flush = useCallback(async () => {
    if (
      flushingRef.current ||
      !pendingRef.current ||
      readOnly ||
      conflictRef.current
    ) {
      return;
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    pendingRef.current = null;
    flushingRef.current = true;
    setSyncMessage("Saving Field Ledger…");
    setSyncError(null);
    try {
      const result = await invokeSave(versionRef.current, patch);
      switch (result.status) {
        case "saved":
          versionRef.current = result.draft.version;
          localEditsRef.current = Boolean(pendingRef.current);
          conflictRef.current = null;
          setConflict(null);
          setSyncMessage("Saved to DrawFlow");
          break;
        case "conflict": {
          versionRef.current = result.draft?.version ?? 0;
          const nextConflict = { draft: result.draft };
          pendingRef.current = restoreInFlightPatch(patch, pendingRef.current);
          conflictRef.current = nextConflict;
          setConflict(nextConflict);
          setSyncMessage("A newer saved draft needs your review");
          break;
        }
        case "not_started":
          setSyncMessage("No draft yet");
          break;
        case "read_only":
          setSyncError(
            "The response window closed before this change could save."
          );
          break;
        case "superseded":
          setSyncError(
            "This package was replaced. Open the newest invitation."
          );
          break;
        case "unavailable":
          setSyncError(
            "This invitation session ended. Reopen the original invitation to continue."
          );
          break;
      }
    } catch (error) {
      pendingRef.current = restoreInFlightPatch(patch, pendingRef.current);
      setSyncError(draftSaveErrorMessage(error));
    } finally {
      flushingRef.current = false;
      if (pendingRef.current && !readOnly && !conflictRef.current) {
        scheduleFlush(timerRef, flush);
      }
    }
  }, [invokeSave, readOnly]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const flushPendingOnExit = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Browsers may terminate an async request during a document teardown, so
    // `pagehide` makes the best-effort save early and `beforeunload` keeps a
    // visible-page departure cancellable while work is still pending.
    flushRef.current().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onPageHide = () => flushPendingOnExit();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingOnExit();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current || flushingRef.current) {
        flushPendingOnExit();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushPendingOnExit();
    };
  }, [flushPendingOnExit]);

  const queuePatch = useCallback(
    (patch: DraftPatch) => {
      if (readOnly) {
        return;
      }
      localEditsRef.current = true;
      pendingRef.current = mergeDraftPatches(pendingRef.current, patch);
      setSyncMessage("Saved on this device · syncing…");
      setSyncError(null);
      scheduleFlush(timerRef, flush);
    },
    [flush, readOnly]
  );

  const updateAmount = (line: DraftLinePatch, value: string) => {
    const amount = parseQuotedCents(value);
    setLedger((current) => ({
      ...current,
      amounts: { ...current.amounts, [line.lineKey]: amount ?? undefined },
    }));
    queuePatch({ linePatches: [{ ...line, quotedAmountCents: amount }] });
  };

  const updateAnswer = (
    fieldId: Id<"quotePackageRevisionResponseFields">,
    value: string
  ) => {
    setLedger((current) => ({
      ...current,
      answers: { ...current.answers, [fieldId]: value || undefined },
    }));
    queuePatch({
      answerPatches: [
        { sourcePackageRevisionResponseFieldId: fieldId, value: value || null },
      ],
    });
  };

  const updateComments = (commentsHtml: string) => {
    setLedger((current) => ({ ...current, commentsHtml }));
    queuePatch({ commentsHtml: commentsHtml || null });
  };

  const addExpandedScope = () => {
    const title = expandedTitle.trim();
    const amount = parseQuotedCents(expandedAmount);
    if (!title || amount === null) {
      setSyncError("Give the expanded scope both a title and a quoted amount.");
      return;
    }
    const line: DraftLinePatch = {
      lineKey: `expanded:${safeClientKey()}`,
      quotedAmountCents: amount,
      scope: expandedScope,
      source: "expanded_scope",
      title,
    };
    setLedger((current) => ({
      ...current,
      amounts: { ...current.amounts, [line.lineKey]: amount },
      expandedLines: [...current.expandedLines, line],
    }));
    queuePatch({ linePatches: [line] });
    setExpandedTitle("");
    setExpandedAmount("");
  };

  const removeExpandedScope = (lineKey: string) => {
    setLedger((current) => ({
      ...current,
      expandedLines: current.expandedLines.filter(
        (line) => line.lineKey !== lineKey
      ),
    }));
    queuePatch({ removeExpandedLineKeys: [lineKey] });
  };

  const beginAttachmentUpload = useCallback(
    async (
      file: File,
      sourceFieldId: Id<"quotePackageRevisionResponseFields"> | undefined
    ) => {
      const intent = {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        quoteRoundInvitationId: access.invitationId,
        sizeBytes: file.size,
        sourcePackageRevisionResponseFieldId: sourceFieldId,
      };
      if (usingClaimedAccess) {
        return await beginClaimedUpload(intent);
      }
      if (!sessionToken) {
        return { status: "unavailable" as const };
      }
      return await beginBrowserUpload({
        ...intent,
        sessionToken,
      });
    },
    [
      access.invitationId,
      beginBrowserUpload,
      beginClaimedUpload,
      sessionToken,
      usingClaimedAccess,
    ]
  );

  const registerUploadedAttachment = useCallback(
    async (attachment: StagedAttachment) => {
      const input = {
        quoteRoundInvitationId: access.invitationId,
        stagingSessionId: attachment.stagingSessionId,
        storageId: attachment.storageId,
      };
      if (usingClaimedAccess) {
        return await registerClaimedUpload(input);
      }
      if (!sessionToken) {
        return { status: "unavailable" as const };
      }
      return await registerBrowserUpload({ ...input, sessionToken });
    },
    [
      access.invitationId,
      registerBrowserUpload,
      registerClaimedUpload,
      sessionToken,
      usingClaimedAccess,
    ]
  );

  const attachStagedFile = useCallback(
    async (attachment: StagedAttachment) => {
      const input = {
        expectedVersion: versionRef.current,
        quoteRoundInvitationId: access.invitationId,
        stagingSessionId: attachment.stagingSessionId,
        storageId: attachment.storageId,
      };
      if (usingClaimedAccess) {
        return await attachClaimedFile(input);
      }
      if (!sessionToken) {
        return { status: "unavailable" as const };
      }
      return await attachBrowserFile({ ...input, sessionToken });
    },
    [
      access.invitationId,
      attachBrowserFile,
      attachClaimedFile,
      sessionToken,
      usingClaimedAccess,
    ]
  );

  const finishStagedAttachment = useCallback(
    async (attachment: StagedAttachment) => {
      const result = await attachStagedFile(attachment);
      switch (result.status) {
        case "saved":
          stagedAttachmentRef.current = null;
          versionRef.current = result.draft.version;
          setSyncMessage("Response file attached and saved");
          return;
        case "conflict": {
          versionRef.current = result.draft?.version ?? 0;
          const nextConflict = { draft: result.draft };
          conflictRef.current = nextConflict;
          setConflict(nextConflict);
          setAttachmentError(
            "A newer version prevented this file from attaching. Resolve it, then retry this staged file."
          );
          return;
        }
        case "attachment_rejected":
          stagedAttachmentRef.current = null;
          throw new Error(result.message);
        case "read_only":
        case "superseded":
        case "unavailable":
          throw new Error(uploadFailureMessage(result.status));
      }
    },
    [attachStagedFile]
  );

  const retryConflict = async () => {
    versionRef.current = conflictRef.current?.draft?.version ?? 0;
    conflictRef.current = null;
    setConflict(null);
    setUploading(Boolean(stagedAttachmentRef.current));
    try {
      await flush();
      if (!conflictRef.current && stagedAttachmentRef.current) {
        await finishStagedAttachment(stagedAttachmentRef.current);
      }
    } catch (error) {
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "The staged response file is still waiting to attach."
      );
    } finally {
      setUploading(false);
    }
  };

  const uploadAttachment = async (
    event: ChangeEvent<HTMLInputElement>,
    sourceFieldId?: Id<"quotePackageRevisionResponseFields">
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || readOnly) {
      return;
    }
    if (conflictRef.current) {
      setAttachmentError(
        "Resolve the newer Field Ledger version before attaching another file."
      );
      return;
    }
    setAttachmentError(null);
    setUploading(true);
    try {
      await flush();
      if (conflictRef.current) {
        throw new Error(
          "Resolve the newer Field Ledger version before attaching another file."
        );
      }
      const begin = await beginAttachmentUpload(file, sourceFieldId);
      if (begin.status !== "available") {
        throw new Error(uploadFailureMessage(begin.status));
      }
      const storageId = await uploadResponseFile(
        begin.uploadUrl,
        begin.uploadSecret,
        file
      );
      const stagedAttachment = {
        stagingSessionId: begin.stagingSessionId,
        storageId,
      };
      const registration = await registerUploadedAttachment(stagedAttachment);
      if (registration.status === "attachment_rejected") {
        throw new Error(registration.message);
      }
      if (registration.status !== "registered") {
        throw new Error(uploadFailureMessage(registration.status));
      }
      stagedAttachmentRef.current = stagedAttachment;
      await finishStagedAttachment(stagedAttachment);
    } catch (error) {
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "The file was not attached. Keep it locally and retry."
      );
    } finally {
      setUploading(false);
    }
  };

  if (serverSuperseded) {
    return (
      <LedgerRecoverySurface
        kind="superseded"
        onReopenInvitation={onReopenInvitation}
      />
    );
  }
  if (serverUnavailable) {
    return (
      <LedgerRecoverySurface
        kind="unavailable"
        onReopenInvitation={onReopenInvitation}
      />
    );
  }

  const labourLines = packagePricingLines(access, "labour", ledger);
  const materialLines = packagePricingLines(access, "materials", ledger);
  const labourSubtotal = sumPricingLines(labourLines, ledger.amounts);
  const materialSubtotal = sumPricingLines(materialLines, ledger.amounts);
  const expandedSubtotal = sumDraftLines(ledger.expandedLines, ledger.amounts);
  const total = labourSubtotal + materialSubtotal + expandedSubtotal;

  return (
    <main className="min-h-svh bg-bg-base pb-24">
      <div className="mx-auto max-w-[88rem] px-3 py-4 sm:px-5 sm:py-6">
        <LedgerMasthead
          access={access}
          readOnly={readOnly}
          syncMessage={syncMessage}
          total={total}
        />
        <LedgerSectionNav />
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <Frame className="min-w-0">
            <FramePanel className="overflow-hidden p-0">
              {readOnly ? (
                <LedgerNotice
                  icon={<CalendarClock />}
                  title="Response window closed"
                  variant="warning"
                >
                  This Field Ledger is preserved for review, but no changes or
                  files can be saved after{" "}
                  {formatDateTime(access.package.responseDeadline)}.
                </LedgerNotice>
              ) : null}
              {syncError ? (
                <LedgerNotice
                  icon={<CloudOff />}
                  title="Saved on this device"
                  variant="warning"
                >
                  {syncError} Your visible input has not been discarded.
                  <div className="mt-2">
                    <Button
                      onClick={() => runFlush(flush)}
                      size="sm"
                      variant="outline"
                    >
                      <RefreshCw /> Retry save
                    </Button>
                  </div>
                </LedgerNotice>
              ) : null}
              {conflict ? (
                <LedgerNotice
                  icon={<TriangleAlert />}
                  title="A newer Field Ledger version exists"
                  variant="warning"
                >
                  Your local input is still visible. Reapply it against version{" "}
                  {conflict.draft?.version ?? 0} after reviewing the saved
                  state.
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={retryConflict} size="sm">
                      Keep my local changes
                    </Button>
                    <Button
                      onClick={() => {
                        const saved = stateFromDraft(conflict.draft);
                        pendingRef.current = null;
                        conflictRef.current = null;
                        setConflict(null);
                        localEditsRef.current = false;
                        setLedger(saved);
                        setSyncMessage(
                          saved.version ? "Saved to DrawFlow" : "No draft yet"
                        );
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Load saved version
                    </Button>
                  </div>
                </LedgerNotice>
              ) : null}
              <LedgerSection
                description="The issued site, permit, dates, and requested scope are frozen together."
                id="summary"
                title="Quote summary"
              >
                <PackageSummary
                  access={access}
                  accountClaimActions={accountClaimActions}
                />
              </LedgerSection>
              <LedgerSection
                description="Price the requested work scope separately from materials."
                id="labour"
                title="Labour"
              >
                <PricingBand
                  lines={labourLines}
                  onAmountChange={updateAmount}
                  readOnly={controlsLocked}
                  scope="labour"
                  subtotal={labourSubtotal}
                  values={ledger.amounts}
                />
              </LedgerSection>
              <LedgerSection
                description="Price requested supplies, delivery, and material-specific scope."
                id="materials"
                title="Materials"
              >
                <PricingBand
                  lines={materialLines}
                  onAmountChange={updateAmount}
                  readOnly={controlsLocked}
                  scope="materials"
                  subtotal={materialSubtotal}
                  values={ledger.amounts}
                />
              </LedgerSection>
              <LedgerSection
                description="Answer the response fields the issuing team included with this revision."
                id="questions"
                title="Questions"
              >
                <ResponseFields
                  access={access}
                  answers={ledger.answers}
                  onAnswerChange={updateAnswer}
                  onFileChange={uploadAttachment}
                  readOnly={controlsLocked}
                  uploading={uploading}
                />
              </LedgerSection>
              <LedgerSection
                description="Keep scope additions separate from the issued rows, and attach supporting files privately."
                id="files"
                title="Files & notes"
              >
                <div className="grid gap-6">
                  <ExpandedScopeEditor
                    amount={expandedAmount}
                    lines={ledger.expandedLines}
                    onAdd={addExpandedScope}
                    onAmountChange={setExpandedAmount}
                    onRemove={removeExpandedScope}
                    onScopeChange={setExpandedScope}
                    onTitleChange={setExpandedTitle}
                    readOnly={controlsLocked}
                    scope={expandedScope}
                    title={expandedTitle}
                    values={ledger.amounts}
                  />
                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">
                          Additional comments
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          Assumptions, exclusions, and clarifications stay
                          private to this response draft.
                        </p>
                      </div>
                      <Badge variant="outline">Private draft</Badge>
                    </div>
                    {controlsLocked ? (
                      ledger.commentsHtml ? (
                        <FieldRichTextPreview
                          ariaLabel="Additional quote comments"
                          value={ledger.commentsHtml}
                        />
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          No additional comments were saved.
                        </p>
                      )
                    ) : (
                      <FieldRichTextEditor
                        ariaLabel="Additional quote comments"
                        editorMinHeightClass="[&_.ProseMirror]:min-h-28"
                        onChange={updateComments}
                        placeholder="Add comments, exclusions, or assumptions…"
                        value={ledger.commentsHtml}
                      />
                    )}
                  </div>
                  <ResponseAttachments
                    attachmentError={attachmentError}
                    attachments={activeRead.draft?.attachments ?? []}
                    onFileChange={uploadAttachment}
                    readOnly={controlsLocked}
                    uploading={uploading}
                  />
                </div>
              </LedgerSection>
              <LedgerSection
                description="Review the separate subtotals before immutable submission becomes available."
                id="review"
                title="Review"
              >
                <ReviewBand
                  expandedSubtotal={expandedSubtotal}
                  labourSubtotal={labourSubtotal}
                  materialSubtotal={materialSubtotal}
                  readOnly={readOnly}
                  total={total}
                />
              </LedgerSection>
            </FramePanel>
          </Frame>
          <LedgerRail access={access} readOnly={readOnly} total={total} />
        </div>
      </div>
      <LedgerPersistentReview
        readOnly={readOnly}
        syncMessage={syncMessage}
        total={total}
      />
    </main>
  );
}

function useQuoteFieldLedgerAccess({
  hasAuthenticatedUser,
  initialAccess,
  observedAt,
  sessionToken,
}: {
  hasAuthenticatedUser: boolean;
  initialAccess: QuoteAccess;
  observedAt: number;
  sessionToken?: string;
}) {
  const browserDraft = useQuery(
    api.quote_response_drafts.getQuoteInvitationResponseDraft,
    sessionToken
      ? {
          presentationNow: observedAt,
          quoteRoundInvitationId: initialAccess.invitationId,
          sessionToken,
        }
      : "skip"
  );
  const claimedDraft = useQuery(
    api.quote_response_drafts.getClaimedQuoteInvitationResponseDraft,
    hasAuthenticatedUser
      ? {
          presentationNow: observedAt,
          quoteRoundInvitationId: initialAccess.invitationId,
        }
      : "skip"
  );
  const readableClaimed = isReadableDraft(claimedDraft) ? claimedDraft : null;
  const readableBrowser = isReadableDraft(browserDraft) ? browserDraft : null;
  const activeRead = readableClaimed ??
    readableBrowser ?? {
      access: initialAccess,
      draft: null,
      status: ledgerIsReadOnly(initialAccess, observedAt)
        ? ("read_only" as const)
        : ("available" as const),
    };
  const serverUnavailable =
    !(readableClaimed || readableBrowser) &&
    (browserDraft?.status === "unavailable" ||
      claimedDraft?.status === "unavailable");
  const serverSuperseded =
    claimedDraft?.status === "superseded" ||
    browserDraft?.status === "superseded";
  return {
    activeRead,
    readOnly:
      activeRead.status === "read_only" ||
      ledgerIsReadOnly(activeRead.access, observedAt),
    serverSuperseded,
    serverUnavailable,
    usingClaimedAccess: Boolean(readableClaimed),
  };
}

function LedgerMasthead({
  access,
  readOnly,
  syncMessage,
  total,
}: {
  access: QuoteAccess;
  readOnly: boolean;
  syncMessage: string;
  total: number;
}) {
  return (
    <header className="grid gap-5 border-b pb-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span>Private quote invitation</span>
          <span aria-hidden="true">/</span>
          <span>Package revision {access.package.revision}</span>
          <span aria-hidden="true">/</span>
          <span>Field Ledger</span>
        </div>
        <h1 className="mt-3 text-balance font-semibold text-2xl tracking-[-0.02em]">
          {access.recipientName} quote
        </h1>
        <p className="mt-2 max-w-2xl text-pretty text-muted-foreground text-sm">
          Issued by {access.issuerName} for {access.package.siteAddress}.
        </p>
        <p className="mt-1 text-sm">
          Due {formatDateTime(access.package.responseDeadline)}
        </p>
      </div>
      <div className="flex items-end justify-between gap-8 border-t pt-4 md:border-t-0 md:pt-0">
        <div>
          <p className="text-muted-foreground text-xs">Current quote total</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {money(total)}
          </p>
        </div>
        <div className="max-w-40 text-right text-xs">
          <p className={cn(readOnly ? "text-warning" : "text-success")}>
            {syncMessage}
          </p>
        </div>
      </div>
    </header>
  );
}

function LedgerSectionNav() {
  const sections = [
    "summary",
    "labour",
    "materials",
    "questions",
    "files",
    "review",
  ];
  return (
    <nav
      aria-label="Field Ledger sections"
      className="sticky top-0 z-30 -mx-3 mt-4 flex gap-1 overflow-x-auto border-y bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5"
    >
      {sections.map((section) => (
        <Button
          className="shrink-0 capitalize"
          key={section}
          onClick={() =>
            document
              .getElementById(section)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          size="sm"
          variant="ghost"
        >
          {section === "files" ? "Files & notes" : section}
        </Button>
      ))}
    </nav>
  );
}

function LedgerSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section
      className="scroll-mt-24 border-muted border-b-4 last:border-b-0"
      id={id}
    >
      <header className="border-b bg-muted/18 px-4 py-4 sm:px-6">
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </header>
      <div className="px-4 py-6 sm:px-6">{children}</div>
    </section>
  );
}

function LedgerNotice({
  children,
  icon,
  title,
  variant,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
  variant: "warning" | "error";
}) {
  return (
    <div className="p-4 sm:p-5">
      <Alert variant={variant}>
        {icon}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    </div>
  );
}

function PackageSummary({
  access,
  accountClaimActions,
}: {
  access: QuoteAccess;
  accountClaimActions?: ReactNode;
}) {
  const permit = access.package.attachments.find(
    (attachment) => attachment.kind === "permit"
  );
  return (
    <div className="grid gap-5">
      <div className="grid divide-y border-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <PackageFact
          label="Permit"
          value={permit?.fileName ?? "Included in package"}
        />
        <PackageFact label="Site" value={access.package.siteAddress} />
        <PackageFact
          label="Timeline starts"
          value={formatDate(access.package.timelineStartDate)}
        />
        <PackageFact
          label="Response deadline"
          value={formatDateTime(access.package.responseDeadline)}
        />
      </div>
      <details className="group border-b pb-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium text-sm">
          Permit, map, timeline, specifications, attachments, and disclosures
          <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" />
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <MapPinned className="mt-0.5 size-4 text-primary" />
              <div className="min-w-0">
                <p className="font-medium text-sm">Site and map</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {access.package.siteAddress}
                </p>
                <Button
                  className="mt-3"
                  render={
                    <a
                      href={access.package.siteMapUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="sr-only">Open issued map</span>
                    </a>
                  }
                  size="sm"
                  variant="outline"
                >
                  Open issued map <ExternalLink />
                </Button>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <p className="font-medium text-sm">Timeline</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Current day {access.package.timelineCurrentDay ?? "not published"}{" "}
              · planned range {access.package.timelineRangeMin ?? "—"}–
              {access.package.timelineRangeMax ?? "—"}
            </p>
          </Card>
          <Card className="p-4">
            <p className="font-medium text-sm">Package attachments</p>
            <ul className="mt-3 grid gap-2 text-xs">
              {access.package.attachments.map((attachment) => (
                <li
                  className="flex items-center justify-between gap-2"
                  key={attachment.sourceAttachmentId}
                >
                  <span className="min-w-0 truncate">
                    {attachment.fileName}
                  </span>
                  <Badge variant="outline">{attachment.kind}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <p className="font-medium text-sm">Private-response disclosure</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Other recipient responses, internal pricing, and peer information
              are not shown here. DrawFlow does not recommend or calculate your
              price.
            </p>
          </Card>
        </div>
      </details>
      {accountClaimActions ? (
        <Frame>
          <FramePanel className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium text-sm">Optional account claim</p>
              <p className="mt-1 max-w-2xl text-muted-foreground text-xs">
                Claiming adds authenticated access only to this recipient
                profile’s Quote Invitations. It does not enroll you as a partner
                or change this response.
              </p>
            </div>
            {accountClaimActions}
          </FramePanel>
        </Frame>
      ) : null}
    </div>
  );
}

function PackageFact({ label, value }: { label: string; value: string }) {
  return (
    <dl className="min-w-0 px-0 py-3 first:pt-0 last:pb-0 sm:px-4 sm:last:pr-0 sm:last:pb-3 sm:first:pt-3 sm:first:pl-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 truncate font-medium text-sm">{value}</dd>
    </dl>
  );
}

function PricingBand({
  lines,
  onAmountChange,
  readOnly,
  scope,
  subtotal,
  values,
}: {
  lines: PricingDisplayLine[];
  onAmountChange: (line: DraftLinePatch, value: string) => void;
  readOnly: boolean;
  scope: "labour" | "materials";
  subtotal: number;
  values: Record<string, number | undefined>;
}) {
  const scopeLabel = scope === "labour" ? "Labour" : "Materials";
  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Badge variant={scope === "labour" ? "info" : "warning"}>
            {scopeLabel}
          </Badge>
          <p className="mt-2 font-medium text-sm">
            {scope === "labour" ? "Work pricing" : "Material pricing"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Subtotal</p>
          <p className="font-semibold tabular-nums">{money(subtotal)}</p>
        </div>
      </div>
      <Frame data-testid={`pricing-band-${scope}`}>
        <FramePanel className="overflow-hidden p-0">
          <div className="hidden grid-cols-[2.2rem_minmax(0,1fr)_minmax(10rem,.9fr)_9rem] gap-3 bg-muted/45 px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-[0.08em] sm:grid">
            <span>#</span>
            <span>Requested line</span>
            <span>Assigned scope</span>
            <span className="text-right">Quoted amount</span>
          </div>
          {lines.length ? (
            lines.map((line, index) => (
              <PricingRow
                amount={values[line.line.lineKey]}
                index={index + 1}
                key={line.line.lineKey}
                line={line}
                onAmountChange={onAmountChange}
                readOnly={readOnly}
              />
            ))
          ) : (
            <p className="p-4 text-muted-foreground text-sm">
              No {scopeLabel.toLowerCase()} pricing rows were issued.
            </p>
          )}
          <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-3 text-sm">
            <span className="text-muted-foreground">{scopeLabel} subtotal</span>
            <span className="font-semibold tabular-nums">
              {money(subtotal)}
            </span>
          </div>
        </FramePanel>
      </Frame>
    </div>
  );
}

function PricingRow({
  amount,
  index,
  line,
  onAmountChange,
  readOnly,
}: {
  amount: number | undefined;
  index: number;
  line: PricingDisplayLine;
  onAmountChange: (line: DraftLinePatch, value: string) => void;
  readOnly: boolean;
}) {
  const { context, detail, line: patch, meta } = line;
  return (
    <Card className="rounded-none border-0 border-b shadow-none before:hidden">
      <CardPanel className="grid gap-3 p-3 sm:grid-cols-[2.2rem_minmax(0,1fr)_minmax(10rem,.9fr)_9rem] sm:items-start">
        <span className="font-semibold text-muted-foreground text-sm tabular-nums">
          {String(index).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">{patch.title}</p>
          {meta ? (
            <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
          ) : null}
          {context ? (
            <p className="mt-1 text-muted-foreground text-xs">{context}</p>
          ) : null}
          {detail ? (
            <details className="group mt-2">
              <summary className="cursor-pointer text-primary text-xs">
                View issued scope and specifications
              </summary>
              <FieldRichTextPreview
                ariaLabel={`Issued scope for ${patch.title}`}
                className="mt-2"
                value={detail}
              />
            </details>
          ) : null}
        </div>
        <div>
          <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-[0.08em] sm:sr-only">
            Assigned scope
          </p>
          <p className="font-medium text-sm">
            {patch.source === "expanded_scope"
              ? "Expanded scope"
              : patch.scope === "labour"
                ? "Issued labour scope"
                : patch.scope === "materials"
                  ? "Issued material scope"
                  : "Whole quote"}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {patch.source === "template_priced"
              ? "Configured response pricing field"
              : "Frozen package revision"}
          </p>
        </div>
        <div>
          <label
            className="mb-1 block font-medium text-muted-foreground text-xs uppercase tracking-[0.08em]"
            htmlFor={`quote-${patch.lineKey}`}
          >
            Quoted amount
            <span className="sr-only"> for {patch.title}</span>
          </label>
          <Input
            aria-label={`Quoted amount for ${patch.title}`}
            disabled={readOnly}
            id={`quote-${patch.lineKey}`}
            inputMode="decimal"
            min="0"
            nativeInput
            onBlur={(event) => onAmountChange(patch, event.currentTarget.value)}
            onChange={(event) =>
              onAmountChange(patch, event.currentTarget.value)
            }
            placeholder="$0.00"
            step="0.01"
            type="number"
            value={amount === undefined ? "" : (amount / 100).toFixed(2)}
          />
        </div>
      </CardPanel>
    </Card>
  );
}

function ResponseFields({
  access,
  answers,
  onAnswerChange,
  onFileChange,
  readOnly,
  uploading,
}: {
  access: QuoteAccess;
  answers: Record<string, string | undefined>;
  onAnswerChange: (
    fieldId: Id<"quotePackageRevisionResponseFields">,
    value: string
  ) => void;
  onFileChange: (
    event: ChangeEvent<HTMLInputElement>,
    fieldId?: Id<"quotePackageRevisionResponseFields">
  ) => void;
  readOnly: boolean;
  uploading: boolean;
}) {
  const fields = access.package.responseFields.filter(
    (field) => field.kind !== "priced_line"
  );
  if (!fields.length) {
    return (
      <p className="text-muted-foreground text-sm">
        No additional response fields were issued.
      </p>
    );
  }
  return (
    <div className="grid gap-5">
      {fields.map((field) => (
        <ResponseFieldControl
          field={field}
          key={field.sourceFieldId}
          onAnswerChange={onAnswerChange}
          onFileChange={onFileChange}
          readOnly={readOnly}
          uploading={uploading}
          value={answers[field.sourceFieldId] ?? ""}
        />
      ))}
    </div>
  );
}

type ResponseField = QuoteAccess["package"]["responseFields"][number];

function ResponseFieldControl({
  field,
  onAnswerChange,
  onFileChange,
  readOnly,
  uploading,
  value,
}: {
  field: ResponseField;
  onAnswerChange: (
    fieldId: Id<"quotePackageRevisionResponseFields">,
    value: string
  ) => void;
  onFileChange: (
    event: ChangeEvent<HTMLInputElement>,
    fieldId?: Id<"quotePackageRevisionResponseFields">
  ) => void;
  readOnly: boolean;
  uploading: boolean;
  value: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <label
            className="font-medium text-sm"
            htmlFor={`field-${field.sourceFieldId}`}
          >
            {field.label}
          </label>
          <p className="mt-1 text-muted-foreground text-xs">
            {field.required ? "Required before submission" : "Optional"} ·{" "}
            {field.scope.replace("_", " ")}
          </p>
        </div>
        <Badge variant={field.required ? "success" : "outline"}>
          {field.required ? "Required" : "Optional"}
        </Badge>
      </div>
      {field.richTextDefaultHtml ? (
        <FieldRichTextPreview
          ariaLabel={`${field.label} instructions`}
          className="mb-3"
          value={field.richTextDefaultHtml}
        />
      ) : null}
      <ResponseFieldInput
        field={field}
        onAnswerChange={onAnswerChange}
        onFileChange={onFileChange}
        readOnly={readOnly}
        uploading={uploading}
        value={value}
      />
    </div>
  );
}

function ResponseFieldInput({
  field,
  onAnswerChange,
  onFileChange,
  readOnly,
  uploading,
  value,
}: {
  field: ResponseField;
  onAnswerChange: (
    fieldId: Id<"quotePackageRevisionResponseFields">,
    value: string
  ) => void;
  onFileChange: (
    event: ChangeEvent<HTMLInputElement>,
    fieldId?: Id<"quotePackageRevisionResponseFields">
  ) => void;
  readOnly: boolean;
  uploading: boolean;
  value: string;
}): ReactNode {
  if (field.kind === "attachment") {
    return (
      <Input
        accept="*/*"
        aria-label={`Attach file for ${field.label}`}
        disabled={readOnly || uploading}
        id={`field-${field.sourceFieldId}`}
        nativeInput
        onChange={(event) => onFileChange(event, field.sourceFieldId)}
        type="file"
      />
    );
  }
  if (field.renderer === "tiptap") {
    return readOnly ? (
      value ? (
        <FieldRichTextPreview
          ariaLabel={`${field.label} response`}
          value={value}
        />
      ) : (
        <p className="text-muted-foreground text-sm">No response was saved.</p>
      )
    ) : (
      <FieldRichTextEditor
        ariaLabel={field.label}
        id={`field-${field.sourceFieldId}`}
        onChange={(next) => onAnswerChange(field.sourceFieldId, next)}
        placeholder={`Respond to ${field.label}`}
        value={value}
      />
    );
  }
  if (field.kind === "long_text") {
    return (
      <Textarea
        disabled={readOnly}
        id={`field-${field.sourceFieldId}`}
        onBlur={(event) =>
          onAnswerChange(field.sourceFieldId, event.currentTarget.value)
        }
        onChange={(event) =>
          onAnswerChange(field.sourceFieldId, event.currentTarget.value)
        }
        placeholder={`Respond to ${field.label}`}
        value={value}
      />
    );
  }
  if (field.kind === "choice") {
    return (
      <NativeSelect
        aria-label={field.label}
        disabled={readOnly}
        onChange={(event) =>
          onAnswerChange(field.sourceFieldId, event.currentTarget.value)
        }
        value={value}
      >
        <NativeSelectOption value="">Select an option</NativeSelectOption>
        {(field.choiceOptions ?? []).map((option) => (
          <NativeSelectOption key={option} value={option}>
            {option}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    );
  }
  return (
    <Input
      disabled={readOnly}
      id={`field-${field.sourceFieldId}`}
      nativeInput
      onBlur={(event) =>
        onAnswerChange(field.sourceFieldId, event.currentTarget.value)
      }
      onChange={(event) =>
        onAnswerChange(field.sourceFieldId, event.currentTarget.value)
      }
      type={field.kind === "date" ? "date" : "text"}
      value={value}
    />
  );
}

function ExpandedScopeEditor({
  amount,
  lines,
  onAdd,
  onAmountChange,
  onRemove,
  onScopeChange,
  onTitleChange,
  readOnly,
  scope,
  title,
  values,
}: {
  amount: string;
  lines: DraftLinePatch[];
  onAdd: () => void;
  onAmountChange: (value: string) => void;
  onRemove: (lineKey: string) => void;
  onScopeChange: (value: "labour" | "materials") => void;
  onTitleChange: (value: string) => void;
  readOnly: boolean;
  scope: "labour" | "materials";
  title: string;
  values: Record<string, number | undefined>;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-sm">Expanded scope</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Add a clearly separated item without modifying the issued pricing
            rows.
          </p>
        </div>
        <Badge variant="outline">Separate from issued scope</Badge>
      </div>
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto]">
          <Input
            aria-label="Expanded scope title"
            disabled={readOnly}
            nativeInput
            onChange={(event) => onTitleChange(event.currentTarget.value)}
            placeholder="Expanded scope title"
            value={title}
          />
          <Input
            aria-label="Expanded scope quoted amount"
            disabled={readOnly}
            inputMode="decimal"
            min="0"
            nativeInput
            onChange={(event) => onAmountChange(event.currentTarget.value)}
            placeholder="$0.00"
            step="0.01"
            type="number"
            value={amount}
          />
          <NativeSelect
            aria-label="Expanded scope type"
            disabled={readOnly}
            onChange={(event) =>
              onScopeChange(event.currentTarget.value as "labour" | "materials")
            }
            value={scope}
          >
            <NativeSelectOption value="labour">Labour</NativeSelectOption>
            <NativeSelectOption value="materials">Materials</NativeSelectOption>
          </NativeSelect>
          <Button
            aria-label="Add expanded scope"
            disabled={readOnly}
            onClick={onAdd}
            size="icon"
            variant="outline"
          >
            <Plus />
          </Button>
        </div>
      </Card>
      {lines.length ? (
        <div className="mt-3 grid gap-2">
          {lines.map((line) => (
            <Card
              className="flex-row items-center gap-3 p-3"
              key={line.lineKey}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{line.title}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Expanded {line.scope} scope
                </p>
              </div>
              <p className="font-semibold text-sm tabular-nums">
                {money(values[line.lineKey] ?? 0)}
              </p>
              <Button
                disabled={readOnly}
                onClick={() => onRemove(line.lineKey)}
                size="sm"
                variant="outline"
              >
                Remove
              </Button>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResponseAttachments({
  attachments,
  attachmentError,
  onFileChange,
  readOnly,
  uploading,
}: {
  attachments: NonNullable<QuoteDraft>["attachments"];
  attachmentError: string | null;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readOnly: boolean;
  uploading: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-sm">Response attachments</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Supporting files remain private to this Field Ledger draft.
          </p>
        </div>
        <Badge variant="outline">20 MB each</Badge>
      </div>
      <Input
        aria-label="Attach supporting response file"
        disabled={readOnly || uploading}
        nativeInput
        onChange={onFileChange}
        type="file"
      />
      {uploading ? (
        <p className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="size-3 animate-spin" />
          Uploading and attaching file…
        </p>
      ) : null}
      {attachmentError ? (
        <p
          className="mt-2 flex items-center gap-2 text-destructive text-xs"
          role="alert"
        >
          <CircleAlert className="size-3" />
          {attachmentError}
        </p>
      ) : null}
      {attachments.length ? (
        <ul className="mt-3 grid gap-2">
          {attachments.map((attachment) => (
            <li
              className="flex items-center justify-between gap-3 border-b py-2 text-sm"
              key={attachment.storageId}
            >
              <span className="min-w-0 truncate">{attachment.fileName}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {formatBytes(attachment.sizeBytes)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ReviewBand({
  expandedSubtotal,
  labourSubtotal,
  materialSubtotal,
  readOnly,
  total,
}: {
  expandedSubtotal: number;
  labourSubtotal: number;
  materialSubtotal: number;
  readOnly: boolean;
  total: number;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <Badge variant={readOnly ? "outline" : "info"}>
          {readOnly ? "Read-only" : "Draft review"}
        </Badge>
        <h3 className="mt-3 font-semibold text-xl">Review your Field Ledger</h3>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Labour, materials, and expanded scope remain distinct here. Immutable
          submit, revise, and withdraw actions are intentionally introduced in
          the next workflow.
        </p>
      </div>
      <Frame>
        <FramePanel className="grid gap-3 p-4 sm:grid-cols-2">
          <ReviewFact label="Labour" value={money(labourSubtotal)} />
          <ReviewFact label="Materials" value={money(materialSubtotal)} />
          <ReviewFact label="Expanded scope" value={money(expandedSubtotal)} />
          <ReviewFact label="Current draft total" strong value={money(total)} />
        </FramePanel>
      </Frame>
      <Alert variant="info">
        <ShieldCheck />
        <AlertTitle>One revision, one response</AlertTitle>
        <AlertDescription>
          Your draft is scoped only to Package Revision information shown above.
          Internal teams receive progress metadata, not your prices, answers,
          notes, or files.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ReviewFact({
  label,
  strong,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "mt-1 tabular-nums",
          strong ? "font-semibold text-lg" : "font-medium"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LedgerRail({
  access,
  readOnly,
  total,
}: {
  access: QuoteAccess;
  readOnly: boolean;
  total: number;
}) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-24 divide-y border-y">
        <section className="py-4">
          <p className="font-semibold text-sm">Package reference</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Revision {access.package.revision} · private invitation
          </p>
        </section>
        <section className="py-4">
          <p className="font-medium text-sm">{access.package.siteAddress}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            Due {formatDateTime(access.package.responseDeadline)}
          </p>
        </section>
        <section className="py-4">
          <p className="text-muted-foreground text-xs">Field Ledger total</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {money(total)}
          </p>
          <p
            className={cn(
              "mt-2 text-xs",
              readOnly ? "text-warning" : "text-success"
            )}
          >
            {readOnly ? "Read-only package" : "Autosaves are enabled"}
          </p>
        </section>
      </div>
    </aside>
  );
}

function LedgerPersistentReview({
  readOnly,
  syncMessage,
  total,
}: {
  readOnly: boolean;
  syncMessage: string;
  total: number;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-3 py-2 backdrop-blur sm:px-5">
      <div className="mx-auto flex max-w-[88rem] items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            aria-live="polite"
            className="truncate text-muted-foreground text-xs"
          >
            {syncMessage}
          </p>
          <p className="font-semibold text-sm tabular-nums">{money(total)}</p>
        </div>
        <Button
          onClick={() =>
            document
              .getElementById("review")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          variant={readOnly ? "outline" : "default"}
        >
          Review quote <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function LedgerRecoverySurface({
  kind,
  onReopenInvitation,
}: {
  kind: "superseded" | "unavailable";
  onReopenInvitation?: () => void;
}) {
  const superseded = kind === "superseded";
  return (
    <main className="grid min-h-svh place-items-center bg-bg-base p-4">
      <Frame className="w-full max-w-xl">
        <FramePanel className="p-6">
          <Badge variant="outline">Private invitation</Badge>
          <h1 className="mt-3 font-semibold text-xl">
            {superseded
              ? "Package replaced"
              : "Field Ledger access interrupted"}
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {superseded
              ? "This package revision was replaced. Use the newest invitation supplied by the issuing team; no previous draft content is shown here."
              : "No further package or response content was loaded. Reopen the original invitation after checking your connection."}
          </p>
          <div className="mt-6">
            <Button onClick={onReopenInvitation} variant="outline">
              <RefreshCw />
              Reopen invitation
            </Button>
          </div>
        </FramePanel>
      </Frame>
    </main>
  );
}

function isReadableDraft(
  result: DraftReadResult | undefined
): result is ReadableDraftResult {
  return result?.status === "available" || result?.status === "read_only";
}

function stateFromDraft(draft: QuoteDraft): LocalLedgerState {
  return {
    amounts: Object.fromEntries(
      (draft?.lineItems ?? []).map((line) => [
        line.lineKey,
        line.quotedAmountCents,
      ])
    ),
    answers: Object.fromEntries(
      (draft?.responses ?? []).map((answer) => [
        answer.sourcePackageRevisionResponseFieldId,
        answer.value,
      ])
    ),
    commentsHtml: draft?.commentsHtml ?? "",
    expandedLines: (draft?.lineItems ?? [])
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
    version: draft?.version ?? 0,
  };
}

function packagePricingLines(
  access: QuoteAccess,
  scope: "labour" | "materials",
  _ledger: LocalLedgerState
): PricingDisplayLine[] {
  const packageLines: PricingDisplayLine[] =
    scope === "labour"
      ? access.package.labourLines.map((line) => ({
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

function sumPricingLines(
  lines: PricingDisplayLine[],
  amounts: Record<string, number | undefined>
) {
  return lines.reduce(
    (total, { line }) => total + (amounts[line.lineKey] ?? 0),
    0
  );
}

function sumDraftLines(
  lines: DraftLinePatch[],
  amounts: Record<string, number | undefined>
) {
  return lines.reduce((total, line) => total + (amounts[line.lineKey] ?? 0), 0);
}

function mergeDraftPatches(
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

function restoreInFlightPatch(inFlight: DraftPatch, newer: DraftPatch | null) {
  return newer ? mergeDraftPatches(inFlight, newer) : inFlight;
}

function draftSaveErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(CONVEX_ERROR_PREFIX, "")
    : "Your local changes are still on this device. Retry when connected.";
}

function scheduleFlush(
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

function runFlush(flush: () => Promise<void>) {
  flush().catch(() => undefined);
}

async function uploadResponseFile(
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

function usePresentationClock(boundaries: Array<number | undefined>) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`)
  );
}
function formatDateTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
function formatBytes(value: number) {
  return value < 1024 * 1024
    ? `${Math.max(1, Math.round(value / 1024))} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function money(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}
function safeClientKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
}
function uploadFailureMessage(
  status: "read_only" | "superseded" | "unavailable"
) {
  return status === "read_only"
    ? "The response window closed before this file could attach."
    : status === "superseded"
      ? "This package was replaced before the file could attach."
      : "This invitation session ended before the file could attach.";
}
