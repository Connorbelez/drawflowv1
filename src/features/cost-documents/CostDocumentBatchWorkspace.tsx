import { useAction, useMutation, useQuery } from "convex/react";
import { LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { SheetFooter, SheetPanel } from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createCostDocumentBatchDraftActions } from "./CostDocumentBatchWorkspaceDraftActions.ts";
import { CostDocumentDraftEditor } from "./CostDocumentBatchWorkspaceEditor.tsx";
import type {
  BatchDraft,
  BatchProjection,
  CostDocumentBatchWorkspaceProps as CostDocumentBatchWorkspacePropsType,
  CostDocumentCategory,
  DraftAutosaveState,
  DraftAutosaveStatus,
  DraftEditor,
  ExactDraftProjection,
} from "./CostDocumentBatchWorkspaceModel.ts";
import { draftToEditor } from "./CostDocumentBatchWorkspaceModel.ts";
import { createCostDocumentBatchPersistence } from "./CostDocumentBatchWorkspacePersistence.ts";
import {
  CostDocumentBatchLaunchPanel,
  CostDocumentBatchSheet,
  CostDocumentRegister,
} from "./CostDocumentBatchWorkspaceShell.tsx";
import { createCostDocumentBatchStepActions } from "./CostDocumentBatchWorkspaceStepActions.ts";
import { EmptyBatchEditor } from "./CostDocumentBatchWorkspaceSteps.tsx";
import { CostDocumentRoadmapReconciliation } from "./CostDocumentRoadmapReconciliation.tsx";

export type { CostDocumentBatchWorkspaceProps } from "./CostDocumentBatchWorkspaceModel.ts";

function useCostDocumentBatchRouteLifecycle({
  activeBatchId,
  batchId,
  dismissedBatchId,
  markBatchReported,
  onBatchIdChange,
  readLastReportedBatchId,
  setDismissedBatchId,
}: {
  activeBatchId?: string;
  batchId?: string;
  dismissedBatchId?: string;
  markBatchReported: (batchId: string) => void;
  onBatchIdChange: (batchId?: string) => void;
  readLastReportedBatchId: () => string | undefined;
  setDismissedBatchId: (batchId?: string) => void;
}) {
  useEffect(() => {
    if (!activeBatchId || dismissedBatchId === activeBatchId) {
      return;
    }
    if (
      batchId !== activeBatchId &&
      readLastReportedBatchId() !== activeBatchId
    ) {
      markBatchReported(activeBatchId);
      onBatchIdChange(activeBatchId);
    }
  }, [
    activeBatchId,
    batchId,
    dismissedBatchId,
    markBatchReported,
    onBatchIdChange,
    readLastReportedBatchId,
  ]);

  useEffect(() => {
    if (batchId && batchId !== dismissedBatchId) {
      setDismissedBatchId(undefined);
    }
  }, [batchId, dismissedBatchId, setDismissedBatchId]);
}

function useReconcileOptimisticCostDocumentDrafts({
  activeBatch,
  setOptimisticDrafts,
}: {
  activeBatch: BatchProjection | null;
  setOptimisticDrafts: (
    updater: (current: BatchDraft[]) => BatchDraft[]
  ) => void;
}) {
  useEffect(() => {
    const serverDraftIds = new Set(
      (activeBatch?.drafts ?? []).map((draft) => String(draft._id))
    );
    setOptimisticDrafts((current) =>
      current.filter((draft) => !serverDraftIds.has(String(draft._id)))
    );
  }, [activeBatch?.drafts, setOptimisticDrafts]);
}

/**
 * The route-addressable Batch Capture surface. Drafts remain server-owned and
 * owner-private here; this component only keeps enough local edit state to
 * avoid losing a field while the active draft projection refreshes.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This route coordinator intentionally owns the ordered autosave, upload, and draft-state transitions so those durable boundaries cannot diverge across hooks.
export function CostDocumentBatchWorkspace({
  actorCapacity,
  batchId,
  buildId,
  draftId,
  onBatchIdChange,
  organizationId,
  reconciliation,
  submilestones,
}: CostDocumentBatchWorkspacePropsType) {
  const actorCapacityInput = actorCapacity ? { actorCapacity } : {};
  const activeBatchRecoveryQuery = useQuery(
    api.cost_documents.getActiveCostDocumentBatch,
    batchId || draftId || reconciliation?.selectedCostDocumentId
      ? "skip"
      : ({ buildId, organizationId, ...actorCapacityInput } as never)
  ) as BatchProjection | null | undefined;
  const routeBatchQuery = useQuery(
    api.cost_documents.getCostDocumentBatch,
    batchId && !draftId
      ? ({
          batchId,
          buildId,
          organizationId,
          ...actorCapacityInput,
        } as never)
      : "skip"
  ) as BatchProjection | null | undefined;
  const exactDraftQuery = useQuery(
    api.cost_documents.getCostDocumentDraft,
    draftId
      ? ({
          buildId,
          draftId: draftId as Id<"costDocumentDrafts">,
          organizationId,
          ...actorCapacityInput,
        } as never)
      : "skip"
  ) as ExactDraftProjection | null | undefined;
  const batchQuery = batchId ? routeBatchQuery : activeBatchRecoveryQuery;
  const createBatch = useMutation(api.cost_documents.createCostDocumentBatch);
  const addDraft = useMutation(api.cost_documents.addCostDocumentDraft);
  const saveDraft = useMutation(api.cost_documents.saveCostDocumentDraft);
  const setDraftStep = useMutation(api.cost_documents.setCostDocumentDraftStep);
  const bindDraftPageAsset = useMutation(
    api.cost_documents.bindCostDocumentDraftPageAsset
  );
  const submitBatch = useMutation(api.cost_documents.submitCostDocumentBatch);
  const grantDraftCollaborator = useMutation(
    api.cost_documents.grantCostDocumentDraftCollaborator
  );
  const revokeDraftCollaborator = useMutation(
    api.cost_documents.revokeCostDocumentDraftCollaborator
  );
  const beginUpload = useMutation(
    api.build_collaboration_assets.beginBuildCollaborationAssetUpload
  );
  const registerUpload = useMutation(
    api.build_collaboration_assets
      .registerBuildCollaborationAssetUploadedStorage
  );
  const finalizeAndScan = useAction(
    api.build_collaboration_asset_actions
      .finalizeAndScanBuildCollaborationAssetUpload
  );
  const abandonAssets = useMutation(
    api.build_collaboration_assets.abandonMyBuildCollaborationAssets
  );
  const authorizeAssetDownload = useMutation(
    api.build_collaboration_assets.authorizeBuildCollaborationAssetDownload
  );
  const authorizeDraftPage = useCallback(
    (assetId: Id<"buildCollaborationAssets">) => {
      if (typeof authorizeAssetDownload !== "function") {
        return Promise.reject(new Error("Source preview is unavailable."));
      }
      return authorizeAssetDownload({
        assetId,
        buildId,
        organizationId,
      } as never) as Promise<string>;
    },
    [authorizeAssetDownload, buildId, organizationId]
  );

  const [dismissedBatchId, setDismissedBatchId] = useState<string>();
  const [entryError, setEntryError] = useState<string>();
  const [startingBatch, setStartingBatch] = useState(false);
  const [addingDraft, setAddingDraft] = useState(false);
  const [newKind, setNewKind] = useState<CostDocumentKind>("invoice");
  const [newCategory, setNewCategory] =
    useState<CostDocumentCategory>("materials");
  const [optimisticDrafts, setOptimisticDrafts] = useState<BatchDraft[]>([]);
  const [draftOverrides, setDraftOverrides] = useState<
    Record<string, Partial<BatchDraft>>
  >({});
  const [activeDraftId, setActiveDraftId] = useState<string>();
  const [editor, setEditor] = useState<DraftEditor | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingPages, setUploadingPages] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string>();
  const [collaborationBusy, setCollaborationBusy] = useState(false);
  const [collaborationError, setCollaborationError] = useState<string>();
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [batchSubmitError, setBatchSubmitError] = useState<string>();
  const [duplicateOverrideRequired, setDuplicateOverrideRequired] =
    useState(false);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState("");
  const [autosaveStatuses, setAutosaveStatuses] = useState<
    Record<string, DraftAutosaveStatus>
  >({});
  const createIdempotencyKey = useRef<string>();
  const submitIdempotencyKeys = useRef(new Map<string, string>());
  const duplicateOverrideBatchIdRef = useRef<string>();
  const localRowCounter = useRef(0);
  const lastReportedBatchId = useRef<string>();
  const activeDraftIdRef = useRef<string>();
  const draftEditorsRef = useRef(new Map<string, DraftEditor>());
  const editorRef = useRef<DraftEditor | null>(null);
  const draftAutosaveStatesRef = useRef(new Map<string, DraftAutosaveState>());
  const persistDraftEditorRef = useRef<(draftId: string) => Promise<void>>();
  const draftsByIdRef = useRef(new Map<string, BatchDraft>());
  const draftRevisionsRef = useRef(new Map<string, number>());
  const uploadingDraftIdRef = useRef<string>();
  const switchingDraftRef = useRef(false);
  const pendingFilesDraftIdRef = useRef<string>();

  const activeBatch = batchQuery?.state === "active" ? batchQuery : null;
  const activeBatchId = activeBatch ? String(activeBatch._id) : undefined;
  const exactDraft = draftId ? exactDraftQuery : null;
  const serverDrafts = useMemo(
    () => (exactDraft ? [exactDraft] : (activeBatch?.drafts ?? [])),
    [activeBatch?.drafts, exactDraft]
  );

  const drafts = useMemo(() => {
    const serverDraftIds = new Set(
      serverDrafts.map((draft) => String(draft._id))
    );
    const localOnly = exactDraft
      ? []
      : optimisticDrafts.filter(
          (draft) => !serverDraftIds.has(String(draft._id))
        );
    return [...serverDrafts, ...localOnly]
      .map((draft) => {
        const override = draftOverrides[String(draft._id)];
        return {
          ...draft,
          ...override,
          revision: Math.max(draft.revision ?? 1, override?.revision ?? 0),
        };
      })
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }, [draftOverrides, exactDraft, optimisticDrafts, serverDrafts]);

  const activeDraft =
    drafts.find((draft) => String(draft._id) === activeDraftId) ?? drafts[0];
  draftsByIdRef.current = new Map(
    drafts.map((draft) => [String(draft._id), draft])
  );

  const sheetOpen = Boolean(
    draftId || batchId || (activeBatchId && activeBatchId !== dismissedBatchId)
  );

  useEffect(() => {
    if (duplicateOverrideBatchIdRef.current === activeBatchId) {
      return;
    }
    duplicateOverrideBatchIdRef.current = activeBatchId;
    setDuplicateOverrideRequired(false);
    setDuplicateOverrideReason("");
  }, [activeBatchId]);

  const readLastReportedBatchId = useCallback(
    () => lastReportedBatchId.current,
    []
  );
  const markBatchReported = useCallback((batchId: string) => {
    lastReportedBatchId.current = batchId;
  }, []);

  useCostDocumentBatchRouteLifecycle({
    activeBatchId,
    batchId,
    dismissedBatchId,
    markBatchReported,
    onBatchIdChange,
    readLastReportedBatchId,
    setDismissedBatchId,
  });

  useReconcileOptimisticCostDocumentDrafts({
    activeBatch: draftId ? null : activeBatch,
    setOptimisticDrafts,
  });

  useEffect(() => {
    if (
      activeDraftId &&
      drafts.some((draft) => String(draft._id) === activeDraftId)
    ) {
      return;
    }
    setActiveDraftId(activeDraft ? String(activeDraft._id) : undefined);
  }, [activeDraft, activeDraftId, drafts]);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  useEffect(() => {
    const overridesToClear: string[] = [];
    for (const serverDraft of serverDrafts) {
      const draftKey = String(serverDraft._id);
      const serverRevision = serverDraft.revision ?? 1;
      const trackedRevision = draftRevisionsRef.current.get(draftKey);
      if (trackedRevision === undefined) {
        draftRevisionsRef.current.set(draftKey, serverRevision);
        continue;
      }
      const autosaveState = draftAutosaveStatesRef.current.get(draftKey);
      const hasLocalDraftOperation =
        uploadingDraftIdRef.current === draftKey ||
        Boolean(
          autosaveState &&
            (autosaveState.requestedVersion > autosaveState.savedVersion ||
              autosaveState.inFlight ||
              autosaveState.timer)
        );
      if (hasLocalDraftOperation || serverRevision < trackedRevision) {
        continue;
      }

      // A clean editor may adopt a newer reactive projection. A dirty editor
      // deliberately keeps its original base revision so autosave conflicts
      // instead of overwriting another collaborator's intervening update.
      draftRevisionsRef.current.set(draftKey, serverRevision);
      const nextEditor = draftToEditor(serverDraft);
      draftEditorsRef.current.set(draftKey, nextEditor);
      if (
        activeDraftIdRef.current === draftKey ||
        (!activeDraftIdRef.current && activeDraftId === draftKey)
      ) {
        editorRef.current = nextEditor;
        setEditor(nextEditor);
      }
      overridesToClear.push(draftKey);
    }
    if (overridesToClear.length > 0) {
      setDraftOverrides((current) => {
        const next = { ...current };
        let changed = false;
        for (const draftKey of overridesToClear) {
          if (next[draftKey]) {
            delete next[draftKey];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
  }, [activeDraftId, serverDrafts]);

  useEffect(() => {
    // Query and optimistic-override refreshes create new draft objects. They
    // must not discard a selected file queue; only the resolved draft identity
    // may invalidate that queue.
    const resolvedDraftId = activeDraft
      ? String(activeDraft._id)
      : activeDraftId;
    const draftChanged = pendingFilesDraftIdRef.current !== resolvedDraftId;
    pendingFilesDraftIdRef.current = resolvedDraftId;
    if (!activeDraft) {
      editorRef.current = null;
      setEditor(null);
      if (draftChanged) {
        setPendingFiles([]);
        setDraftError(undefined);
      }
      return;
    }
    const draftId = String(activeDraft._id);
    if (editorRef.current?.draftId !== draftId) {
      const cachedEditor =
        draftEditorsRef.current.get(draftId) ?? draftToEditor(activeDraft);
      draftEditorsRef.current.set(draftId, cachedEditor);
      editorRef.current = cachedEditor;
      setEditor(cachedEditor);
    }
    if (draftChanged) {
      setPendingFiles([]);
      setDraftError(undefined);
    }
  }, [activeDraft, activeDraftId]);

  const persistence = createCostDocumentBatchPersistence({
    actorCapacityInput,
    activeDraftIdRef,
    bindDraftPageAsset,
    draftAutosaveStatesRef,
    draftEditorsRef,
    draftRevisionsRef,
    draftsByIdRef,
    editorRef,
    localRowCounter,
    persistDraftEditorRef,
    saveDraft,
    setAutosaveStatuses,
    setDraftError,
    setDraftOverrides,
    setDraftStep,
    setEditor,
    submilestones,
  });
  const {
    bindDraftPageAssetWithRevision,
    flushDraftAutosave,
    nextLocalRowId,
    persistDraftEditor,
    recordDraftRevision,
    replaceEditor,
    saveDraftWithRevision,
    scheduleDraftAutosave,
    setDraftStepWithRevision,
    updateDraftOverride,
  } = persistence;
  persistDraftEditorRef.current = persistDraftEditor;

  useEffect(() => {
    const flushPendingDraftAutosaves = () => {
      for (const [draftId, state] of draftAutosaveStatesRef.current) {
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = undefined;
        }
        const persistence = persistDraftEditorRef.current?.(draftId);
        if (persistence) {
          persistence.catch(() => undefined);
        }
      }
    };
    window.addEventListener("pagehide", flushPendingDraftAutosaves);
    return () => {
      window.removeEventListener("pagehide", flushPendingDraftAutosaves);
      flushPendingDraftAutosaves();
    };
  }, []);

  const draftActions = createCostDocumentBatchDraftActions({
    abandonAssets,
    activeBatch,
    activeBatchId,
    activeDraft,
    activeDraftIdRef,
    actorCapacityInput,
    addDraft,
    beginUpload,
    bindDraftPageAssetWithRevision,
    buildId,
    createBatch,
    createIdempotencyKey,
    draftEditorsRef,
    drafts,
    draftsByIdRef,
    editor,
    editorRef,
    finalizeAndScan,
    flushDraftAutosave,
    lastReportedBatchId,
    newCategory,
    newKind,
    onBatchIdChange,
    organizationId,
    pendingFiles,
    registerUpload,
    replaceEditor,
    saveDraftWithRevision,
    scheduleDraftAutosave,
    setActiveDraftId,
    setAddingDraft,
    setDismissedBatchId,
    setDraftBusy,
    setDraftError,
    setEntryError,
    setOptimisticDrafts,
    setPendingFiles,
    setStartingBatch,
    setUploadingPages,
    submilestones,
    switchingDraftRef,
    updateDraftOverride,
    uploadingDraftIdRef,
  });
  const {
    close,
    createDraft,
    moveSavedPage,
    removeSavedPage,
    replaceSavedPage,
    resumeBatch,
    saveCaptureFacts,
    selectDraft,
    startBatch,
    uploadCurrentPages,
    uploadPages,
    updateEditor,
  } = draftActions;

  const stepActions = createCostDocumentBatchStepActions({
    activeBatch,
    activeDraft,
    activeDraftIdRef,
    actorCapacityInput,
    draftEditorsRef,
    drafts,
    duplicateOverrideReason,
    editor,
    flushDraftAutosave,
    grantDraftCollaborator,
    onBatchIdChange,
    pendingFiles,
    recordDraftRevision,
    revokeDraftCollaborator,
    saveCaptureFacts,
    saveDraftWithRevision,
    setBatchSubmitError,
    setCollaborationBusy,
    setCollaborationError,
    setDismissedBatchId,
    setDraftBusy,
    setDraftError,
    setDraftOverrides,
    setDraftStepWithRevision,
    setDuplicateOverrideRequired,
    setDuplicateOverrideReason,
    setSubmittingBatch,
    submittingBatch,
    submitBatch,
    submitIdempotencyKeys,
    updateDraftOverride,
    uploadingDraftIdRef,
    submilestones,
    uploadCurrentPages,
  });
  const {
    allDraftsComplete,
    completeDraft,
    continueDraft,
    goBack,
    grantCollaborator,
    moveToPriorStep,
    reopenDraft,
    revokeCollaborator,
    submitCurrentBatch,
  } = stepActions;

  if (!sheetOpen) {
    const launchPanel = (
      <CostDocumentBatchLaunchPanel
        activeBatch={activeBatch}
        data-testid="cost-document-batch-workspace"
        error={entryError}
        onResume={resumeBatch}
        onStart={startBatch}
        starting={startingBatch}
      />
    );
    if (!reconciliation) {
      return launchPanel;
    }
    return (
      <div className="space-y-4">
        {launchPanel}
        <CostDocumentRoadmapReconciliation
          actorCapacity={actorCapacity}
          buildId={buildId}
          interactionMode={
            actorCapacity === "homeowner"
              ? "read-only"
              : actorCapacity === "admin" ||
                  actorCapacity === "principle-broker"
                ? "brokerage-review"
                : "standard"
          }
          onCloseCostDocument={() => reconciliation.onCostDocumentIdChange()}
          onOpenCostDocument={reconciliation.onCostDocumentIdChange}
          onStartCorrection={reconciliation.onCostDocumentCorrectionStarted}
          organizationId={organizationId}
          selectedCostDocumentId={reconciliation.selectedCostDocumentId}
          submilestones={submilestones}
        />
      </div>
    );
  }

  const workspaceQuery = draftId ? exactDraftQuery : batchQuery;

  if (workspaceQuery === undefined) {
    return (
      <CostDocumentBatchSheet
        duplicateOverrideRequired={duplicateOverrideRequired}
        exactDraft={Boolean(draftId)}
        onClose={close}
        uploadingPages={uploadingPages}
      >
        <Frame data-testid="cost-document-batch-workspace">
          <FramePanel className="flex min-h-56 items-center justify-center p-6 text-muted-foreground text-sm">
            {draftId
              ? "Checking your access to this Cost Document Draft…"
              : "Recovering your private Cost Document draft…"}
          </FramePanel>
        </Frame>
      </CostDocumentBatchSheet>
    );
  }

  if (draftId && !exactDraft) {
    return (
      <CostDocumentBatchSheet exactDraft onClose={close}>
        <Frame data-testid="cost-document-batch-workspace">
          <FrameHeader>
            <FrameTitle>Cost Document Draft unavailable</FrameTitle>
            <FrameDescription>
              This exact Draft is no longer shared with you or is outside your
              current Build participation.
            </FrameDescription>
          </FrameHeader>
          <FramePanel>
            <Alert variant="warning">
              <LockKeyhole />
              <AlertTitle>Access ended</AlertTitle>
              <AlertDescription>
                Draft access is rechecked on every read and write. Prior
                contributions remain attributed in the durable history.
              </AlertDescription>
            </Alert>
          </FramePanel>
        </Frame>
      </CostDocumentBatchSheet>
    );
  }

  if (!(draftId || activeBatch)) {
    return (
      <CostDocumentBatchSheet onClose={close}>
        <Frame data-testid="cost-document-batch-workspace">
          <FrameHeader>
            <FrameTitle>Cost Document batch unavailable</FrameTitle>
            <FrameDescription>
              The route does not resolve to an active private batch. Start a new
              batch when you are ready to capture source records.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="space-y-4">
            <Alert variant="error">
              <AlertTitle>Recovery needed</AlertTitle>
              <AlertDescription>
                This batch may already be submitted or no longer be available to
                your Build participation.
              </AlertDescription>
            </Alert>
            <Button loading={startingBatch} onClick={startBatch}>
              <Plus /> Start Cost Document batch
            </Button>
            {entryError ? (
              <Alert variant="error">
                <AlertTitle>Batch not started</AlertTitle>
                <AlertDescription>{entryError}</AlertDescription>
              </Alert>
            ) : null}
          </FramePanel>
        </Frame>
      </CostDocumentBatchSheet>
    );
  }

  return (
    <div data-testid="cost-document-batch-workspace">
      <CostDocumentBatchSheet
        duplicateOverrideRequired={duplicateOverrideRequired}
        exactDraft={Boolean(draftId)}
        onClose={close}
        uploadingPages={uploadingPages}
      >
        <SheetPanel className="p-3 sm:p-5">
          <div
            className={
              draftId
                ? "mx-auto w-full max-w-5xl"
                : "mx-auto grid w-full max-w-[90rem] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]"
            }
          >
            {draftId ? null : (
              <CostDocumentRegister
                activeDraftId={String(activeDraft?._id ?? "")}
                addingDraft={addingDraft}
                drafts={drafts}
                newCategory={newCategory}
                newKind={newKind}
                onAdd={createDraft}
                onCategoryChange={setNewCategory}
                onKindChange={setNewKind}
                onSelect={selectDraft}
                selectionLocked={Boolean(
                  uploadingDraftIdRef.current || draftBusy
                )}
              />
            )}
            <div className="min-w-0" data-testid="cost-document-batch-editor">
              {activeDraft && editor ? (
                <CostDocumentDraftEditor
                  actorCapacity={actorCapacity}
                  autosaveStatus={autosaveStatuses[String(activeDraft._id)]}
                  buildId={buildId}
                  busy={draftBusy || uploadingPages}
                  collaborationBusy={collaborationBusy}
                  collaborationError={collaborationError}
                  draft={activeDraft}
                  editor={editor}
                  error={draftError}
                  onAddAllocation={() =>
                    updateEditor({
                      allocations: [
                        ...editor.allocations,
                        {
                          amount: "",
                          buildSubmilestoneId: "",
                          id: nextLocalRowId("allocation"),
                        },
                      ],
                    })
                  }
                  onAuthorizePage={authorizeDraftPage}
                  onBack={goBack}
                  onComplete={completeDraft}
                  onContinue={continueDraft}
                  onEditorChange={updateEditor}
                  onGrantCollaborator={grantCollaborator}
                  onMoveSavedPage={moveSavedPage}
                  onMoveToPriorStep={moveToPriorStep}
                  onPendingFilesChange={setPendingFiles}
                  onRemoveAllocation={(rowId) =>
                    updateEditor({
                      allocations: editor.allocations.filter(
                        (row) => row.id !== rowId
                      ),
                    })
                  }
                  onRemoveSavedPage={removeSavedPage}
                  onReopen={reopenDraft}
                  onReplaceSavedPage={replaceSavedPage}
                  onRevokeCollaborator={revokeCollaborator}
                  onUploadPages={uploadPages}
                  organizationId={organizationId}
                  pendingFiles={pendingFiles}
                  submilestones={submilestones}
                  uploadingPages={uploadingPages}
                />
              ) : (
                <EmptyBatchEditor />
              )}
            </div>
          </div>
        </SheetPanel>
        {!draftId && activeDraft?.capabilities?.canSubmitBatch ? (
          <SheetFooter className="gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
            <div className="mr-auto flex min-w-0 items-center gap-2 text-muted-foreground text-sm">
              <LockKeyhole className="size-4 shrink-0" />
              <span className="truncate">
                {
                  drafts.filter((draft) => draft.lifecycle === "complete")
                    .length
                }{" "}
                of {drafts.length} complete
              </span>
            </div>
            <Button
              data-testid="batch-submit"
              disabled={
                !allDraftsComplete ||
                submittingBatch ||
                (duplicateOverrideRequired &&
                  duplicateOverrideReason.trim().length === 0)
              }
              loading={submittingBatch}
              onClick={submitCurrentBatch}
            >
              <ShieldCheck />
              {submittingBatch
                ? "Freezing batch…"
                : `Submit ${drafts.length || ""} Cost Document${drafts.length === 1 ? "" : "s"}`}
            </Button>
          </SheetFooter>
        ) : null}
        {!draftId && batchSubmitError ? (
          <div className="space-y-4 border-t px-6 pb-4">
            <Alert
              className="mt-4"
              data-testid="batch-submit-error"
              variant="error"
            >
              <AlertTitle>Batch not submitted</AlertTitle>
              <AlertDescription>{batchSubmitError}</AlertDescription>
            </Alert>
            {duplicateOverrideRequired ? (
              <CostDocumentDuplicateOverridePrompt
                onReasonChange={setDuplicateOverrideReason}
                reason={duplicateOverrideReason}
              />
            ) : null}
          </div>
        ) : null}
      </CostDocumentBatchSheet>
    </div>
  );
}

export function CostDocumentDuplicateOverridePrompt({
  onReasonChange,
  reason,
}: {
  onReasonChange: (reason: string) => void;
  reason: string;
}) {
  return (
    <Field data-testid="duplicate-override-field">
      <FieldLabel htmlFor="cost-document-duplicate-override">
        Likely duplicate override reason
      </FieldLabel>
      <Textarea
        id="cost-document-duplicate-override"
        onChange={(event) => onReasonChange(event.target.value)}
        placeholder="Explain why this is a separate source record."
        value={reason}
      />
      <FieldDescription>
        This decision is written to the immutable Cost Document audit trail.
        Exact source duplicates cannot be overridden.
      </FieldDescription>
    </Field>
  );
}
