// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const runSearchAction = vi.hoisted(() => vi.fn());

const mocks = vi.hoisted(() => ({
  lastArgs: undefined as Record<string, unknown> | "skip" | undefined,
  nextResponse: {
    continueCursor: null,
    isDone: true,
    page: [] as Array<Record<string, unknown>>,
  },
  response: {
    continueCursor: null,
    isDone: true,
    page: [] as Array<Record<string, unknown>>,
  },
  search: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useAction: () => runSearchAction,
}));

import {
  BuildCollaborationSearch,
  type BuildCollaborationSearchResult,
  searchRequestFilters,
} from "./BuildCollaborationSearch.tsx";

const result = {
  audienceMode: "build_wide",
  authorDisplayName: "Alex Chen",
  authorWorkosUserId: "user-builder",
  commentId: "comment-1",
  createdAt: Date.parse("2026-07-28T12:00:00.000Z"),
  excerpt: "The engineer seal is ready for lender review.",
  hasAttachments: true,
  href: "/builder/builds/build-1?tab=collaboration&focus=comment%3Acomment-1",
  id: "comment-1",
  matchKind: "semantic",
  postId: "post-1",
  resolutionState: "open",
  resultType: "comment",
  score: 12,
  status: "active",
  title: "Reply by Alex Chen",
  updatedAt: Date.parse("2026-07-28T13:00:00.000Z"),
} satisfies BuildCollaborationSearchResult;

const participants = [
  {
    entityKind: "participant" as const,
    eyebrow: "Builder",
    href: "/builder/builds/build-1?focus=participant%3Auser-builder",
    id: "user-builder",
    kind: "participant" as const,
    label: "Alex Chen",
    summary: "Builder principal",
  },
];

beforeEach(() => {
  runSearchAction.mockImplementation(async (args: Record<string, unknown>) => {
    mocks.lastArgs = args;
    mocks.search(args);
    return args.cursor ? mocks.nextResponse : mocks.response;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mocks.lastArgs = undefined;
  mocks.nextResponse = { continueCursor: null, isDone: true, page: [] };
  mocks.response = { continueCursor: null, isDone: true, page: [] };
  mocks.search.mockClear();
  runSearchAction.mockReset();
});

describe("BuildCollaborationSearch", () => {
  test("queries the authorized Build corpus and opens the exact returned deep link", async () => {
    mocks.response = {
      continueCursor: null,
      isDone: true,
      page: [result],
    };
    const onOpen = vi.fn();
    render(
      <BuildCollaborationSearch
        buildId={"build-1" as never}
        onOpen={onOpen}
        organizationId="org-1"
        participants={participants}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search all authorized Build collaboration",
      }),
      { target: { value: "foundation inspection" } },
    );
    await screen.findByText("Related");
    expect(mocks.lastArgs).toMatchObject({
      buildId: "build-1",
      limit: 50,
      organizationId: "org-1",
      query: "foundation inspection",
      searchMode: "hybrid",
    });
    expect(screen.getByText("Authorized Build results")).toBeTruthy();
    expect(screen.getByText("Related")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: `Open ${result.title}` }),
    );
    expect(onOpen).toHaveBeenCalledWith(result);
  });

  test("continues a stable server cursor and appends the next authorized page", async () => {
    mocks.response = {
      continueCursor: "cursor-page-2",
      isDone: false,
      page: [result],
    };
    mocks.nextResponse = {
      continueCursor: null,
      isDone: true,
      page: [
        {
          ...result,
          commentId: "comment-2",
          id: "comment-2",
          title: "Reply by Priya Raman",
        },
      ],
    };
    render(
      <BuildCollaborationSearch
        buildId={"build-1" as never}
        onOpen={vi.fn()}
        organizationId="org-1"
        participants={participants}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search all authorized Build collaboration",
      }),
      { target: { value: "foundation" } },
    );
    const loadMore = await screen.findByRole("button", {
      name: "Load more results",
    });
    fireEvent.click(loadMore);

    await screen.findByRole("button", { name: "Open Reply by Priya Raman" });
    expect(mocks.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-page-2" }),
    );
    expect(screen.getByText("2 shown")).toBeTruthy();
  });

  test("exposes and serializes every supported server filter", () => {
    render(
      <BuildCollaborationSearch
        buildId={"build-1" as never}
        onOpen={vi.fn()}
        organizationId="org-1"
        participants={participants}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    for (const label of [
      "Record type",
      "Author",
      "Assignee",
      "Referenced entity",
      "Status",
      "Audience",
      "Resolution",
      "Attachments",
    ]) {
      expect(screen.getByRole("combobox", { name: label })).toBeTruthy();
    }
    expect(screen.getByLabelText("Search created from")).toBeTruthy();
    expect(screen.getByLabelText("Search created to")).toBeTruthy();

    expect(
      searchRequestFilters({
        assignee: "user-builder",
        attachmentPresence: "with",
        audience: "author_tier_and_higher",
        author: "user-builder",
        createdFrom: "2026-07-01",
        createdTo: "2026-07-31",
        entity: "siteVisit",
        resolution: "open",
        status: "blocked",
        type: "actionItem",
      }),
    ).toEqual({
      assigneeWorkosUserIds: ["user-builder"],
      attachmentPresence: "with",
      audienceModes: ["author_tier_and_higher"],
      authorWorkosUserIds: ["user-builder"],
      createdFrom: new Date("2026-07-01T00:00:00.000").getTime(),
      createdTo: new Date("2026-07-31T23:59:59.999").getTime(),
      entityKinds: ["siteVisit"],
      resolutionStates: ["open"],
      statuses: ["blocked"],
      types: ["actionItem"],
    });
  });
});
