import { useMutation } from "convex/react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  useQuoteFieldLedgerAccess,
  useQuoteResponseLifecycle,
} from "./QuoteFieldLedgerAccess";
import type {
  DraftConflict,
  DraftLinePatch,
  DraftPatch,
  LocalLedgerState,
  QuoteAccess,
  StagedAttachment,
} from "./QuoteFieldLedgerContracts";
import {
  copiedValuesConfirmationBlocked,
  copiedValuesFlushBlocked,
  draftSaveErrorMessage,
  handleCopiedValuesConfirmationResult,
  invokeRecipientMutation,
  lifecycleErrorMessage,
  lifecycleFailureMessage,
  mergeDraftPatches,
  parseQuotedCents,
  restoreInFlightPatch,
  safeClientKey,
  scheduleFlush,
  stateFromResponse,
  uploadFailureMessage,
  uploadResponseFile,
  usePresentationClock,
} from "./QuoteFieldLedgerUtils";

export function useQuoteFieldLedgerRuntime({
  hasAuthenticatedUser,
  initialAccess,
  sessionToken,
}: {
  hasAuthenticatedUser: boolean;
  initialAccess: QuoteAccess;
  sessionToken?: string;
}) {
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
  const lifecycle = useQuoteResponseLifecycle({
    hasAuthenticatedUser,
    quoteRoundInvitationId: initialAccess.invitationId,
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
  const submitBrowserResponse = useMutation(
    api.quote_response_submissions.submitQuoteInvitationResponse
  );
  const submitClaimedResponse = useMutation(
    api.quote_response_submissions.submitClaimedQuoteInvitationResponse
  );
  const startBrowserRevision = useMutation(
    api.quote_response_submissions.startQuoteInvitationResponseRevision
  );
  const startClaimedRevision = useMutation(
    api.quote_response_submissions.startClaimedQuoteInvitationResponseRevision
  );
  const withdrawBrowserResponse = useMutation(
    api.quote_response_submissions.withdrawQuoteInvitationResponse
  );
  const withdrawClaimedResponse = useMutation(
    api.quote_response_submissions.withdrawClaimedQuoteInvitationResponse
  );
  const acknowledgeBrowserRevision = useMutation(
    api.quote_round_lifecycle.acknowledgeQuoteInvitationPackageRevision
  );
  const acknowledgeClaimedRevision = useMutation(
    api.quote_round_lifecycle.acknowledgeClaimedQuoteInvitationPackageRevision
  );
  const confirmCopiedBrowserValues = useMutation(
    api.quote_response_drafts.confirmCopiedQuoteInvitationResponseDraftValues
  );
  const confirmCopiedClaimedValues = useMutation(
    api.quote_response_drafts
      .confirmCopiedClaimedQuoteInvitationResponseDraftValues
  );

  const access = activeRead.access;

  const responseLedgerSource =
    activeRead.draft ??
    lifecycle?.result.draft ??
    lifecycle?.result.currentSubmission ??
    null;
  const copiedResponseDraft =
    activeRead.draft ?? lifecycle?.result.draft ?? null;
  const initialState = useMemo(
    () => stateFromResponse(responseLedgerSource),
    [responseLedgerSource]
  );
  const [ledger, setLedger] = useState<LocalLedgerState>(initialState);
  const [syncMessage, setSyncMessage] = useState("Opening saved draft…");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lifecyclePending, setLifecyclePending] = useState<
    "submit" | "revise" | "withdraw" | null
  >(null);
  const revisionAcknowledgementRequired =
    lifecycle?.result.status === "acknowledgement_required" &&
    lifecycle.result.revisionAcknowledgement.required &&
    lifecycle.result.revisionAcknowledgement.status === "pending";
  const [acknowledgementPending, setAcknowledgementPending] = useState(false);
  const [copiedValuesPending, setCopiedValuesPending] = useState(false);
  const [confirmedCopiedSourceVersion, setConfirmedCopiedSourceVersion] =
    useState<number | null>(null);
  const copiedValuesConfirmationRequired =
    copiedResponseDraft?.copiedValuesConfirmationState === "pending" &&
    copiedResponseDraft.version !== confirmedCopiedSourceVersion;
  const responseWritesLocked =
    readOnly ||
    revisionAcknowledgementRequired ||
    acknowledgementPending ||
    Boolean(lifecyclePending) ||
    Boolean(lifecycle?.result.currentSubmission && !lifecycle.result.draft);
  const controlsLocked = responseWritesLocked || Boolean(conflict);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  const [withdrawalExplanation, setWithdrawalExplanation] = useState("");
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
  const submissionIdempotencyKeyRef = useRef<string | null>(null);

  const acknowledgeRevision = useCallback(async () => {
    const projection = lifecycle?.result.revisionAcknowledgement;
    if (!(revisionAcknowledgementRequired && projection)) {
      return;
    }
    setAcknowledgementPending(true);
    setSyncError(null);
    try {
      const input = {
        acknowledgedFieldKeys: projection.changedFieldKeys,
        quoteRoundInvitationId: access.invitationId,
      };
      const result = usingClaimedAccess
        ? await acknowledgeClaimedRevision(input)
        : sessionToken
          ? await acknowledgeBrowserRevision({ ...input, sessionToken })
          : { status: "unavailable" as const };
      if (result.status === "acknowledged") {
        setLifecycleMessage("Package revision acknowledged. You can now edit.");
      } else {
        setSyncError(
          "This invitation session ended before the package revision could be acknowledged."
        );
      }
    } catch (error) {
      setSyncError(
        draftSaveErrorMessage(
          error instanceof Error
            ? error
            : "The package revision could not be acknowledged."
        )
      );
    } finally {
      setAcknowledgementPending(false);
    }
  }, [
    access.invitationId,
    acknowledgeBrowserRevision,
    acknowledgeClaimedRevision,
    lifecycle,
    revisionAcknowledgementRequired,
    sessionToken,
    usingClaimedAccess,
  ]);

  const confirmCopiedResponseValues = useCallback(async () => {
    if (
      copiedValuesConfirmationBlocked({
        hasDraft: Boolean(copiedResponseDraft),
        hasPendingConfirmation: copiedValuesConfirmationRequired,
        hasConflict: Boolean(conflictRef.current),
        flushing: flushingRef.current,
        readOnly,
        responseWritesLocked,
      })
    ) {
      return;
    }
    if (!copiedResponseDraft) {
      return;
    }
    const sourceVersion = copiedResponseDraft.version;
    setCopiedValuesPending(true);
    setSyncError(null);
    try {
      if (pendingRef.current) {
        await flushRef.current();
      }
      if (
        copiedValuesFlushBlocked({
          hasPendingPatch: Boolean(pendingRef.current),
          hasConflict: Boolean(conflictRef.current),
          flushing: flushingRef.current,
          readOnly,
          responseWritesLocked,
        })
      ) {
        return;
      }
      const input = {
        expectedVersion: versionRef.current,
        quoteRoundInvitationId: access.invitationId,
      };
      const result = usingClaimedAccess
        ? await confirmCopiedClaimedValues(input)
        : sessionToken
          ? await confirmCopiedBrowserValues({ ...input, sessionToken })
          : { status: "unavailable" as const };
      handleCopiedValuesConfirmationResult(result, sourceVersion, {
        conflictRef,
        pendingRef,
        setConfirmedSourceVersion: setConfirmedCopiedSourceVersion,
        setConflict,
        setLifecycleMessage,
        setSyncError,
        versionRef,
      });
    } catch (error) {
      setSyncError(
        lifecycleErrorMessage(
          error,
          "Copied response values could not be confirmed."
        )
      );
    } finally {
      setCopiedValuesPending(false);
    }
  }, [
    access.invitationId,
    confirmCopiedBrowserValues,
    confirmCopiedClaimedValues,
    copiedResponseDraft,
    copiedValuesConfirmationRequired,
    readOnly,
    responseWritesLocked,
    sessionToken,
    usingClaimedAccess,
  ]);

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
    const next = stateFromResponse(responseLedgerSource);
    versionRef.current = next.version;
    setLedger(next);
    setSyncMessage(next.version ? "Saved to DrawFlow" : "No draft yet");
    setSyncError(null);
  }, [responseLedgerSource]);

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
      responseWritesLocked ||
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
        case "revision_required":
          setSyncError(
            "The current quote is already submitted. Start Revise quote before making changes."
          );
          break;
        case "acknowledgement_required":
          setSyncError(
            "Review and acknowledge the updated package before making changes."
          );
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
      if (pendingRef.current && !responseWritesLocked && !conflictRef.current) {
        scheduleFlush(timerRef, flush);
      }
    }
  }, [invokeSave, responseWritesLocked]);

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
      if (controlsLocked) {
        return;
      }
      localEditsRef.current = true;
      pendingRef.current = mergeDraftPatches(pendingRef.current, patch);
      setSyncMessage("Saved on this device · syncing…");
      setSyncError(null);
      scheduleFlush(timerRef, flush);
    },
    [controlsLocked, flush]
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
        case "revision_required":
        case "acknowledgement_required":
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
    if (!file || controlsLocked) {
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

  const submitCurrentDraft = async () => {
    if (
      !lifecycle ||
      lifecyclePending ||
      controlsLocked ||
      copiedValuesConfirmationRequired
    ) {
      return;
    }
    setLifecyclePending("submit");
    setLifecycleMessage(null);
    try {
      await flush();
      if (pendingRef.current || conflictRef.current || flushingRef.current) {
        setLifecycleMessage(
          "Resolve and save the current Field Ledger changes before submitting."
        );
        return;
      }
      const idempotencyKey =
        submissionIdempotencyKeyRef.current ??
        `quote-response:${safeClientKey()}`;
      submissionIdempotencyKeyRef.current = idempotencyKey;
      const input = {
        expectedDraftVersion: versionRef.current,
        idempotencyKey,
        quoteRoundInvitationId: access.invitationId,
      };
      const result = await invokeRecipientMutation({
        browserMutation: submitBrowserResponse,
        claimedMutation: submitClaimedResponse,
        input,
        sessionToken,
        usingClaimedAccess: lifecycle.usingClaimedAccess,
      });
      if (result.status === "accepted" && result.submission) {
        submissionIdempotencyKeyRef.current = null;
        setLifecycleMessage(
          result.idempotentReplay
            ? `Revision ${result.submission.revision} was already accepted.`
            : `Revision ${result.submission.revision} submitted.`
        );
        return;
      }
      setLifecycleMessage(lifecycleFailureMessage(result.status));
    } catch (error) {
      setLifecycleMessage(
        lifecycleErrorMessage(
          error,
          "The quote was not submitted. Retry with the same saved draft."
        )
      );
    } finally {
      setLifecyclePending(null);
    }
  };

  const startResponseRevision = async () => {
    const currentSubmission = lifecycle?.result.currentSubmission;
    if (
      !(lifecycle && currentSubmission) ||
      lifecyclePending ||
      controlsLocked
    ) {
      return;
    }
    setLifecyclePending("revise");
    setLifecycleMessage(null);
    try {
      const input = {
        expectedSubmissionRevision: currentSubmission.revision,
        quoteRoundInvitationId: access.invitationId,
      };
      const result = await invokeRecipientMutation({
        browserMutation: startBrowserRevision,
        claimedMutation: startClaimedRevision,
        input,
        sessionToken,
        usingClaimedAccess: lifecycle.usingClaimedAccess,
      });
      if (result.status === "draft_ready" && result.draft) {
        versionRef.current = result.draft.version;
        setLifecycleMessage(
          `Revision ${currentSubmission.revision} remains authoritative until you resubmit.`
        );
        return;
      }
      setLifecycleMessage(lifecycleFailureMessage(result.status));
    } catch (error) {
      setLifecycleMessage(
        lifecycleErrorMessage(error, "A revision draft could not be started.")
      );
    } finally {
      setLifecyclePending(null);
    }
  };

  const withdrawCurrentResponse = async () => {
    const currentSubmission = lifecycle?.result.currentSubmission;
    if (
      !(lifecycle && currentSubmission) ||
      lifecyclePending ||
      controlsLocked
    ) {
      return;
    }
    setLifecyclePending("withdraw");
    setLifecycleMessage(null);
    try {
      const explanation = withdrawalExplanation.trim();
      const input = {
        confirmed: true,
        expectedSubmissionRevision: currentSubmission.revision,
        explanation: explanation || undefined,
        quoteRoundInvitationId: access.invitationId,
      };
      const result = await invokeRecipientMutation({
        browserMutation: withdrawBrowserResponse,
        claimedMutation: withdrawClaimedResponse,
        input,
        sessionToken,
        usingClaimedAccess: lifecycle.usingClaimedAccess,
      });
      if (result.status === "withdrawn" && result.submission) {
        setWithdrawalExplanation("");
        setLifecycleMessage(
          `Revision ${result.submission.revision} withdrawn. Its immutable history remains available.`
        );
        return;
      }
      setLifecycleMessage(lifecycleFailureMessage(result.status));
    } catch (error) {
      setLifecycleMessage(
        lifecycleErrorMessage(error, "The submitted quote was not withdrawn.")
      );
    } finally {
      setLifecyclePending(null);
    }
  };

  const loadSavedVersion = useCallback(() => {
    if (!conflict) {
      return;
    }
    const saved = stateFromResponse(conflict.draft);
    pendingRef.current = null;
    conflictRef.current = null;
    setConflict(null);
    localEditsRef.current = false;
    setLedger(saved);
    setSyncMessage(saved.version ? "Saved to DrawFlow" : "No draft yet");
  }, [conflict]);

  return {
    access,
    acknowledgeRevision,
    acknowledgementPending,
    addExpandedScope,
    attachmentError,
    confirmCopiedResponseValues,
    copiedValuesConfirmationRequired,
    copiedValuesPending,
    controlsLocked,
    conflict,
    expandedAmount,
    expandedScope,
    expandedTitle,
    flush,
    ledger,
    lifecycle,
    lifecycleMessage,
    lifecyclePending,
    loadSavedVersion,
    readOnly,
    revisionAcknowledgementRequired,
    removeExpandedScope,
    responseLedgerSource,
    retryConflict,
    serverSuperseded,
    serverUnavailable,
    setExpandedAmount,
    setExpandedScope,
    setExpandedTitle,
    setWithdrawalExplanation,
    startResponseRevision,
    submitCurrentDraft,
    syncError,
    syncMessage,
    uploadAttachment,
    uploading,
    updateAmount,
    updateAnswer,
    updateComments,
    withdrawCurrentResponse,
    withdrawalExplanation,
  };
}
