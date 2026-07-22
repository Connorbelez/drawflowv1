// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ContractorRosterTable,
  type ContractorRosterRow,
} from "./ContractorRosterTable";

afterEach(() => cleanup());

const contractors: ContractorRosterRow[] = [
  {
    _id: "contractor_visual_masonry",
    accountWorkosUserId: "user_visual_contractor_masonry",
    availabilityWindows: [
      {
        dayOfWeek: 1,
        endMinute: 16 * 60,
        startMinute: 7 * 60,
        timezone: "America/Toronto",
      },
    ],
    capabilities: [
      {
        capabilityKey: "brick_siding",
        label: "Brick siding",
        trade: "masonry",
      },
      {
        capabilityKey: "stone_veneer",
        label: "Stone veneer",
        trade: "masonry",
      },
    ],
    city: "Toronto, ON",
    defaultPayRateCents: 8_500,
    defaultPayRateUnit: "hour",
    email: "ops@northstar.example",
    equipment: [{ name: "Scaffold", quantity: 2 }],
    kind: "company",
    name: "Northstar Masonry",
    onboardingStatus: "account_linked",
    phone: "416-555-0144",
    status: "active",
    trades: ["masonry", "brick"],
  },
  {
    _id: "contractor_visual_framing",
    availabilityWindows: [
      {
        dayOfWeek: 3,
        endMinute: 15 * 60 + 30,
        startMinute: 8 * 60,
        timezone: "America/Toronto",
      },
    ],
    capabilities: [
      {
        capabilityKey: "rough_framing",
        label: "Rough framing",
        trade: "framing",
      },
    ],
    city: "Hamilton, ON",
    defaultPayRateCents: 12_000,
    defaultPayRateUnit: "day",
    email: "crew@beamline.example",
    equipment: [{ name: "Telehandler" }],
    kind: "company",
    name: "Beamline Framing",
    onboardingStatus: "profile_only",
    status: "inactive",
    trades: ["framing"],
  },
];

function renderTable(rows: ContractorRosterRow[] = contractors) {
  return render(
    <ContractorRosterTable
      contractors={rows}
      detailHrefFor={(contractor) => `/backoffice/contractors/${contractor._id}`}
      onAddContractor={vi.fn()}
    />,
  );
}

describe("ContractorRosterTable", () => {
  test("renders contractor rows as a semantic data table with profile links", () => {
    renderTable();

    expect(
      screen.getByRole("table", { name: "Contractor roster" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Contractor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Trade / market" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capabilities" })).toBeTruthy();

    expect(
      screen.getByRole("link", { name: "Northstar Masonry" }).getAttribute("href"),
    ).toBe("/backoffice/contractors/contractor_visual_masonry");
    expect(screen.getByText("Brick siding")).toBeTruthy();
    expect(screen.getByText("Scaffold x2")).toBeTruthy();
    expect(screen.getByText("$85/hour")).toBeTruthy();
    expect(screen.getByText("Monday 7a-4p")).toBeTruthy();
  });

  test("filters across contractor fields using the TanStack global filter", () => {
    renderTable();

    fireEvent.change(
      screen.getByPlaceholderText("Search contractors, trades, equipment"),
      {
        target: { value: "telehandler" },
      },
    );

    expect(screen.getByText("Beamline Framing")).toBeTruthy();
    expect(screen.queryByText("Northstar Masonry")).toBeNull();
    expect(screen.getByText("Showing 1 contractor from 2")).toBeTruthy();
  });

  test("combines status and account facets and can reset back to the full roster", () => {
    renderTable();

    fireEvent.change(screen.getByLabelText("Filter contractor status"), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByLabelText("Filter account link"), {
      target: { value: "profile_only" },
    });

    expect(
      screen.getByText("No contractors match the table filters"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(screen.getByText("Northstar Masonry")).toBeTruthy();
    expect(screen.getByText("Beamline Framing")).toBeTruthy();
    expect(screen.getByText("Showing 2 contractors")).toBeTruthy();
  });
});
