// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { QuoteRoundComparisonSurface } from "./QuoteRoundComparisonSurface.tsx";

const queryByRef = new Map<string, unknown>();
const mutationByRef = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    mutationByRef.get(getFunctionName(ref)),
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    queryByRef.get(getFunctionName(ref)),
}));

const candidate = (suffix: string, total: number) => ({
  answers: [
    {
      fieldKey: "earliest_start",
      kind: "date",
      label: "Earliest available start",
      scope: "whole_quote",
      sourcePackageRevisionResponseFieldId: `answer-field-${suffix}`,
      supportsTax: false,
      tax: null,
      value: "2026-09-15",
    },
  ],
  attachments: [
    {
      _id: `attachment-${suffix}`,
      createdAt: 100,
      fileName: `commercial-${suffix}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 2048,
      storageId: `storage-${suffix}`,
    },
  ],
  commentsHtml: `Commercial note ${suffix}`,
  expandedScopeLines: [
    {
      _id: `expanded-${suffix}`,
      lineKey: `expanded:alternate-${suffix}`,
      quotedAmountCents: 25_000,
      scope: "labour",
      source: "expanded_scope",
      title: `Alternate ${suffix}`,
    },
  ],
  history: [
    {
      canonicalTotalCents: total,
      revision: 1,
      status: "active",
      submittedAt: 200,
    },
  ],
  invitation: {
    _id: `invitation-${suffix}`,
    recipientCapabilitiesSnapshot: ["contractor", "supplier"],
    recipientEmailSnapshot: `${suffix}@example.com`,
    recipientNameSnapshot: `Recipient ${suffix}`,
    recipientProfileId: `recipient-${suffix}`,
  },
  labourLines: [
    {
      _id: `labour-${suffix}`,
      lineKey: `labour:${suffix}`,
      quotedAmountCents: 8_000_000,
      scope: "labour",
      source: "package_labour",
      sourcePackageRevisionLabourLineId: `package-labour-${suffix}`,
      title: "Framing · Frame exterior walls",
    },
  ],
  materialLines: [
    {
      _id: `material-${suffix}`,
      lineKey: `material:${suffix}`,
      quotedAmountCents: total - 8_025_000,
      scope: "materials",
      source: "package_material",
      sourcePackageRevisionMaterialLineId: `package-material-${suffix}`,
      title: "Framing lumber",
    },
  ],
  submission: {
    _id: `submission-${suffix}`,
    canonicalTotalCents: total,
    quotePackageRevisionId: "package-1",
    revision: 1,
    sourceDraftVersion: 1,
    status: "active",
    submittedAt: 200,
  },
  totals: {
    canonicalTotalCents: total,
    expandedScopeCents: 25_000,
    labourCents: 8_000_000,
    materialsCents: total - 8_025_000,
    templatePricedCents: 0,
  },
});

const invitation = (suffix: string) => ({
  _id: `invitation-${suffix}`,
  access: {
    active: 1,
    expired: 0,
    revoked: 0,
    rotated: 0,
    total: 1,
  },
  communication: {
    attemptCount: 1,
    cooldownUntil: undefined,
    history: [
      {
        createdAt: 150,
        detail: "Delivered",
        kind: "quote_invitation_initial",
        status: "delivered",
      },
    ],
    invitationId: `invitation-${suffix}`,
    latestOutcomeAt: 150,
    latestStatus: "delivered",
    recoveryState: "healthy",
    reminderEligible: false,
  },
  currentPackageRevisionId: "package-1",
  hasCurrentSubmission: true,
  originalPackageRevisionId: "package-1",
  participationState: "active",
  recipientCapabilitiesSnapshot: ["contractor", "supplier"],
  recipientEmailSnapshot: `${suffix}@example.com`,
  recipientNameSnapshot: `Recipient ${suffix}`,
  recipientProfileId: `recipient-${suffix}`,
});

const comparison = {
  candidates: [candidate("Northline", 12_525_000), candidate("Lakefront", 12_800_000)],
  canClearPreferred: false,
  canSetPreferred: true,
  invitations: [invitation("Northline"), invitation("Lakefront")],
  package: {
    _id: "package-1",
    attachments: [],
    labourLines: [],
    materialLines: [],
    permitDocumentId: "permit-1",
    permitDocumentVersion: 1,
    responseDeadline: 2_000_000_000_000,
    responseFields: [],
    revision: 2,
    roadmapSnapshotFingerprint: "roadmap-fingerprint",
    siteAddressSnapshot: "147 Cedar Ridge Road, Toronto, ON",
    siteMapUrlSnapshot: "https://maps.example.test/build",
    timelineStartDateSnapshot: "2026-08-01",
  },
  preferred: null,
  round: {
    _id: "round-1",
    mode: "combined",
    revision: 4,
    state: "open",
    title: "Framing bid",
    updatedAt: 300,
  },
  stateVersion: 0,
  status: "available",
} as const;

describe("QuoteRoundComparisonSurface", () => {
  beforeEach(() => {
    queryByRef.clear();
    mutationByRef.clear();
    queryByRef.set(
      getFunctionName(api.quote_comparisons.getQuoteRoundComparison),
      comparison
    );
    mutationByRef.set(
      getFunctionName(
        api.quote_comparisons.setPreferredQuoteSubmissionRevision
      ),
      vi.fn().mockResolvedValue({
        idempotentReplay: false,
        preferred: null,
        stateVersion: 1,
        status: "selected",
      })
    );
    mutationByRef.set(
      getFunctionName(
        api.quote_comparisons.clearPreferredQuoteSubmissionRevision
      ),
      vi.fn().mockResolvedValue({
        preferred: null,
        stateVersion: 1,
        status: "cleared",
      })
    );
  });

  afterEach(() => cleanup());

  test("renders a responsive immutable multi-response comparison and selects the exact submission revision", async () => {
    const setPreferred = mutationByRef.get(
      getFunctionName(
        api.quote_comparisons.setPreferredQuoteSubmissionRevision
      )
    );
    const { container } = render(
      <QuoteRoundComparisonSurface
        buildId="build-1"
        onExit={vi.fn()}
        organizationId="org-1"
        quoteRoundId="round-1"
      />
    );

    expect(screen.getByText("Framing bid")).toBeTruthy();
    expect(screen.getByText("Package Revision 2", { exact: false })).toBeTruthy();
    expect(screen.getByText("2 current submissions")).toBeTruthy();
    expect(screen.getAllByText("Labour lines")).toHaveLength(2);
    expect(screen.getAllByText("Material lines")).toHaveLength(2);
    expect(screen.getByText("Alternate Northline")).toBeTruthy();
    expect(screen.getAllByText("Earliest available start")).toHaveLength(2);
    expect(screen.getByText("Commercial note Northline")).toBeTruthy();
    expect(screen.getByText("commercial-Northline.pdf")).toBeTruthy();
    expect(container.querySelector(".xl\\:grid-cols-2")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Select Recipient Northline as Preferred Quote",
      })
    );
    await waitFor(() =>
      expect(setPreferred).toHaveBeenCalledWith({
        buildId: "build-1",
        expectedStateVersion: 0,
        quoteRoundId: "round-1",
        reason:
          "Builder selected a Preferred Quote from the normalized comparison.",
        submissionRevisionId: "submission-Northline",
        workosOrganizationId: "org-1",
      })
    );
  });

  test("disables every Preferred control while one mutation is pending", async () => {
    let resolveSelection!: (value: {
      idempotentReplay: boolean;
      preferred: null;
      stateVersion: number;
      status: "selected";
    }) => void;
    const setPreferred = vi.fn(
      () =>
        new Promise<{
          idempotentReplay: boolean;
          preferred: null;
          stateVersion: number;
          status: "selected";
        }>((resolve) => {
          resolveSelection = resolve;
        })
    );
    mutationByRef.set(
      getFunctionName(
        api.quote_comparisons.setPreferredQuoteSubmissionRevision
      ),
      setPreferred
    );
    queryByRef.set(
      getFunctionName(api.quote_comparisons.getQuoteRoundComparison),
      {
        ...comparison,
        canClearPreferred: true,
        preferred: {
          quotePackageRevisionId: "package-1",
          quoteRoundInvitationId: "invitation-Northline",
          selectedAt: 250,
          selectedByWorkosUserId: "builder-1",
          submissionRevision: 1,
          submissionRevisionId: "submission-Northline",
        },
        stateVersion: 1,
      }
    );

    render(
      <QuoteRoundComparisonSurface
        buildId="build-1"
        onExit={vi.fn()}
        organizationId="org-1"
        quoteRoundId="round-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Select Recipient Lakefront as Preferred Quote",
      })
    );
    await waitFor(() => expect(setPreferred).toHaveBeenCalledTimes(1));
    const lakefrontButton = screen.getByRole("button", {
      name: "Select Recipient Lakefront as Preferred Quote",
    }) as HTMLButtonElement;
    expect(lakefrontButton.disabled).toBe(true);
    expect(
      (screen.getByRole("button", {
        name: "Preferred Quote selected from Recipient Northline",
      }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole("button", {
        name: "Clear Preferred",
      }) as HTMLButtonElement).disabled
    ).toBe(true);

    resolveSelection({
      idempotentReplay: false,
      preferred: null,
      stateVersion: 2,
      status: "selected",
    });
    await waitFor(() => expect(lakefrontButton.disabled).toBe(false));
  });

  test("keeps the canonical comparison inspectable but mutation-free in read-only mode", () => {
    queryByRef.set(
      getFunctionName(api.quote_comparisons.getQuoteRoundComparison),
      {
        ...comparison,
        canClearPreferred: true,
        preferred: {
          quotePackageRevisionId: "package-1",
          quoteRoundInvitationId: "invitation-Northline",
          selectedAt: 250,
          selectedByWorkosUserId: "builder-1",
          submissionRevision: 1,
          submissionRevisionId: "submission-Northline",
        },
        stateVersion: 1,
      }
    );

    render(
      <QuoteRoundComparisonSurface
        buildId="build-1"
        onExit={vi.fn()}
        organizationId="org-1"
        quoteRoundId="round-1"
        readOnly
      />
    );

    expect(screen.getByText("Read-only view")).toBeTruthy();
    expect(screen.getAllByText("Preferred Quote").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Recipient Northline")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Select .* Preferred Quote/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear Preferred" })).toBeNull();
  });

  test("lets a Builder explicitly clear a stale Preferred pointer", async () => {
    queryByRef.set(
      getFunctionName(api.quote_comparisons.getQuoteRoundComparison),
      {
        ...comparison,
        canClearPreferred: true,
        stateVersion: 1,
      }
    );
    const clearPreferred = mutationByRef.get(
      getFunctionName(
        api.quote_comparisons.clearPreferredQuoteSubmissionRevision
      )
    );

    render(
      <QuoteRoundComparisonSurface
        buildId="build-1"
        onExit={vi.fn()}
        organizationId="org-1"
        quoteRoundId="round-1"
      />
    );

    expect(
      screen.getByText(/stored Preferred Quote is no longer an active/i)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear Preferred" }));
    expect(screen.getByText("Confirm clearing this selection?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    await waitFor(() =>
      expect(clearPreferred).toHaveBeenCalledWith({
        buildId: "build-1",
        confirmed: true,
        expectedStateVersion: 1,
        quoteRoundId: "round-1",
        reason:
          "Builder cleared the Preferred Quote during commercial review.",
        workosOrganizationId: "org-1",
      })
    );
  });

  test("renders an honest empty state without projecting a recipient Draft", () => {
    queryByRef.set(
      getFunctionName(api.quote_comparisons.getQuoteRoundComparison),
      {
        ...comparison,
        candidates: [],
        canSetPreferred: false,
      }
    );

    render(
      <QuoteRoundComparisonSurface
        buildId="build-1"
        onExit={vi.fn()}
        organizationId="org-1"
        quoteRoundId="round-1"
      />
    );

    expect(screen.getByText("0 current submissions")).toBeTruthy();
    expect(
      screen.getByText(
        "No active immutable submissions yet. Recipient Drafts remain private until submitted."
      )
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain(
      "Private recipient Draft wording"
    );
  });

  test("keeps a single normalized response fully inspectable", () => {
    queryByRef.set(
      getFunctionName(api.quote_comparisons.getQuoteRoundComparison),
      {
        ...comparison,
        candidates: [comparison.candidates[0]],
      }
    );

    render(
      <QuoteRoundComparisonSurface
        buildId="build-1"
        onExit={vi.fn()}
        organizationId="org-1"
        quoteRoundId="round-1"
      />
    );

    expect(screen.getByText("1 current submissions")).toBeTruthy();
    expect(screen.getAllByText("Recipient Northline")).toHaveLength(2);
    expect(
      screen.queryByRole("button", {
        name: "Select Recipient Lakefront as Preferred Quote",
      })
    ).toBeNull();
    expect(screen.getByText("commercial-Northline.pdf")).toBeTruthy();
  });
});
