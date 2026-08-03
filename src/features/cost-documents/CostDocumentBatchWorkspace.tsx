import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field.tsx";
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
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { uploadGovernedCollaborationAssets } from "#/features/build-collaboration/build-collaboration-asset-upload.ts";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type CostDocumentDraftAccessPerson,
  CostDocumentDraftCollaboration,
  type CostDocumentDraftCollaborator,
} from "./CostDocumentDraftCollaboration.tsx";
import {
  type CostDocumentSubmilestoneOption,
  formatCad,
  parseCadCents,
} from "./SingleCostDocumentCapture.tsx";

const MAX_COST_DOCUMENT_PAGES = 50;
const MAX_COST_DOCUMENT_ALLOCATIONS = 100;
const MAX_COST_DOCUMENT_FINANCIAL_COMPONENTS = 20;
const DRAFT_AUTOSAVE_DELAY_MS = 450;
const ISO_DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const STEPS = [
  { id: "capture_confirm", label: "Capture & confirm" },
  { id: "balance_allocate", label: "Balance & allocate" },
  { id: "share", label: "Share" },
  { id: "freeze", label: "Freeze" },
] as const;

type DraftStep = (typeof STEPS)[number]["id"];
type CostDocumentKind = "invoice" | "receipt";
type CostDocumentCategory = "labour" | "materials";
type FinancialComponentKind = "subtotal" | "tax" | "fee" | "discount";

interface BatchDraft {
  _id: Id<"costDocumentDrafts">;
  activeStep: DraftStep;
  allocations: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    order: number;
    submilestoneKey: string;
    submilestoneName: string;
  }>;
  batchId?: Id<"costDocumentBatches">;
  capabilities?: CostDocumentDraftCapabilities;
  category: CostDocumentCategory;
  collaboration?: CostDocumentDraftCollaborationProjection;
  collaborators?: Array<{
    grantedAt?: number;
    workosUserId: string;
  }>;
  completedAt?: number;
  creator?: { workosUserId: string };
  currency: "CAD";
  description?: string;
  documentDate?: string;
  financialComponents: Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
    order: number;
  }>;
  grossTotalCents?: number;
  kind: CostDocumentKind;
  lifecycle: "draft" | "complete" | "submitted";
  order?: number;
  pages: Array<{
    assetId: Id<"buildCollaborationAssets">;
    contentHashSha256?: string;
    fileName?: string;
    mimeType?: string;
    order: number;
    priorAssetId?: Id<"buildCollaborationAssets">;
    replacedAt?: number;
  }>;
  revision?: number;
  self?: { workosUserId: string };
  submittedCostDocumentId?: Id<"costDocuments">;
  title?: string;
  vendorName?: string;
  workingStateJson?: string;
}

interface CostDocumentDraftCapabilities {
  canDiscardBatch: boolean;
  canEditDraft: boolean;
  canManageDraftCollaboration: boolean;
  canManageSourcePages: boolean;
  canReadDraft: boolean;
  canSubmitBatch: boolean;
}

interface CostDocumentDraftCollaborationProjection {
  currentCollaborators: Array<{
    grantedAt: number;
    workosUserId: string;
  }>;
  eligibleCollaborators: Array<{
    displayName: string;
    role: string;
    workosUserId: string;
  }>;
}

interface ExactDraftProjection extends Omit<BatchDraft, "batchId" | "order"> {
  capabilities: CostDocumentDraftCapabilities;
  creator: { workosUserId: string };
  revision: number;
  self: { workosUserId: string };
}

interface BatchProjection {
  _id: Id<"costDocumentBatches">;
  drafts: BatchDraft[];
  idempotencyKey?: string;
  revision: number;
  state: "active" | "submitted" | "abandoned";
  submittedAt?: number;
  supportingContextDisclosure: string;
}

interface AllocationEditorRow {
  amount: string;
  buildSubmilestoneId: string;
  id: string;
}

interface FinancialComponentEditorRow {
  amount: string;
  id: string;
  kind: FinancialComponentKind;
  label: string;
}

interface DraftEditor {
  allocations: AllocationEditorRow[];
  description: string;
  documentDate: string;
  draftId: string;
  financialComponents: FinancialComponentEditorRow[];
  grossTotal: string;
  pageAssetIds: string[];
  title: string;
  vendorName: string;
}

interface DraftWorkingState {
  allocations: AllocationEditorRow[];
  financialComponents: FinancialComponentEditorRow[];
  grossTotal: string;
  version: 1;
}

type DraftAutosaveStatus = "error" | "pending" | "saved" | "saving";

interface DraftAutosaveState {
  inFlight?: Promise<unknown>;
  requestedVersion: number;
  savedVersion: number;
  timer?: ReturnType<typeof setTimeout>;
}

interface DraftAutosavePayload {
  allocations?: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
  }>;
  description: string;
  documentDate?: string;
  draftId: Id<"costDocumentDrafts">;
  financialComponents?: Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
  }>;
  grossTotalCents?: number;
  title: string;
  vendorName: string;
  workingStateJson: string;
}

interface CostDocumentDraftSaveInput {
  allocations?: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
  }>;
  category?: CostDocumentCategory;
  description?: string;
  documentDate?: string;
  draftId: Id<"costDocumentDrafts">;
  financialComponents?: Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
  }>;
  grossTotalCents?: number;
  kind?: CostDocumentKind;
  pageAssetIds?: Id<"buildCollaborationAssets">[];
  title?: string;
  vendorName?: string;
  workingStateJson?: string;
}

export interface CostDocumentBatchWorkspaceProps {
  batchId?: string;
  buildId: Id<"activeBuilds">;
  draftId?: string;
  onBatchIdChange: (batchId?: string) => void;
  organizationId: string;
  submilestones: CostDocumentSubmilestoneOption[];
}

function useCostDocumentBatchRouteLifecycle({
  activeBatchId,
  batchId,
  dismissedBatchId,
  lastReportedBatchId,
  onBatchIdChange,
  setDismissedBatchId,
}: {
  activeBatchId?: string;
  batchId?: string;
  dismissedBatchId?: string;
  lastReportedBatchId: { current: string | undefined };
  onBatchIdChange: (batchId?: string) => void;
  setDismissedBatchId: (batchId?: string) => void;
}) {
  useEffect(() => {
    if (!activeBatchId || dismissedBatchId === activeBatchId) {
      return;
    }
    if (
      batchId !== activeBatchId &&
      lastReportedBatchId.current !== activeBatchId
    ) {
      lastReportedBatchId.current = activeBatchId;
      onBatchIdChange(activeBatchId);
    }
  }, [
    activeBatchId,
    batchId,
    dismissedBatchId,
    lastReportedBatchId,
    onBatchIdChange,
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
  batchId,
  buildId,
  draftId,
  onBatchIdChange,
  organizationId,
  submilestones,
}: CostDocumentBatchWorkspaceProps) {
  const activeBatchRecoveryQuery = useQuery(
    api.cost_documents.getActiveCostDocumentBatch,
    batchId || draftId ? "skip" : { buildId, organizationId }
  ) as BatchProjection | null | undefined;
  const routeBatchQuery = useQuery(
    api.cost_documents.getCostDocumentBatch,
    batchId && !draftId
      ? {
          batchId,
          buildId,
          organizationId,
        }
      : "skip"
  ) as BatchProjection | null | undefined;
  const exactDraftQuery = useQuery(
    api.cost_documents.getCostDocumentDraft,
    draftId
      ? {
          buildId,
          draftId: draftId as Id<"costDocumentDrafts">,
          organizationId,
        }
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
  const [autosaveStatuses, setAutosaveStatuses] = useState<
    Record<string, DraftAutosaveStatus>
  >({});
  const createIdempotencyKey = useRef<string>();
  const submitIdempotencyKeys = useRef(new Map<string, string>());
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

  useCostDocumentBatchRouteLifecycle({
    activeBatchId,
    batchId,
    dismissedBatchId,
    lastReportedBatchId,
    onBatchIdChange,
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
    const result = await saveDraft({ ...input, expectedRevision });
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
    const result = await setDraftStep({ ...input, expectedRevision });
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
    const result = await bindDraftPageAsset({ ...input, expectedRevision });
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
      });
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
      });
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
      });
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
      });
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
        expectedRevision: activeBatch.revision,
        idempotencyKey: key,
      });
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
      setBatchSubmitError(
        errorMessage(cause, "Unable to submit this Cost Document batch.")
      );
    } finally {
      setSubmittingBatch(false);
    }
  };

  if (!sheetOpen) {
    return (
      <CostDocumentBatchLaunchPanel
        activeBatch={activeBatch}
        data-testid="cost-document-batch-workspace"
        error={entryError}
        onResume={resumeBatch}
        onStart={startBatch}
        starting={startingBatch}
      />
    );
  }

  const workspaceQuery = draftId ? exactDraftQuery : batchQuery;

  if (workspaceQuery === undefined) {
    return (
      <CostDocumentBatchSheet exactDraft={Boolean(draftId)} onClose={close}>
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
      <CostDocumentBatchSheet exactDraft={Boolean(draftId)} onClose={close}>
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
                  autosaveStatus={autosaveStatuses[String(activeDraft._id)]}
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
                  onAddFinancialComponent={() =>
                    updateEditor({
                      financialComponents: [
                        ...editor.financialComponents,
                        {
                          amount: "",
                          id: nextLocalRowId("financial-component"),
                          kind:
                            editor.financialComponents.length === 0
                              ? "subtotal"
                              : "tax",
                          label: "",
                        },
                      ],
                    })
                  }
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
                  onRemoveFinancialComponent={(rowId) =>
                    updateEditor({
                      financialComponents: editor.financialComponents.filter(
                        (component) => component.id !== rowId
                      ),
                    })
                  }
                  onRemoveSavedPage={removeSavedPage}
                  onReopen={reopenDraft}
                  onReplaceSavedPage={replaceSavedPage}
                  onRevokeCollaborator={revokeCollaborator}
                  onUploadPages={uploadPages}
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
              disabled={!allDraftsComplete || submittingBatch}
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
          <div className="border-t px-6 pb-4">
            <Alert
              className="mt-4"
              data-testid="batch-submit-error"
              variant="error"
            >
              <AlertTitle>Batch not submitted</AlertTitle>
              <AlertDescription>{batchSubmitError}</AlertDescription>
            </Alert>
          </div>
        ) : null}
      </CostDocumentBatchSheet>
    </div>
  );
}

function CostDocumentBatchLaunchPanel({
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

function CostDocumentBatchSheet({
  children,
  exactDraft = false,
  onClose,
}: {
  children: React.ReactNode;
  exactDraft?: boolean;
  onClose: () => void | Promise<void>;
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
        {children}
      </SheetPopup>
    </Sheet>
  );
}

function CostDocumentRegister({
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
      <FrameHeader className="gap-1 px-3 py-2 lg:gap-2 lg:px-5 lg:py-4">
        <FrameTitle>Document register</FrameTitle>
        <FrameDescription className="hidden lg:block">
          Each document retains its own progress and immutable manifest.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="flex min-w-0 flex-wrap items-end gap-2 p-2 lg:block lg:space-y-3 lg:p-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 lg:grid-cols-1">
          <Field className="min-w-0">
            <FieldLabel htmlFor="new-cost-document-kind">Kind</FieldLabel>
            <select
              className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
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
            <FieldLabel htmlFor="new-cost-document-category">
              Classification
            </FieldLabel>
            <select
              className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
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
        <Button
          className="shrink-0 lg:w-full"
          disabled={selectionLocked}
          loading={addingDraft}
          onClick={onAdd}
          variant="outline"
        >
          <Plus /> Add document
        </Button>
      </FramePanel>
      <FramePanel className="p-2">
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

function CostDocumentRegisterCard({
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
        className="h-full"
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
              {draft.title?.trim() || "Untitled Cost Document"}
            </span>
            <Badge variant={complete ? "success" : "outline"}>
              {complete ? "Complete" : "In progress"}
            </Badge>
          </div>
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
            <RegisterFact label="Amount" value={amount} />
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

function RegisterFact({
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

function RegisterDraftProgress({
  draft,
  ...props
}: { draft: BatchDraft } & React.ComponentProps<typeof Progress>) {
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

interface CostDocumentDraftEditorProps {
  autosaveStatus?: DraftAutosaveStatus;
  busy: boolean;
  collaborationBusy: boolean;
  collaborationError?: string;
  draft: BatchDraft;
  editor: DraftEditor;
  error?: string;
  onAddAllocation: () => void;
  onAddFinancialComponent: () => void;
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
  onRemoveFinancialComponent: (rowId: string) => void;
  onRemoveSavedPage: (assetId: string) => void | Promise<void>;
  onReopen: () => void;
  onReplaceSavedPage: (assetId: string, file: File) => void | Promise<void>;
  onRevokeCollaborator: (input: {
    collaboratorWorkosUserId: string;
    expectedRevision: number;
  }) => Promise<void>;
  onUploadPages: () => void;
  pendingFiles: File[];
  submilestones: CostDocumentSubmilestoneOption[];
  uploadingPages: boolean;
}

function CostDocumentDraftEditor({
  autosaveStatus,
  busy,
  collaborationBusy,
  collaborationError,
  draft,
  editor,
  error,
  onAddAllocation,
  onAddFinancialComponent,
  onBack,
  onComplete,
  onContinue,
  onEditorChange,
  onMoveToPriorStep,
  onMoveSavedPage,
  onGrantCollaborator,
  onPendingFilesChange,
  onRemoveAllocation,
  onRemoveFinancialComponent,
  onRemoveSavedPage,
  onReopen,
  onRevokeCollaborator,
  onReplaceSavedPage,
  onUploadPages,
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
        {error ? (
          <Alert variant="error">
            <AlertTitle>Document unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

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
        <FramePanel className="p-3 sm:p-5">
          <DraftStepBody
            balance={balance}
            busy={busy}
            collaborationBusy={collaborationBusy}
            collaborationError={collaborationError}
            draft={draft}
            editor={editor}
            isComplete={isComplete}
            onAddAllocation={onAddAllocation}
            onAddFinancialComponent={onAddFinancialComponent}
            onEditorChange={onEditorChange}
            onGrantCollaborator={onGrantCollaborator}
            onMoveSavedPage={onMoveSavedPage}
            onPendingFilesChange={onPendingFilesChange}
            onRemoveAllocation={onRemoveAllocation}
            onRemoveFinancialComponent={onRemoveFinancialComponent}
            onRemoveSavedPage={onRemoveSavedPage}
            onReplaceSavedPage={onReplaceSavedPage}
            onRevokeCollaborator={onRevokeCollaborator}
            onUploadPages={onUploadPages}
            pendingFiles={pendingFiles}
            submilestones={submilestones}
            uploadingPages={uploadingPages}
          />
        </FramePanel>
      </Frame>

      {error ? (
        <Alert variant="error">
          <AlertTitle>Document not updated</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <DraftEditorActions
        busy={busy}
        isComplete={isComplete}
        onBack={onBack}
        onComplete={onComplete}
        onContinue={onContinue}
        step={step}
      />
    </div>
  );
}

function DraftEditorHeader({
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
      <ol aria-label="Document steps" className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((item, itemIndex) => {
          const current = item.id === draft.activeStep;
          const isImmediatePredecessor = itemIndex === index - 1;
          return (
            <li key={item.id}>
              <Button
                aria-current={current ? "step" : undefined}
                className="w-full justify-start"
                data-testid={`step-${item.id}`}
                disabled={busy || isComplete || !isImmediatePredecessor}
                onClick={() => onMoveToPriorStep(item.id)}
                size="sm"
                variant={current ? "default" : "ghost"}
              >
                <span className="grid size-5 place-items-center rounded-full border text-xs tabular-nums">
                  {itemIndex + 1}
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

function DraftStepBody({
  balance,
  busy,
  collaborationBusy,
  collaborationError,
  draft,
  editor,
  isComplete,
  onAddAllocation,
  onAddFinancialComponent,
  onEditorChange,
  onMoveSavedPage,
  onGrantCollaborator,
  onPendingFilesChange,
  onRemoveAllocation,
  onRemoveFinancialComponent,
  onRemoveSavedPage,
  onRevokeCollaborator,
  onReplaceSavedPage,
  onUploadPages,
  pendingFiles,
  submilestones,
  uploadingPages,
}: {
  balance: ReturnType<typeof balancePreview>;
  busy: boolean;
  collaborationBusy: boolean;
  collaborationError?: string;
  draft: BatchDraft;
  editor: DraftEditor;
  isComplete: boolean;
  onAddAllocation: () => void;
  onAddFinancialComponent: () => void;
  onEditorChange: (patch: Partial<DraftEditor>) => void;
  onMoveSavedPage: (assetId: string, direction: -1 | 1) => void | Promise<void>;
  onGrantCollaborator: (input: {
    expectedRevision: number;
    granteeWorkosUserId: string;
  }) => Promise<void>;
  onPendingFilesChange: (files: File[]) => void;
  onRemoveAllocation: (rowId: string) => void;
  onRemoveFinancialComponent: (rowId: string) => void;
  onRemoveSavedPage: (assetId: string) => void | Promise<void>;
  onRevokeCollaborator: (input: {
    collaboratorWorkosUserId: string;
    expectedRevision: number;
  }) => Promise<void>;
  onReplaceSavedPage: (assetId: string, file: File) => void | Promise<void>;
  onUploadPages: () => void;
  pendingFiles: File[];
  submilestones: CostDocumentSubmilestoneOption[];
  uploadingPages: boolean;
}) {
  if (draft.activeStep === "capture_confirm") {
    return (
      <CaptureConfirmStep
        busy={busy}
        draft={draft}
        editor={editor}
        onEditorChange={onEditorChange}
        onMoveSavedPage={onMoveSavedPage}
        onPendingFilesChange={onPendingFilesChange}
        onRemoveSavedPage={onRemoveSavedPage}
        onReplaceSavedPage={onReplaceSavedPage}
        onUploadPages={onUploadPages}
        pendingFiles={pendingFiles}
        uploadingPages={uploadingPages}
      />
    );
  }
  if (draft.activeStep === "balance_allocate") {
    return (
      <BalanceAllocateStep
        balance={balance}
        editor={editor}
        onAddAllocation={onAddAllocation}
        onAddFinancialComponent={onAddFinancialComponent}
        onEditorChange={onEditorChange}
        onRemoveAllocation={onRemoveAllocation}
        onRemoveFinancialComponent={onRemoveFinancialComponent}
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

function DraftEditorActions({
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

function CaptureConfirmStep({
  busy,
  draft,
  editor,
  onEditorChange,
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
  editor: DraftEditor;
  onEditorChange: (patch: Partial<DraftEditor>) => void;
  onMoveSavedPage: (assetId: string, direction: -1 | 1) => void | Promise<void>;
  onPendingFilesChange: (files: File[]) => void;
  onRemoveSavedPage: (assetId: string) => void | Promise<void>;
  onReplaceSavedPage: (assetId: string, file: File) => void | Promise<void>;
  onUploadPages: () => void;
  pendingFiles: File[];
  uploadingPages: boolean;
}) {
  const savedPages = [...draft.pages].sort(
    (left, right) => left.order - right.order
  );

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="cost-document-source-heading"
        className="space-y-3"
      >
        <div>
          <h3 className="font-semibold" id="cost-document-source-heading">
            Source pages
          </h3>
          <p className="text-muted-foreground text-sm">
            Upload every page for this one Invoice or Receipt. Pages are
            security-scanned and bound to this private draft before any batch
            submission is possible.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="cost-document-batch-pages">
            Invoice or Receipt pages
          </FieldLabel>
          <Input
            accept="application/pdf,image/*"
            data-testid="page-input"
            disabled={busy || uploadingPages}
            id="cost-document-batch-pages"
            multiple
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              onPendingFilesChange(files);
            }}
            type="file"
          />
          <FieldDescription>
            Each clean page is bound to this draft immediately. Add only the
            remaining pages if an upload is interrupted.
          </FieldDescription>
        </Field>
        {pendingFiles.length > 0 ? (
          <div className="grid gap-2">
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
          {savedPages.length > 0 ? (
            <span className="text-muted-foreground text-sm">
              {savedPages.length} saved source page
              {savedPages.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {savedPages.length > 0 ? (
          <ol aria-label="Saved source pages" className="divide-y">
            {savedPages.map((page, index) => (
              <li
                className="flex min-w-0 flex-wrap items-center gap-2 py-2 sm:flex-nowrap"
                key={page.assetId}
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {page.order}. {page.fileName || "Verified source page"}
                </span>
                <Badge variant="outline">{page.mimeType || "File"}</Badge>
                <div className="ml-auto flex items-center gap-1">
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
                      busy || uploadingPages || index === savedPages.length - 1
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
                </div>
                <Field className="min-w-[11rem] sm:ml-1">
                  <FieldLabel
                    htmlFor={`cost-document-replace-page-${page.assetId}`}
                  >
                    Replace page {index + 1}
                  </FieldLabel>
                  <Input
                    accept="application/pdf,image/*"
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
                          onReplaceSavedPage(String(page.assetId), replacement)
                        ).catch(() => undefined);
                      }
                    }}
                    type="file"
                  />
                </Field>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section
        aria-label="Document facts"
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field>
          <FieldLabel htmlFor="cost-document-batch-title">Title</FieldLabel>
          <Input
            id="cost-document-batch-title"
            onChange={(event) =>
              onEditorChange({ title: event.currentTarget.value })
            }
            required
            value={editor.title}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cost-document-batch-vendor">Vendor</FieldLabel>
          <Input
            id="cost-document-batch-vendor"
            onChange={(event) =>
              onEditorChange({ vendorName: event.currentTarget.value })
            }
            required
            value={editor.vendorName}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="cost-document-batch-date">
            Document date
          </FieldLabel>
          <Input
            id="cost-document-batch-date"
            onChange={(event) =>
              onEditorChange({ documentDate: event.currentTarget.value })
            }
            required
            type="date"
            value={editor.documentDate}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="cost-document-batch-description">
            Description
          </FieldLabel>
          <Textarea
            id="cost-document-batch-description"
            onChange={(event) =>
              onEditorChange({ description: event.currentTarget.value })
            }
            value={editor.description}
          />
        </Field>
      </section>
    </div>
  );
}

function BalanceAllocateStep({
  balance,
  editor,
  onAddAllocation,
  onAddFinancialComponent,
  onEditorChange,
  onRemoveAllocation,
  onRemoveFinancialComponent,
  submilestones,
}: {
  balance: ReturnType<typeof balancePreview>;
  editor: DraftEditor;
  onAddAllocation: () => void;
  onAddFinancialComponent: () => void;
  onEditorChange: (patch: Partial<DraftEditor>) => void;
  onRemoveAllocation: (rowId: string) => void;
  onRemoveFinancialComponent: (rowId: string) => void;
  submilestones: CostDocumentSubmilestoneOption[];
}) {
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="cost-document-reconciliation-heading"
        className="space-y-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3
              className="font-semibold"
              id="cost-document-reconciliation-heading"
            >
              Full reconciliation
            </h3>
            <p className="text-muted-foreground text-sm">
              The Gross Document Total and every Cost Allocation reconcile in
              exact integer cents before this document can move forward.
            </p>
          </div>
          <Badge variant="outline">CAD</Badge>
        </div>
        <Field className="max-w-md">
          <FieldLabel htmlFor="cost-document-batch-total">
            Gross Document Total (CAD)
          </FieldLabel>
          <Input
            className="h-14 font-semibold text-xl tabular-nums"
            id="cost-document-batch-total"
            inputMode="decimal"
            onChange={(event) =>
              onEditorChange({ grossTotal: event.currentTarget.value })
            }
            placeholder="0.00"
            value={editor.grossTotal}
          />
          <FieldDescription>
            Tax-inclusive and stored in integer cents.
          </FieldDescription>
        </Field>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs">Gross total</dt>
            <dd className="font-semibold tabular-nums">{balance.grossLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Allocated</dt>
            <dd className="font-semibold tabular-nums">
              {formatCad(balance.allocatedCents)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Remaining</dt>
            <dd className="font-semibold tabular-nums">
              {balance.remainingLabel}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="cost-document-allocations-heading"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3
              className="font-semibold"
              id="cost-document-allocations-heading"
            >
              Cost Allocations
            </h3>
            <p className="text-muted-foreground text-sm">
              Allocate the exact total across one or more Build Sub-milestones.
            </p>
          </div>
          <Button onClick={onAddAllocation} size="sm" variant="outline">
            <Plus /> Add allocation
          </Button>
        </div>
        <div className="grid gap-3">
          {editor.allocations.map((allocation, index) => (
            <Frame
              data-testid={`allocation-${allocation.id}`}
              key={allocation.id}
            >
              <FramePanel className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                <Field>
                  <FieldLabel
                    htmlFor={`cost-allocation-submilestone-${allocation.id}`}
                  >
                    Cost allocation {index + 1} Sub-milestone
                  </FieldLabel>
                  <select
                    className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
                    id={`cost-allocation-submilestone-${allocation.id}`}
                    onChange={(event) =>
                      onEditorChange({
                        allocations: editor.allocations.map((row) =>
                          row.id === allocation.id
                            ? {
                                ...row,
                                buildSubmilestoneId: event.currentTarget.value,
                              }
                            : row
                        ),
                      })
                    }
                    value={allocation.buildSubmilestoneId}
                  >
                    <option value="">Choose a Sub-milestone</option>
                    {submilestones.map((submilestone) => (
                      <option key={submilestone.id} value={submilestone.id}>
                        {submilestone.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <FieldLabel
                    htmlFor={`cost-allocation-amount-${allocation.id}`}
                  >
                    Cost allocation {index + 1} amount (CAD)
                  </FieldLabel>
                  <Input
                    id={`cost-allocation-amount-${allocation.id}`}
                    inputMode="decimal"
                    onChange={(event) =>
                      onEditorChange({
                        allocations: editor.allocations.map((row) =>
                          row.id === allocation.id
                            ? { ...row, amount: event.currentTarget.value }
                            : row
                        ),
                      })
                    }
                    placeholder="0.00"
                    value={allocation.amount}
                  />
                </Field>
                <Button
                  aria-label={`Remove allocation ${index + 1}`}
                  disabled={editor.allocations.length === 1}
                  onClick={() => onRemoveAllocation(allocation.id)}
                  size="sm"
                  variant="outline"
                >
                  Remove
                </Button>
              </FramePanel>
            </Frame>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="cost-document-components-heading"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold" id="cost-document-components-heading">
              Financial components{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </h3>
            <p className="text-muted-foreground text-sm">
              If supplied, one subtotal plus tax, fees, and discounts must also
              reconcile exactly to the Gross Document Total.
            </p>
          </div>
          <Button onClick={onAddFinancialComponent} size="sm" variant="outline">
            <Plus /> Add financial component
          </Button>
        </div>
        {editor.financialComponents.length > 0 ? (
          <div className="grid gap-3">
            {editor.financialComponents.map((component, index) => (
              <Frame key={component.id}>
                <FramePanel className="grid gap-3 p-3 sm:grid-cols-[10rem_minmax(0,1fr)_10rem_auto] sm:items-end">
                  <Field>
                    <FieldLabel htmlFor={`cost-component-kind-${component.id}`}>
                      Component {index + 1} kind
                    </FieldLabel>
                    <select
                      className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
                      id={`cost-component-kind-${component.id}`}
                      onChange={(event) =>
                        onEditorChange({
                          financialComponents: editor.financialComponents.map(
                            (row) =>
                              row.id === component.id
                                ? {
                                    ...row,
                                    kind: event.currentTarget
                                      .value as FinancialComponentKind,
                                  }
                                : row
                          ),
                        })
                      }
                      value={component.kind}
                    >
                      <option value="subtotal">Subtotal</option>
                      <option value="tax">Tax</option>
                      <option value="fee">Fee</option>
                      <option value="discount">Discount</option>
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`cost-component-label-${component.id}`}
                    >
                      Component {index + 1} label
                    </FieldLabel>
                    <Input
                      id={`cost-component-label-${component.id}`}
                      onChange={(event) =>
                        onEditorChange({
                          financialComponents: editor.financialComponents.map(
                            (row) =>
                              row.id === component.id
                                ? { ...row, label: event.currentTarget.value }
                                : row
                          ),
                        })
                      }
                      placeholder={
                        component.kind === "subtotal"
                          ? "Subtotal"
                          : "Optional label"
                      }
                      value={component.label}
                    />
                  </Field>
                  <Field>
                    <FieldLabel
                      htmlFor={`cost-component-amount-${component.id}`}
                    >
                      Component {index + 1} amount (CAD)
                    </FieldLabel>
                    <Input
                      id={`cost-component-amount-${component.id}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        onEditorChange({
                          financialComponents: editor.financialComponents.map(
                            (row) =>
                              row.id === component.id
                                ? { ...row, amount: event.currentTarget.value }
                                : row
                          ),
                        })
                      }
                      placeholder="0.00"
                      value={component.amount}
                    />
                  </Field>
                  <Button
                    aria-label={`Remove financial component ${index + 1}`}
                    onClick={() => onRemoveFinancialComponent(component.id)}
                    size="sm"
                    variant="outline"
                  >
                    Remove
                  </Button>
                </FramePanel>
              </Frame>
            ))}
          </div>
        ) : null}
        {editor.financialComponents.length > 0 ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            Component reconciliation: {balance.financialRemainderLabel}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function draftCollaborationView(draft: BatchDraft): {
  collaborators: CostDocumentDraftCollaborator[];
  creator: CostDocumentDraftAccessPerson;
  eligibleCollaborators: CostDocumentDraftAccessPerson[];
} {
  const eligible = draft.collaboration?.eligibleCollaborators ?? [];
  const peopleById = new Map(
    eligible.map((person) => [person.workosUserId, person])
  );
  const creatorWorkosUserId = draft.creator?.workosUserId ?? "draft-creator";
  const creatorRecord = peopleById.get(creatorWorkosUserId);
  const creator: CostDocumentDraftAccessPerson = {
    displayName:
      creatorRecord?.displayName ??
      (draft.self?.workosUserId === creatorWorkosUserId
        ? "You"
        : "Draft creator"),
    roleLabel: roleLabel(creatorRecord?.role ?? "creator"),
    workosUserId: creatorWorkosUserId,
  };
  const currentCollaborators =
    draft.collaboration?.currentCollaborators ?? draft.collaborators ?? [];
  const currentIds = new Set(
    currentCollaborators.map((person) => person.workosUserId)
  );
  const collaborators = currentCollaborators.map((collaborator) => {
    const person = peopleById.get(collaborator.workosUserId);
    return {
      displayName: person?.displayName ?? collaborator.workosUserId,
      grantedAt: collaborator.grantedAt,
      roleLabel: roleLabel(person?.role ?? "Builder participant"),
      workosUserId: collaborator.workosUserId,
    };
  });
  const eligibleCollaborators = eligible
    .filter(
      (person) =>
        person.workosUserId !== creatorWorkosUserId &&
        !currentIds.has(person.workosUserId)
    )
    .map((person) => ({
      displayName: person.displayName,
      roleLabel: roleLabel(person.role),
      workosUserId: person.workosUserId,
    }));
  return { collaborators, creator, eligibleCollaborators };
}

function roleLabel(role: string) {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function FreezeManifestStep({
  draft,
  editor,
  isComplete,
}: {
  draft: BatchDraft;
  editor: DraftEditor;
  isComplete: boolean;
}) {
  const balance = balancePreview(editor);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold">Freeze manifest</h3>
        <p className="text-muted-foreground text-sm">
          Review the source pages, facts, allocations, and reconciliation that
          will be validated before this Cost Document can complete.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-xs">Title</dt>
          <dd className="font-medium text-sm">{editor.title || "Required"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Vendor</dt>
          <dd className="font-medium text-sm">
            {editor.vendorName || "Required"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Document date</dt>
          <dd className="font-medium text-sm">
            {editor.documentDate || "Required"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Gross total</dt>
          <dd className="font-medium text-sm tabular-nums">
            {balance.grossLabel}
          </dd>
        </div>
      </dl>
      <Frame>
        <FrameHeader>
          <FrameTitle>Source pages</FrameTitle>
        </FrameHeader>
        <FramePanel className="p-3">
          {draft.pages.length > 0 ? (
            <ol className="divide-y">
              {draft.pages.map((page) => (
                <li
                  className="flex min-w-0 items-center gap-3 py-2"
                  key={page.assetId}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {page.order}. {page.fileName || "Verified source page"}
                  </span>
                  <Badge variant="outline">
                    {page.contentHashSha256 ? "Verified" : "Saved"}
                  </Badge>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              Source pages required.
            </p>
          )}
        </FramePanel>
      </Frame>
      <Frame>
        <FrameHeader>
          <FrameTitle>Cost Allocations</FrameTitle>
        </FrameHeader>
        <FramePanel className="p-3">
          <p className="font-semibold text-sm tabular-nums">
            {balance.remainingLabel}
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {isComplete
              ? "This document is complete and can be reopened only by its owner."
              : "Complete only when remaining is zero and every manifest field is correct."}
          </p>
        </FramePanel>
      </Frame>
      <Alert>
        <ShieldCheck />
        <AlertTitle>Freeze is validated</AlertTitle>
        <AlertDescription>
          Completion is not submission. The server validates the source record
          again when the batch is atomically submitted.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function EmptyBatchEditor() {
  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>Add a Cost Document</FrameTitle>
        <FrameDescription>
          Add an Invoice or Receipt from the register to start its independent
          four-step workflow.
        </FrameDescription>
      </FrameHeader>
    </Frame>
  );
}

function autosavePayload(editor: DraftEditor): DraftAutosavePayload {
  const payload: DraftAutosavePayload = {
    description: editor.description,
    draftId: editor.draftId as Id<"costDocumentDrafts">,
    title: editor.title,
    vendorName: editor.vendorName,
    workingStateJson: serializeDraftWorkingState(editor),
  };
  const documentDate = editor.documentDate.trim();
  if (!documentDate || ISO_DATE_INPUT_PATTERN.test(documentDate)) {
    payload.documentDate = documentDate;
  }
  const grossTotal = editor.grossTotal.trim();
  if (grossTotal) {
    const parsedGrossTotal = tryParseCadCents(grossTotal);
    if (parsedGrossTotal !== null) {
      payload.grossTotalCents = parsedGrossTotal;
    }
  } else {
    payload.grossTotalCents = 0;
  }
  const allocations = autosaveAllocations(editor.allocations);
  if (allocations !== undefined) {
    payload.allocations = allocations;
  }
  const financialComponents = autosaveFinancialComponents(
    editor.financialComponents
  );
  if (financialComponents !== undefined) {
    payload.financialComponents = financialComponents;
  }
  return payload;
}

function autosaveAllocations(rows: AllocationEditorRow[]) {
  if (
    rows.every((row) => !(row.amount.trim() || row.buildSubmilestoneId.trim()))
  ) {
    return [];
  }
  const allocations = rows.map((row) => {
    const amountCents = tryParseCadCents(row.amount);
    if (!row.buildSubmilestoneId || amountCents === null) {
      return null;
    }
    return {
      amountCents,
      buildSubmilestoneId: row.buildSubmilestoneId as Id<"buildSubmilestones">,
    };
  });
  if (allocations.some((allocation) => allocation === null)) {
    return;
  }
  return allocations as Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
  }>;
}

function autosaveFinancialComponents(rows: FinancialComponentEditorRow[]) {
  if (rows.length === 0) {
    return [];
  }
  const components = rows.map((row) => {
    const amountCents = tryParseCadCents(row.amount);
    if (amountCents === null) {
      return null;
    }
    return {
      amountCents,
      kind: row.kind,
      label: row.label.trim() || undefined,
    };
  });
  if (
    components.some((component) => component === null) ||
    components.filter((component) => component?.kind === "subtotal").length !==
      1
  ) {
    return;
  }
  return components as Array<{
    amountCents: number;
    kind: FinancialComponentKind;
    label?: string;
  }>;
}

function editorOverrideForAutosave(
  editor: DraftEditor,
  draft: BatchDraft | undefined,
  submilestones: CostDocumentSubmilestoneOption[]
): Partial<BatchDraft> {
  const payload = autosavePayload(editor);
  const override: Partial<BatchDraft> = {
    description: editor.description.trim() || undefined,
    documentDate: editor.documentDate.trim() || undefined,
    title: editor.title.trim() || undefined,
    vendorName: editor.vendorName.trim() || undefined,
  };
  if (payload.grossTotalCents !== undefined) {
    override.grossTotalCents = payload.grossTotalCents;
  }
  if (payload.allocations !== undefined) {
    override.allocations = payload.allocations.map((allocation, index) => {
      const existing = draft?.allocations.find(
        (item) => item.buildSubmilestoneId === allocation.buildSubmilestoneId
      );
      const label = submilestones.find(
        (submilestone) =>
          String(submilestone.id) === String(allocation.buildSubmilestoneId)
      )?.label;
      return {
        amountCents: allocation.amountCents,
        buildSubmilestoneId: allocation.buildSubmilestoneId,
        order: index + 1,
        submilestoneKey: existing?.submilestoneKey ?? label ?? "Sub-milestone",
        submilestoneName:
          existing?.submilestoneName ?? label ?? "Sub-milestone",
      };
    });
  }
  if (payload.financialComponents !== undefined) {
    override.financialComponents = payload.financialComponents.map(
      (component, index) => ({ ...component, order: index + 1 })
    );
  }
  return override;
}

function draftToEditor(draft: BatchDraft): DraftEditor {
  const canonicalEditor: DraftEditor = {
    allocations:
      draft.allocations.length > 0
        ? draft.allocations.map((allocation, index) => ({
            amount: centsToInput(allocation.amountCents),
            buildSubmilestoneId: String(allocation.buildSubmilestoneId),
            id: `${draft._id}-allocation-${allocation.order || index + 1}`,
          }))
        : [
            {
              amount: "",
              buildSubmilestoneId: "",
              id: `${draft._id}-allocation-1`,
            },
          ],
    description: draft.description ?? "",
    documentDate: draft.documentDate ?? "",
    draftId: String(draft._id),
    financialComponents: draft.financialComponents.map((component, index) => ({
      amount: centsToInput(component.amountCents),
      id: `${draft._id}-financial-component-${component.order || index + 1}`,
      kind: component.kind,
      label: component.label ?? "",
    })),
    grossTotal:
      draft.grossTotalCents && draft.grossTotalCents > 0
        ? centsToInput(draft.grossTotalCents)
        : "",
    pageAssetIds: draft.pages.map((page) => String(page.assetId)),
    title: draft.title ?? "",
    vendorName: draft.vendorName ?? "",
  };
  return restoreDraftWorkingState(canonicalEditor, draft.workingStateJson);
}

function serializeDraftWorkingState(editor: DraftEditor) {
  const workingState: DraftWorkingState = {
    allocations: editor.allocations.map((allocation) => ({ ...allocation })),
    financialComponents: editor.financialComponents.map((component) => ({
      ...component,
    })),
    grossTotal: editor.grossTotal,
    version: 1,
  };
  return JSON.stringify(workingState);
}

function restoreDraftWorkingState(
  editor: DraftEditor,
  workingStateJson: string | undefined
) {
  const workingState = parseDraftWorkingState(workingStateJson);
  if (!workingState) {
    return editor;
  }
  return {
    ...editor,
    allocations: workingState.allocations,
    financialComponents: workingState.financialComponents,
    grossTotal: workingState.grossTotal,
  };
}

function parseDraftWorkingState(
  workingStateJson: string | undefined
): DraftWorkingState | undefined {
  if (!workingStateJson) {
    return;
  }
  try {
    const parsed = JSON.parse(workingStateJson) as unknown;
    if (!isDraftWorkingState(parsed)) {
      return;
    }
    return parsed;
  } catch {
    return;
  }
}

function isDraftWorkingState(value: unknown): value is DraftWorkingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    state.version === 1 &&
    typeof state.grossTotal === "string" &&
    Array.isArray(state.allocations) &&
    state.allocations.length <= MAX_COST_DOCUMENT_ALLOCATIONS &&
    state.allocations.every(isAllocationEditorRow) &&
    Array.isArray(state.financialComponents) &&
    state.financialComponents.length <=
      MAX_COST_DOCUMENT_FINANCIAL_COMPONENTS &&
    state.financialComponents.every(isFinancialComponentEditorRow)
  );
}

function isAllocationEditorRow(value: unknown): value is AllocationEditorRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.amount === "string" &&
    typeof row.buildSubmilestoneId === "string"
  );
}

function isFinancialComponentEditorRow(
  value: unknown
): value is FinancialComponentEditorRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.amount === "string" &&
    typeof row.label === "string" &&
    (row.kind === "subtotal" ||
      row.kind === "tax" ||
      row.kind === "fee" ||
      row.kind === "discount")
  );
}

function requiredCaptureFacts(editor: DraftEditor) {
  const title = editor.title.trim();
  const vendorName = editor.vendorName.trim();
  const documentDate = editor.documentDate.trim();
  if (!title) {
    throw new Error("Title is required before continuing.");
  }
  if (!vendorName) {
    throw new Error("Vendor is required before continuing.");
  }
  if (!documentDate) {
    throw new Error("Document date is required before continuing.");
  }
  return {
    description: editor.description.trim() || undefined,
    documentDate,
    title,
    vendorName,
  };
}

function exactBalanceFromEditor(editor: DraftEditor) {
  const grossTotalCents = parseNamedCadCents(
    editor.grossTotal,
    "Gross Document Total"
  );
  const allocations = editor.allocations.map((allocation, index) => {
    if (!allocation.buildSubmilestoneId) {
      throw new Error(
        `Choose a Sub-milestone for Cost Allocation ${index + 1}.`
      );
    }
    return {
      amountCents: parseNamedCadCents(
        allocation.amount,
        `Cost Allocation ${index + 1} amount`
      ),
      buildSubmilestoneId:
        allocation.buildSubmilestoneId as Id<"buildSubmilestones">,
    };
  });
  if (
    new Set(allocations.map((allocation) => allocation.buildSubmilestoneId))
      .size !== allocations.length
  ) {
    throw new Error(
      "Each Cost Allocation must target a different Sub-milestone."
    );
  }
  const allocatedCents = sumCents(
    allocations.map((allocation) => allocation.amountCents)
  );
  if (allocatedCents !== grossTotalCents) {
    throw new Error(
      "Cost Allocations must equal the Gross Document Total exactly."
    );
  }
  const financialComponents = editor.financialComponents.map(
    (component, index) => ({
      amountCents: parseNamedCadCents(
        component.amount,
        `Financial component ${index + 1} amount`
      ),
      kind: component.kind,
      label: component.label.trim() || undefined,
    })
  );
  if (financialComponents.length > 0) {
    const subtotalCount = financialComponents.filter(
      (component) => component.kind === "subtotal"
    ).length;
    if (subtotalCount !== 1) {
      throw new Error(
        "Financial reconciliation requires exactly one subtotal."
      );
    }
    const componentsTotal = financialComponents.reduce(
      (total, component) =>
        component.kind === "discount"
          ? total - component.amountCents
          : total + component.amountCents,
      0
    );
    if (componentsTotal !== grossTotalCents) {
      throw new Error(
        "Financial components must reconcile to the Gross Document Total exactly."
      );
    }
  }
  return { allocations, financialComponents, grossTotalCents };
}

function balancePreview(editor: DraftEditor) {
  const grossTotalCents = tryParseCadCents(editor.grossTotal);
  const allocatedCents = sumCents(
    editor.allocations.map(
      (allocation) => tryParseCadCents(allocation.amount) ?? 0
    )
  );
  const remainingCents =
    grossTotalCents === null ? 0 : grossTotalCents - allocatedCents;
  const financialNetCents = editor.financialComponents.reduce(
    (total, component) => {
      const amount = tryParseCadCents(component.amount) ?? 0;
      return component.kind === "discount" ? total - amount : total + amount;
    },
    0
  );
  return {
    allocatedCents,
    financialRemainderLabel:
      grossTotalCents === null
        ? "Gross total required"
        : `${formatCad(grossTotalCents - financialNetCents)} remaining`,
    grossLabel:
      grossTotalCents === null
        ? "Gross total required"
        : formatCad(grossTotalCents),
    remainingLabel:
      grossTotalCents === null
        ? "Gross total required"
        : `${formatCad(remainingCents)} remaining`,
  };
}

function stepIndex(step: DraftStep) {
  return STEPS.findIndex((item) => item.id === step);
}

function stepLabel(step: DraftStep) {
  return STEPS.find((item) => item.id === step)?.label ?? "Capture & confirm";
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function tryParseCadCents(value: string) {
  if (!value.trim()) {
    return null;
  }
  try {
    return parseCadCents(value);
  } catch {
    return null;
  }
}

function parseNamedCadCents(value: string, label: string) {
  try {
    return parseCadCents(value);
  } catch {
    throw new Error(`${label} must be a positive CAD amount.`);
  }
}

function safeFormatCad(value: string) {
  const cents = tryParseCadCents(value);
  return cents === null ? "Gross total required" : formatCad(cents);
}

function autosaveStatusLabel(status: DraftAutosaveStatus | undefined) {
  switch (status) {
    case "pending":
      return "Changes queued for secure draft save.";
    case "saving":
      return "Saving draft changes…";
    case "saved":
      return "Draft changes saved.";
    case "error":
      return "Draft changes need a retry before you leave this document.";
    default:
      return "Draft changes save automatically while you work.";
  }
}

function assertDraftPageUploadFits(draft: BatchDraft, files: File[]) {
  if (files.length === 0) {
    throw new Error("Choose at least one Invoice or Receipt page.");
  }
  if (files.length > MAX_COST_DOCUMENT_PAGES) {
    throw new Error(
      `A Cost Document supports at most ${MAX_COST_DOCUMENT_PAGES} pages.`
    );
  }
  if (draft.pages.length + files.length > MAX_COST_DOCUMENT_PAGES) {
    const availablePages = MAX_COST_DOCUMENT_PAGES - draft.pages.length;
    throw new Error(
      `This Cost Document already has ${draft.pages.length} saved page${draft.pages.length === 1 ? "" : "s"}. Add no more than ${availablePages} page${availablePages === 1 ? "" : "s"}.`
    );
  }
}

function sumCents(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error("Cost Allocation total exceeds safe integer cents.");
  }
  return total;
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function makeIdempotencyKey(prefix: string) {
  const identifier =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}:${identifier}`;
}
