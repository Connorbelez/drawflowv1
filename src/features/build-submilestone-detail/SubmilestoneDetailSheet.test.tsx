// @vitest-environment jsdom

import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ComponentProps } from "react";
import { useState } from "react";

const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn().mockResolvedValue({}),
  useQuery: (reference: unknown, args: unknown) => useQuery(reference, args),
}));

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  BUILD_SUBMILESTONE_DETAIL_TABS,
  type BuildSubmilestoneDetailTab,
} from "../build-detail-targets/buildDetailTab.ts";
import { SubmilestoneDetailSheet } from "./SubmilestoneDetailSheet.tsx";

const buildId = "build-01" as Id<"activeBuilds">;
const submilestoneId = "submilestone-01" as Id<"buildSubmilestones">;
const companionActionItemId = "action-item-01" as Id<"buildActionItems">;
const organizationId = "org-01";

const bootstrapRef =
  api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceBootstrap;
const collectionRef =
  api.build_submilestone_workspace.getBuildSubmilestoneWorkspaceCollection;

function makeBootstrap(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    build: {
      buildId,
      buildName: "Maple House",
      location: "Toronto, ON",
      status: "active",
    },
    companion: {
      actionItemId: companionActionItemId,
      currentRevision: 4,
      originatingPostId: "post-01",
    },
    collaboration: { state: "available" },
    evidence: {
      evidenceReviewState: "not_ready",
      itemCount: 0,
      partial: false,
      requirementCount: 2,
    },
    execution: {
      actualCostCents: 12_500,
      progressPercent: 40,
    },
    milestone: {
      buildMilestoneId: "milestone-01",
      key: "foundation",
      name: "Foundation",
      planningState: "active",
      status: "in_progress",
    },
    ownership: {
      reason: "Assigned to Northstar Concrete",
      state: "assigned",
    },
    parentReadiness: {
      approvedChildCount: 0,
      childCount: 2,
      partial: false,
      readyForApproval: false,
    },
    persona: "builder",
    review: {
      evidenceReviewState: "not_ready",
      reviewDecisionState: "in_review",
      reviewRound: 1,
    },
    revisions: {
      canonicalWorkflowRevision: 3,
      companionRevision: 4,
      parentReviewRevision: 2,
      reviewRevision: 1,
    },
    schedule: {
      durationDays: 4,
      parentDayEnd: 10,
      parentDayStart: 1,
      startDay: 2,
    },
    state: "visible",
    submilestone: {
      buildSubmilestoneId: submilestoneId,
      key: "footings",
      name: "Footing forms",
      planningState: "active",
      scopeOfWorkTiptapJson: JSON.stringify({ type: "doc" }),
      status: "in_progress",
    },
    ...overrides,
  };
}

function makeCollection(
  collection: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    canonicalWorkflowRevision: 3,
    collection,
    companionActionItemId,
    companionRevision: 4,
    hasMore: false,
    page: [],
    partial: false,
    state: "visible",
    ...overrides,
  };
}

let bootstrap: unknown;
let collectionByName: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  bootstrap = makeBootstrap();
  collectionByName = {
    collaboration_comments: makeCollection("collaboration_comments"),
    evidence_requirements: makeCollection("evidence_requirements", {
      page: [
        {
          id: "requirement-01",
          kind: "photo",
          required: true,
          requirementKey: "forms-photo",
          title: "Forms photo",
        },
        {
          id: "requirement-02",
          kind: "document",
          required: true,
          requirementKey: "forms-document",
          title: "Forms document",
        },
      ],
    }),
    evidence_assets: makeCollection("evidence_assets"),
    materials: makeCollection("materials"),
    people_assignments: makeCollection("people_assignments"),
    review_decisions: makeCollection("review_decisions"),
  };
  useQuery.mockImplementation((reference: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (typeof args === "object" && args !== null && "collection" in args) {
      return collectionByName[(args as { collection: string }).collection];
    }
    return bootstrap;
  });
});

afterEach(cleanup);

function renderSheet(
  props: Partial<ComponentProps<typeof SubmilestoneDetailSheet>> = {},
) {
  return render(
    <SubmilestoneDetailSheet
      buildId={buildId}
      buildSubmilestoneId={submilestoneId}
      companionActionItemId={companionActionItemId}
      onOpenChange={vi.fn()}
      open
      organizationId={organizationId}
      {...props}
    />,
  );
}

describe("SubmilestoneDetailSheet", () => {
  test("keeps the exact six tabs in the shared order", () => {
    renderSheet();

    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.trim().toLowerCase()),
    ).toEqual([
      "overview",
      "evidence",
      "people",
      "materials",
      "collaboration",
      "review",
    ]);
    expect(BUILD_SUBMILESTONE_DETAIL_TABS).toHaveLength(6);
  });

  test.each([
    "admin",
    "broker",
    "broker-staff",
    "builder",
    "builder-staff",
    "contractor",
    "homeowner",
    "principle-broker",
  ] as const)("uses the same shell for the %s persona", (persona) => {
    bootstrap = makeBootstrap({ persona });
    renderSheet({ viewerCapacity: persona });

    expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Review" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Footing forms" })).toBeTruthy();
  });

  test("defaults lender/admin to Review only when review is active", () => {
    bootstrap = makeBootstrap({
      persona: "admin",
      review: {
        evidenceReviewState: "not_ready",
        reviewDecisionState: "in_review",
        reviewRound: 1,
      },
    });
    renderSheet({ viewerCapacity: "admin" });

    expect(
      screen.getByRole("tab", { name: "Review" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      useQuery.mock.calls.some(
        ([, args]) =>
          typeof args === "object" &&
          args !== null &&
          "collection" in args &&
          args.collection === "review_decisions",
      ),
    ).toBe(true);
  });

  test("keeps Overview as the default for non-lender personas", () => {
    bootstrap = makeBootstrap({ persona: "builder" });
    renderSheet({ viewerCapacity: "builder" });

    expect(
      screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("does not infer an active lender review from the bootstrap fallback", () => {
    bootstrap = makeBootstrap({
      persona: "admin",
      review: {
        evidenceReviewState: "not_ready",
        reviewDecisionState: "in_review",
        reviewRound: 0,
      },
    });
    renderSheet({ viewerCapacity: "admin" });

    expect(
      screen.getByRole("tab", { name: "Overview" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
  });

  test("explicit valid selection wins over the persona default", () => {
    bootstrap = makeBootstrap({ persona: "admin" });
    renderSheet({ selectedTab: "materials" });

    expect(
      screen.getByRole("tab", { name: "Materials" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("submilestone-materials-collection")).toBeTruthy();
  });

  test("keeps canonical tabs readable when the companion is degraded", () => {
    bootstrap = makeBootstrap({
      collaboration: {
        code: "COMPANION_MISSING",
        message: "Collaboration is unavailable.",
        state: "degraded",
      },
      companion: undefined,
    });
    renderSheet({ selectedTab: "materials" });

    expect(screen.getByTestId("submilestone-materials-collection")).toBeTruthy();
    const materialQuery = [...useQuery.mock.calls]
      .map(([, args]) => args)
      .find(
        (args) =>
          typeof args === "object" &&
          args !== null &&
          "collection" in args &&
          args.collection === "materials",
      );
    expect(materialQuery).toMatchObject({ companionActionItemId: undefined });
  });

  test("shows loading, revoked, integrity, and superseded states", () => {
    bootstrap = undefined;
    const loading = renderSheet();
    expect(screen.getByTestId("submilestone-detail-loading")).toBeTruthy();
    loading.unmount();

    bootstrap = { state: "revoked" };
    const revoked = renderSheet();
    expect(screen.getByTestId("submilestone-detail-revoked")).toBeTruthy();
    revoked.unmount();

    bootstrap = {
      code: "COMPANION_MISSING",
      message: "The collaboration companion is unavailable.",
      state: "integrity_error",
    };
    const integrity = renderSheet({ onRetry: vi.fn() });
    expect(screen.getByTestId("submilestone-detail-integrity-error")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry Sub-milestone workspace/ })).toBeTruthy();
    integrity.unmount();

    bootstrap = makeBootstrap({
      state: "superseded",
      submilestone: {
        ...makeBootstrap().submilestone,
        planningState: "superseded",
        status: "complete",
      },
    });
    renderSheet({ readOnly: false });
    expect(
      screen.getByTestId("submilestone-detail-superseded").textContent,
    ).toMatch(/Superseded.*read-only/i);
  });

  test("keeps the desktop inset and narrow full-screen responsive contract", () => {
    renderSheet();
    const popup = document.querySelector('[data-slot="sheet-popup"]');
    expect(popup?.className).toContain("max-sm:h-svh");
    expect(popup?.className).toContain("max-sm:w-full");
    expect(popup?.className).toContain("min-w-0");
    expect(popup?.className).toContain("overflow-x-hidden");
    expect(popup?.className).toContain("motion-reduce:transition-none");
    expect(popup?.className).toContain("sm:w-[min(52rem,calc(100vw-2rem))]");
    expect(popup?.className).toContain("sm:max-w-[52rem]");
  });

  test("groups overview metrics in a description list", () => {
    renderSheet();
    const progressTerm = screen.getByText("Progress");
    expect(progressTerm.tagName).toBe("DT");
    const metrics = progressTerm.closest("dl");
    expect(metrics).toBeTruthy();
    expect(metrics?.querySelector("dd")?.tagName).toBe("DD");
  });

  test("uses a modal dialog with focus return and keyboard navigation semantics", async () => {
    const onOpenChange = vi.fn();
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const triggerRef = { current: trigger };
    function ControlledSheet() {
      const [open, setOpen] = useState(true);
      return (
        <SubmilestoneDetailSheet
          buildId={buildId}
          buildSubmilestoneId={submilestoneId}
          canGoBack
          canGoForward
          companionActionItemId={companionActionItemId}
          finalFocus={triggerRef}
          initialFocus={false}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onOpenChange={(nextOpen) => {
            onOpenChange(nextOpen);
            setOpen(nextOpen);
          }}
          open={open}
          organizationId={organizationId}
        />
      );
    }
    render(<ControlledSheet />);

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog"), {
      altKey: true,
      key: "ArrowLeft",
    });
    fireEvent.keyDown(screen.getByRole("dialog"), {
      altKey: true,
      key: "ArrowRight",
    });
    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(onGoForward).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog"), {
      altKey: true,
      ctrlKey: true,
      key: "ArrowLeft",
    });
    expect(onGoBack).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close Sub-milestone detail" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    trigger.remove();
  });

  test("contains disabled history shortcuts without claiming modified chords", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog");
    const disabledHistory = createEvent.keyDown(dialog, {
      altKey: true,
      key: "ArrowLeft",
    });
    fireEvent(dialog, disabledHistory);
    expect(disabledHistory.defaultPrevented).toBe(true);

    const modifiedChord = createEvent.keyDown(dialog, {
      altKey: true,
      key: "ArrowLeft",
      metaKey: true,
    });
    fireEvent(dialog, modifiedChord);
    expect(modifiedChord.defaultPrevented).toBe(false);
  });

  test("queries only the selected collection and presents bounded page metadata", async () => {
    const onSelectedTabChange = vi.fn();
    collectionByName.evidence_assets = makeCollection("evidence_assets", {
      hasMore: true,
      nextCursor: "cursor-2",
      page: [
        {
          id: "asset-01",
          kind: "photo",
          locationVerified: false,
          title: "Footing photo",
        },
      ],
      partial: true,
    });
    const defaultQueryImplementation = useQuery.getMockImplementation();
    useQuery.mockImplementation((reference: unknown, args: unknown) => {
      if (
        typeof args === "object" &&
        args !== null &&
        "cursor" in args &&
        args.cursor === "cursor-2"
      ) {
        return makeCollection("evidence_assets", {
          page: [
            {
              id: "asset-02",
              kind: "document",
              title: "Engineer letter",
            },
          ],
        });
      }
      return defaultQueryImplementation?.(reference, args);
    });
    const view = renderSheet({ onSelectedTabChange });

    const initialCollectionCalls = useQuery.mock.calls.filter(
      ([, args]) => args === "skip",
    );
    expect(initialCollectionCalls.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    await waitFor(() =>
      expect(screen.getByTestId("submilestone-evidence-collection")).toBeTruthy(),
    );
    expect(onSelectedTabChange).toHaveBeenCalledWith("evidence");
    expect(screen.getByText("More records are available.")).toBeTruthy();
    expect(screen.getByText("Location unverified")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Load more Evidence" }),
    );
    await waitFor(() => expect(screen.getByText("Engineer letter")).toBeTruthy());
    expect(screen.getByText("Footing photo")).toBeTruthy();
    expect(
      useQuery.mock.calls.some(
        ([, args]) =>
          typeof args === "object" &&
          args !== null &&
          "cursor" in args &&
          args.cursor === "cursor-2",
      ),
    ).toBe(true);
    expect(
      useQuery.mock.calls.some(
        ([, args]) =>
          typeof args === "object" &&
          args !== null &&
          "collection" in args &&
          args.collection === "evidence_assets",
      ),
    ).toBe(true);

    const sharedProps = {
      buildId,
      buildSubmilestoneId: submilestoneId,
      companionActionItemId,
      onOpenChange: vi.fn(),
      organizationId,
      selectedTab: "evidence" as const,
    };
    view.rerender(<SubmilestoneDetailSheet {...sharedProps} open={false} />);
    view.rerender(<SubmilestoneDetailSheet {...sharedProps} open />);
    await waitFor(() => expect(screen.getByText("Footing photo")).toBeTruthy());
    expect(screen.queryByText("Engineer letter")).toBeNull();
    expect(
      [...useQuery.mock.calls]
        .reverse()
        .find(
          ([, args]) =>
            typeof args === "object" &&
            args !== null &&
            "collection" in args &&
            args.collection === "evidence_assets",
        )?.[1],
    ).toMatchObject({ cursor: undefined });

    collectionByName.evidence_assets = makeCollection("evidence_assets", {
      page: [{ id: "asset-new", title: "Replacement scope evidence" }],
    });
    view.rerender(
      <SubmilestoneDetailSheet
        buildId={buildId}
        buildSubmilestoneId={"submilestone-02" as Id<"buildSubmilestones">}
        companionActionItemId={companionActionItemId}
        onOpenChange={vi.fn()}
        open
        organizationId={organizationId}
        selectedTab="evidence"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Replacement scope evidence")).toBeTruthy(),
    );
    expect(screen.queryByText("Footing photo")).toBeNull();
    expect(screen.queryByText("Engineer letter")).toBeNull();
  });

  test("fails closed for revoked and integrity-error tab collections", () => {
    collectionByName.evidence_assets = { state: "revoked" };
    const revoked = renderSheet({ selectedTab: "evidence" });
    expect(
      screen.getByText(
        "This collection is unavailable for the current Build access.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("submilestone-evidence-loading"),
    ).toBeNull();
    revoked.unmount();

    collectionByName.evidence_assets = {
      code: "COMPANION_REVISION_MISMATCH",
      message: "Refresh the canonical workspace before retrying.",
      state: "integrity_error",
    };
    renderSheet({ selectedTab: "evidence" });
    expect(screen.getByRole("alert").textContent).toContain(
      "Refresh the canonical workspace before retrying.",
    );
    expect(
      screen.queryByTestId("submilestone-evidence-loading"),
    ).toBeNull();
  });
});
