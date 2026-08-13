// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  CanonicalSubmilestoneTabPanel,
  type CanonicalWorkspaceBootstrap,
} from "./SubmilestoneDetailCanonical.tsx";

const mutationState = vi.hoisted(() => ({
  calls: [] as unknown[],
  functions: [] as Array<ReturnType<typeof vi.fn>>,
  byReference: new Map<unknown, ReturnType<typeof vi.fn>>(),
  nextError: undefined as unknown,
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: (reference: unknown) => {
    mutationState.calls.push(reference);
    const existing = mutationState.byReference.get(reference);
    if (existing) {
      return existing;
    }
    const mutation = vi.fn().mockImplementation(async () => {
      if (mutationState.nextError) {
        throw mutationState.nextError;
      }
      return { revision: 4 };
    });
    mutationState.byReference.set(reference, mutation);
    mutationState.functions.push(mutation);
    return mutation;
  },
}));

vi.mock("../submilestone-scope/ProposalSubmilestoneScopeController.tsx", () => ({
  ProposalSubmilestoneScopeController: (
    props: Record<string, unknown> & {
      onDirtyChange?: (dirty: boolean) => void;
    },
  ) => (
    <>
      <output data-testid="canonical-scope-controller">
        {JSON.stringify(props)}
      </output>
      <button
        data-testid="canonical-scope-dirty"
        onClick={() => props.onDirtyChange?.(true)}
        type="button"
      />
    </>
  ),
}));

vi.mock(
  "../submilestone-guidance/ActiveBuildSubmilestoneGuidanceController.tsx",
  () => ({
    ActiveBuildSubmilestoneGuidanceController: (
      props: Record<string, unknown> & {
        onDirtyChange?: (dirty: boolean) => void;
      },
    ) => (
      <>
        <output data-testid="canonical-guidance-controller">
          {JSON.stringify(props)}
        </output>
        <button
          data-testid="canonical-guidance-dirty"
          onClick={() => props.onDirtyChange?.(true)}
          type="button"
        />
      </>
    ),
  }),
);

const buildId = "build-01" as Id<"activeBuilds">;
const buildSubmilestoneId = "submilestone-01" as Id<"buildSubmilestones">;

function makeBootstrap(
  overrides: Record<string, unknown> = {},
): CanonicalWorkspaceBootstrap {
  const canonicalCapabilities = {
    addAssignment: { allowed: false, reason: "Not permitted." },
    approveChild: { allowed: false, reason: "Not permitted." },
    complete: { allowed: false, reason: "Not permitted." },
    correctStart: { allowed: false, reason: "Not permitted." },
    readMaterials: { allowed: true },
    removeAssignment: { allowed: false, reason: "Not permitted." },
    reopen: { allowed: false, reason: "Not permitted." },
    retractChildApproval: { allowed: false, reason: "Not permitted." },
    retractStart: { allowed: false, reason: "Not permitted." },
    start: { allowed: false, reason: "Not permitted." },
    submitCompletion: { allowed: false, reason: "Not permitted." },
    updateEvidence: { allowed: false, reason: "Not permitted." },
    updateExecution: { allowed: false, reason: "Not permitted." },
    updateMaterials: { allowed: false, reason: "Not permitted." },
    uploadEvidence: { allowed: false, reason: "Not permitted." },
    waiveSiteVisit: { allowed: false, reason: "Not permitted." },
  };
  return {
    build: {
      buildName: "Maple House",
      startDate: "2026-06-01",
    },
    capabilities: {
      canonical: canonicalCapabilities,
    },
    collaboration: {
      message: "Collaboration is degraded.",
      state: "degraded",
    },
    evidence: {
      assets: [],
      packageState: "draft",
      requirementCount: 0,
      requirements: [],
    },
    milestone: { key: "foundation", name: "Foundation" },
    materials: { items: [] },
    overview: {
      actualCostCents: 12_500,
      actualStartedAt: Date.parse("2026-06-02T09:00:00Z"),
      budgetCents: 100_000,
      description: "Pour the footings.",
      executionOwnership: {
        contractorName: "Northstar Concrete",
        reason: "Assigned to Northstar Concrete",
        state: "assigned",
      },
      fieldNote: "Keep the trench dry.",
      forecastDate: "2026-06-10",
      plannedDurationDays: 4,
      plannedStartDay: 2,
      progressPercent: 40,
      status: "in_progress",
    },
    ownership: { reason: "Assigned to Northstar Concrete", state: "assigned" },
    people: {
      assigned: {
        contractorId: "contractor-01",
        displayName: "Northstar Concrete",
        role: "Concrete contractor",
        status: "active",
      },
      participantCount: 1,
    },
    revisions: { canonicalWorkflowRevision: 3 },
    schedule: { durationDays: 4, startDay: 2 },
    state: "visible",
    submilestone: {
      key: "footings",
      name: "Footing forms",
      status: "in_progress",
    },
    ...overrides,
  };
}

function panelProps(
  bootstrap: CanonicalWorkspaceBootstrap,
  tab: "evidence" | "materials" | "overview" | "people" = "overview",
) {
  return {
    bootstrap,
    buildId,
    buildSubmilestoneId,
    organizationId: "org-01",
    readOnly: false,
    tab,
  } as const;
}

beforeEach(() => {
  mutationState.calls.length = 0;
  mutationState.functions.length = 0;
  mutationState.byReference.clear();
  mutationState.nextError = undefined;
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CanonicalSubmilestoneTabPanel", () => {
  test("mounts canonical Scope and Guidance from the Proposal lineage", () => {
    const bootstrap = makeBootstrap({
      proposalSubmilestoneId: "proposal-submilestone-1",
      overview: {
        ...(makeBootstrap().overview as Record<string, unknown>),
        description: "Legacy roadmap description must not render.",
        scopeOfWorkTiptapJson: "legacy-scope-json",
      },
      submilestone: {
        ...(makeBootstrap().submilestone as Record<string, unknown>),
        proposalSubmilestoneId: "proposal-submilestone-1",
        scopeOfWorkTiptapJson: "legacy-submilestone-scope-json",
      },
    });

    render(<CanonicalSubmilestoneTabPanel {...panelProps(bootstrap)} />);

    expect(screen.getByTestId("canonical-scope-controller")).toBeTruthy();
    expect(screen.getByTestId("canonical-guidance-controller")).toBeTruthy();
    expect(screen.queryByText("Approved roadmap scope")).toBeNull();
    expect(screen.getByText("Keep the trench dry.")).toBeTruthy();
  });

  test("routes Scope and Guidance dirty state to the active-Build host", () => {
    const onDirtyChange = vi.fn();
    const bootstrap = makeBootstrap({
      proposalSubmilestoneId: "proposal-submilestone-1",
    });

    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap)}
        onDirtyChange={onDirtyChange}
      />,
    );

    fireEvent.click(screen.getByTestId("canonical-scope-dirty"));
    fireEvent.click(screen.getByTestId("canonical-guidance-dirty"));

    expect(onDirtyChange.mock.calls).toEqual([
      ["scope", true],
      ["guidance", true],
    ]);
  });

  test("applies capability/read-only gating without exposing Draw controls", () => {
    const bootstrap = makeBootstrap({
      overview: {
        ...makeBootstrap().overview,
        actualStartedAt: undefined,
        status: "planned",
      },
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          complete: { allowed: true },
          start: { allowed: true },
          updateExecution: { allowed: true },
        },
      },
    });
    const view = render(<CanonicalSubmilestoneTabPanel {...panelProps(bootstrap)} />);

    expect(screen.getByRole("button", { name: "Start work" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /draw|release/i })).toBeNull();
    expect(screen.getByText(/Draw release and lender review actions/)).toBeTruthy();

    view.rerender(
      <CanonicalSubmilestoneTabPanel {...panelProps(bootstrap)} readOnly />,
    );
    expect(screen.queryByRole("button", { name: "Start work" })).toBeNull();
    expect(screen.getByText("Read-only")).toBeTruthy();
  });

  test("keeps completion catch-up in one revisioned start/complete flow", async () => {
    const bootstrap = makeBootstrap({
      overview: {
        ...makeBootstrap().overview,
        actualStartedAt: undefined,
        status: "planned",
      },
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          complete: { allowed: true },
          start: { allowed: true },
          updateExecution: { allowed: true },
        },
      },
    });
    render(<CanonicalSubmilestoneTabPanel {...panelProps(bootstrap)} />);

    fireEvent.click(screen.getByRole("button", { name: "Complete work" }));
    expect(screen.getByText("Completion confirmation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Record start" }));

    await waitFor(() => {
      expect(
        mutationState.functions.some((fn) =>
          fn.mock.calls.some(([input]) =>
            input &&
            typeof input === "object" &&
            "expectedRevision" in input &&
            (input as { expectedRevision?: unknown }).expectedRevision === 3,
          ),
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        mutationState.functions.some((fn) =>
          fn.mock.calls.some(([input]) =>
            input &&
            typeof input === "object" &&
            (input as { expectedRevision?: unknown; status?: unknown }).expectedRevision === 4 &&
            (input as { expectedRevision?: unknown; status?: unknown }).status === "complete",
          ),
        ),
      ).toBe(true);
    });
  });

  test("retains a stale progress draft and refreshes before retrying", async () => {
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          updateExecution: { allowed: true },
        },
      },
    });
    const onRetry = vi.fn();
    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap)}
        onRetry={onRetry}
      />,
    );
    mutationState.nextError = new Error(
      JSON.stringify({
        code: "STALE_WORKFLOW_REVISION",
        message: "stale workflow revision conflict",
      }),
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "Progress percent" }), {
      target: { value: "55" },
    });
    expect(
      (screen.getByRole("spinbutton", {
        name: "Actual cost in CAD",
      }) as HTMLInputElement).value,
    ).toBe("125.00");
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Actual cost in CAD" }),
      { target: { value: "123.45" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/stale workflow revision/i),
    );
    expect(
      (screen.getByRole("spinbutton", { name: "Progress percent" }) as HTMLInputElement)
        .value,
    ).toBe("55");
    expect(
      mutationState.functions.some((fn) =>
        fn.mock.calls.some(
          ([input]) =>
            input &&
            typeof input === "object" &&
            (input as { actualCostCents?: unknown }).actualCostCents === 12_345,
        ),
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(mutationState.functions.some((fn) => fn.mock.calls.length >= 2)).toBe(
      false,
    );
  });

  test("clears optional canonical execution fields explicitly", async () => {
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          updateExecution: { allowed: true },
        },
      },
    });
    render(<CanonicalSubmilestoneTabPanel {...panelProps(bootstrap)} />);

    fireEvent.change(screen.getByLabelText("Actual cost in CAD"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Completion forecast"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Field note"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));

    await waitFor(() => {
      const clearCall = mutationState.functions
        .flatMap((mutation) => mutation.mock.calls)
        .map(([input]) => input)
        .find(
          (input): input is Record<string, unknown> =>
            Boolean(input) &&
            typeof input === "object" &&
            (input as Record<string, unknown>).actualCostCents === null,
        );
      expect(clearCall).toMatchObject({
        actualCostCents: null,
        completionForecastDate: null,
        expectedRevision: 3,
        fieldNote: null,
      });
    });
  });

  test("reuses the canonical command key after an ambiguous progress failure", async () => {
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          updateExecution: { allowed: true },
        },
      },
    });
    mutationState.nextError = new Error("The response was interrupted.");
    render(<CanonicalSubmilestoneTabPanel {...panelProps(bootstrap)} />);
    fireEvent.click(screen.getByRole("button", { name: "Save update" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const progressMutation = mutationState.functions.find(
      (mutation) => mutation.mock.calls.length === 1,
    );
    const firstKey = (
      progressMutation?.mock.calls[0]?.[0] as { idempotencyKey?: string }
    ).idempotencyKey;
    expect(firstKey).toMatch(/^submilestone-progress-/);

    mutationState.nextError = undefined;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(progressMutation?.mock.calls.length).toBe(2));
    expect(
      (progressMutation?.mock.calls[1]?.[0] as { idempotencyKey?: string })
        .idempotencyKey,
    ).toBe(firstKey);
  });

  test("retains upload drafts when the governed upload fails", async () => {
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          uploadEvidence: { allowed: true },
        },
      },
      evidence: {
        ...makeBootstrap().evidence,
        requirementCount: 1,
        requirements: [
          {
            kind: "photo",
            label: "Progress photo",
            requirementKey: "progress-photo",
          },
        ],
      },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({ ok: false } as Response);
    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "evidence")}
        collection={{
          hasMore: false,
          page: [],
          partial: false,
          state: "visible",
        }}
      />,
    );
    mutationState.functions[0]?.mockResolvedValue("https://upload.test");
    const file = new File(["photo"], "footing.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("canonical-evidence-input"), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Upload to Evidence Package" }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Draft file retained: footing.jpg/)).toBeTruthy(),
    );
    expect(screen.getByRole("alert").textContent).toMatch(/upload failed/i);
  });

  test("blocks upload when malformed requirements have no canonical key", () => {
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          uploadEvidence: { allowed: true },
        },
      },
      evidence: {
        ...makeBootstrap().evidence,
        requirementCount: 1,
        requirements: [{ kind: "photo", label: "Progress photo" }],
      },
    });
    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "evidence")}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
      />,
    );

    expect(screen.queryByTestId("canonical-evidence-input")).toBeNull();
    expect(screen.getByText(/No keyed evidence requirement is available/)).toBeTruthy();
  });

  test("requires a selected requirement and reuses one blob for mutation retry", async () => {
    const bootstrap = makeBootstrap({
      evidence: {
        ...makeBootstrap().evidence,
        requirementCount: 2,
        requirements: [
          {
            kind: "photo",
            label: "Progress photo",
            requirementKey: "progress-photo",
          },
          {
            kind: "document",
            label: "Inspection report",
            requirementKey: "inspection-report",
          },
        ],
      },
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          uploadEvidence: { allowed: true },
        },
      },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      json: async () => ({ storageId: "storage-01" }),
      ok: true,
    } as Response);
    const view = render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "evidence")}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Evidence requirement" }), {
      target: { value: "inspection-report" },
    });
    const generateUploadMutation = mutationState.functions.at(-3);
    const addEvidenceMutation = mutationState.functions.at(-2);
    generateUploadMutation?.mockResolvedValue("https://upload.test");
    addEvidenceMutation?.mockRejectedValueOnce(
      new Error("evidence package write failed"),
    );
    const file = new File(["photo"], "inspection.jpg", { type: "image/jpeg" });
    expect(
      (screen.getByTestId("canonical-evidence-input") as HTMLInputElement)
        .disabled,
    ).toBe(false);
    fireEvent.change(screen.getByTestId("canonical-evidence-input"), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Upload to Evidence Package" }),
    );

    await waitFor(() =>
      expect(screen.getByText(/Draft file retained: inspection.jpg/)).toBeTruthy(),
    );
    const addCalls = addEvidenceMutation?.mock.calls ?? [];
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0]?.[0]).toMatchObject({
      evidence: {
        requirementKey: "inspection-report",
        storageId: "storage-01",
      },
    });
    const firstIdempotencyKey = (addCalls[0]?.[0] as { idempotencyKey: string })
      .idempotencyKey;

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(addEvidenceMutation?.mock.calls.length).toBe(2),
    );
    expect(
      (addEvidenceMutation?.mock.calls[1]?.[0] as { idempotencyKey: string })
        .idempotencyKey,
    ).toBe(firstIdempotencyKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  test("shows the registry empty state and uploads on behalf of the Builder", async () => {
    const base = makeBootstrap();
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...base.capabilities.canonical,
          uploadEvidence: { allowed: true },
        },
      },
      overview: {
        ...(base.overview as Record<string, unknown>),
        actualStartedAt: undefined,
        status: "planned",
      },
      submilestone: {
        ...(base.submilestone as Record<string, unknown>),
        status: "planned",
      },
    });
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ storageId: "storage-backoffice-01" }),
      ok: true,
    } as Response);
    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "evidence")}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
        viewerCapacity="admin"
      />,
    );
    const generateUploadMutation = mutationState.functions.at(-3);
    const addEvidenceMutation = mutationState.functions.at(-2);
    generateUploadMutation?.mockResolvedValue("https://upload.test");

    expect(screen.getByText("No Builder evidence yet")).toBeTruthy();
    expect(screen.getByText("Upload evidence for the Builder")).toBeTruthy();
    const file = new File(["invoice"], "builder-invoice.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByTestId("canonical-evidence-input"), {
      target: { files: [file] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Upload to Evidence Package" }),
    );

    await waitFor(() => expect(addEvidenceMutation).toHaveBeenCalledTimes(1));
    expect(addEvidenceMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        evidence: expect.objectContaining({
          fileName: "builder-invoice.pdf",
          storageId: "storage-backoffice-01",
        }),
        uploadedOnBehalfOfBuilder: true,
      }),
    );
  });

  test("does not show mutation controls for superseded history", () => {
    const bootstrap = makeBootstrap({
      state: "superseded",
      submilestone: { key: "footings", name: "Footing forms", status: "complete" },
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          complete: { allowed: true },
          start: { allowed: true },
          updateExecution: { allowed: true },
        },
      },
    });
    render(<CanonicalSubmilestoneTabPanel {...panelProps(bootstrap)} />);
    expect(screen.queryByRole("button", { name: "Start work" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Complete work" })).toBeNull();
    expect(screen.getByText("Superseded · read-only")).toBeTruthy();
  });

  test("keeps active-build material budget semantics and full edit fields", async () => {
    const onRetry = vi.fn();
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          readMaterials: { allowed: true },
          updateMaterials: { allowed: true },
        },
      },
      materials: {
        items: [
          {
            _id: "cost-01",
            budgetSubmilestoneKey: "footings",
            budgetTreatment: "maintain",
            costCents: 12_500,
            itemType: "equipment",
            milestoneKey: "foundation",
            quantity: 2,
            relevantSubmilestoneKeys: ["footings", "forms"],
            supplier: "Old Supplier",
            title: "Concrete pump",
          },
        ],
      },
    });
    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "materials")}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Cost per unit (CAD)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Supplier"), {
      target: { value: "New Supplier" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() =>
      expect(mutationState.functions[1]?.mock.calls.length).toBe(1),
    );
    expect(mutationState.functions[1]?.mock.calls[0]?.[0]).toMatchObject({
      budgetSubmilestoneKey: "footings",
      budgetTreatment: "maintain",
      expectedRevision: 3,
      idempotencyKey: expect.any(String),
      itemId: "cost-01",
      quantity: 3,
      relevantSubmilestoneKeys: ["footings", "forms"],
      submilestoneKey: "footings",
      supplier: "New Supplier",
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Add cost item/ }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "New generator" },
    });
    fireEvent.change(screen.getByLabelText(/Cost per unit/), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() =>
      expect(mutationState.functions[0]?.mock.calls.length).toBe(1),
    );
    const createPayload = mutationState.functions[0]?.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(createPayload).not.toHaveProperty("budgetSubmilestoneKey");
    expect(createPayload).not.toHaveProperty("budgetTreatment");
    expect(createPayload).toMatchObject({
      expectedRevision: 3,
      idempotencyKey: expect.any(String),
      itemType: "material",
      quantity: 1,
      relevantSubmilestoneKeys: ["footings"],
      submilestoneKey: "footings",
      title: "New generator",
    });
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  test("keeps malformed Material compatibility rows off canonical mutations", async () => {
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          readMaterials: { allowed: true },
          updateMaterials: { allowed: true },
        },
      },
      materials: {
        items: [
          {
            costCents: 500,
            itemType: "material",
            milestoneKey: "foundation",
            quantity: 1,
            relevantSubmilestoneKeys: ["footings"],
            title: "Legacy gravel",
          },
        ],
      },
    });
    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "materials")}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save item" }));

    expect(
      await screen.findByText(/Material record has no canonical identity/),
    ).toBeTruthy();
    expect(mutationState.functions[1]?.mock.calls.length).toBe(0);
  });

  test("renders projected redacted participants and attaches existing candidates", async () => {
    const onRetry = vi.fn();
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          addAssignment: { allowed: true },
          removeAssignment: { allowed: true },
        },
      },
      people: {
        assigned: 0,
        availableContractors: [
          {
            _id: "contractor-candidate-01",
            name: "Northstar Electric",
            onboardingStatus: "profile_only",
            trades: ["Electrician"],
          },
        ],
        participantCount: 2,
        participants: [
          {
            displayName: "Builder Operator",
            role: "builder",
            source: "derived",
            participationPeriod: 1,
            redacted: false,
            workosUserId: "user-builder",
          },
          {
            displayName: "Participant redacted",
            participationPeriod: 1,
            redacted: true,
            role: "homeowner",
            source: "grant",
          },
        ],
        participantsPartial: true,
      },
    });
    render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "people")}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("submilestone-build-participants")).toBeTruthy();
    expect(
      screen.getByText("Showing the first page of authorized build participants."),
    ).toBeTruthy();
    expect(screen.getByText("Builder Operator")).toBeTruthy();
    expect(screen.getByText("Participant redacted")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add assignment" }));
    expect(screen.getByText("Northstar Electric")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Northstar Electric/ }));
    fireEvent.change(screen.getByLabelText("Role on this build"), {
      target: { value: "Electrician" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach contractor" }));
    await waitFor(() => {
      const assignmentCall = mutationState.functions
        .flatMap((mutation) => mutation.mock.calls)
        .map(([input]) => input)
        .find(
          (input): input is Record<string, unknown> =>
            Boolean(input) &&
            typeof input === "object" &&
            (input as Record<string, unknown>).contractorId ===
              "contractor-candidate-01",
        );
      expect(assignmentCall).toMatchObject({
        contractorId: "contractor-candidate-01",
        expectedRevisions: { footings: 3 },
        idempotencyKey: expect.any(String),
        role: "Electrician",
        submilestoneKeys: ["footings"],
      });
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  test("revision-gates and governs Work Allocation removal", async () => {
    const onRetry = vi.fn();
    const bootstrap = makeBootstrap({
      capabilities: {
        canonical: {
          ...makeBootstrap().capabilities.canonical,
          addAssignment: { allowed: true },
          removeAssignment: { allowed: true },
        },
      },
    });
    const view = render(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(bootstrap, "people")}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove assignment" }));
    fireEvent.change(screen.getByLabelText("Removal reason"), {
      target: { value: "Scope reassigned by the Builder." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove assignment" }));

    await waitFor(() => {
      const removalCall = mutationState.functions
        .flatMap((mutation) => mutation.mock.calls)
        .map(([input]) => input)
        .find(
          (input): input is Record<string, unknown> =>
            Boolean(input) &&
            typeof input === "object" &&
            (input as Record<string, unknown>).reason ===
              "Scope reassigned by the Builder.",
        );
      expect(removalCall).toMatchObject({
        contractorId: "contractor-01",
        expectedRevision: 3,
        idempotencyKey: expect.any(String),
        submilestoneKey: "footings",
      });
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    mutationState.nextError = new Error(
      JSON.stringify({
        code: "STALE_SUBMILESTONE_REVISION",
        message: "refresh required",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove assignment" }));
    fireEvent.change(screen.getByLabelText("Removal reason"), {
      target: { value: "Retry after a concurrent allocation update." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove assignment" }));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert").textContent).toContain(
      "STALE_SUBMILESTONE_REVISION",
    );
    mutationState.nextError = undefined;

    view.rerender(
      <CanonicalSubmilestoneTabPanel
        {...panelProps(
          makeBootstrap({
            capabilities: bootstrap.capabilities,
            revisions: {},
          }),
          "people",
        )}
        collection={{ hasMore: false, page: [], partial: false, state: "visible" }}
        onRetry={onRetry}
      />,
    );
    expect(
      screen.getByText(/Refresh this Sub-milestone before changing its Work Allocation/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add assignment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove assignment" })).toBeNull();
  });
});
