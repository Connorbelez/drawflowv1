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
import { toast } from "sonner";

import {
  ProductionProposalDraftEditorSurface,
  ProductionProposalKanbanSurface,
  ProductionProposalPackageSurface,
  ProductionProposalReviewSurface,
  ProductionProposalSettingsSurface,
  toTimelineRows,
} from "./ProductionProposalSurfaces";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const proposalDetail = {
  documents: [
    {
      documentType: "permit",
      fileName: "permit.pdf",
      status: "uploaded",
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
    borrowerWorkingCapitalLimitCents: 400_000_00,
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
  test("renders all proposal package sections and bps co-pay semantics", () => {
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
    expect(screen.getByText("20.00% / 2000 bps")).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Borrower co-pay bps"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByLabelText("Foundation budget"), {
      target: { value: "60000000" },
    });
    fireEvent.click(screen.getByText("Save draft"));
    fireEvent.click(screen.getByText("Submit proposal"));

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
          builderName: "Northline Homes",
        })}
      />,
    );
    expect(screen.getByText("Northline Homes")).toBeTruthy();
    expect(screen.queryByTestId("production-kanban-card-unassigned")).toBeNull();

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
                  submilestones: [
                    { key: "forms", name: "Forms and pour" },
                  ],
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
    expect(screen.getByTestId("timeline-settings-template-blueprint-table")).toBeTruthy();
    expect(screen.getByDisplayValue("Foundation")).toBeTruthy();
    expect(screen.getByDisplayValue("25.00% / 2500 bps")).toBeTruthy();
    expect(screen.getByText("Cheapest Feasible")).toBeTruthy();
    expect(screen.getByText("Interest starts on funds_released")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Seed defaults to prod" }));
    expect(seed).toHaveBeenCalledTimes(1);
  });
});

describe("ProductionProposalReviewSurface", () => {
  test("uses the existing timeline workspace as the default production review tab", () => {
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
    expect(within(tablist).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Timeline",
      "Review",
      "Draw schedule",
      "Packet",
    ]);
    expect(
      screen.getByRole("tab", { name: "Timeline" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    expect(screen.getByTestId("timeline-slot")).toBeTruthy();
    expect(screen.queryByText("Submit proposal")).toBeNull();
  });

  test("shows approval without build creation and closing with future start date", () => {
    render(
      <ProductionProposalReviewSurface
        detail={{
          ...proposalDetail,
          activeBuild: null,
          proposal: { ...proposalDetail.proposal, status: "approved" },
        }}
        onApprove={vi.fn()}
        onClose={vi.fn()}
        onReject={vi.fn()}
        onRequestChanges={vi.fn()}
      />,
    );

    expect(screen.getByTestId("approved-proposal-confirmation")).toBeTruthy();
    expect(screen.getByText("Proposal approved for closing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Closing" }));
    expect(screen.getByText("No active build created yet.")).toBeTruthy();
    expect(screen.getByLabelText("Build start date").getAttribute("type")).toBe(
      "date",
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
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onApprove).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Decision reason required.",
      expect.objectContaining({
        description: expect.stringContaining("audit reason"),
      }),
    );
  });

  test("reports rejected review mutations with a concise toast error", async () => {
    const onApprove = vi.fn().mockRejectedValue(
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
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("A reason is required.");
    });
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
    expect(screen.getByText("Save draw row").hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText("Change reason"), {
      target: { value: "Adjusted after lender review." },
    });
    fireEvent.change(screen.getByLabelText("draw-01 label"), {
      target: { value: "Foundation verified reimbursement" },
    });
    fireEvent.change(screen.getByLabelText("Amount cents"), {
      target: { value: "35000000" },
    });
    fireEvent.change(screen.getByLabelText("Timing day"), {
      target: { value: "28" },
    });
    fireEvent.click(screen.getByText("Save draw row"));

    expect(onUpdateDraw).toHaveBeenCalledWith("draw-01", {
      amountCents: 35_000_000,
      label: "Foundation verified reimbursement",
      reason: "Adjusted after lender review.",
      timingDay: 28,
    });
  });
});

describe("toTimelineRows", () => {
  test("maps closed proposals to approved-style timeline rows for reused builder tables", () => {
    expect(
      toTimelineRows([
        {
          column: "closed",
          proposalId: "proposal-1",
          title: "Closed build",
          totalBudgetCents: 1_000_000,
          updatedAt: 123,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        planId: "proposal-1",
        status: "approved",
        totalBudgetCents: 1_000_000,
      }),
    ]);
  });
});
