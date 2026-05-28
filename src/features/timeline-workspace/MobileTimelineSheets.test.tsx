// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type {
  DemoDraw,
  DemoMilestone,
} from "./-timeline-share-snapshot.ts";
import {
  DeleteSheet,
  EditBudgetSheet,
  EditDatesSheet,
  EditDrawSheet,
} from "./MobileTimelineSheets.tsx";

afterEach(() => cleanup());

const item: TimelineItem<DemoMilestone> = {
  data: {
    amount: 120_000,
    draw: "Draw",
    durationDays: 12,
    evidence: "Draft",
    icon: "foundation",
    name: "Foundation",
    policy: "Pending",
    status: "ready",
    subMilestones: [],
  },
  id: "foundation",
  x: 8,
};

describe("EditDatesSheet", () => {
  test("commits start day and duration via the milestone handler", () => {
    const onCommit = vi.fn();
    render(<EditDatesSheet item={item} onClose={vi.fn()} onCommit={onCommit} />);
    fireEvent.change(screen.getByTestId("mobile-edit-start-day"), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByTestId("mobile-edit-duration"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByTestId("mobile-edit-dates-save"));
    expect(onCommit).toHaveBeenCalledWith("foundation", {
      durationDays: 20,
      x: 14,
    });
  });

  test("rejects an invalid (zero) duration", () => {
    const onCommit = vi.fn();
    render(<EditDatesSheet item={item} onClose={vi.fn()} onCommit={onCommit} />);
    fireEvent.change(screen.getByTestId("mobile-edit-duration"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("mobile-edit-dates-save"));
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("EditBudgetSheet", () => {
  test("commits the budget amount", () => {
    const onCommit = vi.fn();
    render(
      <EditBudgetSheet item={item} onClose={vi.fn()} onCommit={onCommit} />
    );
    fireEvent.change(screen.getByTestId("mobile-edit-amount"), {
      target: { value: "150000" },
    });
    fireEvent.click(screen.getByTestId("mobile-edit-budget-save"));
    expect(onCommit).toHaveBeenCalledWith("foundation", { amount: 150_000 });
  });
});

describe("EditDrawSheet", () => {
  test("commits draw timing and amount (replaces marker drag)", () => {
    const draw: DemoDraw = {
      amount: 40_000,
      id: "draw-1",
      label: "Draw 1",
      x: 30,
    };
    const onCommit = vi.fn();
    render(<EditDrawSheet draw={draw} onClose={vi.fn()} onCommit={onCommit} />);
    fireEvent.change(screen.getByTestId("mobile-edit-draw-timing"), {
      target: { value: "36" },
    });
    fireEvent.change(screen.getByTestId("mobile-edit-draw-amount"), {
      target: { value: "52000" },
    });
    fireEvent.click(screen.getByTestId("mobile-edit-draw-save"));
    expect(onCommit).toHaveBeenCalledWith("draw-1", { amount: 52_000, x: 36 });
  });
});

describe("DeleteSheet", () => {
  const target = { id: "foundation", kind: "milestone" as const, label: "Foundation" };

  test("confirms immediately when no reason is required", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteSheet
        description="Delete this milestone."
        onClose={vi.fn()}
        onConfirm={onConfirm}
        target={target}
        title="Delete milestone"
      />
    );
    fireEvent.click(screen.getByTestId("mobile-delete-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("foundation", "");
  });

  test("blocks deletion until a reason is given when required (audit rule)", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteSheet
        description="Request deletion."
        onClose={vi.fn()}
        onConfirm={onConfirm}
        requireReason
        target={target}
        title="Request milestone deletion"
      />
    );
    const confirm = screen.getByTestId(
      "mobile-delete-confirm"
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("mobile-delete-reason"), {
      target: { value: "Scope removed by lender" },
    });
    expect(
      (screen.getByTestId("mobile-delete-confirm") as HTMLButtonElement).disabled
    ).toBe(false);
    fireEvent.click(screen.getByTestId("mobile-delete-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      "foundation",
      "Scope removed by lender"
    );
  });
});
