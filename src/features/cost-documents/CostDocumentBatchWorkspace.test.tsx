// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mutationByRef = new Map<string, (...args: unknown[]) => unknown>();
const actionByRef = new Map<string, (...args: unknown[]) => unknown>();
const useQuery = vi.fn();
const uploadAssets = vi.fn();
const abandonAssets = vi.fn();

vi.mock("convex/react", () => ({
  useAction: (ref: Parameters<typeof getFunctionName>[0]) =>
    actionByRef.get(getFunctionName(ref)),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    mutationByRef.get(getFunctionName(ref)),
  useQuery: (ref: unknown, args: unknown) => useQuery(ref, args),
}));

vi.mock(
  "#/features/build-collaboration/build-collaboration-asset-upload.ts",
  () => ({
    abandonGovernedCollaborationAssets: (...args: unknown[]) =>
      abandonAssets(...args),
    uploadGovernedCollaborationAssets: (...args: unknown[]) =>
      uploadAssets(...args),
  })
);

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CostDocumentBatchWorkspace } from "./CostDocumentBatchWorkspace";

type BatchDraft = {
  _id: Id<"costDocumentDrafts">;
  activeStep: "capture_confirm" | "balance_allocate" | "share" | "freeze";
  allocations: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    order: number;
    submilestoneKey: string;
    submilestoneName: string;
  }>;
  batchId: Id<"costDocumentBatches">;
  capabilities: {
    canDiscardBatch: boolean;
    canEditDraft: boolean;
    canManageDraftCollaboration: boolean;
    canManageSourcePages: boolean;
    canReadDraft: boolean;
    canSubmitBatch: boolean;
  };
  category: "labour" | "materials";
  collaboration: {
    currentCollaborators: Array<{
      grantedAt: number;
      workosUserId: string;
    }>;
    eligibleCollaborators: Array<{
      displayName: string;
      role: string;
      workosUserId: string;
    }>;
  };
  completedAt?: number;
  creator: { workosUserId: string };
  currency: "CAD";
  description?: string;
  documentDate?: string;
  financialComponents: Array<{
    amountCents: number;
    kind: "subtotal" | "tax" | "fee" | "discount";
    label?: string;
    order: number;
  }>;
  grossTotalCents?: number;
  kind: "invoice" | "receipt";
  lifecycle: "draft" | "complete" | "submitted";
  order: number;
  pages: Array<{
    assetId: Id<"buildCollaborationAssets">;
    contentHashSha256?: string;
    fileName?: string;
    mimeType?: string;
    order: number;
    priorAssetId?: Id<"buildCollaborationAssets">;
  }>;
  revision: number;
  self: { workosUserId: string };
  submittedCostDocumentId?: Id<"costDocuments">;
  title?: string;
  vendorName?: string;
  workingStateJson?: string;
};

type BatchProjection = {
  _id: Id<"costDocumentBatches">;
  drafts: BatchDraft[];
  idempotencyKey?: string;
  revision: number;
  state: "active" | "submitted" | "abandoned";
  submittedAt?: number;
  supportingContextDisclosure: string;
};

type ExactDraftProjection = Omit<
  BatchDraft,
  "batchId" | "collaboration" | "order"
> & {
  collaborators?: Array<{
    grantedAt?: number;
    workosUserId: string;
  }>;
};

const SUPPORTING_CONTEXT_DISCLOSURE =
  "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.";

function makeDraft(overrides: Partial<BatchDraft> = {}): BatchDraft {
  return {
    _id: "draft-1" as Id<"costDocumentDrafts">,
    activeStep: "capture_confirm",
    allocations: [],
    batchId: "batch-1" as Id<"costDocumentBatches">,
    capabilities: {
      canDiscardBatch: true,
      canEditDraft: true,
      canManageDraftCollaboration: true,
      canManageSourcePages: true,
      canReadDraft: true,
      canSubmitBatch: true,
    },
    category: "materials",
    collaboration: {
      currentCollaborators: [],
      eligibleCollaborators: [],
    },
    creator: { workosUserId: "builder-owner" },
    currency: "CAD",
    financialComponents: [],
    kind: "invoice",
    lifecycle: "draft",
    order: 1,
    pages: [],
    revision: 1,
    self: { workosUserId: "builder-owner" },
    ...overrides,
  };
}

function makeBatch(overrides: Partial<BatchProjection> = {}): BatchProjection {
  return {
    _id: "batch-1" as Id<"costDocumentBatches">,
    drafts: [makeDraft()],
    revision: 1,
    state: "active",
    supportingContextDisclosure: SUPPORTING_CONTEXT_DISCLOSURE,
    ...overrides,
  };
}

function makeExactDraft(
  overrides: Partial<ExactDraftProjection> = {}
): ExactDraftProjection {
  const { batchId: _batchId, collaboration: _collaboration, order: _order, ...draft } =
    makeDraft();
  return { ...draft, ...overrides };
}

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject: reject!, resolve: resolve! };
}

describe("CostDocumentBatchWorkspace", () => {
  const beginUpload = vi.fn();
  const registerUpload = vi.fn();
  const finalizeAndScan = vi.fn();
  const createBatch = vi.fn();
  const addDraft = vi.fn();
  const saveDraft = vi.fn();
  const bindDraftPageAsset = vi.fn();
  const grantDraftCollaborator = vi.fn();
  const revokeDraftCollaborator = vi.fn();
  const setDraftStep = vi.fn();
  const submitBatch = vi.fn();
  let currentBatch: BatchProjection | null | undefined;
  let activeBatchQuery: BatchProjection | null | undefined;
  let routeBatchQuery: BatchProjection | null | undefined;
  let exactDraftQuery: ExactDraftProjection | null | undefined;

  const renderWorkspace = (input?: { batchId?: string; draftId?: string }) => {
    const onBatchIdChange = vi.fn();
    const workspace = (next?: { batchId?: string; draftId?: string }) => (
      <CostDocumentBatchWorkspace
        batchId={next?.batchId}
        buildId={"build-1" as Id<"activeBuilds">}
        draftId={next?.draftId}
        onBatchIdChange={onBatchIdChange}
        organizationId="org-1"
        submilestones={[
          {
            id: "submilestone-foundation" as Id<"buildSubmilestones">,
            label: "Foundation · Footings",
          },
          {
            id: "submilestone-envelope" as Id<"buildSubmilestones">,
            label: "Envelope · Insulation",
          },
        ]}
      />
    );
    const view = render(workspace(input));
    return {
      onBatchIdChange,
      rerenderWorkspace: (next?: { batchId?: string; draftId?: string }) =>
        view.rerender(workspace(next)),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mutationByRef.clear();
    actionByRef.clear();
    currentBatch = null;
    activeBatchQuery = undefined;
    routeBatchQuery = undefined;
    exactDraftQuery = undefined;
    useQuery.mockImplementation((ref: unknown, args: unknown) => {
      const functionName = getFunctionName(
        ref as Parameters<typeof getFunctionName>[0]
      );
      if (
        functionName ===
        getFunctionName(api.cost_documents.getActiveCostDocumentBatch)
      ) {
        return args === "skip" ? undefined : activeBatchQuery ?? currentBatch;
      }
      if (
        functionName === getFunctionName(api.cost_documents.getCostDocumentBatch)
      ) {
        return args === "skip" ? undefined : routeBatchQuery ?? currentBatch;
      }
      if (
        functionName === getFunctionName(api.cost_documents.getCostDocumentDraft)
      ) {
        return args === "skip" ? undefined : exactDraftQuery;
      }
      return undefined;
    });
    createBatch.mockResolvedValue("batch-created");
    addDraft.mockResolvedValue("draft-created");
    saveDraft.mockResolvedValue(null);
    setDraftStep.mockResolvedValue(null);
    submitBatch.mockResolvedValue({
      batchId: "batch-1",
      costDocumentIds: ["cost-document-1"],
      replayed: false,
    });
    bindDraftPageAsset.mockResolvedValue({ order: 1 });
    grantDraftCollaborator.mockResolvedValue({
      draftId: "draft-1",
      revision: 2,
    });
    revokeDraftCollaborator.mockResolvedValue({
      draftId: "draft-1",
      revision: 2,
    });
    uploadAssets.mockImplementation(
      async (
        files: File[],
        context: {
          onFinalizedCleanAsset?: (asset: {
            assetId: Id<"buildCollaborationAssets">;
            file: File;
          }) => Promise<void> | void;
        }
      ) => {
        const assetIds = files.map(
          (_, index) =>
            `asset-uploaded${index === 0 ? "" : `-${index + 1}`}` as Id<"buildCollaborationAssets">
        );
        for (const [index, file] of files.entries()) {
          await context.onFinalizedCleanAsset?.({
            assetId: assetIds[index]!,
            file,
          });
        }
        return assetIds;
      }
    );

    mutationByRef.set(
      getFunctionName(
        api.build_collaboration_assets.beginBuildCollaborationAssetUpload
      ),
      beginUpload
    );
    mutationByRef.set(
      getFunctionName(
        api.build_collaboration_assets
          .registerBuildCollaborationAssetUploadedStorage
      ),
      registerUpload
    );
    mutationByRef.set(
      getFunctionName(
        api.build_collaboration_assets.abandonMyBuildCollaborationAssets
      ),
      abandonAssets
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.createCostDocumentBatch),
      createBatch
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.addCostDocumentDraft),
      addDraft
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.saveCostDocumentDraft),
      saveDraft
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.bindCostDocumentDraftPageAsset),
      bindDraftPageAsset
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.setCostDocumentDraftStep),
      setDraftStep
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.submitCostDocumentBatch),
      submitBatch
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.grantCostDocumentDraftCollaborator),
      grantDraftCollaborator
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.revokeCostDocumentDraftCollaborator),
      revokeDraftCollaborator
    );
    actionByRef.set(
      getFunctionName(
        api.build_collaboration_asset_actions
          .finalizeAndScanBuildCollaborationAssetUpload
      ),
      finalizeAndScan
    );
  });

  afterEach(() => cleanup());

  test("creates a batch with an idempotent server result, resumes an active batch, and clears the route on close", async () => {
    const { onBatchIdChange } = renderWorkspace();

    fireEvent.click(
      screen.getByRole("button", { name: "Start Cost Document batch" })
    );

    await waitFor(() => expect(createBatch).toHaveBeenCalledTimes(1));
    expect(createBatch).toHaveBeenCalledWith(
      expect.objectContaining({ buildId: "build-1", organizationId: "org-1" })
    );
    expect(onBatchIdChange).toHaveBeenCalledWith("batch-created");

    cleanup();
    currentBatch = makeBatch({
      _id: "batch-recovered" as Id<"costDocumentBatches">,
    });
    const resumed = renderWorkspace();

    await waitFor(() =>
      expect(resumed.onBatchIdChange).toHaveBeenCalledWith("batch-recovered")
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Close Cost Document batch" })
    );
    await waitFor(() =>
      expect(resumed.onBatchIdChange).toHaveBeenLastCalledWith(undefined)
    );
  });

  test("resolves an explicit batch route through the exact scoped batch query", () => {
    routeBatchQuery = makeBatch({
      _id: "batch-from-route" as Id<"costDocumentBatches">,
      drafts: [makeDraft({ title: "Route-resolved source" })],
    });
    activeBatchQuery = makeBatch({
      _id: "batch-recovery-only" as Id<"costDocumentBatches">,
      drafts: [makeDraft({ title: "Recovery-only source" })],
    });

    renderWorkspace({ batchId: "batch-from-route" });

    expect(useQuery).toHaveBeenCalledWith(
      api.cost_documents.getActiveCostDocumentBatch,
      "skip"
    );
    expect(useQuery).toHaveBeenCalledWith(
      api.cost_documents.getCostDocumentBatch,
      {
        batchId: "batch-from-route",
        buildId: "build-1",
        organizationId: "org-1",
      }
    );
    expect(
      screen.getByTestId("cost-document-batch-editor").textContent
    ).toContain("Route-resolved source");
    expect(screen.queryByText("Recovery-only source")).toBeNull();
  });

  test("fails closed to the scoped unavailable state for a malformed batch deep link", () => {
    currentBatch = null;
    routeBatchQuery = null;

    renderWorkspace({ batchId: "not-a-convex-cost-document-batch" });

    expect(useQuery).toHaveBeenCalledWith(
      api.cost_documents.getActiveCostDocumentBatch,
      "skip"
    );
    expect(useQuery).toHaveBeenCalledWith(
      api.cost_documents.getCostDocumentBatch,
      {
        batchId: "not-a-convex-cost-document-batch",
        buildId: "build-1",
        organizationId: "org-1",
      }
    );
    expect(screen.getByText("Cost Document batch unavailable")).toBeTruthy();
    expect(screen.getByText("Recovery needed")).toBeTruthy();
  });

  test("renders one exact shared Draft without querying or exposing the creator batch", () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({ title: "Private sibling source" }),
        makeDraft({
          _id: "draft-private-sibling" as Id<"costDocumentDrafts">,
          order: 2,
          title: "Second private sibling",
        }),
      ],
    });
    exactDraftQuery = makeExactDraft({
      _id: "draft-shared" as Id<"costDocumentDrafts">,
      activeStep: "share",
      capabilities: {
        canDiscardBatch: false,
        canEditDraft: true,
        canManageDraftCollaboration: false,
        canManageSourcePages: true,
        canReadDraft: true,
        canSubmitBatch: false,
      },
      collaborators: [{ workosUserId: "builder-staff" }],
      creator: { workosUserId: "builder-owner" },
      revision: 6,
      self: { workosUserId: "builder-staff" },
      title: "Shared insulation invoice",
    });

    renderWorkspace({ draftId: "draft-shared" });

    expect(useQuery).toHaveBeenCalledWith(
      api.cost_documents.getActiveCostDocumentBatch,
      "skip"
    );
    expect(useQuery).toHaveBeenCalledWith(
      api.cost_documents.getCostDocumentBatch,
      "skip"
    );
    expect(useQuery).toHaveBeenCalledWith(
      api.cost_documents.getCostDocumentDraft,
      {
        buildId: "build-1",
        draftId: "draft-shared",
        organizationId: "org-1",
      }
    );
    expect(screen.getByText("Shared Cost Document")).toBeTruthy();
    expect(screen.getByText("Shared insulation invoice")).toBeTruthy();
    expect(
      screen.getByText(
        "Draft access cannot be changed from your current capacity."
      )
    ).toBeTruthy();
    expect(screen.queryByText("Private sibling source")).toBeNull();
    expect(screen.queryByText("Second private sibling")).toBeNull();
    expect(screen.queryByTestId("cost-document-batch-register")).toBeNull();
    expect(screen.queryByTestId("batch-submit")).toBeNull();
    expect(screen.queryByLabelText("Search eligible collaborators")).toBeNull();
  });

  test("drops optimistic sibling state when the same workspace switches to an exact Draft", async () => {
    currentBatch = makeBatch({
      drafts: [makeDraft({ title: "Creator source" })],
    });
    const view = renderWorkspace({ batchId: "batch-1" });
    fireEvent.click(screen.getByRole("button", { name: "Add document" }));
    await waitFor(() =>
      expect(screen.getByTestId("draft-draft-created")).toBeTruthy()
    );

    exactDraftQuery = makeExactDraft({
      _id: "draft-shared-only" as Id<"costDocumentDrafts">,
      activeStep: "share",
      capabilities: {
        canDiscardBatch: false,
        canEditDraft: true,
        canManageDraftCollaboration: false,
        canManageSourcePages: false,
        canReadDraft: true,
        canSubmitBatch: false,
      },
      creator: { workosUserId: "builder-owner" },
      revision: 4,
      self: { workosUserId: "builder-staff" },
      title: "Only shared source",
    });
    view.rerenderWorkspace({ draftId: "draft-shared-only" });

    expect(screen.getByText("Only shared source")).toBeTruthy();
    expect(screen.queryByText("Creator source")).toBeNull();
    expect(screen.queryByTestId("draft-draft-created")).toBeNull();
    expect(screen.queryByTestId("cost-document-batch-register")).toBeNull();
  });

  test("wires the owner Share ledger to exact-Draft grant mutations at the projected revision", async () => {
    grantDraftCollaborator.mockResolvedValueOnce({
      draftId: "draft-1",
      revision: 8,
    });
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "share",
          collaboration: {
            currentCollaborators: [
              { grantedAt: 1_723_000_000_000, workosUserId: "staff-sam" },
            ],
            eligibleCollaborators: [
              {
                displayName: "Sam Rivera",
                role: "builder-staff",
                workosUserId: "staff-sam",
              },
              {
                displayName: "Anika Patel",
                role: "builder-staff",
                workosUserId: "staff-anika",
              },
            ],
          },
          revision: 7,
          title: "Electrical rough-in invoice",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    expect(screen.getByText("Collaborator · Builder Staff")).toBeTruthy();
    expect(screen.queryByText("Private sibling source")).toBeNull();
    const search = screen.getByLabelText("Search eligible collaborators");
    fireEvent.click(search);
    fireEvent.change(search, { target: { value: "anika" } });
    fireEvent.click(screen.getByRole("option", { name: /Anika Patel/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm Draft access" })
    );

    await waitFor(() =>
      expect(grantDraftCollaborator).toHaveBeenCalledWith({
        collaboratorWorkosUserId: "staff-anika",
        draftId: "draft-1",
        expectedRevision: 7,
      })
    );
  });

  test("handles immediate exact-Draft revocation without offering private batch recovery", () => {
    exactDraftQuery = null;

    renderWorkspace({ draftId: "draft-revoked" });

    expect(screen.getByText("Cost Document Draft unavailable")).toBeTruthy();
    expect(screen.getByText("Access ended")).toBeTruthy();
    expect(screen.queryByText("Cost Document batch unavailable")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start Cost Document batch" })).toBeNull();
  });

  test("persists collaborator edits against the exact projected revision without a batch mutation", async () => {
    exactDraftQuery = makeExactDraft({
      _id: "draft-shared-edit" as Id<"costDocumentDrafts">,
      capabilities: {
        canDiscardBatch: false,
        canEditDraft: true,
        canManageDraftCollaboration: false,
        canManageSourcePages: true,
        canReadDraft: true,
        canSubmitBatch: false,
      },
      creator: { workosUserId: "builder-owner" },
      revision: 6,
      self: { workosUserId: "builder-staff" },
      title: "Shared source",
    });
    renderWorkspace({ draftId: "draft-shared-edit" });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Collaborator-updated source" },
    });

    await waitFor(
      () =>
        expect(saveDraft).toHaveBeenCalledWith(
          expect.objectContaining({
            draftId: "draft-shared-edit",
            expectedRevision: 6,
            title: "Collaborator-updated source",
          })
        ),
      { timeout: 1500 }
    );
    expect(addDraft).not.toHaveBeenCalled();
    expect(submitBatch).not.toHaveBeenCalled();
  });

  test("keeps the editor base revision when a reactive collaborator update arrives before autosave", async () => {
    saveDraft.mockRejectedValueOnce(
      new Error(
        "Draft revision conflict: this Cost Document changed while you were editing."
      )
    );
    exactDraftQuery = makeExactDraft({
      _id: "draft-stale" as Id<"costDocumentDrafts">,
      capabilities: {
        canDiscardBatch: false,
        canEditDraft: true,
        canManageDraftCollaboration: false,
        canManageSourcePages: true,
        canReadDraft: true,
        canSubmitBatch: false,
      },
      creator: { workosUserId: "builder-owner" },
      revision: 11,
      self: { workosUserId: "builder-staff" },
      title: "Server title",
    });
    const { rerenderWorkspace } = renderWorkspace({
      draftId: "draft-stale",
    });

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "Preserved local title" } });
    exactDraftQuery = makeExactDraft({
      _id: "draft-stale" as Id<"costDocumentDrafts">,
      capabilities: {
        canDiscardBatch: false,
        canEditDraft: true,
        canManageDraftCollaboration: false,
        canManageSourcePages: true,
        canReadDraft: true,
        canSubmitBatch: false,
      },
      creator: { workosUserId: "builder-owner" },
      revision: 12,
      self: { workosUserId: "builder-staff" },
      title: "Other collaborator title",
    });
    rerenderWorkspace({ draftId: "draft-stale" });

    expect(
      await screen.findByText(/Draft revision conflict/i, {}, { timeout: 1500 })
    ).toBeTruthy();
    expect(title.value).toBe("Preserved local title");
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: "draft-stale",
        expectedRevision: 11,
      })
    );
  });

  test("adopts a newer reactive projection when the local editor is clean", async () => {
    exactDraftQuery = makeExactDraft({
      _id: "draft-clean-refresh" as Id<"costDocumentDrafts">,
      revision: 3,
      title: "Original server title",
    });
    const { rerenderWorkspace } = renderWorkspace({
      draftId: "draft-clean-refresh",
    });

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Original server title"
    );
    exactDraftQuery = makeExactDraft({
      _id: "draft-clean-refresh" as Id<"costDocumentDrafts">,
      revision: 4,
      title: "Fresh collaborator title",
    });
    rerenderWorkspace({ draftId: "draft-clean-refresh" });

    await waitFor(() =>
      expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
        "Fresh collaborator title"
      )
    );
    expect(saveDraft).not.toHaveBeenCalled();
  });

  test("renders a completed collaborator projection read-only without creator reopen controls", () => {
    exactDraftQuery = makeExactDraft({
      _id: "draft-complete-collaborator" as Id<"costDocumentDrafts">,
      activeStep: "freeze",
      capabilities: {
        canDiscardBatch: false,
        canEditDraft: false,
        canManageDraftCollaboration: false,
        canManageSourcePages: false,
        canReadDraft: true,
        canSubmitBatch: false,
      },
      completedAt: 1_723_000_000_000,
      creator: { workosUserId: "builder-owner" },
      lifecycle: "complete",
      revision: 12,
      self: { workosUserId: "builder-staff" },
      title: "Completed shared source",
    });
    renderWorkspace({ draftId: "draft-complete-collaborator" });

    expect(screen.getByText("Read-only Cost Document Draft")).toBeTruthy();
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Reopen to Share" })
    ).toBeNull();
    expect(screen.queryByTestId("batch-submit")).toBeNull();
  });

  test("recovers server drafts and keeps navigation and progress independent for each document", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          _id: "draft-capture" as Id<"costDocumentDrafts">,
          title: "Northline insulation package",
        }),
        makeDraft({
          _id: "draft-balance" as Id<"costDocumentDrafts">,
          activeStep: "balance_allocate",
          documentDate: "2026-08-01",
          grossTotalCents: 7_940_00,
          order: 2,
          pages: [
            {
              assetId: "asset-concrete" as Id<"buildCollaborationAssets">,
              fileName: "concrete.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
          ],
          title: "Foundation concrete deliveries",
          vendorName: "Redwood Concrete",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    expect(screen.getByTestId("draft-progress-draft-capture").textContent).toContain(
      "Step 1 of 4"
    );
    fireEvent.click(screen.getByTestId("draft-draft-balance"));

    await waitFor(() =>
      expect(
        screen.getByTestId("cost-document-batch-editor").textContent
      ).toContain("Foundation concrete deliveries")
    );
    expect(screen.getByTestId("draft-progress-draft-balance").textContent).toContain(
      "Step 2 of 4"
    );
    expect(
      screen.getByRole("button", { name: "Back to Capture & confirm" })
    ).not.toBeNull();
  });

  test("flushes unsaved draft facts before switching documents", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          _id: "draft-one" as Id<"costDocumentDrafts">,
          title: "Initial first document",
        }),
        makeDraft({
          _id: "draft-two" as Id<"costDocumentDrafts">,
          order: 2,
          title: "Second document",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Durable first document" },
    });
    fireEvent.change(screen.getByLabelText("Vendor"), {
      target: { value: "Northline Supply Co." },
    });
    fireEvent.change(screen.getByLabelText("Document date"), {
      target: { value: "2026-08-02" },
    });

    fireEvent.click(screen.getByTestId("draft-draft-two"));

    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          documentDate: "2026-08-02",
          draftId: "draft-one",
          title: "Durable first document",
          vendorName: "Northline Supply Co.",
        })
      )
    );
    expect(
      screen.getByTestId("cost-document-batch-editor").textContent
    ).toContain("Second document");

    fireEvent.click(screen.getByTestId("draft-draft-one"));
    await waitFor(() =>
      expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
        "Durable first document"
      )
    );
  });

  test("persists queued fact edits when the browser begins unloading", async () => {
    currentBatch = makeBatch({
      drafts: [makeDraft({ title: "Initial source" })],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Reload-safe source" },
    });
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: "draft-1",
          title: "Reload-safe source",
        })
      )
    );
  });

  test("restores and autosaves exact incomplete reconciliation editor state", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "balance_allocate",
          workingStateJson: JSON.stringify({
            allocations: [
              {
                amount: "41.",
                buildSubmilestoneId: "submilestone-foundation",
                id: "raw-allocation-1",
              },
              {
                amount: "",
                buildSubmilestoneId: "",
                id: "raw-allocation-2",
              },
            ],
            financialComponents: [
              {
                amount: "12.",
                id: "raw-component-1",
                kind: "subtotal",
                label: "Untallied subtotal",
              },
            ],
            grossTotal: "53.",
            version: 1,
          }),
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    expect(
      (screen.getByLabelText(
        "Gross Document Total (CAD)"
      ) as HTMLInputElement).value
    ).toBe("53.");
    expect(
      (screen.getByLabelText(
        "Cost allocation 1 amount (CAD)"
      ) as HTMLInputElement).value
    ).toBe("41.");
    expect(
      (screen.getByLabelText("Component 1 amount (CAD)") as HTMLInputElement)
        .value
    ).toBe("12.");

    fireEvent.change(screen.getByLabelText("Component 1 amount (CAD)"), {
      target: { value: "12.3" },
    });
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: "draft-1",
          workingStateJson: expect.any(String),
        })
      )
    );
    const persisted = saveDraft.mock.calls.find(
      ([input]) => (input as { draftId?: string }).draftId === "draft-1"
    )?.[0] as { workingStateJson?: string };
    expect(JSON.parse(persisted.workingStateJson ?? "{}")).toEqual({
      allocations: [
        {
          amount: "41.",
          buildSubmilestoneId: "submilestone-foundation",
          id: "raw-allocation-1",
        },
        {
          amount: "",
          buildSubmilestoneId: "",
          id: "raw-allocation-2",
        },
      ],
      financialComponents: [
        {
          amount: "12.3",
          id: "raw-component-1",
          kind: "subtotal",
          label: "Untallied subtotal",
        },
      ],
      grossTotal: "53.",
      version: 1,
    });
  });

  test("flushes total, allocation, and financial-component edits before switching documents", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          _id: "draft-reconciliation" as Id<"costDocumentDrafts">,
          activeStep: "balance_allocate",
          documentDate: "2026-08-02",
          pages: [
            {
              assetId: "asset-reconciliation" as Id<"buildCollaborationAssets">,
              fileName: "reconciliation.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
          ],
          title: "Reconciliation source",
          vendorName: "Northline Supply Co.",
        }),
        makeDraft({
          _id: "draft-after-reconciliation" as Id<"costDocumentDrafts">,
          order: 2,
          title: "Second reconciliation source",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByLabelText("Gross Document Total (CAD)"), {
      target: { value: "125.00" },
    });
    fireEvent.change(
      screen.getByLabelText("Cost allocation 1 Sub-milestone"),
      { target: { value: "submilestone-foundation" } }
    );
    fireEvent.change(screen.getByLabelText("Cost allocation 1 amount (CAD)"), {
      target: { value: "125.00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add financial component" })
    );
    fireEvent.change(screen.getByLabelText("Component 1 label"), {
      target: { value: "Materials subtotal" },
    });
    fireEvent.change(screen.getByLabelText("Component 1 amount (CAD)"), {
      target: { value: "125.00" },
    });

    fireEvent.click(screen.getByTestId("draft-draft-after-reconciliation"));

    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          allocations: [
            {
              amountCents: 12_500,
              buildSubmilestoneId: "submilestone-foundation",
            },
          ],
          draftId: "draft-reconciliation",
          financialComponents: [
            {
              amountCents: 12_500,
              kind: "subtotal",
              label: "Materials subtotal",
            },
          ],
          grossTotalCents: 12_500,
        })
      )
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("cost-document-batch-editor").textContent
      ).toContain("Second reconciliation source")
    );

    fireEvent.click(screen.getByTestId("draft-draft-reconciliation"));
    await waitFor(() =>
      expect(
        (screen.getByLabelText(
          "Gross Document Total (CAD)"
        ) as HTMLInputElement).value
      ).toBe("125.00")
    );
    expect(
      (screen.getByLabelText(
        "Cost allocation 1 amount (CAD)"
      ) as HTMLInputElement).value
    ).toBe("125.00");
    expect(
      (screen.getByLabelText(
        "Component 1 amount (CAD)"
      ) as HTMLInputElement).value
    ).toBe("125.00");
  });

  test("uploads source pages only while capturing and binds each upload to the Cost Document draft", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          _id: "draft-capture" as Id<"costDocumentDrafts">,
          documentDate: "2026-08-01",
          title: "Insulation invoice",
          vendorName: "Northline Supply Co.",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByTestId("page-input"), {
      target: {
        files: [
          new File(["page"], "northline.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload source pages" }));

    await waitFor(() => expect(uploadAssets).toHaveBeenCalledTimes(1));
    expect(uploadAssets).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "northline.pdf" })],
      expect.objectContaining({
        buildId: "build-1",
        contextKind: "costDocumentDraft",
        contextRecordId: "draft-capture",
        organizationId: "org-1",
      })
    );
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: "draft-capture",
        pageAssetIds: ["asset-uploaded"],
      })
    );
    expect(bindDraftPageAsset).toHaveBeenCalledWith({
      assetId: "asset-uploaded",
      draftId: "draft-capture",
      expectedRevision: 1,
    });

    cleanup();
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "balance_allocate",
          documentDate: "2026-08-01",
          pages: [
            {
              assetId: "asset-uploaded" as Id<"buildCollaborationAssets">,
              fileName: "northline.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
          ],
          title: "Insulation invoice",
          vendorName: "Northline Supply Co.",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });
    expect(screen.queryByTestId("page-input")).toBeNull();
  });

  test("keeps selected Capture files through an optimistic draft refresh before upload", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          _id: "draft-edit-before-upload" as Id<"costDocumentDrafts">,
          title: "Initial source",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByTestId("page-input"), {
      target: {
        files: [
          new File(["page"], "edit-survives.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    expect(screen.getByText("edit-survives.pdf")).toBeTruthy();

    // Editing produces an optimistic activeDraft object refresh. The selected
    // page must remain queued for this same draft rather than being cleared by
    // the reconciliation effect.
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Edited source before upload" },
    });
    await waitFor(() =>
      expect(screen.getByText("edit-survives.pdf")).toBeTruthy()
    );
    expect(
      screen.getByRole("button", { name: "Upload source pages" }).hasAttribute(
        "disabled"
      )
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Upload source pages" }));

    await waitFor(() =>
      expect(uploadAssets).toHaveBeenCalledWith(
        [expect.objectContaining({ name: "edit-survives.pdf" })],
        expect.objectContaining({ contextRecordId: "draft-edit-before-upload" })
      )
    );
    await waitFor(() =>
      expect(bindDraftPageAsset).toHaveBeenCalledWith({
        assetId: "asset-uploaded",
        draftId: "draft-edit-before-upload",
        expectedRevision: 1,
      })
    );
  });

  test("retains only unbound Capture files after a partial multi-page upload failure", async () => {
    uploadAssets.mockImplementationOnce(
      async (
        files: File[],
        context: {
          onFinalizedCleanAsset?: (asset: {
            assetId: Id<"buildCollaborationAssets">;
            file: File;
          }) => Promise<void> | void;
        }
      ) => {
        const firstFile = files[0];
        if (!firstFile) {
          throw new Error("Missing first source page.");
        }
        await context.onFinalizedCleanAsset?.({
          assetId: "asset-retained" as Id<"buildCollaborationAssets">,
          file: firstFile,
        });
        throw new Error("The second page scan failed.");
      }
    );
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          _id: "draft-partial-upload" as Id<"costDocumentDrafts">,
          title: "Partial upload source",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByTestId("page-input"), {
      target: {
        files: [
          new File(["first"], "retained.pdf", { type: "application/pdf" }),
          new File(["second"], "retry.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload source pages" }));

    await waitFor(() =>
      expect(bindDraftPageAsset).toHaveBeenCalledWith({
        assetId: "asset-retained",
        draftId: "draft-partial-upload",
        expectedRevision: 1,
      })
    );
    await waitFor(() => expect(screen.getByText("retry.pdf")).toBeTruthy());
    expect(screen.getByText("The second page scan failed.")).toBeTruthy();
    expect(screen.queryByText("retained.pdf")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Upload source pages" }).hasAttribute(
        "disabled"
      )
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Upload source pages" }));

    await waitFor(() => expect(uploadAssets).toHaveBeenCalledTimes(2));
    const retryFiles = uploadAssets.mock.calls[1]?.[0] as File[];
    expect(retryFiles).toHaveLength(1);
    expect(retryFiles[0]?.name).toBe("retry.pdf");
    await waitFor(() =>
      expect(bindDraftPageAsset).toHaveBeenCalledWith({
        assetId: "asset-uploaded",
        draftId: "draft-partial-upload",
        expectedRevision: 2,
      })
    );
  });

  test("locks document selection until each clean uploaded page is bound to its originating draft", async () => {
    const uploadCompletion = deferred<Id<"buildCollaborationAssets">[]>();
    uploadAssets.mockImplementationOnce(
      async (
        files: File[],
        context: {
          onFinalizedCleanAsset?: (asset: {
            assetId: Id<"buildCollaborationAssets">;
            file: File;
          }) => Promise<void> | void;
        }
      ) => {
        const assetIds = await uploadCompletion.promise;
        for (const [index, file] of files.entries()) {
          await context.onFinalizedCleanAsset?.({
            assetId: assetIds[index]!,
            file,
          });
        }
        return assetIds;
      }
    );
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          _id: "draft-upload-origin" as Id<"costDocumentDrafts">,
          title: "Originating upload document",
        }),
        makeDraft({
          _id: "draft-upload-other" as Id<"costDocumentDrafts">,
          order: 2,
          title: "Other document",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByTestId("page-input"), {
      target: {
        files: [
          new File(["page"], "originating.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload source pages" }));

    await waitFor(() => expect(uploadAssets).toHaveBeenCalledTimes(1));
    const otherDraft = screen.getByTestId("draft-draft-upload-other");
    expect(otherDraft.hasAttribute("disabled")).toBe(true);
    fireEvent.click(otherDraft);
    expect(
      screen.getByTestId("cost-document-batch-editor").textContent
    ).toContain("Originating upload document");

    uploadCompletion.resolve([
      "asset-originating" as Id<"buildCollaborationAssets">,
    ]);

    await waitFor(() =>
      expect(bindDraftPageAsset).toHaveBeenCalledWith({
        assetId: "asset-originating",
        draftId: "draft-upload-origin",
        expectedRevision: 1,
      })
    );
    await waitFor(() =>
      expect(saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: "draft-upload-origin",
          pageAssetIds: ["asset-originating"],
        })
      )
    );
    expect(
      saveDraft.mock.calls.some(
        ([input]) =>
          (input as { draftId?: string }).draftId === "draft-upload-other"
      )
    ).toBe(false);
  });

  test("keeps the upload base revision when a reactive page update arrives during scanning", async () => {
    const uploadCompletion = deferred<Id<"buildCollaborationAssets">[]>();
    uploadAssets.mockImplementationOnce(
      async (
        files: File[],
        context: {
          onFinalizedCleanAsset?: (asset: {
            assetId: Id<"buildCollaborationAssets">;
            file: File;
          }) => Promise<void> | void;
        }
      ) => {
        const assetIds = await uploadCompletion.promise;
        for (const [index, file] of files.entries()) {
          await context.onFinalizedCleanAsset?.({
            assetId: assetIds[index]!,
            file,
          });
        }
        return assetIds;
      }
    );
    bindDraftPageAsset.mockRejectedValueOnce(
      new Error(
        "Draft revision conflict: this Cost Document changed while you were uploading."
      )
    );
    exactDraftQuery = makeExactDraft({
      _id: "draft-upload-conflict" as Id<"costDocumentDrafts">,
      pages: [
        {
          assetId: "asset-creator" as Id<"buildCollaborationAssets">,
          fileName: "creator.pdf",
          mimeType: "application/pdf",
          order: 1,
        },
      ],
      revision: 5,
      title: "Shared upload source",
    });
    const { rerenderWorkspace } = renderWorkspace({
      draftId: "draft-upload-conflict",
    });

    fireEvent.change(screen.getByTestId("page-input"), {
      target: {
        files: [
          new File(["page"], "collaborator.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload source pages" }));
    await waitFor(() => expect(uploadAssets).toHaveBeenCalledTimes(1));

    exactDraftQuery = makeExactDraft({
      _id: "draft-upload-conflict" as Id<"costDocumentDrafts">,
      pages: [
        {
          assetId: "asset-creator" as Id<"buildCollaborationAssets">,
          fileName: "creator.pdf",
          mimeType: "application/pdf",
          order: 1,
        },
        {
          assetId:
            "asset-other-collaborator" as Id<"buildCollaborationAssets">,
          fileName: "other.pdf",
          mimeType: "application/pdf",
          order: 2,
        },
      ],
      revision: 6,
      title: "Shared upload source",
    });
    rerenderWorkspace({ draftId: "draft-upload-conflict" });
    uploadCompletion.resolve([
      "asset-upload-conflict" as Id<"buildCollaborationAssets">,
    ]);

    await waitFor(() =>
      expect(bindDraftPageAsset).toHaveBeenCalledWith({
        assetId: "asset-upload-conflict",
        draftId: "draft-upload-conflict",
        expectedRevision: 5,
      })
    );
    expect(await screen.findByText(/Draft revision conflict/i)).toBeTruthy();
    expect(saveDraft).not.toHaveBeenCalled();
  });

  test("reorders and removes already-bound Capture pages through the durable replacement contract", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          pages: [
            {
              assetId: "asset-page-one" as Id<"buildCollaborationAssets">,
              fileName: "first.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
            {
              assetId: "asset-page-two" as Id<"buildCollaborationAssets">,
              fileName: "second.pdf",
              mimeType: "application/pdf",
              order: 2,
            },
          ],
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.click(
      screen.getByRole("button", { name: "Move page 2 earlier" })
    );
    await waitFor(() =>
      expect(saveDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draftId: "draft-1",
          pageAssetIds: ["asset-page-two", "asset-page-one"],
        })
      )
    );
    expect(screen.getByText("1. second.pdf")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove page 2" }));
    await waitFor(() =>
      expect(saveDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draftId: "draft-1",
          pageAssetIds: ["asset-page-two"],
        })
      )
    );
    expect(screen.queryByText("2. first.pdf")).toBeNull();
  });

  test("replaces a bound Capture page through the atomic draft-specific binding contract", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          pages: [
            {
              assetId: "asset-original" as Id<"buildCollaborationAssets">,
              fileName: "original.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
          ],
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByLabelText("Replace page 1"), {
      target: {
        files: [
          new File(["replacement"], "replacement.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() =>
      expect(bindDraftPageAsset).toHaveBeenCalledWith({
        assetId: "asset-uploaded",
        draftId: "draft-1",
        expectedRevision: 1,
        replaceAssetId: "asset-original",
      })
    );
    expect(uploadAssets).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "replacement.pdf" })],
      expect.objectContaining({
        contextKind: "costDocumentDraft",
        contextRecordId: "draft-1",
      })
    );
    const replacementUploadContext = uploadAssets.mock.calls[0]?.[1] as {
      supersedesAssetId?: unknown;
    };
    expect(replacementUploadContext.supersedesAssetId).toBeUndefined();
    expect(
      saveDraft.mock.calls.some(
        ([input]) =>
          (input as { pageAssetIds?: string[] }).pageAssetIds?.includes(
            "asset-uploaded"
          )
      )
    ).toBe(false);
  });

  test("saves multiple exact Cost Allocations through the full-width reconciliation step", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "balance_allocate",
          documentDate: "2026-08-01",
          pages: [
            {
              assetId: "asset-insulation" as Id<"buildCollaborationAssets">,
              fileName: "insulation.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
          ],
          title: "Insulation invoice",
          vendorName: "Northline Supply Co.",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.change(screen.getByLabelText("Gross Document Total (CAD)"), {
      target: { value: "123.45" },
    });
    fireEvent.change(
      screen.getByLabelText("Cost allocation 1 Sub-milestone"),
      { target: { value: "submilestone-foundation" } }
    );
    fireEvent.change(screen.getByLabelText("Cost allocation 1 amount (CAD)"), {
      target: { value: "100.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add allocation" }));
    fireEvent.change(
      screen.getByLabelText("Cost allocation 2 Sub-milestone"),
      { target: { value: "submilestone-envelope" } }
    );
    fireEvent.change(screen.getByLabelText("Cost allocation 2 amount (CAD)"), {
      target: { value: "23.45" },
    });

    expect(screen.getByText("$0.00 remaining")).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to Share" })
    );

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        allocations: [
          {
            amountCents: 10_000,
            buildSubmilestoneId: "submilestone-foundation",
          },
          {
            amountCents: 2_345,
            buildSubmilestoneId: "submilestone-envelope",
          },
        ],
        draftId: "draft-1",
        grossTotalCents: 12_345,
      })
    );
    expect(setDraftStep).toHaveBeenCalledWith({
      draftId: "draft-1",
      expectedRevision: 3,
      step: "share",
    });
  });

  test("enables only the immediate predecessor workflow rail action", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "share",
          documentDate: "2026-08-01",
          pages: [
            {
              assetId: "asset-share" as Id<"buildCollaborationAssets">,
              fileName: "share.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
          ],
          title: "Rail-guarded source",
          vendorName: "Northline Supply Co.",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    expect(
      screen.getByTestId("step-capture_confirm").hasAttribute("disabled")
    ).toBe(true);
    expect(
      screen.getByTestId("step-balance_allocate").hasAttribute("disabled")
    ).toBe(false);
    expect(screen.getByTestId("step-share").hasAttribute("disabled")).toBe(
      true
    );
    expect(screen.getByTestId("step-freeze").hasAttribute("disabled")).toBe(
      true
    );

    fireEvent.click(screen.getByTestId("step-capture_confirm"));
    expect(setDraftStep).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("step-balance_allocate"));
    await waitFor(() =>
      expect(setDraftStep).toHaveBeenCalledWith({
        draftId: "draft-1",
        expectedRevision: 1,
        step: "balance_allocate",
      })
    );
  });

  test("reopens a completed document to Share and restores normal backward navigation without reopening siblings", async () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "freeze",
          completedAt: Date.now(),
          lifecycle: "complete",
          title: "Completed source",
        }),
        makeDraft({
          _id: "draft-sibling" as Id<"costDocumentDrafts">,
          lifecycle: "complete",
          order: 2,
          title: "Still complete",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.click(screen.getByTestId("draft-back"));

    await waitFor(() =>
      expect(setDraftStep).toHaveBeenCalledWith({
        complete: false,
        draftId: "draft-1",
        expectedRevision: 1,
        step: "share",
      })
    );
    expect(
      screen.getByTestId("cost-document-batch-editor").textContent
    ).toContain("Share this Draft");
    fireEvent.click(
      screen.getByRole("button", { name: "Back to Balance & allocate" })
    );
    await waitFor(() =>
      expect(setDraftStep).toHaveBeenLastCalledWith({
        draftId: "draft-1",
        expectedRevision: 2,
        step: "balance_allocate",
      })
    );
    expect(screen.getByTestId("draft-progress-draft-sibling").textContent).toContain(
      "Complete"
    );
  });

  test("gates one atomic batch submission on every document completing and prevents double submission", async () => {
    currentBatch = makeBatch({
      drafts: [makeDraft({ lifecycle: "draft", title: "Not ready" })],
    });
    renderWorkspace({ batchId: "batch-1" });
    expect(screen.getByTestId("batch-submit").hasAttribute("disabled")).toBe(
      true
    );

    cleanup();
    const pending = deferred<{
      batchId: string;
      costDocumentIds: string[];
      replayed: boolean;
    }>();
    submitBatch.mockReturnValue(pending.promise);
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "freeze",
          lifecycle: "complete",
          title: "Ready one",
        }),
        makeDraft({
          _id: "draft-2" as Id<"costDocumentDrafts">,
          activeStep: "freeze",
          lifecycle: "complete",
          order: 2,
          title: "Ready two",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    const submit = screen.getByTestId("batch-submit");
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(submitBatch).toHaveBeenCalledTimes(1));
    expect(submitBatch).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: "batch-1", idempotencyKey: expect.any(String) })
    );
    pending.resolve({
      batchId: "batch-1",
      costDocumentIds: ["cost-document-1", "cost-document-2"],
      replayed: false,
    });
  });

  test("keeps a failed atomic submit recoverable and exposes an actionable error", async () => {
    submitBatch.mockRejectedValueOnce(new Error("Connection interrupted."));
    currentBatch = makeBatch({
      drafts: [
        makeDraft({ activeStep: "freeze", lifecycle: "complete", title: "Ready" }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.click(screen.getByTestId("batch-submit"));

    expect(
      await screen.findByTestId("batch-submit-error")
    ).not.toBeNull();
    expect(screen.getByTestId("batch-submit-error").textContent).toContain(
      "Connection interrupted."
    );
    expect(screen.getByTestId("batch-submit").hasAttribute("disabled")).toBe(
      false
    );
    fireEvent.click(screen.getByTestId("batch-submit"));
    await waitFor(() => expect(submitBatch).toHaveBeenCalledTimes(2));
  });

  test("collects an audited reason before retrying a likely-duplicate submission", async () => {
    submitBatch
      .mockRejectedValueOnce(
        new Error(
          "This appears to be a likely duplicate. Record an override reason before submission."
        )
      )
      .mockResolvedValueOnce({
        batchId: "batch-1",
        costDocumentIds: ["cost-document-1"],
        replayed: false,
      });
    currentBatch = makeBatch({
      drafts: [
        makeDraft({ activeStep: "freeze", lifecycle: "complete", title: "Ready" }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    fireEvent.click(screen.getByTestId("batch-submit"));
    expect(await screen.findByTestId("duplicate-override-field")).not.toBeNull();
    expect(screen.getByTestId("batch-submit").hasAttribute("disabled")).toBe(
      true
    );
    fireEvent.change(
      screen.getByLabelText("Likely duplicate override reason"),
      { target: { value: "Separate supplier invoice for the same amount." } }
    );
    expect(screen.getByTestId("batch-submit").hasAttribute("disabled")).toBe(
      false
    );
    fireEvent.click(screen.getByTestId("batch-submit"));

    await waitFor(() => expect(submitBatch).toHaveBeenCalledTimes(2));
    expect(submitBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        batchId: "batch-1",
        duplicateOverrideReason:
          "Separate supplier invoice for the same amount.",
      })
    );
  });

  test("renders an accessible, mobile-first register before the active document editor", () => {
    currentBatch = makeBatch({
      drafts: [
        makeDraft({
          activeStep: "balance_allocate",
          category: "labour",
          grossTotalCents: 125_00,
          kind: "receipt",
          pages: [
            {
              assetId: "asset-accessible" as Id<"buildCollaborationAssets">,
              fileName: "accessible.pdf",
              mimeType: "application/pdf",
              order: 1,
            },
          ],
          title: "Accessible source",
        }),
      ],
    });
    renderWorkspace({ batchId: "batch-1" });

    const sheet = screen.getByTestId("cost-document-batch-sheet");
    const register = screen.getByTestId("cost-document-batch-register");
    const editor = screen.getByTestId("cost-document-batch-editor");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.className).toContain("max-sm:h-dvh");
    expect(register.compareDocumentPosition(editor)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(register.className).toContain("max-lg:sticky");
    const rail = screen.getByTestId("cost-document-batch-register-rail");
    expect(rail.className).toContain("overflow-x-auto");
    expect(screen.getByTestId("draft-draft-1").parentElement?.className).toContain(
      "shrink-0"
    );
    expect(screen.getByTestId("draft-draft-1").textContent).toContain(
      "KindReceipt"
    );
    expect(screen.getByTestId("draft-draft-1").textContent).toContain(
      "ClassificationLabour"
    );
    expect(screen.getByTestId("draft-draft-1").textContent).toContain(
      "Pages1 page"
    );
    expect(screen.getByTestId("draft-draft-1").textContent).toContain(
      "Amount$125.00"
    );
    expect(screen.getByTestId("draft-draft-1").textContent).toContain(
      "CompletionStep 2 of 4"
    );
    expect(screen.getByTestId("draft-segments-draft-1").children).toHaveLength(
      4
    );
    expect(
      screen.getByTestId("draft-segment-labels-draft-1").textContent
    ).toContain("Capture & confirm: complete");
    expect(
      screen.getByTestId("draft-segment-labels-draft-1").textContent
    ).toContain("Balance & allocate: current");
    expect(
      screen.getByRole("list", { name: "Document steps" })
    ).not.toBeNull();
    expect(
      screen.getByTestId("step-balance_allocate").getAttribute("aria-current")
    ).toBe("step");
    expect(screen.getByTestId("draft-draft-1").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });
});
