// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => convexMock.mutation),
  useQuery: vi.fn((...args) => convexMock.query(...args)),
}));

vi.mock("#/components/ui/alert-dialog.tsx", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogClose: ({
    children,
    render,
    ...props
  }: {
    children: ReactNode;
    render: ReactElement;
  }) => cloneElement(render, props, children),
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => (
    <h4>{children}</h4>
  ),
  AlertDialogTrigger: ({
    children,
    render,
    ...props
  }: {
    children: ReactNode;
    render: ReactElement;
  }) => cloneElement(render, props, children),
}));

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    ariaLabel,
    onChange,
    value,
  }: {
    ariaLabel: string;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  ),
  FieldRichTextPreview: ({
    ariaLabel,
    value,
  }: {
    ariaLabel: string;
    value: string | { content?: Array<{ content?: Array<{ text?: string }> }> };
  }) => (
    <div aria-label={ariaLabel}>
      {typeof value === "string"
        ? value
        : value.content
            ?.flatMap((node) => node.content ?? [])
            .map((node) => node.text ?? "")
            .join("")}
    </div>
  ),
}));

import { QuoteFieldLedger } from "./QuoteFieldLedger.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  convexMock.mutation.mockReset();
  convexMock.mutation.mockResolvedValue({
    draft: { version: 1 },
    status: "saved",
  });
  convexMock.query.mockReset();
  convexMock.query.mockReturnValue(undefined);
});

describe("QuoteFieldLedger", () => {
  test("renders one continuous ledger with canonical issued scope and autosaves a meaningful line edit", async () => {
    vi.useFakeTimers();
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    expect(
      screen.getByRole("navigation", { name: "Field Ledger sections" })
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Labour" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Materials" })).toBeTruthy();
    expect(screen.getByText("Review your Field Ledger")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review quote" })).toBeTruthy();

    fireEvent.click(
      screen.getAllByText("View issued scope and specifications")[0]!
    );
    expect(screen.getByText("Issued footings scope")).toBeTruthy();
    expect(screen.getByText(/Delivery: North gate/)).toBeTruthy();

    fireEvent.change(
      screen.getByLabelText("Quoted amount for Foundation · Footings"),
      { target: { value: "125000" } }
    );
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(convexMock.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 0,
        quoteRoundInvitationId: "quote-invitation-1",
        sessionToken: "browser-session-token",
      })
    );
  });

  test("preserves a recoverable stale-write state without leaving response controls editable", async () => {
    vi.useFakeTimers();
    convexMock.mutation.mockResolvedValueOnce({
      draft: { version: 2 },
      status: "conflict",
    });
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    const amount = screen.getByLabelText(
      "Quoted amount for Foundation · Footings"
    ) as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "100" } });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText("A newer Field Ledger version exists")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep my local changes" })).toBeTruthy();
    expect(amount.disabled).toBe(true);
  });

  test("keeps the exact local base when typing begins before a saved draft arrives", async () => {
    vi.useFakeTimers();
    const access = fieldLedgerAccess();
    let browserDraft: unknown;
    convexMock.query.mockImplementation((_, args) =>
      args === "skip" ? undefined : browserDraft
    );
    convexMock.mutation.mockResolvedValueOnce({
      draft: { version: 1 },
      status: "conflict",
    });
    const { rerender } = render(
      <QuoteFieldLedger
        access={access}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    fireEvent.change(
      screen.getByLabelText("Quoted amount for Foundation · Footings"),
      { target: { value: "100" } }
    );
    browserDraft = {
      access,
      draft: {
        answeredFieldCount: 0,
        attachmentCount: 0,
        attachments: [],
        completedPricingLineCount: 1,
        createdAt: Date.now(),
        lineItems: [],
        responses: [],
        updatedAt: Date.now(),
        version: 1,
      },
      status: "available",
    };
    rerender(
      <QuoteFieldLedger
        access={access}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(convexMock.mutation).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 0 })
    );
    expect(
      screen.getByText("A newer Field Ledger version exists")
    ).toBeTruthy();
  });

  test("keeps a newer local edit ahead of an in-flight patch after conflict", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: unknown) => void;
    convexMock.mutation
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ draft: { version: 3 }, status: "saved" });
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );
    const amount = screen.getByLabelText(
      "Quoted amount for Foundation · Footings"
    );
    fireEvent.change(amount, { target: { value: "100" } });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    fireEvent.change(amount, { target: { value: "200" } });
    await act(async () => {
      resolveFirst({ draft: { version: 2 }, status: "conflict" });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Keep my local changes" })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(convexMock.mutation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expectedVersion: 2,
        patch: expect.objectContaining({
          linePatches: [expect.objectContaining({ quotedAmountCents: 20_000 })],
        }),
      })
    );
  });

  test("preserves an explicit comments clear while merging pending edits", async () => {
    vi.useFakeTimers();
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );
    const comments = screen.getByLabelText("Additional quote comments");
    fireEvent.change(comments, { target: { value: "Temporary exclusion" } });
    fireEvent.change(comments, { target: { value: "" } });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(convexMock.mutation).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({ commentsHtml: null }),
      })
    );
  });

  test("flushes pending edits on pagehide and unmount before the 550ms debounce elapses", async () => {
    vi.useFakeTimers();
    const pagehideRender = render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );
    fireEvent.change(
      screen.getByLabelText("Quoted amount for Foundation · Footings"),
      { target: { value: "100" } }
    );
    await act(async () => {
      fireEvent(window, new Event("pagehide"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(convexMock.mutation).toHaveBeenCalledTimes(1);
    pagehideRender.unmount();

    convexMock.mutation.mockClear();
    const unmountRender = render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );
    fireEvent.change(
      screen.getByLabelText("Quoted amount for Foundation · Footings"),
      { target: { value: "200" } }
    );
    unmountRender.unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(convexMock.mutation).toHaveBeenCalledTimes(1);
  });

  test("refreshes a passive browser tab at each ordered access boundary", async () => {
    vi.useFakeTimers();
    const responseDeadline = Date.now() + 100;
    const sessionExpiresAt = Date.now() + 200;
    convexMock.query.mockImplementation((_, args) => {
      if (args === "skip") {
        return undefined;
      }
      return args.presentationNow >= sessionExpiresAt
        ? { status: "unavailable" }
        : undefined;
    });
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess({ responseDeadline, sessionExpiresAt })}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    await act(async () => {
      vi.advanceTimersByTime(101);
      await Promise.resolve();
    });

    expect(screen.getByText("Response window closed")).toBeTruthy();
    expect(screen.getByText("Foundation · Footings")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });

    expect(screen.getByText("Field Ledger access interrupted")).toBeTruthy();
    expect(screen.queryByText("Foundation · Footings")).toBeNull();
  });

  test("requires an explicit confirmation before submitting the current draft", async () => {
    const lifecycleRead = {
      currentSubmission: null,
      draft: { version: 4 },
      eligibility: { canRevise: false, canSubmit: true, canWithdraw: false },
      revisions: [],
      status: "available",
    } as const;
    convexMock.query.mockImplementation((_, args) => {
      if (args === "skip" || "presentationNow" in args) {
        return undefined;
      }
      return lifecycleRead;
    });
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit quote" }));

    expect(screen.getByText("Submit this quote revision?")).toBeTruthy();
    expect(
      screen.getByText(/server will recalculate the final total/i)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  });

  test("submits only the server draft version and a retry-safe idempotency key", async () => {
    const access = fieldLedgerAccess();
    const draftRead = {
      access,
      draft: {
        answers: [],
        attachments: [],
        commentsHtml: undefined,
        lines: [],
        version: 4,
      },
      status: "available",
    } as const;
    const lifecycleRead = {
      currentSubmission: null,
      draft: { version: 4 },
      eligibility: { canRevise: false, canSubmit: true, canWithdraw: false },
      revisions: [],
      status: "available",
    } as const;
    convexMock.mutation.mockResolvedValue({
      idempotentReplay: false,
      status: "accepted",
      submission: { revision: 1 },
    });
    convexMock.query.mockImplementation((_, args) => {
      if (args === "skip") {
        return undefined;
      }
      if ("presentationNow" in args) {
        return draftRead;
      }
      return lifecycleRead;
    });
    render(
      <QuoteFieldLedger
        access={access}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit quote" }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm submit quote" })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(convexMock.mutation).toHaveBeenCalledWith({
      expectedDraftVersion: 4,
      idempotencyKey: expect.stringMatching(/^quote-response:/),
      quoteRoundInvitationId: "quote-invitation-1",
      sessionToken: "browser-session-token",
    });
  });

  test("keeps an accepted revision authoritative while a revision draft is prepared", () => {
    const lifecycleRead = {
      currentSubmission: {
        attachments: [],
        canonicalTotalCents: 125_000,
        lineItems: [],
        responses: [],
        revision: 2,
        sourceDraftVersion: 2,
        status: "active",
        submittedAt: Date.now() - 5_000,
      },
      draft: { version: 3 },
      eligibility: { canRevise: false, canSubmit: true, canWithdraw: true },
      revisions: [
        {
          canonicalTotalCents: 100_000,
          revision: 1,
          status: "superseded",
          submittedAt: Date.now() - 10_000,
          supersededByRevision: 2,
        },
      ],
      status: "available",
    } as const;
    convexMock.query.mockImplementation((_, args) => {
      if (args === "skip" || "presentationNow" in args) {
        return undefined;
      }
      return lifecycleRead;
    });
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    expect(screen.getByText("Revision 2 is still authoritative")).toBeTruthy();
    expect(screen.getByText("Superseded by revision 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resubmit quote" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Withdraw quote" })).toBeTruthy();
  });

  test("renders the accepted immutable revision read-only until Revise quote seeds a draft", () => {
    const submitted = {
      attachments: [],
      canonicalTotalCents: 125_000,
      lineItems: [
        {
          lineKey: "labour:labour-line-1",
          quotedAmountCents: 125_000,
          scope: "labour",
          source: "package_labour",
          sourcePackageRevisionLabourLineId: "labour-line-1",
          title: "Foundation · Footings",
        },
      ],
      responses: [],
      revision: 1,
      sourceDraftVersion: 4,
      status: "active",
      submittedAt: Date.now() - 5_000,
    } as const;
    const lifecycleRead = {
      currentSubmission: submitted,
      draft: null,
      eligibility: { canRevise: true, canSubmit: false, canWithdraw: true },
      revisions: [submitted],
      status: "available",
    } as const;
    convexMock.query.mockImplementation((_, args) =>
      args === "skip" || "presentationNow" in args
        ? undefined
        : lifecycleRead
    );
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    const amount = screen.getByLabelText(
      "Quoted amount for Foundation · Footings"
    ) as HTMLInputElement;
    expect(amount.value).toBe("1250.00");
    expect(amount.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Revise quote" })).toBeTruthy();
  });

  test("offers a new revision after withdrawal without deleting immutable history", () => {
    const withdrawnAt = Date.now() - 1_000;
    const withdrawnSubmission = {
      attachments: [],
      canonicalTotalCents: 125_000,
      lineItems: [],
      responses: [],
      revision: 2,
      sourceDraftVersion: 2,
      status: "withdrawn",
      submittedAt: Date.now() - 5_000,
      withdrawnAt,
    } as const;
    const lifecycleRead = {
      currentSubmission: withdrawnSubmission,
      draft: null,
      eligibility: { canRevise: true, canSubmit: false, canWithdraw: false },
      revisions: [withdrawnSubmission],
      status: "available",
    } as const;
    convexMock.query.mockImplementation((_, args) => {
      if (args === "skip" || "presentationNow" in args) {
        return undefined;
      }
      return lifecycleRead;
    });
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    expect(screen.getByText("Revision 2 withdrawn")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prepare a new quote" })).toBeTruthy();
  });

  test("uses the shared Frame primitive for each pricing table boundary", () => {
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess()}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    const labourPricing = screen.getByTestId("pricing-band-labour");
    expect(labourPricing.dataset.slot).toBe("frame");
    expect(
      labourPricing.querySelector('[data-slot="frame-panel"]')
    ).toBeTruthy();
  });

  test("makes every recipient control read-only at the response deadline", () => {
    render(
      <QuoteFieldLedger
        access={fieldLedgerAccess({ responseDeadline: Date.now() - 1 })}
        hasAuthenticatedUser={false}
        sessionToken="browser-session-token"
      />
    );

    expect(screen.getByText("Response window closed")).toBeTruthy();
    expect(
      (
        screen.getByLabelText(
          "Quoted amount for Foundation · Footings"
        ) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(
      (screen.getByLabelText("Attach supporting response file") as HTMLInputElement)
        .disabled
    ).toBe(true);
  });

  test("removes stale claimed content when claimed recipient access is revoked", () => {
    convexMock.query.mockImplementation((_, args) =>
      args === "skip" ? undefined : { status: "unavailable" }
    );
    render(
      <QuoteFieldLedger access={fieldLedgerAccess()} hasAuthenticatedUser />
    );

    expect(screen.getByText("Field Ledger access interrupted")).toBeTruthy();
    expect(screen.queryByText("Foundation · Footings")).toBeNull();
  });
});

function fieldLedgerAccess({
  responseDeadline = Date.now() + 60 * 60 * 1000,
  sessionExpiresAt,
}: {
  responseDeadline?: number;
  sessionExpiresAt?: number;
} = {}) {
  return {
    accessExpiresAt: responseDeadline + 60 * 60 * 1000,
    invitationId: "quote-invitation-1",
    issuerName: "FairLend",
    package: {
      attachments: [
        {
          fileName: "Issued permit.pdf",
          kind: "permit",
          mimeType: "application/pdf",
          sizeBytes: 2_000,
          sourceAttachmentId: "package-attachment-1",
        },
      ],
      labourLines: [
        {
          durationDays: 4,
          milestoneName: "Foundation",
          scopeOfWorkTiptapJson: JSON.stringify({
            content: [
              { content: [{ text: "Issued footings scope", type: "text" }], type: "paragraph" },
            ],
            type: "doc",
          }),
          sourceLineId: "labour-line-1",
          startDay: 2,
          submilestoneName: "Footings",
        },
      ],
      materialLines: [
        {
          deliveryEndDay: 8,
          deliveryInstructions: "Call before delivery.",
          deliveryLocation: "North gate",
          deliveryStartDay: 6,
          quantity: 12,
          sourceLineId: "material-line-1",
          specificationTiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  { text: "Issued concrete specification", type: "text" },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
          title: "Concrete mix",
          unit: "m3",
        },
      ],
      responseDeadline,
      responseFields: [
        {
          fieldKey: "site-conditions",
          kind: "short_text",
          label: "Site conditions",
          renderer: "input",
          required: true,
          scope: "whole_quote",
          sourceFieldId: "response-field-1",
        },
        {
          fieldKey: "material-allowance",
          kind: "priced_line",
          label: "Material allowance",
          renderer: "input",
          required: false,
          scope: "materials",
          sourceFieldId: "response-field-2",
        },
      ],
      revision: 2,
      siteAddress: "147 Cedar Ridge Road, Toronto, ON",
      siteMapUrl: "https://maps.example.test/project",
      timelineCurrentDay: 12,
      timelineRangeMax: 180,
      timelineRangeMin: 0,
      timelineStartDate: "2026-08-03",
    },
    recipientName: "Northstar Concrete",
    roundState: "open",
    sessionExpiresAt,
  } as Parameters<typeof QuoteFieldLedger>[0]["access"];
}
