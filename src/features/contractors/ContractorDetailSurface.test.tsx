// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ContractorDetailSurface,
  type ContractorDetailView,
} from "./ContractorDetailSurface";

afterEach(() => cleanup());

const detail: ContractorDetailView = {
  performance: {
    averageQualityRating: 4,
    totalActualCostCents: 612_000,
  },
  profile: {
    accountWorkosUserId: "user_contractor",
    capabilities: [{ label: "Brick siding" }],
    city: "Toronto, ON",
    defaultPayRateCents: 8_500,
    defaultPayRateUnit: "hour",
    email: "ops@northstar.example",
    equipment: [{ name: "Scaffold" }],
    name: "Northstar Masonry",
    phone: "416-555-0144",
    trades: ["masonry", "brick"],
  },
  ratings: [{ _id: "rating-01" }],
  workHistory: [
    {
      _id: "assignment-01",
      actualCostCents: 612_000,
      actualHours: 72,
      buildId: "active-build-01",
      buildName: "Hamilton Infill Build",
      costNotes: "Crew beat estimate by one hour.",
      estimatedCostCents: 620_500,
      estimatedHours: 73,
      evidencePhotos: [
        {
          evidenceKey: "evidence-01",
          label: "East elevation brick siding",
          milestoneKey: "exterior-envelope",
          previewUrl: null,
          submilestoneKey: "brick-siding",
        },
      ],
      milestoneKey: "exterior-envelope",
      milestoneName: "Exterior envelope",
      postHoc: false,
      role: "Masonry lead",
      status: "active",
      submilestones: [{ key: "brick-siding", name: "Brick siding" }],
    },
  ],
};

describe("ContractorDetailSurface", () => {
  test("renders builder-safe work history without account linking controls", () => {
    render(
      <ContractorDetailSurface
        backHref="/builder"
        backLabel="Builder workspace"
        buildHrefForWorkHistory={(row) => `/builder/builds/${row.buildId}`}
        detail={detail}
      />,
    );

    expect(screen.getByRole("heading", { name: "Northstar Masonry" })).toBeTruthy();
    expect(screen.getByText("Work history")).toBeTruthy();
    expect(screen.getByText("Hamilton Infill Build").getAttribute("href")).toBe(
      "/builder/builds/active-build-01",
    );
    expect(screen.getByText("East elevation brick siding")).toBeTruthy();
    expect(screen.queryByText("Link account")).toBeNull();
  });

  test("renders backoffice account linking controls when provided", () => {
    render(
      <ContractorDetailSurface
        accountLink={{
          error: "",
          onSubmit: vi.fn(),
          onWorkosUserIdChange: vi.fn(),
          pending: false,
          workosUserId: "",
          workosUserOptions: [
            {
              email: "maya.singh@northstar.example",
              name: "Maya Singh",
              roleSlugs: ["contractor"],
              workosUserId: "user_visual_contractor_masonry",
            },
          ],
        }}
        backHref="/backoffice/contractors"
        backLabel="Contractors"
        detail={detail}
      />,
    );

    expect(screen.getByText("Contractor account")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "WorkOS user" }),
    ).toBeTruthy();
    expect(screen.queryByText("WorkOS user ID")).toBeNull();
    expect(screen.getByRole("button", { name: /Link account/i })).toBeTruthy();
  });
});
