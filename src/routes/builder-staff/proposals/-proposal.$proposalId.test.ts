import { describe, expect, test, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({
    ...((config as object) ?? {}),
    useParams: vi.fn(),
    useRouteContext: vi.fn(),
    useSearch: vi.fn(),
  }),
}));

vi.mock("#/routes/builder/proposals/$proposalId/index.tsx", () => ({
  BuilderProductionProposalWorkspace: () => null,
}));

import { validateBuilderStaffProposalSearch } from "./$proposalId/index.tsx";

describe("builder-staff proposal search", () => {
  test("round-trips permitted stages and timeframe while omitting restricted stages", () => {
    expect(
      validateBuilderStaffProposalSearch({
        tab: "materials",
        timeframe: "week",
      }),
    ).toEqual({ tab: "materials", timeframe: "week" });
    expect(
      validateBuilderStaffProposalSearch({
        tab: "staff",
        timeframe: "agenda",
      }),
    ).toEqual({ timeframe: "agenda" });
    expect(
      validateBuilderStaffProposalSearch({
        tab: "milestones",
        timeframe: "month",
      }),
    ).toEqual({ timeframe: "month" });
  });
});
