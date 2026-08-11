// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  BuildCollaborationActionItemQueue,
  BuildCollaborationActionItems,
} from "./BuildCollaborationActionItems.tsx";

afterEach(cleanup);

const generated = {
  _id: "companion-1",
  actionItemId: "companion-1",
  actionableUnreadCount: 0,
  assigneeWorkosUserId: "generic-assignee",
  assignmentState: "assigned",
  blockedReason: "Generic blocker that must not render",
  canonicalBuildSubmilestoneId: "submilestone-1",
  createdAt: Date.parse("2026-08-01T12:00:00.000Z"),
  currentRevision: 4,
  dependencyCount: 0,
  dueAt: Date.parse("2026-08-09T12:00:00.000Z"),
  labels: ["generic-label"],
  parentActionItemId: undefined,
  priority: "urgent",
  status: "todo",
  systemMode: "generated_milestone_submilestone",
  systemPresentation: {
    bindingState: "valid",
    column: "in_progress",
    executionOwnership: {
      assigneeDisplayName: "Alex Electric",
      assigneeWorkosUserId: "contractor-alex",
      state: "assigned",
      viewerIsAssignee: false,
    },
    plannedCompletionDate: "2026-08-18",
    plannedStartDate: "2026-08-12",
    state: "known",
  },
  title: "Electrical rough-in",
  unblocksCount: 0,
  unreadCommentCount: 0,
} as never;

const manual = {
  ...generated,
  _id: "manual-1",
  actionItemId: "manual-1",
  assigneeWorkosUserId: "user-builder",
  blockedReason: undefined,
  canonicalBuildSubmilestoneId: undefined,
  dueAt: undefined,
  labels: [],
  priority: "medium",
  status: "in_progress",
  systemMode: undefined,
  systemPresentation: undefined,
  title: "Confirm delivery window",
} as never;

const child = {
  ...manual,
  _id: "child-1",
  actionItemId: "child-1",
  parentActionItemId: "manual-1",
  title: "Call supplier",
} as never;

describe("BuildCollaborationActionItems presentation contract", () => {
  test("renders a generated root as canonical Sub-milestone work without generic controls", () => {
    const onOpen = vi.fn();
    render(
      <BuildCollaborationActionItems
        actionView="list"
        items={[generated]}
        mutationsAllowed
        onCreate={vi.fn()}
        onMove={vi.fn()}
        onOpen={onOpen}
        participants={[]}
      />,
    );

    expect(screen.getByText("1 Sub-milestone anchored to this post")).toBeTruthy();
    expect(screen.getByText("Sub-milestone")).toBeTruthy();
    expect(screen.getByText("Alex Electric")).toBeTruthy();
    expect(
      screen.getByLabelText("Planned schedule: 2026-08-12 to 2026-08-18"),
    ).toBeTruthy();
    expect(screen.queryByText("System · Milestone")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Status for Electrical rough-in" })).toBeNull();
    expect(screen.queryByText("generic-label")).toBeNull();
    expect(screen.queryByText("Generic blocker that must not render")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Sub-milestone: Electrical rough-in",
      }),
    );
    expect(onOpen).toHaveBeenCalledWith({
      companionId: "companion-1",
      kind: "submilestone",
      submilestoneId: "submilestone-1",
    });
  });

  test("retains generic Action Item workflow for manual roots and children", () => {
    render(
      <BuildCollaborationActionItems
        actionView="list"
        items={[manual, child]}
        mutationsAllowed
        onCreate={vi.fn()}
        onMove={vi.fn()}
        onOpen={vi.fn()}
        participants={[]}
      />,
    );

    expect(screen.getByText("2 Action Items anchored to this post")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Status for Confirm delivery window" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Status for Call supplier" }),
    ).toBeTruthy();
  });

  test("distinguishes generated rows from Action Items in shared queues", () => {
    render(
      <BuildCollaborationActionItemQueue
        emptyLabel="Empty"
        onOpen={vi.fn()}
        rows={[
          { buildName: "Fourplex", item: generated, overdue: false, queueScope: "build" },
          { buildName: "Fourplex", item: manual, overdue: false, queueScope: "build" },
        ] as never}
        title="Build work"
      />,
    );

    expect(screen.getByText("1 Sub-milestone")).toBeTruthy();
    expect(screen.getByText("1 Action Item")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open Sub-milestone: Electrical rough-in" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open Action Item: Confirm delivery window" }),
    ).toBeTruthy();
  });
});
