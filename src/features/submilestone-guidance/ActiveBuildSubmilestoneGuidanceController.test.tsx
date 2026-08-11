// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const editorPropsMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock("./SubmilestoneFieldGuidanceEditor.tsx", () => ({
  SubmilestoneFieldGuidanceEditor: (props: Record<string, unknown>) => {
    editorPropsMock(props);
    return <output data-testid="guidance-editor">mounted</output>;
  },
}));

import { ActiveBuildSubmilestoneGuidanceController } from "./ActiveBuildSubmilestoneGuidanceController.tsx";

const queryResult = {
  guidance: {
    _id: "guidance-1",
    buildSubmilestoneId: "build-submilestone-1",
    cameraAnglesTiptapJson: '{"type":"doc","content":[]}',
    proposalSubmilestoneId: "proposal-submilestone-1",
    updatedAt: 100,
    whatToVerifyTiptapJson: '{"type":"doc","content":[]}',
  },
  readiness: { missingSections: [], readyForSiteVisit: true },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useMutationMock.mockReturnValue(vi.fn().mockResolvedValue(null));
  useQueryMock.mockImplementation((_query: unknown, args: unknown) =>
    args === "skip" ? undefined : queryResult,
  );
});

function renderController(
  viewerCapacity:
    | "admin"
    | "builder"
    | "builder-staff"
    | "contractor"
    | "homeowner"
    | undefined,
  overrides: Record<string, unknown> = {},
) {
  return render(
    <ActiveBuildSubmilestoneGuidanceController
      buildSubmilestoneId="build-submilestone-1"
      proposalSubmilestoneId="proposal-submilestone-1"
      subMilestoneName="Footing forms"
      viewerCapacity={viewerCapacity}
      workosOrganizationId="org-1"
      {...overrides}
    />,
  );
}

describe("ActiveBuildSubmilestoneGuidanceController", () => {
  test("lets backoffice edit through the canonical guidance mutation", async () => {
    renderController("admin");
    await waitFor(() => expect(editorPropsMock).toHaveBeenCalled());
    const props = editorPropsMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props.canEdit).toBe(true);
    expect(props.readOnly).toBe(false);
    expect(typeof props.onSave).toBe("function");
    expect(getFunctionName(useQueryMock.mock.calls[0]?.[0] as any)).toBe(
      "submilestone_field_guidance:getSubmilestoneFieldGuidance",
    );
    expect(useQueryMock.mock.calls[0]?.[1]).toEqual({
      proposalSubmilestoneId: "proposal-submilestone-1",
      workosOrganizationId: "org-1",
    });
  });

  test.each(["builder", "builder-staff"] as const)(
    "renders published/current Guidance read-only for %s",
    async (viewerCapacity) => {
      renderController(viewerCapacity);
      await waitFor(() => expect(editorPropsMock).toHaveBeenCalled());
      const props = editorPropsMock.mock.lastCall?.[0] as Record<string, unknown>;
      expect(props.canEdit).toBe(false);
      expect(props.readOnly).toBe(true);
      expect(props.onSave).toBeUndefined();
    },
  );

  test("allows an assigned contractor to read Guidance without Scope controls", async () => {
    renderController("contractor");
    await waitFor(() => expect(editorPropsMock).toHaveBeenCalled());
    const props = editorPropsMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props.canEdit).toBe(false);
    expect(props.readOnly).toBe(true);
  });

  test("skips Guidance entirely for homeowners and reports a clean dirty state", () => {
    const onDirtyChange = vi.fn();
    renderController("homeowner", { onDirtyChange });
    expect(screen.queryByTestId("guidance-editor")).toBeNull();
    expect(useQueryMock.mock.calls[0]?.[1]).toBe("skip");
    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });

  test("fails closed when the viewer capacity is missing", () => {
    const onDirtyChange = vi.fn();
    renderController(undefined, { onDirtyChange });
    expect(screen.queryByTestId("guidance-editor")).toBeNull();
    expect(useQueryMock.mock.calls[0]?.[1]).toBe("skip");
    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });

  test("does not dereference a null Guidance query result", () => {
    useQueryMock.mockImplementationOnce(() => null);
    renderController("builder");
    expect(
      screen.queryByTestId(
        "active-build-field-guidance-loading-build-submilestone-1",
      ),
    ).not.toBeNull();
    expect(screen.queryByTestId("guidance-editor")).toBeNull();
  });

  test("requires an explicit proposal lineage and organization before reading", () => {
    renderController("builder", {
      proposalSubmilestoneId: undefined,
      workosOrganizationId: undefined,
    });
    expect(screen.queryByTestId("guidance-editor")).toBeNull();
    expect(useQueryMock.mock.calls[0]?.[1]).toBe("skip");
  });

  test("keeps active-build read-only overrides read-only for backoffice viewers", async () => {
    renderController("admin", { readOnly: true });
    await waitFor(() => expect(editorPropsMock).toHaveBeenCalled());
    const props = editorPropsMock.mock.lastCall?.[0] as Record<string, unknown>;
    expect(props.canEdit).toBe(false);
    expect(props.readOnly).toBe(true);
    expect(props.onSave).toBeUndefined();
  });
});
