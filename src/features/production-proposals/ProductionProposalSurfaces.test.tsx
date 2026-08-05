// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { toast } from "sonner";

import {
  ProductionProposalDraftEditorSurface,
  ProductionProposalKanbanSurface,
  ProductionProposalPackageSurface,
  ProductionProposalReviewSurface,
  ProductionProposalSettingsSurface,
  type ProductionProposalDetail,
  toTimelineRows,
} from "./ProductionProposalSurfaces";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const proposalDetail: ProductionProposalDetail = {
  documents: [
    {
      documentType: "permit",
      fileName: "permit.pdf",
      status: "uploaded",
      storageUrl: "https://example.com/permit.pdf",
    },
  ],
  draws: [
    {
      amountCents: 400_000_00,
      drawKey: "draw-01",
      label: "Foundation reimbursement draw",
      timingDay: 30,
    },
  ],
  milestones: [
    {
      budgetCents: 500_000_00,
      dayEnd: 30,
      dayStart: 0,
      key: "foundation",
      name: "Foundation",
      order: 1,
    },
  ],
  permitWaiver: null,
  proposal: {
    buildName: "Elm Street Build",
    borrowerCoPayBps: 2_000,
    borrowerStartingCashCents: 400_000_00,
    interestAnnualBps: 925,
    lenderDrawPolicyLimitCents: 550_000_00,
    location: "123 Elm Street",
    status: "draft",
    totalBudgetCents: 500_000_00,
  },
  submilestones: [
    {
      key: "forms",
      milestoneKey: "foundation",
      name: "Forms and pour",
    },
  ],
};

describe("ProductionProposalPackageSurface", () => {
  test("renders all proposal package sections with approved amount semantics", () => {
    render(
      <ProductionProposalPackageSurface
        detail={proposalDetail}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Proposal identity")).toBeTruthy();
    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByText("Budget and capital")).toBeTruthy();
    expect(screen.getByText("Template selection")).toBeTruthy();
    expect(screen.getByText("Milestone worksheet")).toBeTruthy();
    expect(screen.getByText("Draw schedule")).toBeTruthy();
    expect(screen.getByText("Readiness warnings")).toBeTruthy();
    expect(screen.getByText("Submit proposal")).toBeTruthy();
    expect(screen.getByText("Approved amount")).toBeTruthy();
    expect(screen.queryByText("Borrower Contribution")).toBeNull();
    expect(screen.getByTestId("build-permit-viewer-trigger")).toBeTruthy();
  });

});

describe("ProductionProposalDraftEditorSurface", () => {
  test("edits and saves draft identity, capital, milestone, and submit actions", () => {
    const onSave = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ProductionProposalDraftEditorSurface
        detail={proposalDetail}
        onSave={onSave}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Build name"), {
      target: { value: "Updated Elm Build" },
    });
    fireEvent.change(screen.getByLabelText("Build location"), {
      target: { value: "456 Updated Street" },
    });
    fireEvent.change(screen.getByLabelText("Approved amount cents"), {
      target: { value: "45000000" },
    });
    fireEvent.change(screen.getByLabelText("Foundation budget"), {
      target: { value: "60000000" },
    });
    fireEvent.click(screen.getByText("Save draft"));
    fireEvent.click(screen.getAllByText("Submit proposal")[0]!);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        borrowerCoPayBps: 2500,
        buildName: "Updated Elm Build",
        location: "456 Updated Street",
        milestones: [
          expect.objectContaining({
            budgetCents: 60_000_000,
            key: "foundation",
          }),
        ],
        draws: [
          expect.objectContaining({
            amountCents: 45_000_000,
            drawKey: "draw-01",
            milestoneKey: "foundation",
            timingDay: 30,
          }),
        ],
      }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("uploads a draft document and includes Convex storage metadata on save", async () => {
    const onSave = vi.fn();
    const onUploadDocument = vi
      .fn()
      .mockResolvedValue({ storageId: "storage_123" });
    const file = new File(["permit"], "permit.pdf", {
      type: "application/pdf",
    });

    render(
      <ProductionProposalDraftEditorSurface
        detail={{ ...proposalDetail, documents: [] }}
        onSave={onSave}
        onSubmit={vi.fn()}
        onUploadDocument={onUploadDocument}
      />,
    );

    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(onUploadDocument).toHaveBeenCalledWith(file));
    await screen.findByText("permit.pdf - permit");
    fireEvent.click(screen.getByText("Save draft"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        documents: [
          expect.objectContaining({
            documentType: "permit",
            fileName: "permit.pdf",
            mimeType: "application/pdf",
            sizeBytes: file.size,
            storageId: "storage_123",
          }),
        ],
      }),
    );
  });
});

describe("ProductionProposalKanbanSurface", () => {
  test("renders exactly draft, submitted, approved, and closed lanes", () => {
    render(
      <ProductionProposalKanbanSurface
        kanban={{
          columns: [
            { cards: [], id: "draft", name: "Draft" },
            { cards: [], id: "submitted", name: "Submitted" },
            { cards: [], id: "approved", name: "Approved" },
            { cards: [], id: "closed", name: "Closed" },
          ],
        }}
      />,
    );

    expect(screen.getAllByTestId("production-kanban-column")).toHaveLength(4);
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("Closed")).toBeTruthy();
  });

  function kanbanWithDraft(card: Record<string, unknown>) {
    return {
      columns: [
        {
          cards: [
            {
              column: "draft" as const,
              proposalId: "p1",
              subtitle: "Hamilton, ON",
              title: "Hamilton Infill",
              totalBudgetCents: 1_250_000_00,
              updatedAt: 0,
              ...card,
            },
          ],
          id: "draft" as const,
          name: "Draft",
        },
        { cards: [], id: "submitted" as const, name: "Submitted" },
        { cards: [], id: "approved" as const, name: "Approved" },
        { cards: [], id: "closed" as const, name: "Closed" },
      ],
    };
  }

  test("renders builder identity for assigned and unassigned cards", () => {
    const { rerender } = render(
      <ProductionProposalKanbanSurface
        kanban={kanbanWithDraft({
          builderAssigned: true,
          builderEmail: "owner@northline.example",
          builderName: "Northline Homes",
        })}
      />,
    );
    expect(screen.getByText("Northline Homes")).toBeTruthy();
    expect(screen.getByText("owner@northline.example")).toBeTruthy();
    expect(
      screen.queryByTestId("production-kanban-card-unassigned"),
    ).toBeNull();

    rerender(
      <ProductionProposalKanbanSurface
        kanban={kanbanWithDraft({
          builderAssigned: false,
          builderName: "Unassigned builder",
        })}
      />,
    );
    expect(
      screen.getByTestId("production-kanban-card-unassigned"),
    ).toBeTruthy();
  });

  test("left click opens the card", () => {
    const onOpen = vi.fn();
    render(
      <ProductionProposalKanbanSurface
        kanban={kanbanWithDraft({ builderAssigned: false })}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByTestId("production-kanban-card"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0]).toMatchObject({ proposalId: "p1" });
  });

  test("right click on an unassigned draft offers assign and delete", async () => {
    render(
      <ProductionProposalKanbanSurface
        builders={[{ _id: "b1", displayName: "Northline Homes" }]}
        kanban={kanbanWithDraft({ builderAssigned: false })}
        onAssignBuilder={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId("production-kanban-card"));
    await waitFor(() => {
      expect(screen.getByText("Assign builder")).toBeTruthy();
    });
    expect(screen.getByText("Delete draft")).toBeTruthy();
  });

  test("an assigned draft hides assign but still offers delete", async () => {
    render(
      <ProductionProposalKanbanSurface
        builders={[]}
        kanban={kanbanWithDraft({
          builderAssigned: true,
          builderName: "Northline Homes",
        })}
        onAssignBuilder={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId("production-kanban-card"));
    await waitFor(() => {
      expect(screen.getByText("Delete draft")).toBeTruthy();
    });
    expect(screen.queryByText("Assign builder")).toBeNull();
  });

  test("a non-draft card offers neither assign nor delete", async () => {
    render(
      <ProductionProposalKanbanSurface
        kanban={{
          columns: [
            { cards: [], id: "draft", name: "Draft" },
            {
              cards: [
                {
                  builderAssigned: true,
                  builderName: "Northline Homes",
                  column: "submitted",
                  proposalId: "p2",
                  title: "Submitted Build",
                  totalBudgetCents: 1_000_000_00,
                  updatedAt: 0,
                },
              ],
              id: "submitted",
              name: "Submitted",
            },
            { cards: [], id: "approved", name: "Approved" },
            { cards: [], id: "closed", name: "Closed" },
          ],
        }}
        onAssignBuilder={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId("production-kanban-card"));
    await waitFor(() => {
      expect(screen.getByText("Open")).toBeTruthy();
    });
    expect(screen.queryByText("Assign builder")).toBeNull();
    expect(screen.queryByText("Delete draft")).toBeNull();
  });

  test("assign dialog lists builders and guards the confirm button", async () => {
    const onAssignBuilder = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionProposalKanbanSurface
        builders={[
          { _id: "b1", displayName: "Northline Homes" },
          { _id: "b2", displayName: "Cedarpoint Builders" },
        ]}
        kanban={kanbanWithDraft({ builderAssigned: false })}
        onAssignBuilder={onAssignBuilder}
        onDeleteDraft={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId("production-kanban-card"));
    fireEvent.click(await screen.findByText("Assign builder"));

    expect(await screen.findByTestId("assign-builder-select")).toBeTruthy();
    const confirm = screen.getByTestId(
      "assign-builder-confirm",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(onAssignBuilder).not.toHaveBeenCalled();
  });

  test("assign dialog shows an empty state without active builders", async () => {
    render(
      <ProductionProposalKanbanSurface
        builders={[]}
        kanban={kanbanWithDraft({ builderAssigned: false })}
        onAssignBuilder={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId("production-kanban-card"));
    fireEvent.click(await screen.findByText("Assign builder"));
    expect(
      await screen.findByText(
        "No active builders are available in this brokerage yet.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByTestId("assign-builder-confirm") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  test("deleting a draft confirms through the alert dialog", async () => {
    const onDeleteDraft = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionProposalKanbanSurface
        kanban={kanbanWithDraft({ builderAssigned: false })}
        onDeleteDraft={onDeleteDraft}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId("production-kanban-card"));
    fireEvent.click(await screen.findByText("Delete draft"));
    fireEvent.click(await screen.findByTestId("delete-draft-confirm"));
    await waitFor(() => {
      expect(onDeleteDraft).toHaveBeenCalledTimes(1);
    });
    expect(onDeleteDraft.mock.calls[0][0]).toMatchObject({ proposalId: "p1" });
  });
});

describe("ProductionProposalSettingsSurface", () => {
  test("renders production template, archetype, scenario, and workflow counts", () => {
    const seed = vi.fn();
    render(
      <ProductionProposalSettingsSurface
        onSeed={seed}
        settings={{
          archetypes: [
            { key: "foundation", name: "Foundation", status: "active" },
          ],
          templates: [
            {
              milestones: [
                {
                  key: "foundation",
                  name: "Foundation",
                  percentageBps: 2_500,
                  submilestones: [{ key: "forms", name: "Forms and pour" }],
                },
              ],
              scenarios: [
                {
                  isDefault: true,
                  name: "Cheapest Feasible",
                  scenarioKey: "cheapest-feasible",
                },
              ],
              templateKey: "single-family-full-build",
              title: "Single Family Full Build",
            },
          ],
          workflowRules: [
            {
              allowPermitWaiverByRoles: ["admin", "principle-broker"],
              proposalStates: ["draft", "submitted", "approved", "closed"],
              requirePermitForApproval: true,
              ruleKey: "proposal-foundation-v1",
              settings: {
                interestStartsOn: "funds_released",
                reimbursementOnly: true,
              },
              version: 1,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Production proposal settings")).toBeTruthy();
    expect(screen.getByText("Single Family Full Build")).toBeTruthy();
    expect(
      screen.getByTestId("timeline-settings-template-blueprint-table"),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("Foundation")).toBeTruthy();
    expect(screen.getByDisplayValue("25.00% / 2500 bps")).toBeTruthy();
    expect(screen.getByText("Cheapest Feasible")).toBeTruthy();
    expect(screen.getByText("Interest starts on funds_released")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Seed defaults to prod" }),
    );
    expect(seed).toHaveBeenCalledTimes(1);
  });
});

describe("ProductionProposalReviewSurface", () => {
  test("calls out a generated draw schedule that exceeds packet availability", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          draws: [
            {
              amountCents: 300_000_00,
              drawKey: "draw-01",
              label: "Foundation reimbursement draw",
              order: 1,
              timingDay: 35,
            },
            {
              amountCents: 150_000_00,
              drawKey: "draw-02",
              label: "Framing reimbursement draw",
              order: 2,
              timingDay: 35,
            },
          ],
          milestones: [
            {
              ...proposalDetail.milestones?.[0],
              budgetCents: 500_000_00,
              dayEnd: 30,
              dayStart: 0,
              drawAvailabilityCents: 400_000_00,
              key: "foundation",
              name: "Foundation",
              order: 1,
            },
          ],
        }}
      />,
    );

    const warning = screen.getByTestId(
      "proposal-packet-draw-availability-warning",
    );
    expect(warning.textContent).toContain(
      "Generated draw schedule exceeds maximum availability",
    );
    expect(warning.textContent).toContain(
      "Framing reimbursement draw schedules $150,000 on day 35, but only $100,000 is unlocked",
    );
    expect(warning.textContent).toContain("5-day review lag");
    expect(warning.textContent).toContain("Reduce or move this draw by $50,000");
  });

  test("does not show a packet availability warning for a feasible schedule", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          draws: [
            {
              amountCents: 400_000_00,
              drawKey: "draw-01",
              label: "Foundation reimbursement draw",
              timingDay: 35,
            },
          ],
          milestones: [
            {
              ...proposalDetail.milestones?.[0],
              budgetCents: 500_000_00,
              dayEnd: 30,
              dayStart: 0,
              drawAvailabilityCents: 400_000_00,
              key: "foundation",
              name: "Foundation",
              order: 1,
            },
          ],
        }}
      />,
    );

    expect(
      screen.queryByTestId("proposal-packet-draw-availability-warning"),
    ).toBeNull();
  });

  test("union-merges review content into packet without duplicating packet summaries", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          assignment: {
            broker: {
              email: "river@fairlend.example",
              name: "River Han",
              workosUserId: "user_broker",
            },
            brokerage: {
              displayName: "FairLend Brokerage",
              workosOrganizationId: "org_fairlend",
            },
            builder: {
              _id: "builder_1",
              accounts: [
                {
                  email: "owner@northline.example",
                  name: "Avery North",
                  role: "owner",
                  workosUserId: "user_owner",
                },
                {
                  email: "site@northline.example",
                  name: "Sam Field",
                  role: "staff",
                  workosUserId: "user_staff",
                },
              ],
              displayName: "Northline Homes",
              ownerEmail: "owner@northline.example",
              status: "active",
            },
            builderAssigned: true,
          },
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    const packet = screen.getByTestId("production-proposal-packet-tab");
    const primaryColumn = within(packet).getByTestId(
      "proposal-review-primary-column"
    );
    const contextColumn = within(packet).getByTestId(
      "proposal-review-context-column"
    );

    expect(within(primaryColumn).getByText("Review decision")).toBeTruthy();
    expect(within(primaryColumn).getByText("Readiness")).toBeTruthy();
    expect(within(contextColumn).getByText("Review snapshot")).toBeTruthy();
    expect(within(contextColumn).getByText("Parties & assignment")).toBeTruthy();
    expect(within(packet).getByText("Northline Homes")).toBeTruthy();
    expect(within(packet).getByText("Avery North")).toBeTruthy();
    expect(within(packet).getByText("Sam Field")).toBeTruthy();
    expect(within(packet).getByText("Review snapshot")).toBeTruthy();
    expect(within(packet).getByText("Readiness")).toBeTruthy();

    expect(within(packet).getAllByText("Total budget")).toHaveLength(1);
    expect(within(packet).getAllByText("Borrower starting cash")).toHaveLength(
      1,
    );
    expect(
      within(packet).getAllByText("Permit PDF linked: permit.pdf")
    ).toHaveLength(1);
    expect(within(packet).queryByText("Build details")).toBeNull();
    expect(within(packet).queryByText("Documents")).toBeNull();

    expect(within(packet).getByText("Proposed start date")).toBeTruthy();
    expect(within(packet).getByText("Submilestones")).toBeTruthy();
    expect(within(packet).getByText("Interest trigger")).toBeTruthy();
    expect(within(packet).getByText("Reimbursement model")).toBeTruthy();
    expect(within(packet).getByText("Scheduled reimbursements")).toBeTruthy();
    expect(within(packet).getByText("Borrower Contribution")).toBeTruthy();
    expect(within(packet).getByText("Draw policy limit")).toBeTruthy();
    expect(within(packet).getByText("Funding gap")).toBeTruthy();
    expect(within(packet).getByText("Closing state")).toBeTruthy();
    expect(
      within(packet).getByText("Milestone and submilestone worksheet"),
    ).toBeTruthy();
    expect(within(packet).getByText("Draw schedule snapshot")).toBeTruthy();

    expect(screen.getByRole("tab", { name: "Review" })).toBeTruthy();
  });

  test("shows stage guidance instead of unusable lender controls for drafts", () => {
    render(
      <ProductionProposalReviewSurface
        detail={proposalDetail}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />
    );

    const packet = screen.getByTestId("production-proposal-packet-tab");

    expect(within(packet).getByText("Proposal status")).toBeTruthy();
    expect(
      within(packet).getByText(
        "Decision controls unlock after the builder submits this proposal for lender review."
      )
    ).toBeTruthy();
    expect(
      within(packet).queryByRole("button", { name: "Approve Proposal" })
    ).toBeNull();
    expect(within(packet).queryByLabelText("Decision reason")).toBeNull();
  });

  test("renders builder, broker, and brokerage identity on the review tab", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          assignment: {
            broker: {
              email: "river@fairlend.example",
              name: "River Han",
              workosUserId: "user_broker",
            },
            brokerage: {
              displayName: "FairLend Brokerage",
              legalName: "FairLend Brokerage LLC",
              workosOrganizationId: "org_fairlend",
            },
            builder: {
              _id: "builder_1",
              accounts: [
                {
                  email: "owner@northline.example",
                  name: "Avery North",
                  role: "owner",
                  workosUserId: "user_owner",
                },
                {
                  email: "site@northline.example",
                  name: "Sam Field",
                  role: "staff",
                  workosUserId: "user_staff",
                },
              ],
              displayName: "Northline Homes",
              ownerEmail: "owner@northline.example",
              status: "active",
            },
            builderAssigned: true,
          },
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    expect(screen.getByText("Parties & assignment")).toBeTruthy();
    expect(screen.getByText("Northline Homes")).toBeTruthy();
    expect(screen.getByText("Avery North")).toBeTruthy();
    expect(screen.getByText("Sam Field")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("Staff")).toBeTruthy();
    expect(screen.getByText("2 members")).toBeTruthy();
    expect(screen.getByText("River Han")).toBeTruthy();
    expect(screen.getByText("FairLend Brokerage")).toBeTruthy();
  });

  test("assigns an eligible broker from Parties & assignment with an audit reason", async () => {
    const onAssignBroker = vi.fn().mockResolvedValue({ operation: "assigned" });
    render(
      <ProductionProposalReviewSurface
        assignableBrokerages={[
          {
            brokerageId: "brokerage_1",
            brokerageName: "FairLend Brokerage",
            brokers: [
              {
                email: "river@fairlend.example",
                isPrincipal: false,
                name: "River Han",
                workosUserId: "user_broker",
              },
            ],
          },
        ]}
        detail={{
          ...proposalDetail,
          assignment: {
            broker: null,
            brokerage: {
              _id: "brokerage_1",
              displayName: "FairLend Brokerage",
            },
            builder: {
              _id: "builder_1",
              displayName: "Northline Homes",
              ownerEmail: "owner@northline.example",
              status: "active",
            },
            builderAssigned: true,
          },
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        initialActiveTab="review"
        onAssignBroker={onAssignBroker}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Assign broker for Northline Homes",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Broker"));
    fireEvent.click(
      await screen.findByRole("option", { name: /River Han/i }),
    );
    fireEvent.change(within(dialog).getByLabelText("Audit reason"), {
      target: {
        value: "Assign River to own underwriting and proposal review.",
      },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Assign Builder" }),
    );

    await waitFor(() =>
      expect(onAssignBroker).toHaveBeenCalledWith(
        "user_broker",
        "Assign River to own underwriting and proposal review.",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Broker assigned.");
  });

  test("exposes the uploaded permit viewer from review readiness", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText("Permit PDF linked: permit.pdf").length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByTestId("proposal-review-permit-viewer-trigger").length
    ).toBeGreaterThan(0);
  });

  test("records a permit waiver reason from review readiness on approval", async () => {
    const onApprove = vi.fn();

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          documents: [],
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        initialActiveTab="review"
        onApprove={onApprove}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "Approve with municipal follow-up" },
    });
    fireEvent.change(screen.getByLabelText("Audited permit waiver"), {
      target: {
        value: "Municipal permit follows closing under lender exception.",
      },
    });

    expect(
      screen.getAllByText(
        "Permit waiver reason ready to record on approval.",
      ).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("production-review-tab-approve-proposal"));

    await waitFor(() =>
      expect(onApprove).toHaveBeenCalledWith(
        "Approve with municipal follow-up",
        "Municipal permit follows closing under lender exception.",
      ),
    );
  });

  test("shows header budget totals and saves editable proposal terms before live build", async () => {
    let resolveApprovedAmountSave: () => void = () => {};
    const approvedAmountSave = new Promise<void>((resolve) => {
      resolveApprovedAmountSave = resolve;
    });
    const onUpdateApprovedAmount = vi.fn(() => approvedAmountSave);
    const onUpdateInterestRate = vi.fn().mockResolvedValue(undefined);

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          activeBuild: null,
          draws: [
            {
              ...proposalDetail.draws![0]!,
              amountCents: 80_000_500,
            },
          ],
          proposal: {
            ...proposalDetail.proposal,
            borrowerCoPayBps: 1_999,
            borrowerCoPayCents: 21_040_000,
            lenderDrawPolicyLimitCents: 75_997_600,
            status: "submitted",
            totalBudgetCents: 1_052_000_00,
          },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUpdateApprovedAmount={onUpdateApprovedAmount}
        onUpdateInterestRate={onUpdateInterestRate}
      />,
    );

    expect(screen.getAllByText("Total budget").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$1,052,000").length).toBeGreaterThan(0);
    expect(screen.getByText("Total approved")).toBeTruthy();
    expect(screen.getAllByText("$800,005").length).toBeGreaterThan(0);
    expect(screen.queryByText("Borrower Contribution amount")).toBeNull();
    expect(screen.getAllByText("Interest rate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9.25%").length).toBeGreaterThan(0);
    expect(
      screen
        .getByTestId("proposal-header-approved-amount-chip")
        .classList.contains("bg-background")
    ).toBe(true);
    expect(
      screen
        .getByTestId("proposal-header-interest-rate-chip")
        .classList.contains("bg-background")
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Total approved" }));
    const approvedAmountInput = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Total approved"]',
      );
      expect(input).toBeTruthy();
      return input!;
    });
    expect(approvedAmountInput.value).toBe("800005");
    fireEvent.change(approvedAmountInput, { target: { value: "873080" } });
    fireEvent.keyDown(approvedAmountInput, { key: "Enter" });

    expect(screen.getAllByText("$873,080").length).toBeGreaterThan(0);
    expect(screen.getByText("Saving")).toBeTruthy();
    await waitFor(() =>
      expect(onUpdateApprovedAmount).toHaveBeenCalledWith(87_308_000),
    );
    resolveApprovedAmountSave();
    await waitFor(() => expect(screen.queryByText("Saving")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Interest rate" }));
    const interestInput = await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Interest rate"]',
      );
      expect(input).toBeTruthy();
      return input!;
    });
    expect(interestInput.value).toBe("9.25");
    fireEvent.change(interestInput, { target: { value: "10.5" } });
    fireEvent.keyDown(interestInput, { key: "Enter" });

    await waitFor(() =>
      expect(onUpdateInterestRate).toHaveBeenCalledWith(1050),
    );
  });

  test("assigns an unassigned broker draft through builder autocomplete", async () => {
    const onAssignBuilder = vi.fn();
    render(
      <ProductionProposalReviewSurface
        builders={[
          {
            _id: "builder_northline",
            displayName: "Northline Homes",
            email: "owner@northline.example",
          },
          {
            _id: "builder_cedar",
            displayName: "Cedarpoint Builders",
            email: "ops@cedarpoint.example",
          },
        ]}
        detail={{
          ...proposalDetail,
          assignment: {
            broker: { name: "River Han", workosUserId: "user_broker" },
            brokerage: { displayName: "FairLend Brokerage" },
            builder: null,
            builderAssigned: false,
            initiatedFromBackoffice: true,
          },
          proposal: { ...proposalDetail.proposal, status: "draft" },
        }}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onAssignBuilder={onAssignBuilder}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Builder assignee" });
    fireEvent.click(input);
    expect(await screen.findByText("Northline Homes")).toBeTruthy();
    expect(screen.getByText("Cedarpoint Builders")).toBeTruthy();
    fireEvent.change(input, { target: { value: "northline" } });
    fireEvent.click(await screen.findByText("Northline Homes"));
    fireEvent.click(screen.getByRole("button", { name: "Link builder" }));

    await waitFor(() =>
      expect(onAssignBuilder).toHaveBeenCalledWith("builder_northline"),
    );
  });

  test("matches keyboard autocomplete selection to the builder entity", async () => {
    const onAssignBuilder = vi.fn();
    render(
      <ProductionProposalReviewSurface
        builders={[
          {
            _id: "builder_connor",
            displayName: "Connor Beleznay",
            email: "c.beleznay@humanfeedback.com",
          },
        ]}
        detail={{
          ...proposalDetail,
          assignment: {
            brokerage: { displayName: "FairLend Brokerage" },
            builder: null,
            builderAssigned: false,
          },
          proposal: { ...proposalDetail.proposal, status: "draft" },
        }}
        initialActiveTab="packet"
        onAssignBuilder={onAssignBuilder}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Builder assignee" });
    const linkButton = screen.getByRole("button", { name: "Link builder" });
    expect((linkButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(input);
    expect(await screen.findByText("Connor Beleznay")).toBeTruthy();
    expect(screen.getByText("c.beleznay@humanfeedback.com")).toBeTruthy();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect((input as HTMLInputElement).value).toBe(
      "Connor Beleznay (c.beleznay@humanfeedback.com)",
    );
    expect((linkButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(linkButton);
    await waitFor(() =>
      expect(onAssignBuilder).toHaveBeenCalledWith("builder_connor"),
    );
  });

  test("offers builder linking and onboarding for an unassigned submitted proposal", () => {
    const onOnboardBuilder = vi.fn();
    render(
      <ProductionProposalReviewSurface
        builders={[
          {
            _id: "builder_northline",
            displayName: "Northline Homes",
            email: "owner@northline.example",
          },
        ]}
        detail={{
          ...proposalDetail,
          assignment: {
            brokerage: { displayName: "FairLend Brokerage" },
            builder: null,
            builderAssigned: false,
          },
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onAssignBuilder={vi.fn()}
        onClose={vi.fn()}
        onOnboardBuilder={onOnboardBuilder}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    expect(screen.getByText("No builder attached")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Builder assignee" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Onboard new builder" }),
    );
    expect(onOnboardBuilder).toHaveBeenCalledTimes(1);
  });

  test("offers builder linking and onboarding for an unassigned approved proposal", () => {
    const onCreateClaimLink = vi.fn();
    const onOnboardBuilder = vi.fn();
    render(
      <ProductionProposalReviewSurface
        builders={[
          {
            _id: "builder_northline",
            displayName: "Northline Homes",
            email: "owner@northline.example",
          },
        ]}
        detail={{
          ...proposalDetail,
          assignment: {
            brokerage: { displayName: "FairLend Brokerage" },
            builder: null,
            builderAssigned: false,
          },
          proposal: { ...proposalDetail.proposal, status: "approved" },
        }}
        initialActiveTab="review"
        onAssignBuilder={vi.fn()}
        onCreateClaimLink={onCreateClaimLink}
        onOnboardBuilder={onOnboardBuilder}
      />,
    );

    expect(screen.getByText("No builder attached")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Builder assignee" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Create claim link" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Onboard new builder" }),
    );
    expect(onOnboardBuilder).toHaveBeenCalledTimes(1);
    expect(onCreateClaimLink).not.toHaveBeenCalled();
  });

  test("unassigns an assigned broker draft from the proposal detail panel", async () => {
    const onUnassignBuilder = vi.fn().mockResolvedValue(undefined);
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          assignment: {
            broker: { name: "River Han", workosUserId: "user_broker" },
            brokerage: { displayName: "FairLend Brokerage" },
            builder: {
              _id: "builder_northline",
              displayName: "Northline Homes",
              ownerEmail: "owner@northline.example",
            },
            builderAssigned: true,
            initiatedFromBackoffice: true,
          },
          proposal: { ...proposalDetail.proposal, status: "draft" },
        }}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUnassignBuilder={onUnassignBuilder}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unassign builder" }));

    await waitFor(() => expect(onUnassignBuilder).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Builder unassigned.");
  });

  test("creates and copies a builder claim link for an unassigned broker draft", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const onCreateClaimLink = vi.fn().mockResolvedValue({
      claimPath: "/proposal-claim/token_123",
      claimToken: "token_123",
      expiresAt: Date.UTC(2026, 5, 30, 12, 0, 0),
    });

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          assignment: {
            broker: { name: "River Han", workosUserId: "user_broker" },
            brokerage: { displayName: "FairLend Brokerage" },
            builder: null,
            builderAssigned: false,
            initiatedFromBackoffice: true,
          },
          proposal: { ...proposalDetail.proposal, status: "draft" },
        }}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onCreateClaimLink={onCreateClaimLink}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Create self-claim link" }),
    );

    await waitFor(() => expect(onCreateClaimLink).toHaveBeenCalledTimes(1));
    const linkInput = await screen.findByDisplayValue(
      /\/proposal-claim\/token_123/,
    );
    expect(linkInput).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/proposal-claim/token_123"),
    );
  });

  test("uses the packet tab as the default production review tab", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    const tablist = screen.getByRole("tablist", {
      name: /proposal workspace sections/i,
    });
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual([
      "Packet",
      "Timeline",
      "Milestones",
      "Calendar",
      "Review",
      "Draw schedule",
      "Materials",
    ]);
    expect(
      screen.getByRole("tab", { name: "Packet" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("Build, site, and loan summary")).toBeTruthy();
    expect(screen.queryByTestId("timeline-slot")).toBeNull();
    expect(screen.queryByText("Submit proposal")).toBeNull();
  });

  test("provides a compact, fully named stage picker with active lifecycle state", () => {
    const onChangeReviewTab = vi.fn();
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        onApprove={vi.fn()}
        onChangeReviewTab={onChangeReviewTab}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div>Timeline workspace</div>}
      />,
    );

    const picker = screen.getByLabelText("Proposal workspace stage");
    expect(
      within(picker)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Packet",
      "Timeline",
      "Milestones",
      "Calendar",
      "Review",
      "Draw schedule",
      "Materials",
    ]);
    expect(screen.getByText("Current stage")).toBeTruthy();
    expect(screen.getByTestId("proposal-compact-active-stage").textContent).toBe(
      "Packet",
    );
    expect(screen.getByText("Editing blocked while submitted")).toBeTruthy();

    fireEvent.change(picker, { target: { value: "calendar" } });

    expect(onChangeReviewTab).toHaveBeenCalledWith("calendar");
    expect(screen.getByTestId("proposal-compact-active-stage").textContent).toBe(
      "Calendar",
    );
  });

  test("reuses the milestone budget worksheet in the production milestones tab", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: {
            ...proposalDetail.proposal,
            status: "submitted",
          },
          submilestones: [
            {
              budgetCents: 12_500_00,
              durationDays: 2,
              key: "forms",
              milestoneKey: "foundation",
              name: "Forms and pour",
            },
          ],
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Milestones" }));

    expect(
      screen.getByTestId("production-proposal-milestones-tab"),
    ).toBeTruthy();
    expect(screen.getByTestId("timeline-setup-budget-screen")).toBeTruthy();
    expect(screen.getAllByText("Forms and pour").length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue("$12,500").length).toBeGreaterThan(0);
  });

  test("allows editing submilestone budget and duration in the milestones tab", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: {
            ...proposalDetail.proposal,
            status: "submitted",
          },
          submilestones: [
            {
              budgetCents: 12_500_00,
              durationDays: 2,
              key: "forms",
              milestoneKey: "foundation",
              name: "Forms and pour",
            },
          ],
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Milestones" }));

    const budgetInput = screen.getByTestId(
      "timeline-setup-submilestone-budget-forms",
    );
    const durationInput = screen.getByTestId(
      "timeline-setup-submilestone-duration-forms",
    );

    fireEvent.change(budgetInput, { target: { value: "$15,000" } });
    fireEvent.change(durationInput, { target: { value: "T4" } });

    expect((budgetInput as HTMLInputElement).value).toBe("$15,000");
    expect((durationInput as HTMLInputElement).value).toBe("4");
  });

  test("renders packet satellite context, closing financials, and grouped submilestones", () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "maps-key");

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          activeBuild: null,
          loanFacility: {
            interestAnnualBps: 975,
            principalCents: 550_000_00,
          },
          proposal: {
            ...proposalDetail.proposal,
            borrowerCoPayCents: 50_000_00,
            status: "submitted",
          },
          submilestones: [
            {
              budgetCents: 12_500_00,
              durationDays: 2,
              key: "forms",
              milestoneKey: "foundation",
              name: "Forms and pour",
              startDay: 4,
            },
          ],
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet" }));

    expect(screen.getByText("Build, site, and loan summary")).toBeTruthy();
    expect(screen.getByText("Closing financials")).toBeTruthy();
    expect(
      screen.getByText("Milestone and submilestone worksheet"),
    ).toBeTruthy();
    expect(screen.getByText("Forms and pour")).toBeTruthy();
    expect(screen.getByText("Day 4 to 6")).toBeTruthy();
    expect(screen.getByText("Borrower Contribution")).toBeTruthy();
    expect(screen.getByText("$50,000")).toBeTruthy();
    expect(screen.getByText("Scheduled reimbursements")).toBeTruthy();
    expect(screen.getAllByText("$400,000").length).toBeGreaterThan(0);
    expect(screen.getByText("Interest trigger")).toBeTruthy();
    expect(screen.getByText("Funds released")).toBeTruthy();

    const satellite = screen.getByAltText("Elm Street Build satellite view");
    const satelliteUrl = new URL(satellite.getAttribute("src") ?? "");
    expect(satelliteUrl.searchParams.get("center")).toBe("123 Elm Street");
    expect(satelliteUrl.searchParams.get("maptype")).toBe("satellite");
    expect(satelliteUrl.searchParams.get("key")).toBe("maps-key");
  });

  test("edits a backdated proposed start date from the packet summary", async () => {
    const onUpdateProposedStartDate = vi.fn().mockResolvedValue(undefined);

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: {
            ...proposalDetail.proposal,
            status: "submitted",
          },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUpdateProposedStartDate={onUpdateProposedStartDate}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit proposed start date" }),
    );
    fireEvent.change(screen.getByLabelText("Proposed start date"), {
      target: { value: "2024-11-18" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save proposed start date" }),
    );

    await waitFor(() =>
      expect(onUpdateProposedStartDate).toHaveBeenCalledWith("2024-11-18"),
    );
  });

  test("toggles packet worksheet windows between relative days and real dates", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: {
            ...proposalDetail.proposal,
            proposedStartDate: "2025-04-15",
            status: "submitted",
          },
          submilestones: [
            {
              budgetCents: 12_500_00,
              durationDays: 2,
              key: "forms",
              milestoneKey: "foundation",
              name: "Forms and pour",
              startDay: 4,
            },
          ],
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    expect(screen.getByText("Day 4 to 6")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Real dates" }));

    expect(screen.getByText("Apr 19, 2025 to Apr 21, 2025")).toBeTruthy();
    expect(screen.queryByText("Day 4 to 6")).toBeNull();
  });

  test("renders the packet permit upload field and uploads the selected permit", async () => {
    const onUploadPermitDocument = vi.fn().mockResolvedValue(undefined);
    const file = new File(["permit"], "issued-permit.pdf", {
      type: "application/pdf",
    });

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          documents: [],
          permitWaiver: null,
          proposal: {
            ...proposalDetail.proposal,
            status: "submitted",
          },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUploadPermitDocument={onUploadPermitDocument}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Packet" }));

    expect(screen.getByText("Permit packet")).toBeTruthy();
    expect(
      screen.getByText(
        "Permit PDF or audited waiver is required before approval.",
      ),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Select permit document"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload permit" }));

    await waitFor(() =>
      expect(onUploadPermitDocument).toHaveBeenCalledWith(file),
    );
  });

  test("edits packet milestone and submilestones inline", async () => {
    const onUpdatePacketMilestone = vi.fn().mockResolvedValue(undefined);

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: {
            ...proposalDetail.proposal,
            status: "submitted",
          },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUpdatePacketMilestone={onUpdatePacketMilestone}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Foundation packet row" }),
    );
    expect(screen.queryByText("Edit milestone packet")).toBeNull();

    fireEvent.change(screen.getByLabelText("Foundation scope"), {
      target: { value: "Permits, demo & foundation" },
    });
    fireEvent.change(
      screen.getByLabelText("Foundation submilestone 1 name"),
      {
        target: { value: "Forms, permits, and pour" },
      },
    );
    fireEvent.change(
      screen.getByLabelText("Foundation submilestone 1 start day"),
      {
        target: { value: "2" },
      },
    );
    const submilestoneEndDayInput = screen.getByLabelText(
      "Foundation submilestone 1 end day",
    );
    fireEvent.change(submilestoneEndDayInput, {
      target: { value: "" },
    });
    expect((submilestoneEndDayInput as HTMLInputElement).value).toBe("");
    fireEvent.change(submilestoneEndDayInput, {
      target: { value: "7" },
    });
    fireEvent.change(
      screen.getByLabelText("Foundation submilestone 1 budget"),
      {
        target: { value: "12000" },
      },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add submilestone to Foundation" }),
    );
    fireEvent.change(
      screen.getByLabelText("Name", {
        selector: "#packet-new-submilestone-name",
      }),
      { target: { value: "Tree protection" } },
    );
    fireEvent.change(screen.getByLabelText("End day"), {
      target: { value: "3" },
    });
    fireEvent.change(
      screen.getByLabelText("Budget dollars", {
        selector: "#packet-new-submilestone-budget",
      }),
      { target: { value: "910" } },
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add submilestone" }).at(-1)!,
    );

    expect(screen.getByText("Day 0 to 7")).toBeTruthy();
    expect(screen.getByText("$12,910")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Save Foundation packet row" }),
    );

    await waitFor(() =>
      expect(onUpdatePacketMilestone).toHaveBeenCalledWith("foundation", {
        budgetCents: 1_291_000,
        dayEnd: 7,
        dayStart: 0,
        durationDays: 7,
        name: "Permits, demo & foundation",
        submilestones: [
          {
            budgetCents: 1_200_000,
            durationDays: 5,
            key: "forms",
            name: "Forms, permits, and pour",
            order: 1,
            startDay: 2,
          },
          {
            budgetCents: 91_000,
            durationDays: 3,
            key: "tree-protection",
            name: "Tree protection",
            order: 2,
            startDay: 0,
          },
        ],
      }),
    );
  });

  test("packet submilestone window cell opens a range picker and commits the rebuilt patch", async () => {
    const onUpdatePacketMilestone = vi.fn().mockResolvedValue(undefined);

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          milestones: [
            {
              budgetCents: 500_000_00,
              dayEnd: 30,
              dayStart: 0,
              key: "foundation",
              name: "Foundation",
              order: 1,
            },
          ],
          submilestones: [
            {
              budgetCents: 250_000_00,
              durationDays: 30,
              key: "forms",
              milestoneKey: "foundation",
              name: "Forms and pour",
              order: 1,
              startDay: 0,
            },
          ],
          proposal: {
            ...proposalDetail.proposal,
            proposedStartDate: "2026-06-01",
            status: "submitted",
          },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUpdatePacketMilestone={onUpdatePacketMilestone}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(
      screen.getByTestId("packet-submilestone-window-foundation-forms"),
    );

    // Arm the end node and move it to 2026-06-10 (day 9); start stays day 0.
    fireEvent.click(
      screen.getByTestId(
        "packet-submilestone-window-foundation-forms-end-node",
      ),
    );
    const endButton = document.querySelector(
      '[data-day="2026-06-10"] button',
    ) as HTMLButtonElement;
    fireEvent.click(endButton);

    fireEvent.click(screen.getByRole("button", { name: /done/i }));

    await waitFor(() =>
      expect(onUpdatePacketMilestone).toHaveBeenCalledWith("foundation", {
        budgetCents: 500_000_00,
        // Milestone window recomputed from the single submilestone: 0..9.
        dayEnd: 9,
        dayStart: 0,
        durationDays: 9,
        name: "Foundation",
        submilestones: [
          {
            budgetCents: 250_000_00,
            durationDays: 9,
            key: "forms",
            name: "Forms and pour",
            order: 1,
            startDay: 0,
          },
        ],
      }),
    );
  });

  test("creates a packet milestone from the add milestone sheet", async () => {
    const onCreatePacketMilestone = vi.fn().mockResolvedValue(undefined);

    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: {
            ...proposalDetail.proposal,
            status: "submitted",
          },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onCreatePacketMilestone={onCreatePacketMilestone}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add milestone" }));
    expect(screen.getAllByText("Add milestone").length).toBeGreaterThan(1);

    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "Rough-ins" },
    });
    fireEvent.change(screen.getByLabelText("Start day"), {
      target: { value: "31" },
    });
    fireEvent.change(screen.getByLabelText("End day"), {
      target: { value: "52" },
    });
    fireEvent.change(screen.getByLabelText("Budget dollars"), {
      target: { value: "99605" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save milestone" }));

    await waitFor(() =>
      expect(onCreatePacketMilestone).toHaveBeenCalledWith({
        budgetCents: 9_960_500,
        dayEnd: 52,
        dayStart: 31,
        dependencyKeys: [],
        drawAvailabilityCents: 9_960_500,
        durationDays: 21,
        evidenceState: "Draft package",
        milestoneKey: "rough-ins",
        name: "Rough-ins",
        order: 2,
        policyState: "Draft policy review",
        submilestones: [],
        x: 31,
      }),
    );
  });

  test("renders contractor planning in its own review tab when provided", () => {
    render(
      <ProductionProposalReviewSurface
        contractors={
          <div data-testid="contractors-slot">Contractor planning</div>
        }
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        timeline={<div data-testid="timeline-slot">Timeline workspace</div>}
      />,
    );

    const tablist = screen.getByRole("tablist", {
      name: /proposal workspace sections/i,
    });
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual([
      "Packet",
      "Timeline",
      "Milestones",
      "Calendar",
      "Contractors",
      "Review",
      "Draw schedule",
      "Materials",
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "Contractors" }));
    expect(screen.getByTestId("contractors-slot")).toBeTruthy();
    expect(screen.queryByTestId("timeline-slot")).toBeNull();
  });

  test("shows approval without build creation and closing with future start date", () => {
    const onClose = vi.fn();
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          activeBuild: null,
          proposal: {
            ...proposalDetail.proposal,
            proposedStartDate: "2026-05-20",
            status: "approved",
          },
        }}
        initialActiveTab="review"
        onApprove={vi.fn()}
        onClose={onClose}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    expect(screen.getByTestId("approved-proposal-confirmation")).toBeTruthy();
    expect(screen.getByText("Proposal approved for closing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Closing" }));
    expect(screen.getByText("No active build created yet.")).toBeTruthy();
    const startDateInput = screen.getByLabelText(
      "Build start date"
    ) as HTMLInputElement;
    const timezoneInput = screen.getByLabelText(
      "Build timezone (IANA)"
    ) as HTMLInputElement;
    expect(startDateInput.getAttribute("type")).toBe("date");
    expect(startDateInput.value).toBe("2026-05-20");
    expect(timezoneInput.value).toBe("");
    expect(
      (screen.getByRole("button", {
        name: "Record closing",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(startDateInput, { target: { value: "2026-06-01" } });
    fireEvent.change(timezoneInput, {
      target: { value: "America/Toronto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record closing" }));

    expect(onClose).toHaveBeenCalledWith(
      "2026-06-01",
      "Loan closed offline.",
      "America/Toronto",
    );
  });

  test("reports missing decision reasons with toast before calling review mutations", () => {
    const onApprove = vi.fn();
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        onApprove={onApprove}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Review" }));
    const approveButton = screen.getByTestId(
      "production-review-tab-approve-proposal"
    );
    expect(approveButton.parentElement?.className).toContain("min-w-0");
    expect(approveButton.parentElement?.className).toContain("grid-cols-1");
    fireEvent.click(approveButton);

    expect(onApprove).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Decision reason required.",
      expect.objectContaining({
        description: expect.stringContaining("audit reason"),
      }),
    );
  });

  test("reports rejected review mutations with a concise toast error", async () => {
    const onApprove = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "5/29/2026, 4:33:49 PM [CONVEX M(production_proposals:approveProposal)] Uncaught Error: A reason is required.\n    at requireReason",
        ),
      );
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        onApprove={onApprove}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Review" }));
    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "Meets policy." },
    });
    fireEvent.click(screen.getByTestId("production-review-tab-approve-proposal"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("A reason is required.");
    });
  });

  test("omits lender-only decision controls from unauthorized review tabs", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          documents: [],
          permitWaiver: null,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        initialActiveTab="review"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Request Changes" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve Proposal" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Decision reason")).toBeNull();
    expect(screen.queryByLabelText("Audited permit waiver")).toBeNull();
  });

  test("omits backoffice draw editors from unauthorized draw schedule tabs", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        initialActiveTab="draws"
      />,
    );

    expect(screen.queryByLabelText("draw-01 label")).toBeNull();
    expect(screen.queryByLabelText("Amount dollars")).toBeNull();
    expect(screen.queryByLabelText("Change reason")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save draw row" })).toBeNull();
  });

  test("edits submitted draw schedule rows with an explicit review reason", () => {
    const onUpdateDraw = vi.fn();
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          proposal: { ...proposalDetail.proposal, status: "submitted" },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUpdateDraw={onUpdateDraw}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Draw schedule" }));
    const saveDrawRow = screen.getByText("Save draw row");
    expect(saveDrawRow.hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText("draw-01 label"), {
      target: { value: "Foundation verified reimbursement" },
    });
    expect(saveDrawRow.hasAttribute("disabled")).toBe(false);
    fireEvent.click(saveDrawRow);
    expect(onUpdateDraw).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Draw edit reason required.",
      expect.objectContaining({
        description: expect.stringContaining("change reason"),
      }),
    );
    fireEvent.change(screen.getByLabelText("Change reason"), {
      target: { value: "Adjusted after lender review." },
    });
    const amountInput = screen.getByLabelText(
      "Amount dollars",
    ) as HTMLInputElement;
    expect(amountInput.value).toBe("400000");
    fireEvent.change(amountInput, {
      target: { value: "$350,000.25" },
    });
    fireEvent.change(screen.getByLabelText("Timing day"), {
      target: { value: "28" },
    });
    fireEvent.click(saveDrawRow);

    expect(onUpdateDraw).toHaveBeenCalledWith("draw-01", {
      amountCents: 35_000_025,
      label: "Foundation verified reimbursement",
      reason: "Adjusted after lender review.",
      timingDay: 28,
    });
  });

  test("edits draft draw schedule rows without requiring an audit reason", () => {
    const onUpdateDraw = vi.fn();
    render(
      <ProductionProposalReviewSurface
        detail={proposalDetail}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
        onUpdateDraw={onUpdateDraw}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Draw schedule" }));
    const saveDrawRow = screen.getByText("Save draw row");
    fireEvent.change(screen.getByLabelText("draw-01 label"), {
      target: { value: "Draft foundation reimbursement" },
    });
    expect(saveDrawRow.hasAttribute("disabled")).toBe(false);
    fireEvent.click(saveDrawRow);

    expect(toast.error).not.toHaveBeenCalled();
    expect(onUpdateDraw).toHaveBeenCalledWith("draw-01", {
      amountCents: 40_000_000,
      label: "Draft foundation reimbursement",
      reason: "Draft draw schedule edit.",
      timingDay: 30,
    });
  });
});

describe("toTimelineRows", () => {
  test("keeps closed proposals without an active build assignment on proposal routes", () => {
    expect(
      toTimelineRows([
        {
          column: "closed",
          proposalId: "proposal-1",
          title: "Closed proposal",
          totalBudgetCents: 1_000_000,
          updatedAt: 123,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        buildKey: undefined,
        kind: "proposal",
        planId: "proposal-1",
        status: "approved",
        totalBudgetCents: 1_000_000,
      }),
    ]);
  });

  test("projects closed proposals with accessible build assignments as live builds", () => {
    expect(
      toTimelineRows([
        {
          activeBuildId: "active-build-1",
          buildName: "Materialized build",
          buildStatus: "active",
          builderName: "Northline Builders",
          column: "closed",
          drawCount: 3,
          location: "1200 Stone Road",
          milestoneCount: 4,
          milestonesBehindSchedule: 2,
          pendingDrawRequestCount: 1,
          proposalId: "proposal-1",
          title: "Assigned build",
          totalBudgetCents: 1_000_000,
          updatedAt: 123,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        buildKey: "active-build-1",
        buildName: "Materialized build",
        builderName: "Northline Builders",
        drawCount: 3,
        kind: "activeBuild",
        location: "1200 Stone Road",
        milestoneCount: 4,
        milestonesBehindSchedule: 2,
        pendingDrawRequestCount: 1,
        planId: "proposal-1",
        status: "approved",
      }),
    ]);
  });
});
