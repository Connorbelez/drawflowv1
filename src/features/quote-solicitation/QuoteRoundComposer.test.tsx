// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  QuoteRoundComposer,
  type QuoteRoundComposerActions,
  type QuoteRoundComposerData,
  type QuoteRoundDetail,
} from "./QuoteRoundComposer.tsx";

vi.mock("#/components/rich-text/field-rich-text.tsx", () => ({
  FieldRichTextEditor: ({
    ariaLabel,
    onChange,
    onDocumentChange,
    value,
  }: {
    ariaLabel: string;
    onChange: (value: string) => void;
    onDocumentChange?: (
      document: { content: unknown[]; type: string },
      html: string
    ) => void;
    value: string | { content?: unknown[]; type?: string };
  }) => (
    <textarea
      aria-label={ariaLabel}
      onChange={(event) => {
        const html = event.target.value;
        onChange(html);
        onDocumentChange?.(
          {
            content: [
              {
                content: [{ text: html, type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          },
          html
        );
      }}
      value={typeof value === "string" ? value : JSON.stringify(value)}
    />
  ),
  FieldRichTextPreview: ({
    ariaLabel,
    value,
  }: {
    ariaLabel: string;
    value: string | { content?: unknown[]; type?: string };
  }) => (
    <div aria-label={ariaLabel}>
      {typeof value === "string" ? value : JSON.stringify(value)}
    </div>
  ),
}));

const tiptapScope = JSON.stringify({
  content: [
    {
      content: [{ text: "Protect the installed work from weather.", type: "text" }],
      type: "paragraph",
    },
  ],
  type: "doc",
});

const data: QuoteRoundComposerData = {
  build: {
    _id: "build-1",
    buildName: "Harbourview Rowhomes",
    location: "112 Bay Street, Toronto",
    startDate: "2026-08-01",
  },
  compatibleRecipients: [
    {
      capabilities: ["contractor", "supplier"],
      contractorProfileId: "recipient-both",
      displayName: "Northline Build Supply",
      email: "pricing@northline.example",
      recipientKey: "recipient-both",
    },
    {
      capabilities: ["contractor"],
      contractorProfileId: "recipient-contractor",
      displayName: "Lakefront Framing",
      email: "bids@lakefront.example",
      recipientKey: "recipient-contractor",
    },
    {
      capabilities: ["supplier"],
      contractorProfileId: "recipient-supplier",
      displayName: "Toronto Materials",
      email: "quotes@torontomaterials.example",
      recipientKey: "recipient-supplier",
    },
  ],
  labourSubmilestones: [
    {
      _id: "labour-site-prep",
      budgetCents: 70_000,
      durationDays: 2,
      milestoneKey: "site-prep",
      milestoneName: "Site preparation",
      name: "Excavate service trench",
      order: 1,
      sourceScopeChangeReason: "Clarified excavation quantities.",
      sourceScopeRevisionId: "scope-site-prep-v2",
      sourceScopeVersion: 2,
      scopeOfWorkTiptapJson: tiptapScope,
      startDay: 3,
      submilestoneKey: "excavate-service-trench",
    },
    {
      _id: "labour-framing",
      budgetCents: 190_000,
      durationDays: 5,
      milestoneKey: "framing",
      milestoneName: "Framing",
      name: "Install roof trusses",
      order: 9,
      sourceScopeRevisionId: "scope-framing-v1",
      sourceScopeVersion: 1,
      scopeOfWorkTiptapJson: tiptapScope,
      startDay: 22,
      submilestoneKey: "install-roof-trusses",
    },
    {
      _id: "labour-envelope",
      budgetCents: 85_000,
      durationDays: 3,
      milestoneKey: "envelope",
      milestoneName: "Envelope",
      name: "Install weather barrier",
      order: 17,
      sourceScopeRevisionId: "scope-envelope-v1",
      sourceScopeVersion: 1,
      scopeOfWorkTiptapJson: tiptapScope,
      startDay: 37,
      submilestoneKey: "install-weather-barrier",
    },
  ],
  materialCostItems: [
    {
      _id: "material-weather-barrier",
      deliveryEndDay: 38,
      deliveryInstructions: "Call the site lead before unloading.",
      deliveryLocation: "North staging area",
      deliveryStartDay: 36,
      description: "Weather barrier and fastening package.",
      milestoneKey: "envelope",
      quantity: 80,
      relevantSubmilestoneKeys: ["install-weather-barrier"],
      specificationTiptapJson: tiptapScope,
      title: "Weather barrier rolls",
      unit: "roll",
    },
  ],
  permit: {
    fileName: "building-permit-v2.pdf",
    mimeType: "application/pdf",
    version: 2,
  },
  responseTemplates: [
    {
      audience: "either",
      description: "The published v1 trade response contract.",
      fields: [
        {
          fieldKey: "scope-notes",
          kind: "long_text",
          label: "Scope notes",
          required: true,
          richTextDefaultHtml: "<p>State alternates and exclusions.</p>",
          scope: "whole_quote",
        },
      ],
      name: "Trade response",
      templateId: "template-trade-response",
      version: 1,
      versionId: "template-version-1",
    },
  ],
};

function completeRound(): QuoteRoundDetail {
  return {
    draft: {
      labourLines: [
        {
          buildSubmilestoneId: "labour-site-prep",
          scopeOfWorkTiptapJson: tiptapScope.replace(
            "Protect the installed work from weather.",
            "Pinned excavation scope."
          ),
          sourceScopeChangeReason: "Initial issued excavation scope.",
          sourceScopeRevisionId: "scope-site-prep-v1",
          sourceScopeVersion: 1,
        },
        {
          buildSubmilestoneId: "labour-envelope",
          scopeOfWorkTiptapJson: tiptapScope,
          sourceScopeRevisionId: "scope-envelope-v1",
          sourceScopeVersion: 1,
        },
      ],
      labourSubmilestoneIds: ["labour-site-prep", "labour-envelope"],
      materialRows: [
        {
          assignedSubmilestoneIds: ["labour-envelope"],
          rowKey: "build-cost:material-weather-barrier",
          source: "build_cost_item",
          sourceBuildCostItemId: "material-weather-barrier",
        },
      ],
      recipients: [
        {
          contractorProfileId: "recipient-both",
          recipientKey: "recipient-both",
        },
      ],
      responseDeadline: "2026-09-14T14:30",
      revision: 3,
      scopeUpdateAvailable: true,
      templateVersionId: "template-version-1",
      title: "Envelope completion pricing",
    },
    mode: "mixed",
    quoteRoundId: "quote-round-1",
    state: "draft",
    title: "Envelope completion pricing",
  };
}

function actions(overrides: Partial<QuoteRoundComposerActions> = {}) {
  return {
    onExit: vi.fn(),
    onPublish: vi.fn().mockResolvedValue({
      idempotentReplay: false,
      invitationCount: 1,
      invitationIds: ["invitation-1"],
      packageRevisionId: "package-revision-1",
      packageRevisionNumber: 1,
      quoteRoundId: "quote-round-1",
      responseDeadline: Date.parse("2026-09-14T14:30:00"),
      state: "open",
    }),
    onRefreshScope: vi.fn().mockResolvedValue({
      quoteRoundId: "quote-round-1",
      refreshedLineCount: 2,
      revision: 4,
      state: "draft",
    }),
    onSave: vi.fn().mockResolvedValue({ revision: 4 }),
    ...overrides,
  } satisfies QuoteRoundComposerActions;
}

function renderComposer(input?: {
  actions?: QuoteRoundComposerActions;
  round?: QuoteRoundDetail;
}) {
  return render(
    <QuoteRoundComposer
      actions={input?.actions ?? actions()}
      data={data}
      round={input?.round ?? completeRound()}
    />
  );
}

afterEach(cleanup);

describe("QuoteRoundComposer", () => {
  test("keeps selected Scope pinned until an explicit refresh and identifies its source version", async () => {
    const onRefresh = vi.fn();
    const onRefreshScope = vi.fn().mockResolvedValue({
      quoteRoundId: "quote-round-1",
      refreshedLineCount: 2,
      revision: 4,
      state: "draft",
    });
    renderComposer({
      actions: actions({ onRefresh, onRefreshScope }),
    });

    expect(screen.getByText("Update available")).toBeTruthy();
    expect(screen.getAllByText("Scope v1").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh selected Scope" })
    );

    await waitFor(() => {
      expect(onRefreshScope).toHaveBeenCalledWith({ expectedRevision: 3 });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
  });

  test("falls back to canonical Scope fields when a pinned line omits optional snapshots", async () => {
    const round = completeRound();
    round.draft = {
      ...round.draft!,
      labourLines: [{ buildSubmilestoneId: "labour-site-prep" }],
    };

    renderComposer({ round });

    expect(screen.getAllByText("Scope v2").length).toBeGreaterThan(0);
    fireEvent.focus(
      screen.getByRole("button", {
        name: "Inspect schedule and specification for Excavate service trench",
      })
    );
    await waitFor(() =>
      expect(screen.getByText("Clarified excavation quantities.")).toBeTruthy()
    );
  });

  test("keeps the five-step publisher, persistent selection counts, and individual non-contiguous labour pricing lines", async () => {
    const { container } = renderComposer();

    const mobileSteps = screen.getByTestId("quote-mobile-steps");
    expect(mobileSteps.textContent).toContain("1. Scope");
    expect(mobileSteps.textContent).toContain("2. Package");
    expect(mobileSteps.textContent).toContain("3. Recipients");
    expect(mobileSteps.textContent).toContain("4. Response");
    expect(mobileSteps.textContent).toContain("5. Dispatch");
    expect(screen.getAllByText("Excavate service trench").length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText("Install weather barrier").length).toBeGreaterThan(
      0
    );
    expect(
      screen.getAllByText(
        "Individual sub-milestones remain individual pricing lines, including non-contiguous work."
      ).length
    ).toBe(3);
    expect(
      screen
        .getByTestId("quote-round-composer")
        .getAttribute("data-responsive-layout")
    ).toBe("scope-lock");
    expect(screen.getByLabelText("Quote Round title").className).toContain(
      "min-h-11"
    );

    const labourCount = screen.getByRole("button", {
      name: "2 selected labour items",
    });
    fireEvent.focus(labourCount);
    await waitFor(() =>
      expect(screen.getByTestId("labour-scope-tooltip")).toBeTruthy()
    );
    expect(screen.getByTestId("labour-scope-tooltip").textContent).toContain(
      "Construction days 3–4"
    );
    expect(
      container.querySelector("button button, button a, a button")
    ).toBeNull();
  });

  test("creates a typed ad-hoc material line, preserves TipTap JSON, and saves its reassignments", async () => {
    const onSave = vi.fn().mockResolvedValue({ revision: 4 });
    renderComposer({ actions: actions({ onSave }) });

    fireEvent.click(screen.getByRole("button", { name: "Materials" }));
    fireEvent.click(screen.getByRole("button", { name: "Add material" }));
    fireEvent.change(screen.getByLabelText("Material title"), {
      target: { value: "Temporary weather cover" },
    });
    fireEvent.change(screen.getByLabelText("Material quantity"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Delivery start day"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Delivery end day"), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByLabelText("Delivery location"), {
      target: { value: "South staging area" },
    });
    fireEvent.change(screen.getByLabelText("Delivery instructions"), {
      target: { value: "Deliver before noon." },
    });
    fireEvent.change(screen.getByLabelText("Supplier specification"), {
      target: { value: "Install without puncturing the vapour barrier." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Assign Excavate service trench" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save material scope" }));

    expect(screen.getAllByText("Temporary weather cover").length).toBeGreaterThan(
      0
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedDraft = onSave.mock.calls[0]?.[0];
    const adHocRow = savedDraft.materialRows.find(
      (row: { source: string }) => row.source === "ad_hoc"
    );
    expect(adHocRow).toMatchObject({
      assignedSubmilestoneIds: ["labour-site-prep"],
      deliveryEndDay: 14,
      deliveryLocation: "South staging area",
      deliveryStartDay: 12,
      quantity: 12,
      title: "Temporary weather cover",
    });
    expect(adHocRow.specificationTiptapJson).toContain(
      "Install without puncturing the vapour barrier."
    );
  });

  test("discloses compatible profile admission and the pinned TipTap response version", () => {
    renderComposer();

    const mobileSteps = screen.getByTestId("quote-mobile-steps");
    fireEvent.click(
      within(mobileSteps).getByRole("button", { name: "3. Recipients" })
    );
    expect(screen.getByText("Capability-compatible profile IDs")).toBeTruthy();
    expect(screen.getByText(/contractor \+ supplier capability/)).toBeTruthy();
    expect(screen.getAllByText("Northline Build Supply").length).toBeGreaterThan(
      0
    );

    fireEvent.click(
      within(mobileSteps).getByRole("button", { name: "4. Response" })
    );
    expect(screen.getByText("Trade response · Published v1")).toBeTruthy();
    expect(
      screen.getByLabelText("Scope notes published preview").textContent
    ).toContain("State alternates and exclusions.");
  });

  test("retries a stale draft save and publishes an idempotent receipt after the draft is current", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("Quote Round changed by another user"))
      .mockResolvedValue({ revision: 4 });
    const onPublish = vi.fn().mockResolvedValue({
      idempotentReplay: true,
      invitationCount: 1,
      invitationIds: ["invitation-1"],
      packageRevisionId: "package-revision-1",
      packageRevisionNumber: 1,
      quoteRoundId: "quote-round-1",
      responseDeadline: Date.parse("2026-09-14T14:30:00"),
      state: "open",
    });
    renderComposer({ actions: actions({ onPublish, onSave }) });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(screen.getByText("This draft changed elsewhere")).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));

    const mobileSteps = screen.getByTestId("quote-mobile-steps");
    fireEvent.click(
      within(mobileSteps).getByRole("button", { name: "5. Dispatch" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publish Quote Round" })
    );
    await waitFor(() =>
      expect(screen.getByTestId("quote-publish-receipt").textContent).toContain(
        "Quote Round open"
      )
    );
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        idempotencyKey: expect.stringMatching(/^quote-round:quote-round-1:publish:/),
      })
    );
  });
});
