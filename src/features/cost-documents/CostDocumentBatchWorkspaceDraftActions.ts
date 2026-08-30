import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { uploadGovernedCollaborationAssets } from "#/features/build-collaboration/build-collaboration-asset-upload.ts";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  BatchDraft,
  BatchProjection,
  CostDocumentCategory,
  CostDocumentDraftSaveInput,
  CostDocumentKind,
  DraftEditor,
} from "./CostDocumentBatchWorkspaceModel.ts";
import {
  assertDraftPageUploadFits,
  draftToEditor,
  editorOverrideForAutosave,
  errorMessage,
  MAX_COST_DOCUMENT_PAGES,
  makeIdempotencyKey,
  requiredCaptureFacts,
  serializeDraftWorkingState,
} from "./CostDocumentBatchWorkspaceModel.ts";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";

type AssetUploadDependencies = Parameters<
  typeof uploadGovernedCollaborationAssets
>[1];

interface CostDocumentBatchDraftActionsContext {
  abandonAssets: AssetUploadDependencies["abandonAssets"];
  activeBatch: BatchProjection | null;
  activeBatchId?: string;
  activeDraft?: BatchDraft;
  activeDraftIdRef: MutableRefObject<string | undefined>;
  actorCapacityInput: Record<string, unknown>;
  addDraft: (input: never) => Promise<Id<"costDocumentDrafts">>;
  beginUpload: AssetUploadDependencies["beginUpload"];
  bindDraftPageAssetWithRevision: (input: {
    assetId: Id<"buildCollaborationAssets">;
    draftId: Id<"costDocumentDrafts">;
    replaceAssetId?: Id<"buildCollaborationAssets">;
  }) => Promise<unknown>;
  buildId: Id<"activeBuilds">;
  createBatch: (input: never) => Promise<Id<"costDocumentBatches">>;
  createIdempotencyKey: MutableRefObject<string | undefined>;
  draftEditorsRef: MutableRefObject<Map<string, DraftEditor>>;
  drafts: BatchDraft[];
  draftsByIdRef: MutableRefObject<Map<string, BatchDraft>>;
  editor: DraftEditor | null;
  editorRef: MutableRefObject<DraftEditor | null>;
  finalizeAndScan: AssetUploadDependencies["finalizeAndScan"];
  flushDraftAutosave: (draftId?: string) => Promise<void>;
  lastReportedBatchId: MutableRefObject<string | undefined>;
  newCategory: CostDocumentCategory;
  newKind: CostDocumentKind;
  onBatchIdChange: (batchId?: string) => void;
  organizationId: string;
  pendingFiles: File[];
  registerUpload: AssetUploadDependencies["registerUpload"];
  replaceEditor: (nextEditor: DraftEditor | null) => void;
  saveDraftWithRevision: (
    input: CostDocumentDraftSaveInput
  ) => Promise<unknown>;
  scheduleDraftAutosave: (nextEditor: DraftEditor) => void;
  setActiveDraftId: Dispatch<SetStateAction<string | undefined>>;
  setAddingDraft: Dispatch<SetStateAction<boolean>>;
  setDismissedBatchId: Dispatch<SetStateAction<string | undefined>>;
  setDraftBusy: Dispatch<SetStateAction<boolean>>;
  setDraftError: Dispatch<SetStateAction<string | undefined>>;
  setEntryError: Dispatch<SetStateAction<string | undefined>>;
  setOptimisticDrafts: Dispatch<SetStateAction<BatchDraft[]>>;
  setPendingFiles: Dispatch<SetStateAction<File[]>>;
  setStartingBatch: Dispatch<SetStateAction<boolean>>;
  setUploadingPages: Dispatch<SetStateAction<boolean>>;
  submilestones: CostDocumentSubmilestoneOption[];
  switchingDraftRef: MutableRefObject<boolean>;
  updateDraftOverride: (draftId: string, patch: Partial<BatchDraft>) => void;
  uploadingDraftIdRef: MutableRefObject<string | undefined>;
}

export type CostDocumentBatchUploadCurrentPages = (
  draft: BatchDraft,
  currentEditor: DraftEditor,
  options?: { persistImmediately?: boolean }
) => Promise<string[]>;

export type CostDocumentBatchSaveCaptureFacts = (
  draft: BatchDraft,
  currentEditor: DraftEditor,
  pageAssetIds: string[]
) => Promise<void>;

export function createCostDocumentBatchDraftActions({
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
}: CostDocumentBatchDraftActionsContext) {
  const updateEditor = (patch: Partial<DraftEditor>) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      return;
    }
    const nextEditor = { ...currentEditor, ...patch };
    replaceEditor(nextEditor);
    const draft = draftsByIdRef.current.get(nextEditor.draftId);
    if (draft) {
      updateDraftOverride(
        nextEditor.draftId,
        editorOverrideForAutosave(nextEditor, draft, submilestones)
      );
      scheduleDraftAutosave(nextEditor);
    }
  };

  const selectDraft = async (draft: BatchDraft) => {
    const selectedDraftId = String(draft._id);
    if (uploadingDraftIdRef.current) {
      setDraftError(
        "Wait for this document's source-page upload to finish before switching."
      );
      return;
    }
    if (
      switchingDraftRef.current ||
      selectedDraftId === activeDraftIdRef.current
    ) {
      return;
    }
    switchingDraftRef.current = true;
    try {
      await flushDraftAutosave(editorRef.current?.draftId);
      activeDraftIdRef.current = selectedDraftId;
      setActiveDraftId(selectedDraftId);
      replaceEditor(
        draftEditorsRef.current.get(selectedDraftId) ?? draftToEditor(draft)
      );
      setPendingFiles([]);
      setDraftError(undefined);
    } catch (cause) {
      setDraftError(
        errorMessage(
          cause,
          "Unable to save changes before switching documents."
        )
      );
    } finally {
      switchingDraftRef.current = false;
    }
  };

  const close = async () => {
    if (uploadingDraftIdRef.current) {
      setDraftError(
        "Wait for this document's source-page upload to finish before closing."
      );
      return;
    }
    try {
      await flushDraftAutosave(editorRef.current?.draftId);
      if (activeBatchId) {
        setDismissedBatchId(activeBatchId);
      }
      onBatchIdChange(undefined);
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to save changes before closing this batch.")
      );
    }
  };

  const startBatch = async () => {
    setEntryError(undefined);
    setStartingBatch(true);
    try {
      createIdempotencyKey.current ??= makeIdempotencyKey(
        "cost-document-batch"
      );
      const createdBatchId = await createBatch({
        buildId,
        idempotencyKey: createIdempotencyKey.current,
        organizationId,
        ...actorCapacityInput,
      } as never);
      setDismissedBatchId(undefined);
      lastReportedBatchId.current = String(createdBatchId);
      onBatchIdChange(String(createdBatchId));
    } catch (cause) {
      setEntryError(
        errorMessage(cause, "Unable to start a Cost Document batch.")
      );
    } finally {
      setStartingBatch(false);
    }
  };

  const resumeBatch = () => {
    if (!activeBatchId) {
      return;
    }
    setDismissedBatchId(undefined);
    lastReportedBatchId.current = activeBatchId;
    onBatchIdChange(activeBatchId);
  };

  const createDraft = async () => {
    if (!activeBatch || uploadingDraftIdRef.current) {
      if (uploadingDraftIdRef.current) {
        setEntryError(
          "Wait for the source-page upload to finish before adding another document."
        );
      }
      return;
    }
    setEntryError(undefined);
    setAddingDraft(true);
    try {
      const draftId = await addDraft({
        batchId: activeBatch._id,
        category: newCategory,
        kind: newKind,
        ...actorCapacityInput,
      } as never);
      const draft: BatchDraft = {
        _id: draftId,
        activeStep: "capture_confirm",
        allocations: [],
        batchId: activeBatch._id,
        capabilities: {
          canDiscardBatch: true,
          canEditDraft: true,
          canManageDraftCollaboration: false,
          canManageSourcePages: true,
          canReadDraft: true,
          canSubmitBatch: true,
        },
        category: newCategory,
        currency: "CAD",
        financialComponents: [],
        kind: newKind,
        lifecycle: "draft",
        order:
          Math.max(0, ...drafts.map((existing) => existing.order ?? 0)) + 1,
        pages: [],
        revision: 1,
      };
      setOptimisticDrafts((current) => [...current, draft]);
      const draftEditor = draftToEditor(draft);
      activeDraftIdRef.current = String(draftId);
      setActiveDraftId(String(draftId));
      replaceEditor(draftEditor);
      setPendingFiles([]);
    } catch (cause) {
      setEntryError(errorMessage(cause, "Unable to add this Cost Document."));
    } finally {
      setAddingDraft(false);
    }
  };

  const saveCaptureFacts = async (
    draft: BatchDraft,
    currentEditor: DraftEditor,
    pageAssetIds: string[]
  ) => {
    const facts = requiredCaptureFacts(currentEditor);
    if (pageAssetIds.length === 0) {
      throw new Error("Choose at least one Invoice or Receipt page.");
    }
    await saveDraftWithRevision({
      description: facts.description,
      documentDate: facts.documentDate,
      draftId: draft._id,
      pageAssetIds: pageAssetIds as Id<"buildCollaborationAssets">[],
      title: facts.title,
      vendorProfileId: facts.vendorProfileId,
      vendorName: facts.vendorName,
    });
    updateDraftOverride(String(draft._id), {
      description: facts.description || undefined,
      documentDate: facts.documentDate,
      lifecycle: "draft",
      pages: pageAssetIds.map((assetId, index) => {
        const previous = draft.pages.find(
          (page) => String(page.assetId) === assetId
        );
        return {
          assetId: assetId as Id<"buildCollaborationAssets">,
          fileName: previous?.fileName,
          mimeType: previous?.mimeType,
          order: index + 1,
        };
      }),
      title: facts.title,
      vendorProfileId: facts.vendorProfileId,
      vendorName: facts.vendorName,
    });
    const nextEditor = { ...currentEditor, pageAssetIds };
    draftEditorsRef.current.set(String(draft._id), nextEditor);
    if (activeDraftIdRef.current === String(draft._id)) {
      replaceEditor(nextEditor);
    }
  };

  const uploadCurrentPages = async (
    draft: BatchDraft,
    currentEditor: DraftEditor,
    options?: { persistImmediately?: boolean }
  ) => {
    const draftId = String(draft._id);
    if (uploadingDraftIdRef.current) {
      throw new Error("A source-page upload is already in progress.");
    }
    assertDraftPageUploadFits(draft, pendingFiles);
    const selectedFiles = [...pendingFiles];
    const boundPages = new Map(
      draft.pages.map((page) => [String(page.assetId), page])
    );
    let retainedFileCount = 0;
    uploadingDraftIdRef.current = draftId;
    setUploadingPages(true);
    try {
      await uploadGovernedCollaborationAssets(selectedFiles, {
        abandonAssets,
        beginUpload,
        buildId,
        contextKind: "costDocumentDraft",
        contextRecordId: String(draft._id),
        finalizeAndScan,
        onFinalizedCleanAsset: async ({ assetId, file }) => {
          const binding = await bindDraftPageAssetWithRevision({
            assetId,
            draftId: draft._id,
          });
          retainedFileCount += 1;
          boundPages.set(String(assetId), {
            assetId,
            fileName: file.name,
            mimeType: file.type || undefined,
            order: binding.order,
          });
          const boundPageAssetIds = [...boundPages.values()]
            .sort((left, right) => left.order - right.order)
            .map((page) => String(page.assetId));
          const nextEditor = {
            ...(draftEditorsRef.current.get(draftId) ?? currentEditor),
            pageAssetIds: boundPageAssetIds,
          };
          draftEditorsRef.current.set(draftId, nextEditor);
          updateDraftOverride(draftId, {
            pages: [...boundPages.values()].sort(
              (left, right) => left.order - right.order
            ),
          });
          if (activeDraftIdRef.current === draftId) {
            replaceEditor(nextEditor);
            setPendingFiles(selectedFiles.slice(retainedFileCount));
          }
        },
        organizationId,
        registerUpload,
      });
      const pageAssetIds = [...boundPages.values()]
        .sort((left, right) => left.order - right.order)
        .map((page) => String(page.assetId));
      if (options?.persistImmediately !== false) {
        await saveDraftWithRevision({
          draftId: draft._id,
          pageAssetIds: pageAssetIds as Id<"buildCollaborationAssets">[],
        });
      }
      const nextEditor = {
        ...(draftEditorsRef.current.get(draftId) ?? currentEditor),
        pageAssetIds,
      };
      draftEditorsRef.current.set(draftId, nextEditor);
      if (activeDraftIdRef.current === draftId) {
        replaceEditor(nextEditor);
        setPendingFiles([]);
      }
      return pageAssetIds;
    } finally {
      if (uploadingDraftIdRef.current === draftId) {
        uploadingDraftIdRef.current = undefined;
        setUploadingPages(false);
      }
    }
  };

  const uploadPages = async () => {
    if (
      !(activeDraft && editor) ||
      activeDraft.activeStep !== "capture_confirm"
    ) {
      return;
    }
    setDraftError(undefined);
    try {
      await uploadCurrentPages(activeDraft, editor);
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to upload Cost Document pages.")
      );
    }
  };

  const saveCapturePageManifest = async ({
    draft,
    editor: currentEditor,
    pageAssetIds,
  }: {
    draft: BatchDraft;
    editor: DraftEditor;
    pageAssetIds: string[];
  }) => {
    if (new Set(pageAssetIds).size !== pageAssetIds.length) {
      throw new Error("Each Cost Document source page can appear only once.");
    }
    if (pageAssetIds.length > MAX_COST_DOCUMENT_PAGES) {
      throw new Error(
        `A Cost Document supports at most ${MAX_COST_DOCUMENT_PAGES} pages.`
      );
    }
    const pagesByAssetId = new Map(
      draft.pages.map((page) => [String(page.assetId), page])
    );
    const nextEditor = { ...currentEditor, pageAssetIds };
    await saveDraftWithRevision({
      draftId: draft._id,
      pageAssetIds: pageAssetIds as Id<"buildCollaborationAssets">[],
      workingStateJson: serializeDraftWorkingState(nextEditor),
    });
    draftEditorsRef.current.set(String(draft._id), nextEditor);
    updateDraftOverride(String(draft._id), {
      pages: pageAssetIds.map((assetId, index) => {
        const existing = pagesByAssetId.get(assetId);
        return {
          assetId: assetId as Id<"buildCollaborationAssets">,
          contentHashSha256: existing?.contentHashSha256,
          fileName: existing?.fileName,
          mimeType: existing?.mimeType,
          order: index + 1,
          priorAssetId: existing?.priorAssetId,
          replacedAt: existing?.replacedAt,
        };
      }),
    });
    if (activeDraftIdRef.current === String(draft._id)) {
      replaceEditor(nextEditor);
    }
  };

  const removeSavedPage = async (assetId: string) => {
    if (
      !(activeDraft && editor) ||
      activeDraft.activeStep !== "capture_confirm" ||
      uploadingDraftIdRef.current
    ) {
      return;
    }
    const pageAssetIds = editor.pageAssetIds.filter(
      (pageAssetId) => pageAssetId !== assetId
    );
    if (pageAssetIds.length === editor.pageAssetIds.length) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    try {
      await flushDraftAutosave(String(activeDraft._id));
      const currentEditor =
        draftEditorsRef.current.get(String(activeDraft._id)) ?? editor;
      await saveCapturePageManifest({
        draft: activeDraft,
        editor: currentEditor,
        pageAssetIds: currentEditor.pageAssetIds.filter(
          (pageAssetId) => pageAssetId !== assetId
        ),
      });
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to remove this Cost Document source page.")
      );
    } finally {
      setDraftBusy(false);
    }
  };

  const moveSavedPage = async (assetId: string, direction: -1 | 1) => {
    if (
      !(activeDraft && editor) ||
      activeDraft.activeStep !== "capture_confirm" ||
      uploadingDraftIdRef.current
    ) {
      return;
    }
    const currentIndex = editor.pageAssetIds.indexOf(assetId);
    const nextIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= editor.pageAssetIds.length
    ) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    try {
      await flushDraftAutosave(String(activeDraft._id));
      const currentEditor =
        draftEditorsRef.current.get(String(activeDraft._id)) ?? editor;
      const sourceIndex = currentEditor.pageAssetIds.indexOf(assetId);
      const destinationIndex = sourceIndex + direction;
      if (
        sourceIndex < 0 ||
        destinationIndex < 0 ||
        destinationIndex >= currentEditor.pageAssetIds.length
      ) {
        return;
      }
      const pageAssetIds = [...currentEditor.pageAssetIds];
      const [movedAssetId] = pageAssetIds.splice(sourceIndex, 1);
      if (!movedAssetId) {
        return;
      }
      pageAssetIds.splice(destinationIndex, 0, movedAssetId);
      await saveCapturePageManifest({
        draft: activeDraft,
        editor: currentEditor,
        pageAssetIds,
      });
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to reorder this Cost Document source page.")
      );
    } finally {
      setDraftBusy(false);
    }
  };

  const replaceSavedPage = async (assetId: string, file: File) => {
    if (
      !(activeDraft && editor) ||
      activeDraft.activeStep !== "capture_confirm" ||
      uploadingDraftIdRef.current
    ) {
      return;
    }
    const draftId = String(activeDraft._id);
    const replacementIndex = editor.pageAssetIds.indexOf(assetId);
    if (replacementIndex < 0) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    uploadingDraftIdRef.current = draftId;
    setUploadingPages(true);
    try {
      await flushDraftAutosave(draftId);
      const currentEditor = draftEditorsRef.current.get(draftId) ?? editor;
      let replacementBound = false;
      await uploadGovernedCollaborationAssets([file], {
        abandonAssets,
        beginUpload,
        buildId,
        contextKind: "costDocumentDraft",
        contextRecordId: draftId,
        finalizeAndScan,
        onFinalizedCleanAsset: async ({
          assetId: replacementAssetId,
          file,
        }) => {
          const binding = await bindDraftPageAssetWithRevision({
            assetId: replacementAssetId,
            draftId: activeDraft._id,
            replaceAssetId: assetId as Id<"buildCollaborationAssets">,
          });
          const editorAtBinding =
            draftEditorsRef.current.get(draftId) ?? currentEditor;
          const sourceIndex = editorAtBinding.pageAssetIds.indexOf(assetId);
          if (sourceIndex < 0) {
            throw new Error(
              "The original Cost Document source page is unavailable."
            );
          }
          const replacementPage: BatchDraft["pages"][number] = {
            assetId: replacementAssetId,
            fileName: file.name,
            mimeType: file.type || undefined,
            order: binding.order,
            priorAssetId: assetId as Id<"buildCollaborationAssets">,
            replacedAt: Date.now(),
          };
          const immediatelyBoundEditor = {
            ...editorAtBinding,
            pageAssetIds: editorAtBinding.pageAssetIds.map(
              (pageAssetId, index) =>
                index === sourceIndex ? String(replacementAssetId) : pageAssetId
            ),
          };
          const latestDraft = draftsByIdRef.current.get(draftId) ?? activeDraft;
          const pagesByAssetId = new Map(
            latestDraft.pages.map((page) => [String(page.assetId), page])
          );
          const immediatelyBoundPages = immediatelyBoundEditor.pageAssetIds.map(
            (pageAssetId, index) => {
              if (pageAssetId === String(replacementAssetId)) {
                return replacementPage;
              }
              const existing = pagesByAssetId.get(pageAssetId);
              return {
                assetId: pageAssetId as Id<"buildCollaborationAssets">,
                contentHashSha256: existing?.contentHashSha256,
                fileName: existing?.fileName,
                mimeType: existing?.mimeType,
                order: index + 1,
                priorAssetId: existing?.priorAssetId,
                replacedAt: existing?.replacedAt,
              };
            }
          );
          draftEditorsRef.current.set(draftId, immediatelyBoundEditor);
          updateDraftOverride(draftId, {
            pages: immediatelyBoundPages,
          });
          if (activeDraftIdRef.current === draftId) {
            replaceEditor(immediatelyBoundEditor);
          }
          replacementBound = true;
        },
        organizationId,
        registerUpload,
      });
      if (!replacementBound) {
        throw new Error(
          "The replacement Cost Document source page was not bound."
        );
      }
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to replace this Cost Document source page.")
      );
    } finally {
      if (uploadingDraftIdRef.current === draftId) {
        uploadingDraftIdRef.current = undefined;
        setUploadingPages(false);
      }
      setDraftBusy(false);
    }
  };

  return {
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
  };
}
