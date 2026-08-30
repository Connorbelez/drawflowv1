// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const navigateMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const setupFlowProps = vi.hoisted(() => ({ current: null as any }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useRouteContext: () => ({ organizationId: "org-fairlend" }),
  }),
  useNavigate: () => navigateMock,
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock(
  "#/features/timeline-workspace/-TimelineSetupFlow.tsx",
  () => ({
    TimelineSetupFlow: (props: unknown) => {
      setupFlowProps.current = props;
      return <div data-testid="timeline-setup-flow" />;
    },
  }),
);

vi.mock("#/features/production-proposals/visualParityFixtures.ts", () => ({
  getVisualParityCreateContext: vi.fn(),
  isProductionVisualParityFixtureEnabled: () => false,
}));

import { Route } from "./new.tsx";

const NewProposalRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component;

const createContractorProfile = vi.fn();

beforeEach(() => {
  setupFlowProps.current = null;
  navigateMock.mockReset();
  createContractorProfile.mockReset();
  useQueryMock.mockReturnValue({
    availableContractors: [
      {
        _id: "contractor-existing",
        contractorId: "contractor-existing",
        name: "Ledger Frame Co.",
        trades: ["Framing"],
      },
    ],
    brokerage: { _id: "brokerage-fairlend" },
    brokers: [],
    defaultAssignedBrokerWorkosUserId: undefined,
    templates: [],
  });
  useMutationMock.mockImplementation((reference) => {
    if (
      getFunctionName(reference) ===
      "production_proposals:createContractorProfile"
    ) {
      return createContractorProfile;
    }
    return vi.fn();
  });
});

afterEach(() => cleanup());

describe("/backoffice/proposals/new contractor creation", () => {
  test("wires the brokerage-scoped canonical create command into milestone planning", async () => {
    createContractorProfile.mockResolvedValue("contractor-new");
    render(<NewProposalRoute />);

    expect(setupFlowProps.current.contractorOptions).toEqual([
      expect.objectContaining({ contractorId: "contractor-existing" }),
    ]);
    expect(
      setupFlowProps.current.contractorActions.availableContractors,
    ).toEqual([expect.objectContaining({ _id: "contractor-existing" })]);

    let result: unknown;
    await act(async () => {
      result = await setupFlowProps.current.contractorActions.onCreate({
        contractor: {
          availabilityWindows: [],
          capabilities: [],
          defaultPayRateUnit: "hour",
          equipment: [],
          kind: "company",
          name: "Northstar Masonry",
          trades: ["masonry"],
        },
        role: "Masonry lead",
      });
    });

    expect(createContractorProfile).toHaveBeenCalledWith({
      availabilityWindows: [],
      brokerageId: "brokerage-fairlend",
      capabilities: [],
      defaultPayRateUnit: "hour",
      equipment: [],
      kind: "company",
      name: "Northstar Masonry",
      trades: ["masonry"],
      workosOrganizationId: "org-fairlend",
    });
    expect(result).toEqual({ contractorId: "contractor-new" });
  });

  test("propagates canonical creation failures to the recoverable drawer state", async () => {
    createContractorProfile.mockRejectedValue(
      new Error("Forbidden: brokerage scope"),
    );
    render(<NewProposalRoute />);

    await expect(
      setupFlowProps.current.contractorActions.onCreate({
        contractor: {
          availabilityWindows: [],
          capabilities: [],
          defaultPayRateUnit: "hour",
          equipment: [],
          kind: "company",
          name: "Northstar Masonry",
          trades: ["masonry"],
        },
      }),
    ).rejects.toThrow("Forbidden: brokerage scope");
  });
});
