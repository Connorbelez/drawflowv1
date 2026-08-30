import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  BatchDraft,
  CostDocumentDraftSaveInput,
  DraftAutosaveState,
  DraftAutosaveStatus,
  DraftEditor,
  DraftStep,
} from "./CostDocumentBatchWorkspaceModel.ts";
import {
  autosavePayload,
  DRAFT_AUTOSAVE_DELAY_MS,
  editorOverrideForAutosave,
  errorMessage,
} from "./CostDocumentBatchWorkspaceModel.ts";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";

interface CostDocumentBatchPersistenceContext {
  activeDraftIdRef: MutableRefObject<string | undefined>;
  actorCapacityInput: Record<string, unknown>;
  bindDraftPageAsset: (input: never) => Promise<unknown>;
  draftAutosaveStatesRef: MutableRefObject<Map<string, DraftAutosaveState>>;
  draftEditorsRef: MutableRefObject<Map<string, DraftEditor>>;
  draftRevisionsRef: MutableRefObject<Map<string, number>>;
  draftsByIdRef: MutableRefObject<Map<string, BatchDraft>>;
  editorRef: MutableRefObject<DraftEditor | null>;
  localRowCounter: MutableRefObject<number>;
  persistDraftEditorRef: MutableRefObject<
    ((draftId: string) => Promise<void>) | undefined
  >;
  saveDraft: (input: never) => Promise<unknown>;
  setAutosaveStatuses: Dispatch<
    SetStateAction<Record<string, DraftAutosaveStatus>>
  >;
  setDraftError: Dispatch<SetStateAction<string | undefined>>;
  setDraftOverrides: Dispatch<
    SetStateAction<Record<string, Partial<BatchDraft>>>
  >;
  setDraftStep: (input: never) => Promise<unknown>;
  setEditor: Dispatch<SetStateAction<DraftEditor | null>>;
  submilestones: CostDocumentSubmilestoneOption[];
}

export function createCostDocumentBatchPersistence({
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
}: CostDocumentBatchPersistenceContext) {
  const nextLocalRowId = (prefix: string) => {
    localRowCounter.current += 1;
    return `${prefix}-${localRowCounter.current}`;
  };

  const updateDraftOverride = (draftId: string, patch: Partial<BatchDraft>) => {
    setDraftOverrides((current) => ({
      ...current,
      [draftId]: { ...current[draftId], ...patch },
    }));
  };

  const revisionForDraft = (draftId: string) =>
    draftRevisionsRef.current.get(draftId) ??
    draftsByIdRef.current.get(draftId)?.revision ??
    1;

  const recordDraftRevision = (
    draftId: string,
    result: unknown,
    expectedRevision: number
  ) => {
    const returnedRevision =
      typeof result === "object" &&
      result !== null &&
      "revision" in result &&
      typeof result.revision === "number"
        ? result.revision
        : expectedRevision + 1;
    draftRevisionsRef.current.set(draftId, returnedRevision);
    updateDraftOverride(draftId, { revision: returnedRevision });
    return returnedRevision;
  };

  const saveDraftWithRevision = async (input: CostDocumentDraftSaveInput) => {
    const draftKey = String(input.draftId);
    const expectedRevision = revisionForDraft(draftKey);
    const result = await saveDraft({
      ...input,
      ...actorCapacityInput,
      expectedRevision,
    } as never);
    recordDraftRevision(draftKey, result, expectedRevision);
    return result;
  };

  const setDraftStepWithRevision = async (input: {
    complete?: boolean;
    draftId: Id<"costDocumentDrafts">;
    step: DraftStep;
  }) => {
    const draftKey = String(input.draftId);
    const expectedRevision = revisionForDraft(draftKey);
    const result = await setDraftStep({
      ...input,
      ...actorCapacityInput,
      expectedRevision,
    } as never);
    recordDraftRevision(draftKey, result, expectedRevision);
    return result;
  };

  const bindDraftPageAssetWithRevision = async (input: {
    assetId: Id<"buildCollaborationAssets">;
    draftId: Id<"costDocumentDrafts">;
    replaceAssetId?: Id<"buildCollaborationAssets">;
  }) => {
    const draftKey = String(input.draftId);
    const expectedRevision = revisionForDraft(draftKey);
    const result = await bindDraftPageAsset({
      ...input,
      ...actorCapacityInput,
      expectedRevision,
    } as never);
    recordDraftRevision(draftKey, result, expectedRevision);
    return result;
  };

  function replaceEditor(nextEditor: DraftEditor | null) {
    editorRef.current = nextEditor;
    if (nextEditor) {
      draftEditorsRef.current.set(nextEditor.draftId, nextEditor);
    }
    setEditor(nextEditor);
  }

  function autosaveStateFor(draftId: string) {
    const existing = draftAutosaveStatesRef.current.get(draftId);
    if (existing) {
      return existing;
    }
    const created: DraftAutosaveState = {
      requestedVersion: 0,
      savedVersion: 0,
    };
    draftAutosaveStatesRef.current.set(draftId, created);
    return created;
  }

  async function persistDraftEditor(draftId: string): Promise<void> {
    const state = autosaveStateFor(draftId);
    if (state.inFlight) {
      await state.inFlight;
      if (state.savedVersion < state.requestedVersion) {
        await persistDraftEditor(draftId);
      }
      return;
    }
    if (state.savedVersion >= state.requestedVersion) {
      return;
    }
    const currentEditor = draftEditorsRef.current.get(draftId);
    if (!currentEditor) {
      return;
    }
    const version = state.requestedVersion;
    const payload = autosavePayload(currentEditor);
    setAutosaveStatuses((current) => ({ ...current, [draftId]: "saving" }));
    const request = saveDraftWithRevision(payload);
    state.inFlight = request;
    let saved = false;
    try {
      await request;
      saved = true;
      state.savedVersion = version;
      updateDraftOverride(
        draftId,
        editorOverrideForAutosave(
          currentEditor,
          draftsByIdRef.current.get(draftId),
          submilestones
        )
      );
      setAutosaveStatuses((current) => ({ ...current, [draftId]: "saved" }));
    } catch (cause) {
      setAutosaveStatuses((current) => ({ ...current, [draftId]: "error" }));
      if (activeDraftIdRef.current === draftId) {
        setDraftError(
          errorMessage(cause, "Unable to save this Cost Document draft.")
        );
      }
      throw cause;
    } finally {
      if (state.inFlight === request) {
        state.inFlight = undefined;
      }
    }
    if (saved && state.savedVersion < state.requestedVersion) {
      await persistDraftEditor(draftId);
    }
  }

  persistDraftEditorRef.current = persistDraftEditor;

  function scheduleDraftAutosave(nextEditor: DraftEditor) {
    const draftId = nextEditor.draftId;
    const state = autosaveStateFor(draftId);
    state.requestedVersion += 1;
    if (state.timer) {
      clearTimeout(state.timer);
    }
    setAutosaveStatuses((current) => ({ ...current, [draftId]: "pending" }));
    state.timer = setTimeout(() => {
      state.timer = undefined;
      const persistence = persistDraftEditorRef.current?.(draftId);
      if (persistence) {
        persistence.catch(() => undefined);
      }
    }, DRAFT_AUTOSAVE_DELAY_MS);
  }

  async function flushDraftAutosave(draftId?: string) {
    if (!draftId) {
      return;
    }
    const state = autosaveStateFor(draftId);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    await persistDraftEditor(draftId);
  }

  return {
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
  };
}
