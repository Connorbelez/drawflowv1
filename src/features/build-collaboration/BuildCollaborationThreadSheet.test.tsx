// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  context: undefined as Record<string, unknown> | undefined,
  expire: vi.fn(),
  reopen: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    if (functionName.endsWith("resolveBuildCollaborationThread")) {
      return mocks.resolve;
    }
    if (functionName.endsWith("reopenBuildCollaborationThread")) {
      return mocks.reopen;
    }
    return mocks.expire;
  },
  useQuery: () => mocks.context,
}));

import { BuildCollaborationThreadSheet } from "./BuildCollaborationThreadSheet";

afterEach(() => {
  cleanup();
  mocks.context = undefined;
  mocks.expire.mockReset();
  mocks.reopen.mockReset();
  mocks.resolve.mockReset();
});

describe("BuildCollaborationThreadSheet", () => {
  test("accepts a visible Question reply through the explicit outcome flow", async () => {
    mocks.context = {
      answerOptions: [
        {
          authorDisplayName: "Maya Singh",
          commentId: "comment-1",
          plainText: "The revised engineer seal is acceptable.",
        },
      ],
      canManageAnnouncementExpiration: false,
      canReopen: false,
      canResolve: true,
      decisionRevisions: [],
      hasLinkedWork: false,
      participants: [],
      postType: "question",
      threadState: "open",
      updatedAt: 1200,
    };
    mocks.resolve.mockResolvedValue("post-1");
    render(
      <BuildCollaborationThreadSheet
        buildId={"build-1" as never}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
        postId={"post-1" as never}
      />
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Accepted answer" }));
    fireEvent.click(
      screen.getByRole("option", {
        name: /Maya Singh: The revised engineer seal is acceptable/,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept answer" }));

    await waitFor(() =>
      expect(mocks.resolve).toHaveBeenCalledWith({
        acceptedCommentId: "comment-1",
        buildId: "build-1",
        expectedUpdatedAt: 1200,
        organizationId: "org-1",
        postId: "post-1",
      })
    );
  });

  test("shows immutable Decision history and submits an accountable reopen reason", async () => {
    mocks.context = {
      answerOptions: [],
      canManageAnnouncementExpiration: false,
      canReopen: true,
      canResolve: false,
      decisionOutcome: "Use the revised membrane.",
      decisionOwnerWorkosUserId: "owner-1",
      decisionRevisions: [
        {
          changedByRole: "broker",
          changedByWorkosUserId: "broker-1",
          createdAt: Date.UTC(2026, 6, 30, 12, 0),
          outcome: "Use the revised membrane.",
          ownerDisplayNameSnapshot: "Maya Singh",
          ownerWorkosUserId: "owner-1",
          reason: "Consultant review complete.",
          revision: 2,
        },
      ],
      hasLinkedWork: false,
      participants: [
        {
          displayName: "Maya Singh",
          role: "builder-staff",
          workosUserId: "owner-1",
        },
      ],
      postType: "decision",
      resolvedAt: Date.UTC(2026, 6, 30, 12, 0),
      threadState: "resolved",
      updatedAt: 2400,
    };
    mocks.reopen.mockResolvedValue("post-1");
    render(
      <BuildCollaborationThreadSheet
        buildId={"build-1" as never}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
        postId={"post-1" as never}
      />
    );

    expect(screen.getByText("Decision outcome history")).toBeTruthy();
    expect(screen.getByText("Revision 2")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Reopening reason" }),
      {
        target: { value: "Consultant issued a superseding specification." },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Reopen thread" }));

    await waitFor(() =>
      expect(mocks.reopen).toHaveBeenCalledWith({
        buildId: "build-1",
        expectedUpdatedAt: 2400,
        organizationId: "org-1",
        postId: "post-1",
        reason: "Consultant issued a superseding specification.",
      })
    );
  });

  test("sets Announcement prominence expiration without removing the post", async () => {
    mocks.context = {
      answerOptions: [],
      canManageAnnouncementExpiration: true,
      canReopen: false,
      canResolve: true,
      decisionRevisions: [],
      hasLinkedWork: false,
      participants: [],
      postType: "announcement",
      threadState: "open",
      updatedAt: 3600,
    };
    mocks.expire.mockResolvedValue("post-1");
    render(
      <BuildCollaborationThreadSheet
        buildId={"build-1" as never}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
        postId={"post-1" as never}
      />
    );

    fireEvent.change(
      screen.getByLabelText("Prominent until"),
      { target: { value: "2026-07-31T09:30" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Save expiration" }));

    await waitFor(() =>
      expect(mocks.expire).toHaveBeenCalledWith({
        buildId: "build-1",
        expectedUpdatedAt: 3600,
        expiresAt: new Date("2026-07-31T09:30").getTime(),
        organizationId: "org-1",
        postId: "post-1",
      })
    );
  });
});
