// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appeal: vi.fn(),
  context: {
    canAppeal: false,
    canModerate: true,
    canResolveAppeal: false,
    events: [],
  } as {
    canAppeal: boolean;
    canModerate: boolean;
    canResolveAppeal: boolean;
    caseId?: string;
    currentReason?: string;
    events: Array<{
      actorRole:
        | "admin"
        | "principle-broker"
        | "broker"
        | "builder"
        | "broker-staff"
        | "builder-staff"
        | "homeowner"
        | "contractor";
      createdAt: number;
      eventType: "appealed" | "moderated" | "restored" | "retained";
      reason: string;
    }>;
    status?: "appealed" | "final_retained" | "moderated" | "restored";
  },
  moderate: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    if (functionName.endsWith("moderateBuildCollaborationContent")) {
      return mocks.moderate;
    }
    if (functionName.endsWith("appealBuildCollaborationModeration")) {
      return mocks.appeal;
    }
    return mocks.resolve;
  },
  useQuery: () => mocks.context,
}));

import { BuildCollaborationModerationSheet } from "./BuildCollaborationModerationSheet";

afterEach(() => {
  cleanup();
  mocks.appeal.mockReset();
  mocks.context = {
    canAppeal: false,
    canModerate: true,
    canResolveAppeal: false,
    events: [],
  };
  mocks.moderate.mockReset();
  mocks.resolve.mockReset();
});

describe("BuildCollaborationModerationSheet", () => {
  test("requires and submits an accountable moderation reason", async () => {
    mocks.moderate.mockResolvedValue("case-1");
    const onOpenChange = vi.fn();
    render(
      <BuildCollaborationModerationSheet
        buildId={"build-1" as never}
        entity={{
          entityId: "post-1" as never,
          entityKind: "post",
          expectedRevision: 3,
        }}
        onOpenChange={onOpenChange}
        open
        organizationId="org-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Moderate content" })
    );
    expect(mocks.moderate).not.toHaveBeenCalled();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Moderation reason" }),
      { target: { value: "Unsafe instruction" } }
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Moderate content" })
    );

    await waitFor(() =>
      expect(mocks.moderate).toHaveBeenCalledWith({
        buildId: "build-1",
        entityId: "post-1",
        entityKind: "post",
        expectedRevision: 3,
        organizationId: "org-1",
        reason: "Unsafe instruction",
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("lets the author appeal and shows a permission-safe case history", async () => {
    mocks.context = {
      canAppeal: true,
      canModerate: false,
      canResolveAppeal: false,
      caseId: "case-1",
      currentReason: "Policy conflict",
      events: [
        {
          actorRole: "homeowner",
          createdAt: Date.parse("2026-07-30T12:00:00.000Z"),
          eventType: "moderated",
          reason: "Policy conflict",
        },
      ],
      status: "moderated",
    };
    mocks.appeal.mockResolvedValue("case-1");
    render(
      <BuildCollaborationModerationSheet
        buildId={"build-1" as never}
        entity={{
          entityId: "comment-1" as never,
          entityKind: "comment",
          expectedRevision: 1,
        }}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
      />
    );

    expect(screen.getByText("Content moderated")).toBeTruthy();
    expect(screen.getAllByText("Policy conflict")).toHaveLength(2);
    fireEvent.change(screen.getByRole("textbox", { name: "Appeal reason" }), {
      target: { value: "Required safety context" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit appeal" }));

    await waitFor(() =>
      expect(mocks.appeal).toHaveBeenCalledWith({
        buildId: "build-1",
        caseId: "case-1",
        organizationId: "org-1",
        reason: "Required safety context",
      })
    );
  });

  test("gives an eligible reviewer explicit restore and retain outcomes", async () => {
    mocks.context = {
      canAppeal: false,
      canModerate: false,
      canResolveAppeal: true,
      caseId: "case-1",
      currentReason: "Please restore",
      events: [],
      status: "appealed",
    };
    mocks.resolve.mockResolvedValue("case-1");
    const { rerender } = render(
      <BuildCollaborationModerationSheet
        buildId={"build-1" as never}
        entity={{
          entityId: "post-1" as never,
          entityKind: "post",
          expectedRevision: 1,
        }}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Decision reason" }), {
      target: { value: "Policy permits this context" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore content" }));
    await waitFor(() =>
      expect(mocks.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "restore",
          reason: "Policy permits this context",
        })
      )
    );

    mocks.resolve.mockClear();
    rerender(
      <BuildCollaborationModerationSheet
        buildId={"build-1" as never}
        entity={{
          entityId: "post-1" as never,
          entityKind: "post",
          expectedRevision: 1,
        }}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
      />
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Decision reason" }), {
      target: { value: "Policy breach remains" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retain moderation" })
    );
    await waitFor(() =>
      expect(mocks.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: "retain",
          reason: "Policy breach remains",
        })
      )
    );
  });
});
