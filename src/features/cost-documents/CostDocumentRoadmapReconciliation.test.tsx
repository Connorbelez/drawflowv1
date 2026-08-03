// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mutationByRef = new Map<string, (...args: unknown[]) => unknown>();
const usePaginatedQuery = vi.fn();
const useQuery = vi.fn();
const useMutation = vi.fn();
const getAccessToken = vi.fn();

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAccessToken: () => ({ getAccessToken }),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    useMutation(reference) ?? mutationByRef.get(getFunctionName(reference)),
  usePaginatedQuery: (...args: unknown[]) => usePaginatedQuery(...args),
  useQuery: (reference: unknown, args: unknown) => useQuery(reference, args),
}));

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CostDocumentRoadmapReconciliation } from "./CostDocumentRoadmapReconciliation";

type Summary = {
  _id: Id<"costDocuments">;
  allocations: Array<{
    amountCents: number;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    order: number;
    submilestoneKey: string;
    submilestoneName: string;
  }>;
  category: "labour" | "materials";
  currency: "CAD";
  documentDate: string;
  duplicateWarning: boolean;
  grossTotalCents: number;
  integrity: { healthy: boolean; openExceptionKinds: string[] };
  kind: "invoice" | "receipt";
  lifecycle: { state: "current" | "superseded" | "voided" };
  reviewAttention:
    | "needs_correction"
    | "partially_reviewed"
    | "reviewed"
    | "unreviewed";
  state: "submitted";
  submittedAt: number;
  title: string;
  uploaderScope: "other" | "self";
  vendorName: string;
};

const materialsDocument: Summary = {
  _id: "cost-materials" as Id<"costDocuments">,
  allocations: [
    {
      amountCents: 86_320,
      buildSubmilestoneId: "sub-foundation-waterproofing" as Id<"buildSubmilestones">,
      order: 1,
      submilestoneKey: "waterproofing",
      submilestoneName: "Waterproofing",
    },
  ],
  category: "materials",
  currency: "CAD",
  documentDate: "2026-08-01",
  duplicateWarning: true,
  grossTotalCents: 86_320,
  integrity: { healthy: true, openExceptionKinds: [] },
  kind: "receipt",
  lifecycle: { state: "current" },
  reviewAttention: "needs_correction",
  state: "submitted",
  submittedAt: 1_754_000_000_000,
  title: "Waterproofing membrane receipt",
  uploaderScope: "self",
  vendorName: "Northline Building Supply",
};

const labourDocument: Summary = {
  _id: "cost-labour" as Id<"costDocuments">,
  allocations: [
    {
      amountCents: 124_500,
      buildSubmilestoneId: "sub-foundation-footings" as Id<"buildSubmilestones">,
      order: 1,
      submilestoneKey: "footings",
      submilestoneName: "Footings",
    },
  ],
  category: "labour",
  currency: "CAD",
  documentDate: "2026-08-02",
  duplicateWarning: false,
  grossTotalCents: 124_500,
  integrity: { healthy: true, openExceptionKinds: [] },
  kind: "invoice",
  lifecycle: { state: "current" },
  reviewAttention: "unreviewed",
  state: "submitted",
  submittedAt: 1_754_000_100_000,
  title: "Foundation formwork labour",
  uploaderScope: "other",
  vendorName: "Crown Forming",
};

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...materialsDocument,
    activity: [
      {
        actorWorkosUserId: "builder-owner",
        createdAt: 1_754_000_000_000,
        eventType: "cost_document.submitted",
      },
    ],
    capabilities: {
      canRecordBrokerageReview: false,
      canRecordBuilderReview: true,
      canStartCorrection: true,
      canVoid: true,
    },
    description: "Membrane, primer, and termination accessories.",
    duplicateWarning: {
      overridden: true,
      reason: "Separate delivery docket confirmed by the builder.",
    },
    financialComponents: [
      { amountCents: 76_389, kind: "subtotal", order: 1 },
      { amountCents: 9_931, kind: "tax", order: 2 },
    ],
    integrity: { healthy: true, openExceptions: [] },
    lifecycle: {
      state: "current",
      supersededAt: undefined,
      voidedAt: undefined,
      voidReason: undefined,
    },
    pages: [
      {
        assetId: "asset-waterproofing" as Id<"buildCollaborationAssets">,
        contentHashSha256: "a".repeat(64),
        fileName: "waterproofing.pdf",
        mimeType: "application/pdf",
        order: 1,
      },
    ],
    revision: { number: 1 },
    reviews: {
      builder: {
        actorWorkosUserId: "builder-owner",
        annotation: "Need the delivery docket.",
        createdAt: 1_754_000_000_000,
        outcome: "needs_correction",
        revision: 1,
      },
    },
    supportingContextDisclosure:
      "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.",
    uploaderScope: "self",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve! };
}

describe("CostDocumentRoadmapReconciliation", () => {
  const loadMore = vi.fn();
  const onCloseCostDocument = vi.fn();
  const onOpenCostDocument = vi.fn();
  const onStartCorrection = vi.fn();
  const setReview = vi.fn();
  const startCorrection = vi.fn();
  const voidCostDocument = vi.fn();
  let selectedDocument: ReturnType<typeof makeDetail> | null | undefined;

  const renderWorkspace = (input?: {
    selectedCostDocumentId?: string;
  }) =>
    render(
      <CostDocumentRoadmapReconciliation
        buildId={"build-1" as Id<"activeBuilds">}
        onCloseCostDocument={onCloseCostDocument}
        onOpenCostDocument={onOpenCostDocument}
        onStartCorrection={onStartCorrection}
        organizationId="org-1"
        selectedCostDocumentId={input?.selectedCostDocumentId}
        submilestones={[
          {
            id: "sub-foundation-footings" as Id<"buildSubmilestones">,
            label: "Foundation · Footings",
            milestoneKey: "foundation",
          },
          {
            id: "sub-foundation-waterproofing" as Id<"buildSubmilestones">,
            label: "Foundation · Waterproofing",
            milestoneKey: "foundation",
          },
        ]}
      />
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mutationByRef.clear();
    mutationByRef.set(
      getFunctionName(api.cost_documents.setCostDocumentReviewAnnotation),
      setReview
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.startCostDocumentCorrection),
      startCorrection
    );
    mutationByRef.set(
      getFunctionName(api.cost_documents.voidCostDocument),
      voidCostDocument
    );
    selectedDocument = undefined;
    vi.stubEnv("VITE_CONVEX_SITE_URL", "https://convex.example");
    getAccessToken.mockResolvedValue("access-token");
    usePaginatedQuery.mockReturnValue({
      loadMore,
      results: [materialsDocument, labourDocument],
      status: "Exhausted",
    });
    useQuery.mockImplementation((reference: unknown, args: unknown) => {
      if (
        getFunctionName(reference as Parameters<typeof getFunctionName>[0]) ===
        getFunctionName(api.cost_documents.getCostDocument)
      ) {
        return args === "skip" ? undefined : selectedDocument;
      }
      return undefined;
    });
    startCorrection.mockResolvedValue({
      batchId: "correction-batch",
      draftId: "correction-draft",
      replayed: false,
    });
    setReview.mockResolvedValue({ revision: 2 });
    voidCostDocument.mockResolvedValue({ voidedAt: 1_754_000_200_000 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private source page", {
          headers: { "Content-Type": "application/pdf" },
          status: 200,
        })
      )
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:private-page"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("organizes submitted records by Milestone with distinct Materials and Labour lanes and filter controls", () => {
    renderWorkspace();

    expect(screen.getByText("Roadmap reconciliation")).toBeTruthy();
    expect(screen.getByText("Materials submitted gross")).toBeTruthy();
    expect(screen.getByText("Labour submitted gross")).toBeTruthy();
    expect(screen.getByText("Foundation · Waterproofing")).toBeTruthy();
    expect(screen.getByText("Foundation · Footings")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open Waterproofing membrane receipt" })
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter by document kind"), {
      target: { value: "receipt" },
    });

    expect(screen.getByText("Waterproofing membrane receipt")).toBeTruthy();
    expect(screen.queryByText("Foundation formwork labour")).toBeNull();
  });

  test("opens route-owned progressive detail and retrieves private source pages with an access token", async () => {
    selectedDocument = makeDetail();
    const view = renderWorkspace();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Waterproofing membrane receipt" })
    );
    expect(onOpenCostDocument).toHaveBeenCalledWith("cost-materials");

    view.rerender(
      <CostDocumentRoadmapReconciliation
        buildId={"build-1" as Id<"activeBuilds">}
        onCloseCostDocument={onCloseCostDocument}
        onOpenCostDocument={onOpenCostDocument}
        onStartCorrection={onStartCorrection}
        organizationId="org-1"
        selectedCostDocumentId="cost-materials"
        submilestones={[
          {
            id: "sub-foundation-waterproofing" as Id<"buildSubmilestones">,
            label: "Foundation · Waterproofing",
            milestoneKey: "foundation",
          },
        ]}
      />
    );

    expect(screen.getByText("Document facts")).toBeTruthy();
    expect(screen.getByText("Financial reconciliation")).toBeTruthy();
    expect(screen.getByText("Recorded financial line items")).toBeTruthy();
    expect(screen.getByText("Exact allocations")).toBeTruthy();
    expect(screen.getByText("Record provenance")).toBeTruthy();
    expect(screen.getByText("Reviews")).toBeTruthy();
    expect(screen.getByText("Duplicate signals")).toBeTruthy();
    expect(screen.getByText("Revision and void history")).toBeTruthy();
    expect(screen.getByText("Audit activity")).toBeTruthy();
    expect(screen.getByText("Evidence Package references")).toBeTruthy();
    expect(screen.getByText("Source pages")).toBeTruthy();
    expect(
      screen.getAllByText(
        "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval."
      ).length
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Download page 1: waterproofing.pdf",
      })
    );

    await waitFor(() => expect(getAccessToken).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("costDocumentId=cost-materials"),
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
      })
    );
  });

  test("opens a preview context synchronously before private retrieval awaits", async () => {
    selectedDocument = makeDetail();
    const token = deferred<string>();
    getAccessToken.mockReturnValueOnce(token.promise);
    const preview = {
      close: vi.fn(),
      location: { replace: vi.fn() },
      opener: window,
    };
    const open = vi.spyOn(window, "open").mockReturnValue(preview as never);

    renderWorkspace({ selectedCostDocumentId: "cost-materials" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Preview page 1: waterproofing.pdf",
      })
    );

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(preview.opener).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    token.resolve("preview-access-token");
    await waitFor(() =>
      expect(preview.location.replace).toHaveBeenCalledWith(
        "blob:private-page"
      )
    );
    expect(preview.close).not.toHaveBeenCalled();
  });

  test("drains every authorized page before exposing totals or filter results", async () => {
    usePaginatedQuery.mockReturnValueOnce({
      loadMore,
      results: [materialsDocument],
      status: "CanLoadMore",
    });

    renderWorkspace();

    await waitFor(() => expect(loadMore).toHaveBeenCalledWith(5));
    expect(screen.queryByText("Materials submitted gross")).toBeNull();
    expect(
      screen.getByText(
        "Loading all authorized Cost Documents before applying totals, search, and filters…"
      )
    ).toBeTruthy();
    expect(
      screen.queryByText("No Cost Documents match these filters")
    ).toBeNull();
  });

  test("keeps private file integrity exceptions explicit and avoids rendering unsafe controls", () => {
    selectedDocument = makeDetail({
      integrity: {
        healthy: false,
        openExceptions: [
          {
            actionRequired: true,
            assetId: "asset-waterproofing",
            createdAt: 1_754_000_000_000,
            kind: "quarantined",
            pageId: "page-waterproofing",
          },
        ],
      },
    });

    renderWorkspace({ selectedCostDocumentId: "cost-materials" });

    expect(screen.getByText(/Quarantined source page/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Download page 1: waterproofing.pdf",
      })
    ).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Preview page 1: waterproofing.pdf",
      })
    ).toBeNull();
  });

  test("removes the detail immediately when the current Build role is revoked", () => {
    selectedDocument = null;

    renderWorkspace({ selectedCostDocumentId: "cost-materials" });

    expect(screen.getByText("Cost Document unavailable")).toBeTruthy();
    expect(
      screen.getByText(/Access is rechecked for every record and source page/i)
    ).toBeTruthy();
    expect(screen.queryByText("Record provenance")).toBeNull();
  });

  test("only exposes mutation controls granted by the current detail capabilities", () => {
    selectedDocument = makeDetail({
      capabilities: {
        canRecordBrokerageReview: false,
        canRecordBuilderReview: false,
        canStartCorrection: false,
        canVoid: false,
      },
    });
    const view = renderWorkspace({ selectedCostDocumentId: "cost-materials" });

    expect(
      screen.queryByRole("button", { name: "Record Builder review" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Start correction" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Void record" })).toBeNull();

    selectedDocument = makeDetail();
    view.rerender(
      <CostDocumentRoadmapReconciliation
        buildId={"build-1" as Id<"activeBuilds">}
        onCloseCostDocument={onCloseCostDocument}
        onOpenCostDocument={onOpenCostDocument}
        onStartCorrection={onStartCorrection}
        organizationId="org-1"
        selectedCostDocumentId="cost-materials"
        submilestones={[]}
      />
    );

    expect(
      screen.getByRole("button", { name: "Record Builder review" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start correction" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Void record" })).toBeTruthy();
  });

  test("renders explicit loading and query-error recovery states", () => {
    usePaginatedQuery.mockReturnValueOnce({
      loadMore,
      results: [],
      status: "LoadingFirstPage",
    });
    const view = renderWorkspace();
    expect(
      screen.getByText(
        "Loading all authorized Cost Documents before applying totals, search, and filters…"
      )
    ).toBeTruthy();

    cleanup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    usePaginatedQuery.mockImplementation(() => {
      throw new Error("subscription unavailable");
    });
    renderWorkspace();

    expect(screen.getByText("Roadmap reconciliation unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    consoleError.mockRestore();
    view.unmount();
  });
});
