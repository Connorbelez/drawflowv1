"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  BatchDraft,
  DraftAutosaveStatus,
  DraftEditor,
  DraftStep,
} from "./CostDocumentBatchWorkspaceModel.ts";
import {
  autosaveStatusLabel,
  balancePreview,
  draftCollaborationView,
  guidedStepDescription,
  STEPS,
  safeFormatCad,
  stepIndex,
  stepLabel,
} from "./CostDocumentBatchWorkspaceModel.ts";
import { CostDocumentSourcePreview } from "./CostDocumentBatchWorkspaceShell.tsx";
import {
  BalanceAllocateStep,
  CaptureConfirmStep,
  FreezeManifestStep,
} from "./CostDocumentBatchWorkspaceSteps.tsx";
import { CostDocumentDraftCollaboration } from "./CostDocumentDraftCollaboration.tsx";
import type { CostDocumentActorCapacity } from "./CostDocumentRoadmapReconciliation.tsx";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";

interface CostDocumentDraftEditorProps {
  actorCapacity?: CostDocumentActorCapacity;
  autosaveStatus?: DraftAutosaveStatus;
  buildId: Id<"activeBuilds">;
  busy: boolean;
  collaborationBusy: boolean;
  collaborationError?: string;
  draft: BatchDraft;
  editor: DraftEditor;
  error?: string;
  onAddAllocation: () => void;
  onAuthorizePage: (assetId: Id<"buildCollaborationAssets">) => Promise<string>;
  onBack: () => void;
  onComplete: () => void;
  onContinue: () => void;
  onEditorChange: (patch: Partial<DraftEditor>) => void;
  onGrantCollaborator: (input: {
    expectedRevision: number;
    granteeWorkosUserId: string;
  }) => Promise<void>;
  onMoveSavedPage: (assetId: string, direction: -1 | 1) => void | Promise<void>;
  onMoveToPriorStep: (step: DraftStep) => void;
  onPendingFilesChange: (files: File[]) => void;
  onRemoveAllocation: (rowId: string) => void;
  onRemoveSavedPage: (assetId: string) => void | Promise<void>;
  onReopen: () => void;
  onReplaceSavedPage: (assetId: string, file: File) => void | Promise<void>;
  onRevokeCollaborator: (input: {
    collaboratorWorkosUserId: string;
    expectedRevision: number;
  }) => Promise<void>;
  onUploadPages: () => void;
  organizationId: string;
  pendingFiles: File[];
  submilestones: CostDocumentSubmilestoneOption[];
  uploadingPages: boolean;
}

export function CostDocumentDraftEditor({
  actorCapacity,
  autosaveStatus,
  busy,
  buildId,
  collaborationBusy,
  collaborationError,
  draft,
  editor,
  error,
  onAddAllocation,
  onAuthorizePage,
  onBack,
  onComplete,
  onContinue,
  onEditorChange,
  onMoveToPriorStep,
  onMoveSavedPage,
  onGrantCollaborator,
  onPendingFilesChange,
  onRemoveAllocation,
  onRemoveSavedPage,
  onReopen,
  onRevokeCollaborator,
  onReplaceSavedPage,
  onUploadPages,
  organizationId,
  pendingFiles,
  submilestones,
  uploadingPages,
}: CostDocumentDraftEditorProps) {
  const step = draft.activeStep;
  const balance = balancePreview(editor);
  const isComplete = draft.lifecycle === "complete";
  const canReopen = Boolean(isComplete && draft.capabilities?.canSubmitBatch);
  const readOnly = !(draft.capabilities?.canEditDraft || canReopen);

  if (readOnly) {
    return (
      <div className="space-y-4">
        <Frame>
          <DraftEditorHeader
            autosaveStatus={autosaveStatus}
            busy={busy}
            canReopen={false}
            draft={draft}
            editor={editor}
            isComplete={isComplete}
            onMoveToPriorStep={onMoveToPriorStep}
            onReopen={onReopen}
          />
        </Frame>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(26rem,1.05fr)]">
          <CostDocumentSourcePreview
            busy={busy}
            draft={draft}
            managePages={false}
            onAuthorizePage={onAuthorizePage}
            onMoveSavedPage={onMoveSavedPage}
            onPendingFilesChange={onPendingFilesChange}
            onRemoveSavedPage={onRemoveSavedPage}
            onReplaceSavedPage={onReplaceSavedPage}
            onUploadPages={onUploadPages}
            pendingFiles={pendingFiles}
            uploadingPages={uploadingPages}
          />
          <Frame>
            <FramePanel className="space-y-4 p-3 sm:p-5">
              <Alert>
                <LockKeyhole />
                <AlertTitle>Read-only Cost Document Draft</AlertTitle>
                <AlertDescription>
                  Your current Build participation can inspect this exact Draft,
                  but it cannot change facts, pages, allocations, workflow, or
                  batch submission.
                </AlertDescription>
              </Alert>
              <FreezeManifestStep
                draft={draft}
                editor={editor}
                isComplete={isComplete}
              />
            </FramePanel>
          </Frame>
        </div>
        {error ? (
          <Alert variant="error">
            <AlertTitle>Document unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  const stepBody = (
    <DraftStepBody
      actorCapacity={actorCapacity}
      balance={balance}
      buildId={buildId}
      collaborationBusy={collaborationBusy}
      collaborationError={collaborationError}
      draft={draft}
      editor={editor}
      isComplete={isComplete}
      onAddAllocation={onAddAllocation}
      onEditorChange={onEditorChange}
      onGrantCollaborator={onGrantCollaborator}
      onRemoveAllocation={onRemoveAllocation}
      onRevokeCollaborator={onRevokeCollaborator}
      organizationId={organizationId}
      submilestones={submilestones}
    />
  );

  return (
    <div className="space-y-4">
      <Frame>
        <DraftEditorHeader
          autosaveStatus={autosaveStatus}
          busy={busy}
          canReopen={canReopen}
          draft={draft}
          editor={editor}
          isComplete={isComplete}
          onMoveToPriorStep={onMoveToPriorStep}
          onReopen={onReopen}
        />
      </Frame>

      <DraftEditorActions
        busy={busy}
        isComplete={isComplete}
        onBack={onBack}
        onComplete={onComplete}
        onContinue={onContinue}
        step={step}
      />

      {step === "balance_allocate" ? (
        <Frame>
          <FrameHeader>
            <FrameTitle>Balance &amp; allocate</FrameTitle>
            <FrameDescription>
              Reconcile the gross total and assign that exact amount across
              relevant Sub-milestones.
            </FrameDescription>
          </FrameHeader>
          <FramePanel className="p-3 sm:p-5">{stepBody}</FramePanel>
        </Frame>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(22rem,0.95fr)_minmax(26rem,1.05fr)]">
          <CostDocumentSourcePreview
            busy={busy}
            draft={draft}
            managePages={step === "capture_confirm"}
            onAuthorizePage={onAuthorizePage}
            onMoveSavedPage={onMoveSavedPage}
            onPendingFilesChange={onPendingFilesChange}
            onRemoveSavedPage={onRemoveSavedPage}
            onReplaceSavedPage={onReplaceSavedPage}
            onUploadPages={onUploadPages}
            pendingFiles={pendingFiles}
            uploadingPages={uploadingPages}
          />
          <Frame>
            <FrameHeader>
              <FrameTitle>{stepLabel(step)}</FrameTitle>
              <FrameDescription>{guidedStepDescription(step)}</FrameDescription>
            </FrameHeader>
            <FramePanel className="p-3 sm:p-5">{stepBody}</FramePanel>
          </Frame>
        </div>
      )}

      {error ? (
        <Alert variant="error">
          <AlertTitle>Document not updated</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function DraftEditorHeader({
  autosaveStatus,
  busy,
  canReopen,
  draft,
  editor,
  isComplete,
  onMoveToPriorStep,
  onReopen,
}: {
  autosaveStatus?: DraftAutosaveStatus;
  busy: boolean;
  canReopen: boolean;
  draft: BatchDraft;
  editor: DraftEditor;
  isComplete: boolean;
  onMoveToPriorStep: (step: DraftStep) => void;
  onReopen: () => void;
}) {
  const index = stepIndex(draft.activeStep);

  return (
    <FrameHeader className="gap-3 border-b">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FrameTitle>
              {editor.title.trim() || "Untitled Cost Document"}
            </FrameTitle>
            <Badge variant="outline">
              {draft.kind === "invoice" ? "Invoice" : "Receipt"}
            </Badge>
            <Badge variant="secondary">
              {draft.category === "materials" ? "Materials" : "Labour"}
            </Badge>
            {isComplete ? <Badge variant="success">Complete</Badge> : null}
          </div>
          <FrameDescription>
            {editor.vendorName.trim() || "Vendor required"}
            {editor.grossTotal.trim()
              ? ` · ${safeFormatCad(editor.grossTotal)}`
              : " · Gross total required"}
          </FrameDescription>
          <p
            aria-live="polite"
            className="mt-1 text-muted-foreground text-xs"
            data-testid="draft-autosave-status"
          >
            {autosaveStatusLabel(autosaveStatus)}
          </p>
        </div>
        {canReopen ? (
          <Button onClick={onReopen} size="sm" variant="outline">
            <RefreshCw /> Reopen to Share
          </Button>
        ) : null}
      </div>
      <ol
        aria-label="Document steps"
        className="flex min-w-0 flex-wrap items-center gap-1 border-t pt-3 sm:flex-nowrap"
      >
        {STEPS.map((item, itemIndex) => {
          const current = item.id === draft.activeStep;
          const isImmediatePredecessor = itemIndex === index - 1;
          return (
            <li className="min-w-[10rem] flex-1" key={item.id}>
              <Button
                aria-current={current ? "step" : undefined}
                className="w-full justify-start gap-2"
                data-testid={`step-${item.id}`}
                disabled={busy || isComplete || !isImmediatePredecessor}
                onClick={() => onMoveToPriorStep(item.id)}
                size="sm"
                variant={current ? "default" : "ghost"}
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full border text-xs tabular-nums">
                  {itemIndex < index ? <CheckCircle2 /> : itemIndex + 1}
                </span>
                {item.label}
              </Button>
            </li>
          );
        })}
      </ol>
    </FrameHeader>
  );
}

export function DraftStepBody({
  actorCapacity,
  balance,
  buildId,
  collaborationBusy,
  collaborationError,
  draft,
  editor,
  isComplete,
  onAddAllocation,
  onEditorChange,
  onGrantCollaborator,
  onRemoveAllocation,
  onRevokeCollaborator,
  organizationId,
  submilestones,
}: {
  actorCapacity?: CostDocumentActorCapacity;
  balance: ReturnType<typeof balancePreview>;
  buildId: Id<"activeBuilds">;
  collaborationBusy: boolean;
  collaborationError?: string;
  draft: BatchDraft;
  editor: DraftEditor;
  isComplete: boolean;
  onAddAllocation: () => void;
  onEditorChange: (patch: Partial<DraftEditor>) => void;
  onGrantCollaborator: (input: {
    expectedRevision: number;
    granteeWorkosUserId: string;
  }) => Promise<void>;
  onRemoveAllocation: (rowId: string) => void;
  onRevokeCollaborator: (input: {
    collaboratorWorkosUserId: string;
    expectedRevision: number;
  }) => Promise<void>;
  organizationId: string;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  if (draft.activeStep === "capture_confirm") {
    return (
      <CaptureConfirmStep
        actorCapacity={actorCapacity}
        buildId={buildId}
        editor={editor}
        onEditorChange={onEditorChange}
        organizationId={organizationId}
      />
    );
  }
  if (draft.activeStep === "balance_allocate") {
    return (
      <BalanceAllocateStep
        balance={balance}
        editor={editor}
        onAddAllocation={onAddAllocation}
        onEditorChange={onEditorChange}
        onRemoveAllocation={onRemoveAllocation}
        submilestones={submilestones}
      />
    );
  }
  if (draft.activeStep === "share") {
    const collaboration = draftCollaborationView(draft);
    return (
      <CostDocumentDraftCollaboration
        busy={collaborationBusy}
        canManageAccess={Boolean(
          draft.capabilities?.canManageDraftCollaboration
        )}
        collaborators={collaboration.collaborators}
        creator={collaboration.creator}
        draftReference={`Draft ${String(draft._id).slice(-8)}`}
        eligibleCollaborators={collaboration.eligibleCollaborators}
        error={collaborationError}
        onGrant={onGrantCollaborator}
        onRevoke={onRevokeCollaborator}
        revision={draft.revision ?? 1}
        title={editor.title.trim() || "this Cost Document"}
      />
    );
  }
  return (
    <FreezeManifestStep draft={draft} editor={editor} isComplete={isComplete} />
  );
}

export function DraftEditorActions({
  busy,
  isComplete,
  onBack,
  onComplete,
  onContinue,
  step,
}: {
  busy: boolean;
  isComplete: boolean;
  onBack: () => void;
  onComplete: () => void;
  onContinue: () => void;
  step: DraftStep;
}) {
  const index = stepIndex(step);
  if (isComplete) {
    return (
      <Frame>
        <FramePanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="mr-auto min-w-0">
            <p className="font-medium text-sm">Freeze manifest complete</p>
            <p className="text-muted-foreground text-xs">
              Reopening returns this document to Share, then Back follows the
              normal step order.
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            data-testid="draft-back"
            disabled={busy}
            loading={busy}
            onClick={onBack}
            variant="outline"
          >
            <ArrowLeft /> Reopen to Share
          </Button>
        </FramePanel>
      </Frame>
    );
  }
  const previousStep = index > 0 ? STEPS[index - 1] : undefined;
  const nextStep = index < STEPS.length - 1 ? STEPS[index + 1] : undefined;

  return (
    <Frame>
      <FramePanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="mr-auto min-w-0">
          <p className="font-medium text-sm">{stepLabel(step)} workflow</p>
          <p className="text-muted-foreground text-xs">
            Step {index + 1} of {STEPS.length} belongs only to this Cost
            Document.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            className="flex-1 sm:flex-none"
            data-testid="draft-back"
            disabled={busy || !previousStep}
            onClick={onBack}
            variant="outline"
          >
            <ArrowLeft />
            {previousStep ? `Back to ${previousStep.label}` : "Back"}
          </Button>
          {step === "freeze" ? (
            <Button
              className="flex-1 sm:flex-none"
              data-testid="complete"
              disabled={busy}
              loading={busy}
              onClick={onComplete}
            >
              <CheckCircle2 /> Complete document
            </Button>
          ) : (
            <Button
              className="flex-1 sm:flex-none"
              data-testid="continue"
              disabled={busy}
              loading={busy}
              onClick={onContinue}
            >
              {nextStep ? `Continue to ${nextStep.label}` : "Continue"}
              <ArrowRight />
            </Button>
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}
