/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  SUBMITTED_TIMELINE_TABS,
  SubmittedTimelineTabs,
} from "./index.tsx";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: () => undefined,
}));

vi.mock("nuqs", () => ({
  createStandardSchemaV1: () => ({}),
  parseAsString: { withDefault: () => ({}) },
  useQueryStates: () => [{ share: null }, vi.fn()],
}));

describe("submitted timeline tab shell", () => {
  test("renders the three view-only submitted tabs and emits tab changes", () => {
    const onTabChange = vi.fn();

    render(
      <SubmittedTimelineTabs activeTab="timeline" onTabChange={onTabChange} />,
    );

    expect(
      screen.getByRole("tablist", { name: "Submitted proposal view tabs" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
      SUBMITTED_TIMELINE_TABS.map((tab) => tab.label),
    );
    expect(screen.getByRole("tab", { selected: true }).textContent).toBe(
      "Timeline",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Cashflow" }));
    expect(onTabChange).toHaveBeenCalledWith("cashflow");
  });
});
