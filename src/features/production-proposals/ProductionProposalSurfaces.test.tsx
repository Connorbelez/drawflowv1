// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ProductionProposalDraftEditorSurface,
  ProductionProposalKanbanSurface,
  ProductionProposalPackageSurface,
  ProductionProposalReviewSurface,
  ProductionProposalSettingsSurface,
  toTimelineRows,
} from "./ProductionProposalSurfaces";

afterEach(() => cleanup());

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
});

describe("ProductionProposalSettingsSurface", () => {
  test("renders production template, archetype, scenario, and workflow counts", () => {
    render(
      <ProductionProposalSettingsSurface
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
  });
});

describe("ProductionProposalReviewSurface", () => {
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

    expect(screen.getByText("Approved proposal")).toBeTruthy();
    expect(screen.getByText("No active build created yet.")).toBeTruthy();
    expect(screen.getByLabelText("Build start date").getAttribute("type")).toBe(
      "date",
    );
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

    expect(screen.getByText("Save draw row").hasAttribute("disabled")).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText("Reason"), {
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
