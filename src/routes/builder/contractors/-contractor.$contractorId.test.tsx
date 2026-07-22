// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const sendInvite = vi.fn();
const useMutation = vi.fn();
const useQuery = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: (ref: unknown) => useMutation(ref),
  useQuery: (ref: unknown, args: unknown) => useQuery(ref, args),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock("#/components/ui/frame.tsx", () => ({
  Frame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FramePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("#/features/contractors/contractorVisualFixtures.ts", () => ({
  getVisualContractorDetail: vi.fn(),
  isProductionVisualParityFixtureEnabled: () => false,
}));

vi.mock("#/features/contractors/ContractorDetailSurface.tsx", () => ({
  ContractorDetailSurface: ({
    backHref,
    backLabel,
    detail,
    rightRailFooter,
  }: {
    backHref: string;
    backLabel: string;
    detail: {
      profile: { name: string };
      relationship?: { lifecycleState?: string };
    };
    rightRailFooter?: React.ReactNode;
  }) => (
    <div data-testid="contractor-detail-surface">
      <a href={backHref}>{backLabel}</a>
      <p>{detail.profile.name}</p>
      <p>{detail.relationship?.lifecycleState}</p>
      {rightRailFooter}
    </div>
  ),
}));

import { BuilderContractorWorkspaceRoute } from "./$contractorId";

describe("BuilderContractorWorkspaceRoute", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    useMutation.mockReturnValue(sendInvite);
  });

  test("preserves the invoking build return path and renders relationship status", () => {
    useQuery.mockReturnValue({
      availability: {
        category: "available",
        reference: "CTR-DETAIL-AVAILABLE",
      },
      detail: {
        profile: {
          email: "attached@example.com",
          name: "Attached Contractor",
        },
        relationship: {
          lifecycleState: "attached",
          nextAction: "invite",
        },
        workHistory: [],
      },
    });

    render(
      <BuilderContractorWorkspaceRoute
        contractorId="contractor-01"
        search={{ fromBuildId: "build-01" }}
        workosOrganizationId="org_production_foundation"
      />
    );

    expect(screen.getByText("Attached Contractor")).toBeTruthy();
    expect(screen.getByText("attached")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to build contractors" }).getAttribute("href")
    ).toBe("/builder/builds/build-01?tab=contractors");
    expect(screen.getByRole("button", { name: "Send invite" })).toBeTruthy();
  });

  test("shows the invited handoff actor, scope, timestamps, acknowledgement, and next legal action", () => {
    useQuery.mockReturnValue({
      availability: {
        category: "available",
        reference: "CTR-DETAIL-AVAILABLE",
      },
      detail: {
        profile: {
          email: "receiver@example.com",
          name: "Invited Contractor",
        },
        relationship: {
          acknowledgementStatus: "pending",
          assignmentStatus: "assigned",
          brokerage: { displayName: "FairLend Brokerage" },
          invitation: {
            email: "receiver@example.com",
            expiresAt: 1_767_225_600_000,
            sentAt: 1_735_689_600_000,
            state: "invited",
            updatedAt: 1_735_689_900_000,
          },
          lifecycleState: "invited",
          nextAction: "wait_for_claim",
          review: {
            state: "pending_backoffice_review",
            updatedAt: 1_735_690_200_000,
          },
        },
        workHistory: [],
      },
    });

    render(
      <BuilderContractorWorkspaceRoute
        contractorId="contractor-01"
        search={{}}
        workosOrganizationId="org_production_foundation"
      />
    );

    expect(screen.getByText("FairLend Brokerage")).toBeTruthy();
    expect(screen.getByText("receiver@example.com")).toBeTruthy();
    expect(screen.getAllByText("Invited").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending backoffice review")).toBeTruthy();
    expect(screen.getByText("Assigned")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(
      screen.getByText("Waiting for the contractor to claim the invitation.")
    ).toBeTruthy();
    expect(screen.getByText("Invitation expires")).toBeTruthy();
    expect(screen.getByText("Last handoff update")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send invite" })).toBeNull();
  });

  test("renders a typed recovery state without raw backend internals", () => {
    useQuery.mockReturnValue({
      availability: {
        category: "accessDenied",
        reference: "CTR-DETAIL-ACCESS",
      },
      detail: null,
    });

    render(
      <BuilderContractorWorkspaceRoute
        contractorId="contractor-secret-id"
        search={{}}
        workosOrganizationId="org_production_foundation"
      />
    );

    expect(screen.getByText("Contractor access unavailable")).toBeTruthy();
    expect(screen.getByText("Reference: CTR-DETAIL-ACCESS")).toBeTruthy();
    expect(screen.queryByText(/contractor-secret-id/i)).toBeNull();
    expect(screen.queryByText(/Forbidden:|request id|convex\//i)).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Back to builder workspace" })
        .getAttribute("href")
    ).toBe("/builder");
  });

  test("redacts invite mutation failures and preserves the current relationship state", async () => {
    useQuery.mockReturnValue({
      availability: {
        category: "available",
        reference: "CTR-DETAIL-AVAILABLE",
      },
      detail: {
        profile: {
          email: "attached@example.com",
          name: "Attached Contractor",
        },
        relationship: {
          lifecycleState: "attached",
          nextAction: "invite",
        },
        workHistory: [],
      },
    });
    sendInvite.mockRejectedValueOnce(
      new Error(
        "Forbidden: mutation contractorOnboarding.sendContractorProfileInvite request id abc /srv/convex/contractorOnboarding.ts"
      )
    );

    render(
      <BuilderContractorWorkspaceRoute
        contractorId="contractor-01"
        search={{}}
        workosOrganizationId="org_production_foundation"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "The invitation could not be sent. Check the contractor email and try again, or contact support."
        )
      ).toBeTruthy()
    );
    expect(screen.getByText("Attached Contractor")).toBeTruthy();
    expect(screen.queryByText(/Forbidden:|request id|contractorOnboarding\.ts/i)).toBeNull();
  });
});
