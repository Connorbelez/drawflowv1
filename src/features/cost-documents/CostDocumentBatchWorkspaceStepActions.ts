import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  CostDocumentBatchSaveCaptureFacts,
  CostDocumentBatchUploadCurrentPages,
} from "./CostDocumentBatchWorkspaceDraftActions.ts";
import type {
  BatchDraft,
  BatchProjection,
  CostDocumentDraftSaveInput,
  DraftEditor,
  DraftStep,
} from "./CostDocumentBatchWorkspaceModel.ts";
import {
  errorMessage,
  exactBalanceFromEditor,
  makeIdempotencyKey,
  requiredCaptureFacts,
  STEPS,
  stepIndex,
} from "./CostDocumentBatchWorkspaceModel.ts";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";

type AsyncMutation = (input: never) => Promise<unknown>;

interface CostDocumentBatchStepActionsContext {
  activeBatch: BatchProjection | null;
  activeDraft?: BatchDraft;
  actorCapacityInput: Record<string, unknown>;
  draftEditorsRef: MutableRefObject<Map<string, DraftEditor>>;
  drafts: BatchDraft[];
  duplicateOverrideReason: string;
  editor: DraftEditor | null;
  flushDraftAutosave: (draftId?: string) => Promise<void>;
  grantDraftCollaborator: AsyncMutation;
  onBatchIdChange: (batchId?: string) => void;
  pendingFiles: File[];
  recordDraftRevision: (
    draftId: string,
    result: unknown,
    expectedRevision: number
  ) => number;
  revokeDraftCollaborator: AsyncMutation;
  saveCaptureFacts: CostDocumentBatchSaveCaptureFacts;
  saveDraftWithRevision: (
    input: CostDocumentDraftSaveInput
  ) => Promise<unknown>;
  setBatchSubmitError: Dispatch<SetStateAction<string | undefined>>;
  setCollaborationBusy: Dispatch<SetStateAction<boolean>>;
  setCollaborationError: Dispatch<SetStateAction<string | undefined>>;
  setDismissedBatchId: Dispatch<SetStateAction<string | undefined>>;
  setDraftBusy: Dispatch<SetStateAction<boolean>>;
  setDraftError: Dispatch<SetStateAction<string | undefined>>;
  setDraftOverrides: Dispatch<
    SetStateAction<Record<string, Partial<BatchDraft>>>
  >;
  setDraftStepWithRevision: (input: {
    complete?: boolean;
    draftId: Id<"costDocumentDrafts">;
    step: DraftStep;
  }) => Promise<unknown>;
  setDuplicateOverrideReason: Dispatch<SetStateAction<string>>;
  setDuplicateOverrideRequired: Dispatch<SetStateAction<boolean>>;
  setSubmittingBatch: Dispatch<SetStateAction<boolean>>;
  submilestones: CostDocumentSubmilestoneOption[];
  submitBatch: AsyncMutation;
  submitIdempotencyKeys: MutableRefObject<Map<string, string>>;
  submittingBatch: boolean;
  updateDraftOverride: (draftId: string, patch: Partial<BatchDraft>) => void;
  uploadCurrentPages: CostDocumentBatchUploadCurrentPages;
  uploadingDraftIdRef: MutableRefObject<string | undefined>;
}

export function createCostDocumentBatchStepActions({
  activeBatch,
  activeDraft,
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
}: CostDocumentBatchStepActionsContext) {
  const continueDraft = async () => {
    if (
      !(activeDraft && editor) ||
      activeDraft.lifecycle === "complete" ||
      uploadingDraftIdRef.current
    ) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    try {
      const draftId = String(activeDraft._id);
      await flushDraftAutosave(draftId);
      const currentEditor = draftEditorsRef.current.get(draftId) ?? editor;
      if (activeDraft.activeStep === "capture_confirm") {
        const pageAssetIds =
          pendingFiles.length > 0
            ? await uploadCurrentPages(activeDraft, currentEditor, {
                persistImmediately: false,
              })
            : currentEditor.pageAssetIds;
        await saveCaptureFacts(
          activeDraft,
          draftEditorsRef.current.get(draftId) ?? currentEditor,
          pageAssetIds
        );
        await setDraftStepWithRevision({
          draftId: activeDraft._id,
          step: "balance_allocate",
        });
        updateDraftOverride(draftId, { activeStep: "balance_allocate" });
        return;
      }
      if (activeDraft.activeStep === "balance_allocate") {
        const balance = exactBalanceFromEditor(currentEditor);
        const facts = requiredCaptureFacts(currentEditor);
        await saveDraftWithRevision({
          allocations: balance.allocations,
          description: facts.description,
          documentDate: facts.documentDate,
          draftId: activeDraft._id,
          financialComponents: balance.financialComponents,
          grossTotalCents: balance.grossTotalCents,
          title: facts.title,
          vendorProfileId: facts.vendorProfileId,
          vendorName: facts.vendorName,
        });
        updateDraftOverride(draftId, {
          allocations: balance.allocations.map((allocation, index) => ({
            amountCents: allocation.amountCents,
            buildSubmilestoneId: allocation.buildSubmilestoneId,
            order: index + 1,
            submilestoneKey:
              submilestones.find(
                (submilestone) =>
                  String(submilestone.id) ===
                  String(allocation.buildSubmilestoneId)
              )?.label ?? "Sub-milestone",
            submilestoneName:
              submilestones.find(
                (submilestone) =>
                  String(submilestone.id) ===
                  String(allocation.buildSubmilestoneId)
              )?.label ?? "Sub-milestone",
          })),
          financialComponents: balance.financialComponents.map(
            (component, index) => ({ ...component, order: index + 1 })
          ),
          grossTotalCents: balance.grossTotalCents,
          lifecycle: "draft",
        });
        await setDraftStepWithRevision({
          draftId: activeDraft._id,
          step: "share",
        });
        updateDraftOverride(draftId, { activeStep: "share" });
        return;
      }
      if (activeDraft.activeStep === "share") {
        await setDraftStepWithRevision({
          draftId: activeDraft._id,
          step: "freeze",
        });
        updateDraftOverride(draftId, { activeStep: "freeze" });
      }
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to continue this Cost Document.")
      );
    } finally {
      setDraftBusy(false);
    }
  };

  const goBack = async () => {
    if (!activeDraft || uploadingDraftIdRef.current) {
      return;
    }
    const index = stepIndex(activeDraft.activeStep);
    if (index <= 0) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    try {
      const previous = STEPS[index - 1];
      if (!previous) {
        return;
      }
      await flushDraftAutosave(String(activeDraft._id));
      await setDraftStepWithRevision(
        activeDraft.lifecycle === "complete"
          ? { complete: false, draftId: activeDraft._id, step: previous.id }
          : { draftId: activeDraft._id, step: previous.id }
      );
      updateDraftOverride(String(activeDraft._id), {
        activeStep: previous.id,
        completedAt: undefined,
        lifecycle: "draft",
      });
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to return to the previous step.")
      );
    } finally {
      setDraftBusy(false);
    }
  };

  const moveToPriorStep = async (step: DraftStep) => {
    if (
      !activeDraft ||
      activeDraft.lifecycle === "complete" ||
      uploadingDraftIdRef.current
    ) {
      return;
    }
    if (stepIndex(step) !== stepIndex(activeDraft.activeStep) - 1) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    try {
      await flushDraftAutosave(String(activeDraft._id));
      await setDraftStepWithRevision({ draftId: activeDraft._id, step });
      updateDraftOverride(String(activeDraft._id), { activeStep: step });
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to change this document step.")
      );
    } finally {
      setDraftBusy(false);
    }
  };

  const completeDraft = async () => {
    if (
      !activeDraft ||
      activeDraft.activeStep !== "freeze" ||
      uploadingDraftIdRef.current
    ) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    try {
      await flushDraftAutosave(String(activeDraft._id));
      await setDraftStepWithRevision({
        complete: true,
        draftId: activeDraft._id,
        step: "freeze",
      });
      updateDraftOverride(String(activeDraft._id), {
        completedAt: Date.now(),
        lifecycle: "complete",
      });
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to complete this Cost Document.")
      );
    } finally {
      setDraftBusy(false);
    }
  };

  const reopenDraft = async () => {
    if (
      !activeDraft ||
      activeDraft.lifecycle !== "complete" ||
      uploadingDraftIdRef.current
    ) {
      return;
    }
    setDraftError(undefined);
    setDraftBusy(true);
    try {
      await flushDraftAutosave(String(activeDraft._id));
      await setDraftStepWithRevision({
        complete: false,
        draftId: activeDraft._id,
        step: "share",
      });
      updateDraftOverride(String(activeDraft._id), {
        activeStep: "share",
        completedAt: undefined,
        lifecycle: "draft",
      });
    } catch (cause) {
      setDraftError(
        errorMessage(cause, "Unable to reopen this Cost Document.")
      );
    } finally {
      setDraftBusy(false);
    }
  };

  const grantCollaborator = async ({
    expectedRevision,
    granteeWorkosUserId,
  }: {
    expectedRevision: number;
    granteeWorkosUserId: string;
  }) => {
    if (!activeDraft?.capabilities?.canManageDraftCollaboration) {
      return;
    }
    setCollaborationError(undefined);
    setCollaborationBusy(true);
    try {
      const result = await grantDraftCollaborator({
        collaboratorWorkosUserId: granteeWorkosUserId,
        draftId: activeDraft._id,
        expectedRevision,
        ...actorCapacityInput,
      } as never);
      recordDraftRevision(String(activeDraft._id), result, expectedRevision);
    } catch (cause) {
      const message = errorMessage(
        cause,
        "Unable to grant access to this Cost Document Draft."
      );
      setCollaborationError(message);
      throw cause;
    } finally {
      setCollaborationBusy(false);
    }
  };

  const revokeCollaborator = async ({
    collaboratorWorkosUserId,
    expectedRevision,
  }: {
    collaboratorWorkosUserId: string;
    expectedRevision: number;
  }) => {
    if (!activeDraft?.capabilities?.canManageDraftCollaboration) {
      return;
    }
    setCollaborationError(undefined);
    setCollaborationBusy(true);
    try {
      const result = await revokeDraftCollaborator({
        collaboratorWorkosUserId,
        draftId: activeDraft._id,
        expectedRevision,
        ...actorCapacityInput,
      } as never);
      recordDraftRevision(String(activeDraft._id), result, expectedRevision);
    } catch (cause) {
      const message = errorMessage(
        cause,
        "Unable to revoke access to this Cost Document Draft."
      );
      setCollaborationError(message);
      throw cause;
    } finally {
      setCollaborationBusy(false);
    }
  };

  const allDraftsComplete =
    drafts.length > 0 &&
    drafts.every((draft) => draft.lifecycle === "complete");

  const submitCurrentBatch = async () => {
    if (!(activeBatch && allDraftsComplete) || submittingBatch) {
      return;
    }
    setBatchSubmitError(undefined);
    setSubmittingBatch(true);
    try {
      const key =
        submitIdempotencyKeys.current.get(String(activeBatch._id)) ??
        makeIdempotencyKey("cost-document-batch-submit");
      submitIdempotencyKeys.current.set(String(activeBatch._id), key);
      await submitBatch({
        batchId: activeBatch._id,
        duplicateOverrideReason: duplicateOverrideReason.trim() || undefined,
        expectedRevision: activeBatch.revision,
        idempotencyKey: key,
        ...actorCapacityInput,
      } as never);
      setDuplicateOverrideRequired(false);
      setDuplicateOverrideReason("");
      setDraftOverrides((current) =>
        Object.fromEntries(
          Object.entries(current).map(([draftId, draft]) => [
            draftId,
            { ...draft, lifecycle: "submitted" as const },
          ])
        )
      );
      setDismissedBatchId(String(activeBatch._id));
      onBatchIdChange(undefined);
    } catch (cause) {
      const message = errorMessage(
        cause,
        "Unable to submit this Cost Document batch."
      );
      setBatchSubmitError(message);
      if (message.toLocaleLowerCase("en-CA").includes("likely duplicate")) {
        setDuplicateOverrideRequired(true);
      }
    } finally {
      setSubmittingBatch(false);
    }
  };

  return {
    allDraftsComplete,
    completeDraft,
    continueDraft,
    goBack,
    grantCollaborator,
    moveToPriorStep,
    reopenDraft,
    revokeCollaborator,
    submitCurrentBatch,
  };
}
