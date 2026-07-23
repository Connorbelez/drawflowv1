// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EditableNumberChip } from "./editable-chip.tsx";

describe("EditableNumberChip themes", () => {
  afterEach(cleanup);

  test("keeps the light-tone metric legible in dark mode", () => {
    render(
      <EditableNumberChip
        ariaLabel="Approved amount"
        formatDisplay={(value) => `$${value.toLocaleString()}`}
        onCommit={vi.fn()}
        testId="metric"
        tone="light"
        value={1_000_000}
      />
    );

    const metric = screen.getByTestId("metric");
    expect(metric.className).toContain("dark:bg-card");
    expect(metric.className).toContain("dark:text-card-foreground");
  });
});
