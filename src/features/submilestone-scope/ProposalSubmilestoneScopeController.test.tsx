// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const surfacePropsMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock("./SubmilestoneScopeRevisionSurface.tsx", () => ({
  SubmilestoneScopeRevisionSurface: (props: Record<string, unknown>) => {
    surfacePropsMock(props);
    return <output data-testid="scope-surface-props">mounted</output>;
  },
}));

import { ProposalSubmilestoneScopeController } from "./ProposalSubmilestoneScopeController.tsx";

const backofficeHistory = {
  activeDraftRevisionId: "scope-v2-draft",
  effectiveRevisionId: "scope-v1",
  latestVersion: 2,
  revisions: [
    {
      _id: "scope-v1",
      authoredByWorkosUserId: "alice",
      createdAt: 100,
      isEffective: true,
      savedAt: 110,
      status: "published" as const,
      version: 1,
    },
    {
      _id: "scope-v2-draft",
      authoredByWorkosUserId: "bob",
      createdAt: 200,
      isActiveDraft: true,
      savedAt: 210,
      status: "draft" as const,
      version: 2,
    },
  ],
};

const builderHistory = {
  effectiveRevisionId: "scope-v1",
  revisions: [
    {
      _id: "scope-v1",
      authoredByDisplayName: "Alice",
      authoredByWorkosUserId: "alice",
      createdAt: 100,
      isEffective: true,
      publishedAt: 120,
      savedAt: 110,
      status: "published" as const,
      version: 1,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  useMutationMock.mockImplementation(() => vi.fn().mockResolvedValue("scope-v2-draft"));
  useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (args && typeof args === "object" && "revisionId" in args) {
      return {
        _id: (args as { revisionId: string }).revisionId,
        scopeOfWorkTiptapJson: "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]} ",
      };
    }
    return undefined;
  });
});

function setHistoryForRoute(route: "backoffice-proposal" | "builder-proposal") {
  useQueryMock.mockImplementation((_query: unknown, args: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (args && typeof args === "object" && "revisionId" in args) {
      return {
        _id: (args as { revisionId: string }).revisionId,
        scopeOfWorkTiptapJson: "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]} ",
      };
    }
    return route === "backoffice-proposal"
      ? backofficeHistory
      : builderHistory;
  });
}

describe("ProposalSubmilestoneScopeController", () => {
  test("selects only the backoffice history/content queries and exposes draft actions", async () => {
    setHistoryForRoute("backoffice-proposal");

    render(
      <ProposalSubmilestoneScopeController
        proposalSubmilestoneId="proposal-submilestone-1"
        scopeRoute="backoffice-proposal"
        workosOrganizationId="org-1"
      />
    );

    await waitFor(() => expect(surfacePropsMock).toHaveBeenCalled());
    const calls = useQueryMock.mock.calls.map(([, args]) => args);
    expect(calls[0]).toEqual({
      proposalSubmilestoneId: "proposal-submilestone-1",
      workosOrganizationId: "org-1",
    });
    expect(calls[1]).toBe("skip");
    expect(
      getFunctionName(useQueryMock.mock.calls[2]?.[0] as any)
    ).toBe("submilestone_scope_contracts:getSubmilestoneScopeRevisionContent");
    const props = surfacePropsMock.mock.lastCall?.[0] as Record<string, any>;
    expect(props.capabilities).toEqual({
      canEditDraft: true,
      canLoadUnpublishedDraft: true,
      canPublishDraft: true,
      canStartDraft: true,
    });
    expect(props.activeDraftRevision.id).toBe("scope-v2-draft");
    expect(props.revisions.map((revision: { id: string }) => revision.id)).toEqual([
      "scope-v1",
      "scope-v2-draft",
    ]);
  });

  test("uses builder published-only queries and never exposes draft actions", async () => {
    setHistoryForRoute("builder-proposal");

    render(
      <ProposalSubmilestoneScopeController
        proposalSubmilestoneId="proposal-submilestone-1"
        scopeRoute="builder-proposal"
        workosOrganizationId="org-1"
      />
    );

    await waitFor(() => expect(surfacePropsMock).toHaveBeenCalled());
    const calls = useQueryMock.mock.calls.map(([, args]) => args);
    expect(calls[0]).toBe("skip");
    expect(calls[1]).toEqual({
      proposalSubmilestoneId: "proposal-submilestone-1",
      workosOrganizationId: "org-1",
    });
    expect(
      getFunctionName(useQueryMock.mock.calls[2]?.[0] as any)
    ).toBe(
      "submilestone_scope_contracts:getBuilderSubmilestoneScopeRevisionContent"
    );
    const props = surfacePropsMock.mock.lastCall?.[0] as Record<string, any>;
    expect(props.capabilities).toEqual({
      canEditDraft: false,
      canLoadUnpublishedDraft: false,
      canPublishDraft: false,
      canStartDraft: false,
    });
    expect(props.activeDraftRevision).toBeNull();
    expect(props.onCreateDraftFromRevision).toBeUndefined();
    expect(props.onLoadDraft).toBeUndefined();
    expect(props.onPublishDraft).toBeUndefined();
    expect(props.onSaveDraft).toBeUndefined();
  });

  test("skips every query until the route has a canonical ID and organization", () => {
    render(
      <ProposalSubmilestoneScopeController
        scopeRoute="builder-proposal"
      />
    );

    expect(useQueryMock.mock.calls.every(([, args]) => args === "skip")).toBe(
      true
    );
    expect(screen.getByTestId("scope-surface-props")).toBeTruthy();
  });
});
