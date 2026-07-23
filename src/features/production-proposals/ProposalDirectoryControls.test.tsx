// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import {
  EMPTY_PROPOSAL_DIRECTORY_FILTERS,
  ProposalDirectoryControls,
} from "./ProposalDirectoryControls.tsx";

afterEach(cleanup);

test("searches, exposes workflow filters, and resets the proposal directory", () => {
  const onFiltersChange = vi.fn();
  const onReset = vi.fn();
  const onSearchChange = vi.fn();

  render(
    <ProposalDirectoryControls
      activeFilterCount={0}
      filters={EMPTY_PROPOSAL_DIRECTORY_FILTERS}
      loading={false}
      onFiltersChange={onFiltersChange}
      onReset={onReset}
      onSearchChange={onSearchChange}
      options={{ brokers: [], builders: [] }}
      resultCount={7}
      search=""
    />,
  );

  fireEvent.change(screen.getByLabelText("Search proposals"), {
    target: { value: "builder@example.com" },
  });
  expect(onSearchChange).toHaveBeenCalledWith("builder@example.com");
  expect(screen.getByText("7 proposals loaded")).toBeTruthy();
  expect(screen.getByRole("button", { name: /more filters/i })).toBeTruthy();
});
